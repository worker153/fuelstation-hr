/**
 * Subscription enforcement middleware.
 *
 * Place AFTER protect() on any route that should be blocked for companies
 * whose subscription has expired, been suspended, or is pending approval.
 *
 * Platform admins (isPlatformAdmin=true) bypass all checks.
 */
const Company = require('../models/Company');

const checkSubscription = async (req, res, next) => {
  try {
    // Platform admins see everything
    if (req.user?.isPlatformAdmin) return next();

    // No company attached (should not happen for non-platform users)
    const company = req.user?.company;
    if (!company) {
      return res.status(403).json({ success: false, message: 'No company associated with this account.' });
    }

    // Fetch fresh company doc if only an ID is populated
    const co = company._id ? company : await Company.findById(company);
    if (!co) {
      return res.status(403).json({ success: false, message: 'Company not found.' });
    }

    // Check access — Company model method handles all states
    const access = co.isAccessAllowed();
    if (!access.allowed) {
      // Auto-expire trial in DB if needed
      if (access.code === 'TRIAL_EXPIRED' && co.subscriptionStatus === 'trial') {
        await Company.findByIdAndUpdate(co._id, { subscriptionStatus: 'expired' });
      }
      return res.status(402).json({
        success: false,
        code:    access.code,
        message: access.message,
      });
    }

    // Attach fresh company to req for downstream use
    req.company = co;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { checkSubscription };
