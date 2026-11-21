import asyncio
import csv
import io
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from statistics import mean

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import Response
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
load_dotenv(Path(__file__).resolve().parent / ".env")
from alert_sources import IMD_LEVELS, load_imd_district_warnings
from history_store import (
    connect_history_db,
    fetch_daily_records,
    fetch_warning_history,
    upsert_daily_records,
    upsert_warning_snapshots,
)
from weather_model import train_weather_forecast

app = FastAPI()

BOUNDARY_PATH = Path(__file__).parent / "data" / "tamil-nadu-districts.geojson"
with BOUNDARY_PATH.open(encoding="utf-8") as boundary_file:
    DISTRICT_BOUNDARIES = json.load(boundary_file)

DISTRICTS = {
    feature["properties"]["districtName"]: (
        feature["properties"]["weatherPoint"][1],
        feature["properties"]["weatherPoint"][0],
    )
    for feature in DISTRICT_BOUNDARIES["features"]
}
DISTRICT_ALIASES = {"coimbatore": ("cbe", "kovai")}

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")


def weather_label(code: int | float = 0) -> str:
    if code == 0:
        return "clear sky"
    if code in (1, 2):
        return "partly cloudy"
    if code == 3:
        return "overcast"
    if code in (45, 48):
        return "foggy"
    if code in (51, 53, 55, 56, 57):
        return "drizzly"
    if code in (61, 63, 65, 66, 67, 80, 81, 82):
        return "rainy"
    if code in (71, 73, 75, 77, 85, 86):
        return "snowy"
    if code in (95, 96, 99):
        return "stormy"
    return "variable conditions"


def get_weather_for_district(district: str):
    district_name = next(
        (name for name in DISTRICTS if name.casefold() == district.strip().casefold()),
        None,
    )
    if district_name is None:
        raise HTTPException(status_code=404, detail="Tamil Nadu district not found")

    latitude, longitude = DISTRICTS[district_name]
    url = "https://api.open-meteo.com/v1/forecast"

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,apparent_temperature,wind_direction_10m,surface_pressure,cloud_cover,weather_code",
        "hourly": "temperature_2m,precipitation_probability,precipitation,weather_code",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset",
        "forecast_days": 7,
        "timezone": "Asia/Kolkata",
    }

    response = requests.get(url, params=params, timeout=15)
    response.raise_for_status()
    data = response.json()

    current = data["current"]
    return {
        "location": district_name,
        "latitude": latitude,
        "longitude": longitude,
        "temperature": current["temperature_2m"],
        "feels_like": current["apparent_temperature"],
        "humidity": current["relative_humidity_2m"],
        "rainfall": current["precipitation"],
        "wind_speed": current["wind_speed_10m"],
        "wind_direction": current["wind_direction_10m"],
        "pressure": current["surface_pressure"],
        "cloud_cover": current["cloud_cover"],
        "weather_code": current["weather_code"],
        "observed_at": current["time"],
        "hourly": data["hourly"],
        "daily": data["daily"],
        "sunrise": data["daily"]["sunrise"][0],
        "sunset": data["daily"]["sunset"][0],
        "source": "Open-Meteo",
    }


def build_assistant_reply(question: str, district: str, weather: dict) -> str:
    q = question.strip().lower()
    temp = round(float(weather["temperature"]))
    humidity = round(float(weather["humidity"]))
    rain = float(weather["rainfall"])
    wind_speed = round(float(weather["wind_speed"]))
    condition = weather_label(weather["weather_code"])

    if "rain" in q or "umbrella" in q or "wet" in q:
        if rain > 0:
            return (
                f"In {district}, it is currently {condition} with a temperature of {temp}°C. "
                f"There is {rain} mm of precipitation right now, so rain is active. "
                f"Humidity is {humidity}% and wind is {wind_speed} km/h."
            )
        return (
            f"In {district}, conditions are currently {condition}, but rainfall is minimal right now. "
            f"The temperature is {temp}°C with {humidity}% humidity and a mild wind of {wind_speed} km/h."
        )

    if "compare" in q and "tomorrow" in q:
        return (
            f"{district} is currently {temp}°C with {humidity}% humidity and {rain} mm rainfall. "
            f"Conditions are {condition}, so today is best thought of as a {condition} day rather than a sharply different forecast."
        )

    if "tomorrow" in q or "week" in q or "forecast" in q:
        next_day = weather["daily"]
        max_temp = round(float(next_day["temperature_2m_max"][1]))
        min_temp = round(float(next_day["temperature_2m_min"][1]))
        forecast_rain = float(next_day["precipitation_sum"][1])
        return (
            f"For {district}, the next-day outlook is trending around {min_temp}°C to {max_temp}°C. "
            f"Rainfall is forecast at {forecast_rain} mm, and the broader pattern is {condition}."
        )

    if "humidity" in q:
        return (
            f"The current relative humidity in {district} is {humidity}%. "
            f"With a temperature of {temp}°C and {rain} mm rainfall, it feels humid and the air is fairly moist."
        )

    if "wind" in q or "breeze" in q:
        return (
            f"Right now in {district}, the wind speed is {wind_speed} km/h. "
            f"Conditions are {condition} with a temperature of {temp}°C."
        )

    return (
        f"In {district}, the current weather is {condition} with a temperature of {temp}°C. "
        f"Humidity is {humidity}%, rainfall is {rain} mm, and wind speed is {wind_speed} km/h. "
        f"This is based on live weather data from Open-Meteo."
    )


@app.get("/")
def home():
    return {
        "message": "Welcome to WeatherGPT"
    }


@app.get("/weather")
def get_weather(district: str = Query(default="Coimbatore")):
    return get_weather_for_district(district)


def normalize_history_range(start_date: date | None, end_date: date | None):
    latest_available = date.today() - timedelta(days=5)
    end = end_date or latest_available
    start = start_date or date(end.year - 5, 1, 1)
    if start > end:
        raise HTTPException(status_code=400, detail="start_date must be on or before end_date")
    if end > latest_available:
        raise HTTPException(
            status_code=400,
            detail=f"ERA5 archive data is currently available through {latest_available.isoformat()}.",
        )
    if (end - start).days > 3653:
        raise HTTPException(status_code=400, detail="History requests are limited to 10 years at a time")
    return start, end


def normalize_district_name(district: str):
    return next(
        (name for name in DISTRICTS if name.casefold() == district.strip().casefold()),
        None,
    )


def fetch_history_archive(district_name: str, start: date, end: date):
    latitude, longitude = DISTRICTS[district_name]
    retry = Retry(
        total=3,
        connect=3,
        read=2,
        status=3,
        backoff_factor=0.5,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        respect_retry_after_header=True,
    )
    with requests.Session() as session:
        session.mount("https://", HTTPAdapter(max_retries=retry))
        response = session.get(
            "https://archive-api.open-meteo.com/v1/archive",
            params={
                "latitude": latitude,
                "longitude": longitude,
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "daily": "temperature_2m_mean,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,precipitation_sum,weather_code",
                "timezone": "Asia/Kolkata",
                "models": "era5",
            },
            timeout=45,
        )
    response.raise_for_status()
    return district_name, response.json()


@app.post("/history/sync")
async def sync_historical_weather(request: Request):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Request body must be valid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Request body must be a JSON object")

    district_value = str(payload.get("district") or "Coimbatore").strip()
    if district_value.casefold() == "all":
        selected_districts = list(DISTRICTS)
    else:
        normalized_district = normalize_district_name(district_value)
        if not normalized_district:
            raise HTTPException(status_code=404, detail="Tamil Nadu district not found")
        selected_districts = [normalized_district]

    try:
        start, end = normalize_history_range(
            date.fromisoformat(payload["start_date"]) if payload.get("start_date") else None,
            date.fromisoformat(payload["end_date"]) if payload.get("end_date") else None,
        )
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Dates must use YYYY-MM-DD format")

    connection = connect_history_db()
    rows_upserted = 0
    try:
        def fetch_all_archives():
            with ThreadPoolExecutor(max_workers=min(6, len(selected_districts))) as executor:
                return list(executor.map(
                    lambda name: fetch_history_archive(name, start, end),
                    selected_districts,
                ))

        archives = await asyncio.to_thread(fetch_all_archives)
        for district_name, archive in archives:
            latitude, longitude = DISTRICTS[district_name]
            daily = archive.get("daily")
            if not daily or not daily.get("time"):
                continue
            rows_upserted += upsert_daily_records(
                connection, district_name, latitude, longitude, daily, "ERA5"
            )
            connection.commit()
    except requests.RequestException as error:
        connection.rollback()
        detail = str(error).splitlines()[0][:240]
        raise HTTPException(
            status_code=502,
            detail=f"Open-Meteo historical fetch failed after retries: {detail}",
        ) from error
    finally:
        connection.close()

    return {
        "districts": selected_districts,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "rows_upserted": rows_upserted,
        "source": "Open-Meteo Historical Weather API · ERA5 reanalysis",
    }


@app.get("/history")
def get_historical_weather(
    district: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
):
    start, end = normalize_history_range(start_date, end_date)
    normalized_district = normalize_district_name(district) if district else None
    if district and not normalized_district:
        raise HTTPException(status_code=404, detail="Tamil Nadu district not found")

    connection = connect_history_db()
    try:
        records = fetch_daily_records(connection, normalized_district, start, end)
    finally:
        connection.close()
    return {
        "district": normalized_district,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "count": len(records),
        "records": records,
        "source": "Open-Meteo Historical Weather API · ERA5 reanalysis",
    }


@app.get("/history/comparison")
def compare_historical_districts(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
):
    start, end = normalize_history_range(start_date, end_date)
    connection = connect_history_db()
    try:
        comparison = connection.execute(
            """
            SELECT district, COUNT(*) AS days,
                   AVG(temperature_mean) AS temperature_mean,
                   AVG(relative_humidity_mean) AS humidity_mean,
                   SUM(precipitation_sum) AS rainfall_total
            FROM historical_daily_weather
            WHERE observed_on BETWEEN %s AND %s
            GROUP BY district
            ORDER BY rainfall_total DESC NULLS LAST
            """,
            (start, end),
        ).fetchall()
    finally:
        connection.close()
    return {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "districts": [
            {
                **row,
                "temperature_mean": round(row["temperature_mean"], 1) if row["temperature_mean"] is not None else None,
                "humidity_mean": round(row["humidity_mean"], 1) if row["humidity_mean"] is not None else None,
                "rainfall_total": round(row["rainfall_total"], 1) if row["rainfall_total"] is not None else None,
            }
            for row in comparison
        ],
    }


@app.get("/history/training-data.csv")
def export_history_training_data(
    district: str = Query(default="Coimbatore"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
):
    start, end = normalize_history_range(start_date, end_date)
    normalized_district = normalize_district_name(district)
    if not normalized_district:
        raise HTTPException(status_code=404, detail="Tamil Nadu district not found")

    connection = connect_history_db()
    try:
        records = fetch_daily_records(connection, normalized_district, start, end + timedelta(days=1))
    finally:
        connection.close()
    by_date = {date.fromisoformat(row["observed_on"]): row for row in records}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "district", "date", "temperature_mean_c", "temperature_max_c", "temperature_min_c",
        "humidity_mean_pct", "precipitation_mm", "weather_code",
        "target_next_day_temperature_mean_c", "target_next_day_precipitation_mm",
    ])
    for current_date in sorted(by_date):
        if current_date < start or current_date >= end:
            continue
        current = by_date[current_date]
        target = by_date.get(current_date + timedelta(days=1))
        if not target:
            continue
        writer.writerow([
            current["district"], current_date.isoformat(), current["temperature_mean"],
            current["temperature_max"], current["temperature_min"],
            current["relative_humidity_mean"], current["precipitation_sum"],
            current["weather_code"], target["temperature_mean"], target["precipitation_sum"],
        ])
    filename = f"{normalized_district.casefold()}-weather-training-data.csv"
    return Response(
        output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.get("/history/forecast-accuracy")
def get_forecast_accuracy(district: str = Query(default="Coimbatore")):
    normalized_district = normalize_district_name(district)
    if not normalized_district:
        raise HTTPException(status_code=404, detail="Tamil Nadu district not found")
    latitude, longitude = DISTRICTS[normalized_district]
    today = date.today()
    comparison_end = today - timedelta(days=5)
    comparison_start = comparison_end - timedelta(days=6)

    forecast_response = requests.get(
        "https://previous-runs-api.open-meteo.com/v1/forecast",
        params={
            "latitude": latitude,
            "longitude": longitude,
            "hourly": "temperature_2m_previous_day1,precipitation_previous_day1",
            "past_days": 7,
            "forecast_days": 1,
            "timezone": "Asia/Kolkata",
        },
        timeout=30,
    )
    if not forecast_response.ok:
        raise HTTPException(status_code=502, detail="Open-Meteo previous-run data request failed")
    forecast_hours = forecast_response.json().get("hourly", {})

    actual_response = requests.get(
        "https://archive-api.open-meteo.com/v1/archive",
        params={
            "latitude": latitude,
            "longitude": longitude,
            "start_date": comparison_start.isoformat(),
            "end_date": comparison_end.isoformat(),
            "hourly": "temperature_2m,precipitation",
            "timezone": "Asia/Kolkata",
            "models": "era5",
        },
        timeout=30,
    )
    if not actual_response.ok:
        raise HTTPException(status_code=502, detail="Open-Meteo historical observations request failed")
    actual_hours = actual_response.json().get("hourly", {})

    forecast_by_day = {}
    for index, timestamp in enumerate(forecast_hours.get("time", [])):
        valid_date = date.fromisoformat(timestamp[:10])
        if not comparison_start <= valid_date <= comparison_end:
            continue
        day = forecast_by_day.setdefault(valid_date.isoformat(), {"temperature": [], "rainfall": []})
        temperature = forecast_hours.get("temperature_2m_previous_day1", [])[index]
        rainfall = forecast_hours.get("precipitation_previous_day1", [])[index]
        if temperature is not None:
            day["temperature"].append(temperature)
        if rainfall is not None:
            day["rainfall"].append(rainfall)

    actual_by_day = {}
    for index, timestamp in enumerate(actual_hours.get("time", [])):
        valid_date = date.fromisoformat(timestamp[:10])
        day = actual_by_day.setdefault(valid_date.isoformat(), {"temperature": [], "rainfall": []})
        temperature = actual_hours.get("temperature_2m", [])[index]
        rainfall = actual_hours.get("precipitation", [])[index]
        if temperature is not None:
            day["temperature"].append(temperature)
        if rainfall is not None:
            day["rainfall"].append(rainfall)

    daily_errors = []
    for valid_date, forecast in forecast_by_day.items():
        actual = actual_by_day.get(valid_date)
        if not actual or not forecast["temperature"] or not actual["temperature"]:
            continue
        predicted_temperature = mean(forecast["temperature"])
        observed_temperature = mean(actual["temperature"])
        predicted_rainfall = sum(forecast["rainfall"])
        observed_rainfall = sum(actual["rainfall"])
        daily_errors.append({
            "date": valid_date,
            "predicted_temperature_mean": round(predicted_temperature, 1),
            "observed_temperature_mean": round(observed_temperature, 1),
            "temperature_error": round(predicted_temperature - observed_temperature, 1),
            "predicted_rainfall": round(predicted_rainfall, 1),
            "observed_rainfall": round(observed_rainfall, 1),
            "rainfall_error": round(predicted_rainfall - observed_rainfall, 1),
        })

    return {
        "district": normalized_district,
        "lead_days": 1,
        "sample_days": len(daily_errors),
        "temperature_mae_c": round(mean([abs(row["temperature_error"]) for row in daily_errors]), 2) if daily_errors else None,
        "rainfall_mae_mm": round(mean([abs(row["rainfall_error"]) for row in daily_errors]), 2) if daily_errors else None,
        "days": daily_errors,
        "forecast_source": "Open-Meteo Previous Runs API",
        "actual_source": "Open-Meteo ERA5 reanalysis",
    }


@app.get("/history/ml-forecast")
def get_ml_forecast(district: str = Query(default="Coimbatore")):
    normalized_district = normalize_district_name(district)
    if not normalized_district:
        raise HTTPException(status_code=404, detail="Tamil Nadu district not found")

    connection = connect_history_db()
    try:
        records = fetch_daily_records(
            connection,
            normalized_district,
            date(1940, 1, 1),
            date.today() - timedelta(days=5),
        )
    finally:
        connection.close()

    result = train_weather_forecast(records, date.today() + timedelta(days=1))
    if "error" in result:
        raise HTTPException(status_code=422, detail=result["error"])
    return {"district": normalized_district, **result}


@app.get("/alerts/official")
def get_official_alerts(day: int = Query(default=1, ge=1, le=5)):
    try:
        district_statuses, snapshots = load_imd_district_warnings(list(DISTRICTS), day)
    except requests.RequestException as error:
        raise HTTPException(status_code=502, detail="Could not reach the official IMD district warning service") from error

    history_persisted = False
    try:
        connection = connect_history_db()
        try:
            upsert_warning_snapshots(connection, snapshots)
            connection.commit()
            history_persisted = True
        finally:
            connection.close()
    except HTTPException:
        pass

    alerts = [
        {
            **alert,
            "id": f"{alert['district']}:{alert['valid_date']}:{alert['title']}",
            "issued_at": None,
            "issue_time_note": "IMD district warning layer does not publish a separate issue time; source update time is shown.",
            "status": "Active" if date.fromisoformat(alert["valid_date"]) >= date.today() else "Expired",
        }
        for district_status in district_statuses
        for alert in district_status["alerts"]
    ]
    available_districts = [item for item in district_statuses if item["available"]]
    affected_districts = sorted({item["district"] for item in alerts})
    latest_updated_at = max(
        (item["updated_at"] for item in available_districts if item["updated_at"]),
        default=None,
    )
    return {
        "day": day,
        "issued_time_available": False,
        "last_updated_at": latest_updated_at,
        "available_districts": len(available_districts),
        "unavailable_districts": [item["district"] for item in district_statuses if not item["available"]],
        "active_count": sum(1 for alert in alerts if alert["status"] == "Active"),
        "affected_districts": affected_districts,
        "rainfall_alerts": sum(1 for alert in alerts if "rain" in alert["title"].casefold()),
        "wind_alerts": sum(1 for alert in alerts if "wind" in alert["title"].casefold()),
        "legend": IMD_LEVELS,
        "districts": district_statuses,
        "alerts": alerts,
        "history_persisted": history_persisted,
        "source": "India Meteorological Department · Districtwise Warnings WFS",
        "source_url": "https://mausam.imd.gov.in/responsive/districtWiseWarningGIS.php",
    }


@app.get("/alerts/history")
def get_alert_history(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    district: str | None = Query(default=None),
):
    today = date.today()
    start = start_date or today - timedelta(days=30)
    end = end_date or today + timedelta(days=5)
    if start > end:
        raise HTTPException(status_code=400, detail="start_date must be on or before end_date")
    normalized_district = normalize_district_name(district) if district else None
    if district and not normalized_district:
        raise HTTPException(status_code=404, detail="Tamil Nadu district not found")

    connection = connect_history_db()
    try:
        alerts = fetch_warning_history(connection, start, end)
    finally:
        connection.close()
    if normalized_district:
        alerts = [item for item in alerts if item["district"] == normalized_district]
    return {"count": len(alerts), "alerts": alerts, "source": "IMD district warning snapshots"}


def build_weather_risk_indicators(forecast_data):
    risks = []
    district_levels = {}
    issued_at = datetime.now(timezone.utc).isoformat()
    for location_index, district_name in enumerate(DISTRICTS):
        daily = forecast_data[location_index].get("daily", {})
        district_risks = []
        for index, valid_date in enumerate(daily.get("time", [])):
            precipitation = daily.get("precipitation_sum", [None] * len(daily["time"]))[index]
            precipitation_probability = daily.get("precipitation_probability_max", [None] * len(daily["time"]))[index]
            wind_gust = daily.get("wind_gusts_10m_max", [None] * len(daily["time"]))[index]
            maximum_temperature = daily.get("temperature_2m_max", [None] * len(daily["time"]))[index]
            weather_code = daily.get("weather_code", [None] * len(daily["time"]))[index]

            candidates = []
            if precipitation is not None and precipitation_probability is not None:
                if precipitation >= 100 and precipitation_probability >= 80:
                    candidates.append(("Heavy rainfall risk", "Severe", "Very heavy forecast rainfall and high precipitation probability. This is not a flood warning."))
                elif precipitation >= 50 and precipitation_probability >= 70:
                    candidates.append(("Heavy rainfall risk", "High", "High forecast rainfall and precipitation probability. This is not an official rainfall warning."))
                elif precipitation >= 20 and precipitation_probability >= 60:
                    candidates.append(("Heavy rainfall risk", "Moderate", "Elevated forecast rainfall probability and amount."))
                elif precipitation >= 5 and precipitation_probability >= 40:
                    candidates.append(("Rainfall risk", "Low", "Some rainfall is forecast; check updates before travel."))
            if weather_code in (95, 96, 99):
                candidates.append(("Thunderstorm risk", "High" if weather_code == 95 else "Severe", "The forecast includes a thunderstorm weather code. This is not an IMD alert."))
            if wind_gust is not None:
                if wind_gust >= 70:
                    candidates.append(("Strong wind risk", "Severe", "Very strong forecast wind gusts; secure loose outdoor items."))
                elif wind_gust >= 60:
                    candidates.append(("Strong wind risk", "High", "High forecast wind gusts; avoid exposed areas."))
                elif wind_gust >= 50:
                    candidates.append(("Strong wind risk", "Moderate", "Elevated forecast wind gusts."))
                elif wind_gust >= 40:
                    candidates.append(("Strong wind risk", "Low", "Breezy conditions are forecast."))
            if maximum_temperature is not None:
                if maximum_temperature >= 42:
                    candidates.append(("High-temperature risk", "High", "Very high forecast maximum temperature. This is not an IMD heat-wave classification."))
                elif maximum_temperature >= 40:
                    candidates.append(("High-temperature risk", "Moderate", "High forecast maximum temperature. This is not an IMD heat-wave classification."))
            if weather_code in (45, 48):
                candidates.append(("Fog / visibility risk", "Moderate", "The forecast includes fog; allow extra travel time and use caution."))

            for title, severity, description in candidates:
                risk = {
                    "id": f"risk:{district_name}:{valid_date}:{title}",
                    "title": title,
                    "category": title.split(" risk")[0],
                    "severity": severity,
                    "district": district_name,
                    "issued_at": issued_at,
                    "valid_date": valid_date,
                    "description": description,
                    "recommended_action": "This is an automated forecast indicator, not an official warning. Check IMD and follow local authority instructions.",
                    "status": "Active" if valid_date >= date.today().isoformat() else "Expired",
                    "source": "Open-Meteo Forecast API · WeatherGPT heuristic",
                    "source_url": "https://open-meteo.com/en/docs",
                    "official": False,
                    "precipitation_mm": precipitation,
                    "precipitation_probability_pct": precipitation_probability,
                    "wind_gust_kmh": wind_gust,
                    "maximum_temperature_c": maximum_temperature,
                }
                risks.append(risk)
                current_rank = {"Low": 1, "Moderate": 2, "High": 3, "Severe": 4}[severity]
                previous = district_levels.get(district_name)
                if previous is None or current_rank > previous["rank"]:
                    district_levels[district_name] = {
                        "rank": current_rank,
                        "severity": severity,
                        "color": {"Low": "#078C03", "Moderate": "#F2E205", "High": "#F28705", "Severe": "#F20505"}[severity],
                        "label": f"WeatherGPT risk · {severity}",
                    }
    return risks, district_levels, issued_at


@app.get("/alerts/weather-risk")
def get_weather_risk_indicators():
    latitude = ",".join(str(value[0]) for value in DISTRICTS.values())
    longitude = ",".join(str(value[1]) for value in DISTRICTS.values())
    response = requests.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": latitude,
            "longitude": longitude,
            "daily": "precipitation_probability_max,precipitation_sum,wind_gusts_10m_max,temperature_2m_max,weather_code",
            "timezone": "Asia/Kolkata",
            "forecast_days": 5,
        },
        timeout=45,
    )
    if not response.ok:
        raise HTTPException(status_code=502, detail="Could not reach Open-Meteo forecast service")
    risks, district_levels, issued_at = build_weather_risk_indicators(response.json())
    return {
        "risks": risks,
        "district_levels": district_levels,
        "risk_count": len(risks),
        "updated_at": issued_at,
        "source": "Open-Meteo Forecast API · WeatherGPT heuristic; not official warnings",
        "source_url": "https://open-meteo.com/en/docs",
        "method_note": "Rain, wind, heat, thunderstorm, and fog indicators use simple thresholds on forecast variables. Cyclone and flood warnings are not inferred from these data.",
    }


@app.post("/assistant/chat")
async def chat_with_weather(request: Request):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Request body must be valid JSON")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Request body must be a JSON object")

    question = (payload.get("question") or "").strip()
    selected_district = (payload.get("district") or "Coimbatore").strip() or "Coimbatore"

    if not question:
        raise HTTPException(status_code=400, detail="Question is required")

    mentioned_district = next(
        (
            name for name in DISTRICTS
            if any(
                re.search(rf"(?<!\w){re.escape(term)}(?!\w)", question, re.IGNORECASE)
                for term in (name, *DISTRICT_ALIASES.get(name.casefold(), ()))
            )
        ),
        None,
    )
    district = mentioned_district or selected_district
    response_language = "Tamil" if any("\u0b80" <= char <= "\u0bff" for char in question) else "English"
    weather = get_weather_for_district(district)
    daily = weather["daily"]
    tomorrow_forecast = {
        "date": daily["time"][1],
        "weather": weather_label(daily["weather_code"][1]),
        "temperature_min_c": daily["temperature_2m_min"][1],
        "temperature_max_c": daily["temperature_2m_max"][1],
        "precipitation_mm": daily["precipitation_sum"][1],
    }
    weather_context = {
        key: weather[key]
        for key in ("location", "temperature", "humidity", "rainfall", "wind_speed", "weather_code", "observed_at", "source")
    }
    weather_context["tomorrow_forecast"] = tomorrow_forecast

    if OPENAI_API_KEY:
        try:
            openai_payload = {
                "model": OPENAI_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": f"You answer Tamil Nadu weather questions using the provided live weather data. Reply only in {response_language}. Keep answers brief, factual, and grounded in the data. Use only the provided data; do not claim the data is unavailable. For future-weather questions, use the provided forecast, not current conditions."
                    },
                    {
                        "role": "user",
                        "content": f"Question: {question}\n\nWeather data:\n{json.dumps(weather_context, ensure_ascii=False)}"
                    }
                ],
                "temperature": 0.3,
            }
            openai_response = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=openai_payload,
                timeout=30,
            )
            if openai_response.ok:
                answer = openai_response.json()["choices"][0]["message"]["content"].strip()
                if answer:
                    return {"answer": answer, "source": "OpenAI", "district": weather["location"]}
        except Exception:
            pass

    if OLLAMA_BASE_URL:
        try:
            ollama_payload = {
                "model": OLLAMA_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": f"You are a concise, factual Tamil Nadu weather assistant. Reply only in {response_language}. Use only the supplied weather data; do not claim it is unavailable. For future-weather questions, use the forecast rather than current conditions.",
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Question: {question}\n\n"
                            f"Weather data for {weather['location']}: "
                            f"{json.dumps(weather_context, ensure_ascii=False)}"
                        )
                    }
                ],
                "stream": False,
            }
            ollama_response = requests.post(
                f"{OLLAMA_BASE_URL.rstrip('/')}/api/chat",
                json=ollama_payload,
                timeout=60,
            )
            if ollama_response.ok:
                response_json = ollama_response.json()
                answer = response_json.get("message", {}).get("content", "")
                if answer:
                    return {"answer": answer.strip(), "source": "Ollama", "district": weather["location"]}
        except Exception:
            pass

    return {
        "answer": build_assistant_reply(question, weather["location"], weather),
        "source": "Weather data + local logic",
        "district": weather["location"],
    }


@app.get("/weather/comparison")
def get_weather_comparison(districts: str | None = Query(default=None)):
    requested_names = None
    if districts:
        requested_names = {name.strip().casefold() for name in districts.split(",") if name.strip()}
        unknown_names = requested_names - {name.casefold() for name in DISTRICTS}
        if unknown_names:
            raise HTTPException(status_code=404, detail="One or more Tamil Nadu districts were not found")

    locations = [
        (name, latitude, longitude)
        for name, (latitude, longitude) in DISTRICTS.items()
        if requested_names is None or name.casefold() in requested_names
    ]
    params = {
        "latitude": ",".join(str(latitude) for _, latitude, _ in locations),
        "longitude": ",".join(str(longitude) for _, _, longitude in locations),
        "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,weather_code",
        "timezone": "Asia/Kolkata",
    }
    response = requests.get("https://api.open-meteo.com/v1/forecast", params=params, timeout=30)
    response.raise_for_status()
    weather_data = response.json()
    if not isinstance(weather_data, list) or len(weather_data) != len(locations):
        raise HTTPException(status_code=502, detail="Weather provider returned an unexpected comparison response")

    comparisons = []
    for (name, latitude, longitude), location_data in zip(locations, weather_data):
        current = location_data["current"]
        comparisons.append({
            "district": name,
            "latitude": latitude,
            "longitude": longitude,
            "temperature": current["temperature_2m"],
            "humidity": current["relative_humidity_2m"],
            "rainfall": current["precipitation"],
            "wind_speed": current["wind_speed_10m"],
            "wind_direction": current["wind_direction_10m"],
            "weather_code": current["weather_code"],
            "observed_at": current["time"],
        })

    return {"source": "Open-Meteo", "districts": comparisons}


@app.get("/districts")
def get_districts():
    return {
        "districts": [
            {"name": name, "latitude": latitude, "longitude": longitude}
            for name, (latitude, longitude) in DISTRICTS.items()
        ]
    }


@app.get("/boundaries")
def get_boundaries():
    return DISTRICT_BOUNDARIES