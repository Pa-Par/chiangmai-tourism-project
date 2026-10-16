export const DEFAULT_TRIP_START_TIME = "08:00";

export function timeToMinutes(time) {
  if (typeof time !== "string") return null;
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function getRoadTravelSeconds(routeDay, attractionIndex) {
  if (routeDay?.status !== "success") return null;
  const seconds = Number(routeDay.legs?.[attractionIndex]?.duration_seconds);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

export function createDaySchedule(attractions, routeDay, tripStartTime) {
  let previousDepartureTime = timeToMinutes(tripStartTime) ?? timeToMinutes(DEFAULT_TRIP_START_TIME);

  return attractions.map((attraction, index) => {
    const openingTime = timeToMinutes(attraction.open_time?.slice(0, 5));
    const closingTime = timeToMinutes(attraction.close_time?.slice(0, 5));
    const visitDuration = Number(attraction.visit_duration);
    const hasVisitDuration = Number.isFinite(visitDuration) && visitDuration >= 0;
    const roadTravelSeconds = getRoadTravelSeconds(routeDay, index);
    const hasRoadTravelTime = roadTravelSeconds !== null;

    // This is a display conversion of Google Maps' actual duration; a missing
    // route never receives a guessed travel time.
    const travelMinutes = hasRoadTravelTime ? Math.ceil(roadTravelSeconds / 60) : null;
    const departureTime = previousDepartureTime;
    const arrivalTime = hasRoadTravelTime && departureTime !== null
      ? departureTime + travelMinutes
      : null;
    const waitingMinutes = arrivalTime !== null && openingTime !== null && arrivalTime < openingTime
      ? openingTime - arrivalTime
      : 0;
    const visitStartTime = arrivalTime === null ? null : arrivalTime + waitingMinutes;
    const leaveTime = visitStartTime !== null && hasVisitDuration
      ? visitStartTime + visitDuration
      : null;

    previousDepartureTime = leaveTime;
    return {
      attraction,
      departureTime,
      arrivalTime,
      visitStartTime,
      leaveTime,
      travelMinutes,
      hasRoadTravelTime,
      waitingMinutes,
      hasVisitDuration,
      arrivesAfterClosing: arrivalTime !== null && closingTime !== null && arrivalTime >= closingTime,
      exceedsClosingTime: leaveTime !== null && closingTime !== null && leaveTime > closingTime,
    };
  });
}
