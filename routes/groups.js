const express = require('express');
const router = express.Router();
const { store, saveGroups } = require('../lib/storage');

// SSE clients for scan progress
const scanClients = new Set();

// Heartbeat: every 30s send a comment to detect dead connections
setInterval(() => {
  for (const res of scanClients) {
    try { res.write(': heartbeat\n\n'); } catch { scanClients.delete(res); }
  }
}, 30000);

router.get('/', (req, res) => res.json(store.groups));

router.post('/', (req, res) => {
  const { name } = req.body;
  if (name && !store.groups.includes(name)) { store.groups.push(name); saveGroups(); }
  res.json(store.groups);
});

// Batch add groups (from scan results)
router.post('/batch', (req, res) => {
  const { names } = req.body;
  if (!Array.isArray(names)) return res.status(400).json({ error: 'names must be an array' });
  let added = 0;
  for (const name of names) {
    if (name && typeof name === 'string' && !store.groups.includes(name)) {
      store.groups.push(name);
      added++;
    }
  }
  if (added > 0) saveGroups();
  res.json({ added, groups: store.groups });
});

router.delete('/:name', (req, res) => {
  store.groups = store.groups.filter(g => g !== decodeURIComponent(req.params.name));
  saveGroups();
  res.json(store.groups);
});

// SSE endpoint for scan progress
router.get('/scan/progress', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('event: connected\ndata: {}\n\n');
  scanClients.add(res);
  req.on('close', () => scanClients.delete(res));
});

function sendScanProgress(msg) {
  for (const client of scanClients) {
    client.write(`event: progress\ndata: ${JSON.stringify({ message: msg })}\n\n`);
  }
}

// Scan groups from phone — Promise-based lock to prevent race conditions
let scanLock = null;

router.post('/scan', async (req, res) => {
  if (scanLock) {
    return res.status(409).json({ ok: false, error: '扫描正在进行中，请等待完成' });
  }

  let releaseLock;
  scanLock = new Promise(resolve => { releaseLock = resolve; });

  const { scanGroups } = require('../lib/adb');

  try {
    sendScanProgress('开始扫描...');
    const maxScrolls = parseInt(req.body?.maxScrolls) || 3;
    const foundGroups = await scanGroups(sendScanProgress, maxScrolls);

    // Auto-add discovered groups that aren't already in the list
    let added = 0;
    for (const name of foundGroups) {
      if (!store.groups.includes(name)) {
        store.groups.push(name);
        added++;
      }
    }
    if (added > 0) saveGroups();

    sendScanProgress(`扫描完成！发现 ${foundGroups.length} 个群聊，新增 ${added} 个`);

    res.json({
      ok: true,
      found: foundGroups,
      added,
      total: store.groups.length,
      groups: store.groups,
    });
  } catch (e) {
    sendScanProgress(`扫描出错: ${e.message}`);
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    scanLock = null;
    releaseLock();
  }
});

module.exports = router;
