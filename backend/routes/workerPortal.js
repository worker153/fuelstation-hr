const router = require('express').Router();
const { workerPortalAuth, workerChangePin } = require('../controllers/workerPortalController');

// Public — authenticated by PIN (no JWT required)
router.post('/auth',       workerPortalAuth);
router.post('/change-pin', workerChangePin);

module.exports = router;
