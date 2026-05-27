/**
 * AddressPicker — OpenStreetMap + Nominatim (free, no API key)
 *
 * • Type to search → dropdown suggestions
 * • Click map → address auto-generated instantly
 * • GPS button → centres on your current location
 * • Clean short address format extracted from geocoder
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OpenLocationCode } from 'open-location-code';
import { Search, MapPin, Navigation, X, Loader, Hash } from 'lucide-react';

const olc = new OpenLocationCode();

// ── Fix Leaflet marker icons (broken in Vite) ─────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const NIGERIA_CENTER = [9.082, 8.6753];
const DEFAULT_ZOOM   = 6;
const PINNED_ZOOM    = 17;

// ── Build a short readable address from Nominatim result ─────────────────────
function buildAddress(result) {
  const a = result.address || {};
  const parts = [
    a.road || a.street || a.pedestrian || a.footway || a.path,
    a.suburb || a.neighbourhood || a.quarter || a.village,
    a.city || a.town || a.municipality || a.county,
    a.state,
  ].filter(Boolean);
  // Fall back to display_name trimmed if nothing useful
  return parts.length ? parts.join(', ') + ', Nigeria' : result.display_name;
}

// ── Nominatim API calls ───────────────────────────────────────────────────────
const nominatimSearch = async (query) => {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=ng&format=json&limit=6&addressdetails=1`,
    { headers: { 'Accept-Language': 'en' } }
  );
  return r.json();
};

const nominatimReverse = async (lat, lng) => {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
    { headers: { 'Accept-Language': 'en' } }
  );
  return r.json();
};

// ── Helper sub-components ─────────────────────────────────────────────────────
function FlyTo({ position, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, zoom, { duration: 0.8 });
  }, [position, zoom]); // eslint-disable-line
  return null;
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AddressPicker({
  value,
  onChange,
  label,
  placeholder = 'Search street, area or city in Nigeria…',
  required,
}) {
  const [inputValue,  setInputValue]  = useState(value?.formatted || '');
  const [marker,      setMarker]      = useState(
    value?.coordinates ? [value.coordinates.lat, value.coordinates.lng] : null
  );
  const [plusCode,    setPlusCode]    = useState(
    value?.coordinates
      ? olc.encode(value.coordinates.lat, value.coordinates.lng, 10)
      : ''
  );
  const [flyTarget,   setFlyTarget]   = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [reversing,   setReversing]   = useState(false);
  const [gpsLoading,  setGpsLoading]  = useState(false);
  const [gpsError,    setGpsError]    = useState('');
  const debounce = useRef(null);

  // ── emit to parent ────────────────────────────────────────────────────────
  const emit = useCallback((formatted, lat, lng, code) => {
    onChange?.({
      formatted,
      coordinates: lat != null ? { lat, lng } : null,
      plusCode: code || ''
    });
  }, [onChange]);

  // ── pin a resolved location ───────────────────────────────────────────────
  const pin = useCallback((lat, lng, address) => {
    const pos  = [lat, lng];
    const code = olc.encode(lat, lng, 10);   // 10-digit = ~14×14 m accuracy
    setMarker(pos);
    setPlusCode(code);
    setFlyTarget({ pos, zoom: PINNED_ZOOM });
    setInputValue(address);
    setSuggestions([]);
    emit(address, lat, lng, code);
  }, [emit]);

  // ── search input changed ──────────────────────────────────────────────────
  const handleInput = (e) => {
    const val = e.target.value;
    setInputValue(val);
    emit(val, marker?.[0] ?? null, marker?.[1] ?? null);
    clearTimeout(debounce.current);
    if (val.length >= 3) {
      debounce.current = setTimeout(async () => {
        setSearching(true);
        try { setSuggestions(await nominatimSearch(val)); }
        catch { setSuggestions([]); }
        finally { setSearching(false); }
      }, 450);
    } else {
      setSuggestions([]);
    }
  };

  const pickSuggestion = (s) => {
    pin(parseFloat(s.lat), parseFloat(s.lon), buildAddress(s));
  };

  // ── map click → auto-generate address ────────────────────────────────────
  const handleMapClick = useCallback(async (lat, lng) => {
    setReversing(true);
    try {
      const r = await nominatimReverse(lat, lng);
      pin(lat, lng, buildAddress(r));
    } catch {
      pin(lat, lng, `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } finally {
      setReversing(false);
    }
  }, [pin]);

  // ── GPS ───────────────────────────────────────────────────────────────────
  const handleGPS = () => {
    if (!navigator.geolocation) {
      setGpsError('GPS not supported on this device');
      return;
    }
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude: lat, longitude: lng } }) => {
        try {
          const r = await nominatimReverse(lat, lng);
          pin(lat, lng, buildAddress(r));
        } catch {
          pin(lat, lng, `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        } finally {
          setGpsLoading(false);
        }
      },
      (err) => {
        setGpsError(
          err.code === 1
            ? 'Allow location access in your browser settings'
            : 'Could not get your location'
        );
        setGpsLoading(false);
      },
      { timeout: 10000 }
    );
  };

  const clearAll = () => {
    setInputValue('');
    setMarker(null);
    setPlusCode('');
    setSuggestions([]);
    setGpsError('');
    emit('', null, null, '');
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="label">
          {label}{required && <span className="text-red-500"> *</span>}
        </label>
      )}

      {/* ── Search bar ── */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10" />
        <input
          className="input pl-9 pr-20"
          placeholder={placeholder}
          value={inputValue}
          onChange={handleInput}
          required={required}
          autoComplete="off"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
          {(searching || reversing) && (
            <Loader size={13} className="text-gray-400 animate-spin" />
          )}
          <button
            type="button"
            onClick={handleGPS}
            disabled={gpsLoading}
            title="Detect my current location"
            className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg transition-colors disabled:opacity-50"
          >
            {gpsLoading
              ? <Loader size={14} className="animate-spin" />
              : <Navigation size={14} />
            }
          </button>
          {inputValue && (
            <button type="button" onClick={clearAll}
              className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Suggestions dropdown */}
        {suggestions.length > 0 && (
          <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden max-h-64 overflow-y-auto">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => pickSuggestion(s)}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-brand-50 transition-colors border-b border-gray-50 last:border-0 flex items-start gap-2"
              >
                <MapPin size={13} className="text-brand-500 mt-0.5 shrink-0" />
                <span className="line-clamp-2 text-gray-700">{buildAddress(s)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* GPS error */}
      {gpsError && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <X size={11} /> {gpsError}
        </p>
      )}

      {/* ── Map ── */}
      <div
        className="rounded-xl overflow-hidden border border-gray-200 shadow-sm relative"
        style={{ height: 300 }}
      >
        {reversing && (
          <div className="absolute inset-0 z-[9998] flex items-center justify-center bg-white/60 rounded-xl">
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow border border-gray-100">
              <Loader size={14} className="animate-spin text-brand-600" />
              <span className="text-xs text-brand-700 font-medium">Getting address…</span>
            </div>
          </div>
        )}
        <MapContainer
          center={marker || NIGERIA_CENTER}
          zoom={marker ? PINNED_ZOOM : DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onMapClick={handleMapClick} />
          {flyTarget && <FlyTo position={flyTarget.pos} zoom={flyTarget.zoom} />}
          {marker && <Marker position={marker} />}
        </MapContainer>
      </div>

      {/* ── Address / Plus Code confirmation ── */}
      {marker ? (
        <div className="bg-green-50 border border-green-200 rounded-xl overflow-hidden">
          {/* Address row */}
          <div className="flex items-start gap-2 px-3 py-2.5 border-b border-green-100">
            <MapPin size={14} className="text-green-600 mt-0.5 shrink-0" />
            <p className="text-xs font-semibold text-green-800 leading-snug flex-1">{inputValue}</p>
          </div>

          {/* Coordinates + Plus Code row */}
          <div className="flex items-center gap-3 px-3 py-2 flex-wrap">
            <span className="text-xs text-green-600 font-mono">
              📍 {marker[0].toFixed(6)}, {marker[1].toFixed(6)}
            </span>
            {plusCode && (
              <span className="flex items-center gap-1 bg-brand-600 text-white text-xs font-bold px-2.5 py-1 rounded-full tracking-wide">
                <Hash size={10} />
                {plusCode}
              </span>
            )}
            <span className="text-xs text-green-500 ml-auto">tap map to move</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400 flex items-center gap-1.5 px-1">
          <MapPin size={11} />
          Tap anywhere on the map — address &amp; Plus Code fill in automatically
        </p>
      )}
    </div>
  );
}
