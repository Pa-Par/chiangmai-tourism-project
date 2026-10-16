import { useEffect, useMemo, useRef, useState } from "react";

import { loadGoogleMaps } from "../services/googleMapsLoader";

function hasCoordinates(location) {
  const latitude = Number(location?.latitude ?? location?.lat);
  const longitude = Number(location?.longitude ?? location?.lng);
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude !== 0 &&
    longitude !== 0
  );
}

function toLatLng(location) {
  return {
    lat: Number(location.latitude ?? location.lat),
    lng: Number(location.longitude ?? location.lng),
  };
}

function haversineKilometers(from, to) {
  const earthRadiusKm = 6371;
  const toRadians = (value) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lng - from.lng);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getStartLocation(startLocations, day, useSameStartLocation) {
  const normalized = Array.isArray(startLocations)
    ? startLocations
    : Object.entries(startLocations || {}).map(([key, value]) => ({
        ...value,
        day: Number(value?.day || key),
      }));
  const matchingDay = normalized.find((location) => Number(location?.day) === Number(day));
  const dayOne = normalized.find((location) => Number(location?.day) === 1);
  const location = matchingDay || (useSameStartLocation ? dayOne : null);
  return hasCoordinates(location) ? location : null;
}

function formatDistance(meters, t) {
  return `${(Number(meters) / 1000).toFixed(1)} ${t.distanceUnit}`;
}

function formatTravelTime(seconds, t) {
  const totalMinutes = Math.max(1, Math.round(Number(seconds) / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} ${t.minute}`;
  if (!minutes) return `${hours} ${t.hour}`;
  return `${hours} ${t.hour} ${minutes} ${t.minute}`;
}

function toDurationSeconds(durationMillis) {
  const value = Number(durationMillis);
  return Number.isFinite(value) ? Math.round(value / 1000) : null;
}

function chooseDestination(origin, stops) {
  return stops.reduce((farthestStop, stop) => {
    const farthestDistance = haversineKilometers(origin, toLatLng(farthestStop));
    const candidateDistance = haversineKilometers(origin, toLatLng(stop));
    return candidateDistance > farthestDistance ? stop : farthestStop;
  }, stops[0]);
}

function getRouteRequestKey(days, startLocations, useSameStartLocation) {
  return JSON.stringify({
    useSameStartLocation,
    days: days.map((day) => ({
      day: day.day,
      origin: getStartLocation(startLocations, day.day, useSameStartLocation)
        ? toLatLng(getStartLocation(startLocations, day.day, useSameStartLocation))
        : null,
      // Sorting creates one stable request identity even after the API returns
      // an improved stop order for the displayed itinerary.
      stops: [...day.attractions]
        .filter(hasCoordinates)
        .map((attraction) => ({
          id: attraction.attraction_id,
          ...toLatLng(attraction),
        }))
        .sort((first, second) => String(first.id).localeCompare(String(second.id))),
    })),
  });
}

function createInfoWindowContent(documentRef, title, details) {
  const wrapper = documentRef.createElement("div");
  const heading = documentRef.createElement("strong");
  heading.textContent = title;
  wrapper.append(heading);
  if (details) {
    const description = documentRef.createElement("div");
    description.textContent = details;
    description.style.marginTop = "4px";
    description.style.fontSize = "12px";
    wrapper.append(description);
  }
  return wrapper;
}

function TripMap({
  itinerary,
  routePlan,
  startLocations,
  useSameStartLocation,
  onRoutesComputed,
  optionalCafes = [],
  t,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const overlaysRef = useRef([]);
  const onRoutesComputedRef = useRef(onRoutesComputed);
  const lastRequestKeyRef = useRef("");
  const [mapContext, setMapContext] = useState(null);
  const [mapStatus, setMapStatus] = useState("loading");

  useEffect(() => {
    onRoutesComputedRef.current = onRoutesComputed;
  }, [onRoutesComputed]);

  const days = useMemo(
    () => (itinerary || []).map((day) => ({
      day: Number(day.day),
      attractions: day.attractions || [],
    })),
    [itinerary],
  );
  const visibleStops = useMemo(
    () => days.flatMap((day) => day.attractions.filter(hasCoordinates).map((attraction, index) => ({
      ...attraction,
      itinerary_day: day.day,
      itinerary_order: index + 1,
    }))),
    [days],
  );
  const origins = useMemo(
    () => days.map((day) => ({
      day: day.day,
      location: getStartLocation(startLocations, day.day, useSameStartLocation),
    })).filter((entry) => entry.location),
    [days, startLocations, useSameStartLocation],
  );
  const requestKey = useMemo(
    () => getRouteRequestKey(days, startLocations, useSameStartLocation),
    [days, startLocations, useSameStartLocation],
  );
  const mapKey = useMemo(
    () => JSON.stringify({
      stops: visibleStops.map((stop) => ({
        id: stop.attraction_id,
        day: stop.itinerary_day,
        order: stop.itinerary_order,
        ...toLatLng(stop),
      })),
      origins: origins.map((origin) => ({ day: origin.day, ...toLatLng(origin.location) })),
      paths: (routePlan?.days || []).map((day) => ({ day: day.day, path: day.path || [] })),
      optionalCafes: optionalCafes.filter(hasCoordinates).map((cafe) => ({
        id: cafe.attraction_id,
        ...toLatLng(cafe),
      })),
    }),
    [optionalCafes, origins, routePlan, visibleStops],
  );

  const initialCenter = visibleStops[0]
    ? toLatLng(visibleStops[0])
    : origins[0]
      ? toLatLng(origins[0].location)
      : null;

  useEffect(() => {
    let disposed = false;
    if (!initialCenter) {
      setMapStatus("empty");
      return undefined;
    }

    async function initializeMap() {
      try {
        const maps = await loadGoogleMaps();
        if (disposed || !mapContainerRef.current) return;
        const map = new maps.Map(mapContainerRef.current, {
          center: initialCenter,
          zoom: 10,
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          gestureHandling: "cooperative",
        });
        mapRef.current = map;
        setMapContext({ maps, map });
        setMapStatus("ready");
      } catch {
        if (!disposed) setMapStatus("error");
      }
    }

    initializeMap();
    return () => {
      disposed = true;
      overlaysRef.current.forEach((overlay) => overlay.setMap?.(null));
      overlaysRef.current = [];
      mapRef.current = null;
      setMapContext(null);
    };
  }, [initialCenter?.lat, initialCenter?.lng]);

  useEffect(() => {
    if (!mapContext || !requestKey || lastRequestKeyRef.current === requestKey) return;
    lastRequestKeyRef.current = requestKey;
    let cancelled = false;

    async function calculateRoutes() {
      const computedDays = [];
      let Route;
      const hasRoutableDay = days.some((day) => (
        day.attractions.length > 0 &&
        day.attractions.every(hasCoordinates) &&
        getStartLocation(startLocations, day.day, useSameStartLocation)
      ));
      if (hasRoutableDay) {
        try {
          ({ Route } = await mapContext.maps.importLibrary("routes"));
        } catch {
          Route = null;
        }
      }

      for (const day of days) {
        const origin = getStartLocation(startLocations, day.day, useSameStartLocation);
        if (!day.attractions.length) {
          computedDays.push({ day: day.day, status: "no_stops", legs: [], path: [] });
          continue;
        }
        if (!day.attractions.every(hasCoordinates)) {
          computedDays.push({ day: day.day, status: "missing_coordinates", legs: [], path: [] });
          continue;
        }
        if (!origin) {
          computedDays.push({ day: day.day, status: "missing_start_location", legs: [], path: [] });
          continue;
        }
        if (!Route) {
          computedDays.push({ day: day.day, status: "unavailable", legs: [], path: [] });
          continue;
        }

        try {
          const originPoint = toLatLng(origin);
          const destination = chooseDestination(originPoint, day.attractions);
          const intermediates = day.attractions.filter(
            (attraction) => attraction.attraction_id !== destination.attraction_id,
          );
          const response = await Route.computeRoutes({
            origin: originPoint,
            destination: toLatLng(destination),
            intermediates: intermediates.map((attraction) => ({ location: toLatLng(attraction) })),
            travelMode: mapContext.maps.TravelMode?.DRIVING || "DRIVING",
            optimizeWaypointOrder: intermediates.length > 0,
            fields: [
              "path",
              "legs",
              "distanceMeters",
              "durationMillis",
              "optimizedIntermediateWaypointIndices",
            ],
          });
          const route = response?.routes?.[0];
          if (!route) throw new Error("No route returned");

          const optimizedIndexes = route.optimizedIntermediateWaypointIndices;
          const optimizedIntermediates = Array.isArray(optimizedIndexes) &&
            optimizedIndexes.length === intermediates.length
            ? optimizedIndexes.map((index) => intermediates[index]).filter(Boolean)
            : intermediates;
          const orderedAttractions = [...optimizedIntermediates, destination];
          computedDays.push({
            day: day.day,
            status: "success",
            origin: { name: origin.name || "", ...originPoint },
            distance_meters: Number(route.distanceMeters),
            duration_seconds: toDurationSeconds(route.durationMillis),
            legs: (route.legs || []).map((leg) => ({
              distance_meters: Number(leg.distanceMeters),
              duration_seconds: toDurationSeconds(leg.durationMillis),
            })),
            path: (route.path || []).map((point) => ({
              lat: typeof point.lat === "function" ? point.lat() : Number(point.lat),
              lng: typeof point.lng === "function" ? point.lng() : Number(point.lng),
            })).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
            ordered_attraction_ids: orderedAttractions.map((attraction) => attraction.attraction_id),
          });
        } catch {
          computedDays.push({ day: day.day, status: "unavailable", legs: [], path: [] });
        }
      }

      if (!cancelled) {
        onRoutesComputedRef.current?.({
          source: "maps_javascript_routes",
          days: computedDays,
        });
      }
    }

    calculateRoutes();
    return () => {
      cancelled = true;
    };
  }, [days, mapContext, requestKey, startLocations, useSameStartLocation]);

  useEffect(() => {
    if (!mapContext) return undefined;
    const { maps, map } = mapContext;
    overlaysRef.current.forEach((overlay) => overlay.setMap?.(null));
    overlaysRef.current = [];
    const infoWindow = new maps.InfoWindow();
    const bounds = new maps.LatLngBounds();

    origins.forEach(({ day, location }) => {
      const position = toLatLng(location);
      const marker = new maps.Marker({
        map,
        position,
        label: { text: `S${day}`, color: "#ffffff", fontWeight: "700" },
        title: location.name || t.selectedStartLocation,
        zIndex: 5,
      });
      marker.addListener("click", () => {
        infoWindow.setContent(createInfoWindowContent(
          document,
          location.name || t.selectedStartLocation,
          `${t.mapInfoDay} ${day}`,
        ));
        infoWindow.open({ map, anchor: marker });
      });
      overlaysRef.current.push(marker);
      bounds.extend(position);
    });

    visibleStops.forEach((attraction, index) => {
      const position = toLatLng(attraction);
      const marker = new maps.Marker({
        map,
        position,
        label: { text: String(index + 1), color: "#ffffff", fontWeight: "700" },
        title: attraction.name,
      });
      marker.addListener("click", () => {
        infoWindow.setContent(createInfoWindowContent(
          document,
          attraction.name,
          `${t.mapInfoDay} ${attraction.itinerary_day} · ${t.mapInfoOrder} ${attraction.itinerary_order}`,
        ));
        infoWindow.open({ map, anchor: marker });
      });
      overlaysRef.current.push(marker);
      bounds.extend(position);
    });

    optionalCafes.filter(hasCoordinates).forEach((cafe) => {
      const position = toLatLng(cafe);
      const marker = new maps.Marker({
        map,
        position,
        label: { text: "C", color: "#ffffff", fontWeight: "700" },
        title: cafe.name,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          fillColor: "#b4772d",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          scale: 11,
        },
        zIndex: 4,
      });
      marker.addListener("click", () => {
        infoWindow.setContent(createInfoWindowContent(
          document,
          cafe.name,
          `${t.optionalCafeStop} · ${t.routeDay(cafe.route_day)}`,
        ));
        infoWindow.open({ map, anchor: marker });
      });
      overlaysRef.current.push(marker);
      bounds.extend(position);
    });

    (routePlan?.days || []).filter((day) => day.status === "success" && day.path?.length > 1)
      .forEach((day) => {
        const polyline = new maps.Polyline({
          map,
          path: day.path,
          strokeColor: "#217346",
          strokeOpacity: 0.86,
          strokeWeight: 5,
        });
        overlaysRef.current.push(polyline);
        day.path.forEach((point) => bounds.extend(point));
      });

    if (!bounds.isEmpty()) map.fitBounds(bounds, 52);
    return () => {
      infoWindow.close();
      overlaysRef.current.forEach((overlay) => overlay.setMap?.(null));
      overlaysRef.current = [];
    };
  }, [mapContext, mapKey, optionalCafes, origins, routePlan, t, visibleStops]);

  const successfulRouteDays = (routePlan?.days || []).filter((day) => day.status === "success");
  const hasIncompleteRoadRoute = (routePlan?.days || []).some(
    (day) => !["success", "no_stops"].includes(day.status),
  );
  const totalDistance = successfulRouteDays.reduce(
    (total, day) => total + (Number.isFinite(day.distance_meters) ? day.distance_meters : 0),
    0,
  );
  const totalTime = successfulRouteDays.reduce(
    (total, day) => total + (Number.isFinite(day.duration_seconds) ? day.duration_seconds : 0),
    0,
  );
  const allDaysRouted = days.length > 0 && days.every((day) => {
    const routeDay = routePlan?.days?.find((item) => Number(item.day) === day.day);
    return !day.attractions.length || routeDay?.status === "success";
  });
  const externalMapLinks = successfulRouteDays.flatMap((routeDay) => {
    const routeStops = (
      itinerary.find((day) => Number(day.day) === Number(routeDay.day))?.attractions || []
    ).filter(hasCoordinates);
    const selectedCafesForDay = optionalCafes.filter((cafe) => (
      Number(cafe.route_day) === Number(routeDay.day) && hasCoordinates(cafe)
    ));

    if (!hasCoordinates(routeDay.origin) || !routeStops.length) return [];

    // The main itinerary destination remains fixed. Selected cafés are added
    // as Google Maps waypoints, so the external map can calculate a new road
    // route that includes them without changing the saved main itinerary.
    const destination = toLatLng(routeStops[routeStops.length - 1]);
    const waypoints = [...routeStops.slice(0, -1), ...selectedCafesForDay]
      .map((stop) => {
        const point = toLatLng(stop);
        return `${point.lat},${point.lng}`;
      });
    const origin = toLatLng(routeDay.origin);
    const parameters = new URLSearchParams({
      api: "1",
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      travelmode: "driving",
    });
    if (waypoints.length) parameters.set("waypoints", waypoints.join("|"));

    return [{
      day: routeDay.day,
      url: `https://www.google.com/maps/dir/?${parameters.toString()}`,
      optionalCafeCount: selectedCafesForDay.length,
    }];
  });

  return (
    <section className="result-card route-map-card">
      <div className="map-heading">
        <div>
          <p className="section-kicker">{t.mapPreview}</p>
          <h2>Chiang Mai Route Map</h2>
        </div>
        <span className="map-pin" aria-hidden="true">⌖</span>
      </div>

      {mapStatus === "empty" ? (
        <p className="route-empty-state">{t.mapNoCoordinates}</p>
      ) : (
        <div className="google-route-map-shell">
          <div className="google-route-map" ref={mapContainerRef} />
          {mapStatus === "loading" && <p className="map-state-message">{t.mapLoading}</p>}
          {mapStatus === "error" && <p className="map-state-message map-error-message">{t.mapLoadError}</p>}
        </div>
      )}

      {visibleStops.length > 0 && (
        <ol className="route-timeline">
          {days.map((day) => (
            <li className="route-timeline-item" key={day.day}>
              <span className="route-day-label">{t.routeDay(day.day)}</span>
              {day.attractions.map((attraction, index) => {
                const routeDay = routePlan?.days?.find((item) => Number(item.day) === day.day);
                const nextLeg = routeDay?.status === "success" ? routeDay.legs?.[index + 1] : null;
                return (
                  <div key={attraction.attraction_id}>
                    <div className="route-stop">
                      <span className="route-stop-marker" aria-hidden="true" />
                      <strong>{attraction.name}</strong>
                    </div>
                    {index < day.attractions.length - 1 && (
                      <div className="route-leg">
                        <span aria-hidden="true">↓</span>
                        <small>{Number.isFinite(nextLeg?.distance_meters) && Number.isFinite(nextLeg?.duration_seconds)
                          ? `${formatDistance(nextLeg.distance_meters, t)} · ${formatTravelTime(nextLeg.duration_seconds, t)}`
                          : t.roadSegmentUnavailable}
                        </small>
                      </div>
                    )}
                  </div>
                );
              })}
            </li>
          ))}
        </ol>
      )}

      {routePlan === null && origins.length > 0 && mapStatus === "ready" && (
        <p className="route-road-status">{t.routeCalculating}</p>
      )}
      {hasIncompleteRoadRoute && (
        <p className="route-road-status">{t.routeApiUnavailable}</p>
      )}

      <div className="route-summary">
        <div><span>{t.routePlaceCount}</span><strong>{visibleStops.length} {t.placeUnit}</strong></div>
        <div><span>{t.totalRouteDistance}</span><strong>{allDaysRouted ? formatDistance(totalDistance, t) : t.notAvailable}</strong></div>
        <div><span>{t.totalRouteTime}</span><strong>{allDaysRouted ? formatTravelTime(totalTime, t) : t.notAvailable}</strong></div>
      </div>
      {externalMapLinks.length > 0 && (
        <div className="route-maps-links">
          {externalMapLinks.map((link) => (
            <div key={link.day}>
              <a className="route-maps-link" href={link.url} target="_blank" rel="noreferrer">
                {externalMapLinks.length > 1
                  ? `${t.openGoogleMapsRoute} · ${t.routeDay(link.day)}`
                  : t.openGoogleMapsRoute}
              </a>
              {link.optionalCafeCount > 0 && (
                <small>{t.googleMapsRouteIncludesCafes}</small>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="route-calculation-note">{t.routeCalculationNote}</p>
    </section>
  );
}

export default TripMap;
