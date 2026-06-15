import { useState, useEffect } from 'react';
import {
  Plug2, Plus, Edit2, Trash2, X, Save, Loader, CheckCircle,
  XCircle, AlertCircle, Wifi, List, ChevronDown, ChevronUp, Eye, EyeOff,
  FlaskConical,
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

// ─── Constants ────────────────────────────────────────────────────────────────
const PROVIDER_LABELS = {
  generic_rest: 'Generic REST',
  sage:         'Sage API',
  forecourt:    'Forecourt Controller',
  pump_monitor: 'Pump Monitor',
  custom:       'Custom',
};

const AUTH_LABELS = {
  api_key_header: 'API Key Header',
  api_key_query:  'API Key Query Param',
  bearer_token:   'Bearer Token',
  basic_auth:     'Basic Auth',
  none:           'None',
};

const PROVIDER_COLORS = {
  generic_rest: 'bg-blue-100 text-blue-700',
  sage:         'bg-green-100 text-green-700',
  forecourt:    'bg-purple-100 text-purple-700',
  pump_monitor: 'bg-orange-100 text-orange-700',
  custom:       'bg-gray-100 text-gray-700',
};

const STATUS_STYLES = {
  active:   { cls: 'bg-green-100 text-green-700',  icon: CheckCircle,   label: 'Active'   },
  inactive: { cls: 'bg-gray-100 text-gray-500',    icon: XCircle,       label: 'Inactive' },
  error:    { cls: 'bg-red-100 text-red-700',      icon: AlertCircle,   label: 'Error'    },
};

const EMPTY_FORM = {
  name:             '',
  provider:         'generic_rest',
  baseUrl:          '',
  locationId:       '',
  apiKey:           '',
  authMethod:       'api_key_header',
  apiKeyHeaderName: 'X-API-Key',
  pumpEndpoint:     '/pumps',
  meterEndpoint:    '/pumps/{pumpId}/meter',
  notes:            '',
  status:           'inactive',
};

// ─── Integration Form Modal ───────────────────────────────────────────────────
function IntegrationModal({ integration, onClose, onSaved }) {
  const notify = useNotify();
  const [saving,       setSaving      ] = useState(false);
  const [showKey,      setShowKey     ] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState(integration ? {
    name:             integration.name             || '',
    provider:         integration.provider         || 'generic_rest',
    baseUrl:          integration.baseUrl          || '',
    locationId:       integration.locationId       || '',
    apiKey:           '',
    authMethod:       integration.authMethod       || 'api_key_header',
    apiKeyHeaderName: integration.apiKeyHeaderName || 'X-API-Key',
    pumpEndpoint:     integration.pumpEndpoint     || '/pumps',
    meterEndpoint:    integration.meterEndpoint    || '/pumps/{pumpId}/meter',
    notes:            integration.notes            || '',
    status:           integration.status           || 'inactive',
  } : { ...EMPTY_FORM });

  const isSage = form.provider === 'sage';
  const [locations,        setLocations       ] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(false);

  const loadLocations = async () => {
    if (!form.baseUrl || !form.apiKey) {
      notify('Enter Base URL and API Key first, then load locations', 'error');
      return;
    }
    setLoadingLocations(true);
    try {
      const res = await api.post('/station-integrations/fetch-locations', {
        baseUrl: form.baseUrl, apiKey: form.apiKey,
      });
      setLocations(res.data.data || []);
      if (!res.data.data?.length) notify('No locations found — check your Base URL and API Key', 'error');
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to load locations', 'error');
    } finally {
      setLoadingLocations(false);
    }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return notify('Name is required', 'error');
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.apiKey) delete payload.apiKey;
      const res = integration
        ? await api.put(`/station-integrations/${integration._id}`, payload)
        : await api.post('/station-integrations', payload);
      notify(integration ? 'Integration updated' : 'Integration saved');
      onSaved(res.data.data);
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 overflow-y-auto md:pl-64">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl my-6">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <Plug2 size={18} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 leading-tight">
                  {integration ? 'Edit Integration' : 'Connect Station API'}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">Enter your API key to get started</p>
              </div>
            </div>
            <button onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={submit} className="px-6 py-5 space-y-4">

            {/* Name */}
            <div>
              <label className="label">Connection Name *</label>
              <input className="input" placeholder="e.g. Main Station"
                value={form.name} onChange={e => set('name', e.target.value)} required />
            </div>

            {/* Provider */}
            <div>
              <label className="label">Provider</label>
              <select className="input" value={form.provider} onChange={e => set('provider', e.target.value)}>
                {Object.entries(PROVIDER_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            {/* API Key — the main thing users have */}
            <div>
              <label className="label">
                API Key
                {integration && <span className="text-gray-400 font-normal ml-1">(leave blank to keep existing)</span>}
              </label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showKey ? 'text' : 'password'}
                  placeholder={integration ? '••••••••' : 'Paste your API key here'}
                  value={form.apiKey}
                  onChange={e => set('apiKey', e.target.value)}
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Sage-specific required fields */}
            {isSage && (
              <div className="space-y-4 border border-blue-100 rounded-xl p-4 bg-blue-50">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">StationDesk Setup</p>

                <div>
                  <label className="label">Base URL *</label>
                  <input className="input font-mono text-sm"
                    placeholder="https://xxxx.supabase.co/functions/v1"
                    value={form.baseUrl}
                    onChange={e => set('baseUrl', e.target.value)} />
                  <p className="text-xs text-gray-400 mt-1">
                    The project ref is in your StationDesk URL. Format: <code className="bg-white px-1 rounded border text-gray-600">https://{'<project-ref>'}.supabase.co/functions/v1</code>
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label mb-0">Station (Location ID) *</label>
                    <button type="button" onClick={loadLocations} disabled={loadingLocations}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 disabled:opacity-50">
                      {loadingLocations ? <Loader size={11} className="animate-spin" /> : <Wifi size={11} />}
                      Load stations
                    </button>
                  </div>

                  {locations.length > 0 ? (
                    <select className="input" value={form.locationId}
                      onChange={e => set('locationId', e.target.value)}>
                      <option value="">— Select station —</option>
                      {locations.map(l => (
                        <option key={l.location_id} value={l.location_id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className="input font-mono text-sm"
                      placeholder="Click 'Load stations' to fetch automatically"
                      value={form.locationId}
                      onChange={e => set('locationId', e.target.value)} />
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Enter Base URL + API Key above, then click "Load stations" to pick your station from a list.
                  </p>
                </div>
              </div>
            )}

            {/* Advanced toggle */}
            <button type="button"
              onClick={() => setShowAdvanced(v => !v)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors pt-1">
              <ChevronDown size={15} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              Advanced settings {!showAdvanced && form.baseUrl && <span className="text-xs text-blue-500">(configured)</span>}
            </button>

            {/* Advanced fields — hidden by default */}
            {showAdvanced && (
              <div className="space-y-4 border border-gray-100 rounded-xl p-4 bg-gray-50">
                <p className="text-xs text-gray-400">Only needed if your provider requires a custom setup.</p>

                <div>
                  <label className="label">Base URL</label>
                  <input className="input" placeholder="https://api.yourstation.com"
                    value={form.baseUrl} onChange={e => set('baseUrl', e.target.value)} />
                  <p className="text-xs text-gray-400 mt-1">The root URL of your station API</p>
                </div>

                <div>
                  <label className="label">Auth Method</label>
                  <select className="input" value={form.authMethod} onChange={e => set('authMethod', e.target.value)}>
                    {Object.entries(AUTH_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>

                {form.authMethod === 'api_key_header' && (
                  <div>
                    <label className="label">Header Name</label>
                    <input className="input" placeholder="X-API-Key"
                      value={form.apiKeyHeaderName} onChange={e => set('apiKeyHeaderName', e.target.value)} />
                  </div>
                )}

                <div>
                  <label className="label">Pump List Endpoint</label>
                  <input className="input font-mono text-sm" placeholder="/pumps"
                    value={form.pumpEndpoint} onChange={e => set('pumpEndpoint', e.target.value)} />
                </div>

                <div>
                  <label className="label">Meter Reading Endpoint</label>
                  <input className="input font-mono text-sm" placeholder="/pumps/{pumpId}/meter"
                    value={form.meterEndpoint} onChange={e => set('meterEndpoint', e.target.value)} />
                  <p className="text-xs text-gray-400 mt-1">
                    Use <code className="bg-white px-1 rounded border text-gray-600">{'{pumpId}'}</code> as placeholder
                  </p>
                </div>

                <div>
                  <label className="label">Status</label>
                  <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                    <option value="inactive">Inactive</option>
                    <option value="active">Active</option>
                  </select>
                </div>

                <div>
                  <label className="label">Notes</label>
                  <textarea className="input resize-none" rows={2} placeholder="Optional notes"
                    value={form.notes} onChange={e => set('notes', e.target.value)} />
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                {saving ? <Loader size={15} className="animate-spin" /> : <><Save size={14} /> {integration ? 'Save Changes' : 'Save Integration'}</>}
              </button>
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Pumps List Modal ─────────────────────────────────────────────────────────
function PumpsModal({ integration, onClose }) {
  const notify = useNotify();
  const [pumps,   setPumps  ] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError  ] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/station-integrations/${integration._id}/pumps`);
        setPumps(data.data || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch pumps');
      } finally {
        setLoading(false);
      }
    })();
  }, [integration._id]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 overflow-y-auto md:pl-64">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl my-6">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h3 className="font-bold text-gray-900">Pumps — {integration.name}</h3>
              <p className="text-xs text-gray-400 mt-0.5">{integration.baseUrl}</p>
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <X size={18} />
            </button>
          </div>

          <div className="px-6 py-5">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader size={22} className="animate-spin text-brand-500" />
              </div>
            ) : error ? (
              <div className="flex items-start gap-2 text-red-600 bg-red-50 rounded-xl p-4">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
              </div>
            ) : pumps.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No pumps returned from API</p>
            ) : (
              <div className="space-y-2">
                {pumps.map((pump, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                      <Plug2 size={14} className="text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {pump.name || pump.label || pump.id || `Pump ${i + 1}`}
                      </p>
                      <p className="text-xs text-gray-400 font-mono truncate">
                        ID: {pump.id || pump.pumpId || pump._id || '—'}
                      </p>
                    </div>
                    {(pump.status || pump.state) && (
                      <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                        (pump.status || pump.state) === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {pump.status || pump.state}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-6 pb-5">
            <button onClick={onClose} className="btn-secondary w-full justify-center">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Readings Test Panel ──────────────────────────────────────────────────────
function ReadingsTestPanel({ integration, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date,     setDate    ] = useState(today);
  const [loading,  setLoading ] = useState(false);
  const [result,   setResult  ] = useState(null);
  const [error,    setError   ] = useState('');

  const run = async () => {
    setLoading(true); setResult(null); setError('');
    try {
      const { data } = await api.get(`/station-integrations/${integration._id}/test-readings?date=${date}`);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 overflow-y-auto md:pl-64">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl my-6">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h3 className="font-bold text-gray-900">Test Meter Readings</h3>
              <p className="text-xs text-gray-400 mt-0.5">{integration.name} — {integration.baseUrl}</p>
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <X size={18} />
            </button>
          </div>

          {/* Date picker + run */}
          <div className="px-6 py-4 flex items-end gap-3 border-b border-gray-100">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Date to query</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="input text-sm" />
            </div>
            <button onClick={run} disabled={loading}
              className="btn-primary gap-1.5 text-sm shrink-0">
              {loading ? <Loader size={14} className="animate-spin" /> : <FlaskConical size={14} />}
              Fetch Readings
            </button>
          </div>

          {/* Results */}
          <div className="px-6 py-4 max-h-[60vh] overflow-y-auto space-y-4">
            {error && (
              <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-xl p-3 text-sm">
                <AlertCircle size={15} className="shrink-0 mt-0.5" /> {error}
              </div>
            )}

            {result && (
              <>
                {/* Summary */}
                <div className={`rounded-xl p-3 text-sm font-medium flex items-center gap-2 ${
                  result.withData > 0 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  {result.withData > 0
                    ? <CheckCircle size={15} className="shrink-0" />
                    : <AlertCircle size={15} className="shrink-0" />}
                  {result.message}
                </div>

                {/* Nozzle readings table */}
                {result.readings?.length > 0 && (
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 uppercase tracking-wide text-[10px]">
                          <th className="px-3 py-2 text-left">Nozzle</th>
                          <th className="px-3 py-2 text-right">Opening</th>
                          <th className="px-3 py-2 text-right">Closing</th>
                          <th className="px-3 py-2 text-right">Litres Sold</th>
                          <th className="px-3 py-2 text-center">Final</th>
                          <th className="px-3 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {result.readings.map((r, i) => (
                          <tr key={i} className={r.has_data ? 'bg-white' : 'bg-gray-50/50'}>
                            <td className="px-3 py-2 font-medium text-gray-800">
                              {r.name || r.nozzle_id}
                              <span className="ml-1 text-gray-400 font-mono text-[10px]">{r.nozzle_id}</span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-gray-700">
                              {r.opening != null ? r.opening.toLocaleString() : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-gray-700">
                              {r.closing != null ? r.closing.toLocaleString() : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-brand-700">
                              {r.litres_sold != null ? r.litres_sold.toLocaleString() + ' L' : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {r.is_final ? '✓' : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {r.error
                                ? <span className="text-red-500 text-[10px]">error</span>
                                : r.has_data
                                  ? <span className="text-green-600 text-[10px] font-medium">ok</span>
                                  : <span className="text-gray-400 text-[10px]">no data</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {!result && !error && !loading && (
              <p className="text-sm text-gray-400 text-center py-6">
                Pick a date and click "Fetch Readings" to test the API connection and see raw meter data.
              </p>
            )}
          </div>

          <div className="px-6 pb-5">
            <button onClick={onClose} className="btn-secondary w-full justify-center">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Integration Card ─────────────────────────────────────────────────────────
function IntegrationCard({ integration, onEdit, onDelete, onRefresh }) {
  const notify   = useNotify();
  const [testing,      setTesting     ] = useState(false);
  const [testResult,   setTestResult  ] = useState(null);
  const [showPumps,    setShowPumps   ] = useState(false);
  const [showReadings, setShowReadings] = useState(false);
  const [deleting,     setDeleting    ] = useState(false);

  const statusInfo = STATUS_STYLES[integration.status] || STATUS_STYLES.inactive;
  const StatusIcon = statusInfo.icon;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post(`/station-integrations/${integration._id}/test`);
      setTestResult({ ok: data.connected, message: data.message });
      onRefresh();
      if (data.connected) notify('Connection successful');
      else notify(data.message || 'Connection failed', 'error');
    } catch (err) {
      const msg = err.response?.data?.message || 'Test failed';
      setTestResult({ ok: false, message: msg });
      notify(msg, 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete integration "${integration.name}"?`)) return;
    setDeleting(true);
    try {
      await api.delete(`/station-integrations/${integration._id}`);
      notify('Integration deleted');
      onDelete(integration._id);
    } catch (err) {
      notify(err.response?.data?.message || 'Delete failed', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="card p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-gray-900 truncate">{integration.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PROVIDER_COLORS[integration.provider] || 'bg-gray-100 text-gray-700'}`}>
                {PROVIDER_LABELS[integration.provider] || integration.provider}
              </span>
            </div>
            <p className="text-xs text-gray-400 font-mono mt-1 truncate">{integration.baseUrl}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.cls}`}>
              <StatusIcon size={10} />
              {statusInfo.label}
            </span>
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>Auth: <span className="font-medium text-gray-700">{AUTH_LABELS[integration.authMethod] || integration.authMethod}</span></span>
          {integration.lastTestedAt && (
            <span>Tested: <span className="font-medium text-gray-700">{new Date(integration.lastTestedAt).toLocaleString('en-NG', { dateStyle: 'short', timeStyle: 'short' })}</span></span>
          )}
        </div>

        {/* Last error */}
        {integration.status === 'error' && integration.lastError && (
          <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-lg px-3 py-2">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <p className="text-xs">{integration.lastError}</p>
          </div>
        )}

        {/* Test result inline */}
        {testResult && (
          <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {testResult.ok ? <CheckCircle size={13} className="shrink-0 mt-0.5" /> : <AlertCircle size={13} className="shrink-0 mt-0.5" />}
            {testResult.message}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
          <button onClick={handleTest} disabled={testing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors font-medium disabled:opacity-50">
            {testing ? <Loader size={12} className="animate-spin" /> : <Wifi size={12} />}
            Test Connection
          </button>
          <button onClick={() => setShowPumps(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors font-medium">
            <List size={12} /> View Pumps
          </button>
          <button onClick={() => setShowReadings(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors font-medium">
            <FlaskConical size={12} /> Test Readings
          </button>
          <button onClick={() => onEdit(integration)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors font-medium">
            <Edit2 size={12} /> Edit
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors font-medium disabled:opacity-50 ml-auto">
            {deleting ? <Loader size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Delete
          </button>
        </div>
      </div>

      {showPumps && (
        <PumpsModal integration={integration} onClose={() => setShowPumps(false)} />
      )}
      {showReadings && (
        <ReadingsTestPanel integration={integration} onClose={() => setShowReadings(false)} />
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StationIntegrations() {
  const notify              = useNotify();
  const { isSuperAdmin }    = useAuth();
  const [integrations, setIntegrations] = useState([]);
  const [loading,      setLoading     ] = useState(true);
  const [modal,        setModal       ] = useState(null); // null | 'new' | integration

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/station-integrations');
      setIntegrations(data.data || []);
    } catch {
      notify('Failed to load integrations', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);   // eslint-disable-line

  const handleSaved = (saved) => {
    setIntegrations(prev => {
      const idx = prev.findIndex(i => i._id === saved._id);
      if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n; }
      return [saved, ...prev];
    });
    setModal(null);
  };

  const handleDelete = (id) => {
    setIntegrations(prev => prev.filter(i => i._id !== id));
  };

  if (!isSuperAdmin()) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center">
        <Plug2 size={48} className="text-gray-200 mx-auto mb-3" />
        <p className="font-semibold text-gray-600">Super Admin access required</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Station Integrations</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Connect to external fuel station APIs — pump monitoring, forecourt controllers, meter readings
          </p>
        </div>
        <button onClick={() => setModal('new')} className="btn-primary">
          <Plus size={16} /> Add Integration
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
        <p className="font-semibold mb-1">How it works</p>
        <p className="text-blue-700 text-xs">
          When a worker clocks in, FuelStation HR automatically reads their pump's opening meter.
          When they clock out, the closing meter is recorded and volume dispensed is calculated.
          Workers must have a Pump ID assigned (via Pump Shifts → Assign Pump).
        </p>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="card p-5 animate-pulse space-y-3">
              <div className="h-5 w-48 bg-gray-100 rounded" />
              <div className="h-3 w-full bg-gray-100 rounded" />
              <div className="h-3 w-2/3 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : integrations.length === 0 ? (
        <div className="card px-6 py-20 text-center">
          <Plug2 size={52} className="text-gray-200 mx-auto mb-3" />
          <p className="font-semibold text-gray-600">No integrations yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Add your first station API integration to enable automatic meter readings
          </p>
          <button onClick={() => setModal('new')} className="btn-primary mt-5 inline-flex">
            <Plus size={16} /> Add Integration
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {integrations.map(intg => (
            <IntegrationCard
              key={intg._id}
              integration={intg}
              onEdit={i => setModal(i)}
              onDelete={handleDelete}
              onRefresh={load}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <IntegrationModal
          integration={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
