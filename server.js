const express = require('express');
const path    = require('path');
const deviceConfig = require('./lib/device-config');
const setup = require('./lib/setup');

const app  = express();
const PORT = 3456;

app.use(express.json());

// Setup wizard redirect — if setup not complete, redirect / to /setup.html
app.use((req, res, next) => {
  if (
    req.method === 'GET' &&
    (req.path === '/' || req.path === '/index.html') &&
    !setup.isComplete() &&
    req.accepts('html')
  ) {
    return res.redirect('/setup.html');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Setup API (before other routes)
app.use('/api/setup',      require('./routes/setup'));
app.use('/api/groups',     require('./routes/groups'));
app.use('/api/tasks',      require('./routes/tasks'));
app.use('/api/logs',       require('./routes/logs'));
app.use('/api/templates',  require('./routes/templates'));
app.use('/api',            require('./routes/misc'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true, device: deviceConfig.config?.serial || null, uptime: process.uptime() });
});

// Auto-detect device, then init cron jobs, then start listening
(async () => {
  try {
    await deviceConfig.init();
  } catch (e) {
    console.log(`[DeviceConfig] Init skipped: ${e.message}`);
  }
  require('./lib/scheduler').initScheduler();
  app.listen(PORT, () => console.log(`三条定时发送工具运行在 http://localhost:${PORT}`));
})();
