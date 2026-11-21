from datetime import date, timedelta
from math import cos, pi, sin
from statistics import mean

from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error


LAG_DAYS = (0, 1, 2, 6, 13, 29)
LAG_FIELDS = ("temperature_mean", "relative_humidity_mean", "precipitation_sum")
MINIMUM_SAMPLES = 180


def build_features(origin_date, target_date, records_by_date):
    features = []
    for lag in LAG_DAYS:
        record = records_by_date.get(origin_date - timedelta(days=lag))
        if record is None:
            return None
        for field in LAG_FIELDS:
            value = record[field]
            if value is None:
                return None
            features.append(float(value))

    target_day = target_date.timetuple().tm_yday
    features.extend((sin(2 * pi * target_day / 366), cos(2 * pi * target_day / 366)))
    return features


def train_weather_forecast(records, target_date):
    records_by_date = {
        date.fromisoformat(record["observed_on"]): record
        for record in records
    }
    latest_origin = max(
        (
            observed_on
            for observed_on in records_by_date
            if observed_on < target_date
            and build_features(observed_on, target_date, records_by_date) is not None
        ),
        default=None,
    )
    if latest_origin is None:
        return {"error": "No complete recent weather observations are available. Sync this district first."}

    horizon_days = (target_date - latest_origin).days
    if horizon_days > 14:
        return {"error": "The latest complete archive data is too old for a reliable short-range prediction. Sync recent history first."}

    samples = []
    for origin_date in sorted(records_by_date):
        valid_date = origin_date + timedelta(days=horizon_days)
        target = records_by_date.get(valid_date)
        features = build_features(origin_date, valid_date, records_by_date)
        if (
            target is None
            or features is None
            or target["temperature_mean"] is None
            or target["precipitation_sum"] is None
        ):
            continue
        samples.append((
            origin_date,
            features,
            float(target["temperature_mean"]),
            float(target["precipitation_sum"]),
        ))

    if len(samples) < MINIMUM_SAMPLES:
        return {
            "error": f"At least {MINIMUM_SAMPLES} complete {horizon_days}-day training examples are needed; found {len(samples)}. Sync more historical data."
        }

    split_index = int(len(samples) * 0.8)
    training = samples[:split_index]
    validation = samples[split_index:]
    training_features = [sample[1] for sample in training]
    validation_features = [sample[1] for sample in validation]

    def create_model():
        return RandomForestRegressor(
            n_estimators=160,
            min_samples_leaf=3,
            max_features=0.8,
            random_state=42,
            n_jobs=-1,
        )

    temperature_model = create_model()
    rainfall_model = create_model()
    temperature_model.fit(training_features, [sample[2] for sample in training])
    rainfall_model.fit(training_features, [sample[3] for sample in training])

    predicted_temperature = temperature_model.predict(validation_features)
    predicted_rainfall = [max(0, value) for value in rainfall_model.predict(validation_features)]
    actual_temperature = [sample[2] for sample in validation]
    actual_rainfall = [sample[3] for sample in validation]
    temperature_mae = mean_absolute_error(actual_temperature, predicted_temperature)
    rainfall_mae = mean_absolute_error(actual_rainfall, predicted_rainfall)

    baseline_temperature_mae = mean_absolute_error(
        actual_temperature,
        [sample[1][0] for sample in validation],
    )
    baseline_rainfall_mae = mean_absolute_error(
        actual_rainfall,
        [sample[1][2] for sample in validation],
    )

    all_features = [sample[1] for sample in samples]
    temperature_model.fit(all_features, [sample[2] for sample in samples])
    rainfall_model.fit(all_features, [sample[3] for sample in samples])
    latest_features = build_features(latest_origin, target_date, records_by_date)

    return {
        "target_date": target_date.isoformat(),
        "latest_observation_date": latest_origin.isoformat(),
        "horizon_days": horizon_days,
        "model": "Random Forest regression",
        "training_samples": len(samples),
        "training_cutoff": training[-1][0].isoformat(),
        "validation_samples": len(validation),
        "validation_method": "Chronological 80/20 holdout",
        "predicted_temperature_mean": round(float(temperature_model.predict([latest_features])[0]), 1),
        "predicted_precipitation": round(max(0, float(rainfall_model.predict([latest_features])[0])), 1),
        "temperature_mae_c": round(float(temperature_mae), 2),
        "rainfall_mae_mm": round(float(rainfall_mae), 2),
        "baseline_temperature_mae_c": round(float(baseline_temperature_mae), 2),
        "baseline_rainfall_mae_mm": round(float(baseline_rainfall_mae), 2),
        "temperature_skill_vs_persistence_pct": round((1 - temperature_mae / baseline_temperature_mae) * 100, 1) if baseline_temperature_mae else None,
        "rainfall_skill_vs_persistence_pct": round((1 - rainfall_mae / baseline_rainfall_mae) * 100, 1) if baseline_rainfall_mae else None,
    }