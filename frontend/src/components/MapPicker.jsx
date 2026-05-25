/**
 * MapPicker — simple click-to-pin map (no Places autocomplete).
 * Uses the shared GoogleMapsContext so LoadScript is not duplicated.
 */
import { useState, useCallback } from 'react';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { MapPin } from 'lucide-react';
import { useGoogleMaps } from '../context/GoogleMapsContext';

const MAP_STYLE   = { width: '100%', height: '300px' };
const NG_CENTER   = { lat: 6.5244, lng: 3.3792 };

function ManualInput({ value, onChange }) {
  return (
    <div className="border border-dashed border-gray-300 rounded-xl p-4 bg-gray-50 space-y-3">
      <div className="flex items-center gap-2 text-gray-500">
        <MapPin size={15} />
        <span className="text-sm font-medium">Enter coordinates manually</span>
      </div>
      <p className="text-xs text-amber-600">
        Add <code className="bg-amber-100 px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> to .env to enable the interactive map.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Latitude</label>
          <input type="number" step="any" className="input" placeholder="e.g. 6.5244"
            value={value?.lat || ''}
            onChange={e => onChange?.({ lat: parseFloat(e.target.value) || 0, lng: value?.lng || 0 })} />
        </div>
        <div>
          <label className="label">Longitude</label>
          <input type="number" step="any" className="input" placeholder="e.g. 3.3792"
            value={value?.lng || ''}
            onChange={e => onChange?.({ lat: value?.lat || 0, lng: parseFloat(e.target.value) || 0 })} />
        </div>
      </div>
    </div>
  );
}

function GoogleMapPicker({ value, onChange }) {
  const { isLoaded } = useGoogleMaps();
  const [marker, setMarker] = useState(value || null);

  const handleClick = useCallback((e) => {
    const coords = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    setMarker(coords);
    onChange?.(coords);
  }, [onChange]);

  if (!isLoaded) return (
    <div className="h-40 flex items-center justify-center bg-gray-50 rounded-xl border border-gray-200">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
    </div>
  );

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200">
      <GoogleMap
        mapContainerStyle={MAP_STYLE}
        center={marker || NG_CENTER}
        zoom={marker ? 15 : 12}
        onClick={handleClick}
        options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: true }}
      >
        {marker && <Marker position={marker} />}
      </GoogleMap>
      <p className={`text-xs text-center py-2 border-t ${
        marker ? 'text-brand-600 bg-brand-50 border-brand-100' : 'text-gray-400 bg-gray-50 border-gray-100'
      }`}>
        {marker
          ? `📍 ${marker.lat.toFixed(6)}, ${marker.lng.toFixed(6)} — click to change`
          : 'Click anywhere on the map to pin the location'}
      </p>
    </div>
  );
}

export default function MapPicker({ value, onChange }) {
  const { hasKey } = useGoogleMaps();
  return hasKey
    ? <GoogleMapPicker value={value} onChange={onChange} />
    : <ManualInput     value={value} onChange={onChange} />;
}
