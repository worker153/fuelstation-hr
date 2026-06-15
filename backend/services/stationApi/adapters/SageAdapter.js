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

  // ── Get shift row(s) for a specific nozzle on a given date ──────────────
  // Used for opening meter capture on clock-in (getMeterReading).
  async getShiftReading(nozzleId, date) {
    if (!this.locationId) return null;
    const d = date || new Date().toISOString().slice(0, 10);
    try {
      const data = await this._get('/hr-meter-readings', {
        location_id:   this.locationId,
        business_date: d,
        nozzle_id:     nozzleId,
      });
      return (data.data || [])[0] || null;
    } catch {
      return null;
    }
  }

  async getMeterReading(nozzleId) {
    const row = await this.getShiftReading(nozzleId);
    return row?.opening?.effective_value ?? null;
  }

  // ── Pull ALL nozzle readings for a date (or date range) in one call ───────
  // Returns rows with: nozzle_id, nozzle_name, item_name, opening, closing,
  //                    litres_sold, is_final, business_date, shift_no
  async getDayReadings(date, opts = {}) {
    if (!this.locationId) throw new Error('Location ID not set.');
    const params = { location_id: this.locationId };
    if (opts.from_date && opts.to_date) {
      params.from_date = opts.from_date;
      params.to_date   = opts.to_date;
    } else {
      params.business_date = date || new Date().toISOString().slice(0, 10);
    }
    const data = await this._get('/hr-meter-readings', params);
    return data.data || [];
  }
}

module.exports = SageAdapter;
