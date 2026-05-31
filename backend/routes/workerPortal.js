const router = require('express').Router();
const { workerPortalAuth, workerChangePin, bookOffence } = require('../controllers/workerPortalController');

// Public — authenticated by PIN (no JWT required)
router.post('/auth',         workerPortalAuth);
router.post('/change-pin',   workerChangePin);
router.post('/book-offence', bookOffence);

module.exports = router;
