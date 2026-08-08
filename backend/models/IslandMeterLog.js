const mongoose = require('mongoose');
const { Schema } = mongoose;

const islandMeterLogSchema = new Schema({
  company:    { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branchId:   { type: Schema.Types.ObjectId, ref: 'Branch',  required: true },
  branchName: { type: String },
  date:       { type: String, required: true }, // YYYY-MM-DD

  islandId:   { type: Schema.Types.ObjectId, ref: 'PumpIsland', required: true },
  islandName: { type: String },

  // Filled in after worker clocks in
  workerId:         { type: Schema.Types.ObjectId, ref: 'Worker', default: null },
  workerName:       { type: String, default: '' },
  pumpAssignmentId: { type: Schema.Types.ObjectId, ref: 'PumpAssignment', default: null },

  openingMeter: { type: Number, default: null },
  closingMeter: { type: Number, default: null },
  litresSold:   { type: Number, default: null }, // auto: closingMeter - openingMeter

  status:     { type: String, enum: ['open', 'closed'], default: 'open' },
  notes:      { type: String, default: '' },

  openedBy:  { type: Schema.Types.ObjectId, ref: 'User' },
  openedAt:  { type: Date },
  closedBy:  { type: Schema.Types.ObjectId, ref: 'User' },
  closedAt:  { type: Date },
}, { timestamps: true });

// One log per island per day
islandMeterLogSchema.index({ company: 1, branchId: 1, date: 1 });
islandMeterLogSchema.index({ company: 1, islandId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('IslandMeterLog', islandMeterLogSchema);
