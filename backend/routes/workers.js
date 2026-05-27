const express = require('express');
const router  = express.Router();
const { protect }  = require('../middleware/auth');
const { upload }   = require('../middleware/upload');
const { superAdminOnly, requirePermission } = require('../middleware/permissions');
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
  updateSalary, updateBank
} = require('../controllers/workerController');

router.use(protect);

// ── Named routes BEFORE /:id ──────────────────────────────────────────────────
router.get('/stats',          getStats);
router.get('/approval-queue', getApprovalQueue);
router.get('/active-workers', getActiveWorkers);

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
router.put('/:id/registration-date',      superAdminOnly, updateRegistrationDate);
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
router.post('/:id/approve',         superAdminOnly, approveWorker);
router.post('/:id/reject',          superAdminOnly, rejectWorker);

// ── Employment management ─────────────────────────────────────────────────────
router.post('/:id/activate',   requirePermission('editWorkers'), activateWorker);
router.post('/:id/suspend',    requirePermission('editWorkers'), suspendWorker);
router.post('/:id/sack',       requirePermission('editWorkers'), sackWorker);
router.post('/:id/reactivate', requirePermission('editWorkers'), reactivateWorker);
router.post('/:id/transfer',   requirePermission('editWorkers'), transferWorker);
router.put('/:id/salary',      requirePermission('editWorkers'), updateSalary);
router.put('/:id/bank',        requirePermission('editWorkers'), updateBank);

module.exports = router;
