const mongoose = require('mongoose');
const Shortage = require('../models/Shortage');
const Offence  = require('../models/Offence');

// GET /api/reports/staff-performance
// Returns top workers ranked by: absences, late arrivals, disciplinary actions
const getStaffPerformance = async (req, res) => {
  const cid = req.user.company._id;
  const { from, to, branchId, limit = 15 } = req.query;
  const top = Math.min(Number(limit) || 15, 50);

  const shortageMatch = { company: cid };
  const offenceMatch  = { company: cid };

  if (from || to) {
    const dateRange = {};
    if (from) dateRange.$gte = new Date(from);
    if (to)   dateRange.$lte = new Date(to + 'T23:59:59.999Z');
    shortageMatch.createdAt = dateRange;
    offenceMatch.date       = dateRange;
  }

  if (branchId && mongoose.isValidObjectId(branchId)) {
    shortageMatch.branchId = new mongoose.Types.ObjectId(branchId);
    offenceMatch.branchId  = new mongoose.Types.ObjectId(branchId);
  }

  const [absences, lateArrivals, disciplinary] = await Promise.all([
    Shortage.aggregate([
      { $match: { ...shortageMatch, reason: { $in: ['absent', 'no_clockin'] } } },
      {
        $group: {
          _id:        '$worker',
          workerName: { $first: '$workerName' },
          workerRole: { $first: '$workerRole' },
          branchName: { $first: '$branchName' },
          count:      { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: top },
    ]),

    Shortage.aggregate([
      { $match: { ...shortageMatch, reason: 'late_arrival' } },
      {
        $group: {
          _id:        '$worker',
          workerName: { $first: '$workerName' },
          workerRole: { $first: '$workerRole' },
          branchName: { $first: '$branchName' },
          count:      { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: top },
    ]),

    Offence.aggregate([
      { $match: offenceMatch },
      {
        $group: {
          _id:        '$worker',
          workerName: { $first: '$workerName' },
          workerRole: { $first: '$workerRole' },
          branchName: { $first: '$branch' },
          count:      { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: top },
    ]),
  ]);

  res.json({ success: true, data: { absences, lateArrivals, disciplinary } });
};

module.exports = { getStaffPerformance };
