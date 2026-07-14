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
const Shift      = require('../models/Shift');

// ── Rotation maths ────────────────────────────────────────────────────────────
// Returns true if on-duty, false if off, given pattern like '1_1'|'2_2'|'3_3'
// and an anchor startDate that is a known ON-duty day.
function isOnRotation(pattern, startDate, checkDate) {
  const parts = pattern.split('_').map(Number);
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return true;
  const [daysOn, daysOff] = parts;
  const cycleLen = daysOn + daysOff;
  const startUTC = Date.UTC(
    startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()
  );
  const checkUTC = Date.UTC(
    checkDate.getUTCFullYear(), checkDate.getUTCMonth(), checkDate.getUTCDate()
  );
  const daysDiff = Math.round((checkUTC - startUTC) / 86400000);
  if (daysDiff < 0) return true;        // before start — include by default
  return (daysDiff % cycleLen) < daysOn;
}

// ── Core duty check ───────────────────────────────────────────────────────────
// Returns: 'on' | 'off' | 'skip'
//   'on'   = worker should be at work on this date
//   'off'  = worker is on a scheduled day off
//   'skip' = clockInRequired=false (salary/no-attendance workers)
function workerDutyStatus(worker, shift, dateUTC) {
  // Salary / no-clock-in workers — never shown
  if (worker.clockInRequired === false) return 'skip';

  // ── STEP 1: Worker-level rotation always wins ────────────────────────────
  // Checked FIRST regardless of what the shift says.
  // Workers like "1 day in / 1 day out" or "5 days in / 2 days out"
  // store their individual cycle on the Worker document itself.
  const workerPattern = worker.rotationSchedule?.pattern || 'none';
  if (workerPattern !== 'none') {
    // Best anchor: explicit startDate → resumptionDate → activatedAt
    const anchor = worker.rotationSchedule?.startDate
                || worker.resumptionDate
                || worker.activatedAt;
    if (anchor) {
      return isOnRotation(workerPattern, new Date(anchor), dateUTC) ? 'on' : 'off';
    }
    // Pattern set but no anchor — can't calculate.
    // Conservative: mark 'off' so we don't falsely accuse.
    return 'off';
  }

  // ── STEP 2: No worker-level rotation — use the shift configuration ───────
  if (!shift) return 'on';   // no shift → works every day

  const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayName   = DAY_NAMES[dateUTC.getUTCDay()];

  if (shift.shiftType === 'fixed') {
    const workDays = shift.days || [];
    // All 7 days in array means "no specific day off configured" → every day
    if (workDays.length === 0 || workDays.length === 7) return 'on';
    return workDays.includes(dayName) ? 'on' : 'off';
  }

  if (shift.shiftType === 'rotation') {
    // Shift-level rotation + worker anchor
    const sp     = shift.rotationPattern;
    const anchor = worker.resumptionDate || worker.activatedAt;
    if (sp && sp !== 'custom' && anchor) {
      return isOnRotation(sp, new Date(anchor), dateUTC) ? 'on' : 'off';
    }
    // No way to calculate → conservative 'off'
    return 'off';
  }

  return 'on';
}

const getOpsStats = async (req, res) => {
  const cid = req.user.company._id;

  const now       = new Date();
  const todayStr  = now.toISOString().split('T')[0];          // YYYY-MM-DD UTC
  const month     = now.getMonth() + 1;
  const year      = now.getFullYear();

  // dateUTC used for rotation duty checks
  const [dy, dm, dd] = todayStr.split('-').map(Number);
  const dateUTC = new Date(Date.UTC(dy, dm - 1, dd));

  // ── Run all queries in parallel ───────────────────────────────────────────
  const [
    todayAttendance,
    activeWorkers,
    branches,
    monthShortages,
    activeOffences,
    recentOffences,
    recentShortages,
    shifts,
  ] = await Promise.all([
    // Today's clock-in records
    Attendance.find({ company: cid, date: todayStr }).lean(),

    // All active workers — include rotation fields so duty check works
    Worker.find({ company: cid, employmentStatus: 'active' })
      .select('_id branchId shiftId clockInRequired alwaysPresent rotationSchedule resumptionDate activatedAt')
      .populate('shiftId', '_id shiftType days rotationPattern')
      .lean(),

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

    // Shifts for duty check lookup
    Shift.find({ company: cid, isActive: true }).lean(),
  ]);

  // Build shift lookup
  const shiftById = Object.fromEntries(shifts.map(s => [String(s._id), s]));

  // ── Filter to only workers expected today (rotation-aware) ───────────────
  const clockedInSet = new Set();
  todayAttendance.forEach(r => {
    if (r.type === 'clock_in') clockedInSet.add(String(r.worker));
  });

  // Separate workers into expected-today vs off-today
  const expectedWorkers = [];
  activeWorkers.forEach(w => {
    const shift  = w.shiftId ? shiftById[String(w.shiftId._id || w.shiftId)] : null;
    const status = workerDutyStatus(w, shift, dateUTC);
    if (status !== 'skip' && status !== 'off') expectedWorkers.push(w);
  });

  const totalActive   = activeWorkers.length;
  const totalExpected = expectedWorkers.length;
  // Always-present workers count as clocked in even without an attendance record
  const clockedIn    = expectedWorkers.filter(w => clockedInSet.has(String(w._id)) || w.alwaysPresent).length;
  const notClockedIn = totalExpected - clockedIn;

  // ── Per-branch breakdown (rotation-aware) ────────────────────────────────
  const branchMap = {};
  branches.forEach(b => {
    branchMap[String(b._id)] = {
      _id:          b._id,
      name:         b.name,
      total:        0,   // expected today (on duty)
      clockedIn:    0,
      notClockedIn: 0,
      shortageCount:  0,
      shortageAmount: 0,
    };
  });

  expectedWorkers.forEach(w => {
    const bid = String(w.branchId || '');
    if (branchMap[bid]) branchMap[bid].total++;
  });

  todayAttendance.forEach(r => {
    if (r.type !== 'clock_in') return;
    const bid = String(r.branch || '');
    const key = Object.keys(branchMap).find(k =>
      branchMap[k].name === r.branchName || k === bid
    );
    if (key && !branchMap[key]._clockedSet) branchMap[key]._clockedSet = new Set();
    if (key) branchMap[key]._clockedSet?.add(String(r.worker));
  });

  Object.values(branchMap).forEach(b => {
    // Only count clock-ins from workers expected today
    const bid = String(b._id);
    const expectedInBranch = expectedWorkers.filter(w => String(w.branchId) === bid);
    const expectedIdSet    = new Set(expectedInBranch.map(w => String(w._id)));
    const clockedSet       = b._clockedSet || new Set();
    const actualClocked    = [...clockedSet].filter(id => expectedIdSet.has(id)).length;
    // alwaysPresent workers who didn't clock in still count as present
    const alwaysPresentExtra = expectedInBranch.filter(
      w => w.alwaysPresent && !clockedSet.has(String(w._id))
    ).length;
    b.clockedIn    = actualClocked + alwaysPresentExtra;
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
      totalExpected,   // on-duty workers only
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
          .select('_id fullName role branchId shiftId clockInRequired alwaysPresent rotationSchedule resumptionDate activatedAt')
          .populate('shiftId', '_id name startTime endTime shiftType days rotationPattern')
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

  // Build a quick shiftId→shift lookup
  const shiftById = Object.fromEntries(shifts.map(s => [String(s._id), s]));

  // Date as UTC object for duty checks
  const [chkYr, chkMo, chkDy] = date.split('-').map(Number);
  const dateUTC = new Date(Date.UTC(chkYr, chkMo - 1, chkDy));

  // ── Build per-branch summary ──────────────────────────────────────────────
  const summary = branches.map(b => {
    const bid     = String(b._id);
    const workers = wkByBranch[bid];
    const ci      = ciByBranch[bid];
    const ciIds   = new Set(ci.map(w => w.workerId));

    // ── Categorise every worker by duty status ────────────────────────────
    // 'on'   = should be at work → present or absent
    // 'off'  = scheduled day off   → shown as "Off Today"
    // 'skip' = no clock-in required → not shown at all
    const presentWorkers  = [];   // on-duty AND clocked in
    const absentWorkers   = [];   // on-duty AND NOT clocked in
    const offTodayWorkers = [];   // scheduled off today

    workers.forEach(w => {
      const shift  = w.shiftId ? shiftById[String(w.shiftId._id || w.shiftId)] : null;
      const status = workerDutyStatus(w, shift, dateUTC);

      if (status === 'skip') return;   // salary / no-attendance workers

      const wBase = {
        _id:       w._id,
        fullName:  w.fullName,
        role:      w.role,
        shiftName: shift?.name || null,
      };

      // alwaysPresent workers are never absent/off — always show as present
      if (w.alwaysPresent) {
        const rec = ci.find(c => c.workerId === String(w._id));
        presentWorkers.push({ ...wBase, clockInTime: rec?.clockInTime, hasClockOut: rec?.hasClockOut, alwaysPresent: true });
        return;
      }

      if (status === 'off') {
        offTodayWorkers.push(wBase);
        return;
      }

      // status === 'on'
      if (ciIds.has(String(w._id))) {
        const rec = ci.find(c => c.workerId === String(w._id));
        presentWorkers.push({
          ...wBase,
          clockInTime: rec?.clockInTime,
          hasClockOut: rec?.hasClockOut,
        });
      } else {
        absentWorkers.push(wBase);
      }
    });

    // Workers who clocked in but are technically "off" today (came in voluntarily)
    // — include in presentWorkers so they're not lost, mark with voluntaryIn flag
    ci.forEach(ciRec => {
      const alreadyListed = presentWorkers.some(p => String(p._id) === ciRec.workerId);
      if (alreadyListed) return;
      // Find worker in the workers array
      const w = workers.find(x => String(x._id) === ciRec.workerId);
      if (!w) return;
      const shift = w.shiftId ? shiftById[String(w.shiftId._id || w.shiftId)] : null;
      const status = workerDutyStatus(w, shift, dateUTC);
      if (status === 'skip') return;
      // They clocked in despite being 'off' → show them as present but flagged
      presentWorkers.push({
        _id:         w._id,
        fullName:    w.fullName,
        role:        w.role,
        shiftName:   shift?.name || null,
        clockInTime: ciRec.clockInTime,
        hasClockOut: ciRec.hasClockOut,
        voluntaryIn: status === 'off',  // came in on their day off
      });
      // Remove from offToday since they're here
      const idx = offTodayWorkers.findIndex(x => String(x._id) === ciRec.workerId);
      if (idx !== -1) offTodayWorkers.splice(idx, 1);
    });

    const totalExpected = presentWorkers.length + absentWorkers.length;

    // ── Shift groups (only on-duty + off workers, grouped) ────────────────
    const shiftGroupMap = {};
    const ensureGroup = (sid, shift) => {
      if (!shiftGroupMap[sid]) {
        shiftGroupMap[sid] = {
          shiftId:    sid === '__none__' ? null : sid,
          shiftName:  shift?.name  || 'No Shift',
          startTime:  shift?.startTime || '',
          endTime:    shift?.endTime   || '',
          present:    [],
          absent:     [],
          offToday:   [],
        };
      }
    };

    [...presentWorkers, ...absentWorkers, ...offTodayWorkers].forEach(w => {
      const worker  = workers.find(x => String(x._id) === String(w._id));
      const shift   = worker?.shiftId ? shiftById[String(worker.shiftId._id || worker.shiftId)] : null;
      const sid     = shift ? String(shift._id) : '__none__';
      ensureGroup(sid, shift);
    });

    presentWorkers.forEach(w => {
      const worker = workers.find(x => String(x._id) === String(w._id));
      const shift  = worker?.shiftId ? shiftById[String(worker.shiftId._id || worker.shiftId)] : null;
      const sid    = shift ? String(shift._id) : '__none__';
      shiftGroupMap[sid]?.present.push(w);
    });
    absentWorkers.forEach(w => {
      const worker = workers.find(x => String(x._id) === String(w._id));
      const shift  = worker?.shiftId ? shiftById[String(worker.shiftId._id || worker.shiftId)] : null;
      const sid    = shift ? String(shift._id) : '__none__';
      shiftGroupMap[sid]?.absent.push(w);
    });
    offTodayWorkers.forEach(w => {
      const worker = workers.find(x => String(x._id) === String(w._id));
      const shift  = worker?.shiftId ? shiftById[String(worker.shiftId._id || worker.shiftId)] : null;
      const sid    = shift ? String(shift._id) : '__none__';
      shiftGroupMap[sid]?.offToday.push(w);
    });

    const shiftGroups = Object.values(shiftGroupMap).map(g => ({
      ...g,
      total:        g.present.length + g.absent.length,
      presentCount: g.present.length,
      absentCount:  g.absent.length,
      offCount:     g.offToday.length,
      allPresent:   g.absent.length === 0 && g.present.length > 0,
    })).sort((a, b) => {
      if (!a.startTime && !b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime.localeCompare(b.startTime);
    });

    // Month history grouped by date
    const groupByDate = (arr, getDate) => {
      const map = {};
      arr.forEach(item => {
        const d = new Date(getDate(item)).toISOString().slice(0, 10);
        if (!map[d]) map[d] = [];
        map[d].push(item);
      });
      return Object.entries(map)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([dt, items]) => ({
          date:  dt,
          count: items.length,
          total: items.reduce((s, x) => s + (x.amount || 0), 0),
          items: items.slice(0, 20),
        }));
    };

    const monthShortageHistory = groupByDate(
      mshByBranch[bid], s => s.date || s.attendanceDate || s.createdAt
    );
    const monthOffenceHistory = groupByDate(
      mofByBranch[bid], o => o.date || o.createdAt
    );

    return {
      _id:           b._id,
      name:          b.name,
      totalActive:   workers.length,   // all active (for info)
      totalExpected, // on-duty today (present + absent, excluding skip/off)
      offCount:      offTodayWorkers.length,

      // Day data — only on-duty workers
      clockedIn:    presentWorkers,
      absent:       absentWorkers,
      offToday:     offTodayWorkers,

      dayShortages:       shByBranch[bid],
      dayShortageTotal:   shByBranch[bid].reduce((s, x) => s + (x.amount || 0), 0),
      dayOffences:        ofByBranch[bid],

      // Shift groups
      shiftGroups,

      // Month history
      monthShortageHistory,
      monthOffenceHistory,
      monthShortageTotal: mshByBranch[bid].reduce((s, x) => s + (x.amount || 0), 0),
      monthOffenceCount:  mofByBranch[bid].length,
    };
  });

  res.json({ success: true, data: { date, month: mo, year: yr, summary } });
};

module.exports = { getOpsStats, getAdminSummary };
