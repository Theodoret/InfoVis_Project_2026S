from flask import Blueprint, redirect, url_for

activities_bp = Blueprint(
    "activities",
    __name__,
    url_prefix="/activities",
    template_folder="templates",
)


@activities_bp.route("/")
def page():
    return redirect(url_for("index"))
