const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { getIslands, createIsland, updateIsland, deleteIsland } = require('../controllers/pumpIslandController');

router.use(protect);
router.get('/',        getIslands);
router.post('/',       createIsland);
router.put('/:id',     updateIsland);
router.delete('/:id',  deleteIsland);

module.exports = router;
