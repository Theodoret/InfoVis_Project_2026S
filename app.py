from flask import Flask, render_template

from common.database import init_db
from members.ivan import ivan_bp
from members.paul import paul_bp
from members.theo import theo_bp


def create_app() -> Flask:
    app = Flask(__name__)

    app.register_blueprint(paul_bp)
    app.register_blueprint(theo_bp)
    app.register_blueprint(ivan_bp)

    @app.route("/")
    def index():
        return render_template("index.html")

    init_db()
    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)
