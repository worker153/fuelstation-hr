const express = require('express');
const router  = express.Router();
const { protect }           = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const { upload }            = require('../middleware/upload');
const {
  getGuarantors, getGuarantor, addGuarantor, updateGuarantor, deleteGuarantor,
  uploadGuarantorSignature, addGuarantorHousePhotos
} = require('../controllers/guarantorController');

router.use(protect, checkSubscription);

const guarantorFiles = upload.fields([
  { name: 'passportPhoto', maxCount: 1 },
  { name: 'idDocument',    maxCount: 1 }
]);

router.route('/:workerId/guarantors')
  .get(getGuarantors)
  .post(guarantorFiles, addGuarantor);

router.route('/:workerId/guarantors/:guarantorId')
  .get(getGuarantor)
  .put(guarantorFiles, updateGuarantor)
  .delete(deleteGuarantor);

router.post('/:workerId/guarantors/:guarantorId/signature',    upload.single('signature'),  uploadGuarantorSignature);
router.post('/:workerId/guarantors/:guarantorId/house-photos', upload.array('photos', 10), addGuarantorHousePhotos);

module.exports = router;
