const BaseAdapter = require('./BaseAdapter');

class GenericRestAdapter extends BaseAdapter {
  _headers() {
    const h = { 'Content-Type': 'application/json' };
    const { authMethod, apiKey, apiKeyHeaderName, extraHeaders } = this.config;
    if (authMethod === 'api_key_header') h[apiKeyHeaderName || 'X-API-Key'] = apiKey;
    if (authMethod === 'bearer_token')   h['Authorization'] = `Bearer ${apiKey}`;
    if (authMethod === 'basic_auth')     h['Authorization'] = 'Basic ' + Buffer.from(apiKey || '').toString('base64');
    if (extraHeaders) Object.entries(extraHeaders).forEach(([k, v]) => { h[k] = v; });
    return h;
  }

  _url(endpoint, pumpId) {
    const base = this.config.baseUrl.replace(/\/$/, '');
    let path   = endpoint.replace('{pumpId}', pumpId || '');
    let url    = base + path;
    if (this.config.authMethod === 'api_key_query') {
      url += (url.includes('?') ? '&' : '?') + `apiKey=${encodeURIComponent(this.config.apiKey || '')}`;
    }
    return url;
  }

  async _fetch(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, { ...options, headers: this._headers(), signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  async getPumps() {
    const res  = await this._fetch(this._url(this.config.pumpEndpoint || '/pumps'));
    if (!res.ok) throw new Error(`GET pumps failed: HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : (data.pumps || data.data || []);
  }

  async getMeterReading(pumpId) {
    const endpoint = (this.config.meterEndpoint || '/pumps/{pumpId}/meter').replace('{pumpId}', pumpId);
    const res = await this._fetch(this._url(endpoint, pumpId));
    if (!res.ok) throw new Error(`GET meter failed: HTTP ${res.status}`);
    const data = await res.json();
    if (typeof data === 'number') return data;
    return data.meter ?? data.reading ?? data.value ?? data.totalizer ?? null;
  }

  async testConnection() {
    try {
      const res = await this._fetch(this._url(this.config.pumpEndpoint || '/pumps'));
      return { ok: res.ok, status: res.status, message: res.ok ? 'Connection successful' : `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, status: null, message: e.message };
    }
  }
}

module.exports = GenericRestAdapter;
