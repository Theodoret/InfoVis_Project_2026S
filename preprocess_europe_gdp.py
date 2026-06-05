from __future__ import annotations

import csv
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent
RAW_CSV = ROOT / "data" / "API_NY.GDP.MKTP.CD_DS2_en_csv_v2_252769.csv"
OUTPUT_CSV = ROOT / "data" / "europe_gdp.csv"

# European countries and nearby transcontinental countries we want to keep on the map.
# This is intentionally conservative so only Europe remains in the preprocessed file.
EUROPEAN_ISO3_CODES = {
    "ALB", "AND", "ARM", "AUT", "AZE", "BEL", "BGR", "BIH", "BLR", "CHE", "CYP",
    "CZE", "DEU", "DNK", "ESP", "EST", "FIN", "FRA", "GBR", "GEO", "GRC", "HRV",
    "HUN", "IRL", "ISL", "ITA", "LIE", "LTU", "LUX", "LVA", "MCO", "MDA", "MKD",
    "MLT", "MNE", "NLD", "NOR", "POL", "PRT", "ROU", "RUS", "SMR", "SRB", "SVK",
    "SVN", "SWE", "TUR", "UKR", "VAT", "XKX",
}


def find_header_row(path: Path) -> int:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        for index, row in enumerate(reader):
            if row and row[0] == "Country Name":
                return index
    raise RuntimeError("Could not find the CSV header row.")


def build_europe_gdp(raw_path: Path, output_path: Path) -> None:
    if not raw_path.exists():
        raise FileNotFoundError(f"Raw GDP CSV not found: {raw_path}")

    header_row = find_header_row(raw_path)
    frame = pd.read_csv(raw_path, skiprows=header_row, encoding="utf-8-sig")

    required_columns = ["Country Name", "Country Code", "Indicator Name", "Indicator Code"]
    for column in required_columns:
        if column not in frame.columns:
            raise RuntimeError(f"Missing expected column: {column}")

    filtered = frame[frame["Country Code"].astype(str).isin(EUROPEAN_ISO3_CODES)].copy()
    filtered.sort_values(["Country Name", "Country Code"], inplace=True)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    filtered.to_csv(output_path, index=False, encoding="utf-8")
    print(f"Wrote {len(filtered)} European GDP rows to {output_path}")


if __name__ == "__main__":
    build_europe_gdp(RAW_CSV, OUTPUT_CSV)
