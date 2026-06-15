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

  const result = await adapter.testConnection();

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

// Fetch locations using credentials entered in the form (before saving)
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

// Test meter readings for a specific date — returns raw nozzle + reading data
const testReadings = async (req, res) => {
  const cid = req.user.company._id;
  const integration = await StationIntegration.findOne({ _id: req.params.id, company: cid }).select('+apiKey').lean();
  if (!integration) return res.status(404).json({ success: false, message: 'Integration not found' });

  const date    = req.query.date || new Date().toISOString().slice(0, 10);
  const baseUrl = (integration.baseUrl || '').replace(/\/$/, '');
  const apiKey  = integration.apiKey || '';
  const locId   = integration.locationId || '';

  // ── Direct HTTP debug call (bypasses adapter) ─────────────────────────────
  // Step 1: raw call to /hr-nozzles
  const nozzleUrl = `${baseUrl}/hr-nozzles?location_id=${encodeURIComponent(locId)}`;
  let nozzlesRaw = [], nozzlesHttpStatus = null, nozzlesError = null;
  try {
    const r = await fetch(nozzleUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
    nozzlesHttpStatus = r.status;
    const body = await r.json().catch(() => ({}));
    nozzlesRaw = body.data || [];
    if (!r.ok) nozzlesError = body.error || body.message || `HTTP ${r.status}`;
  } catch (e) {
    nozzlesError = e.message;
  }

  if (nozzlesError || !nozzlesRaw.length) {
    return res.json({
      success: false,
      debug: { nozzleUrl, nozzlesHttpStatus, nozzlesError, nozzleCount: nozzlesRaw.length },
      message: nozzlesError || 'No nozzles returned from /hr-nozzles',
    });
  }

  // Step 2: raw call to /hr-meter-readings for first nozzle
  const firstNozzle = nozzlesRaw[0];
  const firstNid    = firstNozzle.nozzle_id;
  const readingUrl  = `${baseUrl}/hr-meter-readings?location_id=${encodeURIComponent(locId)}&business_date=${date}&nozzle_id=${encodeURIComponent(firstNid)}`;
  let readingRaw = null, readingHttpStatus = null, readingError = null;
  try {
    const r = await fetch(readingUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
    readingHttpStatus = r.status;
    const body = await r.json().catch(() => ({}));
    readingRaw = body;
    if (!r.ok) readingError = body.error || body.message || `HTTP ${r.status}`;
  } catch (e) {
    readingError = e.message;
  }

  // Step 3: fetch all nozzle readings
  const readings = await Promise.all(
    nozzlesRaw.map(async n => {
      const nid  = n.nozzle_id;
      const name = n.name || '';
      if (!nid) return { nozzle_id: null, name, product: n.item_name || '', opening: null, closing: null, litres_sold: null, has_data: false, _raw: null };
      try {
        const url = `${baseUrl}/hr-meter-readings?location_id=${encodeURIComponent(locId)}&business_date=${date}&nozzle_id=${encodeURIComponent(nid)}`;
        const r   = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
        const body = await r.json().catch(() => ({}));
        const row  = (body.data || [])[0] || null;
        const opening     = row?.opening?.effective_value ?? null;
        const closing     = row?.closing?.effective_value ?? null;
        const litres_sold = row?.litres_sold ?? null;
        const has_data    = opening !== null || closing !== null || litres_sold !== null;
        return { nozzle_id: nid, name, product: n.item_name || '', opening, closing, litres_sold, is_final: row?.is_final ?? null, has_data, _raw: row };
      } catch (e) {
        return { nozzle_id: nid, name, product: n.item_name || '', opening: null, closing: null, litres_sold: null, has_data: false, error: e.message, _raw: null };
      }
    })
  );

  const withData = readings.filter(r => r.has_data).length;
  res.json({
    success: true, date,
    nozzleCount: nozzlesRaw.length,
    withData,
    message: `${withData} of ${nozzlesRaw.length} nozzles have readings for ${date}.`,
    readings,
    _debug: {
      nozzleUrl,
      nozzlesHttpStatus,
      readingUrl,
      readingHttpStatus,
      readingError,
      firstReadingRaw: readingRaw,
    },
  });
};

module.exports = { getIntegrations, createIntegration, updateIntegration, deleteIntegration, testConnection, getPumps, fetchLocations, testReadings };
