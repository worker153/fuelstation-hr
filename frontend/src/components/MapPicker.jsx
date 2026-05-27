/**
 * MapPicker — simple click-to-pin Leaflet map (no API key needed).
 */
import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const NIGERIA_CENTER = [9.082, 8.6753];

function FlyTo({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 16, { duration: 0.8 });
  }, [position]);   // eslint-disable-line
  return null;
}

function ClickHandler({ onClick }) {
  useMapEvents({ click: (e) => onClick([e.latlng.lat, e.latlng.lng]) });
  return null;
}

export default function MapPicker({ value, onChange }) {
  const initPos = value ? [value.lat, value.lng] : null;
  const [marker, setMarker] = useState(initPos);

  const handleClick = (pos) => {
    setMarker(pos);
    onChange?.({ lat: pos[0], lng: pos[1] });
  };

  return (
    <div className="space-y-2">
      <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 280 }}>
        <MapContainer
          center={marker || NIGERIA_CENTER}
          zoom={marker ? 16 : 6}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onClick={handleClick} />
          {marker && <FlyTo position={marker} />}
          {marker && <Marker position={marker} />}
        </MapContainer>
      </div>
      <p className={`text-xs flex items-center gap-1.5 ${marker ? 'text-brand-600' : 'text-gray-400'}`}>
        <MapPin size={11} />
        {marker
          ? `Pinned: ${marker[0].toFixed(6)}, ${marker[1].toFixed(6)} — click to move`
          : 'Click anywhere on the map to pin the location'}
      </p>
    </div>
  );
}
