# European Indicators Dashboard

This project is a Flask and D3 dashboard for comparing European country-level indicators with GDP. It combines GDP, healthcare, education, and activities data into one page and provides maps, line charts, bar charts, scatter plots, standardized scores, and a summary radar chart.

The main idea is:

```text
country indicator data + GDP data -> comparable country views -> Pearson correlation analysis
```

The app is built to be modular. Healthcare, Education, and Activities each register their own datasets, while shared logic for loading data, filtering, maps, standardization, and correlation lives in `common` and `static`.

## Dashboard Layout

The whole project is shown on one page: `templates/index.html`.

The page order is:

1. GDP map
2. Healthcare indicators
3. Education indicators
4. Activities indicators
5. Summary Analysis

Each sector uses the same explorer pattern:

- Line chart
- Bar chart
- Map
- Correlation with GDP

The Summary Analysis section is placed at the bottom and compares all selected indicators with GDP through a radar chart.

## Project Structure

```text
app.py
templates/index.html
common/
static/
Sectors/
data/
```

Important files:

- `app.py`: creates the Flask app, registers sector blueprints, and registers Summary Analysis indicators.
- `templates/index.html`: single dashboard page.
- `common/sector_indicators.py`: shared indicator loading, filtering, GDP options, standardization, and combined score logic.
- `common/correlation.py`: Pearson correlation and scatter trend line calculations.
- `common/summary_analysis.py`: Summary Analysis calculations and radar payloads.
- `common/world_bank.py`: loader for World Bank style wide CSV files.
- `common/eurostat.py`: loader for Eurostat CSV files.
- `common/country_codes.py`: country code matching and Eurostat-to-ISO mappings.
- `static/js/map.js`: reusable choropleth map component.
- `static/js/legend.js`: reusable legend component.
- `static/js/controls.js`: shared controls.
- `static/js/microstate_callouts.js`: callouts for very small countries on maps.
- `static/js/eurostat_explorer.js`: shared explorer behavior.
- `static/js/country_indicator_explorer.js`: reusable explorer for non-Eurostat country indicators.
- `static/js/bmi_explorer.js`: BMI-specific compatibility layer.
- `static/js/standardization_controls.js`: raw/0-1 score controls, multi-select dropdowns, and saved directions.
- `static/js/summary_analysis.js`: Summary Analysis controls and radar chart.
- `static/css/dashboard.css`: main dashboard styling.

## Data Sources

### GDP

GDP data is stored in:

- `data/europe_gdp.csv`
- `data/europe_gdp_per_capita.csv`

These files are based on World Bank style wide CSVs. Years are columns and countries are rows.

The preprocessing script is:

```text
preprocess_europe_gdp.py
```

The dashboard lets the user switch between:

- GDP
- GDP per capita

Both are handled through the same shared GDP metric system in `common/sector_indicators.py`.

### Healthcare

Healthcare data lives in `Sectors/Healthcare/data`.

Registered healthcare indicators:

- Body Mass Index
- Life expectancy
- Unmet medical needs

Healthcare uses Eurostat CSV files and the shared `EurostatCsvDataset` loader. Each dataset defines dimensions such as sex, age, education, reason, BMI category, country, and year.

### Education

Education now uses one combined preprocessed file:

```text
Sectors/Education/data/preprocessed_education.csv
```

This single file contains the education metrics that used to be split across several files:

- Education expenditure
- Completion rate: primary education
- Completion rate: lower secondary education
- Completion rate: upper secondary education

The loader is `CountryIndicatorWideCsvDataset`, which reads one country/year CSV with several numeric metric columns.

The preprocessing script is:

```text
Sectors/Education/preprocess_education.py
```

### Activities

Activities data uses:

```text
Sectors/Activities/data/ess_country_year.csv
```

Registered activity metrics:

- Working Hours
- TV Time
- Social Meetings

Activities also uses `CountryIndicatorWideCsvDataset`, because the file has one row per country/year and several numeric metric columns.

The preprocessing script is:

```text
Sectors/Activities/preprocess_ess.py
```

## How Data Loading Works

There are three main dataset loaders.

### EurostatCsvDataset

Used for healthcare.

It reads Eurostat-style CSV rows where each row already contains:

- dimensions, such as age, sex, education, country
- `TIME_PERIOD`
- `OBS_VALUE`

Each row becomes a dashboard record:

```text
country + year + selected dimensions + numeric value
```

### CountryIndicatorWideCsvDataset

Used for Education and Activities.

It reads one wide file with:

- country code
- country name
- year
- several metric columns

Each metric column is converted into normal records with a `metric` value. This lets Education and Activities behave like the Eurostat datasets in the frontend.

### WorldBankWideCsvDataset

Used for GDP and GDP per capita.

It reads World Bank style CSVs where:

- countries are rows
- years are columns

If the requested year is missing or empty, the loader falls back to the latest year with data.

## Country Matching

All correlations are country-level. The project matches indicator rows to GDP rows by country code.

GDP data uses ISO3 country codes such as:

```text
AUT, DEU, FRA
```

Eurostat often uses different country codes such as:

```text
AT, DE, FR
```

The mapping lives in:

```text
common/country_codes.py
```

Aggregate regions are removed before country-level charts and calculations. Examples:

- European Union totals
- Euro area totals
- EEA totals
- EFTA totals

This is handled by `is_country_record` in `common/sector_indicators.py`.

## GDP Options

Most correlation views have these GDP controls:

- GDP metric: GDP or GDP per capita
- GDP year
- GDP scale: raw or `log(value)`

The default GDP year tries to match the selected indicator year. For example, if the selected indicator year is 2019, GDP also defaults to 2019.

If the indicator year filter is multi-select, the GDP year filter also supports multi-select.

When several GDP years are selected, the backend calculates the mean GDP value per country:

```text
mean_gdp = average(GDP for selected years)
```

Then that mean value is used for the correlation.

If `log(value)` is selected, the natural logarithm is applied after the mean GDP value is calculated:

```text
x = ln(mean_gdp)
```

Countries with missing GDP or non-positive GDP are excluded in log mode.

## Pearson Correlation

The project currently uses Pearson correlation only. Spearman correlation was removed from the current version.

Pearson measures how strongly two variables follow a straight-line relationship.

For GDP correlation views, each included country becomes one point:

```text
x = selected GDP value
y = selected indicator value
```

For standardized Summary Analysis, each included country becomes:

```text
x = selected GDP value
y = combined standardized country score
```

The formula is implemented in `common/correlation.py`:

```text
r = sum((x - mean_x) * (y - mean_y))
    / sqrt(sum((x - mean_x)^2) * sum((y - mean_y)^2))
```

Pearson values range from `-1` to `1`.

- `1`: strong positive linear relationship
- `-1`: strong negative linear relationship
- `0`: little or no linear relationship

The project returns no Pearson value if:

- fewer than two countries are available
- all GDP values are the same
- all indicator values are the same

Correlation tables are sorted by relationship strength:

```text
strength = abs(Pearson)
```

So `-0.80` is considered stronger than `0.40`.

## Trend Line

Scatter plots include a simple linear regression trend line.

The trend line is calculated in `linear_regression` in `common/correlation.py`.

It uses least squares:

```text
slope = sum((x - mean_x) * (y - mean_y)) / sum((x - mean_x)^2)
intercept = mean_y - slope * mean_x
```

The frontend draws the line from the minimum x value to the maximum x value.

## Raw Values vs 0-1 Scores

Each explorer can show either:

- raw values
- standardized 0-1 scores

Raw values are the original numbers from the dataset, such as percentages, years, or activity measures.

The 0-1 score mode makes different indicators comparable.

## Min-Max Standardization

Standardization is calculated in `common/sector_indicators.py`.

For each comparable slice, values are scaled across countries:

```text
normalized = (value - minimum) / (maximum - minimum)
```

This produces values from `0` to `1`.

If all countries have the same value, there is no meaningful minimum-to-maximum spread. In that case the project uses:

```text
normalized = 0.5
```

### Comparable Slices

The project does not normalize unrelated records together.

For example, BMI is compared inside a slice such as:

```text
BMI category + sex + age + education + year
```

Life expectancy is compared inside a slice such as:

```text
sex + age + year
```

Education is compared inside a slice such as:

```text
metric + year
```

Activities is compared inside a slice such as:

```text
metric + year
```

Each slice is normalized across countries only.

## Positive and Negative Directions

After min-max scaling, the project makes every standardized value point in the same direction:

```text
0 = worse
1 = better
```

The user can manually choose whether each filter option is positive or negative.

Positive means:

```text
score = normalized
```

Negative means:

```text
score = 1 - normalized
```

Examples:

- Life expectancy is usually positive, because higher is better.
- Unmet medical needs are usually negative, because higher unmet need is worse.
- BMI depends on the category. Normal weight can be positive, while obesity or underweight can be negative.
- Working hours and TV time are treated as negative by default in Summary Analysis.
- Social meetings are treated as positive by default.

The per-option direction choices are saved in browser `localStorage`, so they survive page reloads.

## Multi-Select and Combined Score

Multi-select is enabled when 0-1 score mode is selected.

In 0-1 score mode, the project automatically combines selected filter values. There is no separate combine button.

The backend first calculates a standardized value for every selected slice. Then it groups by country and calculates the mean:

```text
combined_country_score = mean(selected standardized scores for that country)
```

Every selected standardized value contributes equally.

Example:

If BMI has selected:

```text
Normal, Obese, Overweight
```

then the country score is the mean of the standardized scores for those selected BMI categories, using each option's saved positive or negative direction.

## Correlation with GDP Tab

Every sector explorer has a "Correlation with GDP" tab.

This tab contains:

- a scatter plot
- a Pearson result card
- a correlation table
- filters for the selected indicator
- GDP metric, GDP year, and GDP scale controls

The scatter plot uses country flags as dots. There is also a "Spread overlaps" option, which slightly separates points that would otherwise sit on top of each other visually.

The correlation table has a Variable selector. This lets the user choose which dimension is tested against GDP. For example:

- BMI category
- age
- sex
- reason
- metric

In standardized mode, the table shows the combined score because all selected options are already merged into one country score.

## Maps

Maps use the shared map component in:

```text
static/js/map.js
```

The same map system is used for GDP, Healthcare, Education, and Activities.

The legend system lives in:

```text
static/js/legend.js
```

Small countries can be hard to see on a Europe map, so the project includes a modular callout component:

```text
static/js/microstate_callouts.js
```

This is used to show small-country callouts for places such as Monaco, Andorra, San Marino, Liechtenstein, Malta, and Vatican City where data and map geometry allow it.

## Summary Analysis

Summary Analysis is the cross-sector analysis section.

It compares selected standardized indicators with GDP and visualizes correlation strength with a radar chart.

The selectable Summary indicators are registered in `app.py`:

Healthcare:

- Body Mass Index
- Life expectancy
- Unmet medical needs

Education:

- Education expenditure
- Completion rate: primary education
- Completion rate: lower secondary education
- Completion rate: upper secondary education

Activities:

- Working Hours
- TV Time
- Social Meetings

The Summary section uses the same 0-1 score logic as the individual explorers.

By default, Summary filters select all values for the selected indicator. The user can narrow those values with checkbox dropdowns and can set positive or negative direction per option.

Summary selections are saved per indicator in browser `localStorage`. This means BMI can remember one set of filters while TV Time remembers another.

GDP Year is also saved separately per Summary indicator. GDP metric and GDP scale are shared Summary controls.

## Summary Pearson Score

For the selected Summary indicator, the backend:

1. Reads the selected indicator records.
2. Applies all selected filter values.
3. Applies per-option positive or negative directions.
4. Normalizes values to 0-1.
5. Combines selected values into one country score.
6. Joins those country scores to selected GDP values.
7. Calculates Pearson correlation.

The calculation uses one point per country:

```text
x = GDP or GDP per capita
y = combined standardized country score
```

The result is shown as the Pearson score.

## Summary Radar Chart

The radar chart replaces the old country list in Summary Analysis.

It calculates a Pearson score for every registered Summary indicator and plots the absolute value:

```text
radar_value = abs(Pearson)
```

So:

```text
-0.68 becomes 0.68
0.42 stays 0.42
```

This means the radar shows relationship strength, not relationship direction.

The radar is visually divided into three sectors:

- Healthcare
- Education
- Activities

Each sector contains its own indicators. The chart uses a Europe map background image and shared saved filter settings for each indicator.

## Saved Settings

Several user choices are saved in browser `localStorage`.

Saved settings include:

- raw values or 0-1 score mode
- selected multi-select filter values
- per-option positive/negative directions
- Summary filter selections per indicator
- Summary GDP year per indicator
- shared Summary GDP metric and GDP scale
- overlap spreading on scatter plots

Because this is browser storage, settings are saved on the same machine and browser. They are not stored in the Flask backend database.

## Frontend Components

The frontend is built from reusable JavaScript pieces.

Important components:

- `gdp_map.js`: GDP map controller.
- `map.js`: reusable country choropleth renderer.
- `legend.js`: reusable gradient legend.
- `controls.js`: reusable slider/select helpers.
- `charts.js`: line, bar, scatter, and shared chart drawing helpers.
- `eurostat_explorer.js`: core explorer behavior for Eurostat-like indicators.
- `country_indicator_explorer.js`: explorer behavior for country indicator datasets.
- `standardization_controls.js`: multi-select dropdowns and direction controls.
- `summary_analysis.js`: Summary filters, Pearson cards, and radar chart.

The chart design is intentionally consistent across sectors, so new indicators can plug into the same UI pattern.

## Backend Routes

Main page:

```text
GET /
```

GDP data:

```text
GET /healthcare/gdp-data
GET /education/gdp-data
GET /activities/gdp-data
```

Indicator explorer endpoints:

```text
GET /healthcare/eurostat/<indicator_key>/options
GET /healthcare/eurostat/<indicator_key>/data
GET /healthcare/eurostat/<indicator_key>/gdp-correlation

GET /education/eurostat/<indicator_key>/options
GET /education/eurostat/<indicator_key>/data
GET /education/eurostat/<indicator_key>/gdp-correlation

GET /activities/eurostat/<indicator_key>/options
GET /activities/eurostat/<indicator_key>/data
GET /activities/eurostat/<indicator_key>/gdp-correlation
```

Summary Analysis endpoints:

```text
GET  /summary-analysis/options
GET  /summary-analysis/data
POST /summary-analysis/radar
```

## How to Run

Create and activate a Python environment:

```bash
python -m venv .venv
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the Flask app:

```bash
python app.py
```

Then open the local Flask URL shown in the terminal. It is usually:

```text
http://127.0.0.1:5000
```

If the server is already running and backend files or templates changed, restart the server.

## How to Add a New Indicator

The easiest path is to make the new data look like the existing modular datasets.

### Option 1: Eurostat-style long CSV

Use this shape when every row already has dimensions and one observation value:

```text
country, year, dimension columns, OBS_VALUE
```

Then register it with:

```text
EurostatCsvDataset
```

### Option 2: Country/year wide CSV

Use this shape when one file has several numeric metric columns:

```text
Country Code, Country Name, year, metric_a, metric_b, metric_c
```

Then register it with:

```text
CountryIndicatorWideCsvDataset
```

### Registration Steps

1. Put the preprocessed CSV into the correct sector data folder.
2. Define the dataset in the sector `__init__.py`.
3. Define dimensions and default filters.
4. Add the indicator to the sector registry.
5. Add a frontend explorer config in `templates/index.html` if it needs a visible section.
6. Add it to `SUMMARY_ANALYSIS_DATASETS` in `app.py` if it should appear in Summary Analysis.
7. Add default positive/negative direction behavior in `common/summary_analysis.py` if the indicator has clear "higher is worse" values.

## Important Calculation Notes

- Pearson is calculated only from countries that have both GDP and indicator values.
- GDP and GDP per capita use the same correlation logic.
- GDP year can be independent from indicator year.
- Multi-year GDP selection is averaged per country before correlation.
- `log(value)` uses the natural logarithm.
- Standardized values always mean `0 = worse` and `1 = better`.
- Negative indicators are inverted after min-max scaling.
- Combined score is the mean of selected standardized values per country.
- Summary radar uses absolute Pearson, so it shows strength rather than direction.
- Spearman is not calculated in the current project.

## Development Notes

The project is designed so most future work should happen through registration rather than duplicated chart code.

For a new country-level indicator, prefer:

- preprocessing once into a clean CSV
- registering the dataset in the sector
- using shared explorer endpoints
- using shared chart and map components
- adding only small dataset-specific defaults where needed

That keeps the dashboard consistent and avoids rebuilding maps, legends, filters, correlations, or standardization logic for every new dataset.
