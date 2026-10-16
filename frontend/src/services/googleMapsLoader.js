let googleMapsPromise;

export function loadGoogleMaps() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return Promise.reject(new Error("Google Maps API key is missing."));
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsApi = "true";
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => {
      googleMapsPromise = undefined;
      reject(new Error("Google Maps JavaScript API could not be loaded."));
    };

    document.head.appendChild(script);
  });

  return googleMapsPromise;
}
