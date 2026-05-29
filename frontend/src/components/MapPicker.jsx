/**
 * MapPicker — click-to-pin + smart search (coordinates, Plus Codes, addresses).
 * No API key needed — uses Nominatim (OpenStreetMap).
 */
import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Search, Loader, X } from 'lucide-react';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const NIGERIA_CENTER = [9.082, 8.6753];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse "lat, lng" or "lat lng" coordinate strings */
function parseCoords(text) {
  const m = text.trim().match(/^(-?\d{1,3}\.?\d*)\s*[,\s]\s*(-?\d{1,3}\.?\d*)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
  return null;
}

/** Detect Google Plus Code pattern — e.g. "6F9G+VF" or "6F9G+VF Benin City" */
function isPlusCode(text) {
  return /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}(\s+.*)?$/i.test(text.trim());
}

/** Geocode via Nominatim — works for addresses and Plus Codes */
async function nominatimSearch(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const r = await fetch(url, {
    headers: { 'Accept-Language': 'en', 'User-Agent': 'FuelStationHR/1.0' },
  });
  if (!r.ok) return null;
  const d = await r.json();
  if (!d.length) return null;
  return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon), label: d[0].display_name };
}

// ── Map sub-components ────────────────────────────────────────────────────────

function FlyTo({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 17, { duration: 0.9 });
  }, [position]);   // eslint-disable-line
  return null;
}

function ClickHandler({ onClick }) {
  useMapEvents({ click: (e) => onClick([e.latlng.lat, e.latlng.lng]) });
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MapPicker({ value, onChange }) {
  const initPos     = value ? [value.lat, value.lng] : null;
  const [marker,    setMarker  ] = useState(initPos);
  const [query,     setQuery   ] = useState('');
  const [searching, setSearching] = useState(false);
  const [error,     setError   ] = useState('');
  const [flyTo,     setFlyTo   ] = useState(initPos);
  const inputRef = useRef(null);

  const pin = (lat, lng) => {
    const pos = [lat, lng];
    setMarker(pos);
    setFlyTo(pos);
    onChange?.({ lat, lng });
  };

  const handleClick = ([lat, lng]) => {
    pin(lat, lng);
    setError('');
  };

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setError('');
    setSearching(true);

    try {
      // 1. Raw coordinates — instant, no API call
      const coords = parseCoords(q);
      if (coords) {
        pin(coords.lat, coords.lng);
        setQuery('');
        setSearching(false);
        return;
      }

      // 2. Plus Code or address — geocode via Nominatim
      const result = await nominatimSearch(q);
      if (result) {
        pin(result.lat, result.lng);
        setQuery('');
      } else {
        setError(
          isPlusCode(q)
            ? 'Plus Code not found — try adding the city, e.g. "6F9G+VF Sapele"'
            : 'Location not found — try a different search or click the map'
        );
      }
    } catch {
      setError('Search failed — check your connection and try again');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-2">

      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            className={`input pl-8 pr-8 text-sm py-2 ${error ? 'border-red-300 focus:ring-red-300' : ''}`}
            placeholder="Coordinates, Plus Code, or address…"
            value={query}
            onChange={e => { setQuery(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
          />
          {query && (
            <button type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
              onClick={() => { setQuery(''); setError(''); inputRef.current?.focus(); }}>
              <X size={13} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={!query.trim() || searching}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium
                     hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0">
          {searching ? <Loader size={13} className="animate-spin" /> : <Search size={13} />}
        </button>
      </div>

      {/* Accepted formats hint */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {[
          { label: 'Coordinates', example: '6.3350, 5.6270' },
          { label: 'Plus Code',   example: '6F9G+VF Sapele' },
          { label: 'Address',     example: 'Sapele Rd Benin City' },
        ].map(h => (
          <button key={h.label} type="button"
            onClick={() => { setQuery(h.example); setError(''); inputRef.current?.focus(); }}
            className="text-[11px] text-gray-400 hover:text-brand-600 transition-colors">
            <span className="font-medium text-gray-500">{h.label}:</span> {h.example}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <span className="shrink-0">⚠</span> {error}
        </p>
      )}

      {/* ── Map ────────────────────────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 280 }}>
        <MapContainer
          center={marker || NIGERIA_CENTER}
          zoom={marker ? 17 : 6}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onClick={handleClick} />
          {flyTo  && <FlyTo position={flyTo} />}
          {marker && <Marker position={marker} />}
        </MapContainer>
      </div>

      {/* ── Status line ────────────────────────────────────────────────────── */}
      <p className={`text-xs flex items-center gap-1.5 ${marker ? 'text-brand-600 font-medium' : 'text-gray-400'}`}>
        <MapPin size={11} />
        {marker
          ? `📍 ${marker[0].toFixed(6)}, ${marker[1].toFixed(6)} — tap map to adjust`
          : 'Tap anywhere on the map — address & Plus Code fill in automatically'}
      </p>
    </div>
  );
}
