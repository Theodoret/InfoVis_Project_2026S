from flask import Blueprint, render_template, jsonify, request
import csv
from pathlib import Path

from common.database import get_page_visit_count, record_page_visit

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
BMI_CSV_PATH = Path(__file__).resolve().parent / "data" / "Body mass index (BMI) by sex, age and educational attainment level.csv"
DEFAULT_GDP_YEAR = "2023"
DEFAULT_BMI_FILTERS = {
    "bmi": "BMI_GE30",
    "sex": "T",
    "age": "Y_GE18",
    "education": "TOTAL",
    "year": "2019",
    "country": "EU27_2020",
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


def _read_gdp_rows():
    if not GDP_CSV_PATH.exists():
        return [], []

    with GDP_CSV_PATH.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.reader(csv_file)

        header = None
        for row in reader:
            if row and row[0] == "Country Name":
                header = row
                break

        if not header:
            return [], []

        return header, list(reader)


def _records_for_year(rows, year_index: int):
    records = []

    for row in rows:
        if len(row) <= year_index:
            continue

        country_name = row[0].strip() if len(row) > 0 else ""
        country_code = row[1].strip() if len(row) > 1 else ""
        raw_value = row[year_index].strip()

        if not country_name or not country_code or not raw_value:
            continue

        try:
            gdp_value = float(raw_value)
        except ValueError:
            continue

        records.append(
            {
                "country": country_name,
                "countryCode": country_code,
                "gdp": gdp_value,
            }
        )

    return records


def _load_gdp_records(year: str):
    requested_year = str(year).strip()
    header, rows = _read_gdp_rows()

    if not header:
        return requested_year, []

    numeric_years = [int(value) for value in header if value.isdigit()]
    if not numeric_years:
        return requested_year, []

    if requested_year not in header:
        requested_year = str(max(numeric_years))

    records = _records_for_year(rows, header.index(requested_year))
    if records:
        return requested_year, records

    for fallback_year in sorted(numeric_years, reverse=True):
        fallback_year = str(fallback_year)
        fallback_records = _records_for_year(rows, header.index(fallback_year))
        if fallback_records:
            return fallback_year, fallback_records

    return requested_year, records


@ivan_bp.route("/gdp-data")
def gdp_data():
    year = request.args.get("year", DEFAULT_GDP_YEAR)
    resolved_year, records = _load_gdp_records(year)
    return jsonify({"year": resolved_year, "records": records})


def _read_bmi_rows():
    if not BMI_CSV_PATH.exists():
        return []

    rows = []
    with BMI_CSV_PATH.open("r", encoding="utf-8-sig", newline="") as csv_file:
        for row in csv.DictReader(csv_file):
            raw_value = row.get("OBS_VALUE", "").strip()
            if not raw_value:
                continue

            try:
                value = float(raw_value)
            except ValueError:
                continue

            rows.append(
                {
                    "bmi": row.get("bmi", "").strip(),
                    "bmiLabel": row.get("Body Mass Index", "").strip(),
                    "education": row.get("isced11", "").strip(),
                    "educationLabel": row.get("International Standard Classification of Education (ISCED 2011)", "").strip(),
                    "sex": row.get("sex", "").strip(),
                    "sexLabel": row.get("Sex", "").strip(),
                    "age": row.get("age", "").strip(),
                    "ageLabel": row.get("Age class", "").strip(),
                    "countryCode": row.get("geo", "").strip(),
                    "country": row.get("Geopolitical entity (reporting)", "").strip(),
                    "year": row.get("TIME_PERIOD", "").strip(),
                    "value": value,
                }
            )

    return rows


def _option_list(rows, code_key, label_key):
    seen = {}
    for row in rows:
        code = row.get(code_key, "")
        label = row.get(label_key, "") or code
        if code and code not in seen:
            seen[code] = label

    return [{"value": code, "label": label} for code, label in sorted(seen.items(), key=lambda item: item[1])]


def _filter_bmi_rows(rows, filters, include_year=True, include_country=True):
    filtered = []
    for row in rows:
        if filters["bmi"] and row["bmi"] != filters["bmi"]:
            continue
        if filters["sex"] and row["sex"] != filters["sex"]:
            continue
        if filters["age"] and row["age"] != filters["age"]:
            continue
        if filters["education"] and row["education"] != filters["education"]:
            continue
        if include_year and filters["year"] and row["year"] != filters["year"]:
            continue
        if include_country and filters["country"] and row["countryCode"] != filters["country"]:
            continue
        filtered.append(row)
    return filtered


def _bmi_filters_from_request():
    return {
        key: request.args.get(key, value)
        for key, value in DEFAULT_BMI_FILTERS.items()
    }


@ivan_bp.route("/bmi-options")
def bmi_options():
    rows = _read_bmi_rows()
    years = sorted({row["year"] for row in rows if row["year"]})
    return jsonify(
        {
            "defaults": DEFAULT_BMI_FILTERS,
            "options": {
                "bmi": _option_list(rows, "bmi", "bmiLabel"),
                "sex": _option_list(rows, "sex", "sexLabel"),
                "age": _option_list(rows, "age", "ageLabel"),
                "education": _option_list(rows, "education", "educationLabel"),
                "country": _option_list(rows, "countryCode", "country"),
                "year": [{"value": year, "label": year} for year in years],
            },
        }
    )


@ivan_bp.route("/bmi-data")
def bmi_data():
    rows = _read_bmi_rows()
    filters = _bmi_filters_from_request()
    chart_type = request.args.get("view", "bar")

    if chart_type == "line":
        records = _filter_bmi_rows(rows, filters, include_year=False, include_country=True)
        records.sort(key=lambda row: row["year"])
    else:
        records = _filter_bmi_rows(rows, filters, include_year=True, include_country=False)
        records.sort(key=lambda row: row["value"], reverse=True)

    return jsonify({"filters": filters, "records": records})
