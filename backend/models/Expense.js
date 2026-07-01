const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const expenseSchema = new mongoose.Schema({
  company:    { type: ObjectId, ref: 'Company', required: true },
  branchId:   { type: ObjectId, ref: 'Branch' },
  branchName: { type: String, trim: true },

  title:      { type: String, required: true, trim: true },  // what was purchased
  category: {
    type: String,
    enum: ['fuel', 'equipment', 'maintenance', 'supplies', 'utilities', 'salary_advance', 'other'],
    default: 'other',
  },
  quantity:    { type: Number, default: 1 },
  unitPrice:   { type: Number, default: 0 },
  amount:      { type: Number, required: true },   // total cost
  notes:       { type: String, trim: true },

  date:        { type: String, required: true },   // 'YYYY-MM-DD'
  month:       { type: Number },
  year:        { type: Number },

  recordedBy:  { type: ObjectId, ref: 'User' },
  recordedByName: { type: String, trim: true },
}, { timestamps: true });

expenseSchema.index({ company: 1, branchId: 1, date: 1 });
expenseSchema.index({ company: 1, month: 1, year: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
