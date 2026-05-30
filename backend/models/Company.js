const mongoose = require('mongoose');

// ── Company Code generator ────────────────────────────────────────────────────
// "Sage Energy" → "SAGE-4721"
function generateCode(name) {
  const prefix = (name || 'CO')
    .replace(/[^A-Za-z]/g, '')
    .substring(0, 4)
    .toUpperCase()
    .padEnd(4, 'X');
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${suffix}`;
}

const companySchema = new mongoose.Schema({
  // ── Identity ────────────────────────────────────────────────────────────────
  name:        { type: String, required: [true, 'Company name is required'], trim: true },
  companyCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:       { type: String, trim: true },
  address:     { type: String, trim: true },
  industry:    { type: String, trim: true },
  country:     { type: String, default: 'Nigeria', trim: true },
  currency:    { type: String, default: 'NGN' },
  logo:        { url: String, publicId: String },

  // ── Subscription ────────────────────────────────────────────────────────────
  subscriptionStatus: {
    type:    String,
    enum:    ['pending_approval', 'trial', 'active', 'expired', 'suspended'],
    default: 'pending_approval',
  },
  plan: {
    type:    String,
    enum:    ['trial', 'starter', 'professional', 'enterprise'],
    default: 'trial',
  },
  trialEndsAt:        { type: Date },
  subscriptionEndsAt: { type: Date },

  // ── Limits per plan ─────────────────────────────────────────────────────────
  maxWorkers:  { type: Number, default: 100 },
  maxUsers:    { type: Number, default: 15  },
  maxBranches: { type: Number, default: 10  },

  // ── Approval ────────────────────────────────────────────────────────────────
  approvalStatus: {
    type:    String,
    enum:    ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  approvedAt:     { type: Date },
  approvedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt:     { type: Date },
  rejectedReason: { type: String },

  // ── Suspension ──────────────────────────────────────────────────────────────
  suspendedAt:     { type: Date },
  suspendedReason: { type: String },

  // ── Billing (Paystack / Flutterwave — future) ───────────────────────────────
  billingEmail:           { type: String, lowercase: true },
  paystackCustomerId:     { type: String },
  paystackSubscriptionId: { type: String },
  flutterwaveCustomerId:  { type: String },
  lastPaymentAt:          { type: Date },
  lastPaymentAmount:      { type: Number },
  lastPaymentRef:         { type: String },

  // ── Registration meta ───────────────────────────────────────────────────────
  registeredBy: { type: String },   // name of person who signed up
  notes:        { type: String },   // internal platform-admin notes
}, { timestamps: true });

// ── Indexes ──────────────────────────────────────────────────────────────────
companySchema.index({ companyCode: 1 });
companySchema.index({ subscriptionStatus: 1 });

// ── Static: generate + guarantee a unique code ────────────────────────────────
companySchema.statics.generateUniqueCode = async function (name) {
  let code, exists;
  let attempts = 0;
  do {
    code   = generateCode(name);
    exists = await this.findOne({ companyCode: code }).lean();
    attempts++;
    if (attempts > 20) throw new Error('Could not generate unique company code');
  } while (exists);
  return code;
};

// ── Virtual: days left in trial ───────────────────────────────────────────────
companySchema.virtual('trialDaysLeft').get(function () {
  if (!this.trialEndsAt) return null;
  const ms   = this.trialEndsAt - new Date();
  return Math.max(0, Math.ceil(ms / 86400000));
});

// ── Method: is subscription currently valid? ──────────────────────────────────
companySchema.methods.isAccessAllowed = function () {
  const s = this.subscriptionStatus || 'active';     // legacy docs → active
  if (s === 'active') return { allowed: true };
  if (s === 'trial') {
    if (!this.trialEndsAt || new Date() <= this.trialEndsAt) return { allowed: true };
    return { allowed: false, code: 'TRIAL_EXPIRED', message: 'Trial period has ended. Please subscribe.' };
  }
  if (s === 'pending_approval')
    return { allowed: false, code: 'PENDING_APPROVAL', message: 'Your company registration is awaiting approval.' };
  if (s === 'suspended')
    return { allowed: false, code: 'SUSPENDED', message: `Account suspended: ${this.suspendedReason || 'Contact support.'}` };
  if (s === 'expired')
    return { allowed: false, code: 'SUBSCRIPTION_EXPIRED', message: 'Subscription expired. Please renew to continue.' };
  return { allowed: true };
};

module.exports = mongoose.model('Company', companySchema);
