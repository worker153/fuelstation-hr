const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { checkSubscription }  = require('../middleware/subscription');
const { upload }   = require('../middleware/upload');
const { requirePermission } = require('../middleware/permissions');
const {
  getStats, getWorkers, getWorker, createWorker, updateWorker, deleteWorker,
  uploadSignature, updateAddressLocation,
  uploadVerificationDoc, deleteVerificationDoc, updateVerificationStatus,
  updateHouseVerification, deleteHousePhoto,
  submitForApproval, approveWorker, rejectWorker, getApprovalQueue,
  updateRegistrationDate, updateResumptionDate,
  uploadAuthorisedSignature, uploadCompanyStamp,
  getActiveWorkers,
  activateWorker, suspendWorker, sackWorker, reactivateWorker, transferWorker,
  updateSalary, updateBank,
  updateWorkerPin, updateRotationSchedule, updateClockInRequired, updateAlwaysPresent, updateAutoClockIn,
  getWorkerPins, bulkGeneratePins,
  selfResetPin, searchByName,
} = require('../controllers/workerController');

// ── Public routes (NO auth required — before protect) ─────────────────────────
router.get('/search-by-name', searchByName);
router.post('/self-reset-pin', selfResetPin);

router.use(protect, checkSubscription);

// ── Named routes BEFORE /:id ──────────────────────────────────────────────────
router.get('/stats',           getStats);
router.get('/approval-queue',  getApprovalQueue);
router.get('/active-workers',  getActiveWorkers);
router.get('/pins',            adminOnly, getWorkerPins);
router.post('/bulk-generate-pins', adminOnly, bulkGeneratePins);

// ── Collection ────────────────────────────────────────────────────────────────
router.route('/')
  .get(getWorkers)
  .post(upload.single('passportPhoto'), createWorker);

// ── Single worker CRUD ────────────────────────────────────────────────────────
router.route('/:id')
  .get(getWorker)
  .put(upload.single('passportPhoto'), updateWorker)
  .delete(deleteWorker);

// ── Signature ─────────────────────────────────────────────────────────────────
router.post('/:id/signature',             upload.single('signature'), uploadSignature);
router.put('/:id/registration-date',      adminOnly, updateRegistrationDate);
router.put('/:id/pin',                    adminOnly, updateWorkerPin);
router.put('/:id/resumption',             updateResumptionDate);
router.post('/:id/authorised-signature',  upload.single('signature'), uploadAuthorisedSignature);
router.post('/:id/company-stamp',         upload.single('stamp'),     uploadCompanyStamp);

// ── Address ───────────────────────────────────────────────────────────────────
router.put('/:id/address-location', updateAddressLocation);

// ── Verification docs ─────────────────────────────────────────────────────────
router.post('/:id/verification',           upload.single('document'), uploadVerificationDoc);
router.delete('/:id/verification/:docId',  deleteVerificationDoc);
router.put('/:id/verification-status',     updateVerificationStatus);

// ── House ─────────────────────────────────────────────────────────────────────
router.put('/:id/house',                   upload.array('photos', 10), updateHouseVerification);
router.delete('/:id/house/photos/:photoId',deleteHousePhoto);

// ── Approval workflow ─────────────────────────────────────────────────────────
router.post('/:id/submit-approval', submitForApproval);
router.post('/:id/approve',         adminOnly, approveWorker);
router.post('/:id/reject',          adminOnly, rejectWorker);

// ── Employment management ─────────────────────────────────────────────────────
router.post('/:id/activate',   requirePermission('editWorkers'), activateWorker);
router.post('/:id/suspend',    requirePermission('editWorkers'), suspendWorker);
router.post('/:id/sack',       requirePermission('editWorkers'), sackWorker);
router.post('/:id/reactivate', requirePermission('editWorkers'), reactivateWorker);
router.post('/:id/transfer',   requirePermission('editWorkers'), transferWorker);
router.put('/:id/salary',             requirePermission('editWorkers'), updateSalary);
router.put('/:id/bank',               requirePermission('editWorkers'), updateBank);
router.put('/:id/rotation-schedule',   adminOnly, updateRotationSchedule);
router.put('/:id/clock-in-required',   requirePermission('editWorkers'), updateClockInRequired);
router.put('/:id/always-present',      requirePermission('editWorkers'), updateAlwaysPresent);
router.put('/:id/auto-clock-in',       requirePermission('editWorkers'), updateAutoClockIn);
router.delete('/:id/face',             adminOnly, async (req, res) => {
  const Worker = require('../models/Worker');
  const worker = await Worker.findOneAndUpdate(
    { _id: req.params.id, company: req.user.company._id },
    { $unset: { faceDescriptor: '', faceRegisteredAt: '', faceRegisteredOn: '' } },
    { new: true }
  );
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });
  res.json({ success: true, message: 'Face data cleared — worker can re-register on next clock-in' });
});

module.exports = router;
