const IslandMeterLog = require('../models/IslandMeterLog');
const PumpIsland     = require('../models/PumpIsland');
const PumpAssignment = require('../models/PumpAssignment');

// ── GET /api/meter-logs?branchId=&date= ─────────────────────────────────────
const getLogs = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId, date } = req.query;
  if (!branchId || !date)
    return res.status(400).json({ success: false, message: 'branchId and date required' });

  // Load all active islands for the branch
  const islands = await PumpIsland.find({ company: cid, branchId }).sort({ rotationOrder: 1 }).lean();

  // Load existing logs for this date
  const logs = await IslandMeterLog.find({ company: cid, branchId, date }).lean();
  const logMap = Object.fromEntries(logs.map(l => [String(l.islandId), l]));

  // Load today's pump assignments (to show which worker is on each island)
  const assignments = await PumpAssignment.find({
    company: cid, branchId, date, status: { $ne: 'cancelled' },
  }).lean();
  const assignMap = Object.fromEntries(assignments.map(a => [String(a.island), a]));

  // Merge: one entry per island
  const data = islands.map(island => {
    const log    = logMap[String(island._id)] || null;
    const assign = assignMap[String(island._id)] || null;
    return {
      islandId:   island._id,
      islandName: island.name,
      islandStatus: island.status,
      log,
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

// ── POST /api/meter-logs  — supervisor saves opening meter for an island ─────
const saveOpening = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId, branchName, date, islandId, openingMeter, notes } = req.body;

  if (!branchId || !date || !islandId || openingMeter == null)
    return res.status(400).json({ success: false, message: 'branchId, date, islandId and openingMeter required' });

  const island = await PumpIsland.findOne({ _id: islandId, company: cid }).lean();
  if (!island) return res.status(404).json({ success: false, message: 'Island not found' });

  const log = await IslandMeterLog.findOneAndUpdate(
    { company: cid, islandId, date },
    {
      $set: {
        company: cid, branchId, branchName: branchName || island.branchName || '',
        islandName: island.name,
        openingMeter: Number(openingMeter),
        notes: notes || '',
        openedBy: req.user._id,
        openedAt: new Date(),
      },
      $setOnInsert: { status: 'open' },
    },
    { upsert: true, new: true }
  );

  // If a PumpAssignment already exists for this island+date, backfill the opening meter
  const assign = await PumpAssignment.findOne({
    company: cid, branchId, date,
    island: islandId, status: { $ne: 'cancelled' },
  }).lean();
  if (assign) {
    await PumpAssignment.findByIdAndUpdate(assign._id, { openingMeter: Number(openingMeter) });
    await IslandMeterLog.findByIdAndUpdate(log._id, {
      workerId: assign.worker,
      workerName: assign.workerName,
      pumpAssignmentId: assign._id,
    });
  }

  res.json({ success: true, data: log });
};

// ── PUT /api/meter-logs/:id/close  — supervisor saves closing meter ──────────
const saveClosing = async (req, res) => {
  const cid = req.user.company._id;
  const log = await IslandMeterLog.findOne({ _id: req.params.id, company: cid });
  if (!log) return res.status(404).json({ success: false, message: 'Log not found' });

  const { closingMeter, notes } = req.body;
  if (closingMeter == null)
    return res.status(400).json({ success: false, message: 'closingMeter required' });

  const closing = Number(closingMeter);
  const litres  = log.openingMeter != null ? Math.max(0, closing - log.openingMeter) : null;

  log.closingMeter = closing;
  log.litresSold   = litres;
  log.status       = 'closed';
  log.closedBy     = req.user._id;
  log.closedAt     = new Date();
  if (notes !== undefined) log.notes = notes;
  await log.save();

  // Update linked PumpAssignment with closing meter + volume
  if (log.pumpAssignmentId) {
    await PumpAssignment.findByIdAndUpdate(log.pumpAssignmentId, {
      closingMeter: closing,
      volume:       litres,
      status:       'completed',
    });
  } else {
    // Try to find the assignment by island+date
    const assign = await PumpAssignment.findOne({
      company: cid, branchId: log.branchId, date: log.date,
      island: log.islandId, status: { $ne: 'cancelled' },
    }).lean();
    if (assign) {
      await PumpAssignment.findByIdAndUpdate(assign._id, {
        closingMeter: closing,
        volume:       litres,
        status:       'completed',
      });
    }
  }

  res.json({ success: true, data: log });
};

// ── GET /api/meter-logs/report?branchId=&month=&year= ───────────────────────
const getReport = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId, month, year } = req.query;
  if (!month || !year)
    return res.status(400).json({ success: false, message: 'month and year required' });

  const datePrefix = `${year}-${String(month).padStart(2, '0')}-`;
  const filter = { company: cid, date: { $regex: `^${datePrefix}` } };
  if (branchId) filter.branchId = branchId;

  const logs = await IslandMeterLog.find(filter).sort({ date: 1, islandName: 1 }).lean();

  // Summaries per island
  const byIsland = {};
  logs.forEach(l => {
    const key = String(l.islandId);
    if (!byIsland[key]) byIsland[key] = { islandName: l.islandName, totalLitres: 0, days: 0, records: [] };
    byIsland[key].records.push(l);
    byIsland[key].days++;
    if (l.litresSold != null) byIsland[key].totalLitres += l.litresSold;
  });

  // Summary per worker
  const byWorker = {};
  logs.forEach(l => {
    if (!l.workerId) return;
    const key = String(l.workerId);
    if (!byWorker[key]) byWorker[key] = { workerName: l.workerName, totalLitres: 0, days: 0 };
    byWorker[key].days++;
    if (l.litresSold != null) byWorker[key].totalLitres += l.litresSold;
  });

  const totalLitres = logs.reduce((s, l) => s + (l.litresSold || 0), 0);

  res.json({
    success: true,
    data: { logs, byIsland: Object.values(byIsland), byWorker: Object.values(byWorker), totalLitres },
  });
};

module.exports = { getLogs, saveOpening, saveClosing, getReport };
