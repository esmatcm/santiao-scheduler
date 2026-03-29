#!/usr/bin/env node
/**
 * 图片发送功能 10 次连续验证测试
 *
 * 流程：启动三条 → 进入群聊 → 发送图片 → 返回主界面 → 重复
 * 每次发送后验证状态，全部通过才算合格。
 */

const {
  sleep, sh, launchSantiao, openGroup, sendImage,
  returnToMainScreen, ensureOnMainScreen, captureScreen,
  ensureAdbIME, getCurrentAppPackage
} = require('../lib/adb');
const deviceConfig = require('../lib/device-config');
const fs = require('fs');
const path = require('path');

// ---- Config ----
const TEST_GROUP = process.argv[2] || 'ABC';  // default test group
const TEST_IMAGE = process.argv[3] || '/tmp/test_send_image.jpg';
const TOTAL_ROUNDS = 10;

// ---- Helpers ----
function ts() { return new Date().toISOString().slice(11, 23); }
function log(msg) { console.log(`[${ts()}] ${msg}`); }
function logResult(round, success, detail = '') {
  const status = success ? '✅ PASS' : '❌ FAIL';
  console.log(`[${ts()}] [${round}/${TOTAL_ROUNDS}] ${status}${detail ? ' — ' + detail : ''}`);
}

async function isInChatRoom() {
  try {
    const raw = await sh('dumpsys activity top', { timeout: 10000, retries: 0 });
    return /ChatRoomActivity|app:id\/text_input|app:id\/input_send_bnt|app:id\/rv_messages/.test(raw);
  } catch { return false; }
}

async function verifySendSuccess() {
  // After sendImage, we should still be in the chat room
  // Check if we're still in the chat (not crashed, not in picker)
  const inChat = await isInChatRoom();
  if (!inChat) return { ok: false, reason: '发送后不在聊天界面' };

  // Check that PictureSelector is NOT open (send completed)
  try {
    const raw = await sh('dumpsys activity top', { timeout: 10000, retries: 0 });
    if (raw.includes('PictureSelectorSupporter')) {
      return { ok: false, reason: '图片选择器仍然打开，发送可能失败' };
    }
  } catch {}

  return { ok: true, reason: '' };
}

// ---- Main Test ----
async function runTest() {
  log('='.repeat(60));
  log('  图片发送功能 10 次连续验证测试');
  log(`  目标群聊: ${TEST_GROUP}`);
  log(`  测试图片: ${TEST_IMAGE}`);
  log('='.repeat(60));

  // Pre-checks
  if (!fs.existsSync(TEST_IMAGE)) {
    log(`❌ 测试图片不存在: ${TEST_IMAGE}`);
    process.exit(1);
  }

  log('初始化设备...');
  await deviceConfig.init();
  log(`设备: ${deviceConfig.config.serial}, 屏幕: ${deviceConfig.config.width}×${deviceConfig.config.height}`);

  const results = [];
  let passed = 0;
  let failed = 0;

  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    log('');
    log(`━━━ 第 ${round}/${TOTAL_ROUNDS} 轮测试 ━━━`);
    const startTime = Date.now();

    try {
      // Step 1: Open group
      log(`[${round}] 正在打开群聊「${TEST_GROUP}」...`);
      await openGroup(TEST_GROUP, (step) => log(`[${round}] ${step}`), round === 1);

      // Step 2: Send image
      log(`[${round}] 正在发送图片...`);
      await sendImage(TEST_IMAGE, `test-${round}`, (step) => log(`[${round}] ${step}`));

      // Step 3: Verify send success
      await sleep(1000);
      const verify = await verifySendSuccess();
      if (!verify.ok) {
        throw new Error(verify.reason);
      }

      // Step 4: Return to main screen
      log(`[${round}] 正在返回主界面...`);
      await returnToMainScreen((step) => log(`[${round}] ${step}`));
      await sleep(1500);

      // Step 5: Verify we're back on main screen
      const pkg = await getCurrentAppPackage();
      if (pkg !== 'com.santiaotalk.im') {
        log(`[${round}] ⚠️ 返回后不在三条 (当前: ${pkg})，重新确认...`);
        await ensureOnMainScreen(3);
      }

      const elapsed = Date.now() - startTime;
      logResult(round, true, `${(elapsed / 1000).toFixed(1)}s`);
      results.push({ round, success: true, elapsed });
      passed++;

    } catch (err) {
      const elapsed = Date.now() - startTime;
      logResult(round, false, err.message);
      results.push({ round, success: false, elapsed, error: err.message });
      failed++;

      // Try to capture screenshot on failure
      try {
        const screenshot = await captureScreen(`test-fail-round${round}`);
        log(`[${round}] 失败截图: ${screenshot}`);
      } catch {}

      // Try to recover for next round
      log(`[${round}] 正在恢复状态...`);
      try {
        await sh('input keyevent KEYCODE_BACK').catch(() => {});
        await sleep(1000);
        await sh('input keyevent KEYCODE_BACK').catch(() => {});
        await sleep(1000);
        await sh('input keyevent KEYCODE_BACK').catch(() => {});
        await sleep(2000);
        await launchSantiao('recovery');
        await ensureOnMainScreen(3);
      } catch (recoverErr) {
        log(`[${round}] 恢复失败: ${recoverErr.message}`);
      }
    }

    // Brief pause between rounds
    if (round < TOTAL_ROUNDS) {
      await sleep(2000);
    }
  }

  // ---- Summary ----
  log('');
  log('='.repeat(60));
  log('  测试结果汇总');
  log('='.repeat(60));

  for (const r of results) {
    const status = r.success ? '✅' : '❌';
    const time = `${(r.elapsed / 1000).toFixed(1)}s`;
    const detail = r.error ? ` [${r.error}]` : '';
    log(`  第 ${r.round} 轮: ${status} ${time}${detail}`);
  }

  const avgTime = results.filter(r => r.success).reduce((sum, r) => sum + r.elapsed, 0) / (passed || 1);
  log('');
  log(`  通过: ${passed}/${TOTAL_ROUNDS}`);
  log(`  失败: ${failed}/${TOTAL_ROUNDS}`);
  log(`  平均耗时: ${(avgTime / 1000).toFixed(1)}s`);
  log(`  成功率: ${((passed / TOTAL_ROUNDS) * 100).toFixed(0)}%`);
  log('='.repeat(60));

  if (failed === 0) {
    log('🎉 全部通过！图片发送功能验证合格！');
  } else {
    log(`⚠️ 有 ${failed} 轮失败，需要排查问题。`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTest().catch(err => {
  log(`💥 测试脚本异常: ${err.message}`);
  console.error(err);
  process.exit(2);
});
