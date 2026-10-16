"""Optional Gemini assistance after MySQL has supplied valid candidates.

Gemini is never allowed to create an attraction record.  It may only return
IDs supplied in the prompt, and the route layer validates those IDs again
against the candidate rows fetched from MySQL before making an itinerary.
"""

import json
from time import monotonic
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


GEMINI_ENDPOINT_TEMPLATE = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)
MAX_GEMINI_CANDIDATES = 40
_gemini_unavailable_until = 0.0


def select_candidate_attractions(
    candidates,
    days,
    api_key,
    model,
    timeout_seconds,
    failure_cooldown_seconds=60,
):
    """Ask Gemini to choose and order a subset of already-valid MySQL rows.

    The returned dictionary is intentionally safe to use as an optional layer:
    callers receive an empty ID list whenever Gemini is not configured or the
    response cannot be verified.  The rule-based result can then continue.
    """
    if not api_key:
        return _unavailable_result(
            "not_configured",
            "ยังไม่ได้ตั้งค่า Gemini API จึงใช้กฎจากฐานข้อมูลในการเลือกสถานที่",
        )

    # Do not make every new itinerary wait for a provider that has just timed
    # out. The deterministic, database-backed planner remains available while
    # this short in-memory cooldown is active.
    if monotonic() < _gemini_unavailable_until:
        return _unavailable_result(
            "unavailable",
            "Gemini ยังไม่พร้อมใช้งานชั่วคราว จึงใช้กฎจากฐานข้อมูลในการเลือกสถานที่",
        )

    compact_candidates = [_compact_candidate(item) for item in candidates[:MAX_GEMINI_CANDIDATES]]
    if not compact_candidates:
        return _unavailable_result("no_candidates", "ไม่มีสถานที่ที่ผ่านเงื่อนไขให้ Gemini วิเคราะห์")

    request_body = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": _build_prompt(compact_candidates, days),
                    }
                ],
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": _response_schema(),
        },
    }
    endpoint = GEMINI_ENDPOINT_TEMPLATE.format(model=quote(model, safe="-._"))
    http_request = Request(
        endpoint,
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )

    try:
        with urlopen(http_request, timeout=timeout_seconds) as response:
            api_response = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError):
        # Do not return upstream error text: it can be noisy and can reveal
        # deployment details.  The rule-based plan remains available.
        _start_failure_cooldown(failure_cooldown_seconds)
        return _unavailable_result(
            "unavailable",
            "ไม่สามารถใช้ Gemini ได้ในขณะนี้ จึงใช้กฎจากฐานข้อมูลในการเลือกสถานที่",
        )

    try:
        generated_text = "".join(
            part.get("text", "")
            for part in api_response["candidates"][0]["content"]["parts"]
        )
        generated = json.loads(generated_text)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        return _unavailable_result(
            "invalid_response",
            "Gemini ส่งผลลัพธ์ที่ตรวจสอบไม่ได้ จึงใช้กฎจากฐานข้อมูลในการเลือกสถานที่",
        )

    selected_ids = _unique_integer_ids(generated.get("selected_attraction_ids"))
    if not selected_ids:
        return _unavailable_result(
            "invalid_response",
            "Gemini ไม่ได้ส่งรหัสสถานที่ที่ใช้ได้ จึงใช้กฎจากฐานข้อมูลในการเลือกสถานที่",
        )

    return {
        "status": "used",
        "message": "Gemini วิเคราะห์เฉพาะตัวเลือกที่ผ่านการคัดกรองจากฐานข้อมูลแล้ว",
        "selected_attraction_ids": selected_ids,
        "trip_summary": _clean_optional_text(generated.get("trip_summary")),
        "transportation_recommendation": _clean_optional_text(
            generated.get("transportation_recommendation")
        ),
        "limitations": _clean_optional_text(generated.get("limitations")),
    }


def _build_prompt(candidates, days):
    return (
        "You are assisting a Chiang Mai nature-trip planner. MySQL has already "
        "filtered the following attraction candidates by the user's selected "
        "categories, optional zone, visit duration, and opening-hour "
        "data. Choose a diverse, practical subset for the requested trip. "
        "Return ONLY JSON matching the supplied schema. You MUST use only the "
        "attraction_id values from CANDIDATES. Never invent an attraction, price, "
        "coordinate, route distance, route time, opening hour, or source. Do not "
        "repeat IDs. If the candidates are insufficient, state that limitation "
        "briefly and still return the usable IDs. Keep both text fields concise.\n\n"
        f"TRIP_DAYS: {days}\n"
        f"CANDIDATES: {json.dumps(candidates, ensure_ascii=False)}"
    )


def _compact_candidate(candidate):
    return {
        "attraction_id": candidate.get("attraction_id"),
        "name": candidate.get("name"),
        "zone_id": candidate.get("zone_id"),
        "zone_name": candidate.get("zone_name"),
        "category_id": candidate.get("category_id"),
        "category_name": candidate.get("category_name"),
        "description": candidate.get("description"),
        "visit_duration": candidate.get("visit_duration"),
        "thai_free": _number_or_none(candidate.get("thai_free")),
        "open_time": str(candidate.get("open_time")) if candidate.get("open_time") else None,
        "close_time": str(candidate.get("close_time")) if candidate.get("close_time") else None,
    }


def _response_schema():
    return {
        "type": "OBJECT",
        "properties": {
            "selected_attraction_ids": {
                "type": "ARRAY",
                "items": {"type": "INTEGER"},
            },
            "trip_summary": {"type": "STRING"},
            "transportation_recommendation": {"type": "STRING"},
            "limitations": {"type": "STRING"},
        },
        "required": [
            "selected_attraction_ids",
            "trip_summary",
            "transportation_recommendation",
            "limitations",
        ],
    }


def _unique_integer_ids(values):
    if not isinstance(values, list):
        return []

    result = []
    for value in values:
        if isinstance(value, bool):
            continue
        try:
            attraction_id = int(value)
        except (TypeError, ValueError):
            continue
        if attraction_id > 0 and attraction_id not in result:
            result.append(attraction_id)
    return result


def _clean_optional_text(value):
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value[:600] if value else None


def _number_or_none(value):
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _unavailable_result(status, message):
    return {
        "status": status,
        "message": message,
        "selected_attraction_ids": [],
        "trip_summary": None,
        "transportation_recommendation": None,
        "limitations": None,
    }


def _start_failure_cooldown(value):
    """Avoid repeated slow calls after an upstream Gemini failure."""
    global _gemini_unavailable_until
    try:
        cooldown_seconds = max(0, int(value))
    except (TypeError, ValueError):
        cooldown_seconds = 60
    _gemini_unavailable_until = monotonic() + cooldown_seconds
