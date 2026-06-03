const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { subscribe, unsubscribe, getVapidPublicKey } = require('../controllers/pushController');

router.get('/vapid-public-key', getVapidPublicKey);   // public — needed before login

router.use(protect);
router.post('/subscribe',   subscribe);
router.post('/unsubscribe', unsubscribe);

module.exports = router;
