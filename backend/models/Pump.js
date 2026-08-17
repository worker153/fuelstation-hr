const mongoose = require('mongoose');
const { Schema } = mongoose;

const pumpSchema = new Schema({
  company:       { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branchId:      { type: Schema.Types.ObjectId, ref: 'Branch',  required: true },
  branchName:    { type: String },
  pumpNumber:    { type: Number, required: true },       // 1, 2, 3, 4
  pumpName:      { type: String, required: true },       // "Pump 1", "Pump A"
  productType:   { type: String, enum: ['PMS', 'AGO', 'LPG', 'DPK', 'other'], default: 'PMS' },
  externalId:    { type: String },                       // ID on the station API
  status:        { type: String, enum: ['active', 'faulty', 'maintenance', 'out_of_stock'], default: 'active' },
  rotationOrder: { type: Number, default: 0 },           // 0, 1, 2, 3 — lower = earlier in rotation
  notes:         { type: String },
}, { timestamps: true });

pumpSchema.index({ company: 1, branchId: 1, rotationOrder: 1 });
pumpSchema.index({ company: 1, branchId: 1, pumpNumber: 1 }, { unique: true });

module.exports = mongoose.model('Pump', pumpSchema);
