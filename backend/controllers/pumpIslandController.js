const PumpIsland = require('../models/PumpIsland');
const Pump       = require('../models/Pump');

const getIslands = async (req, res) => {
  const cid = req.user.company._id;
  const filter = { company: cid };
  if (req.query.branchId) filter.branchId = req.query.branchId;
  const islands = await PumpIsland.find(filter)
    .sort({ branchId: 1, rotationOrder: 1 })
    .populate('pumps', 'pumpNumber pumpName productType status')
    .lean();
  res.json({ success: true, data: islands });
};

const createIsland = async (req, res) => {
  const cid = req.user.company._id;
  const { name, branchId, branchName, pumps, productTypes, includesGas, rotationOrder, maxWorkers, status, notes, fixedWorkerId, fixedWorkerName } = req.body;
  if (!name)     return res.status(400).json({ success: false, message: 'name is required' });
  if (!branchId) return res.status(400).json({ success: false, message: 'branchId is required' });

  const island = await PumpIsland.create({
    company: cid, name, branchId, branchName,
    pumps: pumps || [],
    productTypes: productTypes || [],
    includesGas: !!includesGas,
    rotationOrder: rotationOrder ?? 0,
    maxWorkers: maxWorkers ?? 1,
    status: status || 'active',
    notes,
    fixedWorkerId:   fixedWorkerId   || null,
    fixedWorkerName: fixedWorkerName || '',
  });

  const populated = await PumpIsland.findById(island._id)
    .populate('pumps', 'pumpNumber pumpName productType status').lean();
  res.status(201).json({ success: true, data: populated });
};

const updateIsland = async (req, res) => {
  const cid = req.user.company._id;
  const island = await PumpIsland.findOne({ _id: req.params.id, company: cid });
  if (!island) return res.status(404).json({ success: false, message: 'Island not found' });

  const fields = ['name', 'pumps', 'productTypes', 'includesGas', 'rotationOrder', 'maxWorkers', 'status', 'notes', 'fixedWorkerName'];
  fields.forEach(f => { if (req.body[f] !== undefined) island[f] = req.body[f]; });
  if (req.body.fixedWorkerId !== undefined)
    island.fixedWorkerId = req.body.fixedWorkerId || null;
  await island.save();

  const populated = await PumpIsland.findById(island._id)
    .populate('pumps', 'pumpNumber pumpName productType status').lean();
  res.json({ success: true, data: populated });
};

const deleteIsland = async (req, res) => {
  const cid = req.user.company._id;
  await PumpIsland.deleteOne({ _id: req.params.id, company: cid });
  res.json({ success: true });
};

module.exports = { getIslands, createIsland, updateIsland, deleteIsland };
