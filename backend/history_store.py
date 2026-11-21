import os

import psycopg
from fastapi import HTTPException
from psycopg.rows import dict_row


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://weathergpt:weathergpt_dev@localhost:5432/weathergpt",
)

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS historical_daily_weather (
    district TEXT NOT NULL,
    observed_on DATE NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    temperature_mean DOUBLE PRECISION,
    temperature_max DOUBLE PRECISION,
    temperature_min DOUBLE PRECISION,
    relative_humidity_mean DOUBLE PRECISION,
    precipitation_sum DOUBLE PRECISION,
    weather_code INTEGER,
    source_model TEXT NOT NULL,
    PRIMARY KEY (district, observed_on)
)
"""

CREATE_ALERT_TABLE = """
CREATE TABLE IF NOT EXISTS official_district_warning_snapshots (
    district TEXT NOT NULL,
    valid_date DATE NOT NULL,
    source_updated_at TIMESTAMPTZ NOT NULL,
    official_status TEXT NOT NULL,
    severity TEXT,
    color_code SMALLINT NOT NULL,
    warning_codes TEXT NOT NULL,
    warning_titles TEXT NOT NULL,
    description TEXT NOT NULL,
    source_url TEXT NOT NULL,
    PRIMARY KEY (district, valid_date, source_updated_at)
)
"""


def connect_history_db():
    try:
        connection = psycopg.connect(DATABASE_URL, connect_timeout=3, row_factory=dict_row)
        connection.execute(CREATE_TABLE)
        connection.execute(CREATE_ALERT_TABLE)
        connection.execute(
            "CREATE INDEX IF NOT EXISTS historical_daily_weather_date_idx "
            "ON historical_daily_weather (observed_on, district)"
        )
        connection.commit()
        return connection
    except Exception as error:
        if "connection" in locals():
            connection.close()
        raise HTTPException(
            status_code=503,
            detail="Historical database unavailable. Start PostgreSQL with `docker compose up -d db`.",
        ) from error


def upsert_daily_records(connection, district, latitude, longitude, daily, source_model):
    records = []
    for index, observed_on in enumerate(daily["time"]):
        records.append(
            (
                district,
                observed_on,
                latitude,
                longitude,
                daily["temperature_2m_mean"][index],
                daily["temperature_2m_max"][index],
                daily["temperature_2m_min"][index],
                daily["relative_humidity_2m_mean"][index],
                daily["precipitation_sum"][index],
                daily["weather_code"][index],
                source_model,
            )
        )

    if not records:
        return 0

    with connection.cursor() as cursor:
        cursor.executemany(
            """
            INSERT INTO historical_daily_weather (
                district, observed_on, latitude, longitude, temperature_mean,
                temperature_max, temperature_min, relative_humidity_mean,
                precipitation_sum, weather_code, source_model
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (district, observed_on) DO UPDATE SET
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                temperature_mean = EXCLUDED.temperature_mean,
                temperature_max = EXCLUDED.temperature_max,
                temperature_min = EXCLUDED.temperature_min,
                relative_humidity_mean = EXCLUDED.relative_humidity_mean,
                precipitation_sum = EXCLUDED.precipitation_sum,
                weather_code = EXCLUDED.weather_code,
                source_model = EXCLUDED.source_model
            """,
            records,
        )
    return len(records)


def fetch_daily_records(connection, district, start_date, end_date):
    if district:
        cursor = connection.execute(
            """
            SELECT district, observed_on, temperature_mean, temperature_max,
                   temperature_min, relative_humidity_mean, precipitation_sum,
                   weather_code, source_model
            FROM historical_daily_weather
            WHERE district = %s AND observed_on BETWEEN %s AND %s
            ORDER BY observed_on
            """,
            (district, start_date, end_date),
        )
    else:
        cursor = connection.execute(
            """
            SELECT district, observed_on, temperature_mean, temperature_max,
                   temperature_min, relative_humidity_mean, precipitation_sum,
                   weather_code, source_model
            FROM historical_daily_weather
            WHERE observed_on BETWEEN %s AND %s
            ORDER BY observed_on, district
            """,
            (start_date, end_date),
        )
    rows = cursor.fetchall()
    return [
        {**row, "observed_on": row["observed_on"].isoformat()}
        for row in rows
    ]


def upsert_warning_snapshots(connection, snapshots):
    if not snapshots:
        return
    with connection.cursor() as cursor:
        cursor.executemany(
            """
            INSERT INTO official_district_warning_snapshots (
                district, valid_date, source_updated_at, official_status, severity,
                color_code, warning_codes, warning_titles, description, source_url
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (district, valid_date, source_updated_at) DO UPDATE SET
                official_status = EXCLUDED.official_status,
                severity = EXCLUDED.severity,
                color_code = EXCLUDED.color_code,
                warning_codes = EXCLUDED.warning_codes,
                warning_titles = EXCLUDED.warning_titles,
                description = EXCLUDED.description,
                source_url = EXCLUDED.source_url
            """,
            [
                (
                    item["district"], item["valid_date"], item["source_updated_at"],
                    item["official_status"], item["severity"], item["color_code"],
                    item["warning_codes"], item["warning_titles"], item["description"],
                    item["source_url"],
                )
                for item in snapshots
            ],
        )


def fetch_warning_history(connection, start_date, end_date):
    cursor = connection.execute(
        """
        WITH snapshots AS (
            SELECT district, valid_date, source_updated_at, official_status, severity,
                   warning_codes, warning_titles, description, source_url,
                   MAX(source_updated_at) OVER (PARTITION BY district, valid_date) AS latest_update
            FROM official_district_warning_snapshots
            WHERE valid_date BETWEEN %s AND %s
        )
        SELECT district, valid_date, source_updated_at, official_status, severity,
               warning_codes, warning_titles, description, source_url,
               CASE
                   WHEN valid_date < CURRENT_DATE THEN 'Expired'
                   WHEN source_updated_at < latest_update THEN 'Updated'
                   ELSE 'Active'
               END AS status
        FROM snapshots
        WHERE warning_codes <> ''
        ORDER BY valid_date DESC, source_updated_at DESC
        LIMIT 500
        """,
        (start_date, end_date),
    )
    return [
        {
            **row,
            "valid_date": row["valid_date"].isoformat(),
            "source_updated_at": row["source_updated_at"].isoformat(),
            "warning_types": row["warning_titles"].splitlines(),
        }
        for row in cursor.fetchall()
    ]