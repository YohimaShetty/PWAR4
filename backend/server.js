require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const createRateLimiter = require('./utils/rateLimiter');

const chatRoutes = require('./routes/chat');
const navigationRoutes = require('./routes/navigation');
const crowdRoutes = require('./routes/crowd');
const accessibilityRoutes = require('./routes/accessibility');
const sustainabilityRoutes = require('./routes/sustainability');
const incidentRoutes = require('./routes/incidents');
const volunteerRoutes = require('./routes/volunteers');
const analyticsRoutes = require('./routes/analytics');
const reportRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 5000;

// --- Core middleware ---
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Basic request logging (no external dependency)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    // eslint-disable-next-line no-console
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

// --- Rate limiting: stricter on AI-calling endpoints, since they cost tokens ---
const aiLimiter = createRateLimiter({ windowMs: 60000, max: 20 });
const generalLimiter = createRateLimiter({ windowMs: 60000, max: 120 });
app.use(generalLimiter);

// --- Static reference data for the frontend (gate/zone geometry, no secrets) ---
const stadiumMeta = require('./data/stadiumData.json');
app.get('/api/meta', (req, res) => {
  res.json({
    stadium: stadiumMeta.stadium,
    gates: stadiumMeta.gates,
    seatZoneMap: stadiumMeta.seatZoneMap,
    transportOptions: stadiumMeta.transportOptions,
  });
});

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    time: new Date().toISOString(),
  });
});

// --- API routes ---
app.use('/api/chat', aiLimiter, chatRoutes);
app.use('/api/navigation', navigationRoutes);
app.use('/api/crowd', crowdRoutes);
app.use('/api/accessibility', accessibilityRoutes);
app.use('/api/sustainability', sustainabilityRoutes);
app.use('/api/incidents', aiLimiter, incidentRoutes);
app.use('/api/volunteers', aiLimiter, volunteerRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportRoutes);

// --- Serve the frontend (single deploy: Express serves the static dashboard) ---
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// --- Centralized error handler ---
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[unhandled error]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// Only start listening when this file is run directly (node server.js),
// not when it's imported (e.g. by the Jest/Supertest test suite).
if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`StadiumMind AI backend running on port ${PORT}`);
    if (!process.env.GEMINI_API_KEY) {
      console.warn('WARNING: GEMINI_API_KEY is not set. AI-powered endpoints will return 503 until it is configured in .env');
    }
  });
}

module.exports = app;