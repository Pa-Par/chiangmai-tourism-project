"""Build a simple day-by-day itinerary using visit duration rules."""

from decimal import Decimal

from services.recommendation_service import (
    DAILY_VISIT_TIME_LIMIT_MINUTES,
    calculate_haversine_distance_km,
    serialize_attraction,
)


def create_itinerary(attractions, days, start_location=None):
    """Place attractions in order without making cost a planning constraint.

    A day has a transparent maximum of 480 visit minutes.  Before allocating
    days, candidates are grouped by zone and arranged by a small nearest-neighbour
    rule when coordinates exist.  This is a deterministic fallback only; the
    Google Routes API may subsequently optimize Day 1 from a user-supplied start.
    """
    itinerary_days = [
        {
            "day": day_number,
            "estimated_day_cost": Decimal("0.00"),
            "total_visit_duration_minutes": 0,
            "attractions": [],
        }
        for day_number in range(1, days + 1)
    ]

    current_day_index = 0
    skipped_time_capacity_count = 0

    for attraction in order_attractions_by_proximity(attractions, start_location):
        duration = int(attraction["visit_duration"])

        while (
            current_day_index < days
            and itinerary_days[current_day_index]["total_visit_duration_minutes"]
            + duration
            > DAILY_VISIT_TIME_LIMIT_MINUTES
        ):
            current_day_index += 1

        if current_day_index >= days:
            skipped_time_capacity_count += 1
            continue

        current_day = itinerary_days[current_day_index]
        current_day["attractions"].append(serialize_attraction(attraction))
        attraction_cost = attraction.get("estimated_attraction_cost")
        if attraction_cost is not None:
            current_day["estimated_day_cost"] += Decimal(str(attraction_cost))
        current_day["total_visit_duration_minutes"] += duration

    for day in itinerary_days:
        day["estimated_day_cost"] = float(day["estimated_day_cost"])

    return {
        "days": itinerary_days,
        "daily_visit_time_limit_minutes": DAILY_VISIT_TIME_LIMIT_MINUTES,
        "skipped_time_capacity_count": skipped_time_capacity_count,
    }


def order_attractions_by_proximity(attractions, start_location=None):
    """Keep zones together and use coordinates to reduce obvious backtracking.

    This intentionally simple rule does not claim to be a road-route result.
    Items lacking coordinates remain in stable alphabetical order within their
    zone, rather than having an invented position.
    """
    attractions_by_zone = {}
    for attraction in attractions:
        attractions_by_zone.setdefault(attraction.get("zone_id"), []).append(attraction)

    ordered = []
    for _, zone_attractions in sorted(
        attractions_by_zone.items(), key=lambda item: (item[0] is None, item[0])
    ):
        remaining = sorted(zone_attractions, key=_stable_attraction_key)
        if not remaining:
            continue

        start_coordinates = _coordinates_of(start_location)
        if start_coordinates:
            current = min(
                remaining,
                key=lambda item: (
                    calculate_haversine_distance_km(
                        start_coordinates, _coordinates_of(item)
                    )
                    if _coordinates_of(item) is not None
                    else float("inf"),
                    _stable_attraction_key(item),
                ),
            )
            remaining.remove(current)
        else:
            current = remaining.pop(0)
        ordered.append(current)
        while remaining:
            current_coordinates = _coordinates_of(current)
            candidates_with_coordinates = [
                item for item in remaining if _coordinates_of(item) is not None
            ]
            if current_coordinates is None or not candidates_with_coordinates:
                next_attraction = remaining.pop(0)
            else:
                next_attraction = min(
                    candidates_with_coordinates,
                    key=lambda item: (
                        calculate_haversine_distance_km(
                            current_coordinates, _coordinates_of(item)
                        ),
                        _stable_attraction_key(item),
                    ),
                )
                remaining.remove(next_attraction)
            ordered.append(next_attraction)
            current = next_attraction
    return ordered


def _stable_attraction_key(attraction):
    return (
        attraction.get("category_id") or 0,
        (attraction.get("name") or "").casefold(),
        attraction.get("attraction_id") or 0,
    )


def _coordinates_of(attraction):
    if not isinstance(attraction, dict):
        return None
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
