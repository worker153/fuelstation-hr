class SageAdapter {
  constructor(integration) {
    this.baseUrl    = (integration.baseUrl || '').replace(/\/$/, '');
    this.apiKey     = integration.apiKey;
    this.locationId = integration.locationId || '';
  }

  get _headers() {
    return { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' };
  }

  async _get(path, params = {}) {
    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v); });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res  = await fetch(url.toString(), { headers: this._headers, signal: controller.signal });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      return data;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  async testConnection() {
    try {
      const data      = await this._get('/hr-locations');
      const locations = data.data || [];
      const found     = this.locationId ? locations.find(l => l.location_id === this.locationId) : null;
      const locName   = found?.name || (locations.length ? `${locations.length} location(s) found` : 'No locations');
      return { ok: true, message: `Connected — ${locName}`, status: 200 };
    } catch (e) {
      return { ok: false, message: e.message, status: null };
    }
  }

  async getLocations() {
    const data = await this._get('/hr-locations');
    return data.data || [];
  }

  // Returns nozzle directory (id, name, item_name, is_active)
  async getPumps() {
    if (!this.locationId) throw new Error('Location ID not set.');
    const data = await this._get('/hr-nozzles', { location_id: this.locationId });
    return (data.data || []).map(n => ({
      id:          n.nozzle_id,
      name:        n.name,
      productType: n.item_name,
      isActive:    n.is_active,
      tankId:      n.tank_id,
    }));
  }

  // Returns nozzle list for building dropdowns
  async getNozzles() {
    if (!this.locationId) throw new Error('Location ID not set.');
    const data = await this._get('/hr-nozzles', { location_id: this.locationId });
    return (data.data || []).filter(n => n.is_active !== false);
  }

  // Single call — returns ALL meter readings for a date (or date range).
  // Per docs: each row has nozzle_id, nozzle_name, item_name, business_date,
  // shift_no, opening{effective_value,...}, closing{...}, litres_sold, is_final
  async getAllReadings(date, fromDate, toDate) {
    if (!this.locationId) throw new Error('Location ID not set.');
    const params = { location_id: this.locationId };
    if (fromDate && toDate) {
      params.from_date = fromDate;
      params.to_date   = toDate;
    } else {
      params.business_date = date || new Date().toISOString().slice(0, 10);
    }
    const data = await this._get('/hr-meter-readings', params);
    return data.data || [];
  }

  // Kept for backward compat — wraps getAllReadings
  async getDayReadings(date) {
    return this.getAllReadings(date);
  }
}

module.exports = SageAdapter;
