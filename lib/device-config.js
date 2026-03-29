/**
 * Device auto-detection & ratio-based coordinate helper.
 *
 * Call `init()` once at startup (before scheduler).  If a device is connected
 * it reads screen size, density and status-bar height automatically.
 * If detection fails the reference device values (1220×2712, offset 104) are
 * used so existing behaviour is preserved.
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const { getAdbPath } = require('./adb-path');

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Reference device (current known-good device: 34b92d38, 1220×2712)
// ---------------------------------------------------------------------------
const REF = {
  serial: '34b92d38',
  width: 1220,
  height: 2712,
  statusBar: 104,
  homePackage: 'com.miui.home',
};

// ---------------------------------------------------------------------------
// Ratio constants — derived from reference device pixel values
// ---------------------------------------------------------------------------
const RATIOS = {
  // FALLBACK_SEARCH_COORDS  { x: 300, y: 2450 }
  searchBar:        { rx: 300 / REF.width, ry: 2450 / REF.height },
  // Search result first item  { x: 400, y: 320 }
  searchResult:     { rx: 400 / REF.width, ry: 320 / REF.height },
  // Image button fallback  { x: 457, y: 2082 }
  imageButton:      { rx: 457 / REF.width, ry: 2082 / REF.height },
  // Chat input fallback  { x: 500, y: 2500 }
  chatInput:        { rx: 500 / REF.width, ry: 2500 / REF.height },
  // Swipe to scroll top: from (600,800) to (600,1800)
  swipeScrollTop:   {
    rx: 600 / REF.width,
    ryFrom: 800 / REF.height,
    ryTo: 1800 / REF.height,
  },
};

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------
const config = {
  serial: '',
  width: REF.width,
  height: REF.height,
  statusBar: REF.statusBar,
  homePackage: REF.homePackage,
  ready: false,
};

function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}][DeviceConfig] ${msg}`);
}

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------

async function adb(args, timeout = 8000) {
  const adbBin = getAdbPath();
  if (!adbBin) throw new Error('ADB not available');
  const { stdout } = await execFileAsync(adbBin, args, { timeout });
  return stdout.trim();
}

async function adbShell(serial, cmd, timeout = 8000) {
  return adb(['-s', serial, 'shell', cmd], timeout);
}

/** Pick device serial: env > only-connected > reference fallback */
async function detectSerial() {
  // Respect explicit env override
  if (process.env.ADB_DEVICE_SERIAL) return process.env.ADB_DEVICE_SERIAL;

  const raw = await adb(['devices']);
  const lines = raw.split('\n').slice(1); // skip header
  const devices = [];
  for (const line of lines) {
    const m = line.match(/^(\S+)\s+device$/);
    if (m) devices.push(m[1]);
  }

  if (devices.length === 0) return null;
  if (devices.length === 1) return devices[0];

  // Multiple devices — prefer reference if present, else first
  if (devices.includes(REF.serial)) return REF.serial;
  return devices[0];
}

/** Read screen physical size via `wm size` */
async function detectScreenSize(serial) {
  const out = await adbShell(serial, 'wm size');
  // "Physical size: 1220x2712"  or  "Override size: ..."
  // Use override if present, else physical
  const override = out.match(/Override size:\s*(\d+)x(\d+)/);
  if (override) return { w: +override[1], h: +override[2] };
  const physical = out.match(/Physical size:\s*(\d+)x(\d+)/);
  if (physical) return { w: +physical[1], h: +physical[2] };
  return null;
}

/** Detect status bar height in px */
async function detectStatusBar(serial) {
  // Method 1: dumpsys window (works on most devices)
  try {
    const raw = await adbShell(serial, 'dumpsys window windows | grep StatusBar', 10000);
    // Look for frame like [0,0][1220,104]
    const m = raw.match(/StatusBar[^[]*\[0,0\]\[\d+,(\d+)\]/);
    if (m) return +m[1];
  } catch {}

  // Method 2: resource dimension
  try {
    const raw = await adbShell(serial,
      'dumpsys window | grep -i "status.bar" | head -5', 10000);
    const m = raw.match(/statusBarHeight=(\d+)/i);
    if (m) return +m[1];
  } catch {}

  return null;
}

/** Detect default launcher package */
async function detectHomePackage(serial) {
  try {
    const raw = await adbShell(serial,
      'cmd shortcut get-default-launcher 2>/dev/null || dumpsys package resolvers | grep "android.intent.category.HOME" -A 5 | head -10');
    const m = raw.match(/ComponentInfo\{([^/]+)\//);
    if (m) return m[1];
  } catch {}
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Initialise device config. Safe to call — never throws. */
async function init() {
  try {
    const serial = await detectSerial();
    if (!serial) {
      log('No device connected — using reference defaults');
      config.ready = false;
      return config;
    }
    config.serial = serial;
    log(`Device: ${serial}${serial === REF.serial ? ' (reference)' : ''}`);

    const size = await detectScreenSize(serial).catch(() => null);
    if (size) {
      config.width = size.w;
      config.height = size.h;
      log(`Screen: ${size.w}×${size.h}`);
    } else {
      log(`Screen detection failed — using reference ${REF.width}×${REF.height}`);
    }

    const sb = await detectStatusBar(serial).catch(() => null);
    if (sb !== null) {
      config.statusBar = sb;
      log(`Status bar: ${sb}px`);
    } else {
      log(`Status bar detection failed — using reference ${REF.statusBar}px`);
    }

    const home = await detectHomePackage(serial).catch(() => null);
    if (home) {
      config.homePackage = home;
      log(`Home package: ${home}`);
    } else {
      log(`Home package detection failed — using reference ${REF.homePackage}`);
    }

    config.ready = true;
  } catch (e) {
    log(`Init error: ${e.message} — using reference defaults`);
  }
  return config;
}

/** Re-detect (e.g. after plugging in a different device) */
async function reinit() {
  config.serial = '';
  config.width = REF.width;
  config.height = REF.height;
  config.statusBar = REF.statusBar;
  config.homePackage = REF.homePackage;
  config.ready = false;
  return init();
}

/** Convert a ratio pair to pixel coords for the current device */
function coords(ratioKey) {
  const r = RATIOS[ratioKey];
  if (!r) throw new Error(`Unknown ratio key: ${ratioKey}`);
  if ('ryFrom' in r) {
    // Swipe-type ratio
    return {
      x: Math.round(r.rx * config.width),
      yFrom: Math.round(r.ryFrom * config.height),
      yTo: Math.round(r.ryTo * config.height),
    };
  }
  return {
    x: Math.round(r.rx * config.width),
    y: Math.round(r.ry * config.height),
  };
}

/**
 * Compute the statusBarOffset for dumpsys fallback parsing.
 * On the reference device: rootBottom <= 2500 → offset = 104.
 * Generalised: threshold = height - 212 (2712 - 212 = 2500).
 */
function statusBarThreshold() {
  return config.height - 212;
}

module.exports = {
  config,
  init,
  reinit,
  coords,
  statusBarThreshold,
  REF,
};
