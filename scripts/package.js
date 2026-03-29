/**
 * Platform-specific packaging script.
 *
 * Pre-requisite: place these files under vendor/:
 *   vendor/platform-tools-darwin/   (extracted from platform-tools-latest-darwin.zip)
 *   vendor/platform-tools-windows/  (extracted from platform-tools-latest-windows.zip)
 *   vendor/node-darwin-arm64/       (extracted node binary dir)
 *   vendor/node-windows-x64/        (extracted node dir)
 *
 * Usage:
 *   node scripts/package.js              # build for all platforms
 *   node scripts/package.js mac          # macOS only
 *   node scripts/package.js win          # Windows only
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const pkg  = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const NAME = pkg.name || 'santiao-scheduler';
const VER  = pkg.version || '1.0.0';
const DIST = path.join(ROOT, 'dist');
const VENDOR = path.join(ROOT, 'vendor');

// Files/dirs to exclude from app copy
const EXCLUDE = new Set([
  'node_modules', '.git', '.claude', 'dist', 'vendor',
  'server.log', 'logs.json', 'tasks.json', 'groups.json', 'templates.json',
  'setup.json', '.DS_Store', 'uploads', 'platform-tools',
  '启动.command', '启动.bat',  // root launchers are copied per-platform below
  'Start.command', 'Start.bat',  // ASCII-named launchers, also copied per-platform
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true }); }

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (EXCLUDE.has(path.basename(src))) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    if (EXCLUDE.has(path.basename(src))) return;
    fs.copyFileSync(src, dest);
    // Preserve executable bit
    const mode = fs.statSync(src).mode;
    if (mode & 0o111) try { fs.chmodSync(dest, mode); } catch {}
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return false;
  execSync(`cp -R "${src}" "${dest}"`, { stdio: 'pipe' });
  return true;
}

function sizeMB(p) {
  return (fs.statSync(p).size / (1024 * 1024)).toFixed(1);
}

// ---------------------------------------------------------------------------
// Build one platform
// ---------------------------------------------------------------------------

function buildPlatform(platform) {
  const label = platform === 'mac' ? 'macOS' : 'Windows';
  const outName = `${NAME}-${platform}`;
  const OUT = path.join(DIST, outName);

  console.log(`\n--- Building ${label} ---`);

  // 1. Clean
  rmrf(OUT);
  fs.mkdirSync(OUT, { recursive: true });

  // 2. Copy app files
  copyRecursive(ROOT, OUT);
  fs.mkdirSync(path.join(OUT, 'uploads'), { recursive: true });
  console.log(`  [1/4] App files copied`);

  // 3. Bundle platform-tools (ADB)
  const ptSrc = path.join(VENDOR, `platform-tools-${platform === 'mac' ? 'darwin' : 'windows'}`);
  const ptDest = path.join(OUT, 'platform-tools');
  if (copyDir(ptSrc, ptDest)) {
    console.log(`  [2/4] ADB platform-tools bundled`);
  } else {
    console.log(`  [2/4] WARN: ${ptSrc} not found — ADB not bundled`);
  }

  // 4. Bundle Node.js runtime
  const nodeSrc = path.join(VENDOR, `node-${platform === 'mac' ? 'darwin-arm64' : 'windows-x64'}`);
  const nodeDest = path.join(OUT, 'runtime', 'node');
  if (fs.existsSync(nodeSrc)) {
    fs.mkdirSync(path.join(OUT, 'runtime'), { recursive: true });
    copyDir(nodeSrc, nodeDest);
    console.log(`  [3/4] Node.js runtime bundled`);
  } else {
    console.log(`  [3/4] WARN: ${nodeSrc} not found — Node.js not bundled`);
  }

  // 5. Copy root launcher for this platform & set permissions
  if (platform === 'mac') {
    // Copy both Chinese and ASCII-named launchers for Mac
    fs.copyFileSync(path.join(ROOT, '启动.command'), path.join(OUT, '启动.command'));
    fs.chmodSync(path.join(OUT, '启动.command'), 0o755);
    fs.copyFileSync(path.join(ROOT, 'Start.command'), path.join(OUT, 'Start.command'));
    fs.chmodSync(path.join(OUT, 'Start.command'), 0o755);
    const sh = path.join(OUT, 'scripts', 'start.sh');
    const cmd = path.join(OUT, 'scripts', 'start.command');
    if (fs.existsSync(sh)) try { fs.chmodSync(sh, 0o755); } catch {}
    if (fs.existsSync(cmd)) try { fs.chmodSync(cmd, 0o755); } catch {}
    // Also chmod node and adb
    const nodeBin = path.join(nodeDest, 'bin', 'node');
    if (fs.existsSync(nodeBin)) try { fs.chmodSync(nodeBin, 0o755); } catch {}
    const adbBin = path.join(ptDest, 'adb');
    if (fs.existsSync(adbBin)) try { fs.chmodSync(adbBin, 0o755); } catch {}
  } else {
    // Copy both Chinese and ASCII-named launchers for Windows
    fs.copyFileSync(path.join(ROOT, '启动.bat'), path.join(OUT, '启动.bat'));
    fs.copyFileSync(path.join(ROOT, 'Start.bat'), path.join(OUT, 'Start.bat'));
  }

  // 6. Create archive
  const zipName = `${outName}-v${VER}.zip`;
  const zipPath = path.join(DIST, zipName);
  try { fs.unlinkSync(zipPath); } catch {}
  execSync(`cd "${DIST}" && zip -r -y "${zipName}" "${outName}"`, { stdio: 'pipe' });
  console.log(`  [4/4] ${zipName} (${sizeMB(zipPath)} MB)`);

  // Cleanup uncompressed folder
  rmrf(OUT);

  return zipPath;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const arg = process.argv[2];
const platforms = arg === 'mac' ? ['mac'] : arg === 'win' ? ['win'] : ['mac', 'win'];

console.log(`\n📦 Packaging ${NAME} v${VER}`);
console.log(`   Platforms: ${platforms.join(', ')}`);

// Ensure dist dir
fs.mkdirSync(DIST, { recursive: true });

const results = [];
for (const p of platforms) {
  const zip = buildPlatform(p);
  results.push({ platform: p, zip, size: sizeMB(zip) });
}

console.log(`\n✅ Done!\n`);
for (const r of results) {
  console.log(`   ${r.platform === 'mac' ? 'macOS' : 'Windows'}: ${path.basename(r.zip)} (${r.size} MB)`);
}
console.log('');
