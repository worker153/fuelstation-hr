const mongoose = require('mongoose');
const { Schema } = mongoose;

const pushSubscriptionSchema = new Schema({
  company:  { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, required: true },
    auth:   { type: String, required: true },
  },
  label:     { type: String },           // e.g. "Violet's iPhone"
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
