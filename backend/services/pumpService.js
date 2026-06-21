const Pump           = require('../models/Pump');
const PumpIsland     = require('../models/PumpIsland');
const PumpAssignment = require('../models/PumpAssignment');

/**
 * Auto-assign a pump to a worker on clock-in.
 * Rotation: each worker is assigned the NEXT pump after their last assignment.
 * Returns the PumpAssignment document, or null if no active pumps exist.
 */
async function autoAssignPump({ company, branchId, branchName, worker, date, shiftName }) {
  // Get all active pumps for this branch, sorted by rotationOrder then pumpNumber
  const pumps = await Pump.find({ company, branchId, status: 'active' })
    .sort({ rotationOrder: 1, pumpNumber: 1 }).lean();
  if (!pumps.length) return null;

  // Already assigned today? Return existing
  const existing = await PumpAssignment.findOne({
    company, worker: worker._id, date, status: { $ne: 'cancelled' },
  }).lean();
  if (existing) return existing;

  // Find which pumps are already assigned to OTHER workers today
  const todayAssignments = await PumpAssignment.find({
    company, branchId, date, status: { $ne: 'cancelled' },
    worker: { $ne: worker._id },
  }).lean();
  const assignedPumpIds = new Set(todayAssignments.map(a => String(a.pump)));

  // Find worker's last assignment in this branch (any previous date)
  const lastAssignment = await PumpAssignment.findOne({
    company, branchId, worker: worker._id, date: { $lt: date },
  }).sort({ date: -1, createdAt: -1 }).lean();

  // Determine rotation starting index
  let startIndex = 0;
  if (lastAssignment) {
    const lastPumpIdx = pumps.findIndex(p => String(p._id) === String(lastAssignment.pump));
    if (lastPumpIdx >= 0) startIndex = (lastPumpIdx + 1) % pumps.length;
  }

  // Pick next available (not already assigned to someone else)
  let selectedPump = null;
  for (let i = 0; i < pumps.length; i++) {
    const candidate = pumps[(startIndex + i) % pumps.length];
    if (!assignedPumpIds.has(String(candidate._id))) {
      selectedPump = candidate;
      break;
    }
  }
  // All pumps taken — fall back to rotation anyway
  if (!selectedPump) selectedPump = pumps[startIndex % pumps.length];

  const assignment = await PumpAssignment.create({
    company, branchId, branchName,
    pump:        selectedPump._id,
    pumpNumber:  selectedPump.pumpNumber,
    pumpName:    selectedPump.pumpName,
    productType: selectedPump.productType,
    worker:      worker._id,
    workerName:  worker.fullName,
    workerRole:  worker.role,
    date, shiftName: shiftName || '',
    assignedAt: new Date(),
  });

  return assignment;
}

/**
 * Supervisor override — reassign a worker to a specific pump.
 */
async function overrideAssignment({ assignmentId, newPumpId, overrideBy, overrideByName, overrideReason, company }) {
  const assignment = await PumpAssignment.findOne({ _id: assignmentId, company });
  if (!assignment) throw new Error('Assignment not found');

  const newPump = await Pump.findOne({ _id: newPumpId, company }).lean();
  if (!newPump) throw new Error('Pump not found');

  assignment.pump          = newPump._id;
  assignment.pumpNumber    = newPump.pumpNumber;
  assignment.pumpName      = newPump.pumpName;
  assignment.productType   = newPump.productType;
  assignment.isOverride    = true;
  assignment.overrideBy    = overrideBy;
  assignment.overrideByName = overrideByName;
  assignment.overrideReason = overrideReason || '';
  await assignment.save();
  return assignment;
}

/**
 * Auto-assign a pump ISLAND to a worker on clock-in.
 * Returns the PumpAssignment, or null if no islands configured (falls back to autoAssignPump).
 *
 * Rules:
 *  - Each island has a maxWorkers (1 or 2).
 *  - Workers rotate through islands in rotationOrder.
 *  - If all islands are at capacity, assign to the least-loaded island (overflow).
 */
async function autoAssignIsland({ company, branchId, branchName, worker, date, shiftName }) {
  const islands = await PumpIsland.find({ company, branchId, status: 'active' })
    .sort({ rotationOrder: 1 }).lean();
  if (!islands.length) return null; // no islands — caller falls back to autoAssignPump

  // Idempotency
  const existing = await PumpAssignment.findOne({
    company, worker: worker._id, date, status: { $ne: 'cancelled' },
  }).lean();
  if (existing) return existing;

  // Count workers per island today
  const todayAssignments = await PumpAssignment.find({
    company, branchId, date, status: { $ne: 'cancelled' },
    worker: { $ne: worker._id },
  }).lean();

  const islandCount = {};
  todayAssignments.forEach(a => {
    if (a.island) {
      const k = String(a.island);
      islandCount[k] = (islandCount[k] || 0) + 1;
    }
  });

  // Find worker's last island (for rotation continuity)
  const lastAssignment = await PumpAssignment.findOne({
    company, branchId, worker: worker._id,
    island: { $exists: true, $ne: null },
    date: { $lt: date },
  }).sort({ date: -1, createdAt: -1 }).lean();

  let startOrder = -1;
  if (lastAssignment?.island) {
    const last = islands.find(i => String(i._id) === String(lastAssignment.island));
    if (last) startOrder = last.rotationOrder;
  }

  // Sort islands in rotation order starting just after last assignment
  const sorted = [...islands].sort((a, b) => {
    const oa = a.rotationOrder > startOrder ? a.rotationOrder : a.rotationOrder + 100000;
    const ob = b.rotationOrder > startOrder ? b.rotationOrder : b.rotationOrder + 100000;
    return oa - ob;
  });

  // Pick first island under capacity (respects maxWorkers)
  let selected = sorted.find(i => (islandCount[String(i._id)] || 0) < i.maxWorkers);

  // All islands at maxWorkers capacity — overflow to priority islands first, then any island
  if (!selected) {
    selected =
      sorted.find(i => i.isPriority) ||   // priority island gets overflow first
      sorted[0];                           // fall back to first island in rotation
  }

  // Assign a specific pump from the island to this worker.
  // Workers already on this island today determine the index:
  //   0 workers already → this worker gets pumps[0]
  //   1 worker already  → this worker gets pumps[1]
  // This ensures two workers on the same island each get a different nozzle.
  const workerIndexOnIsland = islandCount[String(selected._id)] || 0;
  const pumpIdAtIndex = selected.pumps?.[workerIndexOnIsland] ?? selected.pumps?.[0];
  const assignedPump = pumpIdAtIndex
    ? await Pump.findById(pumpIdAtIndex).lean()
    : null;

  const assignment = await PumpAssignment.create({
    company, branchId, branchName,
    island:       selected._id,
    islandName:   selected.name,
    includesGas:  selected.includesGas,
    productTypes: selected.productTypes || [],
    pump:         assignedPump?._id,
    pumpNumber:   assignedPump?.pumpNumber,
    pumpName:     assignedPump?.pumpName || selected.name,
    productType:  assignedPump?.productType || (selected.productTypes || [])[0] || 'PMS',
    worker:       worker._id,
    workerName:   worker.fullName,
    workerRole:   worker.role,
    date,
    shiftName:    shiftName || '',
    assignedAt:   new Date(),
  });

  // Redistribute secondaries across all workers now that one more has clocked in
  await redistributeIslands({ company, branchId, date });

  // Return the updated record (with assignedPumps + additionalIslands populated)
  return PumpAssignment.findById(assignment._id).lean();
}

/**
 * After every clock-in, redistribute secondary islands so all islands have a worker.
 * Workers with no uncovered island get additionalIslands=[].
 * A worker alone on their primary island gets all pumps in assignedPumps.
 * A worker sharing (maxWorkers=2, 2 people) gets only their indexed pump.
 */
async function redistributeIslands({ company, branchId, date }) {
  const islands = await PumpIsland.find({ company, branchId, status: 'active' })
    .sort({ rotationOrder: 1 }).lean();
  if (!islands.length) return;

  const assignments = await PumpAssignment.find({
    company, branchId, date, status: { $ne: 'cancelled' },
    island: { $exists: true, $ne: null },
  }).lean();
  if (!assignments.length) return;

  // Batch-load all pumps referenced by any island
  const allPumpIds = [...new Set(islands.flatMap(i => (i.pumps || []).map(String)))];
  const allPumps   = allPumpIds.length
    ? await Pump.find({ _id: { $in: allPumpIds } }).lean()
    : [];
  const pumpMap = Object.fromEntries(allPumps.map(p => [String(p._id), p]));

  // Map islandId → worker assignments on that island
  const islandWorkers = {};
  islands.forEach(i => { islandWorkers[String(i._id)] = []; });
  assignments.forEach(a => {
    const k = String(a.island);
    if (islandWorkers[k]) islandWorkers[k].push(a);
  });

  // Sort assignments by their primary island's rotationOrder (for round-robin)
  const sortedAssignments = [...assignments].sort((x, y) => {
    const ix = islands.find(i => String(i._id) === String(x.island));
    const iy = islands.find(i => String(i._id) === String(y.island));
    return (ix?.rotationOrder ?? 0) - (iy?.rotationOrder ?? 0);
  });

  // Uncovered islands (no primary worker)
  const uncovered = islands.filter(i => islandWorkers[String(i._id)].length === 0);

  // Build the update payload for each assignment
  const updateMap = {}; // assignmentId → { assignedPumps, additionalIslands }
  sortedAssignments.forEach(a => {
    updateMap[String(a._id)] = { assignedPumps: [], additionalIslands: [] };
  });

  // Set assignedPumps for primary island
  sortedAssignments.forEach(a => {
    const island = islands.find(i => String(i._id) === String(a.island));
    if (!island) return;
    const workers     = islandWorkers[String(island._id)];
    const myIndex     = workers.findIndex(w => String(w._id) === String(a._id));
    const isAlone     = workers.length === 1;
    const pumpIds     = island.pumps || [];

    let pumpsToAssign;
    if (isAlone) {
      pumpsToAssign = pumpIds; // cover all pumps
    } else {
      const idx = myIndex >= 0 ? myIndex : 0;
      pumpsToAssign = pumpIds[idx] ? [pumpIds[idx]] : pumpIds.slice(0, 1);
    }

    updateMap[String(a._id)].assignedPumps = pumpsToAssign
      .map(id => pumpMap[String(id)])
      .filter(Boolean)
      .map(p => ({ pumpId: p._id, pumpNumber: p.pumpNumber, pumpName: p.pumpName, productType: p.productType }));
  });

  // For each uncovered island, find who last covered it (primary OR secondary)
  // so we can start the rotation from the NEXT worker — not repeat the same person
  const lastCoverages = uncovered.length
    ? await Promise.all(
        uncovered.map(island =>
          PumpAssignment.findOne({
            company, branchId,
            date: { $lt: date },
            status: { $ne: 'cancelled' },
            $or: [
              { island: island._id },
              { 'additionalIslands.island': island._id },
            ],
          }).sort({ date: -1, createdAt: -1 }).select('worker').lean()
        )
      )
    : [];

  // Distribute each uncovered island independently using its own last-covered history
  const workerCount    = sortedAssignments.length;
  const secondaryCounts = {};
  sortedAssignments.forEach(a => { secondaryCounts[String(a._id)] = 0; });

  for (let i = 0; i < uncovered.length; i++) {
    const island      = uncovered[i];
    const lastWorker  = lastCoverages[i] ? String(lastCoverages[i].worker) : null;

    // Start assigning from the worker AFTER whoever last covered this island
    let startIdx = 0;
    if (lastWorker) {
      const idx = sortedAssignments.findIndex(a => String(a.worker) === lastWorker);
      if (idx >= 0) startIdx = (idx + 1) % workerCount;
    }

    // Pick the worker with fewest secondary islands starting from startIdx
    let selected = null;
    let minCount  = Infinity;
    for (let j = 0; j < workerCount; j++) {
      const candidate = sortedAssignments[(startIdx + j) % workerCount];
      const cnt = secondaryCounts[String(candidate._id)];
      if (cnt < minCount) {
        selected = candidate;
        minCount = cnt;
        if (cnt === 0) break; // no one has fewer — ideal choice
      }
    }
    if (!selected) continue;

    secondaryCounts[String(selected._id)]++;
    const pumpDocs = (island.pumps || []).map(id => pumpMap[String(id)]).filter(Boolean);
    updateMap[String(selected._id)].additionalIslands.push({
      island:       island._id,
      islandName:   island.name,
      includesGas:  island.includesGas,
      productTypes: island.productTypes || [],
      assignedPumps: pumpDocs.map(p => ({
        pumpId: p._id, pumpNumber: p.pumpNumber, pumpName: p.pumpName, productType: p.productType,
      })),
    });
  }

  // Apply all updates in parallel
  await Promise.all(
    Object.entries(updateMap).map(([id, upd]) =>
      PumpAssignment.updateOne({ _id: id }, { $set: {
        assignedPumps:     upd.assignedPumps,
        additionalIslands: upd.additionalIslands,
      }})
    )
  );
}

module.exports = { autoAssignPump, autoAssignIsland, overrideAssignment, redistributeIslands };
