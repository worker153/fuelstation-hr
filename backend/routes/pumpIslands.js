const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { getIslands, createIsland, updateIsland, deleteIsland, setIslandStatus } = require('../controllers/pumpIslandController');

router.use(protect);
router.get('/',              getIslands);
router.post('/',             createIsland);
router.put('/:id',           updateIsland);
router.patch('/:id/status',  setIslandStatus);
router.delete('/:id',        deleteIsland);

module.exports = router;
