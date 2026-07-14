const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const {
  getGroups, createGroup, updateGroup, deleteGroup,
  seedAssignments, getPreview,
} = require('../controllers/pumpRotationController');

router.use(protect);

router.get('/',            getGroups);
router.post('/',           createGroup);
router.put('/:id',         updateGroup);
router.delete('/:id',      deleteGroup);
router.post('/:id/seed',   seedAssignments);
router.get('/:id/preview', getPreview);

module.exports = router;
