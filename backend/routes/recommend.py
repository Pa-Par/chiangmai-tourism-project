"""Endpoint that coordinates the rule-based recommendation workflow."""

from flask import Blueprint, jsonify, request

from config import Config
from database import database_cursor
from routes.attractions import ATTRACTION_SELECT
from services.gemini_service import select_candidate_attractions
from services.itinerary_service import create_itinerary
from services.maps_service import optimize_itinerary_routes
from services.recommendation_service import (
    SUPPLEMENTARY_CATEGORY_NAMES,
    calculate_result_cost,
    filter_recommendation_candidates,
    validate_recommendation_request,
    validate_primary_category_selection,
)


recommend_bp = Blueprint("recommend", __name__)


@recommend_bp.post("/recommend")
def recommend():
    try:
        criteria = validate_recommendation_request(request.get_json(silent=True))
    except ValueError as error:
        return jsonify({"success": False, "message": str(error)}), 400

    with database_cursor() as cursor:
        category_placeholders = ", ".join(["%s"] * len(criteria["category_ids"]))
        cursor.execute(
            "SELECT category_id, category_name FROM categories "
            f"WHERE category_id IN ({category_placeholders})",
            criteria["category_ids"],
        )
        selected_categories = cursor.fetchall()
        try:
            primary_category_ids = validate_primary_category_selection(
                selected_categories,
                criteria["category_ids"],
            )
        except ValueError as error:
            return jsonify({"success": False, "message": str(error)}), 400

        placeholders = ", ".join(["%s"] * len(primary_category_ids))
        supplementary_placeholders = ", ".join(
            ["%s"] * len(SUPPLEMENTARY_CATEGORY_NAMES)
        )
        query = (
            ATTRACTION_SELECT
            + f" WHERE a.category_id IN ({placeholders})"
            + f" AND c.category_name NOT IN ({supplementary_placeholders})"
        )
        parameters = list(primary_category_ids) + list(
            SUPPLEMENTARY_CATEGORY_NAMES
        )

        if criteria["zone_id"] is not None:
            query += " AND a.zone_id = %s"
            parameters.append(criteria["zone_id"])

        # This deterministic order is a simple rule that groups the same zone.
        # It uses neither weighted scoring nor machine learning.
        query += " ORDER BY a.zone_id ASC, a.category_id ASC, a.name ASC"
        cursor.execute(query, parameters)
        candidates = cursor.fetchall()

    filtering = filter_recommendation_candidates(attractions=candidates)
    gemini_result = select_candidate_attractions(
        candidates=filtering["eligible_attractions"],
        days=criteria["days"],
        api_key=Config.GEMINI_API_KEY,
        model=Config.GEMINI_MODEL,
        timeout_seconds=Config.GEMINI_TIMEOUT_SECONDS,
        failure_cooldown_seconds=Config.GEMINI_FAILURE_COOLDOWN_SECONDS,
    )
    selected_candidates, gemini_selection_used = _resolve_gemini_selection(
        filtering["eligible_attractions"],
        gemini_result["selected_attraction_ids"],
    )
    if not gemini_selection_used:
        gemini_result["status"] = (
            gemini_result["status"]
            if gemini_result["status"] != "used"
            else "invalid_selection"
        )
        gemini_result["message"] = (
            "Gemini ส่งรหัสที่ไม่ตรงกับข้อมูล MySQL จึงใช้กฎจากฐานข้อมูลในการเลือกสถานที่"
            if gemini_result["status"] == "invalid_selection"
            else gemini_result["message"]
        )

    itinerary = create_itinerary(
        attractions=selected_candidates,
        days=criteria["days"],
        start_location=criteria["start_location"],
    )
    itinerary["days"], itinerary["route_plan"] = optimize_itinerary_routes(
        itinerary["days"],
        criteria["start_locations"],
        criteria["use_start_location_each_day"],
        Config.GOOGLE_MAPS_SERVER_API_KEY,
        Config.GOOGLE_MAPS_ROUTES_TIMEOUT_SECONDS,
    )
    cost_summary = calculate_result_cost(itinerary["days"])

    return jsonify(
        {
            "success": True,
            "data": {
                "criteria": {
                    "days": criteria["days"],
                    "category_ids": criteria["category_ids"],
                    "zone_id": criteria["zone_id"],
                    "trip_start_time": criteria["trip_start_time"],
                    "start_location": criteria["start_location"],
                    "start_locations": criteria["start_locations"],
                    "use_start_location_each_day": criteria[
                        "use_start_location_each_day"
                    ],
                },
                "summary": {
                    "candidate_count": len(candidates),
                    "eligible_attraction_count": len(
                        filtering["eligible_attractions"]
                    ),
                    "gemini_selected_candidate_count": len(selected_candidates),
                    "selected_attraction_count": sum(
                        len(day["attractions"]) for day in itinerary["days"]
                    ),
                    "main_itinerary_cost": cost_summary["main_attractions_cost"],
                    "daily_visit_time_limit_minutes": itinerary[
                        "daily_visit_time_limit_minutes"
                    ],
                    "cost_data_unavailable_count": filtering[
                        "cost_data_unavailable_count"
                    ],
                    "cost_data_invalid_count": filtering[
                        "cost_data_invalid_count"
                    ],
                    "skipped_missing_duration_count": filtering[
                        "skipped_missing_duration_count"
                    ],
                    "skipped_invalid_duration_count": filtering[
                        "skipped_invalid_duration_count"
                    ],
                    "skipped_invalid_opening_hours_count": filtering[
                        "skipped_invalid_opening_hours_count"
                    ],
                    "skipped_time_capacity_count": itinerary[
                        "skipped_time_capacity_count"
                    ],
                    "cost_note": (
                        "ใช้ thai_free, vehicle_free และ package_free "
                        "เพื่อแสดงค่าใช้จ่ายของสถานที่ในแผนหลักเท่านั้น; "
                        "ค่าใช้จ่ายไม่ใช่เงื่อนไขในการคัดเลือกสถานที่; "
                        "ค่า NULL ยังคงเป็นข้อมูลไม่ทราบราคาและไม่ถูกแทนด้วยศูนย์"
                    ),
                    **cost_summary,
                },
                "itinerary": itinerary["days"],
                "route_plan": itinerary["route_plan"],
                "recommended_cafes": [],
                "recommended_packages": [],
                "gemini": {
                    "status": gemini_result["status"],
                    "message": gemini_result["message"],
                    "limitations": gemini_result["limitations"],
                },
                "gemini_summary": gemini_result["trip_summary"],
                "transportation_recommendation": gemini_result[
                    "transportation_recommendation"
                ],
            },
        }
    ), 200


def _resolve_gemini_selection(eligible_attractions, selected_ids):
    """Accept only unique IDs present in the already-filtered MySQL rows."""
    candidates_by_id = {
        attraction["attraction_id"]: attraction for attraction in eligible_attractions
    }
    chosen = []
    for attraction_id in selected_ids:
        candidate = candidates_by_id.get(attraction_id)
        if candidate is not None and candidate not in chosen:
            chosen.append(candidate)

    # A one-item answer when several valid candidates exist cannot form a
    # useful multi-place itinerary.  Preserve the deterministic candidate set.
    minimum_selection = min(2, len(eligible_attractions))
    if len(chosen) < minimum_selection:
        return eligible_attractions, False
    return chosen, True
