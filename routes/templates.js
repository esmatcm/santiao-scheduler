const express = require('express');
const router = express.Router();
const { store, saveTemplates } = require('../lib/storage');

router.get('/', (req, res) => res.json(store.templates));

router.post('/', (req, res) => {
  const { name, message } = req.body;
  if (!name || !message) return res.status(400).json({ error: '缺少 name 或 message' });
  const tpl = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name, message,
    createdAt: new Date().toISOString(),
  };
  store.templates.push(tpl);
  saveTemplates();
  res.json(tpl);
});

router.delete('/:id', (req, res) => {
  const idx = store.templates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  store.templates.splice(idx, 1);
  saveTemplates();
  res.json({ ok: true });
});

module.exports = router;
