const PumpIsland      = require('../models/PumpIsland');
const Pump            = require('../models/Pump');
const PumpAssignment  = require('../models/PumpAssignment');
const { redistributeIslands } = require('../services/pumpService');

const getIslands = async (req, res) => {
  const cid = req.user.company._id;
  const filter = { company: cid };
  if (req.query.branchId) filter.branchId = req.query.branchId;
  const islands = await PumpIsland.find(filter)
    .sort({ branchId: 1, rotationOrder: 1 })
    .populate('pumps', 'pumpNumber pumpName productType status')
    .lean();
  res.json({ success: true, data: islands });
};

const createIsland = async (req, res) => {
  const cid = req.user.company._id;
  const { name, branchId, branchName, pumps, productTypes, includesGas, rotationOrder, maxWorkers, status, notes, fixedWorkerId, fixedWorkerName } = req.body;
  if (!name)     return res.status(400).json({ success: false, message: 'name is required' });
  if (!branchId) return res.status(400).json({ success: false, message: 'branchId is required' });

  const island = await PumpIsland.create({
    company: cid, name, branchId, branchName,
    pumps: pumps || [],
    productTypes: productTypes || [],
    includesGas: !!includesGas,
    rotationOrder: rotationOrder ?? 0,
    maxWorkers: maxWorkers ?? 1,
    status: status || 'active',
    notes,
    fixedWorkerId:   fixedWorkerId   || null,
    fixedWorkerName: fixedWorkerName || '',
  });

  const populated = await PumpIsland.findById(island._id)
    .populate('pumps', 'pumpNumber pumpName productType status').lean();
  res.status(201).json({ success: true, data: populated });
};

const updateIsland = async (req, res) => {
  const cid = req.user.company._id;
  const island = await PumpIsland.findOne({ _id: req.params.id, company: cid });
  if (!island) return res.status(404).json({ success: false, message: 'Island not found' });

  const fields = ['name', 'pumps', 'productTypes', 'includesGas', 'rotationOrder', 'maxWorkers', 'status', 'notes', 'fixedWorkerName'];
  fields.forEach(f => { if (req.body[f] !== undefined) island[f] = req.body[f]; });
  if (req.body.fixedWorkerId !== undefined)
    island.fixedWorkerId = req.body.fixedWorkerId || null;
  await island.save();

  const populated = await PumpIsland.findById(island._id)
    .populate('pumps', 'pumpNumber pumpName productType status').lean();
  res.json({ success: true, data: populated });
};

const deleteIsland = async (req, res) => {
  const cid = req.user.company._id;
  await PumpIsland.deleteOne({ _id: req.params.id, company: cid });
  res.json({ success: true });
};

/**
 * PATCH /api/pump-islands/:id/status
 * Supervisor marks an island unavailable (faulty / out_of_stock) or restores it (active) mid-day.
 *
 * Going DOWN  → worker assigned there today is moved to another available island;
 *               original island is stored in displacedFromIsland on their assignment.
 * Coming BACK → displaced worker gets the restored island added as pinnedIslands (a second island);
 *               redistributeIslands skips it so no one else gets double-assigned.
 */
const setIslandStatus = async (req, res) => {
  try {
    const cid    = req.user.company._id;
    const { status } = req.body;
    const VALID  = ['active', 'inactive', 'out_of_stock', 'faulty'];
    if (!VALID.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status' });

    const island = await PumpIsland.findOne({ _id: req.params.id, company: cid });
    if (!island) return res.status(404).json({ success: false, message: 'Island not found' });

    const prevStatus = island.status;
    const goingDown  = status !== 'active' && prevStatus === 'active';
    const comingBack = status === 'active'  && prevStatus !== 'active';

    island.status = status;
    await island.save();

    const today = new Date().toISOString().slice(0, 10);

    // ── Island going DOWN mid-day ──────────────────────────────────────────────
    if (goingDown) {
      const assignment = await PumpAssignment.findOne({
        company: cid, island: island._id, date: today,
        status: { $ne: 'cancelled' },
      });

      if (assignment) {
        // Find another active island with space (or any island as overflow)
        const activeIslands = await PumpIsland.find({
          company: cid, branchId: island.branchId,
          status: 'active', _id: { $ne: island._id },
        }).sort({ isPriority: -1, rotationOrder: 1 }).lean();

        // Count workers already on each island today
        const others = await PumpAssignment.find({
          company: cid, branchId: island.branchId, date: today,
          status: { $ne: 'cancelled' }, worker: { $ne: assignment.worker },
        }).lean();
        const islandCount = {};
        others.forEach(a => {
          if (a.island) islandCount[String(a.island)] = (islandCount[String(a.island)] || 0) + 1;
        });

        // Prefer uncovered islands, then under-capacity, then overflow
        const newIsland =
          activeIslands.find(i => (islandCount[String(i._id)] || 0) === 0) ||
          activeIslands.find(i => (islandCount[String(i._id)] || 0) < i.maxWorkers) ||
          activeIslands[0];

        if (newIsland) {
          const workerIdx = islandCount[String(newIsland._id)] || 0;
          const pumpId    = newIsland.pumps?.[workerIdx] ?? newIsland.pumps?.[0];
          const pump      = pumpId ? await Pump.findById(pumpId).lean() : null;

          assignment.island                = newIsland._id;
          assignment.islandName            = newIsland.name;
          assignment.pump                  = pump?._id   ?? null;
          assignment.pumpNumber            = pump?.pumpNumber ?? null;
          assignment.pumpName              = pump?.pumpName || newIsland.name;
          assignment.productType           = pump?.productType || (newIsland.productTypes || [])[0] || 'PMS';
          assignment.includesGas           = newIsland.includesGas;
          assignment.productTypes          = newIsland.productTypes || [];
          assignment.isOverride            = true;
          assignment.overrideReason        = `Moved from ${island.name}: ${status === 'faulty' ? 'pump faulty' : 'out of fuel'}`;
          assignment.displacedFromIsland   = island._id;
          await assignment.save();

          await redistributeIslands({ company: cid, branchId: island.branchId, date: today });
        }
      }
    }

    // ── Island coming BACK UP ─────────────────────────────────────────────────
    if (comingBack) {
      const displaced = await PumpAssignment.findOne({
        company: cid, branchId: island.branchId, date: today,
        status: { $ne: 'cancelled' },
        displacedFromIsland: island._id,
      });

      if (displaced) {
        // Load the pumps on the restored island
        const pumpDocs = (
          await Promise.all((island.pumps || []).map(pid => Pump.findById(pid).lean()))
        ).filter(Boolean);

        const alreadyPinned = (displaced.pinnedIslands || []).some(
          pi => String(pi.island) === String(island._id)
        );
        if (!alreadyPinned) {
          displaced.pinnedIslands = displaced.pinnedIslands || [];
          displaced.pinnedIslands.push({
            island:       island._id,
            islandName:   island.name,
            includesGas:  island.includesGas,
            productTypes: island.productTypes || [],
            assignedPumps: pumpDocs.map(p => ({
              pumpId: p._id, pumpNumber: p.pumpNumber,
              pumpName: p.pumpName, productType: p.productType,
            })),
          });
        }
        displaced.displacedFromIsland = null;
        await displaced.save();
      }

      // Redistribute secondary coverage now that island is active again
      await redistributeIslands({ company: cid, branchId: island.branchId, date: today });
    }

    const populated = await PumpIsland.findById(island._id)
      .populate('pumps', 'pumpNumber pumpName productType status').lean();
    res.json({ success: true, data: populated });
  } catch (err) {
    console.error('setIslandStatus', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getIslands, createIsland, updateIsland, deleteIsland, setIslandStatus };
