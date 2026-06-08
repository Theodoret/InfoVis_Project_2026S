from flask import Flask, jsonify, render_template, request

from common.database import init_db
from common.summary_analysis import summary_data_payload, summary_options_payload
from Sectors.Activities import activities_bp
from Sectors.Education import EDUCATION_INDICATORS, education_bp
from Sectors.Healthcare import HEALTHCARE_INDICATORS, healthcare_bp


SUMMARY_ANALYSIS_DATASETS = {
    "healthcare:bmi": {
        "sector": "Healthcare",
        "label": "Body Mass Index",
        "indicators": HEALTHCARE_INDICATORS,
        "indicator_key": "bmi",
    },
    "healthcare:life": {
        "sector": "Healthcare",
        "label": "Life expectancy",
        "indicators": HEALTHCARE_INDICATORS,
        "indicator_key": "life",
    },
    "healthcare:unmet": {
        "sector": "Healthcare",
        "label": "Unmet medical needs",
        "indicators": HEALTHCARE_INDICATORS,
        "indicator_key": "unmet",
    },
    "education:education": {
        "sector": "Education",
        "label": "Education indicators",
        "indicators": EDUCATION_INDICATORS,
        "indicator_key": "education",
    },
}


def create_app() -> Flask:
    app = Flask(__name__)

    app.register_blueprint(activities_bp)
    app.register_blueprint(education_bp)
    app.register_blueprint(healthcare_bp)

    @app.route("/")
    def index():
        return render_template("index.html")

    @app.route("/summary-analysis/options")
    def summary_analysis_options():
        return jsonify(summary_options_payload(SUMMARY_ANALYSIS_DATASETS, request.args.get("dataset")))

    @app.route("/summary-analysis/data")
    def summary_analysis_data():
        return jsonify(summary_data_payload(SUMMARY_ANALYSIS_DATASETS, request.args))

    init_db()
    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)
