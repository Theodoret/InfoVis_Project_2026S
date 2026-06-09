Ivan's data folder.

Place any CSV/JSON or other data files here that are specific to Ivan's visualizations.

This folder is kept under version control (contains .gitkeep) so collaborators can add files.

## Adding another Eurostat CSV

Eurostat SDMX-CSV files with columns like `OBS_VALUE`, `TIME_PERIOD`, `geo`, `sex`,
`age`, and label columns can reuse `common/eurostat.py`.

Backend pattern:

```python
from common.eurostat import EurostatCsvDataset, EurostatDimension

DATASET = EurostatCsvDataset(
    PATH_TO_CSV,
    (
        EurostatDimension("sex", "sex", "Sex", "sex", "sexLabel"),
        EurostatDimension("age", "age", "Age class", "age", "ageLabel"),
        EurostatDimension("country", "geo", "Geopolitical entity (reporting)", "countryCode", "country"),
    ),
)
```

Expose two routes:

- options route: `{"defaults": ..., "options": DATASET.options()}`
- data route: `DATASET.filtered_records(filters, include_year=..., include_dimensions=...)`

Frontend pattern:

- Use `eurostat_explorer.js` for tabs, filters, and data loading.
- Use `charts.js` for line and horizontal bar charts.
- Use `map.js` plus `country_codes.js` for country maps.

## Adding GDP correlation

Use `common/correlation.py` to compare a Eurostat country-level indicator with GDP.
For a dataset with several numeric categories, keep the category dimension unfiltered and
pass it as `variable_key`.

```python
from common.correlation import build_gdp_correlation_payload

indicator_records = DATASET.filtered_records(
    filters,
    include_year=True,
    include_dimensions=("sex", "age", "country"),  # leave the variable dimension out
)
_, gdp_records = GDP_DATASET.records_for_year(filters["year"])
payload = build_gdp_correlation_payload(
    gdp_records=gdp_records,
    indicator_records=indicator_records,
    variable_key="yourVariableCode",
    variable_label_key="yourVariableLabel",
    selected_variable=filters.get("yourVariableCode"),
)
```

The payload includes:

- `correlations`: Pearson table, sorted strongest to weakest.
- `scatter.points`: country-level points for the selected variable.
- `scatter.trend`: a simple linear trend line for the scatter plot.
