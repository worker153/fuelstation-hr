import { useState, useCallback, useRef } from 'react';
import { GoogleMap, Marker, Autocomplete } from '@react-google-maps/api';
import { MapPin, Search } from 'lucide-react';
import { useGoogleMaps } from '../context/GoogleMapsContext';

const MAP_STYLE   = { width: '100%', height: '260px' };
const NG_CENTER   = { lat: 6.5244, lng: 3.3792 };   // Lagos default

/**
 * AddressPicker — Google Places Autocomplete + click-to-pin map
 *
 * Props:
 *   value     — { formatted: string, coordinates: {lat, lng} }
 *   onChange  — (value) => void
 *   label, placeholder, required
 */
export default function AddressPicker({ value, onChange, label, placeholder = 'Search address in Nigeria…', required }) {
  const { isLoaded, hasKey } = useGoogleMaps();

  const [inputValue, setInputValue] = useState(value?.formatted || '');
  const [marker,     setMarker]     = useState(value?.coordinates || null);
  const autocompleteRef             = useRef(null);

  const handlePlaceChanged = useCallback(() => {
    if (!autocompleteRef.current) return;
    const place = autocompleteRef.current.getPlace();
    if (!place?.geometry) return;

    const lat       = place.geometry.location.lat();
    const lng       = place.geometry.location.lng();
    const formatted = place.formatted_address;

    setInputValue(formatted);
    setMarker({ lat, lng });
    onChange?.({ formatted, coordinates: { lat, lng } });
  }, [onChange]);

  const handleMapClick = useCallback((e) => {
    const coords = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    setMarker(coords);
    onChange?.({ formatted: inputValue, coordinates: coords });
  }, [inputValue, onChange]);

  const handleManualInput = (e) => {
    setInputValue(e.target.value);
    onChange?.({ formatted: e.target.value, coordinates: marker });
  };

  // ── No API key: plain text + manual coords ─────────────────────────────────
  if (!hasKey) {
    return (
      <div className="space-y-3">
        {label && <label className="label">{label}{required && ' *'}</label>}
        <input
          className="input"
          placeholder={placeholder}
          value={inputValue}
          onChange={handleManualInput}
          required={required}
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label text-xs text-gray-400">Latitude (optional)</label>
            <input type="number" step="any" className="input"
              placeholder="e.g. 6.5244"
              value={marker?.lat || ''}
              onChange={e => {
                const lat = parseFloat(e.target.value) || 0;
                const coords = { lat, lng: marker?.lng || 0 };
                setMarker(coords);
                onChange?.({ formatted: inputValue, coordinates: coords });
              }}
            />
          </div>
          <div>
            <label className="label text-xs text-gray-400">Longitude (optional)</label>
            <input type="number" step="any" className="input"
              placeholder="e.g. 3.3792"
              value={marker?.lng || ''}
              onChange={e => {
                const lng = parseFloat(e.target.value) || 0;
                const coords = { lat: marker?.lat || 0, lng };
                setMarker(coords);
                onChange?.({ formatted: inputValue, coordinates: coords });
              }}
            />
          </div>
        </div>
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
          💡 Add <code className="font-mono">VITE_GOOGLE_MAPS_API_KEY</code> to .env for live address search & map
        </p>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <div className="space-y-2">
        {label && <label className="label">{label}{required && ' *'}</label>}
        <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  // ── Full Google Maps experience ───────────────────────────────────────────
  return (
    <div className="space-y-2">
      {label && <label className="label">{label}{required && ' *'}</label>}

      {/* Autocomplete search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <Autocomplete
          onLoad={a => (autocompleteRef.current = a)}
          onPlaceChanged={handlePlaceChanged}
          options={{ componentRestrictions: { country: 'ng' }, fields: ['formatted_address', 'geometry'] }}
        >
          <input
            className="input pl-9"
            placeholder={placeholder}
            value={inputValue}
            onChange={handleManualInput}
            required={required}
          />
        </Autocomplete>
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
        <GoogleMap
          mapContainerStyle={MAP_STYLE}
          center={marker || NG_CENTER}
          zoom={marker ? 16 : 12}
          onClick={handleMapClick}
          options={{
            streetViewControl: false,
            mapTypeControl:    false,
            fullscreenControl: true,
            zoomControl:       true,
          }}
        >
          {marker && <Marker position={marker} animation={window.google?.maps?.Animation?.DROP} />}
        </GoogleMap>
        <p className={`text-xs text-center py-1.5 border-t ${marker ? 'text-brand-600 bg-brand-50 border-brand-100' : 'text-gray-400 bg-gray-50 border-gray-100'}`}>
          {marker
            ? `📍 Pinned: ${marker.lat.toFixed(5)}, ${marker.lng.toFixed(5)} — click map to adjust`
            : 'Search above or click map to pin exact location'}
        </p>
      </div>
    </div>
  );
}
