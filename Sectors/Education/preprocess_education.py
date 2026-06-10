from pathlib import Path
from functools import reduce

import numpy as np
import pandas as pd


DATA_DIR = Path("Sectors/Education/data")
OUTPUT_CSV = DATA_DIR / "preprocessed_education.csv"
START_YEAR = 2000

EUROPEAN_COUNTRIES = [
    "ALB", "AND", "AUT", "BLR", "BEL", "BIH", "BGR", "HRV", "CYP", "CZE",
    "DNK", "EST", "FRO", "FIN", "FRA", "DEU", "GIB", "GRC", "HUN", "ISL",
    "IRL", "IMN", "ITA", "XKX", "LVA", "LIE", "LTU", "LUX", "MKD", "MLT",
    "MDA", "MCO", "MNE", "NLD", "NOR", "POL", "PRT", "ROU", "RUS", "SMR",
    "SRB", "SVK", "SVN", "ESP", "SWE", "CHE", "UKR", "GBR", "VAT", "RSB",
]

INDICATORS = [
    {
        "file": "expenditure.csv",
        "column": "Expenditure",
    },
    {
        "file": "Completion_Rate_Primary_Ed.csv",
        "column": "Completion Rate: Primary Education",
    },
    {
        "file": "Completion_Rate_Lower_Secondary_Ed.csv",
        "column": "Completion Rate: Lower Secondary Education",
    },
    {
        "file": "Completion_Rate_Upper_Secondary_Ed.csv",
        "column": "Completion Rate: Upper Secondary Education",
    },
]


def impute_with_linear_fit(wide_df: pd.DataFrame) -> pd.DataFrame:
    """Fill missing year values per country using a simple linear fit."""
    wide_df = wide_df.copy()
    wide_df.columns = wide_df.columns.astype(int)
    years = wide_df.columns.to_numpy(dtype=float)

    for country_code in wide_df.index:
        row = wide_df.loc[country_code]
        values = pd.to_numeric(row, errors="coerce").to_numpy(dtype=float)
        valid_mask = ~np.isnan(values)

        if valid_mask.sum() < 2:
            continue

        slope, intercept = np.polyfit(years[valid_mask], values[valid_mask], deg=1)
        missing_mask = ~valid_mask
        wide_df.loc[country_code, missing_mask] = years[missing_mask] * slope + intercept

    return wide_df


def prepare_indicator(
    input_path: Path,
    value_column: str,
    country_codes: list[str] | None = None,
    start_year: int | None = START_YEAR,
) -> pd.DataFrame:
    """Read one long-format indicator file, impute missing values, and return long format."""
    df = pd.read_csv(input_path)

    df = df.rename(
        columns={
            "geoUnit": "Country Code",
            "value": value_column,
        }
    )

    required_columns = ["Country Code", "year", value_column]
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise ValueError(f"{input_path} is missing columns: {missing_columns}")

    df = df[required_columns].copy()
    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    df[value_column] = pd.to_numeric(df[value_column], errors="coerce")
    df = df.dropna(subset=["Country Code", "year"])
    df["year"] = df["year"].astype(int)

    if country_codes is not None:
        df = df[df["Country Code"].isin(country_codes)]

    if start_year is not None:
        df = df[df["year"] >= start_year]

    wide = df.pivot_table(
        index="Country Code",
        columns="year",
        values=value_column,
        aggfunc="mean",
    ).sort_index(axis=1)

    wide = impute_with_linear_fit(wide)

    long_df = (
        wide.reset_index()
        .melt(id_vars="Country Code", var_name="year", value_name=value_column)
        .dropna(subset=[value_column])
    )
    long_df["year"] = long_df["year"].astype(int)

    return long_df


def build_preprocessed_dataset(
    data_dir: Path = DATA_DIR,
    country_codes: list[str] | None = EUROPEAN_COUNTRIES,
    start_year: int | None = START_YEAR,
) -> pd.DataFrame:
    """Build the merged indicator dataset."""
    indicator_frames = []

    for indicator in INDICATORS:
        frame = prepare_indicator(
            input_path=data_dir / indicator["file"],
            value_column=indicator["column"],
            country_codes=country_codes,
            start_year=start_year,
        )
        indicator_frames.append(frame)

    merged = reduce(
        lambda left, right: pd.merge(left, right, on=["Country Code", "year"], how="outer"),
        indicator_frames,
    )

    merged = merged.sort_values(["Country Code", "year"]).reset_index(drop=True)
    return merged


def main() -> None:
    df = build_preprocessed_dataset()

    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_CSV, index=False)

    print(f"Rows: {len(df)}")
    print(f"Columns: {list(df.columns)}")
    print(f"Saved CSV: {OUTPUT_CSV}")

if __name__ == "__main__":
    main()
