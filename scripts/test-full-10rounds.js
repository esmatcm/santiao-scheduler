#!/usr/bin/env node
/**
 * 全功能 10 轮验证测试
 *
 * 每轮测试:
 *  1. 服务器健康检查
 *  2. 设备状态检测
 *  3. Setup 引导流程 (check-adb → check-device → install-santiao → launch-verify → install-ime → verify → reset)
 *  4. 群聊管理 (添加/查询/删除)
 *  5. 群聊扫描 (从手机读取)
 *  6. 打开群聊 + 发送文字
 *  7. 打开群聊 + 发送图片
 *  8. 返回主界面验证
 *  9. 截图功能
 * 10. SSE 连接
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3456';
const TOTAL_ROUNDS = 10;
const TEST_GROUP = 'ABC';

// --- HTTP helpers ---
function request(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {},
      timeout: 180000,
    };
    if (body && typeof body === 'object') {
      const data = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(opts, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let json;
        try { json = JSON.parse(raw); } catch { json = null; }
        resolve({ status: res.statusCode, body: json, raw });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (body && typeof body === 'object') req.write(JSON.stringify(body));
    req.end();
  });
}

async function GET(p) { return request('GET', p); }
async function POST(p, b) { return request('POST', p, b); }
async function DELETE(p) { return request('DELETE', p); }

// --- Test helpers ---
function ts() { return new Date().toISOString().slice(11, 23); }
const results = [];
let currentRound = 0;

function assert(condition, testName, detail = '') {
  if (!condition) {
    throw new Error(`${testName} FAILED${detail ? ': ' + detail : ''}`);
  }
}

async function runTest(name, fn) {
  const start = Date.now();
  try {
    await fn();
    const ms = Date.now() - start;
    console.log(`  ✅ ${name} (${ms}ms)`);
    return { name, pass: true, ms };
  } catch (e) {
    const ms = Date.now() - start;
    console.log(`  ❌ ${name} — ${e.message} (${ms}ms)`);
    return { name, pass: false, ms, error: e.message };
  }
}

// --- Test cases ---

async function testHealth() {
  const r = await GET('/api/health');
  assert(r.status === 200, 'status 200', `got ${r.status}`);
  assert(r.body?.ok === true, 'ok=true');
  assert(r.body?.device, 'has device serial');
  assert(typeof r.body?.uptime === 'number', 'has uptime');
}

async function testDeviceStatus() {
  const r = await GET('/api/status');
  assert(r.status === 200, 'status 200');
  assert(r.body?.online === true, 'device online', JSON.stringify(r.body));
  assert(r.body?.device, 'has serial');
  assert(r.body?.adbIME === true, 'ADB IME active');
}

async function testDeviceConfig() {
  const r = await GET('/api/device');
  assert(r.status === 200, 'status 200');
  assert(r.body?.width > 0 && r.body?.height > 0, 'has screen size', `${r.body?.width}x${r.body?.height}`);
  assert(r.body?.serial, 'has serial');
}

async function testSetupCheckAdb() {
  const r = await POST('/api/setup/check-adb');
  assert(r.status === 200, 'status 200');
  assert(r.body?.ok === true, 'ADB available', r.body?.error);
}

async function testSetupCheckDevice() {
  const r = await POST('/api/setup/check-device');
  assert(r.status === 200, 'status 200');
  assert(r.body?.ok === true, 'device connected', r.body?.error);
  assert(r.body?.serial, 'has serial');
}

async function testSetupInstallSantiao() {
  const r = await POST('/api/setup/install-santiao');
  assert(r.status === 200, 'status 200');
  assert(r.body?.ok === true, 'santiao installed', r.body?.error);
}

async function testSetupLaunchVerify() {
  const r = await POST('/api/setup/launch-verify');
  assert(r.status === 200, 'status 200');
  assert(r.body?.ok === true, 'chat interface detected', r.body?.error);
}

async function testSetupInstallIme() {
  const r = await POST('/api/setup/install-ime');
  assert(r.status === 200, 'status 200');
  assert(r.body?.ok === true, 'IME installed', r.body?.error);
}

async function testSetupVerify() {
  const r = await POST('/api/setup/verify');
  assert(r.status === 200, 'status 200');
  assert(r.body?.ok === true, 'all checks pass', r.body?.errors?.join('; '));
}

async function testSetupForceComplete() {
  const r = await POST('/api/setup/force-complete');
  assert(r.status === 200, 'status 200');
  assert(r.body?.ok === true, 'force complete ok');
}

async function testSetupStatus() {
  const r = await GET('/api/setup/status');
  assert(r.status === 200, 'status 200');
  assert(r.body?.completed === true, 'setup completed');
}

async function testSetupReset() {
  const r = await POST('/api/setup/reset');
  assert(r.status === 200, 'status 200');
  assert(r.body?.completed === false, 'setup reset to incomplete');
}

async function testGroupAdd() {
  const testName = `__test_group_${Date.now()}`;
  const r = await POST('/api/groups', { name: testName });
  assert(r.status === 200, 'status 200');
  assert(Array.isArray(r.body), 'returns array');
  assert(r.body.includes(testName), 'group added');
  // Cleanup
  await DELETE(`/api/groups/${encodeURIComponent(testName)}`);
}

async function testGroupList() {
  const r = await GET('/api/groups');
  assert(r.status === 200, 'status 200');
  assert(Array.isArray(r.body), 'returns array');
}

async function testGroupBatchAdd() {
  const names = [`__batch_a_${Date.now()}`, `__batch_b_${Date.now()}`];
  const r = await POST('/api/groups/batch', { names });
  assert(r.status === 200, 'status 200');
  assert(r.body?.added === 2, `added 2, got ${r.body?.added}`);
  // Cleanup
  for (const n of names) await DELETE(`/api/groups/${encodeURIComponent(n)}`);
}

async function testGroupScan() {
  const r = await POST('/api/groups/scan', { maxScrolls: 0 });
  assert(r.status === 200, 'status 200');
  assert(r.body?.ok === true, 'scan ok', r.body?.error);
  assert(Array.isArray(r.body?.found), 'has found array');
  assert(r.body.found.length > 0, 'found at least 1 group', `found ${r.body.found.length}`);
}

async function testSendText() {
  // Use the ADB module directly to send text
  const {
    openGroup, sendText, returnToMainScreen, ensureAdbIME, sleep
  } = require('../lib/adb');

  await ensureAdbIME();
  await openGroup(TEST_GROUP, () => {}, true);
  await sendText(`自动测试 R${currentRound} ${new Date().toLocaleTimeString('zh')}`, `test-r${currentRound}`, () => {});
  await sleep(1000);
  await returnToMainScreen(() => {});
}

async function testSendImage() {
  const {
    openGroup, sendImage, returnToMainScreen, ensureAdbIME, sleep
  } = require('../lib/adb');

  // Create a simple test image if not exists
  const testImg = '/tmp/test_full_verify.jpg';
  if (!fs.existsSync(testImg)) {
    // Create minimal JPEG (tiny valid file)
    try {
      require('child_process').execSync(
        `python3 -c "from PIL import Image; img=Image.new('RGB',(100,100),'green'); img.save('${testImg}')"`,
        { timeout: 5000 }
      );
    } catch {
      // Fallback: copy any existing upload or create simple file
      const uploadsDir = path.join(__dirname, '..', 'uploads');
      const files = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
      if (files.length > 0) {
        fs.copyFileSync(path.join(uploadsDir, files[0]), testImg);
      } else {
        throw new Error('No test image available');
      }
    }
  }

  await ensureAdbIME();
  await openGroup(TEST_GROUP, () => {}, true);
  await sendImage(testImg, `test-img-r${currentRound}`, () => {});
  await sleep(1000);
  await returnToMainScreen(() => {});
}

async function testScreenshot() {
  const r = await GET('/api/screenshot');
  assert(r.status === 200, 'status 200', `got ${r.status}`);
  assert(r.raw.length > 1000, 'screenshot has data', `size=${r.raw.length}`);
}

async function testSSE() {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/events', BASE);
    const req = http.get(url, (res) => {
      assert(res.statusCode === 200, 'SSE status 200', `got ${res.statusCode}`);
      assert(res.headers['content-type']?.includes('text/event-stream'), 'SSE content-type');
      let data = '';
      const timer = setTimeout(() => {
        req.destroy();
        assert(data.includes('event: connected'), 'SSE received connected event', data.substring(0, 100));
        resolve();
      }, 2000);
      res.on('data', chunk => { data += chunk.toString(); });
      res.on('error', () => { clearTimeout(timer); reject(new Error('SSE error')); });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('SSE timeout')); });
  });
}

async function testMainPageAccess() {
  const r = await GET('/');
  assert(r.status === 200, 'status 200');
  assert(r.raw.includes('三条聊天'), 'main page contains title', r.raw.substring(0, 100));
}

async function testSetupPageAccess() {
  const r = await GET('/setup.html');
  assert(r.status === 200, 'status 200');
  assert(r.raw.includes('初始设置') || r.raw.includes('setup'), 'setup page loads');
}

// === MAIN ===

async function runOneRound(round) {
  currentRound = round;
  console.log(`\n${'━'.repeat(50)}`);
  console.log(`  第 ${round}/${TOTAL_ROUNDS} 轮全面验证`);
  console.log(`${'━'.repeat(50)}`);

  const roundResults = [];

  // 1. Server & Device
  console.log('\n📡 基础服务');
  roundResults.push(await runTest('健康检查 /api/health', testHealth));
  roundResults.push(await runTest('设备状态 /api/status', testDeviceStatus));
  roundResults.push(await runTest('设备配置 /api/device', testDeviceConfig));
  roundResults.push(await runTest('SSE 事件流', testSSE));

  // 2. Setup flow
  console.log('\n🔧 Setup 引导流程');
  // Reset first to test full flow
  roundResults.push(await runTest('重置 setup', testSetupReset));
  roundResults.push(await runTest('检测 ADB', testSetupCheckAdb));
  roundResults.push(await runTest('检测手机', testSetupCheckDevice));
  roundResults.push(await runTest('安装三条', testSetupInstallSantiao));
  roundResults.push(await runTest('启动验证聊天界面', testSetupLaunchVerify));
  roundResults.push(await runTest('安装输入法', testSetupInstallIme));
  roundResults.push(await runTest('最终验证', testSetupVerify));
  roundResults.push(await runTest('Setup 状态=completed', testSetupStatus));

  // 3. Pages
  console.log('\n📄 页面访问');
  roundResults.push(await runTest('主页面 /', testMainPageAccess));
  roundResults.push(await runTest('Setup 页面', testSetupPageAccess));

  // 4. Groups
  console.log('\n👥 群聊管理');
  roundResults.push(await runTest('群聊列表', testGroupList));
  roundResults.push(await runTest('添加+删除群聊', testGroupAdd));
  roundResults.push(await runTest('批量添加群聊', testGroupBatchAdd));

  // 5. Scan (only on rounds 1, 5, 10 to save time)
  if (round === 1 || round === 5 || round === 10) {
    console.log('\n📱 群聊扫描');
    roundResults.push(await runTest('扫描手机群聊', testGroupScan));
  }

  // 6. Send text
  console.log('\n💬 发送文字');
  roundResults.push(await runTest(`发送文字到「${TEST_GROUP}」`, testSendText));

  // 7. Send image
  console.log('\n🖼️  发送图片');
  roundResults.push(await runTest(`发送图片到「${TEST_GROUP}」`, testSendImage));

  // 8. Screenshot
  console.log('\n📸 截图');
  roundResults.push(await runTest('手机截图', testScreenshot));

  // 9. Force-complete (test the skip flow)
  if (round === TOTAL_ROUNDS) {
    console.log('\n⏭️  跳过验证流程');
    await runTest('重置 setup', testSetupReset);
    roundResults.push(await runTest('强制完成 setup', testSetupForceComplete));
    roundResults.push(await runTest('Setup 状态=completed', testSetupStatus));
  }

  // Round summary
  const passed = roundResults.filter(r => r.pass).length;
  const failed = roundResults.filter(r => !r.pass).length;
  const totalMs = roundResults.reduce((s, r) => s + r.ms, 0);
  console.log(`\n  第 ${round} 轮: ${failed === 0 ? '✅' : '❌'} ${passed}/${roundResults.length} 通过 (${(totalMs / 1000).toFixed(1)}s)`);

  return { round, passed, failed, total: roundResults.length, ms: totalMs, details: roundResults };
}

async function main() {
  console.log('='.repeat(50));
  console.log('  三条定时发送工具 — 全功能 10 轮验证');
  console.log('='.repeat(50));
  console.log(`  目标群聊: ${TEST_GROUP}`);
  console.log(`  服务器: ${BASE}`);

  // Check server is running
  try {
    await GET('/api/health');
  } catch {
    console.log('\n❌ 服务器未运行！请先启动: npm start');
    process.exit(1);
  }

  // Init device config
  const deviceConfig = require('../lib/device-config');
  await deviceConfig.init();

  const allRounds = [];

  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    const result = await runOneRound(round);
    allRounds.push(result);

    // If a critical failure, still continue but note it
    if (result.failed > 0) {
      const failures = result.details.filter(r => !r.pass);
      console.log(`  ⚠️ 失败项: ${failures.map(f => f.name).join(', ')}`);
    }

    // Brief pause between rounds
    if (round < TOTAL_ROUNDS) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // === FINAL SUMMARY ===
  console.log('\n' + '='.repeat(60));
  console.log('  最终测试结果汇总');
  console.log('='.repeat(60));

  let totalPassed = 0, totalFailed = 0, totalTests = 0;

  for (const r of allRounds) {
    const status = r.failed === 0 ? '✅' : '❌';
    console.log(`  第 ${String(r.round).padStart(2)} 轮: ${status}  ${r.passed}/${r.total} 通过  ${(r.ms / 1000).toFixed(1)}s`);
    totalPassed += r.passed;
    totalFailed += r.failed;
    totalTests += r.total;
  }

  const overallTime = allRounds.reduce((s, r) => s + r.ms, 0);
  console.log('');
  console.log(`  总测试数: ${totalTests}`);
  console.log(`  通过: ${totalPassed}`);
  console.log(`  失败: ${totalFailed}`);
  console.log(`  总耗时: ${(overallTime / 1000).toFixed(1)}s`);
  console.log(`  成功率: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);
  console.log('='.repeat(60));

  if (totalFailed === 0) {
    console.log('🎉 全部 10 轮验证通过！可以收口打包！');
  } else {
    console.log(`⚠️ 有 ${totalFailed} 项失败，请检查后重试。`);

    // List all unique failures
    const failSet = new Map();
    for (const r of allRounds) {
      for (const d of r.details) {
        if (!d.pass) {
          const key = d.name;
          if (!failSet.has(key)) failSet.set(key, []);
          failSet.get(key).push({ round: r.round, error: d.error });
        }
      }
    }
    console.log('\n  失败明细:');
    for (const [name, rounds] of failSet) {
      console.log(`  - ${name}: 第 ${rounds.map(r => r.round).join(',')} 轮`);
      console.log(`    ${rounds[0].error}`);
    }
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`\n💥 测试脚本异常: ${err.message}`);
  console.error(err.stack);
  process.exit(2);
});
