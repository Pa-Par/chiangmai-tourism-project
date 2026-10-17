import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { searchLocations } from "../services/api";
import "leaflet/dist/leaflet.css";

const MIN_SEARCH_INTERVAL_MS = 1100;
// This is only the initial viewport for the Chiang Mai project. It is never
// submitted as a travel origin unless the user deliberately places a marker.
const DEFAULT_MAP_VIEW = { lat: 18.788343, lng: 98.9853 };

function hasCoordinates(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
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
  return { lat: Number(location.latitude), lng: Number(location.longitude) };
}

function createStartIcon() {
  return L.divIcon({
    className: "leaflet-numbered-marker-wrapper",
    html: '<span class="leaflet-numbered-marker leaflet-numbered-marker--start">S</span>',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

function MapViewport({ point, zoom }) {
  const map = useMap();

  useEffect(() => {
    if (point) map.setView([point.lat, point.lng], zoom);
  }, [map, point, zoom]);

  return null;
}

function MapClickHandler({ enabled, onSelect }) {
  useMapEvents({
    click(event) {
      if (!enabled) return;
      onSelect({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
        source: "map",
      });
    },
  });
  return null;
}

function StartLocationPicker({ location, mapCenter, onLocationChange, t }) {
  const searchAbortRef = useRef(null);
  const lastSearchAtRef = useRef(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState("ready");
  const [mapStatus, setMapStatus] = useState("ready");
  const [geolocationMessage, setGeolocationMessage] = useState("");
  const [isPinning, setIsPinning] = useState(false);

  const selectedPoint = hasCoordinates(location) ? toLatLng(location) : null;
  const fallbackPoint = hasCoordinates(mapCenter) ? toLatLng(mapCenter) : null;
  const mapPoint = selectedPoint || fallbackPoint || DEFAULT_MAP_VIEW;
  const startIcon = useMemo(createStartIcon, []);

  useEffect(() => () => searchAbortRef.current?.abort(), []);

  function selectLocation(nextLocation) {
    onLocationChange({
      name: nextLocation.name || "",
      latitude: Number(nextLocation.latitude).toFixed(6),
      longitude: Number(nextLocation.longitude).toFixed(6),
      source: nextLocation.source || "map",
    });
    setIsPinning(false);
  }

  async function searchPlace() {
    const query = searchQuery.trim();
    if (query.length < 3) {
      setSearchStatus("error");
      return;
    }
    if (Date.now() - lastSearchAtRef.current < MIN_SEARCH_INTERVAL_MS) {
      setSearchStatus("rate_limited");
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    lastSearchAtRef.current = Date.now();
    setSearchStatus("searching");
    setSearchResults([]);

    try {
      const results = await searchLocations(query, controller.signal);
      const validResults = Array.isArray(results)
        ? results.filter((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)))
        : [];
      setSearchResults(validResults);
      setSearchStatus(validResults.length ? "ready" : "empty");
    } catch (error) {
      if (error.name !== "AbortError" && error.code !== "ERR_CANCELED") {
        setSearchStatus("unavailable");
      }
    }
  }

  function selectSearchResult(result) {
    selectLocation({
      name: result.display_name || result.name || "",
      latitude: result.lat,
      longitude: result.lon,
      source: "place_search",
    });
    setSearchQuery(result.display_name || result.name || "");
    setSearchResults([]);
    setSearchStatus("ready");
  }

  function useCurrentLocation() {
    setGeolocationMessage("");
    if (!navigator.geolocation) {
      setGeolocationMessage(t.geolocationUnavailable);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        selectLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: "geolocation",
        });
        setGeolocationMessage(t.geolocationSuccess);
      },
      () => setGeolocationMessage(t.geolocationDenied),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  return (
    <div className="start-location-picker">
      <div className="start-picker-actions">
        <button className="start-location-button" type="button" onClick={useCurrentLocation}>
          ◉ {t.useCurrentLocation}
        </button>
        <button
          className={`start-pin-button${isPinning ? " active" : ""}`}
          type="button"
          aria-pressed={isPinning}
          onClick={() => setIsPinning((current) => !current)}
        >
          ⌖ {isPinning ? t.pinStartLocationActive : t.pinStartLocation}
        </button>
      </div>
      <span className="start-picker-hint">{isPinning ? t.pinStartLocationHint : t.startPickerHint}</span>

      <div className="start-place-search">
        <div className="start-place-search-form" role="search">
          <input
            className="form-control"
            type="search"
            value={searchQuery}
            placeholder={t.searchStartLocationPlaceholder}
            aria-label={t.searchStartLocationPlaceholder}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                searchPlace();
              }
            }}
          />
          <button className="place-search-button" type="button" onClick={searchPlace}>
            {t.searchStartLocation}
          </button>
        </div>
        {searchStatus === "searching" && <span>{t.searchingPlaces}</span>}
        {searchStatus === "empty" && <span>{t.noPlaceSearchResults}</span>}
        {searchStatus === "rate_limited" && <span>{t.placeSearchRateLimited}</span>}
        {searchStatus === "unavailable" && <span>{t.placeSearchUnavailable}</span>}
        {searchStatus === "error" && <span>{t.placeSearchError}</span>}
        {searchResults.length > 0 && (
          <ul className="place-search-results">
            {searchResults.map((result) => (
              <li key={`${result.osm_type}-${result.osm_id}`}>
                <button type="button" onClick={() => selectSearchResult(result)}>
                  {result.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`start-picker-map-shell${isPinning ? " is-pinning" : ""}`}>
        <MapContainer
          center={[mapPoint.lat, mapPoint.lng]}
          zoom={selectedPoint ? 13 : 9}
          className="start-picker-map leaflet-map"
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            eventHandlers={{ tileerror: () => setMapStatus("error") }}
          />
          <MapViewport point={mapPoint} zoom={selectedPoint ? 13 : 9} />
          <MapClickHandler enabled={isPinning} onSelect={selectLocation} />
          {selectedPoint && (
            <Marker position={[selectedPoint.lat, selectedPoint.lng]} icon={startIcon}>
              <Popup>{location?.name || t.selectedStartLocation}</Popup>
            </Marker>
          )}
        </MapContainer>
        {isPinning && <p className="map-pin-instruction">⌖ {t.pinStartLocationHint}</p>}
        {mapStatus === "error" && <p className="map-state-message map-error-message">{t.mapLoadError}</p>}
      </div>
      {!selectedPoint && <small className="field-hint">{t.defaultMapViewNotice}</small>}

      <div className="start-location-fields">
        <input
          className="form-control"
          type="text"
          value={location?.name || ""}
          placeholder={t.startLocationNamePlaceholder}
          aria-label={t.startLocationNamePlaceholder}
          onChange={(event) => onLocationChange({ ...location, name: event.target.value, source: "manual" })}
        />
        <input
          className="form-control"
          type="number"
          step="any"
          value={location?.latitude || ""}
          placeholder={t.latitudePlaceholder}
          aria-label={t.latitudePlaceholder}
          onChange={(event) => onLocationChange({ ...location, latitude: event.target.value, source: "manual" })}
        />
        <input
          className="form-control"
          type="number"
          step="any"
          value={location?.longitude || ""}
          placeholder={t.longitudePlaceholder}
          aria-label={t.longitudePlaceholder}
          onChange={(event) => onLocationChange({ ...location, longitude: event.target.value, source: "manual" })}
        />
      </div>
      {geolocationMessage && <small className="field-hint">{geolocationMessage}</small>}
      <small className="field-hint">{t.nominatimUsageNotice}</small>
    </div>
  );
}

export default StartLocationPicker;
