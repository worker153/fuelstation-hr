const Worker         = require('../models/Worker');
const PumpIsland     = require('../models/PumpIsland');
const PumpAssignment = require('../models/PumpAssignment');
const IslandMeterLog = require('../models/IslandMeterLog');
const Shortage       = require('../models/Shortage');
const Pump           = require('../models/Pump');

// ── Helpers ───────────────────────────────────────────────────────────────────
const WAT_OFFSET = 60 * 60 * 1000;
function todayWAT() {
  const d = new Date(Date.now() + WAT_OFFSET);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

function calcLitres(pumps = []) {
  let total = 0; let anyReading = false;
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

// Returns null if PIN is invalid or role is not supervisor.
async function resolveSupervisor(pin) {
  if (!pin) return null;
  const sup = await Worker.findOne({ pin: String(pin).trim(), employmentStatus: 'active' })
    .populate('branchId', 'name')
    .populate('shiftId',  'name')
    .lean();
  if (!sup) return null;
  const role = (sup.role || '').toLowerCase();
  if (!['supervisor', 'outside supervisor'].includes(role)) return null;
  return sup;
}

// ── POST /api/supervisor/dashboard ───────────────────────────────────────────
const getSupervisorDashboard = async (req, res) => {
  const { pin } = req.body;
  const sup = await resolveSupervisor(pin);
  if (!sup) return res.status(401).json({ success: false, message: 'Invalid PIN or not a supervisor' });

  const company  = sup.company;
  const branchId = sup.branchId?._id || sup.branchId;
  const date     = todayWAT();

  const isOutsideSup = (sup.role || '').toLowerCase() === 'outside supervisor';

  // ── Islands for this branch ───────────────────────────────────────────────
  const islands = await PumpIsland.find({ company, branchId }).sort({ rotationOrder: 1 }).lean();

  // ── Today's meter logs and assignments ───────────────────────────────────
  const [logs, assignments] = await Promise.all([
    IslandMeterLog.find({ company, branchId, date }).lean(),
    PumpAssignment.find({ company, branchId, date, status: { $ne: 'cancelled' } }).lean(),
  ]);
  const logMap    = Object.fromEntries(logs.map(l => [String(l.islandId), l]));
  const assignMap = Object.fromEntries(assignments.map(a => [String(a.island), a]));

  // Collect all pump IDs across assignments to fetch live status in one query
  const allPumpIds = assignments.flatMap(a =>
    (a.assignedPumps || []).map(p => p.pumpId).filter(Boolean)
  );
  const pumpDocs = allPumpIds.length
    ? await Pump.find({ _id: { $in: allPumpIds } }).select('_id status pumpName pumpNumber productType').lean()
    : [];
  const pumpStatusMap = Object.fromEntries(pumpDocs.map(p => [String(p._id), p.status]));

  const islandData = islands.map(island => {
    const log    = logMap[String(island._id)] || null;
    const assign = assignMap[String(island._id)] || null;
    const assignedPumps = (assign?.assignedPumps || []).map(p => ({
      ...p,
      pumpId: String(p.pumpId),
      status: pumpStatusMap[String(p.pumpId)] || 'active',
    }));
    return {
      islandId:     String(island._id),
      islandName:   island.name,
      islandStatus: island.status,
      assignedPumps,
      worker: assign ? {
        workerId:   String(assign.worker),
        workerName: assign.workerName,
      } : null,
      log: log ? {
        _id:        String(log._id),
        status:     log.status,
        pumps:      log.pumps,
        totalLitres: log.totalLitres,
      } : null,
    };
  });

  // ── Shift workers (supervisors see their shift; outside supervisors see all PAs) ──
  const workerFilter = { company, branchId, employmentStatus: 'active' };
  if (isOutsideSup) {
    workerFilter.role = { $regex: '^pump attendant$', $options: 'i' };
  } else if (sup.shiftId) {
    workerFilter.shiftId = sup.shiftId;
  }

  const shiftWorkers = await Worker.find(workerFilter)
    .select('fullName role passportPhoto')
    .lean();

  const workerData = shiftWorkers.map(w => {
    const assign = assignments.find(a => String(a.worker) === String(w._id));
    return {
      _id:      String(w._id),
      fullName: w.fullName,
      role:     w.role,
      photo:    w.passportPhoto?.url,
      island:   assign ? { islandId: String(assign.island), islandName: assign.islandName } : null,
    };
  });

  res.json({
    success: true,
    data: {
      supervisor: {
        _id:       String(sup._id),
        fullName:  sup.fullName,
        role:      sup.role,
        branch:    sup.branchId?.name || '',
        branchId:  String(branchId),
        shiftName: sup.shiftId?.name || '',
      },
      date,
      islands: islandData,
      workers: workerData,
      // unassigned islands — for reassignment target picker
      availableIslands: islandData.filter(i => !i.worker),
    },
  });
};

// ── POST /api/supervisor/meter  — save opening and/or closing meters ──────────
const supervisorSaveMeter = async (req, res) => {
  const { pin, islandId, date, pumps } = req.body;

  if (!islandId || !Array.isArray(pumps) || !pumps.length)
    return res.status(400).json({ success: false, message: 'islandId and pumps[] required' });

  const sup = await resolveSupervisor(pin);
  if (!sup) return res.status(401).json({ success: false, message: 'Invalid PIN or not a supervisor' });

  const company = sup.company;
  const island  = await PumpIsland.findOne({ _id: islandId, company }).lean();
  if (!island) return res.status(404).json({ success: false, message: 'Island not found' });

  const logDate = date || todayWAT();

  // Build merged pumps from existing + submitted values
  const existing = await IslandMeterLog.findOne({ company, islandId, date: logDate }).lean();
  const exPumpMap = Object.fromEntries(
    (existing?.pumps || []).map(p => [String(p.pumpId || p.pumpNumber), p])
  );

  const mergedPumps = pumps.map(p => {
    const key = String(p.pumpId || p.pumpNumber);
    const ex  = exPumpMap[key] || {};
    const n1Open  = p.nozzle1Opening  != null ? Number(p.nozzle1Opening)  : (ex.nozzle1?.opening  ?? null);
    const n1Close = p.nozzle1Closing  != null ? Number(p.nozzle1Closing)  : (ex.nozzle1?.closing  ?? null);
    const n2Open  = p.nozzle2Opening  != null ? Number(p.nozzle2Opening)  : (ex.nozzle2?.opening  ?? null);
    const n2Close = p.nozzle2Closing  != null ? Number(p.nozzle2Closing)  : (ex.nozzle2?.closing  ?? null);
    return {
      pumpId:      p.pumpId      || ex.pumpId,
      pumpNumber:  p.pumpNumber  || ex.pumpNumber,
      pumpName:    p.pumpName    || ex.pumpName,
      productType: p.productType || ex.productType,
      nozzle1: { opening: n1Open, closing: n1Close },
      nozzle2: { opening: n2Open, closing: n2Close },
    };
  });

  const { pumps: computed, totalLitres } = calcLitres(mergedPumps);

  // Determine if log is now fully closed
  const allClosed = computed.every(p =>
    p.nozzle1?.closing != null && p.nozzle2?.closing != null
  );

  const assign = await PumpAssignment.findOne({
    company, branchId: island.branchId, date: logDate, island: islandId,
    status: { $ne: 'cancelled' },
  }).lean();

  const setData = {
    company, branchId: island.branchId, branchName: island.branchName || '',
    islandName: island.name, pumps: computed, totalLitres,
    workerId:   assign?.worker || null,
    workerName: assign?.workerName || '',
    pumpAssignmentId: assign?._id || null,
  };

  // Track who entered which part
  const hasAnyOpening = computed.some(p => p.nozzle1?.opening != null || p.nozzle2?.opening != null);
  const hasAnyClosing = computed.some(p => p.nozzle1?.closing != null || p.nozzle2?.closing != null);
  if (hasAnyOpening && !existing) {
    setData.openedBy = sup._id;
    setData.openedAt = new Date();
  }
  if (hasAnyClosing) {
    setData.closedBy = sup._id;
    setData.closedAt = new Date();
  }

  const log = await IslandMeterLog.findOneAndUpdate(
    { company, islandId, date: logDate },
    {
      $set: setData,
      $setOnInsert: { status: 'open' },
    },
    { upsert: true, new: true }
  );

  if (allClosed) {
    log.status = 'closed';
    await log.save();
    if (log.pumpAssignmentId) {
      await PumpAssignment.findByIdAndUpdate(log.pumpAssignmentId, {
        volume: totalLitres, status: 'completed',
      });
    }
  }

  res.json({ success: true, data: log });
};

// ── POST /api/supervisor/shortage — book a shortage for a shift worker ─────────
const supervisorBookShortage = async (req, res) => {
  const { pin, workerId, amount, about, reason, notes } = req.body;

  if (!workerId) return res.status(400).json({ success: false, message: 'workerId required' });
  if (!amount)   return res.status(400).json({ success: false, message: 'amount required' });

  const sup = await resolveSupervisor(pin);
  if (!sup) return res.status(401).json({ success: false, message: 'Invalid PIN or not a supervisor' });

  const worker = await Worker.findOne({ _id: workerId, company: sup.company }).lean();
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  const shortage = await Shortage.create({
    company:    sup.company,
    branchId:   worker.branchId,
    branchName: worker.branch,
    worker:     worker._id,
    workerName: worker.fullName,
    workerRole: worker.role,
    month, year,
    date: now, attendanceDate: now,
    amount: Number(amount),
    about:  about || 'Supervisor booking',
    reason: reason || 'other',
    notes:  notes ? `${notes} (booked by ${sup.fullName})` : `Booked by supervisor: ${sup.fullName}`,
    source: 'manual',
    status: 'pending',
    pinSubmittedByName: sup.fullName,
  });

  res.status(201).json({ success: true, data: shortage });
};

// ── PATCH /api/supervisor/island-status — mark island active/faulty/out_of_stock ─
const supervisorIslandStatus = async (req, res) => {
  const { pin, islandId, status } = req.body;

  const validStatuses = ['active', 'faulty', 'out_of_stock', 'inactive'];
  if (!validStatuses.includes(status))
    return res.status(400).json({ success: false, message: 'Invalid status. Use: active, faulty, out_of_stock' });

  const sup = await resolveSupervisor(pin);
  if (!sup) return res.status(401).json({ success: false, message: 'Invalid PIN or not a supervisor' });

  const island = await PumpIsland.findOneAndUpdate(
    { _id: islandId, company: sup.company },
    { status },
    { new: true }
  ).lean();
  if (!island) return res.status(404).json({ success: false, message: 'Island not found' });

  res.json({ success: true, data: island });
};

// ── POST /api/supervisor/reassign — move a worker to a different island ───────
const supervisorReassign = async (req, res) => {
  const { pin, workerId, newIslandId } = req.body;

  if (!workerId || !newIslandId)
    return res.status(400).json({ success: false, message: 'workerId and newIslandId required' });

  const sup = await resolveSupervisor(pin);
  if (!sup) return res.status(401).json({ success: false, message: 'Invalid PIN or not a supervisor' });

  const company = sup.company;
  const date    = todayWAT();

  const newIsland = await PumpIsland.findOne({ _id: newIslandId, company }).lean();
  if (!newIsland) return res.status(404).json({ success: false, message: 'Target island not found' });

  // Check if another worker is already on the target island
  const existingOnTarget = await PumpAssignment.findOne({
    company, island: newIslandId, date,
    status: { $ne: 'cancelled' }, worker: { $ne: workerId },
  }).lean();

  if (existingOnTarget && newIsland.maxWorkers <= 1)
    return res.status(400).json({
      success: false,
      message: `${newIsland.name} already has a worker assigned`,
    });

  // Find worker's current assignment
  const assignment = await PumpAssignment.findOne({
    company, worker: workerId, date, status: { $ne: 'cancelled' },
  });
  if (!assignment)
    return res.status(404).json({ success: false, message: 'No active assignment for this worker today' });

  // Build new assignedPumps from the target island's pump list
  const islandPumps = await Pump.find({ _id: { $in: newIsland.pumps || [] } })
    .sort({ rotationOrder: 1 }).lean();

  const assignedPumps = islandPumps.map(p => ({
    pumpId:      p._id,
    pumpNumber:  p.pumpNumber,
    pumpName:    p.pumpName,
    productType: p.productType,
  }));

  const oldIslandId = assignment.island;
  assignment.island        = newIsland._id;
  assignment.islandName    = newIsland.name;
  assignment.assignedPumps = assignedPumps;
  await assignment.save();

  res.json({
    success: true,
    message: `Worker reassigned to ${newIsland.name}`,
    oldIslandId: String(oldIslandId),
    newIslandId: String(newIsland._id),
  });
};

// ── PATCH /api/supervisor/pump-status — mark individual pump active/faulty/out_of_stock
const supervisorPumpStatus = async (req, res) => {
  const { pin, pumpId, status } = req.body;

  const validStatuses = ['active', 'faulty', 'out_of_stock'];
  if (!validStatuses.includes(status))
    return res.status(400).json({ success: false, message: 'Invalid status. Use: active, faulty, out_of_stock' });

  const sup = await resolveSupervisor(pin);
  if (!sup) return res.status(401).json({ success: false, message: 'Invalid PIN or not a supervisor' });

  const pump = await Pump.findOneAndUpdate(
    { _id: pumpId, company: sup.company },
    { status },
    { new: true }
  ).lean();
  if (!pump) return res.status(404).json({ success: false, message: 'Pump not found' });

  res.json({ success: true, data: pump });
};

module.exports = {
  getSupervisorDashboard,
  supervisorSaveMeter,
  supervisorBookShortage,
  supervisorIslandStatus,
  supervisorReassign,
  supervisorPumpStatus,
};
