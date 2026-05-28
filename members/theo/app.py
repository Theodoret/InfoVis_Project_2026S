import os
import json
import pandas as pd
from flask import Blueprint, render_template

# Import your database utilities from the root common folder
from common.database import get_page_visit_count, record_page_visit

theo_bp = Blueprint(
    "theo",
    __name__,
    url_prefix="/theo",
    template_folder="templates",
    static_folder="static",
)

ISO2_TO_ISO3 = {
    "AL": "ALB", "AT": "AUT", "BE": "BEL", "BG": "BGR", "CH": "CHE", "CY": "CYP", "CZ": "CZE",
    "DE": "DEU", "DK": "DNK", "EE": "EST", "EL": "GRC", "ES": "ESP", "FI": "FIN", "FR": "FRA",
    "HR": "HRV", "HU": "HUN", "IE": "IRL", "IS": "ISL", "IT": "ITA", "LT": "LTU", "LU": "LUX",
    "LV": "LVA", "MT": "MLT", "NL": "NLD", "NO": "NOR", "PL": "POL", "PT": "PRT", "RO": "ROU",
    "RS": "SRB", "SE": "SWE", "SI": "SVN", "SK": "SVK", "UK": "GBR",
}


@theo_bp.route('/')
def page():
    # 1. Gather your visitor stats
    record_page_visit("Theo")
    visit_count = get_page_visit_count("Theo")

    # 2. Add 'return' and pass the visit count into your data function
    return data(visit_count)


# Update your data function signature to accept visit_count
def data(visit_count):
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    ROOT_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))
    STATIC_DATA_DIR = os.path.join(BASE_DIR, "static", "data")

    gdp_path = os.path.join(ROOT_DIR, "data", "API_NY.GDP.MKTP.CD_DS2_en_csv_v2_252769.csv")
    culture_path = os.path.join(STATIC_DATA_DIR, "ilc_scp04.csv")
    social_path = os.path.join(STATIC_DATA_DIR, "ilc_scp12.csv")
    volunteering_path = os.path.join(STATIC_DATA_DIR, "ilc_scp20.csv")

    gdp_df = pd.read_csv(gdp_path, skiprows=4)
    gdp_df = gdp_df[["Country Name", "Country Code"] + [str(y) for y in range(2015, 2026)]]
    gdp_df = gdp_df.melt(
        id_vars=["Country Name", "Country Code"],
        var_name="year",
        value_name="gdp_usd"
    )
    gdp_df["year"] = pd.to_numeric(gdp_df["year"], errors="coerce")
    gdp_df["gdp_usd"] = pd.to_numeric(gdp_df["gdp_usd"], errors="coerce")
    gdp_df = gdp_df.dropna(subset=["year", "gdp_usd"])

    culture_df = pd.read_csv(culture_path)
    culture_df = culture_df[
        (culture_df["acl00"] == "AC52A")
        & (culture_df["frequenc"] == "GE1")
        & (culture_df["geo"].str.len() == 2)
    ][["geo", "TIME_PERIOD", "OBS_VALUE"]].copy()
    culture_df["Country Code"] = culture_df["geo"].map(ISO2_TO_ISO3)
    culture_df["year"] = pd.to_numeric(culture_df["TIME_PERIOD"], errors="coerce")
    culture_df["culture_sport_pct"] = pd.to_numeric(culture_df["OBS_VALUE"], errors="coerce")
    culture_df = culture_df.dropna(subset=["Country Code", "year", "culture_sport_pct"])
    culture_df = culture_df[["Country Code", "year", "culture_sport_pct"]]

    social_df = pd.read_csv(social_path)
    social_df = social_df[
        (social_df["pers_cat"] == "FRD")
        & (social_df["frequenc"] == "WEEK")
        & (social_df["geo"].str.len() == 2)
    ][["geo", "TIME_PERIOD", "OBS_VALUE"]].copy()
    social_df["Country Code"] = social_df["geo"].map(ISO2_TO_ISO3)
    social_df["year"] = pd.to_numeric(social_df["TIME_PERIOD"], errors="coerce")
    social_df["social_contacts_pct"] = pd.to_numeric(social_df["OBS_VALUE"], errors="coerce")
    social_df = social_df.dropna(subset=["Country Code", "year", "social_contacts_pct"])
    social_df = social_df[["Country Code", "year", "social_contacts_pct"]]

    volunteering_df = pd.read_csv(volunteering_path)
    volunteering_df = volunteering_df[
        (volunteering_df["acl00"] == "AC43A")
        & (volunteering_df["geo"].str.len() == 2)
    ][["geo", "TIME_PERIOD", "OBS_VALUE"]].copy()
    volunteering_df["Country Code"] = volunteering_df["geo"].map(ISO2_TO_ISO3)
    volunteering_df["year"] = pd.to_numeric(volunteering_df["TIME_PERIOD"], errors="coerce")
    volunteering_df["volunteering_citizenship_pct"] = pd.to_numeric(volunteering_df["OBS_VALUE"], errors="coerce")
    volunteering_df = volunteering_df.dropna(subset=["Country Code", "year", "volunteering_citizenship_pct"])
    volunteering_df = volunteering_df[["Country Code", "year", "volunteering_citizenship_pct"]]

    merged_df = gdp_df.merge(culture_df, on=["Country Code", "year"], how="inner")
    merged_df = merged_df.merge(social_df, on=["Country Code", "year"], how="inner")
    merged_df = merged_df.merge(volunteering_df, on=["Country Code", "year"], how="inner")
    merged_df = merged_df.dropna(
        subset=["gdp_usd", "culture_sport_pct", "social_contacts_pct", "volunteering_citizenship_pct"]
    )

    merged_df = merged_df.sort_values(["year", "Country Name"])
    culture_years = set(culture_df["year"].dropna().astype(int).unique().tolist())
    social_years = set(social_df["year"].dropna().astype(int).unique().tolist())
    volunteering_years = set(volunteering_df["year"].dropna().astype(int).unique().tolist())
    years = sorted(culture_years.intersection(social_years).intersection(volunteering_years))

    return render_template(
        "theo/index.html",
        member_name="Theo",
        visit_count=visit_count,
        merged_data=merged_df.to_json(orient="records"),
        available_years=json.dumps(years)
    )