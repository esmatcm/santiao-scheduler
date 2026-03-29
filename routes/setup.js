const express = require('express');
const router  = express.Router();
const setup   = require('../lib/setup');

router.get('/status', (req, res) => {
  res.json(setup.getState());
});

router.post('/check-adb', async (req, res) => {
  try { res.json(await setup.checkAdb()); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/check-device', async (req, res) => {
  try { res.json(await setup.checkDevice()); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/install-santiao', async (req, res) => {
  try { res.json(await setup.installSantiao()); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/launch-verify', async (req, res) => {
  try { res.json(await setup.launchAndVerify()); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/install-ime', async (req, res) => {
  try { res.json(await setup.installIme()); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/verify', async (req, res) => {
  try { res.json(await setup.verify()); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/force-complete', (req, res) => {
  // Allow user to skip into dashboard even if verify didn't fully pass
  // (e.g. user hasn't logged into Santiao yet but wants to configure schedules)
  const state = setup.getState();
  if (!state.completed) {
    // Use internal saveState — need to expose it
    setup.forceComplete();
  }
  res.json({ ok: true });
});

router.post('/reset', (req, res) => {
  res.json(setup.reset());
});

module.exports = router;
