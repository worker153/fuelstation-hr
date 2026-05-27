const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const entrySchema = new mongoose.Schema({
  worker:        { type: ObjectId, ref: 'Worker' },
  // snapshot of worker info at payroll time
  fullName:      { type: String, trim: true },
  role:          { type: String, trim: true },
  branchId:      { type: ObjectId, ref: 'Branch' },
  branchName:    { type: String, trim: true },
  // financials
  grossSalary:      { type: Number, default: 0 },   // monthly base salary
  // ── Proration (first month when worker joined mid-month) ───────────────────
  resumptionDate:   Date,
  isProrated:       { type: Boolean, default: false },
  daysInMonth:      { type: Number, default: 0 },
  daysWorked:       { type: Number, default: 0 },
  calculatedSalary: { type: Number, default: 0 },   // after proration (= grossSalary if full month)
  // ── Per-day basis ───────────────────────────────────────────────────────────
  workingDaysInMonth: { type: Number, default: 26 }, // basis for daily rate
  dailyRate:          { type: Number, default: 0 },
  // ── Deductions / additions ─────────────────────────────────────────────────
  absentDays:        { type: Number, default: 0 },
  absenceDeduction:  { type: Number, default: 0 },   // absentDays × dailyRate
  shortage:          { type: Number, default: 0 },   // cash shortage
  bonus:             { type: Number, default: 0 },   // addition
  netPay:            { type: Number, default: 0 },   // final amount
  // bank
  bankName:      { type: String, trim: true },
  accountNumber: { type: String, trim: true },
  accountName:   { type: String, trim: true },
  // status
  paid:          { type: Boolean, default: false },
  notes:         { type: String, trim: true }
}, { _id: true });

const payrollSchema = new mongoose.Schema({
  company:    { type: ObjectId, ref: 'Company', required: true },
  branchId:   { type: ObjectId, ref: 'Branch' },   // payroll is per-branch
  branchName: { type: String, trim: true },
  month:      { type: Number, required: true, min: 1, max: 12 },
  year:       { type: Number, required: true },
  label:      { type: String },   // e.g. "Sapele Rd — May 2026"
  status:     { type: String, enum: ['draft', 'finalised'], default: 'draft' },
  entries:    [entrySchema],
  // computed totals (recalculated on save)
  totalGross:    { type: Number, default: 0 },
  totalShortage: { type: Number, default: 0 },
  totalBonus:    { type: Number, default: 0 },
  totalNet:      { type: Number, default: 0 },
  notes:         { type: String, trim: true },
  createdBy:     { type: ObjectId, ref: 'User' },
  finalisedBy:   { type: ObjectId, ref: 'User' },
  finalisedAt:   Date
}, { timestamps: true });

// One payroll per branch per month per year
payrollSchema.index({ company: 1, branchId: 1, month: 1, year: 1 });

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

payrollSchema.pre('save', function(next) {
  const period = `${MONTHS[this.month - 1]} ${this.year}`;
  this.label   = this.branchName ? `${this.branchName} — ${period}` : period;
  this.entries.forEach(e => {
    // Daily rate based on working days (default 26)
    const wdm = e.workingDaysInMonth > 0 ? e.workingDaysInMonth : 26;
    e.dailyRate = (e.grossSalary || 0) / wdm;

    // calculatedSalary is set by the controller (at generation or on edit).
    // Only default to grossSalary if it is somehow missing/zero.
    if (!e.calculatedSalary) e.calculatedSalary = e.grossSalary || 0;

    // Absence deduction = absent days × daily rate
    e.absenceDeduction = Math.round((e.absentDays || 0) * e.dailyRate * 100) / 100;

    // Net pay formula
    e.netPay = Math.max(
      0,
      (e.calculatedSalary || 0) - e.absenceDeduction - (e.shortage || 0) + (e.bonus || 0)
    );
  });
  this.totalGross    = this.entries.reduce((s, e) => s + (e.grossSalary || 0), 0);
  this.totalShortage = this.entries.reduce((s, e) => s + (e.shortage    || 0), 0);
  this.totalBonus    = this.entries.reduce((s, e) => s + (e.bonus       || 0), 0);
  this.totalNet      = this.entries.reduce((s, e) => s + (e.netPay      || 0), 0);
  next();
});

module.exports = mongoose.model('Payroll', payrollSchema);
