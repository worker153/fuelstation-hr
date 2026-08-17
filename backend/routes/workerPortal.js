const router = require('express').Router();
const { workerPortalAuth, workerChangePin, bookOffence, workerSelectPump, workerHistory, workerClockOut } = require('../controllers/workerPortalController');

// Public — authenticated by PIN (no JWT required)
router.post('/auth',         workerPortalAuth);
router.post('/change-pin',   workerChangePin);
router.post('/book-offence', bookOffence);
router.post('/select-pump',  workerSelectPump);
router.get('/history',       workerHistory);
router.post('/clock-out',    workerClockOut);

module.exports = router;
