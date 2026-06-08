from pathlib import Path

from flask import Blueprint, abort, jsonify, redirect, request, url_for

from common.sector_indicators import (
    DEFAULT_GDP_METRIC,
    CountryIndicatorCsvDataset,
    CountryIndicatorSource,
    gdp_data_payload,
    indicator_correlation_payload,
    indicator_data_payload,
    indicator_options_payload,
    prepare_indicator_registry,
    world_bank_country_names,
)

education_bp = Blueprint(
    "education",
    __name__,
    url_prefix="/education",
    template_folder="templates",
)

DATA_DIR = Path(__file__).resolve().parent / "data"
EDUCATION_DATASET = CountryIndicatorCsvDataset(
    (
        CountryIndicatorSource("expenditure", "Education expenditure", DATA_DIR / "expenditure.csv"),
        CountryIndicatorSource("completion_primary", "Completion rate: primary education", DATA_DIR / "Completion_Rate_Primary_Ed.csv"),
        CountryIndicatorSource("completion_lower_secondary", "Completion rate: lower secondary education", DATA_DIR / "Completion_Rate_Lower_Secondary_Ed.csv"),
        CountryIndicatorSource("completion_upper_secondary", "Completion rate: upper secondary education", DATA_DIR / "Completion_Rate_Upper_Secondary_Ed.csv"),
    ),
    country_names=world_bank_country_names(),
)

EDUCATION_INDICATORS = prepare_indicator_registry({
    "education": {
        "dataset": EDUCATION_DATASET,
        "dimensions": EDUCATION_DATASET.dimensions,
        "defaults": {
            "metric": "completion_upper_secondary",
            "country": "AUT",
            "year": "2019",
            "gdpScale": "raw",
            "gdpMetric": DEFAULT_GDP_METRIC,
            "correlationVariable": "metric",
        },
        "value_label": "Education percentage",
        "value_unit": "percent",
        "correlation_label": "Education metric",
    },
})


@education_bp.route("/")
def page():
    return redirect(url_for("index"))


@education_bp.route("/gdp-data")
def gdp_data():
    return jsonify(gdp_data_payload(request.args))


def _indicator_or_404(indicator_key):
    if indicator_key not in EDUCATION_INDICATORS:
        abort(404)


@education_bp.route("/eurostat/<indicator_key>/options")
def eurostat_options(indicator_key):
    _indicator_or_404(indicator_key)
    return jsonify(indicator_options_payload(EDUCATION_INDICATORS, indicator_key))


@education_bp.route("/eurostat/<indicator_key>/data")
def eurostat_data(indicator_key):
    _indicator_or_404(indicator_key)
    return jsonify(indicator_data_payload(EDUCATION_INDICATORS, indicator_key, request.args))


@education_bp.route("/eurostat/<indicator_key>/gdp-correlation")
def eurostat_gdp_correlation(indicator_key):
    _indicator_or_404(indicator_key)
    return jsonify(indicator_correlation_payload(EDUCATION_INDICATORS, indicator_key, request.args))
