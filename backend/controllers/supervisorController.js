const Worker         = require('../models/Worker');
const PumpIsland     = require('../models/PumpIsland');
const PumpAssignment = require('../models/PumpAssignment');
const IslandMeterLog = require('../models/IslandMeterLog');
const Shortage       = require('../models/Shortage');
const Pump           = require('../models/Pump');
const Attendance     = require('../models/Attendance');
const Branch         = require('../models/Branch');
const Shift          = require('../models/Shift');
const Break          = require('../models/Break');
const { createAttendanceShortage }           = require('./shortageController');
const { isWorkerOnDuty, getSettingsForRole } = require('../utils/attendanceHelpers');

// Break config — mirrors breakController.js constants
const BREAK_DEFAULTS = {
  morning:   { enabled: true,  label: 'Morning Break',   allowedMinutes: 5,  windowStart: '07:00', windowEnd: '09:30' },
  afternoon: { enabled: true,  label: 'Afternoon Break', allowedMinutes: 10, windowStart: '12:00', windowEnd: '14:00' },
  night:     { enabled: true,  label: 'Night Break',     allowedMinutes: 5,  windowStart: '19:00', windowEnd: '21:00' },
  break_4:   { enabled: false, label: 'Break 4',         allowedMinutes: 10, windowStart: '10:00', windowEnd: '12:00' },
  break_5:   { enabled: false, label: 'Break 5',         allowedMinutes: 10, windowStart: '15:00', windowEnd: '17:00' },
  break_6:   { enabled: false, label: 'Break 6',         allowedMinutes: 10, windowStart: '22:00', windowEnd: '23:30' },
};
function toMins(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
function nowWATMins() { const n = new Date(); return (n.getUTCHours() * 60 + n.getUTCMinutes() + 60) % 1440; }
function breakCfg(branch, type) {
  const s = branch?.breakSettings?.[type] || {};
  const d = BREAK_DEFAULTS[type] || {};
  return { ...d, ...(s.toObject ? s.toObject() : s), label: s.label || d.label };
}

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
    // Use only the primary meter (outer=nozzle1, inner=nozzle2) for the total.
    // Outer and inner are two separate physical meters on the same pump — not two nozzles.
    const useInner  = (p.primaryMeter || 'outer') === 'inner';
    const pumpTotal = useInner
      ? (n2L != null ? n2L : null)
      : (n1L != null ? n1L : null);
    if (pumpTotal != null) { total += pumpTotal; anyReading = true; }
    return {
      ...p,
      primaryMeter: p.primaryMeter || 'outer',
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

  // Load ALL pumps for every island in the branch (not just assigned ones)
  const islandPumpIds = islands.flatMap(i => (i.pumps || []));
  const allIslandPumps = islandPumpIds.length
    ? await Pump.find({ _id: { $in: islandPumpIds } })
        .select('_id status pumpName pumpNumber productType rotationOrder').lean()
    : [];
  const pumpDocMap    = Object.fromEntries(allIslandPumps.map(p => [String(p._id), p]));
  const pumpStatusMap = Object.fromEntries(allIslandPumps.map(p => [String(p._id), p.status]));

  // Build map: pumpId → { workerId, workerName } from today's assignments
  const pumpWorkerMap = {};
  assignments.forEach(a => {
    (a.assignedPumps || []).forEach(p => {
      if (p.pumpId) pumpWorkerMap[String(p.pumpId)] = {
        workerId:   String(a.worker),
        workerName: a.workerName,
      };
    });
  });

  const islandData = islands.map(island => {
    const log    = logMap[String(island._id)] || null;
    const assign = assignMap[String(island._id)] || null;

    // Full pump list for this island, each tagged with in-use status
    const allPumps = (island.pumps || [])
      .map(pid => {
        const id     = String(pid);
        const pump   = pumpDocMap[id] || {};
        const worker = pumpWorkerMap[id];
        return {
          pumpId:      id,
          pumpNumber:  pump.pumpNumber,
          pumpName:    pump.pumpName,
          productType: pump.productType,
          status:      pumpStatusMap[id] || 'active',
          inUse:       !!worker,
          assignedWorkerId:   worker?.workerId   || null,
          assignedWorkerName: worker?.workerName || null,
        };
      })
      .sort((a, b) => (a.pumpNumber || 0) - (b.pumpNumber || 0));

    return {
      islandId:     String(island._id),
      islandName:   island.name,
      islandStatus: island.status,
      allPumps,           // full list with inUse tags — used by reassign modal
      assignedPumps: allPumps, // same list used by meter + status modals
      worker: assign ? {
        workerId:   String(assign.worker),
        workerName: assign.workerName,
      } : null,
      log: log ? {
        _id:         String(log._id),
        status:      log.status,
        pumps:       log.pumps,
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
    .select('fullName role passportPhoto faceDescriptor')
    .lean();

  // Today's clock status for all workers + supervisor
  const allWorkerIds = [...shiftWorkers.map(w => w._id), sup._id];
  const todayAttAll  = await Attendance.find({
    company,
    worker: { $in: allWorkerIds },
    date,
  }).select('worker type timestamp').lean();

  const clockMap = {};
  todayAttAll.forEach(r => {
    const id = String(r.worker);
    if (!clockMap[id]) clockMap[id] = { clockedIn: false, clockedOut: false, clockInTime: null, clockOutTime: null };
    if (r.type === 'clock_in')  { clockMap[id].clockedIn  = true; clockMap[id].clockInTime  = r.timestamp; }
    if (r.type === 'clock_out') { clockMap[id].clockedOut = true; clockMap[id].clockOutTime = r.timestamp; }
  });

  const workerData = shiftWorkers.map(w => {
    const assign = assignments.find(a => String(a.worker) === String(w._id));
    const tid    = String(w._id);
    return {
      _id:            String(w._id),
      fullName:       w.fullName,
      role:           w.role,
      photo:          w.passportPhoto?.url,
      hasFace:        (w.faceDescriptor?.length || 0) > 0,
      faceDescriptor: w.faceDescriptor || null,
      island:         assign ? { islandId: String(assign.island), islandName: assign.islandName } : null,
      todayStatus:    clockMap[tid] || { clockedIn: false, clockedOut: false },
    };
  });

  const supId = String(sup._id);
  res.json({
    success: true,
    data: {
      supervisor: {
        _id:            supId,
        fullName:       sup.fullName,
        role:           sup.role,
        photo:          sup.passportPhoto?.url || null,
        branch:         sup.branchId?.name || '',
        branchId:       String(branchId),
        shiftName:      sup.shiftId?.name || '',
        hasFace:        (sup.faceDescriptor?.length || 0) > 0,
        faceDescriptor: sup.faceDescriptor || null,
        todayStatus:    clockMap[supId] || { clockedIn: false, clockedOut: false },
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
      pumpId:       p.pumpId       || ex.pumpId,
      pumpNumber:   p.pumpNumber   || ex.pumpNumber,
      pumpName:     p.pumpName     || ex.pumpName,
      productType:  p.productType  || ex.productType,
      primaryMeter: p.primaryMeter || ex.primaryMeter || 'outer',
      nozzle1: { opening: n1Open, closing: n1Close },
      nozzle2: { opening: n2Open, closing: n2Close },
    };
  });

  const { pumps: computed, totalLitres } = calcLitres(mergedPumps);

  // Determine if log is now fully closed — only the primary meter needs a closing reading
  const allClosed = computed.every(p =>
    (p.primaryMeter || 'outer') === 'inner'
      ? p.nozzle2?.closing != null
      : p.nozzle1?.closing != null
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

// ── POST /api/supervisor/reassign — move a worker to a specific pump ──────────
const supervisorReassign = async (req, res) => {
  const { pin, workerId, newIslandId, newPumpId } = req.body;

  if (!workerId || !newIslandId || !newPumpId)
    return res.status(400).json({ success: false, message: 'workerId, newIslandId and newPumpId required' });

  const sup = await resolveSupervisor(pin);
  if (!sup) return res.status(401).json({ success: false, message: 'Invalid PIN or not a supervisor' });

  const company = sup.company;
  const date    = todayWAT();

  const newIsland = await PumpIsland.findOne({ _id: newIslandId, company }).lean();
  if (!newIsland) return res.status(404).json({ success: false, message: 'Target island not found' });

  // Check if another worker is already on this specific pump today
  const pumpInUse = await PumpAssignment.findOne({
    company, date, status: { $ne: 'cancelled' },
    worker: { $ne: workerId },
    'assignedPumps.pumpId': newPumpId,
  }).lean();
  if (pumpInUse)
    return res.status(400).json({
      success: false,
      message: `That pump already has a worker assigned`,
    });

  // Find worker's current assignment
  const assignment = await PumpAssignment.findOne({
    company, worker: workerId, date, status: { $ne: 'cancelled' },
  });
  if (!assignment)
    return res.status(404).json({ success: false, message: 'No active assignment for this worker today' });

  // Get the specific pump document
  const pump = await Pump.findOne({ _id: newPumpId, company }).lean();
  if (!pump) return res.status(404).json({ success: false, message: 'Pump not found' });

  const oldIslandId = assignment.island;

  // Archive the worker's current pump before reassigning (enables multi-pump breakdown)
  if ((assignment.assignedPumps || []).length === 1) {
    const old = assignment.assignedPumps[0];
    if (!assignment.pumpHistory) assignment.pumpHistory = [];
    assignment.pumpHistory.push({
      pumpId:       old.pumpId,
      pumpNumber:   old.pumpNumber,
      pumpName:     old.pumpName,
      productType:  old.productType,
      islandId:     assignment.island,
      islandName:   assignment.islandName,
      reassignedAt: new Date(),
    });
  }

  assignment.island        = newIsland._id;
  assignment.islandName    = newIsland.name;
  assignment.assignedPumps = [{
    pumpId:      pump._id,
    pumpNumber:  pump.pumpNumber,
    pumpName:    pump.pumpName,
    productType: pump.productType,
  }];
  await assignment.save();

  res.json({
    success: true,
    message: `Worker reassigned to ${pump.pumpName} on ${newIsland.name}`,
    oldIslandId: String(oldIslandId),
    newIslandId: String(newIsland._id),
    newPumpId:   String(pump._id),
  });
};

// ── POST /api/supervisor/place-worker — initial placement for workers with no assignment today ──
const supervisorPlaceWorker = async (req, res) => {
  const { pin, workerId, islandId, pumpId } = req.body;

  if (!workerId || !islandId)
    return res.status(400).json({ success: false, message: 'workerId and islandId required' });

  const sup = await resolveSupervisor(pin);
  if (!sup) return res.status(401).json({ success: false, message: 'Invalid PIN or not a supervisor' });

  const company  = sup.company;
  const branchId = sup.branchId?._id || sup.branchId;
  const date     = todayWAT();

  // Must not already have an assignment today
  const existing = await PumpAssignment.findOne({
    company, worker: workerId, date, status: { $ne: 'cancelled' },
  }).lean();
  if (existing)
    return res.status(400).json({ success: false, message: 'Worker already has an assignment today — use Reassign instead' });

  const island = await PumpIsland.findOne({ _id: islandId, company }).lean();
  if (!island) return res.status(404).json({ success: false, message: 'Island not found' });

  const worker = await Worker.findOne({ _id: workerId, company }).lean();
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  // How many workers are already on this island today?
  const onIsland = await PumpAssignment.countDocuments({
    company, date, island: island._id, status: { $ne: 'cancelled' },
  });

  // Pick pump: if caller specified one use it; otherwise pick by index (0 = first, 1 = second, etc.)
  let pump = null;
  if (pumpId) {
    pump = await Pump.findOne({ _id: pumpId, company }).lean();
  } else {
    const pid = island.pumps?.[onIsland] ?? island.pumps?.[0];
    if (pid) pump = await Pump.findById(pid).lean();
  }

  const assignment = await PumpAssignment.create({
    company,
    branchId:     island.branchId || branchId,
    branchName:   island.branchName || '',
    island:       island._id,
    islandName:   island.name,
    includesGas:  island.includesGas,
    productTypes: island.productTypes || [],
    pump:         pump?._id,
    pumpNumber:   pump?.pumpNumber,
    pumpName:     pump?.pumpName || island.name,
    productType:  pump?.productType || (island.productTypes || [])[0] || 'PMS',
    assignedPumps: pump ? [{ pumpId: pump._id, pumpNumber: pump.pumpNumber, pumpName: pump.pumpName, productType: pump.productType }] : [],
    worker:       worker._id,
    workerName:   worker.fullName,
    workerRole:   worker.role,
    date,
    shiftName:    '',
    assignedAt:   new Date(),
    source:       'supervisor',
  });

  const { redistributeIslands } = require('../services/pumpService');
  await redistributeIslands({ company, branchId: island.branchId || branchId, date });

  return res.json({
    success: true,
    message: `${worker.fullName} placed on ${island.name}${pump ? ' · ' + pump.pumpName : ''}`,
    data: assignment,
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

// ── POST /api/supervisor/clock-worker ─────────────────────────────────────────
// Supervisor clocks a worker (or themselves) in/out via PIN + face verification.
const supervisorClockWorker = async (req, res) => {
  const { pin: supervisorPin, workerId, workerPin, type, faceMatchScore } = req.body;

  if (!supervisorPin || !workerId || !workerPin || !type)
    return res.status(400).json({ success: false, message: 'supervisorPin, workerId, workerPin and type are required' });
  if (!['clock_in', 'clock_out'].includes(type))
    return res.status(400).json({ success: false, message: 'type must be clock_in or clock_out' });

  const sup = await resolveSupervisor(supervisorPin);
  if (!sup) return res.status(401).json({ success: false, message: 'Invalid supervisor PIN' });

  // Worker must match by both ID and PIN (worker physically proves identity)
  const worker = await Worker.findOne({
    _id:              workerId,
    pin:              String(workerPin).trim(),
    company:          sup.company,
    employmentStatus: 'active',
  }).lean();
  if (!worker) return res.status(401).json({ success: false, message: 'Wrong worker PIN — try again' });

  // Face check — block if worker has a face registered but scan score too low
  const faceVerified = typeof faceMatchScore === 'number' && faceMatchScore >= 55;
  if (worker.faceDescriptor?.length && !faceVerified) {
    return res.status(400).json({
      success: false, faceBlocked: true,
      message: `Face not recognised for ${worker.fullName}. Look at the camera and try again.`,
    });
  }

  const now    = new Date();
  const watNow = new Date(now.getTime() + WAT_OFFSET);
  const toStr  = d =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  let dateStr  = toStr(watNow);

  // Overnight shift: if clocking out and no clock-in today, tie to yesterday's date
  if (type === 'clock_out') {
    const todayCI = await Attendance.findOne({ company: sup.company, worker: worker._id, date: dateStr, type: 'clock_in' }).lean();
    if (!todayCI) {
      const yesterday = toStr(new Date(watNow.getTime() - 24 * 60 * 60 * 1000));
      const prevCI    = await Attendance.findOne({ company: sup.company, worker: worker._id, date: yesterday, type: 'clock_in' }).lean();
      if (prevCI) dateStr = yesterday;
    }
  }

  // Duplicate check
  const existing = await Attendance.findOne({ company: sup.company, worker: worker._id, date: dateStr, type }).lean();
  if (existing) {
    if (type === 'clock_in' && existing.source === 'auto') {
      await Attendance.deleteOne({ _id: existing._id });
    } else {
      const t = new Date(existing.timestamp).toLocaleTimeString('en-NG', {
        hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos',
      });
      return res.status(400).json({
        success: false, alreadyDone: true,
        message: type === 'clock_in'
          ? `${worker.fullName} already clocked in today at ${t}`
          : `${worker.fullName} already clocked out today at ${t}`,
      });
    }
  }

  // Save attendance record
  await Attendance.create({
    company:        sup.company,
    worker:         worker._id,
    workerName:     worker.fullName,
    workerRole:     worker.role,
    branch:         worker.branchId,
    branchName:     worker.branch || '',
    type,
    timestamp:      now,
    date:           dateStr,
    faceMatchScore: faceMatchScore || null,
    faceVerified,
    deviceVerified: false,
    gpsVerified:    false,
    status:         'partial',
    failReasons:    [`Clocked via supervisor: ${sup.fullName}`],
    source:         'supervisor',
  });

  // Auto-deductions — late / absent for clock_in
  if (type === 'clock_in') {
    try {
      const populated = { ...worker, shiftId: worker.shiftId ? await Shift.findById(worker.shiftId).lean() : null };
      if (worker.clockInRequired !== false && isWorkerOnDuty(populated, now)) {
        const branch   = await Branch.findById(worker.branchId).lean();
        const settings = getSettingsForRole(branch, worker.role);
        if (settings) {
          const clockH = watNow.getUTCHours(), clockM = watNow.getUTCMinutes();
          const clockMins    = clockH * 60 + clockM;
          const timeStr      = `${String(clockH).padStart(2,'0')}:${String(clockM).padStart(2,'0')}`;
          const attendDate   = new Date(dateStr + 'T00:00:00.000Z');
          let deducted = false;
          if (settings.absentThreshold && settings.absentDeductionAmount > 0) {
            const [atH, atM] = settings.absentThreshold.split(':').map(Number);
            if (clockMins >= atH * 60 + atM) {
              await createAttendanceShortage({ company: sup.company, worker, branchId: worker.branchId, branchName: worker.branch || '', amount: settings.absentDeductionAmount, source: 'absent', reason: 'absent', attendanceDate: attendDate, notes: `Absent — arrived ${timeStr} via supervisor ${sup.fullName}` });
              deducted = true;
            }
          }
          if (!deducted && settings.clockInDeadline && settings.lateDeductionAmount > 0) {
            const [dlH, dlM] = settings.clockInDeadline.split(':').map(Number);
            if (clockMins > dlH * 60 + dlM) {
              await createAttendanceShortage({ company: sup.company, worker, branchId: worker.branchId, branchName: worker.branch || '', amount: settings.lateDeductionAmount, source: 'late_arrival', reason: 'late_arrival', attendanceDate: attendDate, notes: `Late arrival ${timeStr} via supervisor ${sup.fullName}` });
            }
          }
        }
      }
    } catch (e) { console.error('[SUP-CLOCK] late deduction error:', e.message); }
  }

  // Auto-deductions — early departure for clock_out
  if (type === 'clock_out') {
    try {
      const populated = { ...worker, shiftId: worker.shiftId ? await Shift.findById(worker.shiftId).lean() : null };
      if (isWorkerOnDuty(populated, now)) {
        const branch   = await Branch.findById(worker.branchId).lean();
        const settings = getSettingsForRole(branch, worker.role);
        if (settings?.shiftEnd && settings.earlyDepartureDeductionAmount > 0) {
          const clockH    = watNow.getUTCHours(), clockM = watNow.getUTCMinutes();
          const clockMins = clockH * 60 + clockM;
          const timeStr   = `${String(clockH).padStart(2,'0')}:${String(clockM).padStart(2,'0')}`;
          const [seH, seM] = settings.shiftEnd.split(':').map(Number);
          if (clockMins < seH * 60 + seM) {
            await createAttendanceShortage({ company: sup.company, worker, branchId: worker.branchId, branchName: worker.branch || '', amount: settings.earlyDepartureDeductionAmount, source: 'early_departure', reason: 'early_departure', attendanceDate: new Date(dateStr + 'T00:00:00.000Z'), notes: `Early departure ${timeStr} via supervisor ${sup.fullName}` });
          }
        }
      }
    } catch (e) { console.error('[SUP-CLOCK] early deduction error:', e.message); }
  }

  // Pump auto-assignment on clock_in (pump attendants only)
  let pumpAssignment = null;
  const isPumpAtt = /pump.?attendant|fuel.?attendant|station.?attendant|^attendant$/i.test(worker.role || '');
  if (type === 'clock_in' && isPumpAtt) {
    try {
      const { autoAssignIsland, autoAssignPump } = require('../services/pumpService');
      const params = { company: sup.company, branchId: worker.branchId, branchName: worker.branch || '', worker, date: dateStr, shiftName: '' };
      pumpAssignment = await autoAssignIsland(params) || await autoAssignPump(params);
      if (pumpAssignment?.island) {
        await IslandMeterLog.findOneAndUpdate(
          { company: sup.company, islandId: pumpAssignment.island, date: dateStr },
          { $set: { workerId: worker._id, workerName: worker.fullName, pumpAssignmentId: pumpAssignment._id } },
          { new: true }
        );
      }
    } catch (e) { console.error('[SUP-CLOCK] pump assign error:', e.message); }
  }

  // Push notification (fire-and-forget)
  setImmediate(async () => {
    try {
      const { sendPushToCompany } = require('./pushController');
      const t = watNow.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true });
      await sendPushToCompany(sup.company, {
        title: type === 'clock_in' ? `🟢 ${worker.fullName} clocked in` : `🔴 ${worker.fullName} clocked out`,
        body:  `${sup.branchId?.name || ''} · ${t} (via supervisor)`,
        tag:   `attendance-${worker._id}-${type}`,
        url:   '/admin-dashboard',
      });
    } catch {}
  });

  const timeStr = watNow.toLocaleTimeString('en-NG', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos',
  });
  res.status(201).json({
    success: true,
    message: `${worker.fullName} ${type === 'clock_in' ? 'clocked in' : 'clocked out'} at ${timeStr}`,
    data: {
      workerName: worker.fullName,
      type,
      timestamp:  now,
      timeStr,
      faceVerified,
      pumpAssignment: pumpAssignment
        ? { islandName: pumpAssignment.islandName, assignedPumps: pumpAssignment.assignedPumps || [] }
        : null,
    },
  });
};

// ── POST /api/supervisor/break-worker ────────────────────────────────────────
// action: 'status' | 'start' | 'end'
const supervisorBreakWorker = async (req, res) => {
  const { pin, workerId, action, breakType } = req.body;
  if (!pin || !workerId || !action)
    return res.status(400).json({ success: false, message: 'pin, workerId, and action required' });

  const supervisor = await resolveSupervisor(pin);
  if (!supervisor)
    return res.status(401).json({ success: false, message: 'Invalid PIN or not a supervisor' });

  const company  = supervisor.company;
  const branchId = supervisor.branchId?._id || supervisor.branchId;
  const dateStr  = todayWAT();

  const worker = await Worker.findOne({ _id: workerId, company, employmentStatus: 'active' }).lean();
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  const branch = await Branch.findById(branchId).lean();

  if (action === 'status') {
    const [activeBreak, todayBreaks] = await Promise.all([
      Break.findOne({ company, worker: worker._id, date: dateStr, status: 'active' }).lean(),
      Break.find({ company, worker: worker._id, date: dateStr }).lean(),
    ]);
    const nowMins = nowWATMins();
    const availableBreaks = Object.keys(BREAK_DEFAULTS).map(type => {
      const cfg = breakCfg(branch, type);
      const taken = todayBreaks.find(b => b.breakType === type);
      return {
        type, label: cfg.label, allowedMinutes: cfg.allowedMinutes,
        windowStart: cfg.windowStart, windowEnd: cfg.windowEnd, enabled: cfg.enabled,
        inWindow: nowMins >= toMins(cfg.windowStart) && nowMins <= toMins(cfg.windowEnd),
        taken: !!taken && taken.status !== 'missed',
        status: taken?.status || null,
      };
    }).filter(b => b.enabled);

    let elapsed = 0, isOverdue = false;
    if (activeBreak) {
      elapsed   = Math.floor((Date.now() - new Date(activeBreak.startTime)) / 60000);
      isOverdue = elapsed > activeBreak.allowedMinutes;
    }
    return res.json({ success: true, data: {
      activeBreak: activeBreak ? {
        breakType: activeBreak.breakType, label: BREAK_DEFAULTS[activeBreak.breakType]?.label,
        startTime: activeBreak.startTime, allowedMinutes: activeBreak.allowedMinutes,
        elapsedMinutes: elapsed, isOverdue, excessMinutes: Math.max(0, elapsed - activeBreak.allowedMinutes),
      } : null,
      todayBreaks: todayBreaks.map(b => ({ breakType: b.breakType, label: BREAK_DEFAULTS[b.breakType]?.label, status: b.status, actualMinutes: b.actualMinutes })),
      availableBreaks,
    }});
  }

  if (action === 'start') {
    if (!breakType || !BREAK_DEFAULTS[breakType])
      return res.status(400).json({ success: false, message: 'Valid breakType required' });

    const [clockIn, clockOut] = await Promise.all([
      Attendance.findOne({ company, worker: worker._id, date: dateStr, type: 'clock_in'  }).lean(),
      Attendance.findOne({ company, worker: worker._id, date: dateStr, type: 'clock_out' }).lean(),
    ]);
    if (!clockIn)  return res.status(400).json({ success: false, message: 'Worker must be clocked in first' });
    if (clockOut)  return res.status(400).json({ success: false, message: 'Worker has already clocked out' });

    const cfg     = breakCfg(branch, breakType);
    if (!cfg.enabled) return res.status(400).json({ success: false, message: `${cfg.label} is not enabled` });
    const nowMins = nowWATMins();
    if (nowMins < toMins(cfg.windowStart))
      return res.status(400).json({ success: false, message: `${cfg.label} window hasn't started yet (from ${cfg.windowStart})` });
    if (nowMins > toMins(cfg.windowEnd))
      return res.status(400).json({ success: false, message: `${cfg.label} window closed at ${cfg.windowEnd}` });

    const [active, prior] = await Promise.all([
      Break.findOne({ company, worker: worker._id, date: dateStr, status: 'active' }).lean(),
      Break.findOne({ company, worker: worker._id, date: dateStr, breakType }).lean(),
    ]);
    if (active) return res.status(400).json({ success: false, message: `${worker.fullName} is already on a break` });
    if (prior && prior.status !== 'missed')
      return res.status(400).json({ success: false, message: `${worker.fullName} already took ${cfg.label} today` });

    const now      = new Date();
    const deadline = new Date(now.getTime() + cfg.allowedMinutes * 60000);
    await Break.findOneAndUpdate(
      { company, worker: worker._id, date: dateStr, breakType },
      {
        $set: {
          company, branchId, branchName: branch?.name || '',
          worker: worker._id, workerName: worker.fullName, workerRole: worker.role,
          date: dateStr, breakType, status: 'active',
          allowedMinutes: cfg.allowedMinutes, windowStart: cfg.windowStart, windowEnd: cfg.windowEnd,
          startTime: now, endTime: null, actualMinutes: 0, excessMinutes: 0, authType: 'supervisor',
        },
        $push: { auditLog: { action: 'started', timestamp: now, by: 'supervisor',
          notes: `${worker.fullName} started ${cfg.label} (supervisor: ${supervisor.fullName})` } },
      },
      { upsert: true, new: true }
    );
    return res.json({ success: true, message: `${cfg.label} started for ${worker.fullName} — ${cfg.allowedMinutes} minutes`,
      data: { breakType, label: cfg.label, allowedMinutes: cfg.allowedMinutes, startTime: now, deadline } });
  }

  if (action === 'end') {
    const activeBreak = await Break.findOne({ company, worker: worker._id, date: dateStr, status: 'active' });
    if (!activeBreak) return res.status(400).json({ success: false, message: `${worker.fullName} is not currently on a break` });

    const now       = new Date();
    const actualMins = Math.max(0, Math.round((now - activeBreak.startTime) / 60000));
    const excessMins = Math.max(0, actualMins - activeBreak.allowedMinutes);
    const overstayed = excessMins > 0;
    activeBreak.endTime = now; activeBreak.actualMinutes = actualMins;
    activeBreak.excessMinutes = excessMins; activeBreak.status = overstayed ? 'overstayed' : 'completed';
    activeBreak.auditLog.push({ action: overstayed ? 'ended_overstayed' : 'ended', timestamp: now, by: 'supervisor',
      notes: `Ended by supervisor ${supervisor.fullName} after ${actualMins} min${overstayed ? ` (${excessMins} min OVER)` : ''}` });
    await activeBreak.save();
    return res.json({ success: true, overstayed, message: overstayed ? `⚠️ ${worker.fullName} was ${excessMins} min over break` : `Break ended — ${actualMins} min taken`,
      data: { breakType: activeBreak.breakType, label: BREAK_DEFAULTS[activeBreak.breakType]?.label, status: activeBreak.status, actualMinutes: actualMins, excessMinutes: excessMins } });
  }

  return res.status(400).json({ success: false, message: 'Invalid action (use start | end | status)' });
};

module.exports = {
  getSupervisorDashboard,
  supervisorSaveMeter,
  supervisorBookShortage,
  supervisorIslandStatus,
  supervisorReassign,
  supervisorPlaceWorker,
  supervisorPumpStatus,
  supervisorClockWorker,
  supervisorBreakWorker,
};
