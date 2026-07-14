require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');

const authRoutes      = require('./routes/auth');
const workerRoutes    = require('./routes/workers');
const guarantorRoutes = require('./routes/guarantors');
const staffRoutes     = require('./routes/staff');
const branchRoutes    = require('./routes/branches');
const shiftRoutes     = require('./routes/shifts');
const payrollRoutes    = require('./routes/payroll');
const shortageRoutes   = require('./routes/shortages');
const deviceRoutes     = require('./routes/devices');
const attendanceRoutes = require('./routes/attendance');
const breakRoutes      = require('./routes/breaks');
const offenceRoutes    = require('./routes/offences');
const dashboardRoutes  = require('./routes/dashboard');
const platformRoutes      = require('./routes/platform');
const workerPortalRoutes  = require('./routes/workerPortal');
const restroomRoutes      = require('./routes/restroom');
const documentRoutes      = require('./routes/documents');
const pushRoutes               = require('./routes/push');
const stationIntegrationRoutes = require('./routes/stationIntegrations');
const pumpShiftRoutes          = require('./routes/pumpShifts');
const pumpRoutes               = require('./routes/pumps');
const pumpAssignmentRoutes     = require('./routes/pumpAssignments');
const pumpIslandRoutes         = require('./routes/pumpIslands');
const expenseRoutes            = require('./routes/expenses');
const pdfShareRoutes           = require('./routes/pdfShare');
const maintenanceRoutes        = require('./routes/maintenance');
const pumpRotationRoutes       = require('./routes/pumpRotation');

const app = express();

connectDB();

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

app.use('/api/auth',     authRoutes);
app.use('/api/workers',  workerRoutes);
app.use('/api/workers',  guarantorRoutes);
app.use('/api/staff',    staffRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/shifts',   shiftRoutes);
app.use('/api/payroll',  payrollRoutes);
app.use('/api/shortages',  shortageRoutes);
app.use('/api/devices',    deviceRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/breaks',     breakRoutes);
app.use('/api/offences',   offenceRoutes);
app.use('/api/dashboard',  dashboardRoutes);
app.use('/api/platform',   platformRoutes);
app.use('/api/worker',    workerPortalRoutes);
app.use('/api/restroom',  restroomRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/push',               pushRoutes);
app.use('/api/station-integrations', stationIntegrationRoutes);
app.use('/api/pump-shifts',          pumpShiftRoutes);
app.use('/api/pumps',               pumpRoutes);
app.use('/api/pump-assignments',    pumpAssignmentRoutes);
app.use('/api/pump-islands',       pumpIslandRoutes);
app.use('/api/expenses',           expenseRoutes);
app.use('/api/pdf-share',          pdfShareRoutes);
app.use('/api/maintenance',        maintenanceRoutes);
app.use('/api/pump-rotation-groups', pumpRotationRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'FuelStation HR API is running' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);

  // Start absence cron — runs daily at 01:00 UTC (02:00 WAT)
  // Automatically deducts no-show workers; respects rotation schedules
  const { startAbsenceCron } = require('./jobs/absenceCron');
  startAbsenceCron();

  // Start break cron — runs every 5 min; detects overstays + missed break windows
  const { startBreakCron } = require('./jobs/breakCron');
  startBreakCron();

  // Start auto clock-in cron — runs daily at 06:00 UTC (07:00 WAT)
  const { start: startAutoClockIn } = require('./jobs/autoClockInCron');
  startAutoClockIn();
});
