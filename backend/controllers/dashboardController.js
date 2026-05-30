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
// Returns per-branch breakdown WITH worker names, shift groups, and month history.
// Query params: date (YYYY-MM-DD, default today)
const Shift = require('../models/Shift');

const getAdminSummary = async (req, res) => {
  const cid      = req.user.company._id;
  const now      = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Accept any date (for browsing history)
  const date = (req.query.date || todayStr).slice(0, 10);  // safety: only YYYY-MM-DD

  const dayStart = new Date(date + 'T00:00:00.000Z');
  const dayEnd   = new Date(date + 'T23:59:59.999Z');

  // Month window (for history lists)
  const [yr, mo] = date.split('-').map(Number);
  const monthStart = new Date(`${yr}-${String(mo).padStart(2,'0')}-01T00:00:00.000Z`);
  const nextMonth  = mo === 12
    ? new Date(`${yr+1}-01-01T00:00:00.000Z`)
    : new Date(`${yr}-${String(mo+1).padStart(2,'0')}-01T00:00:00.000Z`);

  // Limit to assigned branch if supervisor/non-admin
  const userBranchId = req.user.branchId ? String(req.user.branchId) : null;
  const isAdmin = ['super_admin', 'admin'].includes(req.user.role);

  const branchFilter = { company: cid, isActive: true };
  if (!isAdmin && userBranchId) branchFilter._id = userBranchId;

  const [
    branches,
    clockIns, clockOuts,
    activeWorkers,
    dayShortages, dayOffences,
    monthShortages, monthOffences,
    shifts,
  ] = await Promise.all([
    Branch.find(branchFilter).lean(),

    Attendance.find({ company: cid, date, type: 'clock_in' }).lean(),
    Attendance.find({ company: cid, date, type: 'clock_out' }).lean(),

    // Populate shift for grouping
    Worker.find({ company: cid, employmentStatus: 'active' })
          .select('_id fullName role branchId shiftId')
          .populate('shiftId', '_id name startTime endTime shiftType')
          .lean(),

    // Day-specific shortages — use date field OR createdAt fallback
    Shortage.find({
      company: cid,
      $or: [
        { date: { $gte: dayStart, $lte: dayEnd } },
        { attendanceDate: { $gte: dayStart, $lte: dayEnd } },
        { createdAt: { $gte: dayStart, $lte: dayEnd } },
      ]
    }).lean(),

    // Day-specific offences
    Offence.find({ company: cid, date: { $gte: dayStart, $lte: dayEnd } }).lean(),

    // Full month shortages for history view
    Shortage.find({
      company: cid,
      $or: [
        { month: mo, year: yr },
        { date: { $gte: monthStart, $lt: nextMonth } },
      ]
    }).sort({ createdAt: -1 }).lean(),

    // Full month offences for history view
    Offence.find({
      company: cid,
      date: { $gte: monthStart, $lt: nextMonth }
    }).sort({ date: -1 }).lean(),

    Shift.find({ company: cid, isActive: true }).lean(),
  ]);

  // Build lookup sets
  const clockOutSet = new Set(clockOuts.map(a => String(a.worker)));
  const shiftMap    = Object.fromEntries(shifts.map(s => [String(s._id), s]));

  // Helper: group array into { branchId → [] }
  const mkBranchMap = () => {
    const m = {};
    branches.forEach(b => { m[String(b._id)] = []; });
    return m;
  };

  const ciByBranch  = mkBranchMap();
  const wkByBranch  = mkBranchMap();
  const shByBranch  = mkBranchMap();
  const ofByBranch  = mkBranchMap();
  const mshByBranch = mkBranchMap();   // month shortages
  const mofByBranch = mkBranchMap();   // month offences

  // Clock-ins for the day
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

  // Active workers
  activeWorkers.forEach(w => {
    const bid = String(w.branchId);
    if (wkByBranch[bid] !== undefined) wkByBranch[bid].push(w);
  });

  // Day shortages
  dayShortages.forEach(s => {
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
        createdAt:  s.createdAt,
      });
  });

  // Day offences
  dayOffences.forEach(o => {
    const bid = String(o.branchId);
    if (ofByBranch[bid] !== undefined)
      ofByBranch[bid].push({
        _id:         o._id,
        workerName:  o.workerName,
        offenceType: o.offenceType,
        severity:    o.severity,
        action:      o.action,
        description: o.description,
        date:        o.date,
      });
  });

  // Month shortages — group by date string (UTC)
  monthShortages.forEach(s => {
    const bid = String(s.branchId);
    if (mshByBranch[bid] !== undefined) mshByBranch[bid].push(s);
  });
  monthOffences.forEach(o => {
    const bid = String(o.branchId);
    if (mofByBranch[bid] !== undefined) mofByBranch[bid].push(o);
  });

  // Group month shortages by date for history view
  const groupByDate = (arr, getDate) => {
    const map = {};
    arr.forEach(item => {
      const d = new Date(getDate(item)).toISOString().slice(0, 10);
      if (!map[d]) map[d] = [];
      map[d].push(item);
    });
    // Return sorted desc
    return Object.entries(map)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dt, items]) => ({
        date:  dt,
        count: items.length,
        total: items.reduce((s, x) => s + (x.amount || 0), 0),
        items: items.slice(0, 20),   // cap to avoid giant payload
      }));
  };

  // ── Build per-branch summary ──────────────────────────────────────────────
  const summary = branches.map(b => {
    const bid     = String(b._id);
    const workers = wkByBranch[bid];
    const ci      = ciByBranch[bid];
    const ciIds   = new Set(ci.map(w => w.workerId));

    // Full absent list
    const absent = workers
      .filter(w => !ciIds.has(String(w._id)))
      .map(w => ({
        _id:       w._id,
        fullName:  w.fullName,
        role:      w.role,
        shiftName: w.shiftId?.name || null,
      }));

    // ── Shift groups ─────────────────────────────────────────────────────
    const shiftGroupMap = {};

    workers.forEach(w => {
      const sid   = w.shiftId ? String(w.shiftId._id) : '__none__';
      const sName = w.shiftId?.name || 'No Shift';
      const sStart= w.shiftId?.startTime || '';
      const sEnd  = w.shiftId?.endTime   || '';

      if (!shiftGroupMap[sid]) {
        shiftGroupMap[sid] = {
          shiftId:    sid === '__none__' ? null : sid,
          shiftName:  sName,
          startTime:  sStart,
          endTime:    sEnd,
          total:      0,
          present:    [],
          absent:     [],
        };
      }
      shiftGroupMap[sid].total++;

      if (ciIds.has(String(w._id))) {
        const rec = ci.find(c => c.workerId === String(w._id));
        shiftGroupMap[sid].present.push({
          _id:         w._id,
          fullName:    w.fullName,
          role:        w.role,
          clockInTime: rec?.clockInTime,
          hasClockOut: rec?.hasClockOut,
        });
      } else {
        shiftGroupMap[sid].absent.push({ _id: w._id, fullName: w.fullName, role: w.role });
      }
    });

    const shiftGroups = Object.values(shiftGroupMap).map(g => ({
      ...g,
      allPresent:   g.absent.length === 0 && g.total > 0,
      presentCount: g.present.length,
      absentCount:  g.absent.length,
    })).sort((a, b) => {
      // Sort shifts by startTime, unknowns last
      if (!a.startTime && !b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime.localeCompare(b.startTime);
    });

    // Month history grouped by date
    const monthShortageHistory = groupByDate(
      mshByBranch[bid],
      s => s.date || s.attendanceDate || s.createdAt
    );
    const monthOffenceHistory = groupByDate(
      mofByBranch[bid],
      o => o.date || o.createdAt
    );

    return {
      _id:          b._id,
      name:         b.name,
      totalActive:  workers.length,

      // Day data
      clockedIn:          ci,
      absent,
      dayShortages:       shByBranch[bid],
      dayShortageTotal:   shByBranch[bid].reduce((s, x) => s + (x.amount || 0), 0),
      dayOffences:        ofByBranch[bid],

      // Shift groups
      shiftGroups,

      // Month history
      monthShortageHistory,
      monthOffenceHistory,
      monthShortageTotal:  mshByBranch[bid].reduce((s, x) => s + (x.amount || 0), 0),
      monthOffenceCount:   mofByBranch[bid].length,
    };
  });

  res.json({ success: true, data: { date, month: mo, year: yr, summary } });
};

module.exports = { getOpsStats, getAdminSummary };
