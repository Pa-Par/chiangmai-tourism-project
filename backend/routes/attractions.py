"""Read-only endpoints for zones, categories, and attractions."""

from flask import Blueprint, jsonify, request

from database import database_cursor
from services.recommendation_service import serialize_attraction


attractions_bp = Blueprint("attractions", __name__)

ATTRACTION_SELECT = """
    SELECT
        a.attraction_id,
        a.name,
        a.zone_id,
        z.zone_name,
        a.category_id,
        c.category_name,
        a.description,
        a.latitude,
        a.longitude,
        a.thai_free,
        a.foreigner_free,
        a.thaichild_free,
        a.foreignerchild_free,
        a.vehicle_free,
        a.package_free,
        a.free_remarks,
        a.open_time,
        a.close_time,
        a.visit_duration,
        a.image_url,
        a.duration_days,
        a.source_name,
        a.source_url
    FROM attractions AS a
    INNER JOIN zones AS z ON a.zone_id = z.zone_id
    INNER JOIN categories AS c ON a.category_id = c.category_id
"""


def _get_positive_query_id(parameter_name):
    value = request.args.get(parameter_name)
    if value in (None, ""):
        return None

    try:
        value = int(value)
    except ValueError:
        raise ValueError(f"{parameter_name} ต้องเป็นจำนวนเต็มบวก") from None

    if value <= 0:
        raise ValueError(f"{parameter_name} ต้องเป็นจำนวนเต็มบวก")

    return value


@attractions_bp.get("/zones")
def get_zones():
    with database_cursor() as cursor:
        cursor.execute(
            "SELECT zone_id, zone_name, description FROM zones ORDER BY zone_id ASC"
        )
        zones = cursor.fetchall()

    return jsonify({"success": True, "data": zones}), 200


@attractions_bp.get("/categories")
def get_categories():
    with database_cursor() as cursor:
        cursor.execute(
            "SELECT category_id, category_name, description "
            "FROM categories ORDER BY category_id ASC"
        )
        categories = cursor.fetchall()

    return jsonify({"success": True, "data": categories}), 200


@attractions_bp.get("/attractions")
def get_attractions():
    try:
        zone_id = _get_positive_query_id("zone_id")
        category_id = _get_positive_query_id("category_id")
    except ValueError as error:
        return jsonify({"success": False, "message": str(error)}), 400

    query = ATTRACTION_SELECT + " WHERE 1 = 1"
    parameters = []

    if zone_id is not None:
        query += " AND a.zone_id = %s"
        parameters.append(zone_id)

    if category_id is not None:
        query += " AND a.category_id = %s"
        parameters.append(category_id)

    query += " ORDER BY a.zone_id ASC, a.category_id ASC, a.name ASC"

    with database_cursor() as cursor:
        cursor.execute(query, parameters)
        attractions = cursor.fetchall()

    return jsonify(
        {
            "success": True,
            "data": [serialize_attraction(item) for item in attractions],
        }
    ), 200


@attractions_bp.get("/attractions/<int:attraction_id>")
def get_attraction_by_id(attraction_id):
    query = ATTRACTION_SELECT + " WHERE a.attraction_id = %s"

    with database_cursor() as cursor:
        cursor.execute(query, (attraction_id,))
        attraction = cursor.fetchone()

    if attraction is None:
        return jsonify(
            {"success": False, "message": "ไม่พบข้อมูลสถานที่ท่องเที่ยว"}
        ), 404

    return jsonify({"success": True, "data": serialize_attraction(attraction)}), 200
