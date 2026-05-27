from flask import Blueprint, render_template

from common.database import get_page_visit_count, record_page_visit

theo_bp = Blueprint(
    "theo",
    __name__,
    url_prefix="/theo",
    template_folder="templates",
)


#@theo_bp.route("/")
#def page():
#    record_page_visit("Theo")
#    visit_count = get_page_visit_count("Theo")
#    #return render_template("theo/page.html", member_name="Theo", visit_count=visit_count)
#    return render_template("theo/index.html", member_name="Theo", visit_count=visit_count)

from .app import theo_bp
