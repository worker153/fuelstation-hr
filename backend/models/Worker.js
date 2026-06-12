const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const fileRefSchema = new mongoose.Schema({
  url:       String,
  publicId:  String,
  fileType:  { type: String, enum: ['image', 'pdf'] }
}, { _id: false });

const verificationDocSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['nin', 'voter_card', 'drivers_license', 'national_id', 'international_passport'],
    required: true
  },
  documentNumber: { type: String, trim: true, default: '' },
  file:       fileRefSchema,
  uploadedAt: { type: Date, default: Date.now }
});

const housePhotoSchema = new mongoose.Schema({
  url:       String,
  publicId:  String,
  photoType: {
    type: String,
    enum: ['house_front', 'street_view', 'environment', 'interior', 'other'],
    default: 'other'
  }
}, { _id: true });

const houseVerificationSchema = new mongoose.Schema({
  coordinates:      { lat: Number, lng: Number },
  address:          String,
  formattedAddress: String,
  notes:            String,
  photos:           [housePhotoSchema],
  verifiedBy:       { type: ObjectId, ref: 'User' },
  verifiedAt:       Date
}, { _id: false });

// ── Employment history entry ──────────────────────────────────────────────────
const employmentHistorySchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['registered', 'activated', 'transferred', 'role_changed', 'suspended',
           'sacked', 'reactivated', 'schedule_changed', 'deactivated'],
    required: true
  },
  fromBranch:   String,
  toBranch:     String,
  fromRole:     String,
  toRole:       String,
  fromSchedule: String,
  toSchedule:   String,
  reason:       String,
  notes:        String,
  date:         { type: Date, default: Date.now },
  performedBy:  { type: ObjectId, ref: 'User' }
}, { _id: true });

const workerSchema = new mongoose.Schema({
  company:  { type: ObjectId, ref: 'Company', required: true },
  fullName: { type: String, required: [true, 'Full name is required'],    trim: true },
  phone:    { type: String, required: [true, 'Phone number is required'], trim: true },
  address:  { type: String, required: [true, 'Address is required'],      trim: true },

  // Structured address with Plus Code
  addressLocation: {
    formatted:     String,   // Google / geocoder-generated address
    workerAddress: String,   // Address as the worker described it
    landmark:      String,   // Nearest landmark
    coordinates: { lat: Number, lng: Number },
    plusCode:    String
  },

  passportPhoto: { url: String, publicId: String },

  signature: {
    url:        String,
    publicId:   String,
    uploadedAt: Date
  },

  // ── Authorized signature & company stamp (manager/supervisor sign-off) ────
  authorisedSignature: {
    url:           String,
    publicId:      String,
    authorisedBy:  String,   // name of signatory
    authorisedAt:  Date
  },
  companyStamp: {
    url:        String,
    publicId:   String,
    uploadedAt: Date
  },

  branch:   { type: String, required: [true, 'Branch is required'], trim: true },
  branchId: { type: ObjectId, ref: 'Branch' },
  role:     { type: String, required: [true, 'Role is required'],   trim: true },
  schedule: { type: String, trim: true },
  shiftId:  { type: ObjectId, ref: 'Shift' },

  // ── Verification status flow ─────────────────────────────────────────────
  verificationStatus: {
    type:    String,
    enum:    [
      'pending', 'partially_verified', 'fully_verified', 'verified',
      'pending_verification', 'under_review', 'pending_approval', 'rejected'
    ],
    default: 'pending_verification'
  },

  // Approval / rejection
  rejectionReason:        { type: String, trim: true },
  approvedBy:             { type: ObjectId, ref: 'User' },
  approvedAt:             Date,
  rejectedBy:             { type: ObjectId, ref: 'User' },
  rejectedAt:             Date,
  submittedForApprovalAt: Date,
  submittedForApprovalBy: { type: ObjectId, ref: 'User' },

  verificationDocuments: [verificationDocSchema],
  houseVerification:     houseVerificationSchema,

  // ── Employment status ────────────────────────────────────────────────────
  employmentStatus: {
    type:    String,
    enum:    ['registered', 'active', 'suspended', 'sacked', 'inactive'],
    default: 'registered'
  },

  resumptionDate: { type: Date },   // actual first day of work (used for payroll proration)
  activatedAt:    Date,
  activatedBy:    { type: ObjectId, ref: 'User' },

  suspensionReason: { type: String, trim: true },
  suspendedAt:      Date,
  suspendedBy:      { type: ObjectId, ref: 'User' },

  sackReason: { type: String, trim: true },
  sackedAt:   Date,
  sackedBy:   { type: ObjectId, ref: 'User' },

  // ── Salary & bank ────────────────────────────────────────────────────────
  salary: {
    monthly:        { type: Number, default: 0 },
    paymentStatus:  { type: String, enum: ['paid', 'unpaid', 'partial'], default: 'unpaid' },
    payrollEnabled: { type: Boolean, default: false }
  },
  bankDetails: {
    bankName:      { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    accountName:   { type: String, trim: true }
  },

  // ── Employment history ───────────────────────────────────────────────────
  employmentHistory: [employmentHistorySchema],

  addedBy:      { type: ObjectId, ref: 'User' },
  registeredAt: { type: Date },  // override for the displayed "Registered" date (editable by super admin)
  pin:              { type: String, trim: true },  // 4-digit PIN for self-service shortage entry
  pinSelfReset:     { type: Boolean, default: false }, // true when worker self-reset via /my-pin
  pinSelfResetAt:   { type: Date },

  // Face biometric — 128-float descriptor from face-api.js, registered on terminal first login
  faceDescriptor:    { type: [Number], default: undefined },
  faceRegisteredAt:  { type: Date },
  faceRegisteredOn:  { type: String },   // device name where face was registered

  // Rotation schedule — used by attendance to determine on/off days
  rotationSchedule: {
    pattern:   { type: String, default: 'none' },  // 'none' | '1_1' | '2_2' | '3_3'
    startDate: { type: Date },                      // anchor: a known "on duty" day
  },

  // Attendance tracking — set false for salary workers (mechanics, accountants, etc.)
  // who don't clock in/out and should never appear as No Show or receive auto-deductions
  clockInRequired: { type: Boolean, default: true },

  // Set true for workers who are always considered present (e.g. owner/manager on-site full time)
  // They appear as Present in all attendance views without ever needing to clock in
  alwaysPresent: { type: Boolean, default: false },

  // Pump assignment — links worker to a specific pump on the forecourt controller
  pumpId:    { type: String },   // default pump this worker operates
  pumpLabel: { type: String },
}, { timestamps: true });

workerSchema.index({ company: 1 });
workerSchema.index({ company: 1, verificationStatus: 1 });
workerSchema.index({ company: 1, employmentStatus: 1 });
workerSchema.index({ company: 1, branchId: 1 });
workerSchema.index({ company: 1, shiftId: 1 });

module.exports = mongoose.model('Worker', workerSchema);
