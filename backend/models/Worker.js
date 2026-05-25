const mongoose = require('mongoose');

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
  coordinates: { lat: Number, lng: Number },
  address:     String,
  formattedAddress: String,
  notes:       String,
  photos:      [housePhotoSchema],
  verifiedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt:  Date
}, { _id: false });

const workerSchema = new mongoose.Schema({
  company:    { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  fullName:   { type: String, required: [true, 'Full name is required'], trim: true },
  phone:      { type: String, required: [true, 'Phone number is required'], trim: true },
  address:    { type: String, required: [true, 'Address is required'], trim: true },

  // Structured address from Google Places
  addressLocation: {
    formatted:   String,
    coordinates: { lat: Number, lng: Number }
  },

  passportPhoto: { url: String, publicId: String },

  // Digital or uploaded signature
  signature: {
    url:        String,
    publicId:   String,
    uploadedAt: Date
  },

  branch:     { type: String, required: [true, 'Branch is required'], trim: true },
  role:       { type: String, required: [true, 'Role is required'], trim: true },

  verificationStatus: {
    type:    String,
    enum:    ['pending', 'partially_verified', 'fully_verified', 'verified'], // 'verified' kept for compat
    default: 'pending'
  },

  verificationDocuments: [verificationDocSchema],
  houseVerification:     houseVerificationSchema,

  addedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

workerSchema.index({ company: 1 });
workerSchema.index({ company: 1, verificationStatus: 1 });

module.exports = mongoose.model('Worker', workerSchema);
