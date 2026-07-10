const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { getRecords, createRecord, updateRecord, deleteRecord } = require('../controllers/maintenanceController');

router.use(protect);
router.get('/',        getRecords);
router.post('/',       createRecord);
router.put('/:id',     updateRecord);
router.delete('/:id',  deleteRecord);

module.exports = router;
