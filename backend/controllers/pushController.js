const webpush          = require('web-push');
const PushSubscription = require('../models/PushSubscription');

// Lazy VAPID init — only configure once keys are present (avoids crash on startup if vars missing)
let _vapidReady = false;
function initVapid() {
  if (_vapidReady) return true;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    process.env.VAPID_MAILTO || 'mailto:admin@sage-energy.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  _vapidReady = true;
  return true;
}

// ── POST /api/push/subscribe ──────────────────────────────────────────────────
const subscribe = async (req, res) => {
  const cid = req.user.company._id;
  const { subscription, label } = req.body;
  if (!subscription?.endpoint || !subscription?.keys)
    return res.status(400).json({ success: false, message: 'Invalid subscription object' });

  await PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    {
      company:  cid,
      endpoint: subscription.endpoint,
      keys:     subscription.keys,
      label:    label || null,
    },
    { upsert: true, new: true },
  );

  res.json({ success: true });
};

// ── POST /api/push/unsubscribe ────────────────────────────────────────────────
const unsubscribe = async (req, res) => {
  const { endpoint } = req.body;
  if (endpoint) await PushSubscription.deleteOne({ endpoint });
  res.json({ success: true });
};

// ── GET /api/push/vapid-public-key ───────────────────────────────────────────
const getVapidPublicKey = (req, res) => {
  res.json({ success: true, publicKey: process.env.VAPID_PUBLIC_KEY });
};

// ── Internal helper: fire push to all admin devices in a company ──────────────
const sendPushToCompany = async (companyId, payload) => {
  if (!initVapid()) return;

  const subs = await PushSubscription.find({ company: companyId }).lean();
  if (!subs.length) return;

  const payloadStr = JSON.stringify(payload);
  const staleIds   = [];

  await Promise.allSettled(
    subs.map(async (sub, i) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payloadStr,
        );
      } catch (err) {
        // 410 Gone or 404 = subscription expired; remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          staleIds.push(sub._id);
        }
      }
    }),
  );

  if (staleIds.length) {
    await PushSubscription.deleteMany({ _id: { $in: staleIds } });
  }
};

module.exports = { subscribe, unsubscribe, getVapidPublicKey, sendPushToCompany };
