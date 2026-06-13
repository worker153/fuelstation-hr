const Pump           = require('../models/Pump');
const PumpAssignment = require('../models/PumpAssignment');

/**
 * Auto-assign a pump to a worker on clock-in.
 * Rotation: each worker is assigned the NEXT pump after their last assignment.
 * Returns the PumpAssignment document, or null if no active pumps exist.
 */
async function autoAssignPump({ company, branchId, branchName, worker, date, shiftName }) {
  // Get all active pumps for this branch, sorted by rotationOrder then pumpNumber
  const pumps = await Pump.find({ company, branchId, status: 'active' })
    .sort({ rotationOrder: 1, pumpNumber: 1 }).lean();
  if (!pumps.length) return null;

  // Already assigned today? Return existing
  const existing = await PumpAssignment.findOne({
    company, worker: worker._id, date, status: { $ne: 'cancelled' },
  }).lean();
  if (existing) return existing;

  // Find which pumps are already assigned to OTHER workers today
  const todayAssignments = await PumpAssignment.find({
    company, branchId, date, status: { $ne: 'cancelled' },
    worker: { $ne: worker._id },
  }).lean();
  const assignedPumpIds = new Set(todayAssignments.map(a => String(a.pump)));

  // Find worker's last assignment in this branch (any previous date)
  const lastAssignment = await PumpAssignment.findOne({
    company, branchId, worker: worker._id, date: { $lt: date },
  }).sort({ date: -1, createdAt: -1 }).lean();

  // Determine rotation starting index
  let startIndex = 0;
  if (lastAssignment) {
    const lastPumpIdx = pumps.findIndex(p => String(p._id) === String(lastAssignment.pump));
    if (lastPumpIdx >= 0) startIndex = (lastPumpIdx + 1) % pumps.length;
  }

  // Pick next available (not already assigned to someone else)
  let selectedPump = null;
  for (let i = 0; i < pumps.length; i++) {
    const candidate = pumps[(startIndex + i) % pumps.length];
    if (!assignedPumpIds.has(String(candidate._id))) {
      selectedPump = candidate;
      break;
    }
  }
  // All pumps taken — fall back to rotation anyway
  if (!selectedPump) selectedPump = pumps[startIndex % pumps.length];

  const assignment = await PumpAssignment.create({
    company, branchId, branchName,
    pump:        selectedPump._id,
    pumpNumber:  selectedPump.pumpNumber,
    pumpName:    selectedPump.pumpName,
    productType: selectedPump.productType,
    worker:      worker._id,
    workerName:  worker.fullName,
    workerRole:  worker.role,
    date, shiftName: shiftName || '',
    assignedAt: new Date(),
  });

  return assignment;
}

/**
 * Supervisor override — reassign a worker to a specific pump.
 */
async function overrideAssignment({ assignmentId, newPumpId, overrideBy, overrideByName, overrideReason, company }) {
  const assignment = await PumpAssignment.findOne({ _id: assignmentId, company });
  if (!assignment) throw new Error('Assignment not found');

  const newPump = await Pump.findOne({ _id: newPumpId, company }).lean();
  if (!newPump) throw new Error('Pump not found');

  assignment.pump          = newPump._id;
  assignment.pumpNumber    = newPump.pumpNumber;
  assignment.pumpName      = newPump.pumpName;
  assignment.productType   = newPump.productType;
  assignment.isOverride    = true;
  assignment.overrideBy    = overrideBy;
  assignment.overrideByName = overrideByName;
  assignment.overrideReason = overrideReason || '';
  await assignment.save();
  return assignment;
}

module.exports = { autoAssignPump, overrideAssignment };
