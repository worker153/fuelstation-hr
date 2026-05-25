const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  name:    { type: String, required: [true, 'Name is required'], trim: true },
  email:   { type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true },
  password:{ type: String, required: [true, 'Password is required'], minlength: 6, select: false },
  role:    { type: String, enum: ['admin', 'supervisor'], default: 'admin' }
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
