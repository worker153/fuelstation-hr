const StationIntegration = require('../../models/StationIntegration');
const GenericRestAdapter = require('./adapters/GenericRestAdapter');
const SageAdapter        = require('./adapters/SageAdapter');

const ADAPTERS = {
  generic_rest:  GenericRestAdapter,
  sage:          SageAdapter,
  forecourt:     GenericRestAdapter,
  pump_monitor:  GenericRestAdapter,
  custom:        GenericRestAdapter,
};

async function getAdapter(companyId) {
  const integration = await StationIntegration.findOne({ company: companyId, status: 'active' })
    .select('+apiKey').lean();
  if (!integration) return null;
  const AdapterClass = ADAPTERS[integration.provider] || GenericRestAdapter;
  return { adapter: new AdapterClass(integration), integration };
}

// Capture opening meter for a worker on clock-in (fire-and-forget safe)
async function captureOpeningMeter({ company, worker, branchId, branchName, date, shiftName }) {
  const PumpShiftRecord = require('../../models/PumpShiftRecord');
  const result = await getAdapter(company);
  if (!result) return; // no active integration

  const { adapter, integration } = result;
  const pumpId    = worker.pumpId;
  const pumpLabel = worker.pumpLabel;
  if (!pumpId) return; // worker has no pump assigned

  // Idempotency — don't duplicate if already opened today
  const existing = await PumpShiftRecord.findOne({
    company, worker: worker._id, date,
  }).lean();
  if (existing) return;

  let openingMeter = null, openError = null;
  try {
    openingMeter = await adapter.getMeterReading(pumpId);
  } catch (e) {
    openError = e.message;
  }

  await PumpShiftRecord.create({
    company, branchId, branchName, integration: integration._id,
    worker: worker._id, workerName: worker.fullName, workerRole: worker.role,
    pumpId, pumpLabel, date, shiftName: shiftName || '',
    openingMeter, openedAt: new Date(),
    status: openError ? 'error' : 'open',
    openError,
  });
}

// Capture closing meter on clock-out
async function captureClosingMeter({ company, worker, date }) {
  const PumpShiftRecord = require('../../models/PumpShiftRecord');
  const record = await PumpShiftRecord.findOne({
    company, worker: worker._id, date, status: { $in: ['open', 'error'] },
  });
  if (!record) return;

  const result = await getAdapter(company);
  if (!result) return;
  const { adapter } = result;

  let closingMeter = null, closeError = null;
  try {
    closingMeter = await adapter.getMeterReading(record.pumpId);
  } catch (e) {
    closeError = e.message;
  }

  const volume = (closingMeter != null && record.openingMeter != null)
    ? Math.max(0, closingMeter - record.openingMeter)
    : null;

  record.closingMeter = closingMeter;
  record.volume       = volume;
  record.closedAt     = new Date();
  record.status       = closeError ? 'error' : 'closed';
  record.closeError   = closeError;
  await record.save();
}

module.exports = { getAdapter, captureOpeningMeter, captureClosingMeter };
