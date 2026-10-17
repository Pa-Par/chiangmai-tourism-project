const EARTH_RADIUS_KM = 6371.0088;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function angularDistance(first, second) {
  const latitudeDifference = toRadians(second.lat - first.lat);
  const longitudeDifference = toRadians(second.lng - first.lng);
  const haversineValue =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(toRadians(first.lat)) *
      Math.cos(toRadians(second.lat)) *
      Math.sin(longitudeDifference / 2) ** 2;

  return 2 * Math.atan2(
    Math.sqrt(haversineValue),
    Math.sqrt(Math.max(0, 1 - haversineValue)),
  );
}

function initialBearing(first, second) {
  const firstLatitude = toRadians(first.lat);
  const secondLatitude = toRadians(second.lat);
  const longitudeDifference = toRadians(second.lng - first.lng);
  return Math.atan2(
    Math.sin(longitudeDifference) * Math.cos(secondLatitude),
    Math.cos(firstLatitude) * Math.sin(secondLatitude) -
      Math.sin(firstLatitude) * Math.cos(secondLatitude) * Math.cos(longitudeDifference),
  );
}

export function toRoutePoint(item) {
  const latitude = Number(item?.latitude ?? item?.lat);
  const longitude = Number(item?.longitude ?? item?.lng);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    latitude === 0 ||
    longitude === 0
  ) {
    return null;
  }
  return { lat: latitude, lng: longitude };
}

export function hasRouteCoordinates(item) {
  return toRoutePoint(item) !== null;
}

export function haversineDistanceKm(first, second) {
  return angularDistance(first, second) * EARTH_RADIUS_KM;
}

/**
 * Return the geographic distance from a point to a segment of the road route.
 * The segment and cafe both come from actual latitude/longitude values.  The
 * calculation is geodesic (Haversine/cross-track), not a driving distance.
 */
export function distanceToRouteSegmentKm(point, start, end) {
  const segmentAngularDistance = angularDistance(start, end);
  if (!segmentAngularDistance) return haversineDistanceKm(point, start);

  const pointFromStartAngularDistance = angularDistance(start, point);
  const segmentBearing = initialBearing(start, end);
  const pointBearing = initialBearing(start, point);
  const bearingDifference = pointBearing - segmentBearing;
  const crossTrackAngularDistance = Math.asin(
    Math.max(
      -1,
      Math.min(1, Math.sin(pointFromStartAngularDistance) * Math.sin(bearingDifference)),
    ),
  );
  const alongTrackAngularDistance = Math.atan2(
    Math.sin(pointFromStartAngularDistance) * Math.cos(bearingDifference),
    Math.cos(pointFromStartAngularDistance),
  );

  if (
    alongTrackAngularDistance < 0 ||
    alongTrackAngularDistance > segmentAngularDistance
  ) {
    return Math.min(
      haversineDistanceKm(point, start),
      haversineDistanceKm(point, end),
    );
  }

  return Math.abs(crossTrackAngularDistance) * EARTH_RADIUS_KM;
}

export function getRouteCafeRecommendations(
  cafeCandidates,
  routePlan,
  { maxDistanceKm = 5, limit = 3 } = {},
) {
  const routeDays = (routePlan?.days || [])
    .filter((day) => day.status === "success" && Array.isArray(day.path) && day.path.length > 1)
    .map((day) => ({
      ...day,
      path: day.path.map(toRoutePoint).filter(Boolean),
    }))
    .filter((day) => day.path.length > 1);

  if (!routeDays.length) return [];

  return cafeCandidates.flatMap((cafe) => {
    const cafePoint = toRoutePoint(cafe);
    if (!cafePoint) return [];

    let nearestRouteDistanceKm = Infinity;
    let nearestRouteDay = null;
    routeDays.forEach((routeDay) => {
      for (let index = 0; index < routeDay.path.length - 1; index += 1) {
        const distanceKm = distanceToRouteSegmentKm(
          cafePoint,
          routeDay.path[index],
          routeDay.path[index + 1],
        );
        if (distanceKm < nearestRouteDistanceKm) {
          nearestRouteDistanceKm = distanceKm;
          nearestRouteDay = routeDay.day;
        }
      }
    });

    if (nearestRouteDistanceKm > maxDistanceKm || nearestRouteDay === null) return [];
    return [{
      ...cafe,
      route_day: nearestRouteDay,
      nearest_route_distance_km: Number(nearestRouteDistanceKm.toFixed(1)),
      route_distance_method: "haversine_polyline",
    }];
  }).sort((first, second) => (
    first.nearest_route_distance_km - second.nearest_route_distance_km ||
    first.name.localeCompare(second.name)
  )).slice(0, limit);
}
