const express = require('express');
const router  = express.Router();
const { protect }    = require('../middleware/auth');
const { getOpsStats } = require('../controllers/dashboardController');

router.use(protect);
router.get('/ops', getOpsStats);

module.exports = router;
