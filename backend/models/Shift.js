const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
  company:   { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  branch:    { type: mongoose.Schema.Types.ObjectId, ref: 'Branch',  required: true },
  name:      { type: String, required: [true, 'Shift name is required'], trim: true },

  // ── Shift type ────────────────────────────────────────────────────────────
  shiftType: {
    type:    String,
    enum:    ['fixed', 'rotation'],
    default: 'fixed'
  },

  // ── Fixed shift fields (time-based) ──────────────────────────────────────
  startTime: { type: String, trim: true },   // e.g. "06:00"
  endTime:   { type: String, trim: true },   // e.g. "14:00"
  days: {
    type:    [String],
    enum:    ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
    default: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
  },

  // ── Rotation shift fields ─────────────────────────────────────────────────
  // e.g. "1_1" = 1 day in / 1 day out, "2_2" = 2 in / 2 out
  rotationPattern: { type: String, trim: true },   // "1_1" | "2_2" | "3_3" | "custom"
  rotationLabel:   { type: String, trim: true },   // human-readable e.g. "1 Day In / 1 Day Out"

  maxWorkers: { type: Number, default: 0 },
  isActive:   { type: Boolean, default: true },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

shiftSchema.index({ company: 1 });
shiftSchema.index({ branch: 1 });
shiftSchema.index({ company: 1, branch: 1, isActive: 1 });

module.exports = mongoose.model('Shift', shiftSchema);
