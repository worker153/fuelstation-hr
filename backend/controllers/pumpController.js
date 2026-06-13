const Pump = require('../models/Pump');

const getPumps = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId, status } = req.query;
  const filter = { company: cid };
  if (branchId) filter.branchId = branchId;
  if (status)   filter.status   = status;
  const pumps = await Pump.find(filter).sort({ branchId: 1, rotationOrder: 1, pumpNumber: 1 }).lean();
  res.json({ success: true, data: pumps });
};

const createPump = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId, branchName, pumpNumber, pumpName, productType, externalId, status, rotationOrder, notes } = req.body;
  if (!branchId || !pumpNumber || !pumpName)
    return res.status(400).json({ success: false, message: 'branchId, pumpNumber and pumpName are required' });
  const pump = await Pump.create({
    company: cid, branchId, branchName, pumpNumber, pumpName,
    productType: productType || 'PMS',
    externalId: externalId || null,
    status: status || 'active',
    rotationOrder: rotationOrder ?? pumpNumber,
    notes,
  });
  res.status(201).json({ success: true, data: pump });
};

const updatePump = async (req, res) => {
  const cid  = req.user.company._id;
  const pump = await Pump.findOne({ _id: req.params.id, company: cid });
  if (!pump) return res.status(404).json({ success: false, message: 'Pump not found' });
  const fields = ['pumpName', 'productType', 'externalId', 'status', 'rotationOrder', 'notes', 'pumpNumber'];
  fields.forEach(f => { if (req.body[f] !== undefined) pump[f] = req.body[f]; });
  await pump.save();
  res.json({ success: true, data: pump });
};

const deletePump = async (req, res) => {
  const cid = req.user.company._id;
  await Pump.deleteOne({ _id: req.params.id, company: cid });
  res.json({ success: true });
};

module.exports = { getPumps, createPump, updatePump, deletePump };
