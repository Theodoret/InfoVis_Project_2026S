from flask import Flask, render_template
import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
from scipy.stats import linregress
def impute_with_linear_fit(df):
    df_imputed = df.copy()
    years = np.array(df_imputed.columns.astype(int))
    for country in df_imputed.index:
        row = df.loc[country]
        valid = row.notna()
        valid_years = years[valid]
        valid_values = row[valid]
        if len(valid_values) < 2:
            continue
        slope, intercept,_,_,_ = linregress(valid_years, valid_values)

        nan = row.isna()
        nan_years = years[nan]
        df_imputed.loc[country, nan] = nan_years * slope + intercept
    return df_imputed

app = Flask(__name__)

@app.route('/')
def home():
    df = pd.read_csv("static/data/GDP.csv", skiprows=4)
    df.head()

    european_countries = ["ALB", "AND", "AUT", "BLR", "BEL", "BIH", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FRO",
                          "FIN", "FRA", "DEU", "GIB", "GRC", "HUN", "ISL", "IRL", "IMN", "ITA", "XKX", "LVA", "LIE",
                          "LTU", "LUX", "MKD", "MLT", "MDA", "MCO", "MNE", "NLD", "NOR", "POL", "PRT", "ROU", "RUS",
                          "SMR", "SRB", "SVK", "SVN", "ESP", "SWE", "CHE", "UKR", "GBR", "VAT", "RSB"]
    df = df[df["Country Code"].isin(european_countries)]
    df_expenditure = pd.read_csv("static/data/expenditure.csv")
    df_completion_rate_pr_ed = pd.read_csv("static/data/Completion_Rate_Primary_Ed.csv")
    df_completion_rate_low_sec_ed = pd.read_csv("static/data/Completion_Rate_Lower_Secondary_Ed.csv")
    df_completion_rate_high_sec_ed = pd.read_csv("static/data/Completion_Rate_Upper_Secondary_Ed.csv")

    df = df.drop(columns=['Indicator Code', 'Indicator Name', 'Unnamed: 70']).iloc[:, 0:69]
    df = df.melt(id_vars=['Country Code', 'Country Name'], var_name='year', value_name='GDP (current US$)').astype(
        {'year': int})
    df = df[df['year'] >= 2000].reset_index(drop=True)

    df_e = df_expenditure.rename(columns={'value': 'Expenditure', 'geoUnit': 'Country Code'}).iloc[:, 1:4]
    df_e = df_e.pivot_table(index='Country Code', columns='year', values='Expenditure')
    df_e = impute_with_linear_fit(df_e)
    scaler = MinMaxScaler()
    df_e.iloc[:, :] = scaler.fit_transform(df_e)
    df_e = df_e.reset_index()
    df_e = df_e.melt(id_vars=['Country Code'], var_name='year', value_name='Expenditure').astype({'year': int})

    df_completion_rate_pr_ed = df_completion_rate_pr_ed.rename(
        columns={'value': 'Completion Rate: Primary Education', 'geoUnit': 'Country Code'}).iloc[:, 1:4]
    df_completion_rate_pr_ed = df_completion_rate_pr_ed.pivot_table(index='Country Code', columns='year',
                                                                    values='Completion Rate: Primary Education')
    df_completion_rate_pr_ed = impute_with_linear_fit(df_completion_rate_pr_ed)
    scaler = MinMaxScaler()
    df_completion_rate_pr_ed.iloc[:, :] = scaler.fit_transform(df_completion_rate_pr_ed)
    df_primary_ed = df_completion_rate_pr_ed.reset_index().melt(id_vars=['Country Code'], var_name='year',
                                                                value_name='Completion Rate: Primary Education').astype(
        {'year': int})

    df_completion_rate_lower_sec_ed = df_completion_rate_low_sec_ed.rename(
        columns={'value': 'Completion Rate: Lower Secondary Education', 'geoUnit': 'Country Code'}).iloc[:, 1:4]
    df_completion_rate_lower_sec_ed = df_completion_rate_lower_sec_ed.pivot_table(index='Country Code', columns='year',
                                                                                  values='Completion Rate: Lower Secondary Education')
    df_completion_rate_lower_sec_ed = impute_with_linear_fit(df_completion_rate_lower_sec_ed)
    scaler = MinMaxScaler()
    df_completion_rate_lower_sec_ed.iloc[:, :] = scaler.fit_transform(df_completion_rate_lower_sec_ed)
    df_lower_sec = df_completion_rate_lower_sec_ed.reset_index().melt(id_vars=['Country Code'], var_name='year',
                                                                      value_name='Completion Rate: Lower Secondary Education').astype(
        {'year': int})

    df_completion_rate_higher_sec_ed = df_completion_rate_high_sec_ed.rename(
        columns={'value': 'Completion Rate: Higher Secondary Education', 'geoUnit': 'Country Code'}).iloc[:, 1:4]
    df_completion_rate_higher_sec_ed = df_completion_rate_higher_sec_ed.pivot_table(index='Country Code',
                                                                                    columns='year',
                                                                                    values='Completion Rate: Higher Secondary Education')
    df_completion_rate_higher_sec_ed = impute_with_linear_fit(df_completion_rate_higher_sec_ed)
    scaler = MinMaxScaler()
    df_completion_rate_higher_sec_ed.iloc[:, :] = scaler.fit_transform(df_completion_rate_higher_sec_ed)
    df_higher_sec = df_completion_rate_higher_sec_ed.reset_index().melt(id_vars=['Country Code'], var_name='year',
                                                                        value_name='Completion Rate: Higher Secondary Education').astype(
        {'year': int})

    df_merged = pd.merge(df, df_e, on=['Country Code', 'year'], how='outer')
    df_merged = pd.merge(df_merged, df_primary_ed, on=['Country Code', 'year'], how='outer')
    df_merged = pd.merge(df_merged, df_lower_sec, on=['Country Code', 'year'], how='outer')
    df_merged = pd.merge(df_merged, df_higher_sec, on=['Country Code', 'year'], how='outer')

    return render_template('index.html',
                           data=df_merged.to_json(orient="records"),
                           columns = [col for col in df_merged.columns if col not in ['Country Code', 'Country Name', 'year', 'GDP (current US$)']])

if __name__ == '__main__':
    app.run(debug=True)
