const Maintenance = require('../models/Maintenance');
const cloudinary  = require('../config/cloudinary');

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
    const { pump, pumpId, branchId, branchName, date, workerName, description, photoBase64 } = req.body;
    if (!pump || !date || !workerName || !description)
      return res.status(400).json({ success: false, message: 'All fields are required' });

    let photo = undefined;
    if (photoBase64) {
      const result = await cloudinary.uploader.upload(photoBase64, {
        folder:        `fuelstation-hr/${String(req.user.company._id)}/maintenance`,
        resource_type: 'image',
        transformation: [{ width: 1200, crop: 'limit', quality: 'auto' }],
      });
      photo = { url: result.secure_url, publicId: result.public_id };
    }

    const record = await Maintenance.create({
      company:    req.user.company._id,
      branchId:   branchId   || undefined,
      branchName: branchName || undefined,
      pump:       pump.trim(),
      pumpId:     pumpId     || undefined,
      date:       new Date(date),
      workerName: workerName.trim(),
      description: description.trim(),
      photo,
      loggedBy:   req.user.name || req.user.email,
    });
    res.status(201).json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateRecord = async (req, res) => {
  try {
    const record = await Maintenance.findOne({
      _id: req.params.id,
      company: req.user.company._id,
    });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });

    const { pump, pumpId, branchId, branchName, date, workerName, description, photoBase64, removePhoto } = req.body;

    if (pump)        record.pump        = pump.trim();
    if (pumpId)      record.pumpId      = pumpId;
    if (branchId)    record.branchId    = branchId;
    if (branchName)  record.branchName  = branchName;
    if (date)        record.date        = new Date(date);
    if (workerName)  record.workerName  = workerName.trim();
    if (description) record.description = description.trim();

    if (removePhoto && record.photo?.publicId) {
      await cloudinary.uploader.destroy(record.photo.publicId).catch(() => {});
      record.photo = undefined;
    } else if (photoBase64) {
      if (record.photo?.publicId) {
        await cloudinary.uploader.destroy(record.photo.publicId).catch(() => {});
      }
      const result = await cloudinary.uploader.upload(photoBase64, {
        folder:        `fuelstation-hr/${String(req.user.company._id)}/maintenance`,
        resource_type: 'image',
        transformation: [{ width: 1200, crop: 'limit', quality: 'auto' }],
      });
      record.photo = { url: result.secure_url, publicId: result.public_id };
    }

    await record.save();
    res.json({ success: true, data: record });
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

    if (record.photo?.publicId) {
      await cloudinary.uploader.destroy(record.photo.publicId).catch(() => {});
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getRecords, createRecord, updateRecord, deleteRecord };
