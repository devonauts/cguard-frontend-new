import { useState, useEffect } from "react";

import { loadGoogleMaps } from "@/utils/loadGoogleMaps";

declare global {
  interface Window {
    google?: any;
    googleMapsLoaded?: boolean;
  }
}

/**
 * Hook to load Google Maps script with Places API
 * @returns Object with google maps instance, loading state, and error state
 */
export function useGoogleMaps() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<Error | null>(null);

  useEffect(() => {
    const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY;

    if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
      setLoadError(new Error("Google Maps API key not configured"));

      return;
    }

    loadGoogleMaps()
      .then(() => {
        setIsLoaded(true);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err : new Error(String(err)));
      });
  }, []);

  return {
    isLoaded,
    loadError,
    google: window.google,
  };
}
