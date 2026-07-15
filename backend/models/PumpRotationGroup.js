const mongoose = require('mongoose');
const { Schema } = mongoose;

const pumpRotationGroupSchema = new Schema({
  company:    { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branchId:   { type: Schema.Types.ObjectId, ref: 'Branch',  required: true },
  branchName: { type: String },
  name:       { type: String, required: true, trim: true },
  shiftId:    { type: Schema.Types.ObjectId, ref: 'Shift' },
  shiftName:  { type: String },

  // Ordered list of pump attendants — position 0 is first in rotation
  workers: [{
    workerId:   { type: Schema.Types.ObjectId, ref: 'Worker', required: true },
    workerName: { type: String },
    position:   { type: Number, required: true },   // 0, 1, 2 …
  }],

  // Ordered list of islands — position 0 is Island 1, etc.
  islands: [{
    islandId:   { type: Schema.Types.ObjectId, ref: 'PumpIsland', required: true },
    islandName: { type: String },
    position:   { type: Number, required: true },   // 0, 1, 2 …
  }],

  isActive: { type: Boolean, default: true },
}, { timestamps: true });

pumpRotationGroupSchema.index({ company: 1, branchId: 1 });
pumpRotationGroupSchema.index({ company: 1, 'workers.workerId': 1 });

module.exports = mongoose.model('PumpRotationGroup', pumpRotationGroupSchema);
