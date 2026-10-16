"""Server-side Google Routes API integration for real road-route data.

The module is deliberately optional.  If the server key, a user-supplied
start point, or complete coordinates are unavailable, it returns an explicit
status and preserves the safe deterministic itinerary order instead of
presenting a straight-line estimate as a road route.
"""

import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from services.recommendation_service import calculate_haversine_distance_km


ROUTES_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes"
ROUTES_FIELDMASK = (
    "routes.distanceMeters,routes.duration,routes.legs.distanceMeters,"
    "routes.legs.duration,routes.polyline.encodedPolyline,"
    "routes.optimizedIntermediateWaypointIndex"
)
MAX_ROUTE_STOPS = 25


def optimize_itinerary_routes(
    itinerary_days,
    start_locations,
    use_start_location_each_day,
    api_key,
    timeout_seconds,
):
    """Optimize from a user-provided origin without inventing overnight stays.

    Day 1 uses its supplied origin.  Other days only use the Day 1 origin when the user has
    explicitly indicated the same starting point applies each day.  Otherwise
    their geographically grouped order is retained and marked as not
    road-calculated; the system never invents an overnight location.
    """
    updated_days = []
    route_days = []

    for day in itinerary_days:
        origin = start_locations.get(day["day"])
        if origin is None and use_start_location_each_day:
            origin = start_locations.get(1)
        optimized_attractions, route_data = optimize_day_route(
            day["attractions"],
            origin,
            api_key,
            timeout_seconds,
        )
        updated_day = dict(day)
        updated_day["attractions"] = optimized_attractions
        updated_days.append(updated_day)
        route_days.append({"day": day["day"], **route_data})

    return updated_days, {
        "start_location": start_locations.get(1),
        "start_locations": start_locations,
        "days": route_days,
    }


def optimize_day_route(attractions, start_location, api_key, timeout_seconds):
    """Call Google Routes API for one day and return reordered attractions."""
    original_attractions = list(attractions)
    if not original_attractions:
        return original_attractions, _route_status("no_stops", "ไม่มีสถานที่ในวันนี้")
    if not start_location:
        return original_attractions, _route_status(
            "missing_start_location",
            "ยังไม่ได้ระบุจุดเริ่มต้น จึงไม่คำนวณเส้นทางถนนจริง",
        )
    if not api_key:
        return original_attractions, _route_status(
            "not_configured",
            "ยังไม่ได้ตั้งค่า Google Maps Routes API ฝั่งเซิร์ฟเวอร์",
        )
    if len(original_attractions) > MAX_ROUTE_STOPS:
        return original_attractions, _route_status(
            "too_many_stops",
            "มีจำนวนสถานที่เกินขีดจำกัดสำหรับการคำนวณเส้นทางครั้งเดียว",
        )

    stop_coordinates = [_coordinates_of(attraction) for attraction in original_attractions]
    if any(coordinates is None for coordinates in stop_coordinates):
        return original_attractions, _route_status(
            "missing_coordinates",
            "มีสถานที่บางแห่งไม่มีพิกัดที่ใช้คำนวณเส้นทางถนนได้",
        )

    # Directions needs a fixed destination.  Select the geographically furthest
    # candidate from the user origin, then let Google optimize all intermediate
    # stops using actual road-route data.  This avoids assuming a return trip.
    origin_coordinates = (start_location["latitude"], start_location["longitude"])
    destination_index = max(
        range(len(original_attractions)),
        key=lambda index: calculate_haversine_distance_km(
            origin_coordinates, stop_coordinates[index]
        ),
    )
    destination = original_attractions[destination_index]
    intermediates = [
        attraction
        for index, attraction in enumerate(original_attractions)
        if index != destination_index
    ]

    request_body = {
        "origin": _route_waypoint(start_location),
        "destination": _route_waypoint(destination),
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE",
        "computeAlternativeRoutes": False,
        "optimizeWaypointOrder": bool(intermediates),
    }
    if intermediates:
        request_body["intermediates"] = [_route_waypoint(item) for item in intermediates]

    request = Request(
        ROUTES_ENDPOINT,
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": ROUTES_FIELDMASK,
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            response_data = json.loads(response.read().decode("utf-8"))
        route = response_data["routes"][0]
    except (HTTPError, URLError, TimeoutError, OSError, KeyError, IndexError, TypeError, json.JSONDecodeError):
        return original_attractions, _route_status(
            "unavailable",
            "ไม่สามารถคำนวณเส้นทางถนนด้วย Google Maps ได้ในขณะนี้",
        )

    optimized_indexes = route.get("optimizedIntermediateWaypointIndex", [])
    try:
        ordered_intermediates = [intermediates[int(index)] for index in optimized_indexes]
        if len(ordered_intermediates) != len(intermediates):
            raise ValueError("Incomplete waypoint optimization")
    except (TypeError, ValueError, IndexError):
        ordered_intermediates = intermediates

    ordered_attractions = [*ordered_intermediates, destination]
    return ordered_attractions, {
        "status": "success",
        "message": "ลำดับและข้อมูลเส้นทางถนนคำนวณจาก Google Maps Routes API",
        "origin": _public_location(start_location),
        "distance_meters": route.get("distanceMeters"),
        "duration_seconds": _duration_to_seconds(route.get("duration")),
        "polyline": route.get("polyline", {}).get("encodedPolyline"),
        "legs": [
            {
                "distance_meters": leg.get("distanceMeters"),
                "duration_seconds": _duration_to_seconds(leg.get("duration")),
            }
            for leg in route.get("legs", [])
        ],
        "optimized_attraction_ids": [
            attraction.get("attraction_id") for attraction in ordered_attractions
        ],
    }


def _route_waypoint(location):
    return {
        "location": {
            "latLng": {
                "latitude": float(location["latitude"]),
                "longitude": float(location["longitude"]),
            }
        }
    }


def _coordinates_of(attraction):
    try:
        latitude = float(attraction.get("latitude"))
        longitude = float(attraction.get("longitude"))
    except (TypeError, ValueError):
        return None
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        return None
    return latitude, longitude


def _duration_to_seconds(value):
    if not isinstance(value, str) or not value.endswith("s"):
        return None
    try:
        return round(float(value[:-1]))
    except ValueError:
        return None


def _public_location(location):
    return {
        "name": location.get("name"),
        "latitude": float(location["latitude"]),
        "longitude": float(location["longitude"]),
    }


def _route_status(status, message):
    return {
        "status": status,
        "message": message,
        "origin": None,
        "distance_meters": None,
        "duration_seconds": None,
        "polyline": None,
        "legs": [],
        "optimized_attraction_ids": [],
    }
