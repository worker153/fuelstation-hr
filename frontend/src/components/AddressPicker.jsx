/**
 * AddressPicker — OpenStreetMap + Nominatim (free, no API key)
 *
 * • Search bar    → address suggestions with auto-pin
 * • Plus Code box → type / paste a Plus Code → decode & pin map
 * • Google Address→ editable textarea (auto-filled or type manually)
 * • Click map     → auto-generate address & Plus Code
 * • GPS button    → pin current location
 * • Worker Address + Landmark — separate manual fields
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

// ── Detect "lat, lng" coordinate strings ─────────────────────────────────────
function parseCoords(text) {
  // Handles: "5.8820, 5.6819" | "5.8820 5.6819" | "5.8820,5.6819"
  // Also handles DMS-like strings that still have decimal degrees
  const clean = text.trim().replace(/[°NnSsEeWw]/g, '');
  const m = clean.match(/^(-?\d{1,3}\.?\d*)\s*[,\s]\s*(-?\d{1,3}\.?\d*)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
  return null;
}

// ── Build a short readable address from Nominatim result ─────────────────────
function buildAddress(result) {
  const a = result.address || {};
  const parts = [
    a.road || a.street || a.pedestrian || a.footway || a.path,
    a.suburb || a.neighbourhood || a.quarter || a.village,
    a.city || a.town || a.municipality || a.county,
    a.state,
  ].filter(Boolean);
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
  // Google address (editable)
  const [googleAddress,  setGoogleAddress]  = useState(value?.formatted     || '');
  // Worker's own description
  const [workerAddress,  setWorkerAddress]  = useState(value?.workerAddress || '');
  // Nearest landmark
  const [landmark,       setLandmark]       = useState(value?.landmark      || '');
  // Map marker + plus code
  const [marker,         setMarker]         = useState(
    value?.coordinates ? [value.coordinates.lat, value.coordinates.lng] : null
  );
  const [plusCode,       setPlusCode]       = useState(
    value?.coordinates ? olc.encode(value.coordinates.lat, value.coordinates.lng, 10) : ''
  );
  // Plus Code input field (separate from display)
  const [plusCodeInput,  setPlusCodeInput]  = useState('');
  const [plusCodeLoading,setPlusCodeLoading]= useState(false);
  const [plusCodeError,  setPlusCodeError]  = useState('');
  // Search bar
  const [flyTarget,      setFlyTarget]      = useState(null);
  const [suggestions,    setSuggestions]    = useState([]);
  const [searching,      setSearching]      = useState(false);
  const [reversing,      setReversing]      = useState(false);
  const [gpsLoading,     setGpsLoading]     = useState(false);
  const [gpsError,       setGpsError]       = useState('');
  const [searchInput,    setSearchInput]    = useState('');
  const debounce = useRef(null);

  // ── emit to parent ────────────────────────────────────────────────────────
  const emit = useCallback((formatted, lat, lng, code, wa, lmk) => {
    onChange?.({
      formatted,
      coordinates:   lat != null ? { lat, lng } : null,
      plusCode:      code || '',
      workerAddress: wa  ?? workerAddress,
      landmark:      lmk ?? landmark,
    });
  }, [onChange, workerAddress, landmark]);  // eslint-disable-line

  // ── pin a resolved location (from map click, GPS, or Plus Code) ───────────
  const pin = useCallback((lat, lng, address) => {
    const pos  = [lat, lng];
    const code = olc.encode(lat, lng, 10);
    setMarker(pos);
    setPlusCode(code);
    setFlyTarget({ pos, zoom: PINNED_ZOOM });
    setGoogleAddress(address);
    setSuggestions([]);
    setSearchInput('');
    emit(address, lat, lng, code, workerAddress, landmark);
  }, [emit, workerAddress, landmark]);  // eslint-disable-line

  // ── Search bar ────────────────────────────────────────────────────────────
  const handleSearchInput = (e) => {
    const val = e.target.value;
    setSearchInput(val);
    clearTimeout(debounce.current);
    if (val.length >= 3) {
      debounce.current = setTimeout(async () => {
        // If it looks like coordinates, use reverse geocode immediately
        const coords = parseCoords(val);
        if (coords) {
          setSearching(true);
          try {
            const r = await nominatimReverse(coords.lat, coords.lng);
            pin(coords.lat, coords.lng, buildAddress(r));
            setSearchInput('');
          } catch {
            pin(coords.lat, coords.lng, `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
          } finally { setSearching(false); }
          return;
        }
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

  // ── Map click → auto-generate address ────────────────────────────────────
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
    if (!navigator.geolocation) { setGpsError('GPS not supported on this device'); return; }
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude: lat, longitude: lng } }) => {
        try {
          const r = await nominatimReverse(lat, lng);
          pin(lat, lng, buildAddress(r));
        } catch {
          pin(lat, lng, `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        } finally { setGpsLoading(false); }
      },
      (err) => {
        setGpsError(err.code === 1 ? 'Allow location access in your browser settings' : 'Could not get your location');
        setGpsLoading(false);
      },
      { timeout: 10000 }
    );
  };

  // ── Plus Code / Coordinates → Generate address & pin ────────────────────
  const handlePlusCodeGenerate = async () => {
    const code = plusCodeInput.trim();
    if (!code) return;
    setPlusCodeLoading(true);
    setPlusCodeError('');

    try {
      // ① Raw coordinates like "5.8820, 5.6819" → reverse geocode directly
      const coords = parseCoords(code);
      if (coords) {
        try {
          const r = await nominatimReverse(coords.lat, coords.lng);
          pin(coords.lat, coords.lng, buildAddress(r));
        } catch {
          pin(coords.lat, coords.lng, `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
        }
        setPlusCodeInput('');
        return;
      }

      // ② Full Plus Code (e.g. "6GCRMQPX+97") → decode with OLC, then reverse geocode
      if (olc.isValid(code) && olc.isFull(code)) {
        const decoded = olc.decode(code);
        const lat = decoded.latitudeCenter;
        const lng = decoded.longitudeCenter;
        try {
          const r = await nominatimReverse(lat, lng);
          pin(lat, lng, buildAddress(r));
        } catch {
          pin(lat, lng, `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
        setPlusCodeInput('');
        return;
      }

      // ③ Short Plus Code with city (e.g. "6F9G+VF Sapele") → Nominatim search
      const results = await nominatimSearch(code);
      if (results.length) {
        const s = results[0];
        pin(parseFloat(s.lat), parseFloat(s.lon), buildAddress(s));
        setPlusCodeInput('');
      } else {
        setPlusCodeError(
          olc.isValid(code) && olc.isShort(code)
            ? 'Short code needs a city — e.g. "6FG8+Q2 Abuja"'
            : 'Not recognised — paste Google coordinates (5.88, 5.68), a full Plus Code, or a short code with city'
        );
      }
    } catch {
      setPlusCodeError('Failed to decode — check your internet and try again');
    } finally {
      setPlusCodeLoading(false);
    }
  };

  const clearAll = () => {
    setGoogleAddress('');
    setSearchInput('');
    setMarker(null);
    setPlusCode('');
    setSuggestions([]);
    setGpsError('');
    emit('', null, null, '', workerAddress, landmark);
  };

  const handleGoogleAddressChange = (val) => {
    setGoogleAddress(val);
    emit(val, marker?.[0] ?? null, marker?.[1] ?? null, plusCode, workerAddress, landmark);
  };

  return (
    <div className="space-y-3">
      {label && (
        <label className="label">
          {label}{required && <span className="text-red-500"> *</span>}
        </label>
      )}

      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10" />
        <input
          className="input pl-9 pr-20"
          placeholder="Street name + city — e.g. Awolowo Road Ikoyi Lagos"
          value={searchInput}
          onChange={handleSearchInput}
          autoComplete="off"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
          {(searching || reversing) && <Loader size={13} className="text-gray-400 animate-spin" />}
          <button type="button" onClick={handleGPS} disabled={gpsLoading}
            title="Detect my current location"
            className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg transition-colors disabled:opacity-50">
            {gpsLoading ? <Loader size={14} className="animate-spin" /> : <Navigation size={14} />}
          </button>
          {(googleAddress || searchInput) && (
            <button type="button" onClick={clearAll} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Suggestions dropdown */}
        {suggestions.length > 0 && (
          <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden max-h-64 overflow-y-auto">
            {suggestions.map((s, i) => (
              <button key={i} type="button" onClick={() => pickSuggestion(s)}
                className="w-full text-left px-4 py-2.5 hover:bg-brand-50 transition-colors border-b border-gray-50 last:border-0 flex items-start gap-2">
                <MapPin size={13} className="text-brand-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-gray-700 leading-snug">{buildAddress(s)}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {[s.address?.city || s.address?.town, s.address?.state].filter(Boolean).join(', ')}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* No results hint */}
        {!searching && searchInput.length >= 3 && suggestions.length === 0 && (
          <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl px-4 py-3">
            <p className="text-xs text-gray-500 font-medium">No results — try including the city name:</p>
            <p className="text-xs text-brand-600 mt-1">
              e.g. <strong>"{searchInput} Benin City"</strong> or <strong>"{searchInput} Lagos"</strong>
            </p>
            <p className="text-xs text-gray-400 mt-1.5">Or paste Google coordinates in the Plus Code field below ↓</p>
          </div>
        )}
      </div>

      {/* Search tip */}
      <p className="text-[11px] text-gray-400 flex items-center gap-1 -mt-1">
        💡 Always include the city — e.g. <span className="font-medium text-gray-500">"Awolowo Road Lagos"</span> not just <span className="font-medium text-gray-500">"Awolowo Road"</span>
      </p>

      {gpsError && (
        <p className="text-xs text-red-500 flex items-center gap-1"><X size={11} /> {gpsError}</p>
      )}

      {/* ── Map ────────────────────────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm relative" style={{ height: 300 }}>
        {reversing && (
          <div className="absolute inset-0 z-[9998] flex items-center justify-center bg-white/60 rounded-xl">
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow border border-gray-100">
              <Loader size={14} className="animate-spin text-brand-600" />
              <span className="text-xs text-brand-700 font-medium">Getting address…</span>
            </div>
          </div>
        )}
        <MapContainer center={marker || NIGERIA_CENTER} zoom={marker ? PINNED_ZOOM : DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onMapClick={handleMapClick} />
          {flyTarget && <FlyTo position={flyTarget.pos} zoom={flyTarget.zoom} />}
          {marker && <Marker position={marker} />}
        </MapContainer>
      </div>

      {/* ── Plus Code input ────────────────────────────────────────────────── */}
      <div>
        <label className="label flex items-center gap-1.5">
          <Hash size={12} className="text-brand-500" />
          Plus Code or Coordinates
          <span className="text-gray-400 font-normal text-[11px]">— paste either to pin & generate address</span>
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Hash size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              className={`input pl-8 text-sm font-mono ${plusCodeError ? 'border-red-300' : ''}`}
              placeholder="6.4550, 3.3841  or  6FG8+Q2 Abuja  or  6GCRMQPX+97"
              value={plusCodeInput}
              onChange={e => { setPlusCodeInput(e.target.value); setPlusCodeError(''); }}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handlePlusCodeGenerate())}
            />
          </div>
          <button
            type="button"
            onClick={handlePlusCodeGenerate}
            disabled={!plusCodeInput.trim() || plusCodeLoading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium
                       hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0">
            {plusCodeLoading
              ? <Loader size={13} className="animate-spin" />
              : <><MapPin size={13} /> Generate</>
            }
          </button>
        </div>
        {plusCodeError && (
          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">⚠ {plusCodeError}</p>
        )}
        {/* Show current auto-generated Plus Code badge when map is pinned */}
        {plusCode && !plusCodeInput && (
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
            Current:
            <span className="inline-flex items-center gap-1 bg-brand-600 text-white text-xs font-bold px-2 py-0.5 rounded-full tracking-wide">
              <Hash size={9} />{plusCode}
            </span>
          </p>
        )}
      </div>

      {/* ── Google Address (editable) ──────────────────────────────────────── */}
      <div>
        <label className="label flex items-center gap-1.5">
          <MapPin size={12} className="text-green-600" />
          Google Address
          <span className="text-gray-400 font-normal text-[11px]">— type or paste the correct address</span>
        </label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder="Type or paste the exact address from Google Maps here…"
          value={googleAddress}
          onChange={e => handleGoogleAddressChange(e.target.value)}
          required={required}
        />
        {marker && (
          <div className="mt-1.5 space-y-1">
            <p className="text-xs text-green-600 font-mono flex items-center gap-1.5">
              <MapPin size={10} />
              {marker[0].toFixed(6)}, {marker[1].toFixed(6)}
              <span className="text-gray-300 mx-1">·</span>
              <span className="text-gray-400 italic">tap map to move pin</span>
            </p>
            <p className="text-xs text-amber-600 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>
                The address above is from OpenStreetMap and <strong>may not match Google Maps</strong> — especially for Nigerian streets.
                Please verify and correct it manually if needed.
              </span>
            </p>
          </div>
        )}
      </div>

      {/* ── Worker's Own Address ───────────────────────────────────────────── */}
      <div>
        <label className="label flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          Address as Worker Described It
        </label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder="e.g. 15 Nnamdi Azikiwe Street, off Hospital Road…"
          value={workerAddress}
          onChange={e => {
            setWorkerAddress(e.target.value);
            emit(googleAddress, marker?.[0] ?? null, marker?.[1] ?? null, plusCode, e.target.value, landmark);
          }}
        />
      </div>

      {/* ── Nearest Landmark ───────────────────────────────────────────────── */}
      <div>
        <label className="label flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-500" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>
          Nearest Landmark
        </label>
        <input
          className="input text-sm"
          placeholder="e.g. Behind First Bank, near Total filling station…"
          value={landmark}
          onChange={e => {
            setLandmark(e.target.value);
            emit(googleAddress, marker?.[0] ?? null, marker?.[1] ?? null, plusCode, workerAddress, e.target.value);
          }}
        />
      </div>
    </div>
  );
}
