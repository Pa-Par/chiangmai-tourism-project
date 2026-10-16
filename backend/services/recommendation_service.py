"""Simple rule-based filtering for tourism attractions."""

from datetime import time, timedelta
from decimal import Decimal, InvalidOperation
from math import asin, cos, radians, sin, sqrt


MAX_DAYS = 30
DAILY_VISIT_TIME_LIMIT_MINUTES = 480
MAIN_ITINERARY_COST_FIELDS = ("thai_free", "vehicle_free", "package_free")
EARTH_RADIUS_KM = 6371.0088
CAFE_RECOMMENDATION_MAX_DISTANCE_KM = 5
CAFE_RECOMMENDATION_LIMIT = 3

# These categories are supplementary recommendations, not itinerary categories.
# The database currently uses "แพ็คเกจทัวร์"; the second spelling is supported
# as well so the rule remains clear if data is corrected later.
SUPPLEMENTARY_CATEGORY_NAMES = frozenset(
    {"คาเฟ่", "แพ็คเกจทัวร์", "แพ็กเกจทัวร์"}
)


def validate_recommendation_request(payload):
    """Validate and normalize the JSON body sent to POST /api/recommend."""
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")

    days = _parse_positive_integer(payload.get("days"), "days")
    if days > MAX_DAYS:
        raise ValueError(f"days must be between 1 and {MAX_DAYS}.")

    category_ids = payload.get("category_ids")
    if not isinstance(category_ids, list) or not category_ids:
        raise ValueError("category_ids must be a non-empty array of category IDs.")

    normalized_category_ids = []
    for category_id in category_ids:
        category_id = _parse_positive_integer(category_id, "Each category ID")
        if category_id not in normalized_category_ids:
            normalized_category_ids.append(category_id)

    zone_id = payload.get("zone_id")
    if zone_id in (None, ""):
        zone_id = None
    else:
        zone_id = _parse_positive_integer(zone_id, "zone_id")

    trip_start_time = _parse_trip_start_time(payload.get("trip_start_time", "08:00"))

    start_locations = _validate_start_locations(
        payload.get("start_locations"),
        days,
    )
    legacy_start_location = _validate_start_location(payload.get("start_location"))
    if legacy_start_location is not None and 1 not in start_locations:
        start_locations[1] = legacy_start_location

    use_start_location_each_day = payload.get("use_start_location_each_day", False)
    if not isinstance(use_start_location_each_day, bool):
        raise ValueError("use_start_location_each_day must be true or false.")
    if use_start_location_each_day and 1 not in start_locations:
        raise ValueError(
            "A Day 1 start location is required when use_start_location_each_day is true."
        )

    return {
        "days": days,
        "category_ids": normalized_category_ids,
        "zone_id": zone_id,
        "trip_start_time": trip_start_time,
        # Kept for backward compatibility with the original single-origin API.
        "start_location": start_locations.get(1),
        "start_locations": start_locations,
        "use_start_location_each_day": use_start_location_each_day,
    }


def filter_recommendation_candidates(attractions):
    """Keep attractions that can be scheduled without using price as a rule.

    Planning is based on the user's days, categories, optional zone, visit
    duration, and valid opening-hour data. Cost fields remain untouched and
    are calculated only after the main itinerary is selected. A NULL price
    never becomes zero and never excludes an otherwise schedulable attraction.
    """
    eligible_attractions = []
    cost_data_unavailable_count = 0
    cost_data_invalid_count = 0
    skipped_missing_duration_count = 0
    skipped_invalid_duration_count = 0
    skipped_invalid_opening_hours_count = 0

    for attraction in attractions:
        try:
            attraction_cost, unknown_cost_fields = _sum_available_cost_fields(
                attraction,
                MAIN_ITINERARY_COST_FIELDS,
            )
        except (InvalidOperation, TypeError, ValueError):
            attraction_cost = None
            unknown_cost_fields = []
            cost_data_invalid_count += 1
        else:
            if unknown_cost_fields:
                cost_data_unavailable_count += 1
            elif not attraction_cost.is_finite() or attraction_cost < 0:
                attraction_cost = None
                cost_data_invalid_count += 1

        duration = attraction.get("visit_duration")
        if duration is None:
            skipped_missing_duration_count += 1
            continue

        try:
            duration = int(duration)
        except (TypeError, ValueError):
            skipped_invalid_duration_count += 1
            continue

        if not 0 < duration <= DAILY_VISIT_TIME_LIMIT_MINUTES:
            skipped_invalid_duration_count += 1
            continue

        opening_hours_available, opening_hours_valid = _check_opening_hours(
            attraction.get("open_time"), attraction.get("close_time")
        )
        if not opening_hours_valid:
            skipped_invalid_opening_hours_count += 1
            continue

        item = dict(attraction)
        item["estimated_attraction_cost"] = (
            attraction_cost if not unknown_cost_fields else None
        )
        item["cost_estimate_available"] = (
            attraction_cost is not None and not unknown_cost_fields
        )
        item["cost_source"] = ", ".join(MAIN_ITINERARY_COST_FIELDS)
        item["opening_hours_available"] = opening_hours_available
        eligible_attractions.append(item)

    return {
        "eligible_attractions": eligible_attractions,
        "cost_data_unavailable_count": cost_data_unavailable_count,
        "cost_data_invalid_count": cost_data_invalid_count,
        "skipped_missing_duration_count": skipped_missing_duration_count,
        "skipped_invalid_duration_count": skipped_invalid_duration_count,
        "skipped_invalid_opening_hours_count": skipped_invalid_opening_hours_count,
    }


def calculate_result_cost(itinerary_days):
    """Calculate a transparent estimate for the Result page.

    Only attractions placed in the main itinerary are included. Cafés and
    package tours are supplementary suggestions, so they never affect the
    estimated trip cost.

    Database NULL values remain NULL in the returned attractions; any such
    value is recorded as an unavailable cost component instead of being
    changed.
    """
    main_attractions_cost = Decimal("0.00")
    unavailable_cost_component_count = 0
    unavailable_cost_attraction_count = 0
    main_itinerary_cost_details = []

    for day in itinerary_days:
        for attraction in day["attractions"]:
            try:
                amount, unknown_fields = _sum_available_cost_fields(
                    attraction,
                    MAIN_ITINERARY_COST_FIELDS,
                )
            except (InvalidOperation, TypeError, ValueError):
                amount, unknown_fields = Decimal("0.00"), ["invalid_cost_data"]
            cost_is_available = not unknown_fields
            if cost_is_available:
                main_attractions_cost += amount
            else:
                unavailable_cost_component_count += len(unknown_fields)
                unavailable_cost_attraction_count += 1
            main_itinerary_cost_details.append(
                {
                    "day": day["day"],
                    "attraction_id": attraction["attraction_id"],
                    "name": attraction["name"],
                    "estimated_cost": float(amount) if cost_is_available else None,
                    "cost_available": cost_is_available,
                }
            )

    return {
        "main_attractions_cost": float(main_attractions_cost),
        "main_itinerary_cost_details": main_itinerary_cost_details,
        "unavailable_cost_component_count": unavailable_cost_component_count,
        "unavailable_cost_attraction_count": unavailable_cost_attraction_count,
    }


def validate_primary_category_selection(category_rows, requested_category_ids):
    """Reject unknown or supplementary categories from the main itinerary.

    The check uses category names from the existing database instead of fixed
    IDs, so the main itinerary remains limited to tourism-place categories.
    """
    categories_by_id = {
        category["category_id"]: category["category_name"]
        for category in category_rows
    }
    missing_category_ids = [
        category_id
        for category_id in requested_category_ids
        if category_id not in categories_by_id
    ]
    if missing_category_ids:
        raise ValueError("ไม่พบประเภทสถานที่ที่เลือกในฐานข้อมูล")

    supplementary_category_ids = [
        category_id
        for category_id in requested_category_ids
        if categories_by_id[category_id] in SUPPLEMENTARY_CATEGORY_NAMES
    ]
    if supplementary_category_ids:
        raise ValueError(
            "คาเฟ่และแพ็กเกจทัวร์เป็นคำแนะนำเพิ่มเติม "
            "จึงไม่สามารถใช้สร้างแผนการเดินทางหลักได้"
        )

    return requested_category_ids


def rank_cafes_by_itinerary_proximity(
    cafes,
    itinerary_days,
    max_distance_km=CAFE_RECOMMENDATION_MAX_DISTANCE_KM,
    limit=CAFE_RECOMMENDATION_LIMIT,
):
    """Return nearby cafés ranked by their nearest itinerary attraction.

    Only records with valid latitude and longitude are considered. For each
    café, the function measures its straight-line Haversine distance to every
    attraction in every itinerary day, retains the nearest one, then filters
    and orders the cafés by that nearest distance. This keeps the selection
    explainable and independent of tourism-zone matching.
    """
    itinerary_attractions = [
        {**attraction, "itinerary_day": day["day"]}
        for day in itinerary_days
        for attraction in day["attractions"]
        if _get_coordinates(attraction) is not None
    ]

    if not itinerary_attractions:
        return []

    ranked_cafes = []
    for cafe in cafes:
        cafe_coordinates = _get_coordinates(cafe)
        if cafe_coordinates is None:
            continue

        nearest_attraction = None
        nearest_distance_km = None

        for attraction in itinerary_attractions:
            distance_km = calculate_haversine_distance_km(
                cafe_coordinates,
                _get_coordinates(attraction),
            )
            if nearest_distance_km is None or distance_km < nearest_distance_km:
                nearest_attraction = attraction
                nearest_distance_km = distance_km

        if nearest_distance_km is None or nearest_distance_km > max_distance_km:
            continue

        ranked_cafes.append(
            {
                "cafe": serialize_attraction(cafe),
                "nearest_distance_km": nearest_distance_km,
                "nearest_attraction": nearest_attraction,
            }
        )

    ranked_cafes.sort(
        key=lambda item: (
            item["nearest_distance_km"],
            item["cafe"]["name"].casefold(),
        )
    )

    recommendations = []
    for item in ranked_cafes[:limit]:
        cafe = item["cafe"]
        nearest_attraction = item["nearest_attraction"]
        cafe.update(
            {
                "nearest_itinerary_attraction_id": nearest_attraction[
                    "attraction_id"
                ],
                "nearest_itinerary_attraction_name": nearest_attraction["name"],
                "nearest_itinerary_day": nearest_attraction["itinerary_day"],
                "nearest_itinerary_distance_km": round(
                    item["nearest_distance_km"], 1
                ),
            }
        )
        recommendations.append(cafe)

    return recommendations


def calculate_haversine_distance_km(first_coordinates, second_coordinates):
    """Calculate the straight-line distance between two latitude/longitude pairs."""
    first_latitude, first_longitude = map(radians, first_coordinates)
    second_latitude, second_longitude = map(radians, second_coordinates)

    latitude_difference = second_latitude - first_latitude
    longitude_difference = second_longitude - first_longitude
    haversine_value = (
        sin(latitude_difference / 2) ** 2
        + cos(first_latitude)
        * cos(second_latitude)
        * sin(longitude_difference / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * asin(sqrt(haversine_value))


def serialize_attraction(attraction):
    """Convert MySQL Decimal and TIME values into JSON-compatible values."""
    return {key: _to_json_value(value) for key, value in attraction.items()}


def _parse_positive_integer(value, field_name):
    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be a positive integer.")
    if isinstance(value, float) and not value.is_integer():
        raise ValueError(f"{field_name} must be a positive integer.")

    try:
        integer_value = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be a positive integer.") from None

    if integer_value <= 0:
        raise ValueError(f"{field_name} must be a positive integer.")

    return integer_value


def _parse_trip_start_time(value):
    """Return a canonical HH:MM start time without guessing a value.

    The browser defaults this optional field to 08:00.  Keeping it in the API
    criteria makes the selected time available to the Result page after a
    recommendation request, while the travel duration itself still comes only
    from a successful Google Maps route calculation.
    """
    if not isinstance(value, str):
        raise ValueError("trip_start_time must use HH:MM format.")
    try:
        parsed_time = time.fromisoformat(value.strip())
    except ValueError:
        raise ValueError("trip_start_time must use HH:MM format.") from None
    if value.strip() != parsed_time.strftime("%H:%M"):
        raise ValueError("trip_start_time must use HH:MM format.")
    return parsed_time.strftime("%H:%M")


def _validate_start_location(value):
    """Validate an optional, user-supplied route origin without geocoding it.

    Requiring coordinates prevents the backend from guessing a hotel, airport,
    or bus station.  An omitted origin is valid; it simply disables real-road
    routing until the user gives a location.
    """
    if value in (None, ""):
        return None
    if not isinstance(value, dict):
        raise ValueError("start_location must be an object or null.")

    name = value.get("name")
    if name in (None, ""):
        name = None
    elif not isinstance(name, str):
        raise ValueError("start_location.name must be a string when provided.")
    else:
        name = name.strip() or None
        if name is not None and len(name) > 255:
            raise ValueError("start_location.name must not exceed 255 characters.")

    try:
        latitude = float(value.get("latitude"))
        longitude = float(value.get("longitude"))
    except (TypeError, ValueError):
        raise ValueError("start_location latitude and longitude must be valid numbers.") from None

    if not -90 <= latitude <= 90:
        raise ValueError("start_location latitude must be between -90 and 90.")
    if not -180 <= longitude <= 180:
        raise ValueError("start_location longitude must be between -180 and 180.")

    return {"name": name, "latitude": latitude, "longitude": longitude}


def _validate_start_locations(value, days):
    """Validate optional per-day origins without guessing missing locations."""
    if value in (None, ""):
        return {}
    if not isinstance(value, list):
        raise ValueError("start_locations must be an array when provided.")

    locations_by_day = {}
    for item in value:
        if not isinstance(item, dict):
            raise ValueError("Each start_locations item must be an object.")
        day = _parse_positive_integer(item.get("day"), "start_locations.day")
        if day > days:
            raise ValueError("start_locations.day must not exceed the trip days.")
        if day in locations_by_day:
            raise ValueError("Each day can have only one start location.")
        locations_by_day[day] = _validate_start_location(item)
    return locations_by_day


def _sum_available_cost_fields(attraction, field_names):
    """Sum available non-negative Decimal cost fields without changing NULLs."""
    total = Decimal("0.00")
    unknown_fields = []

    for field_name in field_names:
        value = attraction.get(field_name)
        if value is None:
            unknown_fields.append(field_name)
            continue

        amount = Decimal(str(value))
        if not amount.is_finite() or amount < 0:
            raise ValueError(f"{field_name} must be a non-negative number.")
        total += amount

    return total, unknown_fields


def _get_coordinates(attraction):
    """Return valid numeric coordinates, or None when the database lacks them."""
    try:
        latitude = float(attraction.get("latitude"))
        longitude = float(attraction.get("longitude"))
    except (TypeError, ValueError):
        return None

    if (
        not -90 <= latitude <= 90
        or not -180 <= longitude <= 180
        or latitude == 0
        or longitude == 0
    ):
        return None

    return latitude, longitude


def _check_opening_hours(open_time, close_time):
    """Return whether complete hours exist and whether the supplied hours work."""
    if open_time is None or close_time is None:
        return False, True

    try:
        return True, close_time > open_time
    except TypeError:
        return True, False


def _to_json_value(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, timedelta):
        total_seconds = int(value.total_seconds())
        hours, remainder = divmod(total_seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    if isinstance(value, time):
        return value.strftime("%H:%M:%S")
    return value
