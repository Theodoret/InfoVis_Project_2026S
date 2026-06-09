from pathlib import Path

from flask import Blueprint, abort, jsonify, redirect, request, url_for

from common.sector_indicators import (
    DEFAULT_GDP_METRIC,
    CountryIndicatorWideCsvDataset,
    WideCountryIndicatorMetric,
    gdp_data_payload,
    indicator_correlation_payload,
    indicator_data_payload,
    indicator_options_payload,
    prepare_indicator_registry,
)

activities_bp = Blueprint(
    "activities",
    __name__,
    url_prefix="/activities",
    template_folder="templates",
)

DATA_DIR = Path(__file__).resolve().parent / "data"
ESS_COUNTRY_YEAR_CSV_PATH = DATA_DIR / "ess_country_year.csv"

ACTIVITIES_DATASET = CountryIndicatorWideCsvDataset(
    ESS_COUNTRY_YEAR_CSV_PATH,
    (
        WideCountryIndicatorMetric("working_hours", "Working Hours", "wkhtot"),
        WideCountryIndicatorMetric("tv_time", "TV Time", "tvtot_hours"),
        WideCountryIndicatorMetric("social_meetings", "Social Meetings", "sclmeet"),
    ),
)

ACTIVITIES_INDICATORS = prepare_indicator_registry({
    "activities": {
        "dataset": ACTIVITIES_DATASET,
        "dimensions": ACTIVITIES_DATASET.dimensions,
        "defaults": {
            "metric": "working_hours",
            "country": "AUT",
            "year": "2022",
            "gdpScale": "raw",
            "gdpMetric": DEFAULT_GDP_METRIC,
            "correlationVariable": "metric",
        },
        "value_label": "Activity measure",
        "value_unit": "value",
        "correlation_label": "Activity metric",
    },
})


@activities_bp.route("/")
def page():
    return redirect(url_for("index"))


@activities_bp.route("/gdp-data")
def gdp_data():
    return jsonify(gdp_data_payload(request.args))


def _indicator_or_404(indicator_key):
    if indicator_key not in ACTIVITIES_INDICATORS:
        abort(404)


@activities_bp.route("/eurostat/<indicator_key>/options")
def eurostat_options(indicator_key):
    _indicator_or_404(indicator_key)
    return jsonify(indicator_options_payload(ACTIVITIES_INDICATORS, indicator_key))


@activities_bp.route("/eurostat/<indicator_key>/data")
def eurostat_data(indicator_key):
    _indicator_or_404(indicator_key)
    return jsonify(indicator_data_payload(ACTIVITIES_INDICATORS, indicator_key, request.args))


@activities_bp.route("/eurostat/<indicator_key>/gdp-correlation")
def eurostat_gdp_correlation(indicator_key):
    _indicator_or_404(indicator_key)
    return jsonify(indicator_correlation_payload(ACTIVITIES_INDICATORS, indicator_key, request.args))
