const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const permissionsSchema = new mongoose.Schema({
  verifyWorkers:    { type: Boolean, default: false },
  approveWorkers:   { type: Boolean, default: false },
  editWorkers:      { type: Boolean, default: false },
  uploadDocuments:  { type: Boolean, default: false },
  manageGuarantors: { type: Boolean, default: false },
  manageBranches:   { type: Boolean, default: false },
  manageStaff:      { type: Boolean, default: false },
  viewWorkers:      { type: Boolean, default: true  },
  addWorkers:       { type: Boolean, default: false },
  submitShortages:  { type: Boolean, default: false },  // supervisor can submit shortages for approval
  viewOwnShift:     { type: Boolean, default: false }   // restrict view to own shift only (within branch)
}, { _id: false });

const userSchema = new mongoose.Schema({
  company:     { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  name:        { type: String, required: [true, 'Name is required'],  trim: true },
  email:       { type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true },
  password:    { type: String, required: [true, 'Password is required'], minlength: 6, select: false },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'verification_officer', 'supervisor', 'record_supervisor', 'hr_staff'],
    default: 'hr_staff'
  },
  permissions: { type: permissionsSchema, default: () => ({}) },
  branchId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },  // assigned branch for supervisors
  shiftId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Shift'  },  // assigned shift (optional)
  isActive:    { type: Boolean, default: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Convenience: does this user have a specific permission?
userSchema.methods.can = function (perm) {
  if (['super_admin', 'admin'].includes(this.role)) return true;
  return !!this.permissions?.[perm];
};

module.exports = mongoose.model('User', userSchema);
