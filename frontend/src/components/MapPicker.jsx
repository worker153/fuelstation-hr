/**
 * MapPicker — thin wrapper around LocationPicker (Mapbox GL JS).
 *
 * Used by branch setup and guarantor forms.
 * Returns only { lat, lng } — same interface as before.
 * To swap provider later: replace LocationPicker.jsx only.
 */
import LocationPicker from './LocationPicker';

export default function MapPicker({ value, onChange, height = 280 }) {
  return (
    <LocationPicker
      value={value}           // { lat, lng } or null — LocationPicker handles both
      onChange={(loc) => {
        if (loc) onChange?.({ lat: loc.lat, lng: loc.lng });
        else     onChange?.(null);
      }}
      height={height}
    />
  );
}
