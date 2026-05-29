/**
 * NumInput — a controlled number input that:
 * - Shows blank (not "0") when value is 0, so you can clear and retype
 * - Selects all text on focus so you can immediately overwrite
 * - Calls onChange(number) — never a string
 *
 * Drop-in replacement for <input type="number"> everywhere.
 *
 * Usage:
 *   <NumInput value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} />
 */
export default function NumInput({ value, onChange, className = '', min = 0, placeholder = '0', ...rest }) {
  return (
    <input
      type="number"
      min={min}
      placeholder={placeholder}
      value={value === 0 || value === '' || value == null ? '' : value}
      onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      onFocus={e => e.target.select()}
      className={className}
      {...rest}
    />
  );
}
