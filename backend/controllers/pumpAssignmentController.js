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
  if (typeof adapter.getDayReadings !== 'function') {
    return res.status(400).json({ success: false, message: 'This integration does not support meter sync. Use Sage API provider.' });
  }

  let readings;
  try {
    readings = await adapter.getDayReadings(date);
  } catch (e) {
    return res.status(502).json({ success: false, message: `StationDesk API error: ${e.message}` });
  }

  if (!readings.length) {
    return res.json({ success: true, synced: 0, message: 'No readings available for this date yet.' });
  }

  // Map nozzle_id → Pump (primary: externalId; fallback: normalised name)
  const pumps = await Pump.find({ company: cid }).lean();
  const pumpByNozzle = {};
  const pumpByName   = {};
  pumps.forEach(p => {
    if (p.externalId) pumpByNozzle[p.externalId] = p;
    if (p.pumpName)   pumpByName[p.pumpName.trim().toLowerCase()] = p;
  });

  // Also backfill externalId on any pump that has no externalId but matches by name
  // (auto-heal so future syncs use the fast path)
  const backfillUpdates = [];
  for (const reading of readings) {
    if (pumpByNozzle[reading.nozzle_id]) continue; // already matched
    const nameKey = (reading.name || reading.nozzle_name || '').trim().toLowerCase();
    const matched = nameKey ? pumpByName[nameKey] : null;
    if (matched && !matched.externalId) {
      backfillUpdates.push(
        Pump.findByIdAndUpdate(matched._id, { externalId: reading.nozzle_id })
      );
      // update in-memory map so the assignment step below can use it
      pumpByNozzle[reading.nozzle_id] = matched;
    } else if (matched) {
      pumpByNozzle[reading.nozzle_id] = matched;
    }
  }
  if (backfillUpdates.length) await Promise.all(backfillUpdates);

  // Load assignments for this date
  const filter = { company: cid, date };
  if (branchId) filter.branchId = branchId;
  const assignments = await PumpAssignment.find(filter).lean();

  // Build lookup: pump._id → assignments (a pump can have 1-2 workers via island)
  const assignmentsByPump = {};
  assignments.forEach(a => {
    if (!a.pump) return;
    const k = String(a.pump);
    if (!assignmentsByPump[k]) assignmentsByPump[k] = [];
    assignmentsByPump[k].push(a);
  });

  let synced = 0;
  for (const reading of readings) {
    const pump = pumpByNozzle[reading.nozzle_id];
    if (!pump) continue;

    const matched = assignmentsByPump[String(pump._id)] || [];
    if (!matched.length) continue;

    const update = {};
    if (reading.opening?.effective_value != null)  update.openingMeter = reading.opening.effective_value;
    if (reading.closing?.effective_value != null)   update.closingMeter = reading.closing.effective_value;
    if (reading.litres_sold != null)                update.volume       = reading.litres_sold;
    if (reading.is_final && update.closingMeter != null) update.status  = 'completed';

    if (Object.keys(update).length) {
      // Update all workers assigned to this pump (covers 2-worker islands)
      await Promise.all(matched.map(a => PumpAssignment.findByIdAndUpdate(a._id, update)));
      synced += matched.length;
    }
  }

  // Diagnostic info so we can see exactly why mismatches happen
  const debug = {
    stationDeskNozzles: readings.map(r => ({ nozzle_id: r.nozzle_id, name: r.name || r.nozzle_name || '' })),
    localPumps: pumps.map(p => ({ _id: p._id, pumpName: p.pumpName, externalId: p.externalId || null })),
    assignmentsToday: assignments.map(a => ({ _id: a._id, pump: a.pump || null, pumpName: a.pumpName, workerName: a.workerName })),
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
