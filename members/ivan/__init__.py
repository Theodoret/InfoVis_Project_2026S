from flask import Blueprint, render_template

from common.database import get_page_visit_count, record_page_visit

ivan_bp = Blueprint(
    "ivan",
    __name__,
    url_prefix="/ivan",
    template_folder="templates",
)


@ivan_bp.route("/")
def page():
    record_page_visit("Ivan")
    visit_count = get_page_visit_count("Ivan")
    return render_template("ivan/page.html", member_name="Ivan", visit_count=visit_count)
