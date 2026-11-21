from datetime import date, datetime, timedelta, timezone

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


IMD_WARNING_URL = "https://mausam.imd.gov.in/responsive/districtWiseWarningGIS.php"
IMD_WFS_URL = "https://reactjs.imd.gov.in/geoserver/ows"
IMD_DISTRICT_WFS = "https://reactjs.imd.gov.in/geoserver/imd/wms"
IMD_DISTRICT_ALIASES = {
    "Kallakurichi": "KALLAKKURICHI",
    "Kanniyakumari": "KANYAKUMARI",
    "Ranipet": "RANIPPETTAI",
    "Sivaganga": "SIVAGANGAI",
    "Tirupathur": "TIRUPPATTAR",
}
IMD_WARNING_TYPES = {
    2: ("Heavy Rain", "Avoid flooded roads and low-lying areas; follow local authority instructions."),
    3: ("Heavy Snow", "Avoid exposed roads and follow official local instructions."),
    4: ("Thunderstorms and Lightning", "Move indoors; avoid open fields, isolated trees, and exposed structures."),
    5: ("Hailstorm", "Move indoors and keep away from windows until the hail passes."),
    6: ("Dust Storm", "Stay indoors, close windows, and limit travel while visibility is poor."),
    7: ("Dust-Raising Winds", "Avoid exposed areas and secure loose outdoor items."),
    8: ("Strong Surface Winds", "Secure loose objects and avoid damaged trees or structures."),
    9: ("Heat Wave", "Drink water, reduce prolonged outdoor activity, and check on vulnerable people."),
    10: ("Hot Day", "Limit strenuous outdoor activity during the hottest hours and drink water."),
    11: ("Warm Night", "Keep living spaces cool and check on vulnerable people."),
    12: ("Cold Wave", "Stay warm and check on older adults, children, and people with health conditions."),
    13: ("Cold Day", "Wear warm layers and limit prolonged exposure to cold."),
    14: ("Ground Frost", "Protect frost-sensitive plants and follow local agricultural advice."),
    15: ("Fog", "Drive slowly, use appropriate lights, and increase following distance."),
    16: ("Very Heavy Rain", "Avoid flooded roads and low-lying areas; follow official local instructions."),
    17: ("Extremely Heavy Rain", "Avoid travel through flooded areas and follow official emergency instructions."),
}
IMD_LEVELS = {
    0: {"label": "Data unavailable", "severity": None, "color": "#9aa7ad"},
    1: {"label": "Warning", "severity": "Severe", "color": "#F20505"},
    2: {"label": "Alert", "severity": "High", "color": "#F28705"},
    3: {"label": "Watch", "severity": "Moderate", "color": "#F2E205"},
    4: {"label": "No Warning", "severity": None, "color": "#078C03"},
}


def load_imd_district_warnings(district_names, day):
    retry = Retry(
        total=2,
        connect=2,
        read=2,
        status=2,
        backoff_factor=0.4,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        respect_retry_after_header=True,
    )
    with requests.Session() as session:
        session.mount("https://", HTTPAdapter(max_retries=retry))
        response = session.get(
            IMD_WFS_URL,
            params={
                "service": "WFS",
                "version": "1.1.0",
                "request": "GetFeature",
                "typename": "imd:district_warnings_india",
                "srsname": "EPSG:4326",
                "outputFormat": "application/json",
            },
            timeout=45,
        )
        response.raise_for_status()
        feed = response.json()

    properties_by_district = {
        feature.get("properties", {}).get("District", "").strip().casefold(): feature.get("properties", {})
        for feature in feed.get("features", [])
        if feature.get("properties", {}).get("District", "").strip()
    }
    records = []
    snapshots = []
    for district in district_names:
        source_name = IMD_DISTRICT_ALIASES.get(district, district).casefold()
        properties = properties_by_district.get(source_name)
        if properties is None:
            records.append({
                "district": district,
                "available": False,
                "official_status": "Data unavailable",
                "severity": None,
                "color": IMD_LEVELS[0]["color"],
                "valid_date": None,
                "updated_at": None,
                "warning_types": [],
                "alerts": [],
            })
            continue

        source_day = date.fromisoformat(properties["Date"])
        valid_date = source_day + timedelta(days=day - 1)
        updated_at = datetime.fromisoformat(properties["updated_at"].replace("Z", "+00:00"))
        color_code = int(properties.get(f"Day{day}_Color") or 0)
        level = IMD_LEVELS.get(color_code, IMD_LEVELS[0])
        codes = []
        for value in (properties.get(f"Day_{day}") or "").split(","):
            if value.strip().isdigit() and int(value) > 1:
                codes.append(int(value))

        warning_types = []
        alerts = []
        for code in codes:
            title, action = IMD_WARNING_TYPES.get(code, (f"IMD weather code {code}", "Follow official local instructions."))
            warning_types.append(title)
            alerts.append({
                "title": title,
                "severity": level["severity"],
                "official_status": level["label"],
                "description": properties.get(f"Day{day}_text") or f"IMD lists {title.lower()} for {district} on {valid_date.isoformat()}.",
                "recommended_action": action,
                "district": district,
                "valid_date": valid_date.isoformat(),
                "updated_at": updated_at.isoformat(),
                "source": "India Meteorological Department · Districtwise Warnings",
                "source_url": IMD_WARNING_URL,
                "color": level["color"],
            })

        record = {
            "district": district,
            "available": True,
            "official_status": level["label"],
            "severity": level["severity"],
            "color": level["color"],
            "color_code": color_code,
            "valid_date": valid_date.isoformat(),
            "updated_at": updated_at.isoformat(),
            "warning_codes": codes,
            "warning_types": warning_types,
            "description": properties.get(f"Day{day}_text") or "",
            "alerts": alerts,
        }
        records.append(record)

        for forecast_day in range(1, 6):
            day_color_code = int(properties.get(f"Day{forecast_day}_Color") or 0)
            day_level = IMD_LEVELS.get(day_color_code, IMD_LEVELS[0])
            day_codes = [
                int(value.strip())
                for value in (properties.get(f"Day_{forecast_day}") or "").split(",")
                if value.strip().isdigit() and int(value) > 1
            ]
            day_titles = [IMD_WARNING_TYPES.get(code, (f"IMD weather code {code}", ""))[0] for code in day_codes]
            snapshots.append({
                "district": district,
                "valid_date": (source_day + timedelta(days=forecast_day - 1)).isoformat(),
                "source_updated_at": updated_at,
                "official_status": day_level["label"],
                "severity": day_level["severity"],
                "color_code": day_color_code,
                "warning_codes": ",".join(str(code) for code in day_codes),
                "warning_titles": "\n".join(day_titles),
                "description": properties.get(f"Day{forecast_day}_text") or "",
                "source_url": IMD_WARNING_URL,
            })

    return records, snapshots