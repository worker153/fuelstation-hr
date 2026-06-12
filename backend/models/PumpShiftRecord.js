const mongoose = require('mongoose');
const { Schema } = mongoose;

const pumpShiftRecordSchema = new Schema({
  company:      { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branchId:     { type: Schema.Types.ObjectId, ref: 'Branch' },
  branchName:   { type: String },
  integration:  { type: Schema.Types.ObjectId, ref: 'StationIntegration' },
  worker:       { type: Schema.Types.ObjectId, ref: 'Worker', required: true },
  workerName:   { type: String },
  workerRole:   { type: String },
  pumpId:       { type: String },
  pumpLabel:    { type: String },
  date:         { type: String },
  shiftName:    { type: String },
  openingMeter: { type: Number },
  closingMeter: { type: Number },
  volume:       { type: Number },
  openedAt:     { type: Date },
  closedAt:     { type: Date },
  status:       { type: String, enum: ['open', 'closed', 'error'], default: 'open' },
  openError:    { type: String },
  closeError:   { type: String },
  notes:        { type: String },
}, { timestamps: true });

pumpShiftRecordSchema.index({ company: 1, date: 1, worker: 1 });
pumpShiftRecordSchema.index({ company: 1, branchId: 1, date: 1 });

module.exports = mongoose.model('PumpShiftRecord', pumpShiftRecordSchema);
