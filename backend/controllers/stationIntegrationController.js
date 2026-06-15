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

  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const AdapterClass = ADAPTERS[integration.provider] || GenericRestAdapter;
  const adapter = new AdapterClass(integration);

  // Step 1: nozzle list
  let nozzles = [];
  try {
    nozzles = typeof adapter.getDayReadings === 'function'
      ? await adapter.getDayReadings(date)
      : await adapter.getPumps();
  } catch (e) {
    return res.status(502).json({ success: false, message: `Failed to fetch nozzle list: ${e.message}` });
  }

  if (!nozzles.length) {
    return res.json({ success: true, date, nozzles: [], readings: [], message: 'No nozzles found for this location/date.' });
  }

  // Map raw rows to normalised shape
  // /hr-meter-readings returns nozzle_name + full reading data in one call
  const readings = nozzles.map(r => {
    const nid  = r.nozzle_id || r.id;
    const name = r.nozzle_name || r.name || '';
    const opening     = r.opening?.effective_value ?? null;
    const closing     = r.closing?.effective_value ?? null;
    const litres_sold = r.litres_sold ?? null;
    const has_data    = opening !== null || closing !== null || litres_sold !== null;
    return {
      nozzle_id: nid, name,
      product:   r.item_name || '',
      opening, closing, litres_sold,
      is_final:  r.is_final ?? null,
      has_data,
      _raw: r,
    };
  });

  const withData = readings.filter(r => r.has_data).length;
  res.json({
    success: true, date,
    nozzleCount: nozzles.length,
    withData,
    message: `${withData} of ${nozzles.length} nozzles have readings for ${date}.`,
    readings,
  });
};

module.exports = { getIntegrations, createIntegration, updateIntegration, deleteIntegration, testConnection, getPumps, fetchLocations, testReadings };
