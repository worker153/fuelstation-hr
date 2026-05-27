const mongoose = require('mongoose');
const crypto   = require('crypto');
const { ObjectId } = mongoose.Schema.Types;

const attendanceDeviceSchema = new mongoose.Schema({
  company:    { type: ObjectId, ref: 'Company', required: true },
  name:       { type: String, required: true, trim: true },

  // Fingerprint — set when physical device first connects via registration code
  deviceId:   { type: String, trim: true, default: null },

  // Secret token embedded in terminal URL — used to authenticate all API calls from device
  deviceToken: {
    type:    String,
    default: () => crypto.randomBytes(32).toString('hex'),
    unique:  true,
  },

  // Short 6-char code printed and given to the person setting up the device
  registrationCode: {
    type:    String,
    default: () => Math.random().toString(36).substring(2, 8).toUpperCase(),
  },

  branch:     { type: ObjectId, ref: 'Branch', required: true },
  branchName: { type: String, trim: true },

  // Cached GPS from branch — used for attendance radius check
  branchGPS:  { lat: Number, lng: Number },
  allowedRadius: { type: Number, default: 150 }, // metres

  type: {
    type:    String,
    enum:    ['android_phone', 'tablet', 'kiosk', 'laptop', 'other'],
    default: 'other',
  },

  status: {
    type:    String,
    enum:    ['pending', 'approved', 'inactive', 'blocked'],
    default: 'pending',
  },

  registeredBy: { type: ObjectId, ref: 'User' },
  approvedBy:   { type: ObjectId, ref: 'User' },
  approvedAt:   Date,
  lastOnline:   Date,
  lastAttendanceAt: Date,

  lastGPS: {
    lat:       Number,
    lng:       Number,
    accuracy:  Number,
    updatedAt: Date,
  },

  blockedReason: { type: String, trim: true },
  notes:         { type: String, trim: true },
}, { timestamps: true });

attendanceDeviceSchema.index({ company: 1 });
attendanceDeviceSchema.index({ company: 1, branch: 1 });
attendanceDeviceSchema.index({ deviceToken: 1 });
attendanceDeviceSchema.index({ company: 1, status: 1 });

module.exports = mongoose.model('AttendanceDevice', attendanceDeviceSchema);
