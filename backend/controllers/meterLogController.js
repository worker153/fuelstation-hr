const IslandMeterLog = require('../models/IslandMeterLog');
const PumpIsland     = require('../models/PumpIsland');
const PumpAssignment = require('../models/PumpAssignment');

// ── Recompute per-pump and total litres ───────────────────────────────────────
function calcLitres(pumps = []) {
  let total = 0;
  let anyReading = false;
  const updated = pumps.map(p => {
    const n1 = p.nozzle1 || {};
    const n2 = p.nozzle2 || {};
    const n1L = (n1.opening != null && n1.closing != null) ? Math.max(0, n1.closing - n1.opening) : null;
    const n2L = (n2.opening != null && n2.closing != null) ? Math.max(0, n2.closing - n2.opening) : null;
    const pumpTotal = (n1L != null || n2L != null) ? (n1L || 0) + (n2L || 0) : null;
    if (pumpTotal != null) { total += pumpTotal; anyReading = true; }
    return {
      ...p,
      nozzle1: { ...n1, litresSold: n1L },
      nozzle2: { ...n2, litresSold: n2L },
      totalLitres: pumpTotal,
    };
  });
  return { pumps: updated, totalLitres: anyReading ? total : null };
}

// ── GET /api/meter-logs?branchId=&date= ─────────────────────────────────────
const getLogs = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId, date } = req.query;
  if (!branchId || !date)
    return res.status(400).json({ success: false, message: 'branchId and date required' });

  const islands     = await PumpIsland.find({ company: cid, branchId }).sort({ rotationOrder: 1 }).lean();
  const logs        = await IslandMeterLog.find({ company: cid, branchId, date }).lean();
  const logMap      = Object.fromEntries(logs.map(l => [String(l.islandId), l]));
  const assignments = await PumpAssignment.find({
    company: cid, branchId, date, status: { $ne: 'cancelled' },
  }).lean();
  const assignMap = Object.fromEntries(assignments.map(a => [String(a.island), a]));

  const data = islands.map(island => {
    const log    = logMap[String(island._id)] || null;
    const assign = assignMap[String(island._id)] || null;
    return {
      islandId:     island._id,
      islandName:   island.name,
      islandStatus: island.status,
      log,
      assignedPumps: assign?.assignedPumps || [],
      worker: assign ? {
        workerId:      assign.worker,
        workerName:    assign.workerName,
        pinnedIslands: assign.pinnedIslands || [],
      } : null,
      pumpAssignmentId: assign?._id || null,
    };
  });

  res.json({ success: true, data, date });
};

// ── POST /api/meter-logs  — save opening meters (per pump, per nozzle) ────────
const saveOpening = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId, branchName, date, islandId, pumps, notes } = req.body;

  if (!branchId || !date || !islandId || !Array.isArray(pumps) || !pumps.length)
    return res.status(400).json({ success: false, message: 'branchId, date, islandId and pumps[] required' });

  const island = await PumpIsland.findOne({ _id: islandId, company: cid }).lean();
  if (!island) return res.status(404).json({ success: false, message: 'Island not found' });

  // Build pumps array — preserve any existing closing values
  const existing = await IslandMeterLog.findOne({ company: cid, islandId, date }).lean();
  const existingPumpMap = Object.fromEntries(
    (existing?.pumps || []).map(p => [String(p.pumpId || p.pumpNumber), p])
  );

  const mergedPumps = pumps.map(p => {
    const key = String(p.pumpId || p.pumpNumber);
    const ex  = existingPumpMap[key] || {};
    return {
      pumpId:      p.pumpId || ex.pumpId,
      pumpNumber:  p.pumpNumber,
      pumpName:    p.pumpName,
      productType: p.productType || ex.productType,
      nozzle1: {
        opening: p.nozzle1Opening != null ? Number(p.nozzle1Opening) : (ex.nozzle1?.opening ?? null),
        closing: ex.nozzle1?.closing ?? null,
      },
      nozzle2: {
        opening: p.nozzle2Opening != null ? Number(p.nozzle2Opening) : (ex.nozzle2?.opening ?? null),
        closing: ex.nozzle2?.closing ?? null,
      },
    };
  });

  const { pumps: computed, totalLitres } = calcLitres(mergedPumps);

  const assign = await PumpAssignment.findOne({
    company: cid, branchId, date, island: islandId, status: { $ne: 'cancelled' },
  }).lean();

  const log = await IslandMeterLog.findOneAndUpdate(
    { company: cid, islandId, date },
    {
      $set: {
        company: cid, branchId, branchName: branchName || island.branchName || '',
        islandName:  island.name,
        pumps:       computed,
        totalLitres,
        notes:       notes || '',
        openedBy:    req.user._id,
        openedAt:    new Date(),
        workerId:    assign?.worker || null,
        workerName:  assign?.workerName || '',
        pumpAssignmentId: assign?._id || null,
      },
      $setOnInsert: { status: 'open' },
    },
    { upsert: true, new: true }
  );

  res.json({ success: true, data: log });
};

// ── PUT /api/meter-logs/:id/close  — save closing meters (per pump, per nozzle)
const saveClosing = async (req, res) => {
  const cid = req.user.company._id;
  const log = await IslandMeterLog.findOne({ _id: req.params.id, company: cid });
  if (!log) return res.status(404).json({ success: false, message: 'Log not found' });

  const { pumps: closingPumps, notes } = req.body;
  if (!Array.isArray(closingPumps) || !closingPumps.length)
    return res.status(400).json({ success: false, message: 'pumps[] with closing meters required' });

  // Merge closing values into existing pumps
  const closingMap = Object.fromEntries(
    closingPumps.map(p => [String(p.pumpId || p.pumpNumber), p])
  );

  const mergedPumps = log.pumps.map(p => {
    const key = String(p.pumpId || p.pumpNumber);
    const cl  = closingMap[key] || {};
    return {
      ...p.toObject?.() ?? p,
      nozzle1: {
        opening:  p.nozzle1?.opening ?? null,
        closing:  cl.nozzle1Closing != null ? Number(cl.nozzle1Closing) : (p.nozzle1?.closing ?? null),
      },
      nozzle2: {
        opening:  p.nozzle2?.opening ?? null,
        closing:  cl.nozzle2Closing != null ? Number(cl.nozzle2Closing) : (p.nozzle2?.closing ?? null),
      },
    };
  });

  const { pumps: computed, totalLitres } = calcLitres(mergedPumps);

  log.pumps       = computed;
  log.totalLitres = totalLitres;
  log.status      = 'closed';
  log.closedBy    = req.user._id;
  log.closedAt    = new Date();
  if (notes !== undefined) log.notes = notes;
  await log.save();

  // Update linked PumpAssignment
  if (log.pumpAssignmentId) {
    await PumpAssignment.findByIdAndUpdate(log.pumpAssignmentId, {
      volume: totalLitres, status: 'completed',
    });
  }

  res.json({ success: true, data: log });
};

// ── GET /api/meter-logs/report?branchId=&month=&year= ────────────────────────
const getReport = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId, month, year } = req.query;
  if (!month || !year)
    return res.status(400).json({ success: false, message: 'month and year required' });

  const datePrefix = `${year}-${String(month).padStart(2, '0')}-`;
  const filter = { company: cid, date: { $regex: `^${datePrefix}` } };
  if (branchId) filter.branchId = branchId;

  const logs = await IslandMeterLog.find(filter).sort({ date: 1, islandName: 1 }).lean();

  const byIsland = {};
  logs.forEach(l => {
    const key = String(l.islandId);
    if (!byIsland[key]) byIsland[key] = { islandName: l.islandName, totalLitres: 0, days: 0, records: [] };
    byIsland[key].records.push(l);
    byIsland[key].days++;
    if (l.totalLitres != null) byIsland[key].totalLitres += l.totalLitres;
  });

  const byWorker = {};
  logs.forEach(l => {
    if (!l.workerId) return;
    const key = String(l.workerId);
    if (!byWorker[key]) byWorker[key] = { workerName: l.workerName, totalLitres: 0, days: 0 };
    byWorker[key].days++;
    if (l.totalLitres != null) byWorker[key].totalLitres += l.totalLitres;
  });

  const totalLitres = logs.reduce((s, l) => s + (l.totalLitres || 0), 0);

  res.json({
    success: true,
    data: { logs, byIsland: Object.values(byIsland), byWorker: Object.values(byWorker), totalLitres },
  });
};

module.exports = { getLogs, saveOpening, saveClosing, getReport };
