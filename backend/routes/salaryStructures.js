const express = require('express');
const router  = express.Router();
const { protect }            = require('../middleware/auth');
const { checkSubscription }  = require('../middleware/subscription');
const {
  getStructures, getStructure, createStructure, updateStructure,
  deleteStructure, assignWorkers, unassignWorker,
} = require('../controllers/salaryStructureController');

router.use(protect, checkSubscription);

router.get('/',                          getStructures);
router.get('/:id',                       getStructure);
router.post('/',                         createStructure);
router.put('/:id',                       updateStructure);
router.delete('/:id',                    deleteStructure);
router.post('/:id/assign',               assignWorkers);
router.delete('/workers/:workerId/unassign', unassignWorker);

module.exports = router;
