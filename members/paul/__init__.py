from flask import Blueprint, render_template

from common.database import get_page_visit_count, record_page_visit

paul_bp = Blueprint(
    "paul",
    __name__,
    url_prefix="/paul",
    template_folder="templates",
)


@paul_bp.route("/")
def page():
    record_page_visit("Paul")
    visit_count = get_page_visit_count("Paul")
    return render_template("paul/page.html", member_name="Paul", visit_count=visit_count)
