/**
 * dashboardController — quick ops stats for the admin mini-dashboard.
 * Single endpoint: GET /api/dashboard/ops
 * Returns today's attendance, this-month shortages, active offences, and
 * per-branch breakdown — all in one fast round-trip for mobile admins.
 */
const Attendance = require('../models/Attendance');
const Worker     = require('../models/Worker');
const Branch     = require('../models/Branch');
const Shortage   = require('../models/Shortage');
const Offence    = require('../models/Offence');

const getOpsStats = async (req, res) => {
  const cid = req.user.company._id;

  const now       = new Date();
  const todayStr  = now.toISOString().split('T')[0];          // YYYY-MM-DD UTC
  const month     = now.getMonth() + 1;
  const year      = now.getFullYear();

  // ── Run all queries in parallel ───────────────────────────────────────────
  const [
    todayAttendance,
    activeWorkers,
    branches,
    monthShortages,
    activeOffences,
    recentOffences,
    recentShortages,
  ] = await Promise.all([
    // Today's clock-in records
    Attendance.find({ company: cid, date: todayStr }).lean(),

    // All active workers
    Worker.find({ company: cid, employmentStatus: 'active' }, { _id:1, branch:1, branchId:1, role:1 }).lean(),

    // All branches
    Branch.find({ company: cid, isActive: true }, { _id:1, name:1 }).lean(),

    // This month's shortages
    Shortage.find({ company: cid, month, year }).lean(),

    // Active disciplinary offences
    Offence.countDocuments({ company: cid, status: 'active' }),

    // 5 most recent offences
    Offence.find({ company: cid })
      .sort({ createdAt: -1 }).limit(5).lean(),

    // 5 most recent shortages
    Shortage.find({ company: cid })
      .sort({ createdAt: -1 }).limit(5).lean(),
  ]);

  // ── Today's attendance summary ────────────────────────────────────────────
  const clockedInSet = new Set();
  todayAttendance.forEach(r => {
    if (r.type === 'clock_in') clockedInSet.add(String(r.worker));
  });

  const totalActive  = activeWorkers.length;
  const clockedIn    = clockedInSet.size;
  const notClockedIn = totalActive - clockedIn;    // potential no-shows (rough)

  // ── Per-branch breakdown ──────────────────────────────────────────────────
  const branchMap = {};
  branches.forEach(b => {
    branchMap[String(b._id)] = {
      _id:          b._id,
      name:         b.name,
      total:        0,
      clockedIn:    0,
      notClockedIn: 0,
      shortageCount:  0,
      shortageAmount: 0,
    };
  });

  activeWorkers.forEach(w => {
    const bid = String(w.branchId || '');
    if (branchMap[bid]) branchMap[bid].total++;
  });

  todayAttendance.forEach(r => {
    if (r.type !== 'clock_in') return;
    // find branch by branchId from the record
    const bid = String(r.branch || '');
    // r.branch is stored as ObjectId string in attendance records
    // find the matching branch key
    const key = Object.keys(branchMap).find(k =>
      branchMap[k].name === r.branchName || k === bid
    );
    if (key && !branchMap[key]._clockedSet) branchMap[key]._clockedSet = new Set();
    if (key) branchMap[key]._clockedSet?.add(String(r.worker));
  });

  Object.values(branchMap).forEach(b => {
    b.clockedIn    = b._clockedSet?.size || 0;
    b.notClockedIn = Math.max(0, b.total - b.clockedIn);
    delete b._clockedSet;
  });

  // ── Shortage breakdown ────────────────────────────────────────────────────
  let totalShortageAmount = 0;
  let totalShortageCount  = 0;

  monthShortages.forEach(s => {
    totalShortageAmount += s.amount || 0;
    totalShortageCount++;
    const bid = String(s.branchId || '');
    if (branchMap[bid]) {
      branchMap[bid].shortageCount++;
      branchMap[bid].shortageAmount += s.amount || 0;
    }
  });

  // ── Response ──────────────────────────────────────────────────────────────
  res.json({
    success: true,
    date:    todayStr,
    today: {
      clockedIn,
      notClockedIn,
      totalActive,
    },
    month: {
      shortageCount:  totalShortageCount,
      shortageAmount: totalShortageAmount,
      month, year,
    },
    offences: {
      active: activeOffences,
    },
    branches: Object.values(branchMap),
    recent: {
      offences:  recentOffences,
      shortages: recentShortages,
    },
  });
};

// ── GET /api/dashboard/admin-summary ─────────────────────────────────────────
// Returns per-branch breakdown WITH worker names — for the PIN admin dashboard.
const getAdminSummary = async (req, res) => {
  const cid      = req.user.company._id;
  const now      = new Date();
  const todayStr = now.toISOString().split('T')[0];   // YYYY-MM-DD
  const month    = now.getMonth() + 1;
  const year     = now.getFullYear();

  const dayStart = new Date(todayStr + 'T00:00:00.000Z');
  const dayEnd   = new Date(todayStr + 'T23:59:59.999Z');

  // Limit to assigned branch if supervisor/non-admin
  const userBranchId = req.user.branchId ? String(req.user.branchId) : null;
  const isAdmin = ['super_admin', 'admin'].includes(req.user.role);

  const branchFilter = { company: cid, isActive: true };
  if (!isAdmin && userBranchId) branchFilter._id = userBranchId;

  const [branches, clockIns, clockOuts, activeWorkers, todayShortages, todayOffences] =
    await Promise.all([
      Branch.find(branchFilter).lean(),

      Attendance.find({ company: cid, date: todayStr, type: 'clock_in' }).lean(),
      Attendance.find({ company: cid, date: todayStr, type: 'clock_out' }).lean(),

      Worker.find({ company: cid, employmentStatus: 'active' })
            .select('_id fullName role branchId').lean(),

      Shortage.find({ company: cid, createdAt: { $gte: dayStart, $lte: dayEnd } }).lean(),

      Offence.find({ company: cid, createdAt: { $gte: dayStart, $lte: dayEnd } }).lean(),
    ]);

  // Build lookup sets
  const clockOutSet = new Set(clockOuts.map(a => String(a.worker)));

  // Group by branch
  const mkMap = () => {
    const m = {};
    branches.forEach(b => { m[String(b._id)] = []; });
    return m;
  };

  const ciByBranch  = mkMap();
  const wkByBranch  = mkMap();
  const shByBranch  = mkMap();
  const ofByBranch  = mkMap();

  clockIns.forEach(a => {
    const bid = String(a.branch);
    if (ciByBranch[bid] !== undefined)
      ciByBranch[bid].push({
        workerId:    String(a.worker),
        fullName:    a.workerName || 'Unknown',
        role:        a.workerRole || '',
        clockInTime: a.timestamp,
        hasClockOut: clockOutSet.has(String(a.worker)),
      });
  });

  activeWorkers.forEach(w => {
    const bid = String(w.branchId);
    if (wkByBranch[bid] !== undefined) wkByBranch[bid].push(w);
  });

  todayShortages.forEach(s => {
    const bid = String(s.branchId);
    if (shByBranch[bid] !== undefined)
      shByBranch[bid].push({
        _id:        s._id,
        workerName: s.workerName,
        amount:     s.amount,
        reason:     s.reason,
        source:     s.source,
        status:     s.status,
        notes:      s.notes,
      });
  });

  todayOffences.forEach(o => {
    const bid = String(o.branchId);
    if (ofByBranch[bid] !== undefined)
      ofByBranch[bid].push({
        _id:         o._id,
        workerName:  o.workerName,
        offenceType: o.offenceType,
        severity:    o.severity,
        action:      o.action,
        description: o.description,
      });
  });

  const summary = branches.map(b => {
    const bid     = String(b._id);
    const workers = wkByBranch[bid];
    const ci      = ciByBranch[bid];
    const ciIds   = new Set(ci.map(w => w.workerId));
    const absent  = workers
      .filter(w => !ciIds.has(String(w._id)))
      .map(w => ({ _id: w._id, fullName: w.fullName, role: w.role }));

    return {
      _id:              b._id,
      name:             b.name,
      totalActive:      workers.length,
      clockedIn:        ci,
      absent,
      todayShortages:   shByBranch[bid],
      todayShortageTotal: shByBranch[bid].reduce((s, x) => s + (x.amount || 0), 0),
      todayOffences:    ofByBranch[bid],
    };
  });

  res.json({ success: true, data: { date: todayStr, month, year, summary } });
};

module.exports = { getOpsStats, getAdminSummary };
