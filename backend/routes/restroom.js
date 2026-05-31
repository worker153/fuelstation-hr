const router = require('express').Router();
const { protect }           = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const {
  startRestroom, endRestroom, getRestroomStatus, getRestroomList,
} = require('../controllers/restroomController');

// ── Public — device-token authenticated ───────────────────────────────────────
router.post('/start',  startRestroom);
router.post('/end',    endRestroom);
router.get('/status',  getRestroomStatus);

// ── Protected — admin ─────────────────────────────────────────────────────────
router.use(protect, checkSubscription);
router.get('/', getRestroomList);

module.exports = router;
