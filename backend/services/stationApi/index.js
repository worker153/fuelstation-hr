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

// Capture opening meter after pump assignment on clock-in (fire-and-forget safe)
async function captureOpeningMeter({ company, worker, branchId, branchName, date, shiftName, pumpAssignment }) {
  const PumpShiftRecord = require('../../models/PumpShiftRecord');
  const Pump            = require('../../models/Pump');
  const result = await getAdapter(company);

  // Use pump from PumpAssignment if available, otherwise fall back to worker.pumpId
  let externalId = null, pumpRef = null, pumpLabel = null;
  if (pumpAssignment?.pump) {
    const pump = await Pump.findById(pumpAssignment.pump).lean();
    externalId = pump?.externalId || null;
    pumpRef    = pump?._id || null;
    pumpLabel  = pump?.pumpName || pumpAssignment.pumpName || null;
  } else if (worker.pumpId) {
    externalId = worker.pumpId;
    pumpLabel  = worker.pumpLabel;
  }

  // Idempotency
  const existingRecord = await PumpShiftRecord.findOne({ company, worker: worker._id, date }).lean();
  if (existingRecord) {
    // If we now have a pumpAssignment, update the record to link it
    if (pumpAssignment && !existingRecord.pumpAssignment) {
      await PumpShiftRecord.findByIdAndUpdate(existingRecord._id, {
        pumpAssignment: pumpAssignment._id,
        pump: pumpRef,
        pumpNumber: pumpAssignment.pumpNumber,
      });
    }
    return;
  }

  let openingMeter = null, openError = null;
  if (result && externalId) {
    const { adapter, integration: intDoc } = result;
    try {
      openingMeter = await adapter.getMeterReading(externalId);
    } catch (e) {
      openError = e.message;
    }
    // Link opening meter back to PumpAssignment
    if (pumpAssignment) {
      const PumpAssignment = require('../../models/PumpAssignment');
      await PumpAssignment.findByIdAndUpdate(pumpAssignment._id, {
        openingMeter: openingMeter,
        meterError:   openError || undefined,
      });
    }
    await PumpShiftRecord.create({
      company, branchId, branchName,
      integration:    intDoc._id,
      pump:           pumpRef,
      pumpAssignment: pumpAssignment?._id,
      pumpNumber:     pumpAssignment?.pumpNumber,
      worker:         worker._id,
      workerName:     worker.fullName,
      workerRole:     worker.role,
      pumpId:         externalId,
      pumpLabel,
      date, shiftName: shiftName || '',
      openingMeter, openedAt: new Date(),
      status: openError ? 'error' : 'open',
      openError,
    });
  } else if (pumpAssignment) {
    // No external API — still create a record for tracking
    await PumpShiftRecord.create({
      company, branchId, branchName,
      pump:           pumpRef,
      pumpAssignment: pumpAssignment._id,
      pumpNumber:     pumpAssignment.pumpNumber,
      worker:         worker._id, workerName: worker.fullName, workerRole: worker.role,
      pumpId: externalId, pumpLabel, date, shiftName: shiftName || '',
      status: 'open', openedAt: new Date(),
    });
  }
}

// Capture closing meter on clock-out
async function captureClosingMeter({ company, worker, date }) {
  const PumpShiftRecord = require('../../models/PumpShiftRecord');
  const PumpAssignment  = require('../../models/PumpAssignment');
  const record = await PumpShiftRecord.findOne({
    company, worker: worker._id, date, status: { $in: ['open', 'error'] },
  });
  if (!record) return;

  const result = await getAdapter(company);
  if (!result || !record.pumpId) {
    // No API — mark completed without meter
    const assign = record.pumpAssignment
      ? await PumpAssignment.findById(record.pumpAssignment) : null;
    if (assign) { assign.status = 'completed'; await assign.save(); }
    record.status   = 'closed';
    record.closedAt = new Date();
    await record.save();
    return;
  }

  const { adapter } = result;
  let closingMeter = null, closeError = null;
  try { closingMeter = await adapter.getMeterReading(record.pumpId); }
  catch (e) { closeError = e.message; }

  const volume = (closingMeter != null && record.openingMeter != null)
    ? Math.max(0, closingMeter - record.openingMeter) : null;

  record.closingMeter = closingMeter;
  record.volume       = volume;
  record.closedAt     = new Date();
  record.status       = closeError ? 'error' : 'closed';
  record.closeError   = closeError;
  await record.save();

  // Update PumpAssignment too
  if (record.pumpAssignment) {
    await PumpAssignment.findByIdAndUpdate(record.pumpAssignment, {
      closingMeter, volume, status: 'completed',
    });
  }
}

module.exports = { getAdapter, captureOpeningMeter, captureClosingMeter };
