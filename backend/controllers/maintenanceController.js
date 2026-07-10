const Maintenance = require('../models/Maintenance');

const getRecords = async (req, res) => {
  try {
    const records = await Maintenance.find({ company: req.user.company._id })
      .sort({ date: -1, createdAt: -1 })
      .lean();
    res.json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createRecord = async (req, res) => {
  try {
    const { pump, pumpId, date, workerName, description } = req.body;
    if (!pump || !date || !workerName || !description)
      return res.status(400).json({ success: false, message: 'All fields are required' });

    const record = await Maintenance.create({
      company: req.user.company._id,
      pump: pump.trim(),
      pumpId: pumpId || undefined,
      date: new Date(date),
      workerName: workerName.trim(),
      description: description.trim(),
      loggedBy: req.user.name || req.user.email,
    });
    res.status(201).json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteRecord = async (req, res) => {
  try {
    const record = await Maintenance.findOneAndDelete({
      _id: req.params.id,
      company: req.user.company._id,
    });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getRecords, createRecord, deleteRecord };
