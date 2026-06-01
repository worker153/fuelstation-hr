const express = require('express');
const router  = express.Router();
const { protect }           = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const {
  getDocuments, getDocument, createDocument, updateDocument,
  publishDocument, deleteDocument, getSignatures,
  signDocument, getWorkerDocuments, readDocument,
} = require('../controllers/documentController');

// ── Public — PIN authenticated (workers) ─────────────────────────────────────
router.get('/worker',        getWorkerDocuments);
router.get('/:id/read',      readDocument);
router.post('/:id/sign',     signDocument);

// ── Protected — admin / supervisor ───────────────────────────────────────────
router.use(protect, checkSubscription);
router.get('/',                getDocuments);
router.get('/:id',             getDocument);
router.get('/:id/signatures',  getSignatures);
router.post('/',               createDocument);
router.put('/:id',             updateDocument);
router.post('/:id/publish',    publishDocument);
router.delete('/:id',          deleteDocument);

module.exports = router;
