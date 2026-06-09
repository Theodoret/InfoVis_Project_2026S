from __future__ import annotations

import csv
from functools import lru_cache
from pathlib import Path


class WorldBankWideCsvDataset:
    def __init__(
        self,
        path: Path,
        *,
        country_name_column: str = "Country Name",
        country_code_column: str = "Country Code",
        value_key: str = "value",
    ) -> None:
        self.path = Path(path)
        self.country_name_column = country_name_column
        self.country_code_column = country_code_column
        self.value_key = value_key

    def years(self) -> list[str]:
        header, _ = _read_wide_csv(str(self.path), self.country_name_column)
        return sorted((value for value in header if value.isdigit()), key=int)

    def records_for_year(self, year: str) -> tuple[str, list[dict]]:
        requested_year = str(year).strip()
        header, rows = _read_wide_csv(str(self.path), self.country_name_column)

        if not header:
            return requested_year, []

        numeric_years = [int(value) for value in header if value.isdigit()]
        if not numeric_years:
            return requested_year, []

        if requested_year not in header:
            requested_year = str(max(numeric_years))

        records = self._records_for_column(header, rows, requested_year)
        if records:
            return requested_year, records

        for fallback_year in sorted(numeric_years, reverse=True):
            fallback_year = str(fallback_year)
            fallback_records = self._records_for_column(header, rows, fallback_year)
            if fallback_records:
                return fallback_year, fallback_records

        return requested_year, []

    def _records_for_column(self, header: list[str], rows: list[list[str]], year: str) -> list[dict]:
        year_index = header.index(year)
        name_index = header.index(self.country_name_column)
        code_index = header.index(self.country_code_column)
        records = []

        for row in rows:
            if len(row) <= year_index:
                continue

            country_name = row[name_index].strip() if len(row) > name_index else ""
            country_code = row[code_index].strip() if len(row) > code_index else ""
            raw_value = row[year_index].strip()

            if not country_name or not country_code or not raw_value:
                continue

            try:
                value = float(raw_value)
            except ValueError:
                continue

            records.append(
                {
                    "country": country_name,
                    "countryCode": country_code,
                    self.value_key: value,
                }
            )

        return records


@lru_cache(maxsize=8)
def _read_wide_csv(path: str, header_marker: str) -> tuple[list[str], list[list[str]]]:
    csv_path = Path(path)
    if not csv_path.exists():
        return [], []

    with csv_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.reader(csv_file)
        header = None
        for row in reader:
            if row and row[0] == header_marker:
                header = row
                break

        if not header:
            return [], []

        return header, list(reader)
