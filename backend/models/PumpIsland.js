const mongoose = require('mongoose');
const { Schema } = mongoose;

const pumpIslandSchema = new Schema({
  company:       { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branchId:      { type: Schema.Types.ObjectId, ref: 'Branch',  required: true },
  branchName:    { type: String },
  name:          { type: String, required: true, trim: true }, // "Island 1", "Island A"
  pumps:         [{ type: Schema.Types.ObjectId, ref: 'Pump' }], // pumps on this island
  productTypes:  [{ type: String, enum: ['PMS', 'AGO', 'LPG', 'DPK', 'other'] }],
  includesGas:   { type: Boolean, default: false }, // AGO worker also handles gas (LPG)
  rotationOrder: { type: Number, default: 0 },
  maxWorkers:    { type: Number, default: 1, min: 1, max: 2 }, // 1 = one worker, 2 = can share
  isPriority:    { type: Boolean, default: false },            // overflow workers go here first
  fixedWorkerId:   { type: Schema.Types.ObjectId, ref: 'Worker', default: null },
  fixedWorkerName: { type: String, default: '' },
  status:        { type: String, enum: ['active', 'inactive'], default: 'active' },
  notes:         { type: String },
}, { timestamps: true });

pumpIslandSchema.index({ company: 1, branchId: 1, rotationOrder: 1 });
pumpIslandSchema.index({ company: 1, branchId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('PumpIsland', pumpIslandSchema);
