const Worker           = require('../models/Worker');
const AttendanceDevice = require('../models/AttendanceDevice');
const Attendance       = require('../models/Attendance');
const Offence          = require('../models/Offence');
const Payroll          = require('../models/Payroll');
const IslandMeterLog   = require('../models/IslandMeterLog');
const PumpAssignment   = require('../models/PumpAssignment');
const Pump             = require('../models/Pump');

// ─── POST /api/worker/auth ────────────────────────────────────────────────────
// Public. PIN + optional device token.
// Returns: worker info, device status, shift workers (supervisor), today's clock state.
const workerPortalAuth = async (req, res) => {
  const { pin, deviceToken } = req.body;
  if (!pin) return res.status(400).json({ success: false, message: 'PIN required' });

  const worker = await Worker.findOne({ pin: String(pin).trim() })
    .populate('branchId', 'name')
    .populate('shiftId',  'name')
    .lean();

  if (!worker)
    return res.status(404).json({ success: false, message: 'Invalid PIN — worker not found' });
  if (worker.employmentStatus !== 'active')
    return res.status(400).json({ success: false, message: 'Your account is not active' });

  // ── Device check ─────────────────────────────────────────────────────────────
  let deviceApproved = false;
  let deviceInfo     = null;

  if (deviceToken) {
    const device = await AttendanceDevice.findOne({ deviceToken }).lean();
    if (device && device.status === 'approved' &&
        String(device.company) === String(worker.company)) {
      deviceApproved = true;
      deviceInfo = {
        _id:          String(device._id),
        name:         device.name,
        branchId:     String(device.branch),
        branchName:   device.branchName,
        branchGPS:    device.branchGPS,
        allowedRadius: device.allowedRadius,
        deviceToken,
      };
    }
  }

  const isSupervisor = ['supervisor', 'outside supervisor']
    .includes((worker.role || '').toLowerCase());

  // ── Today's attendance (WAT date, with overnight fallback) ───────────────────
  const watNow    = new Date(Date.now() + 60 * 60 * 1000); // UTC+1
  const toDateStr = d =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  const today     = toDateStr(watNow);
  const yesterday = toDateStr(new Date(watNow.getTime() - 24 * 60 * 60 * 1000));

  const todayRecs = await Attendance.find({
    company: worker.company, worker: worker._id, date: today,
  }).select('type timestamp').lean();
  let todayIn  = todayRecs.find(r => r.type === 'clock_in');
  let todayOut = todayRecs.find(r => r.type === 'clock_out');

  // Overnight shift: no clock-in today but clocked in yesterday without clocking out
  let isOvernight = false;
  if (!todayIn && !todayOut) {
    const yestRecs = await Attendance.find({
      company: worker.company, worker: worker._id, date: yesterday,
    }).select('type timestamp').lean();
    const yestIn  = yestRecs.find(r => r.type === 'clock_in');
    const yestOut = yestRecs.find(r => r.type === 'clock_out');
    if (yestIn && !yestOut) {
      todayIn     = yestIn;
      isOvernight = true;
    }
  }

  const todayStatus = {
    clockedIn:    !!todayIn,
    clockedOut:   !!todayOut,
    clockInTime:  todayIn?.timestamp  || null,
    clockOutTime: todayOut?.timestamp || null,
    isOvernight,
  };

  // ── Shift workers (all supervisors — device not required for offence booking) ───
  let shiftWorkers = [];
  if (isSupervisor) {
    const isOutsideSup = (worker.role || '').toLowerCase() === 'outside supervisor';
    const filter = {
      company:          worker.company,
      branchId:         worker.branchId?._id || worker.branchId,
      employmentStatus: 'active',
    };
    if (isOutsideSup) {
      // Outside supervisors see all pump attendants in their branch only
      filter.role = { $regex: '^pump attendant$', $options: 'i' };
    } else if (worker.shiftId) {
      filter.shiftId = worker.shiftId;
    }

    const ws = await Worker.find(filter)
      .select('fullName role passportPhoto shiftId faceDescriptor')
      .populate('shiftId', 'name')
      .lean();

    // Fetch today's attendance for all shift workers (+ yesterday for overnight)
    const swIds       = ws.map(w => w._id);
    const [swTodayRecs, swYestRecs] = await Promise.all([
      Attendance.find({ company: worker.company, worker: { $in: swIds }, date: today    }).select('worker type timestamp').lean(),
      Attendance.find({ company: worker.company, worker: { $in: swIds }, date: yesterday }).select('worker type timestamp').lean(),
    ]);

    const swTodayMap = {};
    swTodayRecs.forEach(r => {
      const id = String(r.worker);
      if (!swTodayMap[id]) swTodayMap[id] = { clockedIn: false, clockedOut: false, clockInTime: null, clockOutTime: null };
      if (r.type === 'clock_in')  { swTodayMap[id].clockedIn  = true; swTodayMap[id].clockInTime  = r.timestamp; }
      if (r.type === 'clock_out') { swTodayMap[id].clockedOut = true; swTodayMap[id].clockOutTime = r.timestamp; }
    });
    // Overnight fallback for shift workers
    swYestRecs.forEach(r => {
      const id = String(r.worker);
      if (swTodayMap[id]?.clockedIn || swTodayMap[id]?.clockedOut) return; // today has data
      if (!swTodayMap[id]) swTodayMap[id] = { clockedIn: false, clockedOut: false, clockInTime: null, clockOutTime: null };
      if (r.type === 'clock_in') { swTodayMap[id].clockedIn = true; swTodayMap[id].clockInTime = r.timestamp; swTodayMap[id].isOvernight = true; }
    });

    shiftWorkers = ws.map(w => ({
      _id:            String(w._id),
      fullName:       w.fullName,
      role:           w.role,
      shift:          w.shiftId?.name,
      photo:          w.passportPhoto?.url,
      faceDescriptor: w.faceDescriptor,
      hasFace:        (w.faceDescriptor?.length || 0) > 0,
      todayStatus:    swTodayMap[String(w._id)] || { clockedIn: false, clockedOut: false, clockInTime: null, clockOutTime: null },
    }));
  }

  res.json({
    success: true,
    data: {
      worker: {
        _id:            String(worker._id),
        fullName:       worker.fullName,
        role:           worker.role,
        branch:         worker.branchId?.name || worker.branch,
        branchId:       String(worker.branchId?._id || worker.branchId || ''),
        photo:          worker.passportPhoto?.url,
        isSupervisor,
        shiftId:        String(worker.shiftId?._id || worker.shiftId || ''),
        shiftName:      worker.shiftId?.name,
        faceDescriptor: worker.faceDescriptor,
        hasFace:        (worker.faceDescriptor?.length || 0) > 0,
        company:        String(worker.company),
      },
      deviceApproved,
      deviceInfo,
      shiftWorkers,
      todayStatus,
    },
  });
};

// ─── POST /api/worker/change-pin ──────────────────────────────────────────────
// Public. Verifies current PIN then updates to newPin.
const workerChangePin = async (req, res) => {
  const { currentPin, newPin } = req.body;
  if (!currentPin || !newPin)
    return res.status(400).json({ success: false, message: 'currentPin and newPin are required' });
  if (!/^\d{4}$/.test(String(newPin)))
    return res.status(400).json({ success: false, message: 'New PIN must be exactly 4 digits' });
  if (String(currentPin).trim() === String(newPin).trim())
    return res.status(400).json({ success: false, message: 'New PIN must be different from your current PIN' });

  const worker = await Worker.findOne({ pin: String(currentPin).trim() });
  if (!worker)
    return res.status(404).json({ success: false, message: 'Current PIN is incorrect' });
  if (worker.employmentStatus !== 'active')
    return res.status(400).json({ success: false, message: 'Account is not active' });

  const conflict = await Worker.findOne({
    pin:     String(newPin).trim(),
    company: worker.company,
    _id:     { $ne: worker._id },
  }).lean();
  if (conflict)
    return res.status(400).json({
      success: false,
      message: 'This PIN is already taken — choose a different one',
    });

  worker.pin            = String(newPin).trim();
  worker.pinSelfReset   = true;
  worker.pinSelfResetAt = new Date();
  await worker.save();

  res.json({ success: true, message: 'PIN changed successfully' });
};

// ─── POST /api/worker/book-offence ───────────────────────────────────────────
// PIN-authenticated (device token optional). Supervisor-only. Books an offence for a worker.
const bookOffence = async (req, res) => {
  const {
    deviceToken, pin, workerId,
    offenceType, severity, description,
    action, deductionAmount, witness, date,
  } = req.body;

  if (!pin)         return res.status(400).json({ success: false, message: 'PIN required' });
  if (!workerId)    return res.status(400).json({ success: false, message: 'Worker is required' });
  if (!offenceType) return res.status(400).json({ success: false, message: 'Offence type is required' });
  if (!severity)    return res.status(400).json({ success: false, message: 'Severity is required' });

  // Derive company: from device token if provided, or from supervisor PIN lookup
  let company;
  if (deviceToken) {
    const device = await AttendanceDevice.findOne({ deviceToken, status: 'approved' }).lean();
    if (!device) return res.status(401).json({ success: false, message: 'Invalid or unapproved device' });
    company = device.company;
  }

  // Validate supervisor's PIN (within company if known, else any active worker)
  const pinQuery = { pin: String(pin).trim(), employmentStatus: 'active' };
  if (company) pinQuery.company = company;
  const supervisor = await Worker.findOne(pinQuery).lean();
  if (!supervisor) return res.status(401).json({ success: false, message: 'Invalid PIN — supervisor not found' });

  if (!company) company = supervisor.company;

  const isSup = ['supervisor', 'outside supervisor']
    .includes((supervisor.role || '').toLowerCase());
  if (!isSup)
    return res.status(403).json({ success: false, message: 'Only supervisors can book offences' });

  // Validate target worker
  const worker = await Worker.findOne({ _id: workerId, company }).lean();
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  const offence = await Offence.create({
    company,
    worker:          worker._id,
    workerName:      worker.fullName,
    workerRole:      worker.role,
    branch:          worker.branch,
    branchId:        worker.branchId,
    date:            date ? new Date(date) : new Date(),
    offenceType,
    description:     description || '',
    severity,
    action:          action || 'verbal_warning',
    deductionAmount: action === 'deduction' ? (Number(deductionAmount) || 0) : 0,
    witness:         witness || '',
    recordedByName:  supervisor.fullName,
    status:          'active',
  });

  res.status(201).json({ success: true, data: offence });
};

// ─── POST /api/worker/select-pump ────────────────────────────────────────────
// PIN-authenticated. Worker picks which pump they'll sell from today.
const workerSelectPump = async (req, res) => {
  const { pin, pumpId } = req.body;
  if (!pin || !pumpId)
    return res.status(400).json({ success: false, message: 'pin and pumpId are required' });

  const worker = await Worker.findOne({ pin: String(pin).trim(), employmentStatus: 'active' }).lean();
  if (!worker) return res.status(404).json({ success: false, message: 'Invalid PIN' });

  const watNow    = new Date(Date.now() + 60 * 60 * 1000);
  const toDateStr = d =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  const today = toDateStr(watNow);

  const assignment = await PumpAssignment.findOne({
    company: worker.company,
    worker:  worker._id,
    date:    today,
    status:  { $ne: 'cancelled' },
  });
  if (!assignment)
    return res.status(404).json({ success: false, message: 'No pump assignment for today' });

  // Block if another worker already claimed this pump
  const conflict = await PumpAssignment.findOne({
    company: worker.company,
    date:    today,
    status:  { $ne: 'cancelled' },
    worker:  { $ne: worker._id },
    'assignedPumps.pumpId': pumpId,
  }).lean();
  if (conflict)
    return res.status(400).json({ success: false, message: 'That pump is already taken by another worker' });

  const pump = await Pump.findOne({ _id: pumpId, company: worker.company }).lean();
  if (!pump) return res.status(404).json({ success: false, message: 'Pump not found' });
  if (pump.status === 'faulty')
    return res.status(400).json({ success: false, message: 'That pump is marked as faulty' });
  if (pump.status === 'out_of_stock')
    return res.status(400).json({ success: false, message: 'That pump has no fuel' });

  assignment.assignedPumps = [{
    pumpId:      pump._id,
    pumpNumber:  pump.pumpNumber,
    pumpName:    pump.pumpName,
    productType: pump.productType,
  }];
  await assignment.save();

  res.json({
    success: true,
    message: `You are now on ${pump.pumpName}`,
    data: {
      pumpId:      String(pump._id),
      pumpName:    pump.pumpName,
      pumpNumber:  pump.pumpNumber,
      productType: pump.productType,
    },
  });
};

// ─── GET /api/worker/history ──────────────────────────────────────────────────
// Returns offences, salary history, and yearly litres for the worker.
const workerHistory = async (req, res) => {
  const { pin, year } = req.query;
  if (!pin) return res.status(400).json({ success: false, message: 'PIN required' });

  const worker = await Worker.findOne({ pin: String(pin).trim() }).lean();
  if (!worker) return res.status(404).json({ success: false, message: 'Invalid PIN' });

  const yr = Number(year) || new Date().getFullYear();

  // ── Offences ────────────────────────────────────────────────────────────────
  const offences = await Offence.find({ company: worker.company, worker: worker._id })
    .sort({ date: -1 })
    .select('date offenceType description severity action deductionAmount status resolution createdAt')
    .lean();

  // ── Salary history (all finalised payrolls) ──────────────────────────────────
  const payrolls = await Payroll.find({
    company:          worker.company,
    status:           'finalised',
    'entries.worker': worker._id,
  }).select('month year status finalisedAt entries').sort({ year: -1, month: -1 }).lean();

  const salaryHistory = payrolls.map(p => {
    const entry = (p.entries || []).find(e => String(e.worker) === String(worker._id));
    if (!entry) return null;
    return {
      month:            p.month,
      year:             p.year,
      netPay:           entry.netPay || 0,
      grossSalary:      entry.grossSalary || 0,
      shortage:         entry.shortage || 0,
      absenceDeduction: entry.absenceDeduction || 0,
      bonus:            entry.bonus || 0,
      paid:             entry.paid || false,
      finalisedAt:      p.finalisedAt,
    };
  }).filter(Boolean);

  // ── Yearly litres ─────────────────────────────────────────────────────────────
  const yearlyLogs = await IslandMeterLog.find({
    company:  worker.company,
    workerId: worker._id,
    date:     { $regex: `^${yr}-` },
  }).select('totalLitres date islandName').lean();

  const yearlyLitres = yearlyLogs.reduce((s, l) => s + (l.totalLitres || 0), 0);

  // Monthly breakdown for the year
  const monthlyBreakdown = {};
  yearlyLogs.forEach(l => {
    const mo = l.date?.slice(0, 7); // 'YYYY-MM'
    if (mo) monthlyBreakdown[mo] = (monthlyBreakdown[mo] || 0) + (l.totalLitres || 0);
  });
  const yearlyByMonth = Object.entries(monthlyBreakdown)
    .map(([month, litres]) => ({ month, litres }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return res.json({
    success: true,
    data: { offences, salaryHistory, yearlyLitres, yearlyByMonth },
  });
};

// ─── POST /api/worker/clock-out ───────────────────────────────────────────────
// PIN-only clock-out — works from any device (personal phone or terminal).
// Clock-IN still requires an approved attendance terminal device.
const workerClockOut = async (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ success: false, message: 'PIN required' });

  const worker = await Worker.findOne({ pin: String(pin).trim(), employmentStatus: 'active' })
    .populate('branchId', 'name')
    .lean();
  if (!worker) return res.status(401).json({ success: false, message: 'Invalid PIN' });

  const watNow    = new Date(Date.now() + 60 * 60 * 1000);
  const toDateStr = d =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  const today = toDateStr(watNow);

  const [clockIn, clockOut] = await Promise.all([
    Attendance.findOne({ company: worker.company, worker: worker._id, date: today, type: 'clock_in'  }).lean(),
    Attendance.findOne({ company: worker.company, worker: worker._id, date: today, type: 'clock_out' }).lean(),
  ]);

  if (!clockIn)  return res.status(400).json({ success: false, message: 'You have not clocked in today' });
  if (clockOut)  return res.status(400).json({ success: false, message: 'You have already clocked out today' });

  await Attendance.create({
    company:     worker.company,
    worker:      worker._id,
    workerName:  worker.fullName,
    workerRole:  worker.role,
    branch:      worker.branchId?._id || worker.branchId,
    branchName:  worker.branchId?.name || worker.branch || '',
    type:        'clock_out',
    timestamp:   new Date(),
    date:        today,
    faceMatchScore: null,
    faceVerified:   false,
    deviceVerified: false,
    gpsVerified:    false,
    status:      'partial',
    source:      'worker_phone',
    failReasons: ['Clock-out from personal phone / PIN only'],
  });

  const timeStr = watNow.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true });
  return res.json({ success: true, message: 'Clocked out successfully', data: { timeStr, type: 'clock_out' } });
};

module.exports = { workerPortalAuth, workerChangePin, bookOffence, workerSelectPump, workerHistory, workerClockOut };
