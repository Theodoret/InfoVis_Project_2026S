from __future__ import annotations

from math import log
from typing import Iterable

from common.correlation import pearson_correlation, spearman_correlation
from common.country_codes import EUROSTAT_TO_ISO3
from common.eurostat import EurostatDimension
from common.sector_indicators import (
    DEFAULT_GDP_METRIC,
    GDP_METRICS,
    POSITIVE_DIRECTION,
    STANDARDIZE_ON,
    YEAR_STANDARDIZATION_DIMENSION,
    apply_standardization,
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
    dimensions = [
        _dimension_payload(dimension, options.get(dimension.key, []))
        for dimension in indicator["dimensions"]
        if dimension.key != "country"
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
        "gdpScaleOptions": [
            {"value": "raw", "label": "Raw"},
            {"value": "log", "label": "log(value)"},
        ],
    }


def summary_data_payload(summary_registry: dict[str, dict], args) -> dict:
    dataset_key = _resolve_dataset_key(summary_registry, args.get("dataset"))
    entry = summary_registry[dataset_key]
    indicator = entry["indicators"][entry["indicator_key"]]
    dataset_options = indicator["dataset"].options()
    dimensions = tuple(indicator["dimensions"])
    selected_dimensions = tuple(dimension for dimension in dimensions if dimension.key != "country")
    filters = _summary_filters(args, selected_dimensions, dataset_options)
    records = indicator["dataset"].filtered_records(
        filters,
        include_year=True,
        include_dimensions=tuple(dimension.key for dimension in selected_dimensions),
    )
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
        if _is_country_record(record) and isinstance(record.get("value"), (int, float))
    ]
    records.sort(key=lambda record: record["value"], reverse=True)

    gdp_metric_key = args.get("gdpMetric", DEFAULT_GDP_METRIC)
    gdp_metric = GDP_METRICS.get(gdp_metric_key, GDP_METRICS[DEFAULT_GDP_METRIC])
    gdp_year = _latest_selected_year(filters.get("year")) or args.get("gdpYear") or ""
    resolved_gdp_year, gdp_records = gdp_metric["dataset"].records_for_year(gdp_year)
    gdp_by_iso3, raw_gdp_by_iso3 = _gdp_lookup(gdp_records, args.get("gdpScale") == "log")
    scored_records, points = _records_with_gdp(records, gdp_by_iso3, raw_gdp_by_iso3)
    pearson = pearson_correlation((point["gdp"], point["value"]) for point in points)
    spearman = spearman_correlation((point["gdp"], point["value"]) for point in points)

    return {
        "dataset": dataset_key,
        "datasetLabel": entry["label"],
        "sector": entry["sector"],
        "filters": filters,
        "records": scored_records,
        "correlation": {
            "pearson": pearson,
            "spearman": spearman,
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


def _latest_selected_year(value: str | None) -> str:
    years = []
    for item in str(value or "").split(","):
        item = item.strip()
        if item.isdigit():
            years.append(int(item))
    return str(max(years)) if years else ""


def _iso3_for_record(record: dict) -> str:
    raw_code = record.get("iso3") or record.get("countryCode", "")
    return EUROSTAT_TO_ISO3.get(raw_code, raw_code if len(raw_code) == 3 else "")


def _is_country_record(record: dict) -> bool:
    code = str(record.get("countryCode", "")).upper()
    return bool(code) and not (
        code.startswith("EU")
        or code.startswith("EA")
        or code.startswith("EEA")
        or code.startswith("EFTA")
        or code == "DE_TOT"
    )


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
