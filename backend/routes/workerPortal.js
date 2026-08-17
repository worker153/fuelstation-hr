const router = require('express').Router();
const { workerPortalAuth, workerChangePin, bookOffence, workerSelectPump, workerHistory } = require('../controllers/workerPortalController');

// Public — authenticated by PIN (no JWT required)
router.post('/auth',         workerPortalAuth);
router.post('/change-pin',   workerChangePin);
router.post('/book-offence', bookOffence);
router.post('/select-pump',  workerSelectPump);
router.get('/history',       workerHistory);

module.exports = router;
