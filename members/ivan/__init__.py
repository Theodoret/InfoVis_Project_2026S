from pathlib import Path

from flask import Blueprint, abort, jsonify, render_template, request

from common.correlation import build_gdp_correlation_payload
from common.database import get_page_visit_count, record_page_visit
from common.eurostat import EurostatCsvDataset, EurostatDimension
from common.world_bank import WorldBankWideCsvDataset

# serve blueprint-specific static files from members/ivan/static
ivan_bp = Blueprint(
    "ivan",
    __name__,
    url_prefix="/ivan",
    template_folder="templates",
    static_folder="static",
    static_url_path="/ivan/static",
)

GDP_CSV_PATH = Path(__file__).resolve().parents[2] / "data" / "europe_gdp.csv"
GDP_PER_CAPITA_CSV_PATH = Path(__file__).resolve().parents[2] / "data" / "europe_gdp_per_capita.csv"
DATA_DIR = Path(__file__).resolve().parents[2] / "data"
BMI_CSV_PATH = Path(__file__).resolve().parent / "data" / "Body mass index (BMI) by sex, age and educational attainment level.csv"
LIFE_EXPECTANCY_CSV_PATH = DATA_DIR / "Life expectancy by age and sex.csv"
UNMET_NEEDS_CSV_PATH = DATA_DIR / "Self-reported unmet needs for medical examination by sex, age, main reason declared and educational attainment level.csv"
DEFAULT_GDP_YEAR = "2023"
DEFAULT_GDP_METRIC = "total"
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
BMI_DATASET = EurostatCsvDataset(BMI_CSV_PATH, BMI_DIMENSIONS)
LIFE_EXPECTANCY_DATASET = EurostatCsvDataset(LIFE_EXPECTANCY_CSV_PATH, LIFE_EXPECTANCY_DIMENSIONS)
UNMET_NEEDS_DATASET = EurostatCsvDataset(UNMET_NEEDS_CSV_PATH, UNMET_NEEDS_DIMENSIONS)


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


EUROSTAT_INDICATORS = {
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
}

for indicator in EUROSTAT_INDICATORS.values():
    indicator["correlation_variables"] = _correlation_variables(indicator["dimensions"])
    indicator["view_queries"] = _view_queries(indicator["dimensions"])


@ivan_bp.route("/")
def page():
    record_page_visit("Ivan")
    visit_count = get_page_visit_count("Ivan")
    return render_template("ivan/page.html", member_name="Ivan", visit_count=visit_count)


@ivan_bp.route("/data")
def data():
    """Return sample data for coordinated Ivan visualisations.

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


@ivan_bp.route("/gdp-data")
def gdp_data():
    year = request.args.get("year", DEFAULT_GDP_YEAR)
    metric_key = request.args.get("gdpMetric", DEFAULT_GDP_METRIC)
    metric = GDP_METRICS.get(metric_key, GDP_METRICS[DEFAULT_GDP_METRIC])
    resolved_year, records = metric["dataset"].records_for_year(year)
    return jsonify(
        {
            "year": resolved_year,
            "records": records,
            "gdpMetric": metric_key if metric_key in GDP_METRICS else DEFAULT_GDP_METRIC,
            "gdpMetricLabel": metric["label"],
            "gdpMetricShortLabel": metric["short_label"],
            "gdpMetricUnit": metric["unit"],
        }
    )


def _indicator_or_404(indicator_key):
    indicator = EUROSTAT_INDICATORS.get(indicator_key)
    if indicator is None:
        abort(404)
    return indicator


def _indicator_filters_from_request(indicator_key):
    indicator = _indicator_or_404(indicator_key)
    return {
        key: request.args.get(key, value)
        for key, value in indicator["defaults"].items()
    }


def _indicator_options_payload(indicator_key):
    indicator = _indicator_or_404(indicator_key)
    options = indicator["dataset"].options()
    options["gdpScale"] = [
        {"value": "raw", "label": "Raw"},
        {"value": "log", "label": "log(value)"},
    ]
    options["gdpMetric"] = [
        {"value": key, "label": value["label"]}
        for key, value in GDP_METRICS.items()
    ]
    options["correlationVariable"] = [
        {"value": key, "label": value["label"]}
        for key, value in indicator["correlation_variables"].items()
    ]
    return {
        "defaults": indicator["defaults"],
        "options": options,
        "valueLabel": indicator["value_label"],
        "valueUnit": indicator["value_unit"],
    }


def _indicator_data_payload(indicator_key):
    indicator = _indicator_or_404(indicator_key)
    filters = _indicator_filters_from_request(indicator_key)
    chart_type = request.args.get("view", "bar")
    query = indicator["view_queries"].get(chart_type, indicator["view_queries"]["bar"])
    records = indicator["dataset"].filtered_records(
        filters,
        include_year=query["include_year"],
        include_dimensions=query["include_dimensions"],
    )
    records.sort(key=query["sort_key"], reverse=query["reverse"])

    return {"filters": filters, "records": records}


def _indicator_correlation_payload(indicator_key):
    indicator = _indicator_or_404(indicator_key)
    filters = _indicator_filters_from_request(indicator_key)
    metric_key = filters.get("gdpMetric", DEFAULT_GDP_METRIC)
    metric = GDP_METRICS.get(metric_key, GDP_METRICS[DEFAULT_GDP_METRIC])
    correlation_variable = filters.get("correlationVariable", next(iter(indicator["correlation_variables"])))
    variable_config = indicator["correlation_variables"].get(correlation_variable, next(iter(indicator["correlation_variables"].values())))
    selected_metric = filters.get(variable_config["variable_key"])
    query = indicator["view_queries"]["correlation"]
    indicator_records = indicator["dataset"].filtered_records(
        filters,
        include_year=query["include_year"],
        include_dimensions=variable_config["include_dimensions"],
    )
    resolved_gdp_year, gdp_records = metric["dataset"].records_for_year(filters["year"])
    payload = build_gdp_correlation_payload(
        gdp_records=gdp_records,
        indicator_records=indicator_records,
        variable_key=variable_config["variable_key"],
        variable_label_key=variable_config["variable_label_key"],
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
        **payload,
    }


@ivan_bp.route("/eurostat/<indicator_key>/options")
def eurostat_options(indicator_key):
    return jsonify(_indicator_options_payload(indicator_key))


@ivan_bp.route("/eurostat/<indicator_key>/data")
def eurostat_data(indicator_key):
    return jsonify(_indicator_data_payload(indicator_key))


@ivan_bp.route("/eurostat/<indicator_key>/gdp-correlation")
def eurostat_gdp_correlation(indicator_key):
    return jsonify(_indicator_correlation_payload(indicator_key))


@ivan_bp.route("/bmi-options")
def bmi_options():
    return jsonify(_indicator_options_payload("bmi"))


@ivan_bp.route("/bmi-data")
def bmi_data():
    return jsonify(_indicator_data_payload("bmi"))


@ivan_bp.route("/bmi-gdp-correlation")
def bmi_gdp_correlation():
    return jsonify(_indicator_correlation_payload("bmi"))
