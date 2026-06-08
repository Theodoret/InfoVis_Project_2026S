# InfoVis Project 2026S (Flask)

## Project structure

- `app.py`: app entrypoint, main route, blueprint registration.
- `Sectors/Healthcare`: healthcare datasets and routes.
- `Sectors/Education`: education datasets and routes.
- `Sectors/Activities`: placeholder for future activity datasets and routes.
- `common`: shared data loading, standardization, correlation, and map/country helpers.
- `static`: shared frontend JavaScript, CSS, map assets, and visual components.
- `templates/index.html`: the single dashboard page.
- `common/database.py`: shared database logic.
- `data/main.db`: shared SQLite database (auto-created).

## Setup

1. Create and activate a Python environment.
2. Install dependencies:
   - `pip install -r requirements.txt`
3. Start the app:
   - `python app.py`

Then open the local Flask URL shown in terminal (typically http://127.0.0.1:5000).

## Correlation with GDP

The project calculates GDP correlations in `common/correlation.py`. For each selected year and filter combination, the backend first matches GDP records with indicator records by country code. Only countries that have both a valid GDP value and a valid indicator value are included in the calculation.

Each included country becomes one point:

```text
x = selected GDP value
y = selected indicator value
```

If the user chooses `log(GDP)`, the project uses the natural logarithm of GDP as `x`. GDP values less than or equal to zero are skipped because they cannot be logged.

### Pearson correlation

Pearson correlation measures how strongly the two variables follow a straight-line relationship. The project calculates it by:

1. Calculating the average GDP value and the average indicator value.
2. Measuring how far each country is from those averages.
3. Dividing the shared movement of GDP and the indicator by their separate variation.

Formula:

```text
r = sum((x - mean_x) * (y - mean_y))
    / sqrt(sum((x - mean_x)^2) * sum((y - mean_y)^2))
```

If there are fewer than two countries, or if all GDP or indicator values are the same, Pearson correlation is not calculated.

### Spearman correlation

Spearman correlation measures whether higher GDP values generally come with higher or lower indicator values, without requiring a straight-line relationship.

The project calculates Spearman by:

1. Converting GDP values into ranks.
2. Converting indicator values into ranks.
3. Giving tied values their average rank.
4. Running the same Pearson formula on those ranks.

Example:

```text
values: 10, 20, 20
ranks:   1,  2.5, 2.5
```

### Reading the results

Both Pearson and Spearman values range from `-1` to `1`.

- `1` means a strong positive relationship.
- `-1` means a strong negative relationship.
- `0` means little or no relationship.

The correlation table is sorted from strongest to weakest relationship using the largest absolute value from Pearson or Spearman for each variable.

## Standardized 0-1 Scores

Each Eurostat explorer can switch from raw values to standardized scores. The Summary Analysis section always uses standardized scores.

Standardization happens on the backend in `common/sector_indicators.py`. For each selected indicator slice, the backend compares countries against each other and applies min-max scaling:

```text
score = (value - minimum) / (maximum - minimum)
```

This gives values from `0` to `1`. If all compared values are equal, the project uses `0.5` because there is no better or worse country within that selection.

An indicator slice is a specific combination of selected filter columns, except country. For example, BMI can be sliced by:

```text
BMI category + sex + age + education + year
```

For each slice, the project finds the minimum and maximum country value inside that slice. This means an obesity score for `Total / 18 years or over / 2019` is scaled against countries in that same BMI/sex/age/year context, not against unrelated age groups or years.

When standardized values are enabled, filter controls can open as checkbox dropdowns. Each option in the dropdown has its own direction setting:

- `Positive`: the min-max score is used directly.
- `Negative`: the score is inverted with `1 - score`.

After this step, every standardized indicator points in the same direction:

```text
0 = worse
1 = better
```

For example:

- Life expectancy is usually positive, because higher life expectancy is better.
- Unmet medical needs are usually negative, because higher unmet need is worse.
- Some BMI categories are negative, such as obese or underweight, while normal weight is positive.

When standardized values are enabled, combined scores are used automatically. This allows multiple values in filter columns to be selected at once. The backend normalizes every selected slice first, applies the selected positive/negative direction, and then calculates one country score as the mean of all selected standardized values:

```text
combined_country_score = mean(selected standardized scores for that country)
```

So if the user selects several ages, sexes, years, or indicator categories, every available normalized value contributes equally to the final country score. The `Values combined` column in Summary Analysis shows how many normalized values went into that country's score.

The standardization controls are saved in browser `localStorage`, so the selected raw/standardized mode and per-option directions survive page reloads.

## Summary Analysis

The Summary Analysis section is a cross-sector view for comparing whole datasets with GDP. It currently uses the registered datasets from Healthcare and Education. Activities can be added as soon as activity datasets are registered in the same modular format.

The Summary workflow is:

1. Choose a dataset, such as BMI, life expectancy, unmet medical needs, or education indicators.
2. The page builds checkbox dropdown filters from that dataset's columns.
3. By default, every value in every filter is selected.
4. Each selected value can be marked as `Positive` or `Negative`.
5. The backend calculates normalized 0-1 scores for every selected slice.
6. The backend combines all selected standardized slices into one mean score per country.
7. The page compares that country score with the selected GDP metric.

Summary Analysis always interprets the final score as:

```text
0 = worse
1 = better
```

The Summary table contains:

- `Country`: the country included in the selected dataset.
- `Standardized score`: the combined 0-1 country score.
- `GDP`: the selected GDP value used for the correlation, or blank when GDP is unavailable.
- `Values combined`: the number of standardized values averaged for that country.

Summary filter selections are saved per dataset in browser `localStorage`. For example, BMI can remember one set of selected BMI/sex/age/year values, while Education remembers a different set of selected metric/year values. The selected Summary dataset, GDP metric, and GDP scale are saved too.

### Summary Pearson and Spearman

Summary Analysis calculates Pearson and Spearman correlations using one point per country:

```text
x = selected GDP or GDP per capita value
y = combined standardized country score
```

If `log(value)` is selected for GDP scale, the project uses the natural logarithm of the GDP value as `x`. Countries with missing GDP, invalid GDP, or non-positive GDP in log mode are excluded from the correlation calculation. They can still appear in the score table if the indicator score exists.

For Summary Analysis, the GDP year is resolved from the selected years. If multiple years are selected, the backend uses the latest selected year for GDP, while the standardized country score can combine values from all selected years.

Pearson measures the straight-line relationship between GDP and the combined score. Spearman measures whether higher GDP countries tend to rank higher or lower by the combined score. Both values range from `-1` to `1`.
