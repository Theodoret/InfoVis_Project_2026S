from __future__ import annotations

from math import log
from math import sqrt
from typing import Iterable

from common.country_codes import EUROSTAT_TO_ISO3


def pearson_correlation(points: Iterable[tuple[float, float]]) -> float | None:
    """Measure the straight-line relationship between x and y values."""
    pairs = list(points)
    if len(pairs) < 2:
        return None

    x_values = [pair[0] for pair in pairs]
    y_values = [pair[1] for pair in pairs]
    x_mean = sum(x_values) / len(x_values)
    y_mean = sum(y_values) / len(y_values)

    numerator = 0.0
    x_square_sum = 0.0
    y_square_sum = 0.0

    for x_value, y_value in pairs:
        x_difference = x_value - x_mean
        y_difference = y_value - y_mean
        numerator += x_difference * y_difference
        x_square_sum += x_difference * x_difference
        y_square_sum += y_difference * y_difference

    denominator = sqrt(x_square_sum * y_square_sum)
    if denominator == 0:
        return None

    return numerator / denominator


def ranked_values(values: list[float]) -> list[float]:
    """Return ranks using average ranks for ties.

    Example: values [10, 20, 20] become ranks [1, 2.5, 2.5].
    """
    sorted_values = sorted((value, index) for index, value in enumerate(values))
    ranks = [0.0] * len(values)
    position = 0

    while position < len(sorted_values):
        tie_start = position
        tie_value = sorted_values[position][0]

        while position < len(sorted_values) and sorted_values[position][0] == tie_value:
            position += 1

        tie_end = position
        average_rank = (tie_start + 1 + tie_end) / 2

        for _, original_index in sorted_values[tie_start:tie_end]:
            ranks[original_index] = average_rank

    return ranks


def spearman_correlation(points: Iterable[tuple[float, float]]) -> float | None:
    """Measure whether larger x values usually come with larger y values."""
    pairs = list(points)
    if len(pairs) < 2:
        return None

    x_ranks = ranked_values([pair[0] for pair in pairs])
    y_ranks = ranked_values([pair[1] for pair in pairs])
    return pearson_correlation(zip(x_ranks, y_ranks))


def linear_regression(points: Iterable[tuple[float, float]]) -> dict | None:
    """Build a simple trend line for the scatter plot."""
    pairs = list(points)
    if len(pairs) < 2:
        return None

    x_values = [pair[0] for pair in pairs]
    y_values = [pair[1] for pair in pairs]
    x_mean = sum(x_values) / len(x_values)
    y_mean = sum(y_values) / len(y_values)

    numerator = 0.0
    denominator = 0.0

    for x_value, y_value in pairs:
        x_difference = x_value - x_mean
        numerator += x_difference * (y_value - y_mean)
        denominator += x_difference * x_difference

    if denominator == 0:
        return None

    slope = numerator / denominator
    intercept = y_mean - slope * x_mean
    min_x = min(x_values)
    max_x = max(x_values)

    return {
        "slope": slope,
        "intercept": intercept,
        "points": [
            {"gdp": min_x, "value": slope * min_x + intercept},
            {"gdp": max_x, "value": slope * max_x + intercept},
        ],
    }


def build_gdp_correlation_payload(
    *,
    gdp_records: list[dict],
    indicator_records: list[dict],
    variable_key: str,
    variable_label_key: str,
    selected_variable: str | None = None,
    gdp_scale: str = "raw",
    gdp_label: str = "GDP",
) -> dict:
    """Return scatter data and correlation rows for GDP against one indicator.

    `indicator_records` should contain one row per country and variable category.
    For BMI, the variable category is the BMI group, such as "Obese" or "Normal".
    """
    use_log_gdp = gdp_scale == "log"
    resolved_gdp_label = gdp_label or "GDP"
    gdp_by_iso3 = {}
    raw_gdp_by_iso3 = {}
    for record in gdp_records:
        country_code = record.get("countryCode")
        raw_gdp = record.get("gdp")
        if not country_code or not isinstance(raw_gdp, (int, float)):
            continue
        if use_log_gdp and raw_gdp <= 0:
            continue

        raw_gdp_by_iso3[country_code] = raw_gdp
        gdp_by_iso3[country_code] = log(raw_gdp) if use_log_gdp else raw_gdp
    grouped_points: dict[str, list[dict]] = {}
    variable_labels: dict[str, str] = {}

    for record in indicator_records:
        iso3 = EUROSTAT_TO_ISO3.get(record.get("countryCode", ""))
        if not iso3 or iso3 not in gdp_by_iso3:
            continue

        variable = record.get(variable_key, "")
        if not variable:
            continue

        variable_labels[variable] = record.get(variable_label_key, "") or variable
        grouped_points.setdefault(variable, []).append(
            {
                "country": record.get("country", iso3),
                "countryCode": record.get("countryCode", ""),
                "iso3": iso3,
                "gdp": gdp_by_iso3[iso3],
                "rawGdp": raw_gdp_by_iso3[iso3],
                "value": record["value"],
            }
        )

    correlations = []
    for variable, points in grouped_points.items():
        pairs = [(point["gdp"], point["value"]) for point in points]
        pearson = pearson_correlation(pairs)
        spearman = spearman_correlation(pairs)
        available_correlations = [
            value
            for value in (pearson, spearman)
            if value is not None
        ]
        strength = max(abs(value) for value in available_correlations) if available_correlations else None

        correlations.append(
            {
                "variable": variable,
                "label": variable_labels.get(variable, variable),
                "pearson": pearson,
                "spearman": spearman,
                "count": len(points),
                "strength": strength,
            }
        )

    correlations.sort(key=lambda row: row["strength"] if row["strength"] is not None else -1, reverse=True)

    selected = selected_variable if selected_variable in grouped_points else None
    if not selected and correlations:
        selected = correlations[0]["variable"]

    selected_points = grouped_points.get(selected, [])
    trend = linear_regression((point["gdp"], point["value"]) for point in selected_points)
    selected_row = next((row for row in correlations if row["variable"] == selected), None)

    return {
        "selectedVariable": selected,
        "selectedLabel": variable_labels.get(selected, selected),
        "selectedCorrelation": selected_row,
        "gdpScale": "log" if use_log_gdp else "raw",
        "gdpScaleLabel": f"log({resolved_gdp_label})" if use_log_gdp else resolved_gdp_label,
        "correlations": correlations,
        "scatter": {
            "points": selected_points,
            "trend": trend,
        },
    }
