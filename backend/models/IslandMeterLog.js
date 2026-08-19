const mongoose = require('mongoose');
const { Schema } = mongoose;

const nozzleSchema = new Schema({
  opening:    { type: Number, default: null },
  closing:    { type: Number, default: null },
  litresSold: { type: Number, default: null }, // closing - opening
}, { _id: false });

const pumpMeterSchema = new Schema({
  pumpId:        { type: Schema.Types.ObjectId, ref: 'Pump' },
  pumpNumber:    { type: Number },
  pumpName:      { type: String },
  productType:   { type: String },
  primaryMeter:  { type: String, enum: ['outer', 'inner'], default: 'outer' }, // which meter is used to calculate litres sold
  nozzle1:       { type: nozzleSchema, default: () => ({}) }, // outer meter
  nozzle2:       { type: nozzleSchema, default: () => ({}) }, // inner meter
  totalLitres:   { type: Number, default: null }, // closing - opening of primaryMeter
}, { _id: false });

const islandMeterLogSchema = new Schema({
  company:    { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branchId:   { type: Schema.Types.ObjectId, ref: 'Branch',  required: true },
  branchName: { type: String },
  date:       { type: String, required: true }, // YYYY-MM-DD

  islandId:   { type: Schema.Types.ObjectId, ref: 'PumpIsland', required: true },
  islandName: { type: String },

  workerId:         { type: Schema.Types.ObjectId, ref: 'Worker', default: null },
  workerName:       { type: String, default: '' },
  pumpAssignmentId: { type: Schema.Types.ObjectId, ref: 'PumpAssignment', default: null },

  // Per-pump, per-nozzle readings
  pumps: { type: [pumpMeterSchema], default: [] },

  // Computed totals across all pumps (for reporting)
  totalLitres: { type: Number, default: null },

  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  notes:  { type: String, default: '' },

  openedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  openedAt: { type: Date },
  closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  closedAt: { type: Date },
}, { timestamps: true });

// One log per island per day
islandMeterLogSchema.index({ company: 1, branchId: 1, date: 1 });
islandMeterLogSchema.index({ company: 1, islandId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('IslandMeterLog', islandMeterLogSchema);
