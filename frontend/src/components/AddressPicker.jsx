/**
 * AddressPicker — wraps LocationPicker (Mapbox GL JS) with extra verification fields.
 *
 * The map search/pin/GPS/reverse-geocode is all handled by LocationPicker.
 * This component adds the three extra verification fields on top:
 *   • Google Address  — auto-filled from Mapbox reverse geocode; editable
 *   • Worker's Address — free-text as the worker described it
 *   • Nearest Landmark — nearest known landmark
 *
 * onChange payload (unchanged from Leaflet version):
 *   { formatted, coordinates: {lat, lng} | null, plusCode, workerAddress, landmark }
 *
 * To swap map provider later: replace LocationPicker.jsx only. This file doesn't change.
 */
import { useState } from 'react';
import { OpenLocationCode } from 'open-location-code';
import { MapPin, Hash } from 'lucide-react';
import LocationPicker from './LocationPicker';

const olc = new OpenLocationCode();

export default function AddressPicker({
  value,
  onChange,
  label,
  placeholder,
  required,
}) {
  const [googleAddress, setGoogleAddress] = useState(value?.formatted     || '');
  const [workerAddress, setWorkerAddress] = useState(value?.workerAddress || '');
  const [landmark,      setLandmark     ] = useState(value?.landmark      || '');
  const [coords,        setCoords       ] = useState(value?.coordinates   ?? null);
  const [plusCode,      setPlusCode     ] = useState(
    value?.coordinates ? olc.encode(value.coordinates.lat, value.coordinates.lng, 10) : ''
  );
  const [hasPinned, setHasPinned] = useState(value?.coordinates != null);

  // ── Emit to parent ────────────────────────────────────────────────────────────
  // Always reads workerAddress / landmark from closure so we can call with fresh state
  const emit = (formatted, coordinates, code, wa, lmk) => {
    onChange?.({
      formatted:     formatted     || '',
      coordinates:   coordinates   || null,
      plusCode:      code          || '',
      workerAddress: wa            ?? '',
      landmark:      lmk           ?? '',
    });
  };

  // ── LocationPicker callback ───────────────────────────────────────────────────
  const handleLocationChange = (loc) => {
    if (!loc) {
      setCoords(null);
      setPlusCode('');
      setGoogleAddress('');
      setHasPinned(false);
      emit('', null, '', workerAddress, landmark);
      return;
    }
    const { lat, lng, address } = loc;
    const code        = olc.encode(lat, lng, 10);
    const coordinates = { lat, lng };
    setCoords(coordinates);
    setPlusCode(code);
    setGoogleAddress(address || '');
    setHasPinned(true);
    emit(address || '', coordinates, code, workerAddress, landmark);
  };

  return (
    <div className="space-y-3">
      {label && (
        <label className="label">
          {label}{required && <span className="text-red-500"> *</span>}
        </label>
      )}

      {/* ── Mapbox map widget (search + GPS + click + drag) ─────────────────── */}
      <LocationPicker
        value={
          value?.coordinates
            ? { lat: value.coordinates.lat, lng: value.coordinates.lng, address: value.formatted }
            : null
        }
        onChange={handleLocationChange}
        height={290}
        placeholder={placeholder || 'Search address, coordinates, or Plus Code…'}
      />

      {/* ── Plus Code badge ────────────────────────────────────────────────── */}
      {plusCode && (
        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          <Hash size={11} className="text-brand-500" />
          Plus Code:
          <span className="inline-flex items-center gap-1 bg-brand-600 text-white text-xs font-bold px-2 py-0.5 rounded-full tracking-wide font-mono">
            {plusCode}
          </span>
        </p>
      )}

      {/* ── Google Address (auto-filled; editable) ─────────────────────────── */}
      <div>
        <label className="label flex items-center gap-1.5">
          <MapPin size={12} className="text-green-600" />
          Google Address
          <span className="text-gray-400 font-normal text-[11px]">— auto-filled; edit if incorrect</span>
        </label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder="Type or paste the exact address from Google Maps here…"
          value={googleAddress}
          onChange={e => {
            const val = e.target.value;
            setGoogleAddress(val);
            emit(val, coords, plusCode, workerAddress, landmark);
          }}
          required={required}
        />
        {hasPinned && (
          <p className="text-xs text-amber-600 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1.5">
            <span className="shrink-0 mt-0.5">⚠</span>
            <span>
              Auto-generated address may not perfectly match Google Maps for some Nigerian streets.
              Please verify and correct if needed.
            </span>
          </p>
        )}
      </div>

      {/* ── Worker's Own Address ───────────────────────────────────────────── */}
      <div>
        <label className="label flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          Address as Worker Described It
        </label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder="e.g. 15 Nnamdi Azikiwe Street, off Hospital Road…"
          value={workerAddress}
          onChange={e => {
            setWorkerAddress(e.target.value);
            emit(googleAddress, coords, plusCode, e.target.value, landmark);
          }}
        />
      </div>

      {/* ── Nearest Landmark ───────────────────────────────────────────────── */}
      <div>
        <label className="label flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-500" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="22" x2="21" y2="22"/>
            <line x1="6" y1="18" x2="6" y2="11"/>
            <line x1="10" y1="18" x2="10" y2="11"/>
            <line x1="14" y1="18" x2="14" y2="11"/>
            <line x1="18" y1="18" x2="18" y2="11"/>
            <polygon points="12 2 20 7 4 7"/>
          </svg>
          Nearest Landmark
        </label>
        <input
          className="input text-sm"
          placeholder="e.g. Behind First Bank, near Total filling station…"
          value={landmark}
          onChange={e => {
            setLandmark(e.target.value);
            emit(googleAddress, coords, plusCode, workerAddress, e.target.value);
          }}
        />
      </div>
    </div>
  );
}
