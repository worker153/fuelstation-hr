const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const attendanceSchema = new mongoose.Schema({
  company:    { type: ObjectId, ref: 'Company', required: true },
  worker:     { type: ObjectId, ref: 'Worker',  required: true },
  workerName: { type: String },
  workerRole: { type: String },

  device:     { type: ObjectId, ref: 'AttendanceDevice', required: true },
  deviceName: { type: String },

  branch:     { type: ObjectId, ref: 'Branch' },
  branchName: { type: String },

  type: {
    type:     String,
    enum:     ['clock_in', 'clock_out'],
    required: true,
  },

  timestamp: { type: Date, default: Date.now },
  date:      { type: String },   // 'YYYY-MM-DD' for fast date-range queries

  // GPS from device at time of attendance
  gps: {
    lat:      Number,
    lng:      Number,
    accuracy: Number,
  },
  gpsVerified: { type: Boolean, default: false },
  gpsDistance: { type: Number },  // metres from branch centre

  // Selfie captured at attendance
  selfie: {
    url:      String,
    publicId: String,
  },

  // Verification flags
  faceVerified:   { type: Boolean, default: false },
  deviceVerified: { type: Boolean, default: false },

  status: {
    type:    String,
    enum:    ['verified', 'partial', 'failed', 'manual_override'],
    default: 'partial',
  },
  failReasons: [{ type: String }],
  notes:       { type: String },
}, { timestamps: true });

attendanceSchema.index({ company: 1, date: 1 });
attendanceSchema.index({ company: 1, worker: 1, date: 1 });
attendanceSchema.index({ company: 1, branch: 1, date: 1 });
attendanceSchema.index({ company: 1, timestamp: -1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
