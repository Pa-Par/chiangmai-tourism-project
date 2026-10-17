"""OSRM integration for optional, real road-route data.

The public OSRM demo service is best-effort. A route failure never prevents
the database-backed itinerary from being returned to the user.
"""

import json
from threading import Lock
from time import monotonic, sleep
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

OSRM_BASE_URL = "https://router.project-osrm.org"
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
MAX_ROUTE_STOPS = 25
MIN_OSRM_REQUEST_INTERVAL_SECONDS = 1.1
MIN_NOMINATIM_REQUEST_INTERVAL_SECONDS = 1.1
_osrm_request_lock = Lock()
_last_osrm_request_at = 0.0
_nominatim_request_lock = Lock()
_last_nominatim_request_at = 0.0


def optimize_itinerary_routes(
    itinerary_days,
    start_locations,
    use_start_location_each_day,
    timeout_seconds,
):
    """Optimize each day from its user-supplied origin with OSRM."""
    updated_days = []
    route_days = []

    for day in itinerary_days:
        origin = start_locations.get(day["day"])
        if origin is None and use_start_location_each_day:
            origin = start_locations.get(1)
        optimized_attractions, route_data = optimize_day_route(
            day["attractions"],
            origin,
            timeout_seconds,
        )
        updated_day = dict(day)
        updated_day["attractions"] = optimized_attractions
        updated_days.append(updated_day)
        route_days.append({"day": day["day"], **route_data})

    return updated_days, {
        "source": "osrm",
        "start_location": start_locations.get(1),
        "start_locations": start_locations,
        "days": route_days,
    }


def search_nominatim_locations(query, timeout_seconds):
    """Search Thai locations through Nominatim for the start-point picker.

    The browser calls Flask instead of the public endpoint directly because
    the public service does not consistently permit browser CORS requests.
    Requests are deliberately low-volume and limited to five Thai results.
    """
    parameters = urlencode(
        {
            "q": query,
            "format": "jsonv2",
            "limit": "5",
            "countrycodes": "th",
            "accept-language": "th,en",
        }
    )
    _respect_nominatim_request_interval()
    request = Request(
        f"{NOMINATIM_SEARCH_URL}?{parameters}",
        headers={
            "User-Agent": (
                "ChiangMaiNatureGuide/1.0 "
                "(https://github.com/Pa-Par/chiangmai-tourism-project)"
            )
        },
        method="GET",
    )
    with urlopen(request, timeout=timeout_seconds) as response:
        response_data = json.loads(response.read().decode("utf-8"))

    if not isinstance(response_data, list):
        raise ValueError("Nominatim did not return a result list")

    return [
        result
        for result in response_data
        if isinstance(result, dict)
        and _is_coordinate_pair(result.get("lon"), result.get("lat"))
    ]


def optimize_day_route(attractions, start_location, timeout_seconds):
    """Request an OSRM driving route and preserve the returned stop order."""
    original_attractions = list(attractions)
    if not original_attractions:
        return original_attractions, _route_status("no_stops", "ไม่มีสถานที่ในวันนี้")
    if not start_location:
        return original_attractions, _route_status(
            "missing_start_location",
            "ยังไม่ได้ระบุจุดเริ่มต้น จึงไม่คำนวณเส้นทางถนนจริง",
        )
    if len(original_attractions) > MAX_ROUTE_STOPS:
        return original_attractions, _route_status(
            "too_many_stops",
            "มีจำนวนสถานที่เกินขีดจำกัดสำหรับการคำนวณเส้นทางครั้งเดียว",
        )

    origin_coordinates = _coordinates_of(start_location)
    stop_coordinates = [_coordinates_of(attraction) for attraction in original_attractions]
    if origin_coordinates is None or any(coordinates is None for coordinates in stop_coordinates):
        return original_attractions, _route_status(
            "missing_coordinates",
            "มีสถานที่บางแห่งไม่มีพิกัดที่ใช้คำนวณเส้นทางถนนได้",
        )

    try:
        if len(original_attractions) == 1:
            route, path = _request_osrm_route(
                [origin_coordinates, stop_coordinates[0]],
                timeout_seconds,
            )
            ordered_attractions = original_attractions
        else:
            route, path, waypoint_order = _request_osrm_trip(
                [origin_coordinates, *stop_coordinates],
                timeout_seconds,
            )
            ordered_attractions = [
                original_attractions[index - 1]
                for index in waypoint_order
                if index > 0 and index <= len(original_attractions)
            ]
            if len(ordered_attractions) != len(original_attractions):
                raise ValueError("Incomplete OSRM waypoint order")
    except (
        HTTPError,
        URLError,
        TimeoutError,
        OSError,
        KeyError,
        IndexError,
        TypeError,
        ValueError,
        json.JSONDecodeError,
    ):
        return original_attractions, _route_status(
            "unavailable",
            "ไม่สามารถคำนวณเส้นทางถนนด้วย OSRM ได้ในขณะนี้",
        )

    return ordered_attractions, {
        "status": "success",
        "message": "ลำดับและข้อมูลเส้นทางถนนคำนวณจาก OSRM",
        "origin": _public_location(start_location),
        "distance_meters": _number_or_none(route.get("distance")),
        "duration_seconds": _number_or_none(route.get("duration")),
        "legs": [
            {
                "distance_meters": _number_or_none(leg.get("distance")),
                "duration_seconds": _number_or_none(leg.get("duration")),
            }
            for leg in route.get("legs", [])
        ],
        "polyline": None,
        "path": path,
        "optimized_attraction_ids": [
            attraction.get("attraction_id") for attraction in ordered_attractions
        ],
    }


def _request_osrm_trip(coordinates, timeout_seconds):
    response_data = _request_osrm(
        "trip",
        coordinates,
        "roundtrip=false&source=first&destination=any&steps=false&geometries=geojson&overview=full",
        timeout_seconds,
    )
    route = response_data["trips"][0]
    waypoint_order = [
        index
        for index, _waypoint in sorted(
            enumerate(response_data["waypoints"]),
            key=lambda item: int(item[1].get("waypoint_index")),
        )
    ]
    return route, _geometry_path(route), waypoint_order


def _request_osrm_route(coordinates, timeout_seconds):
    response_data = _request_osrm(
        "route",
        coordinates,
        "steps=false&geometries=geojson&overview=full",
        timeout_seconds,
    )
    route = response_data["routes"][0]
    return route, _geometry_path(route)


def _request_osrm(service, coordinates, query, timeout_seconds):
    coordinate_text = ";".join(
        f"{longitude:.6f},{latitude:.6f}" for latitude, longitude in coordinates
    )
    endpoint = (
        f"{OSRM_BASE_URL}/{service}/v1/driving/"
        f"{quote(coordinate_text, safe=',;.')}?{query}"
    )
    _respect_osrm_request_interval()
    request = Request(
        endpoint,
        headers={"User-Agent": "ChiangMaiNatureGuide/1.0 (undergraduate research project)"},
        method="GET",
    )
    with urlopen(request, timeout=timeout_seconds) as response:
        response_data = json.loads(response.read().decode("utf-8"))
    if response_data.get("code") != "Ok":
        raise ValueError("OSRM did not return a route")
    return response_data


def _respect_osrm_request_interval():
    global _last_osrm_request_at
    with _osrm_request_lock:
        wait_seconds = MIN_OSRM_REQUEST_INTERVAL_SECONDS - (monotonic() - _last_osrm_request_at)
        if wait_seconds > 0:
            sleep(wait_seconds)
        _last_osrm_request_at = monotonic()


def _respect_nominatim_request_interval():
    global _last_nominatim_request_at
    with _nominatim_request_lock:
        wait_seconds = MIN_NOMINATIM_REQUEST_INTERVAL_SECONDS - (
            monotonic() - _last_nominatim_request_at
        )
        if wait_seconds > 0:
            sleep(wait_seconds)
        _last_nominatim_request_at = monotonic()


def _geometry_path(route):
    coordinates = route.get("geometry", {}).get("coordinates", [])
    return [
        {"lat": float(latitude), "lng": float(longitude)}
        for longitude, latitude in coordinates
        if _is_coordinate_pair(longitude, latitude)
    ]


def _is_coordinate_pair(longitude, latitude):
    try:
        return -180 <= float(longitude) <= 180 and -90 <= float(latitude) <= 90
    except (TypeError, ValueError):
        return False


def _coordinates_of(attraction):
    try:
        latitude = float(attraction.get("latitude"))
        longitude = float(attraction.get("longitude"))
    except (AttributeError, TypeError, ValueError):
        return None
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        return None
    return latitude, longitude


def _number_or_none(value):
    try:
        return float(value)
    except (TypeError, ValueError):
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
        "path": [],
        "legs": [],
        "optimized_attraction_ids": [],
    }
