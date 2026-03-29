const express = require('express');
const { execFile } = require('child_process');
const { promisify } = require('util');
const router = express.Router();

const { sh, DEVICE, getDeviceStatus, deviceConfig } = require('../lib/adb');
const { getAdbPath } = require('../lib/adb-path');
const { sseClients, taskQueue, getCurrentTask } = require('../lib/scheduler');

const execFileAsync = promisify(execFile);

// SSE real-time stream
router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('event: connected\ndata: {}\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// Device status
router.get('/status', async (req, res) => {
  res.json(await getDeviceStatus(taskQueue, getCurrentTask()));
});

// Screenshot
router.get('/screenshot', async (req, res) => {
  const fs = require('fs');
  const tmpFile = `/tmp/phone_screen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.png`;
  try {
    await sh('screencap -p /sdcard/screen.png');
    await execFileAsync(getAdbPath(), ['-s', DEVICE(), 'pull', '/sdcard/screen.png', tmpFile], { timeout: 10000 });
    res.sendFile(tmpFile, () => {
      try { fs.unlinkSync(tmpFile); } catch {}
    });
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch {}
    res.status(500).json({ error: err.message });
  }
});

// Device config info (screen size, status bar, serial, etc.)
router.get('/device', (req, res) => {
  res.json(deviceConfig.config);
});

// Re-detect device (e.g. after plugging in a different phone)
router.post('/device/reinit', async (req, res) => {
  const cfg = await deviceConfig.reinit();
  res.json(cfg);
});

module.exports = router;
