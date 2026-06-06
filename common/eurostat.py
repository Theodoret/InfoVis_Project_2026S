from __future__ import annotations

import csv
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class EurostatDimension:
    key: str
    code_column: str
    label_column: str
    record_code_key: str
    record_label_key: str


class EurostatCsvDataset:
    def __init__(
        self,
        path: Path,
        dimensions: Iterable[EurostatDimension],
        *,
        value_column: str = "OBS_VALUE",
        year_column: str = "TIME_PERIOD",
    ) -> None:
        self.path = Path(path)
        self.dimensions = tuple(dimensions)
        self.value_column = value_column
        self.year_column = year_column

    def records(self) -> list[dict]:
        return _read_records(str(self.path), self.dimensions, self.value_column, self.year_column)

    def options(self) -> dict[str, list[dict]]:
        records = self.records()
        options = {
            dimension.key: option_list(records, dimension.record_code_key, dimension.record_label_key)
            for dimension in self.dimensions
        }
        years = sorted({record["year"] for record in records if record.get("year")})
        options["year"] = [{"value": year, "label": year} for year in years]
        return options

    def filtered_records(
        self,
        filters: dict[str, str],
        *,
        include_year: bool = True,
        include_dimensions: Iterable[str] | None = None,
    ) -> list[dict]:
        included = set(include_dimensions) if include_dimensions is not None else {dimension.key for dimension in self.dimensions}
        filtered = []

        for record in self.records():
            if include_year and filters.get("year") and record.get("year") != filters["year"]:
                continue

            matches = True
            for dimension in self.dimensions:
                if dimension.key not in included:
                    continue
                selected = filters.get(dimension.key)
                if selected and record.get(dimension.record_code_key) != selected:
                    matches = False
                    break

            if matches:
                filtered.append(record)

        return filtered


@lru_cache(maxsize=8)
def _read_records(
    path: str,
    dimensions: tuple[EurostatDimension, ...],
    value_column: str,
    year_column: str,
) -> list[dict]:
    csv_path = Path(path)
    if not csv_path.exists():
        return []

    records = []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        for row in csv.DictReader(csv_file):
            raw_value = row.get(value_column, "").strip()
            if not raw_value:
                continue

            try:
                value = float(raw_value)
            except ValueError:
                continue

            record = {
                "year": row.get(year_column, "").strip(),
                "value": value,
            }

            for dimension in dimensions:
                record[dimension.record_code_key] = row.get(dimension.code_column, "").strip()
                record[dimension.record_label_key] = row.get(dimension.label_column, "").strip()

            records.append(record)

    return records


def option_list(records: Iterable[dict], code_key: str, label_key: str) -> list[dict]:
    seen = {}
    for record in records:
        code = record.get(code_key, "")
        label = record.get(label_key, "") or code
        if code and code not in seen:
            seen[code] = label

    return [{"value": code, "label": label} for code, label in sorted(seen.items(), key=lambda item: item[1])]
