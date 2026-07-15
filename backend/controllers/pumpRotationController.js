const PumpRotationGroup = require('../models/PumpRotationGroup');
const PumpAssignment    = require('../models/PumpAssignment');
const PumpIsland        = require('../models/PumpIsland');
const Worker            = require('../models/Worker');

// GET all groups for a branch
const getGroups = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId } = req.query;
  const filter = { company: cid };
  if (branchId) filter.branchId = branchId;
  const groups = await PumpRotationGroup.find(filter).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: groups });
};

// POST create group
const createGroup = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId, branchName, name, shiftId, shiftName, workers, islands } = req.body;
  if (!branchId || !name || !workers?.length || !islands?.length)
    return res.status(400).json({ success: false, message: 'branchId, name, workers and islands are required' });

  const group = await PumpRotationGroup.create({
    company: cid, branchId, branchName, name, shiftId, shiftName, workers, islands,
  });
  res.status(201).json({ success: true, data: group });
};

// PUT update group
const updateGroup = async (req, res) => {
  const cid = req.user.company._id;
  const group = await PumpRotationGroup.findOne({ _id: req.params.id, company: cid });
  if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

  const { name, shiftId, shiftName, workers, islands, isActive } = req.body;
  if (name      !== undefined) group.name      = name;
  if (shiftId   !== undefined) group.shiftId   = shiftId;
  if (shiftName !== undefined) group.shiftName = shiftName;
  if (workers   !== undefined) group.workers   = workers;
  if (islands   !== undefined) group.islands   = islands;
  if (isActive  !== undefined) group.isActive  = isActive;
  await group.save();
  res.json({ success: true, data: group });
};

// DELETE group
const deleteGroup = async (req, res) => {
  const cid = req.user.company._id;
  const group = await PumpRotationGroup.findOneAndDelete({ _id: req.params.id, company: cid });
  if (!group) return res.status(404).json({ success: false, message: 'Group not found' });
  res.json({ success: true });
};

// POST seed — admin manually sets today's island assignments for the group.
// Overwrites any existing assignments for these workers on this date.
const seedAssignments = async (req, res) => {
  const cid = req.user.company._id;
  const group = await PumpRotationGroup.findOne({ _id: req.params.id, company: cid }).lean();
  if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

  const { date, assignments } = req.body;
  // assignments: [{ workerId, islandId }]
  if (!date || !assignments?.length)
    return res.status(400).json({ success: false, message: 'date and assignments required' });

  // Load island docs
  const islandIds = assignments.map(a => a.islandId);
  const islands   = await PumpIsland.find({ _id: { $in: islandIds } }).lean();
  const islandMap = Object.fromEntries(islands.map(i => [String(i._id), i]));

  // Load worker docs
  const workerIds = assignments.map(a => a.workerId);
  const workers   = await Worker.find({ _id: { $in: workerIds }, company: cid }).lean();
  const workerMap = Object.fromEntries(workers.map(w => [String(w._id), w]));

  const Pump = require('../models/Pump');

  const created = [];
  for (const asgn of assignments) {
    const island = islandMap[String(asgn.islandId)];
    const worker = workerMap[String(asgn.workerId)];
    if (!island || !worker) continue;

    // Remove any existing assignment for this worker on this date
    await PumpAssignment.deleteMany({ company: cid, worker: worker._id, date });

    // Load first pump from island
    const pumpId = island.pumps?.[0];
    const pump   = pumpId ? await Pump.findById(pumpId).lean() : null;

    const doc = await PumpAssignment.create({
      company:     cid,
      branchId:    group.branchId,
      branchName:  group.branchName,
      island:      island._id,
      islandName:  island.name,
      includesGas: island.includesGas,
      productTypes: island.productTypes || [],
      pump:        pump?._id,
      pumpNumber:  pump?.pumpNumber,
      pumpName:    pump?.pumpName || island.name,
      productType: pump?.productType || (island.productTypes || [])[0] || 'PMS',
      assignedPumps: [],
      worker:      worker._id,
      workerName:  worker.fullName,
      workerRole:  worker.role,
      date,
      shiftName:   '',
      assignedAt:  new Date(),
    });
    created.push(doc);
  }

  // Redistribute to fill assignedPumps properly
  const { redistributeIslands } = require('../services/pumpService');
  await redistributeIslands({ company: cid, branchId: group.branchId, date });

  res.json({ success: true, data: created });
};

// GET preview — returns today's + next N shifts' projected island assignments for a group
const getPreview = async (req, res) => {
  const cid = req.user.company._id;
  const group = await PumpRotationGroup.findOne({ _id: req.params.id, company: cid }).lean();
  if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

  const { fromDate } = req.query;
  const date = fromDate || new Date().toISOString().slice(0, 10);

  // Find last known assignment date for any group member
  const workerIds = group.workers.map(w => w.workerId);
  const lastAny   = await PumpAssignment.findOne({
    company: cid, branchId: group.branchId,
    worker:  { $in: workerIds },
    island:  { $exists: true, $ne: null },
    status:  { $ne: 'cancelled' },
  }).sort({ date: -1 }).lean();

  if (!lastAny) {
    // No seed yet — show position-based projection
    const projection = group.workers
      .sort((a, b) => a.position - b.position)
      .map(w => {
        const islandEntry = group.islands.find(i => i.position === w.position % group.islands.length);
        return { workerName: w.workerName, islandName: islandEntry?.islandName || '—' };
      });
    return res.json({ success: true, seeded: false, projection });
  }

  const lastDate = lastAny.date;
  const lastAssignments = await PumpAssignment.find({
    company: cid, branchId: group.branchId,
    worker: { $in: workerIds },
    date: lastDate, status: { $ne: 'cancelled' },
  }).lean();

  // Build last island pos per worker
  const lastIslandPos = {};
  for (const a of lastAssignments) {
    const islandEntry = group.islands.find(i => String(i.islandId) === String(a.island));
    if (islandEntry) lastIslandPos[String(a.worker)] = islandEntry.position;
  }

  const n = group.workers.length;
  const projection = group.workers
    .sort((a, b) => a.position - b.position)
    .map(w => {
      const prevPos       = (w.position - 1 + n) % n;
      const prevWorker    = group.workers.find(x => x.position === prevPos);
      const prevIslandPos = prevWorker ? lastIslandPos[String(prevWorker.workerId)] : undefined;
      const islandPos     = prevIslandPos !== undefined ? prevIslandPos : w.position % group.islands.length;
      const islandEntry   = group.islands.find(i => i.position === islandPos);
      return { workerName: w.workerName, islandName: islandEntry?.islandName || '—' };
    });

  res.json({ success: true, seeded: true, lastDate, projection });
};

module.exports = { getGroups, createGroup, updateGroup, deleteGroup, seedAssignments, getPreview };
