const SalaryStructure = require('../models/SalaryStructure');
const Worker          = require('../models/Worker');

const calcGross = (components = []) =>
  components.filter(c => c.type === 'earning').reduce((s, c) => s + (c.amount || 0), 0);

// GET /api/salary-structures
const getStructures = async (req, res) => {
  const cid = req.user.company._id;
  const structures = await SalaryStructure.find({ company: cid }).sort({ name: 1 }).lean();

  // Count workers assigned to each structure
  const counts = await Worker.aggregate([
    { $match: { company: cid, employmentStatus: 'active', salaryStructureId: { $exists: true, $ne: null } } },
    { $group: { _id: '$salaryStructureId', count: { $sum: 1 } } },
  ]);
  const countMap = {};
  counts.forEach(c => { countMap[String(c._id)] = c.count; });

  const data = structures.map(s => ({ ...s, workerCount: countMap[String(s._id)] || 0 }));
  res.json({ success: true, data });
};

// GET /api/salary-structures/:id
const getStructure = async (req, res) => {
  const cid = req.user.company._id;
  const structure = await SalaryStructure.findOne({ _id: req.params.id, company: cid }).lean();
  if (!structure) return res.status(404).json({ success: false, message: 'Structure not found' });

  const workers = await Worker.find({ company: cid, salaryStructureId: structure._id, employmentStatus: 'active' })
    .select('fullName role branchId salary').populate('branchId', 'name').lean();

  res.json({ success: true, data: { ...structure, workers } });
};

// POST /api/salary-structures
const createStructure = async (req, res) => {
  const { name, description, components } = req.body;
  if (!name?.trim()) return res.status(400).json({ success: false, message: 'Name is required' });

  const cid  = req.user.company._id;
  const comps = (components || []).map(c => ({ name: c.name, amount: Number(c.amount) || 0, type: c.type || 'earning' }));

  const structure = await SalaryStructure.create({
    company: cid, name: name.trim(), description: description || '',
    components: comps, grossTotal: calcGross(comps),
  });
  res.status(201).json({ success: true, data: structure });
};

// PUT /api/salary-structures/:id
const updateStructure = async (req, res) => {
  const cid = req.user.company._id;
  const structure = await SalaryStructure.findOne({ _id: req.params.id, company: cid });
  if (!structure) return res.status(404).json({ success: false, message: 'Structure not found' });

  const { name, description, components } = req.body;
  if (name !== undefined)        structure.name        = name.trim();
  if (description !== undefined) structure.description = description;
  if (components !== undefined) {
    structure.components = components.map(c => ({ name: c.name, amount: Number(c.amount) || 0, type: c.type || 'earning' }));
    structure.grossTotal = calcGross(structure.components);
  }
  await structure.save();

  // Sync salary.monthly for all workers on this structure
  if (components !== undefined) {
    await Worker.updateMany(
      { company: cid, salaryStructureId: structure._id },
      { $set: { 'salary.monthly': structure.grossTotal } }
    );
  }

  res.json({ success: true, data: structure });
};

// DELETE /api/salary-structures/:id
const deleteStructure = async (req, res) => {
  const cid = req.user.company._id;
  const structure = await SalaryStructure.findOne({ _id: req.params.id, company: cid });
  if (!structure) return res.status(404).json({ success: false, message: 'Structure not found' });

  const workerCount = await Worker.countDocuments({ company: cid, salaryStructureId: structure._id });
  if (workerCount > 0)
    return res.status(400).json({ success: false, message: `Cannot delete — ${workerCount} worker(s) are assigned to this structure. Reassign them first.` });

  await structure.deleteOne();
  res.json({ success: true });
};

// POST /api/salary-structures/:id/assign
// Body: { workerIds: [id1, id2, ...] }  — assign multiple workers at once
const assignWorkers = async (req, res) => {
  const cid = req.user.company._id;
  const structure = await SalaryStructure.findOne({ _id: req.params.id, company: cid }).lean();
  if (!structure) return res.status(404).json({ success: false, message: 'Structure not found' });

  const { workerIds } = req.body;
  if (!workerIds?.length) return res.status(400).json({ success: false, message: 'No workers specified' });

  await Worker.updateMany(
    { _id: { $in: workerIds }, company: cid },
    { $set: { salaryStructureId: structure._id, 'salary.monthly': structure.grossTotal } }
  );

  res.json({ success: true, message: `${workerIds.length} worker(s) assigned to ${structure.name}` });
};

// DELETE /api/salary-structures/workers/:workerId/unassign
const unassignWorker = async (req, res) => {
  const cid = req.user.company._id;
  await Worker.updateOne(
    { _id: req.params.workerId, company: cid },
    { $unset: { salaryStructureId: '' } }
  );
  res.json({ success: true });
};

module.exports = { getStructures, getStructure, createStructure, updateStructure, deleteStructure, assignWorkers, unassignWorker };
