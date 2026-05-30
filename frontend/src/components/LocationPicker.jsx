/**
 * LocationPicker — Mapbox GL JS interactive map
 *
 * Provider-agnostic interface: onChange({ lat, lng, address })
 * To swap to Google Maps later: replace THIS FILE ONLY.
 * Database schema (lat, lng, address) never changes.
 *
 * Features:
 *  • Mapbox GL JS map (streets-v12 style)
 *  • Smart search: address, coordinates (6.33, 5.59), Plus Codes (6F9G+VF Lagos)
 *  • Click map to pin
 *  • Draggable green marker
 *  • GPS current location button
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { OpenLocationCode } from 'open-location-code';
import { Search, Navigation, X, Loader, MapPin } from 'lucide-react';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
const olc   = new OpenLocationCode();

// Nigeria center [lng, lat]
const NIGERIA_CENTER = [8.6753, 9.082];

// ── Mapbox Geocoding API ───────────────────────────────────────────────────────
async function mbGeocode(query) {
  if (!TOKEN) return [];
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?access_token=${TOKEN}&country=ng&limit=6&types=address,place,neighborhood,locality,poi`;
  const r = await fetch(url);
  const d = await r.json();
  return d.features || [];
}

async function mbReverse(lat, lng) {
  if (!TOKEN) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
    `?access_token=${TOKEN}&types=address,place,neighborhood,locality&limit=1`;
  const r = await fetch(url);
  const d = await r.json();
  return d.features?.[0]?.place_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// ── Smart input detection ─────────────────────────────────────────────────────
function parseCoords(text) {
  const clean = text.trim().replace(/[°NnSsEeWw]/g, '');
  const m = clean.match(/^(-?\d{1,3}\.?\d*)\s*[,\s]\s*(-?\d{1,3}\.?\d*)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
  return null;
}

function isPlusCode(text) {
  return /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}(\s+.*)?$/i.test(text.trim());
}

function tryDecodePlusCode(code) {
  try {
    const trimmed = code.trim().split(' ')[0]; // full code only
    if (olc.isValid(trimmed) && olc.isFull(trimmed)) {
      const dec = olc.decode(trimmed);
      return { lat: dec.latitudeCenter, lng: dec.longitudeCenter };
    }
  } catch { /* ignore */ }
  return null;
}

// ── LocationPicker ────────────────────────────────────────────────────────────
export default function LocationPicker({
  value,
  onChange,
  height     = 300,
  placeholder = 'Search address, coordinates, or Plus Code…',
}) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markerRef    = useRef(null);

  const [searchInput,  setSearchInput ] = useState('');
  const [suggestions,  setSuggestions ] = useState([]);
  const [searching,    setSearching   ] = useState(false);
  const [reversing,    setReversing   ] = useState(false);
  const [gpsLoading,   setGpsLoading  ] = useState(false);
  const [gpsError,     setGpsError    ] = useState('');
  const [noResults,    setNoResults   ] = useState(false);
  const [pinned,       setPinned      ] = useState(
    value?.lat != null ? { lat: value.lat, lng: value.lng, address: value.address || value.formatted || '' } : null
  );
  const debounceRef = useRef(null);

  // ── Pin a location ──────────────────────────────────────────────────────────
  const pin = useCallback(async (lat, lng, address) => {
    let addr = address;
    if (!addr) {
      setReversing(true);
      try { addr = await mbReverse(lat, lng); }
      catch { addr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
      finally { setReversing(false); }
    }

    const loc = { lat, lng, address: addr };
    setPinned(loc);
    onChange?.(loc);
    setSuggestions([]);
    setSearchInput('');
    setNoResults(false);

    if (!mapRef.current) return;
    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    } else {
      markerRef.current = new mapboxgl.Marker({ draggable: true, color: '#16a34a' })
        .setLngLat([lng, lat])
        .addTo(mapRef.current);

      markerRef.current.on('dragend', async () => {
        const pos  = markerRef.current.getLngLat();
        setReversing(true);
        try {
          const a = await mbReverse(pos.lat, pos.lng);
          const updated = { lat: pos.lat, lng: pos.lng, address: a };
          setPinned(updated);
          onChange?.(updated);
        } finally { setReversing(false); }
      });
    }
    mapRef.current.flyTo({ center: [lng, lat], zoom: 16, duration: 800 });
  }, [onChange]);

  // ── Initialise Mapbox map ───────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current || !TOKEN) return;

    mapboxgl.accessToken = TOKEN;

    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style:     'mapbox://styles/mapbox/streets-v12',
      center:    value?.lng != null ? [value.lng, value.lat] : NIGERIA_CENTER,
      zoom:      value?.lat != null ? 15 : 6,
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    // Initial marker
    if (value?.lat != null) {
      markerRef.current = new mapboxgl.Marker({ draggable: true, color: '#16a34a' })
        .setLngLat([value.lng, value.lat])
        .addTo(mapRef.current);

      markerRef.current.on('dragend', async () => {
        const pos = markerRef.current.getLngLat();
        setReversing(true);
        try {
          const a = await mbReverse(pos.lat, pos.lng);
          const updated = { lat: pos.lat, lng: pos.lng, address: a };
          setPinned(updated);
          onChange?.(updated);
        } finally { setReversing(false); }
      });
    }

    // Click to pin
    mapRef.current.on('click', (e) => {
      pin(e.lngLat.lat, e.lngLat.lng);
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current  = null;
      markerRef.current = null;
    };
  }, []); // eslint-disable-line

  // ── Search input ────────────────────────────────────────────────────────────
  const handleSearch = (e) => {
    const val = e.target.value;
    setSearchInput(val);
    setNoResults(false);
    clearTimeout(debounceRef.current);

    if (val.trim().length < 3) { setSuggestions([]); return; }

    debounceRef.current = setTimeout(async () => {
      // ① Coordinates
      const coords = parseCoords(val);
      if (coords) {
        pin(coords.lat, coords.lng);
        return;
      }

      // ② Full Plus Code — decode locally, then reverse geocode
      if (isPlusCode(val)) {
        const decoded = tryDecodePlusCode(val);
        if (decoded) {
          await pin(decoded.lat, decoded.lng);
          return;
        }
        // Short Plus Code with city → fall through to Mapbox search
      }

      // ③ Regular address search
      setSearching(true);
      try {
        const results = await mbGeocode(val);
        setSuggestions(results);
        if (!results.length) setNoResults(true);
      } catch { setSuggestions([]); }
      finally { setSearching(false); }
    }, 400);
  };

  const pickSuggestion = (s) => {
    const [lng, lat] = s.center;
    pin(lat, lng, s.place_name);
  };

  // ── GPS ─────────────────────────────────────────────────────────────────────
  const handleGPS = () => {
    if (!navigator.geolocation) { setGpsError('GPS not available on this device'); return; }
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude: lat, longitude: lng } }) => {
        try { await pin(lat, lng); }
        finally { setGpsLoading(false); }
      },
      (err) => {
        setGpsError(err.code === 1 ? 'Allow location access in browser settings' : 'Could not get your location');
        setGpsLoading(false);
      },
      { timeout: 10000 }
    );
  };

  // ── No token fallback ───────────────────────────────────────────────────────
  if (!TOKEN) {
    return (
      <div className="rounded-xl border-2 border-dashed border-red-300 bg-red-50 p-6 text-center space-y-1">
        <p className="text-sm font-semibold text-red-700">Mapbox token not configured</p>
        <p className="text-xs text-red-500">Add VITE_MAPBOX_TOKEN to your Vercel environment variables</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">

      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10" />
        <input
          className="input pl-9 pr-20"
          placeholder={placeholder}
          value={searchInput}
          onChange={handleSearch}
          autoComplete="off"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
          {(searching || reversing) && <Loader size={13} className="text-gray-400 animate-spin" />}
          <button type="button" onClick={handleGPS} disabled={gpsLoading}
            title="Use current location"
            className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg transition-colors disabled:opacity-50">
            {gpsLoading ? <Loader size={14} className="animate-spin" /> : <Navigation size={14} />}
          </button>
          {(searchInput || pinned) && (
            <button type="button" onClick={() => {
              setSearchInput(''); setSuggestions([]); setNoResults(false);
              if (!searchInput) {
                // clear pin
                markerRef.current?.remove(); markerRef.current = null;
                setPinned(null); onChange?.(null);
              }
            }} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden max-h-64 overflow-y-auto">
            {suggestions.map((s, i) => (
              <button key={i} type="button" onClick={() => pickSuggestion(s)}
                className="w-full text-left px-4 py-2.5 hover:bg-brand-50 transition-colors border-b border-gray-50 last:border-0 flex items-start gap-2">
                <MapPin size={13} className="text-brand-500 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-700 line-clamp-2">{s.place_name}</span>
              </button>
            ))}
          </div>
        )}

        {/* No results hint */}
        {noResults && searchInput.length >= 3 && (
          <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl px-4 py-3">
            <p className="text-xs text-gray-500 font-medium">No results — tips:</p>
            <ul className="text-xs text-gray-400 mt-1 space-y-0.5 list-disc list-inside">
              <li>Add the city name — e.g. <span className="text-brand-600 font-medium">"{searchInput} Lagos"</span></li>
              <li>Paste Google coordinates — e.g. <span className="font-mono text-brand-600">6.4550, 3.3841</span></li>
              <li>Paste a Plus Code — e.g. <span className="font-mono text-brand-600">6FG8+Q2 Abuja</span></li>
            </ul>
          </div>
        )}
      </div>

      {/* Search tip */}
      <p className="text-[11px] text-gray-400">
        💡 Search address · paste coordinates <span className="font-mono">6.33, 5.59</span> · or Plus Code <span className="font-mono">6FG8+Q2</span>
      </p>

      {gpsError && <p className="text-xs text-red-500 flex items-center gap-1"><X size={11} />{gpsError}</p>}

      {/* ── Map ────────────────────────────────────────────────────────────── */}
      <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-sm">
        {reversing && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 rounded-xl">
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow border border-gray-100">
              <Loader size={14} className="animate-spin text-brand-600" />
              <span className="text-xs text-brand-700 font-medium">Getting address…</span>
            </div>
          </div>
        )}
        <div ref={containerRef} style={{ height }} />
      </div>

      {/* ── Pinned location confirmation ────────────────────────────────────── */}
      {pinned && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
          <MapPin size={14} className="text-green-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-800 leading-snug break-words">{pinned.address}</p>
            <p className="text-xs text-green-600 font-mono mt-0.5">
              {pinned.lat.toFixed(6)}, {pinned.lng.toFixed(6)}
              <span className="text-green-400 ml-2 font-sans not-italic">· drag marker to fine-tune</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
