const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const componentSchema = new mongoose.Schema({
  name:   { type: String, required: true, trim: true }, // e.g. "Basic Salary", "Housing Allowance"
  amount: { type: Number, required: true, default: 0 },
  type:   { type: String, enum: ['earning', 'deduction'], default: 'earning' },
}, { _id: false });

const salaryStructureSchema = new mongoose.Schema({
  company:     { type: ObjectId, ref: 'Company', required: true },
  name:        { type: String, required: true, trim: true }, // e.g. "Pump Attendant Grade A"
  description: { type: String, trim: true, default: '' },
  components:  { type: [componentSchema], default: [] },
  grossTotal:  { type: Number, default: 0 }, // sum of earning components
}, { timestamps: true });

salaryStructureSchema.index({ company: 1 });

module.exports = mongoose.model('SalaryStructure', salaryStructureSchema);
