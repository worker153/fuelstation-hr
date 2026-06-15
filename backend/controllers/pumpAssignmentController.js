const PumpAssignment    = require('../models/PumpAssignment');
const Pump              = require('../models/Pump');
const { overrideAssignment } = require('../services/pumpService');

const getAssignments = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId, date, workerId, page = 1, limit = 100 } = req.query;
  const filter = { company: cid };
  if (branchId) filter.branchId = branchId;
  if (date)     filter.date     = date;
  if (workerId) filter.worker   = workerId;
  const [assignments, total] = await Promise.all([
    PumpAssignment.find(filter).sort({ date: -1, assignedAt: -1 })
      .skip((page-1)*limit).limit(Number(limit)).lean(),
    PumpAssignment.countDocuments(filter),
  ]);
  res.json({ success: true, data: assignments, total });
};

const override = async (req, res) => {
  const cid = req.user.company._id;
  const { assignmentId, newPumpId, reason } = req.body;
  if (!assignmentId || !newPumpId)
    return res.status(400).json({ success: false, message: 'assignmentId and newPumpId required' });
  try {
    const assignment = await overrideAssignment({
      assignmentId, newPumpId,
      overrideBy:     req.user._id,
      overrideByName: req.user.name,
      overrideReason: reason || '',
      company: cid,
    });
    res.json({ success: true, data: assignment });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

// GET today's assignments for all workers in a branch (used on terminal)
const getTodayBoard = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId } = req.query;
  if (!branchId) return res.status(400).json({ success: false, message: 'branchId required' });
  const today = new Date();
  const watNow = new Date(today.getTime() + 60*60*1000);
  const date = `${watNow.getUTCFullYear()}-${String(watNow.getUTCMonth()+1).padStart(2,'0')}-${String(watNow.getUTCDate()).padStart(2,'0')}`;
  const assignments = await PumpAssignment.find({ company: cid, branchId, date, status: { $ne: 'cancelled' } })
    .sort({ assignedAt: 1 }).lean();
  res.json({ success: true, data: assignments, date });
};

// Sync meter readings from StationDesk for a given date
const syncMeters = async (req, res) => {
  const cid = req.user.company._id;
  const { date, branchId } = req.body;
  if (!date) return res.status(400).json({ success: false, message: 'date is required' });

  const { getAdapter } = require('../services/stationApi');
  const result = await getAdapter(cid);
  if (!result) return res.status(404).json({ success: false, message: 'No active station integration found. Go to API Connections and activate one.' });

  const { adapter } = result;

  // Load all pumps — build lookups
  const pumps = await Pump.find({ company: cid }).lean();
  const pumpByNozzle = {};
  const pumpByName   = {};
  pumps.forEach(p => {
    if (p.externalId) pumpByNozzle[p.externalId] = p;
    if (p.pumpName)   pumpByName[p.pumpName.trim().toLowerCase()] = p;
  });

  // Single call per StationDesk docs: GET /hr-meter-readings?location_id=X&business_date=Y
  // Returns ALL nozzle readings for the date at once.
  let rawRows = [];
  try {
    rawRows = await adapter.getAllReadings(date);
  } catch (e) {
    return res.status(502).json({ success: false, message: `StationDesk API error: ${e.message}` });
  }

  // Detect if the API returned nozzle-directory data instead of readings
  // (happens when no readings have been submitted for this date)
  const isReadingData = rawRows.length > 0 &&
    ('opening' in rawRows[0] || 'closing' in rawRows[0] || 'shift_no' in rawRows[0]);

  if (!rawRows.length || !isReadingData) {
    return res.json({
      success: true, synced: 0, total: 0,
      message: rawRows.length === 0
        ? 'No readings found for this date. The manager may not have submitted meter readings in StationDesk yet.'
        : 'StationDesk returned nozzle info but no meter readings for this date. The manager needs to submit readings through the StationDesk manager app.',
    });
  }

  const PRODUCT_MAP = {
    'DIESEL': 'AGO', 'AGO': 'AGO',
    'PETROL': 'PMS', 'PMS': 'PMS', 'PREMIUM MOTOR SPIRIT': 'PMS',
    'COOKING GAS': 'LPG', 'LPG': 'LPG', 'GAS': 'LPG',
    'DPK': 'DPK', 'KEROSENE': 'DPK',
  };
  const normaliseProduct = (raw = '') => PRODUCT_MAP[raw.trim().toUpperCase()] || raw.trim().toUpperCase() || null;

  const readings = rawRows.map(row => ({
    nozzle_id:   row.nozzle_id,
    name:        row.nozzle_name || '',
    productType: normaliseProduct(row.item_name || ''),
    opening:     row.opening?.effective_value  ?? null,
    closing:     row.closing?.effective_value  ?? null,
    litres_sold: row.litres_sold               ?? null,
    is_final:    row.is_final                  ?? false,
  }));

  // Backfill externalId on pump records by nozzle name
  const backfillUpdates = [];
  for (const r of readings) {
    if (!r.nozzle_id) continue;
    if (pumpByNozzle[r.nozzle_id]) continue;
    const nameKey = r.name.trim().toLowerCase();
    const matched = nameKey ? pumpByName[nameKey] : null;
    if (matched) {
      if (!matched.externalId) backfillUpdates.push(Pump.findByIdAndUpdate(matched._id, { externalId: r.nozzle_id }));
      pumpByNozzle[r.nozzle_id] = matched;
    }
  }
  if (backfillUpdates.length) await Promise.all(backfillUpdates);

  // Load assignments for this date
  const filter = { company: cid, date };
  if (branchId) filter.branchId = branchId;
  const assignments = await PumpAssignment.find(filter).lean();

  // Build three-level lookup for assignments:
  // 1. by pump ObjectId  (best — pump has externalId)
  // 2. by pumpName string (fallback — assignment stores the name)
  const assignmentsByPumpId   = {};
  const assignmentsByPumpName = {};
  assignments.forEach(a => {
    if (a.pump) {
      const k = String(a.pump);
      if (!assignmentsByPumpId[k]) assignmentsByPumpId[k] = [];
      assignmentsByPumpId[k].push(a);
    }
    // always index by normalised name (covers island assignments where pump is null)
    const nameKey = (a.pumpName || '').trim().toLowerCase();
    if (nameKey) {
      if (!assignmentsByPumpName[nameKey]) assignmentsByPumpName[nameKey] = [];
      assignmentsByPumpName[nameKey].push(a);
    }
  });


  // Build product-type buckets for position-based fallback matching
  const readingsByProduct = {};
  readings.forEach(r => {
    const pt = r.productType;
    if (!pt) return;
    if (!readingsByProduct[pt]) readingsByProduct[pt] = [];
    readingsByProduct[pt].push(r);
  });
  Object.values(readingsByProduct).forEach(arr =>
    arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  );

  // Sort assignments within each product type by assignedAt (first to clock in = nozzle 1)
  const assignmentsByProduct = {};
  assignments.forEach(a => {
    const pt = (a.productType || '').toUpperCase();
    if (!pt) return;
    if (!assignmentsByProduct[pt]) assignmentsByProduct[pt] = [];
    assignmentsByProduct[pt].push(a);
  });
  Object.values(assignmentsByProduct).forEach(arr =>
    arr.sort((a, b) => new Date(a.assignedAt) - new Date(b.assignedAt))
  );

  // Track which assignment ids have already been claimed this sync round
  const claimed = new Set();

  let synced = 0;
  for (const reading of readings) {
    const readingNameKey = (reading.name || '').trim().toLowerCase();

    // Match 1: externalId → pump → assignment.pump ObjectId
    const pump = pumpByNozzle[reading.nozzle_id];
    let matched = pump ? (assignmentsByPumpId[String(pump._id)] || []).filter(a => !claimed.has(String(a._id))) : [];

    // Match 2: pumpName on the assignment matches the reading name
    if (!matched.length && readingNameKey) {
      matched = (assignmentsByPumpName[readingNameKey] || []).filter(a => !claimed.has(String(a._id)));
    }

    // Match 3: pump found by externalId but assignment has old pump ref
    if (!matched.length && pump?.pumpName) {
      matched = (assignmentsByPumpName[pump.pumpName.trim().toLowerCase()] || []).filter(a => !claimed.has(String(a._id)));
    }

    // Match 4 (last resort): match by product type + position within that type
    if (!matched.length) {
      const pt = reading.productType; // "PMS", "AGO", "LPG" — from API item_name
      if (pt) {
        const bucket   = readingsByProduct[pt] || [];
        const asgBucket = (assignmentsByProduct[pt] || []).filter(a => !claimed.has(String(a._id)));
        const pos = bucket.indexOf(reading);   // position of this nozzle in its product group
        if (pos >= 0 && asgBucket[pos]) {
          matched = [asgBucket[pos]];
        } else if (asgBucket.length) {
          // fallback: take the first unclaimed assignment of this product type
          matched = [asgBucket[0]];
        }
      }
    }

    if (!matched.length) continue;

    const update = {};
    if (reading.opening    != null) update.openingMeter = reading.opening;
    if (reading.closing    != null) update.closingMeter = reading.closing;
    if (reading.litres_sold != null) update.volume      = reading.litres_sold;
    if (reading.is_final && update.closingMeter != null) update.status  = 'completed';

    if (Object.keys(update).length) {
      await Promise.all(matched.map(a => PumpAssignment.findByIdAndUpdate(a._id, update)));
      matched.forEach(a => claimed.add(String(a._id)));
      synced += matched.length;
    }
  }

  // Diagnostic info
  const debug = {
    dateUsed: date,
    stationDeskReadings: readings,
    localPumps: pumps.map(p => ({ _id: p._id, pumpName: p.pumpName, externalId: p.externalId || null })),
    assignmentsToday: assignments.map(a => ({
      _id: a._id, pump: a.pump || null, pumpName: a.pumpName,
      productType: a.productType, islandName: a.islandName || null, workerName: a.workerName,
    })),
  };

  res.json({ success: true, synced, total: readings.length, message: `Synced ${synced} of ${readings.length} nozzle readings.`, debug });
};

const deleteAssignment = async (req, res) => {
  const cid = req.user.company._id;
  const result = await PumpAssignment.deleteOne({ _id: req.params.id, company: cid });
  if (result.deletedCount === 0)
    return res.status(404).json({ success: false, message: 'Assignment not found' });
  res.json({ success: true });
};

module.exports = { getAssignments, override, getTodayBoard, syncMeters, deleteAssignment };
