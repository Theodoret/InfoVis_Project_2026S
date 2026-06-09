from __future__ import annotations

from math import log
import json
from typing import Iterable

from common.correlation import pearson_correlation
from common.country_codes import EUROSTAT_TO_ISO3
from common.eurostat import EurostatDimension
from common.sector_indicators import (
    DEFAULT_GDP_METRIC,
    GDP_METRICS,
    NEGATIVE_DIRECTION,
    POSITIVE_DIRECTION,
    STANDARDIZE_ON,
    YEAR_STANDARDIZATION_DIMENSION,
    apply_standardization,
    country_records,
    gdp_year_options,
    gdp_records_for_years,
    is_country_record,
    latest_selected_year,
    parse_direction_map,
)


def summary_options_payload(summary_registry: dict[str, dict], dataset_key: str | None = None) -> dict:
    dataset_options = [
        {
            "value": key,
            "label": f"{entry['sector']} - {entry['label']}",
            "sector": entry["sector"],
        }
        for key, entry in summary_registry.items()
    ]
    selected_key = _resolve_dataset_key(summary_registry, dataset_key)
    selected_entry = summary_registry[selected_key]
    indicator = selected_entry["indicators"][selected_entry["indicator_key"]]
    options = indicator["dataset"].options()
    fixed_filters = _fixed_filters(selected_entry)
    dimensions = [
        _dimension_payload(dimension, options.get(dimension.key, []))
        for dimension in indicator["dimensions"]
        if dimension.key != "country" and dimension.key not in fixed_filters
    ]
    dimensions.append(_dimension_payload(YEAR_STANDARDIZATION_DIMENSION, options.get("year", [])))

    return {
        "datasets": dataset_options,
        "selectedDataset": selected_key,
        "selectedDatasetLabel": selected_entry["label"],
        "sector": selected_entry["sector"],
        "dimensions": dimensions,
        "gdpMetricOptions": [
            {"value": key, "label": value["label"]}
            for key, value in GDP_METRICS.items()
        ],
        "gdpYearOptions": gdp_year_options(),
        "gdpScaleOptions": [
            {"value": "raw", "label": "Raw"},
            {"value": "log", "label": "log(value)"},
        ],
    }


def summary_data_payload(summary_registry: dict[str, dict], args) -> dict:
    dataset_key = _resolve_dataset_key(summary_registry, args.get("dataset"))
    return _summary_dataset_payload(summary_registry, dataset_key, args)


def summary_radar_payload(summary_registry: dict[str, dict], body: dict | None = None) -> dict:
    body = body if isinstance(body, dict) else {}
    dataset_state = body.get("datasets") if isinstance(body.get("datasets"), dict) else {}
    gdp_metric_key = body.get("gdpMetric", DEFAULT_GDP_METRIC)
    gdp_scale = body.get("gdpScale", "raw")
    fallback_gdp_year = body.get("gdpYear", "")

    sectors = []
    for dataset_key, entry in summary_registry.items():
        sector_label = entry["sector"]
        sector = next((item for item in sectors if item["label"] == sector_label), None)
        if not sector:
            sector = {
                "key": _sector_key(sector_label),
                "label": sector_label,
                "color": _sector_color(sector_label),
                "points": [],
            }
            sectors.append(sector)

        indicator = entry["indicators"][entry["indicator_key"]]
        dataset_options = indicator["dataset"].options()
        state = dataset_state.get(dataset_key, {}) if isinstance(dataset_state.get(dataset_key), dict) else {}
        filters = state.get("filters") if isinstance(state.get("filters"), dict) else {}
        directions = state.get("directions") if isinstance(state.get("directions"), dict) else {}
        base_args = {
            "dataset": dataset_key,
            "gdpMetric": gdp_metric_key,
            "gdpScale": gdp_scale,
            "gdpYear": _joined_filter_value(state.get("gdpYear")) or fallback_gdp_year,
            "directions": json.dumps(_merged_default_directions(dataset_key, dataset_options, directions)),
        }
        for key, value in filters.items():
            base_args[key] = _joined_filter_value(value)

        for point_config in _radar_point_configs(entry, dataset_options, base_args):
            point_args = {**base_args, **point_config["filters"]}
            payload = _summary_dataset_payload(
                summary_registry,
                dataset_key,
                point_args,
                include_records=False,
            )
            pearson = payload["correlation"]["pearson"]
            value = abs(pearson) if pearson is not None else None
            sector["points"].append(
                {
                    "dataset": dataset_key,
                    "key": point_config["key"],
                    "label": point_config["label"],
                    "shortLabel": point_config["shortLabel"],
                    "pearson": pearson,
                    "value": value,
                    "count": payload["correlation"]["count"],
                    "gdpYear": payload["gdpYear"],
                    "gdpMetricLabel": payload["gdpMetricLabel"],
                }
            )

    points = [
        point
        for sector in sectors
        for point in sector["points"]
        if isinstance(point.get("value"), (int, float))
    ]
    average = sum(point["value"] for point in points) / len(points) if points else None
    strongest = max(points, key=lambda point: point["value"]) if points else None

    return {
        "sectors": sectors,
        "average": average,
        "strongest": strongest,
        "count": len(points),
        "gdpMetric": gdp_metric_key if gdp_metric_key in GDP_METRICS else DEFAULT_GDP_METRIC,
        "gdpMetricLabel": GDP_METRICS.get(gdp_metric_key, GDP_METRICS[DEFAULT_GDP_METRIC])["label"],
        "gdpYear": fallback_gdp_year,
        "gdpScale": "log" if gdp_scale == "log" else "raw",
    }


def _summary_dataset_payload(
    summary_registry: dict[str, dict],
    dataset_key: str,
    args,
    *,
    include_records: bool = True,
) -> dict:
    entry = summary_registry[dataset_key]
    indicator = entry["indicators"][entry["indicator_key"]]
    dataset_options = indicator["dataset"].options()
    dimensions = tuple(indicator["dimensions"])
    fixed_filters = _fixed_filters(entry)
    selected_dimensions = tuple(
        dimension
        for dimension in dimensions
        if dimension.key != "country" and dimension.key not in fixed_filters
    )
    include_dimensions = tuple(
        dimension.key
        for dimension in dimensions
        if dimension.key != "country"
    )
    filters = _summary_filters(args, selected_dimensions, dataset_options)
    filters.update(fixed_filters)
    records = indicator["dataset"].filtered_records(
        filters,
        include_year=True,
        include_dimensions=include_dimensions,
    )
    records = country_records(records)
    records, standardization = apply_standardization(
        records,
        dimensions,
        filters,
        combine=True,
        preserve_year=False,
        include_year_dimension=True,
    )
    records = [
        record
        for record in records
        if is_country_record(record) and isinstance(record.get("value"), (int, float))
    ]
    records.sort(key=lambda record: record["value"], reverse=True)

    gdp_metric_key = args.get("gdpMetric", DEFAULT_GDP_METRIC)
    gdp_metric = GDP_METRICS.get(gdp_metric_key, GDP_METRICS[DEFAULT_GDP_METRIC])
    gdp_year = args.get("gdpYear") or latest_selected_year(filters.get("year")) or ""
    resolved_gdp_year, gdp_records = gdp_records_for_years(gdp_metric, gdp_year)
    gdp_by_iso3, raw_gdp_by_iso3 = _gdp_lookup(gdp_records, args.get("gdpScale") == "log")
    scored_records, points = _records_with_gdp(records, gdp_by_iso3, raw_gdp_by_iso3)
    pearson = pearson_correlation((point["gdp"], point["value"]) for point in points)

    return {
        "dataset": dataset_key,
        "datasetLabel": entry["label"],
        "sector": entry["sector"],
        "filters": filters,
        "records": scored_records if include_records else [],
        "correlation": {
            "pearson": pearson,
            "count": len(points),
        },
        "gdpYear": resolved_gdp_year,
        "gdpMetric": gdp_metric_key if gdp_metric_key in GDP_METRICS else DEFAULT_GDP_METRIC,
        "gdpMetricLabel": gdp_metric["label"],
        "gdpScale": "log" if args.get("gdpScale") == "log" else "raw",
        "standardization": standardization,
    }


def _dimension_payload(dimension: EurostatDimension, options: list[dict]) -> dict:
    return {
        "key": dimension.key,
        "label": _short_dimension_label(dimension),
        "options": options,
    }


def _fixed_filters(entry: dict) -> dict[str, str]:
    fixed_filters = entry.get("fixed_filters")
    if not isinstance(fixed_filters, dict):
        return {}
    return {
        str(key): str(value)
        for key, value in fixed_filters.items()
        if key and value
    }


def _radar_point_configs(entry: dict, options: dict[str, list[dict]], base_args: dict) -> list[dict]:
    fixed_filters = _fixed_filters(entry)
    if fixed_filters.get("metric"):
        return [
            {
                "key": entry["label"],
                "label": entry["label"],
                "shortLabel": _short_radar_label(entry["label"]),
                "filters": {},
            }
        ]

    metric_options = options.get("metric", [])
    if metric_options:
        selected_metrics = set(_selected_option_values(base_args.get("metric"), metric_options))
        return [
            {
                "key": f"{entry['label']}:{option['value']}",
                "label": option["label"],
                "shortLabel": _short_radar_label(option["label"]),
                "filters": {"metric": option["value"]},
            }
            for option in metric_options
            if option["value"] in selected_metrics
        ]

    return [
        {
            "key": entry["label"],
            "label": entry["label"],
            "shortLabel": _short_radar_label(entry["label"]),
            "filters": {},
        }
    ]


def _selected_option_values(raw_value, options: list[dict]) -> list[str]:
    option_values = [option["value"] for option in options]
    selected = [
        value
        for value in _joined_filter_value(raw_value).split(",")
        if value in option_values
    ]
    return selected or option_values


def _joined_filter_value(value) -> str:
    if isinstance(value, (list, tuple, set)):
        return ",".join(str(item) for item in value if str(item))
    return str(value or "")


def _merged_default_directions(dataset_key: str, options: dict[str, list[dict]], saved: dict) -> dict:
    merged = _default_direction_map(dataset_key, options)
    for dimension, values in saved.items():
        if not isinstance(values, dict):
            continue
        merged[dimension] = {
            **merged.get(dimension, {}),
            **{
                str(option): direction
                for option, direction in values.items()
                if direction in {POSITIVE_DIRECTION, NEGATIVE_DIRECTION}
            },
        }
    return merged


def _default_direction_map(dataset_key: str, options: dict[str, list[dict]]) -> dict[str, dict[str, str]]:
    if dataset_key == "healthcare:bmi":
        negative_bmi = {"BMI_GE30", "BMI_GE25", "BMI25-29", "BMI_LT18P5"}
        return {
            "bmi": {
                option["value"]: NEGATIVE_DIRECTION if option["value"] in negative_bmi else POSITIVE_DIRECTION
                for option in options.get("bmi", [])
            }
        }

    if dataset_key == "healthcare:unmet":
        return {
            "reason": {
                option["value"]: NEGATIVE_DIRECTION
                for option in options.get("reason", [])
            }
        }

    if dataset_key.startswith("activities:"):
        negative_metrics = {"working_hours", "tv_time"}
        return {
            "metric": {
                option["value"]: NEGATIVE_DIRECTION if option["value"] in negative_metrics else POSITIVE_DIRECTION
                for option in options.get("metric", [])
            }
        }

    return {}


def _sector_key(label: str) -> str:
    return label.strip().lower().replace(" ", "-")


def _sector_color(label: str) -> str:
    return {
        "Healthcare": "#4f46e5",
        "Education": "#0891b2",
        "Activities": "#f97316",
    }.get(label, "#4338ca")


def _short_radar_label(label: str) -> str:
    replacements = {
        "Body Mass Index": "BMI",
        "Life expectancy": "Life exp.",
        "Unmet medical needs": "Unmet needs",
        "Completion rate: primary education": "Primary completion",
        "Completion rate: lower secondary education": "Lower sec.",
        "Completion rate: upper secondary education": "Upper sec.",
        "Education expenditure": "Expenditure",
        "Working Hours": "Work hours",
        "TV Time": "TV time",
        "Social Meetings": "Social meetings",
    }
    return replacements.get(label, label)


def _summary_filters(args, dimensions: Iterable[EurostatDimension], options: dict[str, list[dict]]) -> dict[str, str]:
    filters = {}
    for dimension in dimensions:
        selected = args.get(dimension.key)
        if not selected:
            selected = ",".join(option["value"] for option in options.get(dimension.key, []))
        filters[dimension.key] = selected

    selected_years = args.get("year")
    if not selected_years:
        selected_years = ",".join(option["value"] for option in options.get("year", []))
    filters["year"] = selected_years
    filters["standardize"] = STANDARDIZE_ON
    filters["combine"] = STANDARDIZE_ON
    filters["direction"] = POSITIVE_DIRECTION
    filters["directions"] = args.get("directions", "{}")
    filters["gdpMetric"] = args.get("gdpMetric", DEFAULT_GDP_METRIC)
    filters["gdpYear"] = args.get("gdpYear") or latest_selected_year(filters.get("year")) or ""
    filters["gdpScale"] = args.get("gdpScale", "raw")
    return filters


def _records_with_gdp(records: list[dict], gdp_by_iso3: dict[str, float], raw_gdp_by_iso3: dict[str, float]) -> tuple[list[dict], list[dict]]:
    scored = []
    points = []
    for record in records:
        iso3 = _iso3_for_record(record)
        gdp = gdp_by_iso3.get(iso3)
        raw_gdp = raw_gdp_by_iso3.get(iso3)
        row = {
            "country": record.get("country", iso3),
            "countryCode": record.get("countryCode", ""),
            "iso3": iso3,
            "score": record["value"],
            "combinedCount": record.get("combinedCount", 1),
            "gdp": gdp,
            "rawGdp": raw_gdp,
        }
        scored.append(row)
        if isinstance(gdp, (int, float)):
            points.append({
                "country": row["country"],
                "countryCode": row["countryCode"],
                "iso3": iso3,
                "gdp": gdp,
                "value": row["score"],
            })

    return scored, points


def _gdp_lookup(gdp_records: list[dict], use_log: bool) -> tuple[dict[str, float], dict[str, float]]:
    gdp_by_iso3 = {}
    raw_gdp_by_iso3 = {}
    for record in gdp_records:
        iso3 = record.get("countryCode", "")
        raw_value = record.get("gdp")
        if not iso3 or not isinstance(raw_value, (int, float)):
            continue
        if use_log and raw_value <= 0:
            continue

        raw_gdp_by_iso3[iso3] = raw_value
        gdp_by_iso3[iso3] = log(raw_value) if use_log else raw_value

    return gdp_by_iso3, raw_gdp_by_iso3


def _resolve_dataset_key(summary_registry: dict[str, dict], dataset_key: str | None) -> str:
    if dataset_key in summary_registry:
        return str(dataset_key)
    return next(iter(summary_registry))


def _iso3_for_record(record: dict) -> str:
    raw_code = record.get("iso3") or record.get("countryCode", "")
    return EUROSTAT_TO_ISO3.get(raw_code, raw_code if len(raw_code) == 3 else "")


def _short_dimension_label(dimension: EurostatDimension) -> str:
    labels = {
        "bmi": "BMI",
        "education": "Education",
        "sex": "Sex",
        "age": "Age",
        "reason": "Reason",
        "metric": "Metric",
        "year": "Year",
    }
    return labels.get(dimension.key, dimension.label_column)
