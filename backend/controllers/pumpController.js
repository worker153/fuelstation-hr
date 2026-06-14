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

// Import nozzles from StationDesk and upsert as pumps
const importFromApi = async (req, res) => {
  const cid      = req.user.company._id;
  const { branchId } = req.body;
  if (!branchId) return res.status(400).json({ success: false, message: 'branchId is required' });

  const { getAdapter } = require('../services/stationApi');
  const result = await getAdapter(cid);
  if (!result) return res.status(404).json({ success: false, message: 'No active station integration found.' });

  let nozzles;
  try {
    nozzles = await result.adapter.getPumps();
  } catch (e) {
    return res.status(502).json({ success: false, message: `API error: ${e.message}` });
  }
  if (!nozzles.length) return res.json({ success: true, created: 0, updated: 0, message: 'No nozzles returned from API.' });

  const Branch = require('../models/Branch');
  const branch = await Branch.findOne({ _id: branchId, company: cid }).lean();
  if (!branch) return res.status(404).json({ success: false, message: 'Branch not found.' });

  const VALID_PRODUCTS = ['PMS', 'AGO', 'LPG', 'DPK'];

  let created = 0, updated = 0;
  for (let i = 0; i < nozzles.length; i++) {
    const n = nozzles[i];
    const productType = VALID_PRODUCTS.includes(n.productType?.toUpperCase())
      ? n.productType.toUpperCase() : 'other';

    // Match by externalId first, then by name
    let pump = await Pump.findOne({ company: cid, branchId, externalId: n.id });
    if (!pump) pump = await Pump.findOne({ company: cid, branchId, pumpName: n.name });

    if (pump) {
      pump.externalId   = n.id;
      pump.productType  = productType;
      if (!pump.pumpName || pump.pumpName !== n.name) pump.pumpName = n.name;
      await pump.save();
      updated++;
    } else {
      // Find next available pumpNumber
      const maxDoc = await Pump.findOne({ company: cid, branchId }).sort({ pumpNumber: -1 }).lean();
      const nextNum = (maxDoc?.pumpNumber || 0) + 1;
      await Pump.create({
        company: cid, branchId, branchName: branch.name,
        pumpNumber:    nextNum,
        pumpName:      n.name,
        productType,
        externalId:    n.id,
        status:        n.isActive === false ? 'maintenance' : 'active',
        rotationOrder: i,
      });
      created++;
    }
  }

  res.json({ success: true, created, updated, total: nozzles.length,
    message: `${created} pump(s) created, ${updated} updated from StationDesk.` });
};

module.exports = { getPumps, createPump, updatePump, deletePump, importFromApi };
