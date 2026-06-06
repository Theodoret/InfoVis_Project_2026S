from pathlib import Path

from flask import Blueprint, jsonify, render_template, request

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
BMI_CSV_PATH = Path(__file__).resolve().parent / "data" / "Body mass index (BMI) by sex, age and educational attainment level.csv"
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
BMI_CORRELATION_VARIABLES = {
    "bmi": {
        "label": "BMI category",
        "variable_key": "bmi",
        "variable_label_key": "bmiLabel",
        "include_dimensions": ("education", "sex", "age"),
    },
    "sex": {
        "label": "Sex",
        "variable_key": "sex",
        "variable_label_key": "sexLabel",
        "include_dimensions": ("bmi", "education", "age"),
    },
    "age": {
        "label": "Age",
        "variable_key": "age",
        "variable_label_key": "ageLabel",
        "include_dimensions": ("bmi", "education", "sex"),
    },
    "education": {
        "label": "Education",
        "variable_key": "education",
        "variable_label_key": "educationLabel",
        "include_dimensions": ("bmi", "sex", "age"),
    },
}
BMI_VIEW_QUERIES = {
    "line": {
        "include_year": False,
        "include_dimensions": ("bmi", "education", "sex", "age", "country"),
        "sort_key": lambda row: row["year"],
        "reverse": False,
    },
    "bar": {
        "include_year": True,
        "include_dimensions": ("bmi", "education", "sex", "age"),
        "sort_key": lambda row: row["value"],
        "reverse": True,
    },
    "map": {
        "include_year": True,
        "include_dimensions": ("bmi", "education", "sex", "age"),
        "sort_key": lambda row: row["value"],
        "reverse": True,
    },
    "correlation": {
        "include_year": True,
        "sort_key": lambda row: row["value"],
        "reverse": True,
    },
}


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


def _bmi_filters_from_request():
    return {
        key: request.args.get(key, value)
        for key, value in DEFAULT_BMI_FILTERS.items()
    }


@ivan_bp.route("/bmi-options")
def bmi_options():
    options = BMI_DATASET.options()
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
        for key, value in BMI_CORRELATION_VARIABLES.items()
    ]
    return jsonify(
        {
            "defaults": DEFAULT_BMI_FILTERS,
            "options": options,
        }
    )


@ivan_bp.route("/bmi-data")
def bmi_data():
    filters = _bmi_filters_from_request()
    chart_type = request.args.get("view", "bar")
    query = BMI_VIEW_QUERIES.get(chart_type, BMI_VIEW_QUERIES["bar"])
    records = BMI_DATASET.filtered_records(
        filters,
        include_year=query["include_year"],
        include_dimensions=query["include_dimensions"],
    )
    records.sort(key=query["sort_key"], reverse=query["reverse"])

    return jsonify({"filters": filters, "records": records})


@ivan_bp.route("/bmi-gdp-correlation")
def bmi_gdp_correlation():
    filters = _bmi_filters_from_request()
    metric_key = filters.get("gdpMetric", DEFAULT_GDP_METRIC)
    metric = GDP_METRICS.get(metric_key, GDP_METRICS[DEFAULT_GDP_METRIC])
    correlation_variable = filters.get("correlationVariable", "bmi")
    variable_config = BMI_CORRELATION_VARIABLES.get(correlation_variable, BMI_CORRELATION_VARIABLES["bmi"])
    selected_metric = filters.get(variable_config["variable_key"])
    query = BMI_VIEW_QUERIES["correlation"]
    indicator_records = BMI_DATASET.filtered_records(
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

    return jsonify(
        {
            "filters": filters,
            "year": filters["year"],
            "gdpYear": resolved_gdp_year,
            "gdpMetric": metric_key if metric_key in GDP_METRICS else DEFAULT_GDP_METRIC,
            "gdpMetricLabel": metric["label"],
            "gdpMetricShortLabel": metric["short_label"],
            "gdpMetricUnit": metric["unit"],
            "correlationVariable": correlation_variable,
            "correlationVariableLabel": variable_config["label"],
            **payload,
        }
    )
