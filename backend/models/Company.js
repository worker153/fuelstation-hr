const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Company name is required'], trim: true },
  email: { type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  address: { type: String, trim: true },
  logo: { url: String, publicId: String },
  branches: [{ name: String, address: String }]
}, { timestamps: true });

module.exports = mongoose.model('Company', companySchema);
