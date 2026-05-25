import { createContext, useContext, useState } from 'react';
import { LoadScript } from '@react-google-maps/api';

const GoogleMapsContext = createContext({ isLoaded: false, hasKey: false });

// Stable reference — must be defined OUTSIDE the component
const LIBRARIES = ['places'];
const API_KEY   = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export function GoogleMapsProvider({ children }) {
  const [isLoaded, setIsLoaded] = useState(false);

  if (!API_KEY) {
    return (
      <GoogleMapsContext.Provider value={{ isLoaded: false, hasKey: false }}>
        {children}
      </GoogleMapsContext.Provider>
    );
  }

  return (
    <LoadScript
      googleMapsApiKey={API_KEY}
      libraries={LIBRARIES}
      onLoad={() => setIsLoaded(true)}
      loadingElement={<></>}
    >
      <GoogleMapsContext.Provider value={{ isLoaded, hasKey: true }}>
        {children}
      </GoogleMapsContext.Provider>
    </LoadScript>
  );
}

export const useGoogleMaps = () => useContext(GoogleMapsContext);
