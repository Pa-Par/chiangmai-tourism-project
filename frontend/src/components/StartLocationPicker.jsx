import { useEffect, useRef, useState } from "react";

import { loadGoogleMaps } from "../services/googleMapsLoader";

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

function StartLocationPicker({ day, location, mapCenter, onLocationChange, t }) {
  const mapContainerRef = useRef(null);
  const searchHostRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const infoWindowRef = useRef(null);
  const onLocationChangeRef = useRef(onLocationChange);
  const [mapStatus, setMapStatus] = useState("loading");
  const [searchStatus, setSearchStatus] = useState("loading");
  const [geolocationMessage, setGeolocationMessage] = useState("");

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  function selectLocation(nextLocation) {
    onLocationChangeRef.current({
      name: nextLocation.name || "",
      latitude: Number(nextLocation.latitude).toFixed(6),
      longitude: Number(nextLocation.longitude).toFixed(6),
      source: nextLocation.source || "map",
    });
  }

  useEffect(() => {
    let disposed = false;
    let mapClickListener;
    let autocompleteElement;
    let onPlaceSelect;

    async function initializeMap() {
      try {
        const maps = await loadGoogleMaps();
        if (disposed || !mapContainerRef.current) return;
        // The initial view uses only the aggregate of real attraction
        // coordinates fetched from MySQL. It is never submitted as a start.
        const map = new maps.Map(mapContainerRef.current, {
          center: hasCoordinates(location)
            ? { lat: Number(location.latitude), lng: Number(location.longitude) }
            : hasCoordinates(mapCenter)
              ? { lat: Number(mapCenter.latitude), lng: Number(mapCenter.longitude) }
              : { lat: 0, lng: 0 },
          zoom: hasCoordinates(location) ? 13 : hasCoordinates(mapCenter) ? 9 : 2,
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          gestureHandling: "cooperative",
        });
        mapRef.current = map;
        infoWindowRef.current = new maps.InfoWindow();
        mapClickListener = map.addListener("click", (event) => {
          if (!event.latLng) return;
          selectLocation({
            latitude: event.latLng.lat(),
            longitude: event.latLng.lng(),
            source: "map",
          });
        });
        setMapStatus("ready");

        try {
          const { PlaceAutocompleteElement } = await maps.importLibrary("places");
          if (disposed || !searchHostRef.current || !PlaceAutocompleteElement) return;
          autocompleteElement = new PlaceAutocompleteElement();
          autocompleteElement.placeholder = t.searchStartLocationPlaceholder;
          autocompleteElement.setAttribute("aria-label", t.searchStartLocationPlaceholder);
          onPlaceSelect = async (event) => {
            try {
              const prediction = event.placePrediction || event.place;
              const place = prediction?.toPlace ? prediction.toPlace() : prediction;
              if (!place?.fetchFields) throw new Error("Selected place is unavailable");
              await place.fetchFields({ fields: ["displayName", "location"] });
              const placeLocation = place.location;
              const latitude = typeof placeLocation?.lat === "function"
                ? placeLocation.lat()
                : placeLocation?.lat;
              const longitude = typeof placeLocation?.lng === "function"
                ? placeLocation.lng()
                : placeLocation?.lng;
              if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                throw new Error("Selected place has no coordinates");
              }
              selectLocation({
                name: String(place.displayName || ""),
                latitude,
                longitude,
                source: "place_search",
              });
              setSearchStatus("ready");
            } catch {
              setSearchStatus("error");
            }
          };
          autocompleteElement.addEventListener("gmp-select", onPlaceSelect);
          searchHostRef.current.replaceChildren(autocompleteElement);
          setSearchStatus("ready");
        } catch {
          setSearchStatus("unavailable");
        }
      } catch {
        if (!disposed) {
          setMapStatus("error");
          setSearchStatus("unavailable");
        }
      }
    }

    initializeMap();
    return () => {
      disposed = true;
      mapClickListener?.remove();
      if (autocompleteElement && onPlaceSelect) {
        autocompleteElement.removeEventListener("gmp-select", onPlaceSelect);
      }
      markerRef.current?.setMap(null);
      markerRef.current = null;
      infoWindowRef.current?.close();
      mapRef.current = null;
    };
  }, [day, t]);

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps || !hasCoordinates(location)) return;
    const maps = window.google.maps;
    const position = { lat: Number(location.latitude), lng: Number(location.longitude) };
    if (!markerRef.current) {
      markerRef.current = new maps.Marker({
        map: mapRef.current,
        position,
        label: { text: "S", color: "#ffffff", fontWeight: "700" },
        title: location.name || t.selectedStartLocation,
        zIndex: 5,
      });
      markerRef.current.addListener("click", () => {
        infoWindowRef.current?.setContent(location.name || t.selectedStartLocation);
        infoWindowRef.current?.open({ map: mapRef.current, anchor: markerRef.current });
      });
    } else {
      markerRef.current.setPosition(position);
      markerRef.current.setTitle(location.name || t.selectedStartLocation);
    }
    mapRef.current.panTo(position);
    mapRef.current.setZoom(13);
  }, [location, t]);

  useEffect(() => {
    if (!mapRef.current || hasCoordinates(location) || !hasCoordinates(mapCenter)) return;
    mapRef.current.panTo({ lat: Number(mapCenter.latitude), lng: Number(mapCenter.longitude) });
    mapRef.current.setZoom(9);
  }, [location, mapCenter]);

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
        <span className="start-picker-hint">{t.startPickerHint}</span>
      </div>

      <div className="start-place-search">
        <div className="place-autocomplete-host" ref={searchHostRef} />
        {searchStatus === "loading" && <span>{t.loadingPlaceSearch}</span>}
        {searchStatus === "unavailable" && <span>{t.placeSearchUnavailable}</span>}
        {searchStatus === "error" && <span>{t.placeSearchError}</span>}
      </div>

      <div className="start-picker-map-shell">
        <div className="start-picker-map" ref={mapContainerRef} />
        {mapStatus === "loading" && <p className="map-state-message">{t.mapLoading}</p>}
        {mapStatus === "error" && <p className="map-state-message map-error-message">{t.mapLoadError}</p>}
      </div>

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
    </div>
  );
}

export default StartLocationPicker;
