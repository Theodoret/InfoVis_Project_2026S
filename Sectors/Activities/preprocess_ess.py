"""
Combine ESS survey waves, clean wkhtot / tvtot / sclmeet, aggregate by country-year,
and impute missing years with time-based linear interpolation.
"""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_CSV = DATA_DIR / "ess_country_year.csv"

# ESS collection year by round (round 2 not in this repository).
ESS_ROUND_YEAR = {
    1: 2002,
    2: 2004,
    3: 2006,
    4: 2008,
    5: 2010,
    6: 2012,
    7: 2014,
    8: 2016,
    9: 2018,
    10: 2020,
    11: 2022,
}

ISO2_TO_ISO3 = {
    "AL": "ALB", "AT": "AUT", "BE": "BEL", "BG": "BGR", "CH": "CHE", "CY": "CYP", "CZ": "CZE",
    "DE": "DEU", "DK": "DNK", "EE": "EST", "EL": "GRC", "ES": "ESP", "FI": "FIN", "FR": "FRA",
    "GB": "GBR", "GR": "GRC", "HR": "HRV", "HU": "HUN", "IE": "IRL", "IL": "ISR", "IS": "ISL",
    "IT": "ITA", "LT": "LTU", "LU": "LUX", "LV": "LVA", "ME": "MNE", "MK": "MKD", "MT": "MLT",
    "NL": "NLD", "NO": "NOR", "PL": "POL", "PT": "PRT", "RO": "ROU", "RS": "SRB", "SE": "SWE",
    "SI": "SVN", "SK": "SVK", "UK": "GBR",
}

COUNTRY_NAMES = {
    "ALB": "Albania", "AUT": "Austria", "BEL": "Belgium", "BGR": "Bulgaria", "CHE": "Switzerland",
    "CYP": "Cyprus", "CZE": "Czechia", "DEU": "Germany", "DNK": "Denmark", "EST": "Estonia",
    "GRC": "Greece", "ESP": "Spain", "FIN": "Finland", "FRA": "France", "GBR": "United Kingdom",
    "HRV": "Croatia", "HUN": "Hungary", "IRL": "Ireland", "ISL": "Iceland", "ITA": "Italy",
    "LTU": "Lithuania", "LUX": "Luxembourg", "LVA": "Latvia", "MLT": "Malta", "NLD": "Netherlands",
    "NOR": "Norway", "POL": "Poland", "PRT": "Portugal", "ROU": "Romania", "SRB": "Serbia",
    "SWE": "Sweden", "SVN": "Slovenia", "SVK": "Slovakia", "ISR": "Israel", "MNE": "Montenegro",
    "MKD": "North Macedonia",
}

WKHTOT_MISSING = {666, 777, 888, 999}
TVTOT_MISSING = {77, 88, 99}
SCLMEET_MISSING = {77, 88, 99}

# Midpoint hours for tvtot categories (weekday average).
TVTOT_TO_HOURS = {
    0: 0.0,
    1: 0.25,
    2: 0.75,
    3: 1.25,
    4: 1.75,
    5: 2.25,
    6: 2.75,
    7: 3.5,
}

USECOLS = [
    "essround", "cntry", "wkhtot", "tvtot", "sclmeet",
    "pweight", "anweight", "dweight",
]


def list_ess_datasets() -> list[Path]:
    """Return one CSV per ESS round, preferring full surveys over MD/SC variants."""
    folders = sorted(p for p in DATA_DIR.iterdir() if p.is_dir() and p.name.startswith("ESS"))
    by_round: dict[int, Path] = {}
    for folder in folders:
        match = re.search(r"ESS(\d+)", folder.name)
        if not match:
            continue
        round_id = int(match.group(1))
        csv_path = next(folder.glob("*.csv"), None)
        if csv_path is None:
            continue
        current = by_round.get(round_id)
        if current is None:
            by_round[round_id] = csv_path
            continue
        # Prefer standard edition over MD (metadata) or SC (country module).
        def priority(path: Path) -> int:
            name = path.parent.name
            if "MD" in name or "SC" in name:
                return 2
            return 0

        if priority(csv_path) < priority(current):
            by_round[round_id] = csv_path
    return [by_round[k] for k in sorted(by_round)]


def clean_wkhtot(series: pd.Series) -> pd.Series:
    values = pd.to_numeric(series, errors="coerce")
    values = values.mask(values.isin(WKHTOT_MISSING))
    values = values.mask((values < 0) | (values > 112))
    return values


def clean_tvtot(series: pd.Series) -> pd.Series:
    values = pd.to_numeric(series, errors="coerce").astype("Int64")
    values = values.mask(values.isin(TVTOT_MISSING))
    values = values.mask(~values.between(0, 7))
    return values.map(TVTOT_TO_HOURS)


def clean_sclmeet(series: pd.Series) -> pd.Series:
    values = pd.to_numeric(series, errors="coerce")
    values = values.mask(values.isin(SCLMEET_MISSING))
    values = values.mask(~values.between(1, 7))
    return values


def weighted_mean(values: pd.Series, weights: pd.Series) -> float:
    mask = values.notna() & weights.notna() & (weights > 0)
    if not mask.any():
        return np.nan
    v = values[mask].astype(float)
    w = weights[mask].astype(float)
    return float(np.average(v, weights=w))


def load_round(csv_path: Path) -> pd.DataFrame:
    header = pd.read_csv(csv_path, nrows=0).columns
    usecols = [c for c in USECOLS if c in header]
    df = pd.read_csv(csv_path, usecols=usecols, low_memory=False)

    weight_col = "anweight" if "anweight" in df.columns else (
        "pweight" if "pweight" in df.columns else "dweight"
    )
    if weight_col not in df.columns:
        df["weight"] = 1.0
    else:
        df["weight"] = pd.to_numeric(df[weight_col], errors="coerce")

    df["essround"] = pd.to_numeric(df["essround"], errors="coerce").astype("Int64")
    df["year"] = df["essround"].map(ESS_ROUND_YEAR)
    df["cntry"] = df["cntry"].astype(str).str.upper().str.strip()
    df["Country Code"] = df["cntry"].map(ISO2_TO_ISO3)
    df["Country Name"] = df["Country Code"].map(COUNTRY_NAMES)

    if "wkhtot" in df.columns:
        df["wkhtot"] = clean_wkhtot(df["wkhtot"])
    if "tvtot" in df.columns:
        df["tvtot_hours"] = clean_tvtot(df["tvtot"])
    else:
        df["tvtot_hours"] = np.nan
    if "sclmeet" in df.columns:
        df["sclmeet"] = clean_sclmeet(df["sclmeet"])

    return df


def aggregate_country_year(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for (country_code, year), group in df.groupby(["Country Code", "year"], dropna=True):
        if pd.isna(country_code) or pd.isna(year):
            continue
        rows.append({
            "Country Code": country_code,
            "Country Name": group["Country Name"].dropna().iloc[0] if group["Country Name"].notna().any() else country_code,
            "year": int(year),
            "wkhtot": weighted_mean(group["wkhtot"], group["weight"]) if "wkhtot" in group else np.nan,
            "tvtot_hours": weighted_mean(group["tvtot_hours"], group["weight"]) if "tvtot_hours" in group else np.nan,
            "sclmeet": weighted_mean(group["sclmeet"], group["weight"]) if "sclmeet" in group else np.nan,
            "n_respondents": int(len(group)),
        })
    return pd.DataFrame(rows)


def impute_country_series(panel: pd.DataFrame, metrics: list[str]) -> pd.DataFrame:
    year_min = int(panel["year"].min())
    year_max = int(panel["year"].max())
    all_years = list(range(year_min, year_max + 1))

    out_parts = []
    for country_code, group in panel.groupby("Country Code"):
        g = group.set_index("year").reindex(all_years)
        g["Country Code"] = country_code
        g["Country Name"] = group["Country Name"].iloc[0]
        g["year"] = all_years
        g["n_respondents"] = g["n_respondents"].fillna(0)

        for metric in metrics:
            observed = g[metric].notna()
            if observed.any():
                g[metric] = g[metric].interpolate(method="linear", limit_direction="both")
            g[f"{metric}_imputed"] = (~observed) & g[metric].notna()

        out_parts.append(g.reset_index(drop=True))

    return pd.concat(out_parts, ignore_index=True)


def main() -> pd.DataFrame:
    datasets = list_ess_datasets()
    if not datasets:
        raise FileNotFoundError(f"No ESS datasets found under {DATA_DIR}")

    frames = [load_round(path) for path in datasets]
    combined = pd.concat(frames, ignore_index=True)
    aggregated = aggregate_country_year(combined)

    metrics = ["wkhtot", "tvtot_hours", "sclmeet"]
    imputed = impute_country_series(aggregated, metrics)
    imputed = imputed.sort_values(["Country Name", "year"]).reset_index(drop=True)

    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    imputed.to_csv(OUTPUT_CSV, index=False)

    print(f"ESS source files used: {len(datasets)}")
    for path in datasets:
        print(f"  - {path.parent.name}")
    print(f"Rows (country-year): {len(imputed)}")
    print(f"Years: {imputed['year'].min()} – {imputed['year'].max()}")
    print(f"Countries: {imputed['Country Code'].nunique()}")
    for metric in metrics:
        n_imp = int(imputed[f"{metric}_imputed"].sum())
        print(f"  {metric}: {imputed[metric].notna().sum()} values, {n_imp} imputed")
    print(f"Written: {OUTPUT_CSV}")
    return imputed


if __name__ == "__main__":
    main()
