const mongoose = require('mongoose');
const { Schema } = mongoose;

const maintenanceSchema = new Schema({
  company:     { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  pump:        { type: String, required: true },
  pumpId:      { type: Schema.Types.ObjectId, ref: 'Pump' },
  date:        { type: Date, required: true },
  workerName:  { type: String, required: true },
  description: { type: String, required: true },
  loggedBy:    { type: String },
}, { timestamps: true });

maintenanceSchema.index({ company: 1, date: -1 });

module.exports = mongoose.model('Maintenance', maintenanceSchema);
