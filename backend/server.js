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

const app = express();

connectDB();

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
});
