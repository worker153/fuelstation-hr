const router = require('express').Router();
const { protect, adminOnly } = require('../middleware/auth');
const { checkSubscription }  = require('../middleware/subscription');
const {
  getDevices, createDevice, getDevice, updateDevice,
  approveDevice, deactivateDevice, blockDevice, resetToken, deleteDevice,
  terminalRegister, terminalInfo, terminalWorkerSearch,
  terminalWorkerByPin, terminalRegisterFace,
} = require('../controllers/deviceController');

// ── Public terminal routes (no JWT — device token used instead) ───────────────
router.post('/terminal/register',      terminalRegister);
router.get('/terminal/info',           terminalInfo);
router.get('/terminal/workers',        terminalWorkerSearch);
router.get('/terminal/worker-by-pin',  terminalWorkerByPin);
router.post('/terminal/register-face', terminalRegisterFace);

// ── Protected routes (Super Admin + Admin) ────────────────────────────────────
router.use(protect, checkSubscription, adminOnly);

router.route('/')
  .get(getDevices)
  .post(createDevice);

router.route('/:id')
  .get(getDevice)
  .put(updateDevice)
  .delete(deleteDevice);

router.post('/:id/approve',     approveDevice);
router.post('/:id/deactivate',  deactivateDevice);
router.post('/:id/block',       blockDevice);
router.post('/:id/reset-token', resetToken);

module.exports = router;
