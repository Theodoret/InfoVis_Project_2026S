import os
import json
import numpy as np
import pandas as pd
from flask import Blueprint, render_template, send_from_directory

theo_bp = Blueprint(
    "theo",
    __name__,
    url_prefix="/theo",
    template_folder="templates",
    static_folder="static",
)

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_DATA_DIR = os.path.join(_BASE_DIR, "data")


@theo_bp.route("/data/<path:filename>")
def data_file(filename):
    return send_from_directory(_DATA_DIR, filename)


@theo_bp.route("/")
def page():
    return data()


def data():
    root_dir = os.path.abspath(os.path.join(_BASE_DIR, "..", ".."))

    gdp_path = os.path.join(root_dir, "data", "API_NY.GDP.MKTP.CD_DS2_en_csv_v2_252769.csv")
    ess_path = os.path.join(_DATA_DIR, "ess_country_year.csv")

    gdp_df = pd.read_csv(gdp_path, skiprows=4)
    year_cols = [c for c in gdp_df.columns if str(c).isdigit() and 2002 <= int(c) <= 2022]
    gdp_df = gdp_df[["Country Name", "Country Code"] + year_cols]
    gdp_df = gdp_df.melt(
        id_vars=["Country Name", "Country Code"],
        var_name="year",
        value_name="gdp_usd",
    )
    gdp_df["year"] = pd.to_numeric(gdp_df["year"], errors="coerce")
    gdp_df["gdp_usd"] = pd.to_numeric(gdp_df["gdp_usd"], errors="coerce")
    gdp_df = gdp_df.dropna(subset=["year", "gdp_usd"])

    ess_df = pd.read_csv(ess_path)
    ess_df["year"] = pd.to_numeric(ess_df["year"], errors="coerce")
    ess_df = ess_df[
        [
            "Country Code",
            "Country Name",
            "year",
            "wkhtot",
            "tvtot_hours",
            "sclmeet",
        ]
    ]

    merged_df = gdp_df.merge(ess_df, on=["Country Code", "year"], how="inner")
    if "Country Name_y" in merged_df.columns:
        merged_df["Country Name"] = merged_df["Country Name_x"].fillna(merged_df["Country Name_y"])
        merged_df = merged_df.drop(columns=["Country Name_x", "Country Name_y"])
    merged_df = merged_df.dropna(subset=["gdp_usd", "wkhtot", "tvtot_hours", "sclmeet"])
    merged_df = merged_df.sort_values(["year", "Country Name"])

    years = sorted(merged_df["year"].dropna().astype(int).unique().tolist())

    pca_rows = []
    pca_features = ["gdp_usd", "wkhtot", "tvtot_hours", "sclmeet"]
    for year, group in merged_df.groupby("year"):
        year_df = group.dropna(subset=pca_features).copy()
        if len(year_df) < 2:
            continue

        x = year_df[pca_features].to_numpy(dtype=float).copy()
        x[:, 0] = np.log10(x[:, 0] + 1.0)

        means = x.mean(axis=0)
        stds = x.std(axis=0)
        stds[stds == 0] = 1.0
        x_std = (x - means) / stds

        _, _, vt = np.linalg.svd(x_std, full_matrices=False)
        scores = x_std @ vt[:2].T

        for i, row in year_df.reset_index(drop=True).iterrows():
            pca_rows.append({
                "year": int(year),
                "Country Name": row["Country Name"],
                "Country Code": row["Country Code"],
                "pc1": float(scores[i, 0]),
                "pc2": float(scores[i, 1]),
            })

    return render_template(
        "theo/index.html",
        member_name="Activities",
        merged_data=merged_df.to_json(orient="records"),
        available_years=json.dumps(years),
        pca_data=json.dumps(pca_rows),
    )
