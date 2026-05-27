import os
import json
import pandas as pd
from flask import Blueprint, render_template
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

# Import your database utilities from the root common folder
from common.database import get_page_visit_count, record_page_visit

theo_bp = Blueprint(
    "theo",
    __name__,
    url_prefix="/theo",
    template_folder="templates",
    static_folder="static",
)

COUNTRIES = ['Afghanistan', 'Albania', 'Algeria', 'Angola', 'Argentina', 'Armenia', 'Australia', 'Austria',
             'Azerbaijan', 'Brazil', 'Bulgaria', 'Cameroon', 'Chile', 'China', 'Colombia', 'Croatia', 'Cuba',
             'Cyprus', 'Czech Republic', 'Ecuador', 'Egypt, Arab Rep.', 'Eritrea', 'Ethiopia', 'France', 'Germany',
             'Ghana', 'Greece', 'India', 'Indonesia', 'Iran, Islamic Rep.', 'Iraq', 'Ireland', 'Italy', 'Japan',
             'Jordan', 'Kazakhstan', 'Kenya', 'Lebanon', 'Malta', 'Mexico', 'Morocco', 'Pakistan', 'Peru',
             'Philippines', 'Russian Federation', 'Syrian Arab Republic', 'Tunisia', 'Turkey', 'Ukraine']


@theo_bp.route('/')
def page():
    # 1. Gather your visitor stats
    record_page_visit("Theo")
    visit_count = get_page_visit_count("Theo")

    # 2. Add 'return' and pass the visit count into your data function
    return data(visit_count)


# Update your data function signature to accept visit_count
def data(visit_count):
    # Get the directory where THIS app.py lives (members/theo/)
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DATA_PATH = os.path.join(BASE_DIR, "static", "data", "cleaned_data.csv")

    # Task 1: load and filter
    df = pd.read_csv(DATA_PATH)
    filtered_df = df[df['Country Name'].isin(COUNTRIES)].copy()

    # Task 2: compute a PCA based on the data of the most recent year
    recent_year = filtered_df['year'].max()
    filtered_df = filtered_df.fillna(filtered_df.groupby('Country Name').bfill().ffill())
    df_recent = filtered_df[filtered_df['year'] == recent_year].copy()

    # Task 2: Select numeric columns, excluding ID columns
    features = df_recent.select_dtypes(include=['float64', 'int64']).drop(columns=['year'], errors='ignore')

    # Task 2: PCA requires no NaNs. We fill with column means.
    features_filled = features.fillna(features.mean())

    # Task 2: Scaling
    scaled_data = StandardScaler().fit_transform(features_filled)

    # Task 2: PCA to 2D
    pca = PCA(n_components=2)
    pca_results = pca.fit_transform(scaled_data)

    # Task 2: Map PCA results back to country names
    pca_list = []
    columns_to_extract = [
        'Country Name', 'Country Code', 'Access to electricity (% of population)',
        'Agricultural irrigated land (% of total agricultural land)',
        'Average precipitation in depth (mm per year)',
        'Employment in agriculture (% of total employment) (modeled ILO estimate)',
        'GDP per capita (current US$)', 'Land area (sq. km)', 'Population, total'
    ]

    for i, row in enumerate(df_recent[columns_to_extract].itertuples(index=False, name=None)):
        country, code, access, agricultural, precipitation, employment, gdp, area, population = row
        pca_list.append({
            "country": country, "code": code, "x": pca_results[i, 0], "y": pca_results[i, 1],
            "access": access, "agricultural": agricultural, "precipitation": precipitation,
            "employment": employment, "gdp": gdp, "area": area, "population": population
        })

    # 3. Send EVERYTHING (visit stats + PCA data) to your HTML file
    return render_template(
        "theo/index.html",
        member_name="Theo",
        visit_count=visit_count,
        full_data=filtered_df.to_json(orient='records'),
        pca_data=json.dumps(pca_list)
    )