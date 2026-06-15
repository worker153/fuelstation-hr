// StationDesk HR Meter Reading API adapter
class SageAdapter {
  constructor(integration) {
    this.baseUrl    = (integration.baseUrl || '').replace(/\/$/, '');
    this.apiKey     = integration.apiKey;
    this.locationId = integration.locationId || '';
  }

  get _headers() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type':  'application/json',
    };
  }

  async _get(path, params = {}) {
    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(url.toString(), { headers: this._headers, signal: controller.signal });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      return data;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  // ── Test connection: verify Bearer key works ──────────────────────────────
  async testConnection() {
    try {
      const data = await this._get('/hr-locations');
      const locations = data.data || [];
      const found = this.locationId
        ? locations.find(l => l.location_id === this.locationId)
        : null;
      const locName = found?.name || (locations.length ? `${locations.length} location(s) found` : 'No locations');
      return { ok: true, message: `Connected — ${locName}`, status: 200 };
    } catch (e) {
      return { ok: false, message: e.message, status: null };
    }
  }

  // ── List all locations (stations) ─────────────────────────────────────────
  async getLocations() {
    const data = await this._get('/hr-locations');
    return data.data || [];
  }

  // ── List pump nozzles for the configured location ─────────────────────────
  async getPumps() {
    if (!this.locationId) throw new Error('Location ID not set — edit the integration and add your Location ID.');
    const data = await this._get('/hr-nozzles', { location_id: this.locationId });
    return (data.data || []).map(n => ({
      id:          n.nozzle_id,
      name:        n.name,
      productType: n.item_name,
      isActive:    n.is_active,
      tankId:      n.tank_id,
    }));
  }

  // ── Get full shift row for a nozzle on a given date ─────────────────────
  // Tries without phase first (most compatible), then with phase=both as fallback
  async getShiftReading(nozzleId, date) {
    if (!this.locationId) return null;
    const d = date || new Date().toISOString().slice(0, 10);

    const attempt = async (params) => {
      const data = await this._get('/hr-meter-readings', params);
      return (data.data || [])[0] || null;
    };

    // Try 1: no phase param
    try {
      const row = await attempt({ location_id: this.locationId, business_date: d, nozzle_id: nozzleId });
      if (row) return row;
    } catch { /* fall through */ }

    // Try 2: phase=both
    try {
      const row = await attempt({ location_id: this.locationId, business_date: d, nozzle_id: nozzleId, phase: 'both' });
      if (row) return row;
    } catch { /* fall through */ }

    // Try 3: phase=opening (some APIs only return opening phase data)
    try {
      const row = await attempt({ location_id: this.locationId, business_date: d, nozzle_id: nozzleId, phase: 'opening' });
      if (row) return row;
    } catch { /* fall through */ }

    return null;
  }

  async getMeterReading(nozzleId) {
    const row = await this.getShiftReading(nozzleId);
    return row?.opening?.effective_value ?? null;
  }

  // ── Pull nozzle list for a date (used to get nozzle_ids for per-nozzle sync)
  async getDayReadings(date) {
    if (!this.locationId) throw new Error('Location ID not set.');
    // Try without phase param first — some StationDesk versions don't accept 'both'
    try {
      const data = await this._get('/hr-meter-readings', { location_id: this.locationId, business_date: date });
      if (data.data?.length) return data.data;
    } catch { /* fall through */ }
    // Fallback with phase=both
    const data = await this._get('/hr-meter-readings', { location_id: this.locationId, business_date: date, phase: 'both' });
    return data.data || [];
  }
}

module.exports = SageAdapter;
