const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  company: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Company',
    required: true
  },
  name:    { type: String, required: [true, 'Branch name is required'], trim: true },
  address: { type: String, trim: true },
  location: {
    lat:       Number,
    lng:       Number,
    formatted: String,
    plusCode:  String
  },
  phone:    { type: String, trim: true },
  manager:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  createdBy:{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

branchSchema.index({ company: 1 });
branchSchema.index({ company: 1, isActive: 1 });

module.exports = mongoose.model('Branch', branchSchema);
