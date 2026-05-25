const mongoose = require('mongoose');

const guarantorSchema = new mongoose.Schema({
  worker:  { type: mongoose.Schema.Types.ObjectId, ref: 'Worker',  required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },

  fullName:     { type: String, required: [true, 'Full name is required'], trim: true },
  phone:        { type: String, required: [true, 'Phone number is required'], trim: true },
  address:      { type: String, required: [true, 'Address is required'], trim: true },
  relationship: { type: String, required: [true, 'Relationship is required'], trim: true },

  passportPhoto: { url: String, publicId: String },

  // Digital or uploaded signature
  signature: {
    url:        String,
    publicId:   String,
    uploadedAt: Date
  },

  idDocument: {
    type: {
      type: String,
      enum: ['nin', 'voter_card', 'drivers_license', 'national_id', 'international_passport']
    },
    documentNumber: { type: String, trim: true, default: '' },
    file: {
      url:      String,
      publicId: String,
      fileType: { type: String, enum: ['image', 'pdf'] }
    }
  },

  houseLocation: {
    coordinates:     { lat: Number, lng: Number },
    address:         String,
    formattedAddress: String,
    photos: [{
      url:       String,
      publicId:  String,
      photoType: {
        type:    String,
        enum:    ['house_front', 'street_view', 'environment', 'interior', 'other'],
        default: 'other'
      }
    }]
  },

  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

guarantorSchema.index({ worker: 1 });
guarantorSchema.index({ company: 1 });

module.exports = mongoose.model('Guarantor', guarantorSchema);
