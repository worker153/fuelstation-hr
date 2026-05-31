const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  company: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Company',
    required: true
  },
  name:    { type: String, required: [true, 'Branch name is required'], trim: true },
  address: { type: String, trim: true },
  photo:   { url: String, publicId: String },   // station picture
  location: {
    lat:       Number,
    lng:       Number,
    formatted: String,
    plusCode:  String
  },
  phone:    { type: String, trim: true },
  manager:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  createdBy:{ type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Legacy single-rule (kept for backward compat — controller prefers attendanceRules)
  attendanceSettings: {
    clockInDeadline:              { type: String,  default: '' },
    absentThreshold:              { type: String,  default: '' },
    shiftEnd:                     { type: String,  default: '' },
    shiftEndNextDay:              { type: Boolean, default: false },
    lateDeductionAmount:          { type: Number,  default: 0 },
    absentDeductionAmount:        { type: Number,  default: 0 },
    earlyDepartureDeductionAmount:{ type: Number,  default: 0 },
    workDays:                     { type: [Number], default: [1,2,3,4,5,6] },
  },

  // Per-role rules — role='default' applies to any role not specifically listed
  attendanceRules: [{
    role:                         { type: String, default: 'default' },
    clockInDeadline:              { type: String, default: '' },
    absentThreshold:              { type: String, default: '' },
    shiftEnd:                     { type: String, default: '' },
    shiftEndNextDay:              { type: Boolean, default: false }, // true = clock-out is next calendar day (24h shift)
    lateDeductionAmount:          { type: Number, default: 0 },
    absentDeductionAmount:        { type: Number, default: 0 },
    earlyDepartureDeductionAmount:{ type: Number, default: 0 },
    noClockInDeductionAmount:     { type: Number, default: 0 },
    workDays:                     { type: [Number], default: [1,2,3,4,5,6] },
  }],
  // ── Break settings ────────────────────────────────────────────────────────────
  // Times are UTC strings 'HH:MM'.  Nigeria WAT = UTC+1, so enter 1 h earlier.
  // ── Break settings ────────────────────────────────────────────────────────────
  // Times are UTC strings 'HH:MM'.  Nigeria WAT = UTC+1, so enter 1 h earlier.
  breakSettings: {
    morning: {
      enabled:                 { type: Boolean, default: true  },
      allowedMinutes:          { type: Number,  default: 5     },
      windowStart:             { type: String,  default: '07:00' },   // 08:00 WAT
      windowEnd:               { type: String,  default: '09:30' },   // 10:30 WAT
      overstayDeductionAmount: { type: Number,  default: 0     },     // ₦ deducted if overstayed
      missedDeductionAmount:   { type: Number,  default: 0     },     // ₦ deducted if missed
    },
    afternoon: {
      enabled:                 { type: Boolean, default: true  },
      allowedMinutes:          { type: Number,  default: 10    },
      windowStart:             { type: String,  default: '12:00' },   // 13:00 WAT
      windowEnd:               { type: String,  default: '14:00' },   // 15:00 WAT
      overstayDeductionAmount: { type: Number,  default: 0     },
      missedDeductionAmount:   { type: Number,  default: 0     },
    },
    night: {
      enabled:                 { type: Boolean, default: true  },
      allowedMinutes:          { type: Number,  default: 5     },
      windowStart:             { type: String,  default: '19:00' },   // 20:00 WAT
      windowEnd:               { type: String,  default: '21:00' },   // 22:00 WAT
      overstayDeductionAmount: { type: Number,  default: 0     },
      missedDeductionAmount:   { type: Number,  default: 0     },
    },
  },
  restroomSettings: {
    allowedMinutes:  { type: Number, default: 2   },  // minutes allowed before deduction kicks in
    deductionPerMin: { type: Number, default: 500 },  // ₦ per extra minute
  },

  // Default penalty amounts per shortage reason — 0 means no preset (supervisor enters manually)
  penaltyPresets: {
    cash_shortage:      { type: Number, default: 0 },
    fuel_shortage:      { type: Number, default: 0 },
    equipment_damage:   { type: Number, default: 0 },
    customer_complaint: { type: Number, default: 0 },
    late_arrival:       { type: Number, default: 0 },
    absent:             { type: Number, default: 0 },
    early_departure:    { type: Number, default: 0 },
    other:              { type: Number, default: 0 },
  },

  // Tiered auto-penalty rule for sales shortages
  // When a shortage is submitted, a penalty shortage is auto-created based on the shortage amount vs threshold
  salesShortageRule: {
    enabled:        { type: Boolean, default: true  },
    threshold:      { type: Number,  default: 10000 },  // ₦ boundary
    belowPenalty:   { type: Number,  default: 2000  },  // deduction if shortage < threshold
    atAbovePenalty: { type: Number,  default: 5000  },  // deduction if shortage >= threshold
  },
}, { timestamps: true });

branchSchema.index({ company: 1 });
branchSchema.index({ company: 1, isActive: 1 });

module.exports = mongoose.model('Branch', branchSchema);
