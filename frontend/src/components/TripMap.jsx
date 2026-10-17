import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

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

function createMarkerIcon(label, variant = "stop") {
  return L.divIcon({
    className: "leaflet-numbered-marker-wrapper",
    html: `<span class="leaflet-numbered-marker leaflet-numbered-marker--${variant}">${label}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

function FitMapBounds({ points, paths }) {
  const map = useMap();
  const boundsKey = JSON.stringify({ points, paths });

  useEffect(() => {
    const coordinates = [
      ...points.map((point) => [point.lat, point.lng]),
      ...paths.flatMap((path) => path.map((point) => [point.lat, point.lng])),
    ];
    if (coordinates.length) map.fitBounds(coordinates, { padding: [42, 42], maxZoom: 13 });
  }, [boundsKey, map, paths, points]);

  return null;
}

function TripMap({
  itinerary,
  routePlan,
  startLocations,
  useSameStartLocation,
  optionalCafes = [],
  t,
}) {
  const [mapStatus, setMapStatus] = useState("ready");

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

  const routedPaths = useMemo(
    () => (routePlan?.days || [])
      .filter((day) => day.status === "success" && Array.isArray(day.path) && day.path.length > 1)
      .map((day) => day.path.filter(hasCoordinates).map(toLatLng))
      .filter((path) => path.length > 1),
    [routePlan],
  );
  const optionalCafeStops = useMemo(
    () => optionalCafes.filter(hasCoordinates),
    [optionalCafes],
  );
  const allMapPoints = useMemo(
    () => [
      ...origins.map(({ location }) => toLatLng(location)),
      ...visibleStops.map(toLatLng),
      ...optionalCafeStops.map(toLatLng),
    ],
    [optionalCafeStops, origins, visibleStops],
  );
  const initialCenter = allMapPoints[0] || null;

  useEffect(() => {
    setMapStatus(initialCenter ? "ready" : "empty");
  }, [initialCenter?.lat, initialCenter?.lng]);

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

    // Keep the saved main itinerary unchanged. Optional cafés are passed only
    // to the external OSM directions page, which may calculate a new route.
    const origin = toLatLng(routeDay.origin);
    const destination = toLatLng(routeStops[routeStops.length - 1]);
    const routePoints = [
      origin,
      ...routeStops.slice(0, -1).map(toLatLng),
      ...selectedCafesForDay.map(toLatLng),
      destination,
    ]
      .map((point) => `${point.lat},${point.lng}`)
      .join(";");
    const parameters = new URLSearchParams({ engine: "fossgis_osrm_car", route: routePoints });

    return [{
      day: routeDay.day,
      url: `https://www.openstreetmap.org/directions?${parameters.toString()}`,
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

      {!initialCenter || mapStatus === "empty" ? (
        <p className="route-empty-state">{t.mapNoCoordinates}</p>
      ) : (
        <div className="osm-route-map-shell">
          <MapContainer
            center={[initialCenter.lat, initialCenter.lng]}
            zoom={10}
            className="osm-route-map leaflet-map"
            scrollWheelZoom={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              eventHandlers={{ tileerror: () => setMapStatus("error") }}
            />
            <FitMapBounds points={allMapPoints} paths={routedPaths} />
            {routedPaths.map((path, index) => (
              <Polyline
                key={`route-path-${index}`}
                positions={path.map((point) => [point.lat, point.lng])}
                pathOptions={{ color: "#217346", opacity: 0.86, weight: 5 }}
              />
            ))}
            {origins.map(({ day, location }) => {
              const point = toLatLng(location);
              return (
                <Marker key={`origin-${day}`} position={[point.lat, point.lng]} icon={createMarkerIcon(`S${day}`, "start")}>
                  <Popup>
                    <strong>{location.name || t.selectedStartLocation}</strong><br />
                    {t.mapInfoDay} {day}
                  </Popup>
                </Marker>
              );
            })}
            {visibleStops.map((attraction, index) => {
              const point = toLatLng(attraction);
              return (
                <Marker key={`stop-${attraction.attraction_id}-${attraction.itinerary_day}`} position={[point.lat, point.lng]} icon={createMarkerIcon(String(index + 1))}>
                  <Popup>
                    <strong>{attraction.name}</strong><br />
                    {t.mapInfoDay} {attraction.itinerary_day} · {t.mapInfoOrder} {attraction.itinerary_order}
                  </Popup>
                </Marker>
              );
            })}
            {optionalCafeStops.map((cafe) => {
              const point = toLatLng(cafe);
              return (
                <Marker key={`cafe-${cafe.attraction_id}`} position={[point.lat, point.lng]} icon={createMarkerIcon("C", "cafe")}>
                  <Popup>
                    <strong>{cafe.name}</strong><br />
                    {t.optionalCafeStop} · {t.routeDay(cafe.route_day)}
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
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
                  ? `${t.openOpenStreetMapRoute} · ${t.routeDay(link.day)}`
                  : t.openOpenStreetMapRoute}
              </a>
              {link.optionalCafeCount > 0 && (
                <small>{t.openStreetMapRouteIncludesCafes}</small>
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
