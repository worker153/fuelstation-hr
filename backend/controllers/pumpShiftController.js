const PumpShiftRecord = require('../models/PumpShiftRecord');
const Worker          = require('../models/Worker');

const getPumpShifts = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId, workerId, date, status, page = 1, limit = 50 } = req.query;
  const filter = { company: cid };
  if (branchId) filter.branchId = branchId;
  if (workerId) filter.worker   = workerId;
  if (date)     filter.date     = date;
  if (status)   filter.status   = status;
  const [records, total] = await Promise.all([
    PumpShiftRecord.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean(),
    PumpShiftRecord.countDocuments(filter),
  ]);
  res.json({ success: true, data: records, total });
};

const updatePumpShift = async (req, res) => {
  const cid    = req.user.company._id;
  const record = await PumpShiftRecord.findOne({ _id: req.params.id, company: cid });
  if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
  const { openingMeter, closingMeter, pumpId, pumpLabel, notes } = req.body;
  if (openingMeter !== undefined) record.openingMeter = Number(openingMeter);
  if (closingMeter !== undefined) record.closingMeter = Number(closingMeter);
  if (pumpId       !== undefined) record.pumpId       = pumpId;
  if (pumpLabel    !== undefined) record.pumpLabel    = pumpLabel;
  if (notes        !== undefined) record.notes        = notes;
  if (record.openingMeter != null && record.closingMeter != null)
    record.volume = Math.max(0, record.closingMeter - record.openingMeter);
  if (record.closingMeter != null && record.status === 'open') {
    record.status   = 'closed';
    record.closedAt = new Date();
  }
  await record.save();
  res.json({ success: true, data: record });
};

const assignPump = async (req, res) => {
  const cid    = req.user.company._id;
  const { workerId, pumpId, pumpLabel } = req.body;
  if (!workerId) return res.status(400).json({ success: false, message: 'workerId required' });
  const worker = await Worker.findOne({ _id: workerId, company: cid });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });
  worker.pumpId    = pumpId    || null;
  worker.pumpLabel = pumpLabel || null;
  await worker.save();
  res.json({ success: true, data: { pumpId: worker.pumpId, pumpLabel: worker.pumpLabel } });
};

module.exports = { getPumpShifts, updatePumpShift, assignPump };
