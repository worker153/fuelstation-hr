const express = require('express');
const router = express.Router();
const {
  register, login, getMe,
  getAdminHint, pinLogin, setPin, setUserPin,
} = require('../controllers/authController');
const { protect }         = require('../middleware/auth');
const { superAdminOnly }  = require('../middleware/permissions');

router.post('/register', register);
router.post('/login',    login);
router.get('/me',        protect, getMe);

// PIN dashboard
router.get('/admin-hint/:userId',  getAdminHint);          // public — just name + company
router.post('/pin-login',          pinLogin);               // public — verify PIN
router.put('/pin',                 protect, setPin);        // own PIN
router.put('/pin/:userId',         protect, superAdminOnly, setUserPin); // admin sets for others

module.exports = router;
