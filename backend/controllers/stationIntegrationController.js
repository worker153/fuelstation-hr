const StationIntegration = require('../models/StationIntegration');
const GenericRestAdapter = require('../services/stationApi/adapters/GenericRestAdapter');
const SageAdapter        = require('../services/stationApi/adapters/SageAdapter');

const ADAPTERS = {
  generic_rest: GenericRestAdapter,
  sage:         SageAdapter,
  forecourt:    GenericRestAdapter,
  pump_monitor: GenericRestAdapter,
  custom:       GenericRestAdapter,
};

const getIntegrations = async (req, res) => {
  const cid = req.user.company._id;
  const integrations = await StationIntegration.find({ company: cid }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: integrations });
};

const createIntegration = async (req, res) => {
  const cid = req.user.company._id;
  const { name, provider, baseUrl, locationId, apiKey, authMethod, apiKeyHeaderName, pumpEndpoint, meterEndpoint, notes, status } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'name is required' });
  const integration = await StationIntegration.create({
    company: cid, name, provider, baseUrl, locationId, apiKey, authMethod, apiKeyHeaderName,
    pumpEndpoint, meterEndpoint, notes,
    status: status || 'inactive',
  });
  res.status(201).json({ success: true, data: integration });
};

const updateIntegration = async (req, res) => {
  const cid = req.user.company._id;
  const integration = await StationIntegration.findOne({ _id: req.params.id, company: cid }).select('+apiKey');
  if (!integration) return res.status(404).json({ success: false, message: 'Integration not found' });
  const fields = ['name', 'provider', 'baseUrl', 'locationId', 'authMethod', 'apiKeyHeaderName', 'pumpEndpoint', 'meterEndpoint', 'notes', 'status'];
  fields.forEach(f => { if (req.body[f] !== undefined) integration[f] = req.body[f]; });
  if (req.body.apiKey) integration.apiKey = req.body.apiKey;
  await integration.save();
  res.json({ success: true, data: integration });
};

const deleteIntegration = async (req, res) => {
  const cid = req.user.company._id;
  await StationIntegration.deleteOne({ _id: req.params.id, company: cid });
  res.json({ success: true });
};

const testConnection = async (req, res) => {
  const cid = req.user.company._id;
  const integration = await StationIntegration.findOne({ _id: req.params.id, company: cid }).select('+apiKey').lean();
  if (!integration) return res.status(404).json({ success: false, message: 'Integration not found' });

  const AdapterClass = ADAPTERS[integration.provider] || GenericRestAdapter;
  const adapter = new AdapterClass(integration);
  const result  = await adapter.testConnection();

  await StationIntegration.findByIdAndUpdate(integration._id, {
    status:      result.ok ? 'active' : 'error',
    lastTestedAt: new Date(),
    lastError:   result.ok ? null : result.message,
  });

  res.json({ success: true, connected: result.ok, message: result.message, status: result.status });
};

const getPumps = async (req, res) => {
  const cid = req.user.company._id;
  const integration = await StationIntegration.findOne({ _id: req.params.id, company: cid }).select('+apiKey').lean();
  if (!integration) return res.status(404).json({ success: false, message: 'Integration not found' });

  const AdapterClass = ADAPTERS[integration.provider] || GenericRestAdapter;
  const adapter = new AdapterClass(integration);
  try {
    const pumps = await adapter.getPumps();
    res.json({ success: true, data: pumps });
  } catch (e) {
    res.status(502).json({ success: false, message: e.message });
  }
};

const fetchLocations = async (req, res) => {
  const { baseUrl, apiKey } = req.body;
  if (!baseUrl || !apiKey) return res.status(400).json({ success: false, message: 'baseUrl and apiKey are required' });
  const adapter = new SageAdapter({ baseUrl, apiKey, locationId: '' });
  try {
    const locations = await adapter.getLocations();
    res.json({ success: true, data: locations });
  } catch (e) {
    res.status(502).json({ success: false, message: e.message });
  }
};

// Test meter readings — single call per StationDesk docs:
// GET /hr-meter-readings?location_id=X&business_date=YYYY-MM-DD
// Returns all nozzle readings for that date at once.
const testReadings = async (req, res) => {
  const cid = req.user.company._id;
  const integration = await StationIntegration.findOne({ _id: req.params.id, company: cid }).select('+apiKey').lean();
  if (!integration) return res.status(404).json({ success: false, message: 'Integration not found' });

  const date    = req.query.date || new Date().toISOString().slice(0, 10);
  const baseUrl = (integration.baseUrl || '').replace(/\/$/, '');
  const apiKey  = integration.apiKey || '';
  const locId   = integration.locationId || '';

  if (!locId) {
    return res.status(400).json({ success: false, message: 'No Location ID set on this integration. Edit the integration and add your Location ID.' });
  }

  const readingUrl = `${baseUrl}/hr-meter-readings?location_id=${encodeURIComponent(locId)}&business_date=${date}`;
  let httpStatus = null, rawBody = null, fetchError = null;
  try {
    const r   = await fetch(readingUrl, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(20000) });
    httpStatus = r.status;
    rawBody    = await r.json().catch(() => null);
    if (!r.ok) fetchError = rawBody?.error || rawBody?.message || `HTTP ${r.status}`;
  } catch (e) {
    fetchError = e.message;
  }

  if (fetchError) {
    return res.json({
      success: false,
      message: `API error: ${fetchError}`,
      _debug: { readingUrl, httpStatus, rawBody },
    });
  }

  const rows = rawBody?.data || [];

  // Reading rows have: nozzle_name, business_date, shift_no, opening{}, closing{}, litres_sold
  // Nozzle-directory rows (returned when no readings exist) have: name, item_id, is_active
  const isReadingData = rows.length > 0 &&
    ('opening' in rows[0] || 'closing' in rows[0] || 'shift_no' in rows[0] || 'litres_sold' in rows[0]);

  if (!isReadingData) {
    const reason = rows.length === 0
      ? `Empty data array — no readings submitted in StationDesk for ${date}.`
      : `StationDesk returned nozzle-directory data instead of readings for ${date}. The manager has not yet submitted meter readings through the StationDesk manager app for this date.`;
    return res.json({
      success: true,
      withData: 0,
      nozzleCount: rows.length,
      message: reason,
      readings: [],
      _debug: { readingUrl, httpStatus, rowCount: rows.length, firstRowKeys: rows[0] ? Object.keys(rows[0]) : [], rawBody },
    });
  }

  const readings = rows.map(row => ({
    nozzle_id:     row.nozzle_id,
    name:          row.nozzle_name || '',
    product:       row.item_name   || '',
    business_date: row.business_date,
    shift_no:      row.shift_no,
    opening:       row.opening?.effective_value  ?? null,
    closing:       row.closing?.effective_value  ?? null,
    litres_sold:   row.litres_sold               ?? null,
    is_final:      row.is_final                  ?? false,
    source:        row.opening?.source           || null,
    has_data:      row.opening?.effective_value != null || row.closing?.effective_value != null,
    _raw:          row,
  }));

  const withData = readings.filter(r => r.has_data).length;
  res.json({
    success: true,
    date,
    nozzleCount: readings.length,
    withData,
    message: `${withData} of ${readings.length} nozzle readings found for ${date}.`,
    readings,
    _debug: { readingUrl, httpStatus, rowCount: rows.length },
  });
};

module.exports = { getIntegrations, createIntegration, updateIntegration, deleteIntegration, testConnection, getPumps, fetchLocations, testReadings };
