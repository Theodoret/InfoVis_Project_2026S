from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Iterable

from common.correlation import build_gdp_correlation_payload
from common.eurostat import EurostatDimension, option_list
from common.world_bank import WorldBankWideCsvDataset


DEFAULT_GDP_YEAR = "2023"
DEFAULT_GDP_METRIC = "total"
STANDARDIZE_OFF = "0"
STANDARDIZE_ON = "1"
POSITIVE_DIRECTION = "positive"
NEGATIVE_DIRECTION = "negative"
COMBINED_SCORE_KEY = "combined_score"
COMBINED_SCORE_LABEL = "Combined score"
PROJECT_ROOT = Path(__file__).resolve().parents[1]
GDP_CSV_PATH = PROJECT_ROOT / "data" / "europe_gdp.csv"
GDP_PER_CAPITA_CSV_PATH = PROJECT_ROOT / "data" / "europe_gdp_per_capita.csv"
YEAR_STANDARDIZATION_DIMENSION = EurostatDimension("year", "year", "Year", "year", "year")

GDP_DATASET = WorldBankWideCsvDataset(GDP_CSV_PATH, value_key="gdp")
GDP_PER_CAPITA_DATASET = WorldBankWideCsvDataset(GDP_PER_CAPITA_CSV_PATH, value_key="gdp")
GDP_METRICS = {
    "total": {
        "label": "GDP",
        "short_label": "GDP",
        "description": "total GDP",
        "dataset": GDP_DATASET,
        "unit": "million",
    },
    "per_capita": {
        "label": "GDP per capita",
        "short_label": "GDP per capita",
        "description": "GDP per capita",
        "dataset": GDP_PER_CAPITA_DATASET,
        "unit": "person",
    },
}


@dataclass(frozen=True)
class CountryIndicatorSource:
    key: str
    label: str
    path: Path


@dataclass(frozen=True)
class WideCountryIndicatorMetric:
    key: str
    label: str
    column: str


class CountryIndicatorCsvDataset:
    """Read simple country/year/value CSVs as dashboard indicator records."""

    dimensions = (
        EurostatDimension("metric", "metric", "Metric", "metric", "metricLabel"),
        EurostatDimension("country", "countryCode", "Country", "countryCode", "country"),
    )

    def __init__(
        self,
        sources: Iterable[CountryIndicatorSource],
        *,
        country_code_column: str = "geoUnit",
        year_column: str = "year",
        value_column: str = "value",
        country_names: dict[str, str] | None = None,
    ) -> None:
        self.sources = tuple(sources)
        self.country_code_column = country_code_column
        self.year_column = year_column
        self.value_column = value_column
        self.country_names = country_names or {}

    def records(self) -> list[dict]:
        return _read_country_indicator_records(
            tuple((source.key, source.label, str(source.path)) for source in self.sources),
            self.country_code_column,
            self.year_column,
            self.value_column,
            tuple(sorted(self.country_names.items())),
        )

    def options(self) -> dict[str, list[dict]]:
        records = self.records()
        years = sorted({record["year"] for record in records if record.get("year")})
        return {
            "metric": [{"value": source.key, "label": source.label} for source in self.sources],
            "country": option_list(records, "countryCode", "country"),
            "year": [{"value": year, "label": year} for year in years],
        }

    def filtered_records(
        self,
        filters: dict[str, str],
        *,
        include_year: bool = True,
        include_dimensions: Iterable[str] | None = None,
    ) -> list[dict]:
        included = set(include_dimensions) if include_dimensions is not None else {"metric", "country"}
        filtered = []
        selected_years = _selected_values(filters.get("year"))

        for record in self.records():
            if include_year and selected_years and record.get("year") not in selected_years:
                continue

            matches = True
            selected_metrics = _selected_values(filters.get("metric"))
            if "metric" in included and selected_metrics and record.get("metric") not in selected_metrics:
                matches = False
            selected_countries = _selected_values(filters.get("country"))
            if "country" in included and selected_countries and record.get("countryCode") not in selected_countries:
                matches = False

            if matches:
                filtered.append(record)

        return filtered


class CountryIndicatorWideCsvDataset:
    """Read one wide country/year CSV with several numeric metric columns."""

    dimensions = (
        EurostatDimension("metric", "metric", "Metric", "metric", "metricLabel"),
        EurostatDimension("country", "countryCode", "Country", "countryCode", "country"),
    )

    def __init__(
        self,
        path: Path,
        metrics: Iterable[WideCountryIndicatorMetric],
        *,
        country_code_column: str = "Country Code",
        country_name_column: str = "Country Name",
        year_column: str = "year",
        country_names: dict[str, str] | None = None,
    ) -> None:
        self.path = path
        self.metrics = tuple(metrics)
        self.country_code_column = country_code_column
        self.country_name_column = country_name_column
        self.year_column = year_column
        self.country_names = country_names or {}

    def records(self) -> list[dict]:
        return _read_wide_country_indicator_records(
            str(self.path),
            tuple((metric.key, metric.label, metric.column) for metric in self.metrics),
            self.country_code_column,
            self.country_name_column,
            self.year_column,
            tuple(sorted(self.country_names.items())),
        )

    def options(self) -> dict[str, list[dict]]:
        records = self.records()
        years = sorted({record["year"] for record in records if record.get("year")})
        return {
            "metric": [{"value": metric.key, "label": metric.label} for metric in self.metrics],
            "country": option_list(records, "countryCode", "country"),
            "year": [{"value": year, "label": year} for year in years],
        }

    def filtered_records(
        self,
        filters: dict[str, str],
        *,
        include_year: bool = True,
        include_dimensions: Iterable[str] | None = None,
    ) -> list[dict]:
        included = set(include_dimensions) if include_dimensions is not None else {"metric", "country"}
        selected_years = _selected_values(filters.get("year"))
        selected_metrics = _selected_values(filters.get("metric"))
        selected_countries = _selected_values(filters.get("country"))
        filtered = []

        for record in self.records():
            if include_year and selected_years and record.get("year") not in selected_years:
                continue
            if "metric" in included and selected_metrics and record.get("metric") not in selected_metrics:
                continue
            if "country" in included and selected_countries and record.get("countryCode") not in selected_countries:
                continue

            filtered.append(record)

        return filtered


def prepare_indicator_registry(indicators: dict[str, dict]) -> dict[str, dict]:
    for indicator in indicators.values():
        indicator["correlation_variables"] = _correlation_variables(indicator["dimensions"])
        indicator["view_queries"] = _view_queries(indicator["dimensions"])
    return indicators


def indicator_filters_from_args(indicators: dict[str, dict], indicator_key: str, args) -> dict[str, str]:
    indicator = indicators[indicator_key]
    filters = {
        key: args.get(key, value)
        for key, value in indicator["defaults"].items()
    }
    filters["gdpYear"] = args.get("gdpYear") or latest_selected_year(filters.get("year")) or DEFAULT_GDP_YEAR
    filters["standardize"] = args.get("standardize", STANDARDIZE_OFF)
    filters["direction"] = args.get("direction", indicator.get("default_direction", POSITIVE_DIRECTION))
    filters["directions"] = args.get("directions", "{}")
    filters["combine"] = args.get("combine", STANDARDIZE_OFF)
    return filters


def indicator_options_payload(indicators: dict[str, dict], indicator_key: str) -> dict:
    indicator = indicators[indicator_key]
    options = indicator["dataset"].options()
    options["gdpScale"] = [
        {"value": "raw", "label": "Raw"},
        {"value": "log", "label": "log(value)"},
    ]
    options["gdpMetric"] = [
        {"value": key, "label": value["label"]}
        for key, value in GDP_METRICS.items()
    ]
    options["gdpYear"] = gdp_year_options()
    options["correlationVariable"] = [
        {"value": key, "label": value["label"]}
        for key, value in indicator["correlation_variables"].items()
    ]
    options["standardize"] = [
        {"value": STANDARDIZE_OFF, "label": "Raw values"},
        {"value": STANDARDIZE_ON, "label": "0-1 score"},
    ]
    options["direction"] = [
        {"value": POSITIVE_DIRECTION, "label": "Higher is better or neutral"},
        {"value": NEGATIVE_DIRECTION, "label": "Higher is worse"},
    ]
    options["combine"] = [
        {"value": STANDARDIZE_OFF, "label": "Single selection"},
        {"value": STANDARDIZE_ON, "label": "Combined score"},
    ]
    defaults = {
        **indicator["defaults"],
        "gdpYear": indicator["defaults"].get("gdpYear")
        or latest_selected_year(indicator["defaults"].get("year"))
        or DEFAULT_GDP_YEAR,
    }
    return {
        "defaults": defaults,
        "options": options,
        "valueLabel": indicator["value_label"],
        "valueUnit": indicator["value_unit"],
    }


def indicator_data_payload(indicators: dict[str, dict], indicator_key: str, args) -> dict:
    indicator = indicators[indicator_key]
    filters = indicator_filters_from_args(indicators, indicator_key, args)
    chart_type = args.get("view", "bar")
    query = indicator["view_queries"].get(chart_type, indicator["view_queries"]["bar"])
    records = indicator["dataset"].filtered_records(
        filters,
        include_year=query["include_year"],
        include_dimensions=query["include_dimensions"],
    )
    if chart_type in {"bar", "map"}:
        records = country_records(records)
    records, standardization = apply_standardization(
        records,
        indicator["dimensions"],
        filters,
        combine=True,
        preserve_year=not query["include_year"],
        include_year_dimension=query["include_year"],
    )
    records.sort(key=query["sort_key"], reverse=query["reverse"])
    return {"filters": filters, "records": records, "standardization": standardization}


def indicator_correlation_payload(indicators: dict[str, dict], indicator_key: str, args) -> dict:
    indicator = indicators[indicator_key]
    filters = indicator_filters_from_args(indicators, indicator_key, args)
    metric_key = filters.get("gdpMetric", DEFAULT_GDP_METRIC)
    metric = GDP_METRICS.get(metric_key, GDP_METRICS[DEFAULT_GDP_METRIC])
    correlation_variable = filters.get("correlationVariable", next(iter(indicator["correlation_variables"])))
    variable_config = indicator["correlation_variables"].get(
        correlation_variable,
        next(iter(indicator["correlation_variables"].values())),
    )
    selected_metric = filters.get(variable_config["variable_key"])
    query = indicator["view_queries"]["correlation"]
    include_dimensions = variable_config["include_dimensions"]
    if _truthy(filters.get("standardize")) and _truthy(filters.get("combine")):
        include_dimensions = tuple(
            dimension.key
            for dimension in indicator["dimensions"]
            if dimension.key != "country"
        )

    indicator_records = indicator["dataset"].filtered_records(
        filters,
        include_year=query["include_year"],
        include_dimensions=include_dimensions,
    )
    indicator_records = country_records(indicator_records)
    indicator_records, standardization = apply_standardization(
        indicator_records,
        indicator["dimensions"],
        filters,
        combine=False,
        preserve_year=not query["include_year"],
        include_year_dimension=query["include_year"],
    )
    variable_key = variable_config["variable_key"]
    variable_label_key = variable_config["variable_label_key"]

    if standardization["combine"]:
        indicator_records = combine_standardized_records(
            indicator_records,
            combined_variable_key="_combinedVariable",
            combined_variable_label_key="_combinedVariableLabel",
            preserve_year=False,
        )
        variable_key = "_combinedVariable"
        variable_label_key = "_combinedVariableLabel"
        selected_metric = COMBINED_SCORE_KEY

    gdp_year = filters.get("gdpYear") or latest_selected_year(filters.get("year")) or filters["year"]
    resolved_gdp_year, gdp_records = gdp_records_for_years(metric, gdp_year)
    payload = build_gdp_correlation_payload(
        gdp_records=gdp_records,
        indicator_records=indicator_records,
        variable_key=variable_key,
        variable_label_key=variable_label_key,
        selected_variable=selected_metric,
        gdp_scale=filters.get("gdpScale", "raw"),
        gdp_label=metric["label"],
    )

    return {
        "filters": filters,
        "year": filters["year"],
        "gdpYear": resolved_gdp_year,
        "gdpMetric": metric_key if metric_key in GDP_METRICS else DEFAULT_GDP_METRIC,
        "gdpMetricLabel": metric["label"],
        "gdpMetricShortLabel": metric["short_label"],
        "gdpMetricUnit": metric["unit"],
        "correlationVariable": correlation_variable,
        "correlationVariableLabel": variable_config["label"],
        "valueLabel": indicator["value_label"],
        "valueUnit": indicator["value_unit"],
        "standardization": standardization,
        **payload,
    }


def gdp_data_payload(args) -> dict:
    year = args.get("year", DEFAULT_GDP_YEAR)
    metric_key = args.get("gdpMetric", DEFAULT_GDP_METRIC)
    metric = GDP_METRICS.get(metric_key, GDP_METRICS[DEFAULT_GDP_METRIC])
    resolved_year, records = metric["dataset"].records_for_year(year)
    return {
        "year": resolved_year,
        "records": records,
        "gdpMetric": metric_key if metric_key in GDP_METRICS else DEFAULT_GDP_METRIC,
        "gdpMetricLabel": metric["label"],
        "gdpMetricShortLabel": metric["short_label"],
        "gdpMetricUnit": metric["unit"],
    }


def gdp_year_options() -> list[dict[str, str]]:
    years = sorted(
        {
            year
            for metric in GDP_METRICS.values()
            for year in metric["dataset"].years()
        },
        key=int,
    )
    return [{"value": year, "label": year} for year in years]


def gdp_records_for_years(metric: dict, years_value: str | None) -> tuple[str, list[dict]]:
    """Return GDP rows for one year, or per-country mean GDP across selected years."""
    dataset = metric["dataset"]
    selected_years = _selected_value_list(years_value)
    if not selected_years:
        selected_years = [DEFAULT_GDP_YEAR]

    if len(selected_years) == 1:
        return dataset.records_for_year(selected_years[0])

    grouped: dict[str, dict] = {}
    resolved_years = []
    seen_years = set()
    for year in selected_years:
        resolved_year, records = dataset.records_for_year(year)
        if resolved_year and resolved_year not in seen_years:
            resolved_years.append(resolved_year)
            seen_years.add(resolved_year)

        for record in records:
            country_code = record.get("countryCode")
            value = record.get("gdp")
            if not country_code or not isinstance(value, (int, float)):
                continue

            entry = grouped.setdefault(
                country_code,
                {
                    "country": record.get("country", country_code),
                    "countryCode": country_code,
                    "values": [],
                },
            )
            entry["values"].append(value)

    records = []
    for entry in grouped.values():
        values = entry["values"]
        if not values:
            continue
        records.append(
            {
                "country": entry["country"],
                "countryCode": entry["countryCode"],
                "gdp": sum(values) / len(values),
            }
        )

    label = ", ".join(resolved_years or selected_years)
    return label, records


@lru_cache(maxsize=4)
def world_bank_country_names(path: str = str(GDP_CSV_PATH)) -> dict[str, str]:
    csv_path = Path(path)
    if not csv_path.exists():
        return {}

    with csv_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(_drop_preamble(csv_file))
        return {
            row.get("Country Code", "").strip(): row.get("Country Name", "").strip()
            for row in reader
            if row.get("Country Code") and row.get("Country Name")
        }


def _drop_preamble(csv_file):
    for line in csv_file:
        if line.startswith("Country Name,"):
            yield line
            break
    yield from csv_file


def apply_standardization(
    records: list[dict],
    dimensions: Iterable[EurostatDimension],
    filters: dict[str, str],
    *,
    combine: bool,
    preserve_year: bool = True,
    include_year_dimension: bool = False,
) -> tuple[list[dict], dict]:
    state = standardization_state(filters)
    if not state["enabled"]:
        return records, state

    standardization_dimensions = tuple(dimensions)
    if include_year_dimension:
        standardization_dimensions = (*standardization_dimensions, YEAR_STANDARDIZATION_DIMENSION)

    standardized_records = minmax_standardized_records(
        records,
        standardization_dimensions,
        state["direction"],
        state["directions"],
    )
    if combine and state["combine"]:
        standardized_records = combine_standardized_records(standardized_records, preserve_year=preserve_year)

    return standardized_records, state


def standardization_state(filters: dict[str, str]) -> dict:
    enabled = _truthy(filters.get("standardize"))
    direction = filters.get("direction") if filters.get("direction") in {POSITIVE_DIRECTION, NEGATIVE_DIRECTION} else POSITIVE_DIRECTION
    direction_map = parse_direction_map(filters.get("directions"))
    return {
        "enabled": enabled,
        "direction": direction,
        "directions": direction_map,
        "directionLabel": "Per option" if direction_map else "Higher is worse" if direction == NEGATIVE_DIRECTION else "Higher is better or neutral",
        "combine": enabled and _truthy(filters.get("combine")),
        "label": "Standardized score" if enabled else "Raw value",
        "valueUnit": "score" if enabled else "raw",
    }


def minmax_standardized_records(
    records: list[dict],
    dimensions: Iterable[EurostatDimension],
    direction: str,
    direction_map: dict[str, dict[str, str]] | None = None,
) -> list[dict]:
    comparable_dimensions = tuple(dimension for dimension in dimensions if dimension.key != "country")
    scale_keys = tuple(dimension.record_code_key for dimension in comparable_dimensions)
    grouped: dict[tuple, list[dict]] = {}

    for record in records:
        grouped.setdefault(tuple(record.get(key, "") for key in scale_keys), []).append(record)

    standardized = []
    for group_records in grouped.values():
        values = [record["value"] for record in group_records if isinstance(record.get("value"), (int, float))]
        if not values:
            continue

        minimum = min(values)
        maximum = max(values)
        spread = maximum - minimum

        for record in group_records:
            if spread == 0:
                normalized = 0.5
            else:
                normalized = (record["value"] - minimum) / spread

            group_direction = direction_for_record(record, comparable_dimensions, direction_map or {}, direction)
            score = 1 - normalized if group_direction == NEGATIVE_DIRECTION else normalized
            standardized.append(
                {
                    **record,
                    "rawValue": record["value"],
                    "value": score,
                    "normalizedValue": score,
                    "normalizationMin": minimum,
                    "normalizationMax": maximum,
                    "direction": group_direction,
                    "standardized": True,
                }
            )

    return standardized


def combine_standardized_records(
    records: list[dict],
    *,
    combined_variable_key: str = "_combinedVariable",
    combined_variable_label_key: str = "_combinedVariableLabel",
    preserve_year: bool = True,
) -> list[dict]:
    grouped: dict[tuple, list[dict]] = {}

    for record in records:
        key = (
            record.get("countryCode", ""),
            record.get("country", ""),
            record.get("iso3", ""),
        )
        if preserve_year:
            key = (*key, record.get("year", ""))
        grouped.setdefault(key, []).append(record)

    combined = []
    for group_records in grouped.values():
        values = [record["value"] for record in group_records if isinstance(record.get("value"), (int, float))]
        if not values:
            continue

        base = dict(group_records[0])
        base["value"] = sum(values) / len(values)
        base["rawValue"] = None
        base["combinedCount"] = len(values)
        base["combined"] = True
        base[combined_variable_key] = COMBINED_SCORE_KEY
        base[combined_variable_label_key] = COMBINED_SCORE_LABEL
        combined.append(base)

    return combined


def parse_direction_map(raw_value: str | None) -> dict[str, dict[str, str]]:
    if not raw_value:
        return {}

    try:
        parsed = json.loads(raw_value)
    except (TypeError, ValueError):
        return {}

    if not isinstance(parsed, dict):
        return {}

    direction_map: dict[str, dict[str, str]] = {}
    for dimension, values in parsed.items():
        if not isinstance(values, dict):
            continue

        clean_values = {
            str(option): direction
            for option, direction in values.items()
            if direction in {POSITIVE_DIRECTION, NEGATIVE_DIRECTION}
        }
        if clean_values:
            direction_map[str(dimension)] = clean_values

    return direction_map


def direction_for_record(
    record: dict,
    dimensions: Iterable[EurostatDimension],
    direction_map: dict[str, dict[str, str]],
    fallback: str,
) -> str:
    directions = []
    for dimension in dimensions:
        option = record.get(dimension.record_code_key)
        selected_direction = direction_map.get(dimension.key, {}).get(option)
        if selected_direction in {POSITIVE_DIRECTION, NEGATIVE_DIRECTION}:
            directions.append(selected_direction)

    if NEGATIVE_DIRECTION in directions:
        return NEGATIVE_DIRECTION
    if POSITIVE_DIRECTION in directions:
        return POSITIVE_DIRECTION
    return fallback


def _selected_values(value: str | None) -> set[str]:
    if not value:
        return set()

    return {item.strip() for item in str(value).split(",") if item.strip()}


def _selected_value_list(value: str | None) -> list[str]:
    if not value:
        return []

    seen = set()
    selected = []
    for item in str(value).split(","):
        item = item.strip()
        if item and item not in seen:
            selected.append(item)
            seen.add(item)
    return selected


def latest_selected_year(value: str | None) -> str:
    years = []
    for item in str(value or "").split(","):
        item = item.strip()
        if item.isdigit():
            years.append(int(item))
    return str(max(years)) if years else ""


def country_records(records: Iterable[dict]) -> list[dict]:
    return [record for record in records if is_country_record(record)]


def is_country_record(record: dict) -> bool:
    code = str(record.get("countryCode", "")).upper()
    return bool(code) and not (
        code.startswith("EU")
        or code.startswith("EA")
        or code.startswith("EEA")
        or code.startswith("EFTA")
        or code == "DE_TOT"
    )


def _truthy(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


@lru_cache(maxsize=8)
def _read_country_indicator_records(
    sources: tuple[tuple[str, str, str], ...],
    country_code_column: str,
    year_column: str,
    value_column: str,
    country_names_items: tuple[tuple[str, str], ...],
) -> list[dict]:
    country_names = dict(country_names_items)
    records = []

    for metric_key, metric_label, path in sources:
        csv_path = Path(path)
        if not csv_path.exists():
            continue

        with csv_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
            for row in csv.DictReader(csv_file):
                country_code = row.get(country_code_column, "").strip()
                year = row.get(year_column, "").strip()
                raw_value = row.get(value_column, "").strip()
                if not country_code or not year or not raw_value:
                    continue

                try:
                    value = float(raw_value)
                except ValueError:
                    continue

                records.append(
                    {
                        "metric": metric_key,
                        "metricLabel": metric_label,
                        "countryCode": country_code,
                        "iso3": country_code,
                        "country": country_names.get(country_code, country_code),
                        "year": year,
                        "value": value,
                    }
                )

    return records


@lru_cache(maxsize=8)
def _read_wide_country_indicator_records(
    path: str,
    metrics: tuple[tuple[str, str, str], ...],
    country_code_column: str,
    country_name_column: str,
    year_column: str,
    country_names_items: tuple[tuple[str, str], ...],
) -> list[dict]:
    csv_path = Path(path)
    if not csv_path.exists():
        return []

    country_names = dict(country_names_items)
    records = []

    with csv_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        for row in csv.DictReader(csv_file):
            country_code = row.get(country_code_column, "").strip()
            year = row.get(year_column, "").strip()
            if not country_code or not year:
                continue

            country = row.get(country_name_column, "").strip() or country_names.get(country_code, country_code)
            for metric_key, metric_label, column in metrics:
                raw_value = row.get(column, "")
                if raw_value is None or str(raw_value).strip() == "":
                    continue

                try:
                    value = float(raw_value)
                except ValueError:
                    continue

                records.append(
                    {
                        "metric": metric_key,
                        "metricLabel": metric_label,
                        "countryCode": country_code,
                        "iso3": country_code,
                        "country": country,
                        "year": year,
                        "value": value,
                    }
                )

    return records


def _correlation_variables(dimensions):
    variables = {}
    for dimension in dimensions:
        if dimension.key == "country":
            continue
        variables[dimension.key] = {
            "label": dimension.label_column,
            "variable_key": dimension.record_code_key,
            "variable_label_key": dimension.record_label_key,
            "include_dimensions": tuple(
                other.key
                for other in dimensions
                if other.key not in ("country", dimension.key)
            ),
        }
    return variables


def _view_queries(dimensions):
    dimension_keys = tuple(dimension.key for dimension in dimensions)
    countryless = tuple(key for key in dimension_keys if key != "country")
    return {
        "line": {
            "include_year": False,
            "include_dimensions": dimension_keys,
            "sort_key": lambda row: row["year"],
            "reverse": False,
        },
        "bar": {
            "include_year": True,
            "include_dimensions": countryless,
            "sort_key": lambda row: row["value"],
            "reverse": True,
        },
        "map": {
            "include_year": True,
            "include_dimensions": countryless,
            "sort_key": lambda row: row["value"],
            "reverse": True,
        },
        "correlation": {
            "include_year": True,
            "sort_key": lambda row: row["value"],
            "reverse": True,
        },
    }
