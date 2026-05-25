const express = require('express');
const router  = express.Router();
const { protect }  = require('../middleware/auth');
const { upload }   = require('../middleware/upload');
const {
  getStats, getWorkers, getWorker, createWorker, updateWorker, deleteWorker,
  uploadSignature, updateAddressLocation,
  uploadVerificationDoc, deleteVerificationDoc, updateVerificationStatus,
  updateHouseVerification, deleteHousePhoto
} = require('../controllers/workerController');

router.use(protect);

router.get('/stats', getStats);

router.route('/')
  .get(getWorkers)
  .post(upload.single('passportPhoto'), createWorker);

router.route('/:id')
  .get(getWorker)
  .put(upload.single('passportPhoto'), updateWorker)
  .delete(deleteWorker);

// Signature
router.post('/:id/signature', upload.single('signature'), uploadSignature);

// Address location (Places API)
router.put('/:id/address-location', updateAddressLocation);

// Verification docs
router.post('/:id/verification',           upload.single('document'), uploadVerificationDoc);
router.delete('/:id/verification/:docId',  deleteVerificationDoc);
router.put('/:id/verification-status',     updateVerificationStatus);

// House
router.put('/:id/house', upload.array('photos', 10), updateHouseVerification);
router.delete('/:id/house/photos/:photoId', deleteHousePhoto);

module.exports = router;
