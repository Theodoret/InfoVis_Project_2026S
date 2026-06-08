from pathlib import Path

from flask import Blueprint, abort, jsonify, redirect, request, url_for

from common.eurostat import EurostatCsvDataset, EurostatDimension
from common.sector_indicators import (
    DEFAULT_GDP_METRIC,
    gdp_data_payload,
    indicator_correlation_payload,
    indicator_data_payload,
    indicator_options_payload,
    prepare_indicator_registry,
)

healthcare_bp = Blueprint(
    "healthcare",
    __name__,
    url_prefix="/healthcare",
    template_folder="templates",
)

DATA_DIR = Path(__file__).resolve().parent / "data"
BMI_CSV_PATH = DATA_DIR / "Body mass index (BMI) by sex, age and educational attainment level.csv"
LIFE_EXPECTANCY_CSV_PATH = DATA_DIR / "Life expectancy by age and sex.csv"
UNMET_NEEDS_CSV_PATH = DATA_DIR / "Self-reported unmet needs for medical examination by sex, age, main reason declared and educational attainment level.csv"
DEFAULT_BMI_FILTERS = {
    "bmi": "BMI_GE30",
    "sex": "T",
    "age": "Y_GE18",
    "education": "TOTAL",
    "year": "2019",
    "country": "EU27_2020",
    "gdpScale": "raw",
    "gdpMetric": DEFAULT_GDP_METRIC,
    "correlationVariable": "bmi",
}
BMI_DIMENSIONS = (
    EurostatDimension("bmi", "bmi", "Body Mass Index", "bmi", "bmiLabel"),
    EurostatDimension("education", "isced11", "International Standard Classification of Education (ISCED 2011)", "education", "educationLabel"),
    EurostatDimension("sex", "sex", "Sex", "sex", "sexLabel"),
    EurostatDimension("age", "age", "Age class", "age", "ageLabel"),
    EurostatDimension("country", "geo", "Geopolitical entity (reporting)", "countryCode", "country"),
)
LIFE_EXPECTANCY_DIMENSIONS = (
    EurostatDimension("sex", "sex", "Sex", "sex", "sexLabel"),
    EurostatDimension("age", "age", "Age class", "age", "ageLabel"),
    EurostatDimension("country", "geo", "Geopolitical entity (reporting)", "countryCode", "country"),
)
UNMET_NEEDS_DIMENSIONS = (
    EurostatDimension("education", "isced11", "International Standard Classification of Education (ISCED 2011)", "education", "educationLabel"),
    EurostatDimension("age", "age", "Age class", "age", "ageLabel"),
    EurostatDimension("sex", "sex", "Sex", "sex", "sexLabel"),
    EurostatDimension("reason", "reason", "Reason", "reason", "reasonLabel"),
    EurostatDimension("country", "geo", "Geopolitical entity (reporting)", "countryCode", "country"),
)
BMI_DATASET = EurostatCsvDataset(BMI_CSV_PATH, BMI_DIMENSIONS)
LIFE_EXPECTANCY_DATASET = EurostatCsvDataset(LIFE_EXPECTANCY_CSV_PATH, LIFE_EXPECTANCY_DIMENSIONS)
UNMET_NEEDS_DATASET = EurostatCsvDataset(UNMET_NEEDS_CSV_PATH, UNMET_NEEDS_DIMENSIONS)


HEALTHCARE_INDICATORS = prepare_indicator_registry({
    "bmi": {
        "dataset": BMI_DATASET,
        "dimensions": BMI_DIMENSIONS,
        "defaults": DEFAULT_BMI_FILTERS,
        "value_label": "BMI percentage",
        "value_unit": "percent",
        "correlation_label": "BMI category",
    },
    "life": {
        "dataset": LIFE_EXPECTANCY_DATASET,
        "dimensions": LIFE_EXPECTANCY_DIMENSIONS,
        "defaults": {
            "sex": "T",
            "age": "Y_LT1",
            "country": "EU27_2020",
            "year": "2024",
            "gdpScale": "raw",
            "gdpMetric": DEFAULT_GDP_METRIC,
            "correlationVariable": "age",
        },
        "value_label": "Life expectancy",
        "value_unit": "years",
        "correlation_label": "Age class",
    },
    "unmet": {
        "dataset": UNMET_NEEDS_DATASET,
        "dimensions": UNMET_NEEDS_DIMENSIONS,
        "defaults": {
            "reason": "TXP_TFAR_WLIST",
            "education": "TOTAL",
            "sex": "T",
            "age": "Y16-24",
            "country": "EU27_2020",
            "year": "2024",
            "gdpScale": "raw",
            "gdpMetric": DEFAULT_GDP_METRIC,
            "correlationVariable": "reason",
        },
        "value_label": "Unmet needs percentage",
        "value_unit": "percent",
        "correlation_label": "Reason",
    },
})


@healthcare_bp.route("/")
def page():
    return redirect(url_for("index"))


@healthcare_bp.route("/data")
def data():
    """Return sample data for coordinated healthcare visualisations.

    This returns a small JSON array of objects with `label`, `metricA`, `metricB`.
    """
    payload = [
        {"label": "Jan", "metricA": 34, "metricB": 12},
        {"label": "Feb", "metricA": 45, "metricB": 18},
        {"label": "Mar", "metricA": 28, "metricB": 22},
        {"label": "Apr", "metricA": 52, "metricB": 30},
        {"label": "May", "metricA": 61, "metricB": 40},
        {"label": "Jun", "metricA": 48, "metricB": 35},
    ]
    return jsonify(payload)


@healthcare_bp.route("/gdp-data")
def gdp_data():
    return jsonify(gdp_data_payload(request.args))


def _indicator_or_404(indicator_key):
    if indicator_key not in HEALTHCARE_INDICATORS:
        abort(404)


@healthcare_bp.route("/eurostat/<indicator_key>/options")
def eurostat_options(indicator_key):
    _indicator_or_404(indicator_key)
    return jsonify(indicator_options_payload(HEALTHCARE_INDICATORS, indicator_key))


@healthcare_bp.route("/eurostat/<indicator_key>/data")
def eurostat_data(indicator_key):
    _indicator_or_404(indicator_key)
    return jsonify(indicator_data_payload(HEALTHCARE_INDICATORS, indicator_key, request.args))


@healthcare_bp.route("/eurostat/<indicator_key>/gdp-correlation")
def eurostat_gdp_correlation(indicator_key):
    _indicator_or_404(indicator_key)
    return jsonify(indicator_correlation_payload(HEALTHCARE_INDICATORS, indicator_key, request.args))


@healthcare_bp.route("/bmi-options")
def bmi_options():
    return jsonify(indicator_options_payload(HEALTHCARE_INDICATORS, "bmi"))


@healthcare_bp.route("/bmi-data")
def bmi_data():
    return jsonify(indicator_data_payload(HEALTHCARE_INDICATORS, "bmi", request.args))


@healthcare_bp.route("/bmi-gdp-correlation")
def bmi_gdp_correlation():
    return jsonify(indicator_correlation_payload(HEALTHCARE_INDICATORS, "bmi", request.args))
