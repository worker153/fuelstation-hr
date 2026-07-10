const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { getRecords, createRecord, deleteRecord } = require('../controllers/maintenanceController');

router.use(protect);
router.get('/',       getRecords);
router.post('/',      createRecord);
router.delete('/:id', deleteRecord);

module.exports = router;
