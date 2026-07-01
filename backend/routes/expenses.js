const router = require('express').Router();
const { protect }           = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const { requirePermission } = require('../middleware/permissions');
const { getExpenses, createExpense, updateExpense, deleteExpense } = require('../controllers/expenseController');

router.use(protect, checkSubscription);

router.get('/',     requirePermission('manageBranches'), getExpenses);
router.post('/',    requirePermission('manageBranches'), createExpense);
router.put('/:id',  requirePermission('manageBranches'), updateExpense);
router.delete('/:id', requirePermission('manageBranches'), deleteExpense);

module.exports = router;
