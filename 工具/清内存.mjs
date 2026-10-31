// 轻量「清内存」：只收拾 agent 自己留下的东西，不动用户正在用的程序
// 用法：node "F:\AI工作区\工具\清内存.mjs"          只看不动（dry-run）
//       node "F:\AI工作区\工具\清内存.mjs" --kill    真的关
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';

const KILL = process.argv.includes('--kill');
const GB = (b) => Math.round((b / 1024 ** 3) * 100) / 100;

function tasklist(name) {
  try {
    const out = execFileSync('tasklist', ['/fi', `imagename eq ${name}`, '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
    return out.split(/\r?\n/).filter(Boolean).map((line) => {
      const cols = line.split('","').map((s) => s.replace(/^"|"$/g, ''));
      return { name: cols[0], pid: Number(cols[1]), mem: Number(String(cols[4] || '').replace(/[^\d]/g, '')) / 1024 };
    }).filter((r) => r.pid);
  } catch {
    return [];
  }
}

// 用 wmic 拿命令行（tasklist 不给 cmdline）
function cmdlines(name) {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      `Get-CimInstance Win32_Process -Filter "Name='${name}'" | ForEach-Object { $_.ProcessId.ToString() + '|' + $_.CommandLine }`,
    ], { encoding: 'utf8', windowsHide: true });
    const map = new Map();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes('|')) continue;
      const i = line.indexOf('|');
      map.set(Number(line.slice(0, i)), line.slice(i + 1));
    }
    return map;
  } catch {
    return new Map();
  }
}

const before = GB(os.freemem());
const total = GB(os.totalmem());
console.log(`内存：可用 ${before} GB / 共 ${total} GB（已用 ${(100 - (before / total) * 100).toFixed(1)}%）`);

// 1) 自动化浏览器残留：带 --remote-debugging-port 的 Edge/Chrome
let candidates = [];
for (const exe of ['msedge.exe', 'chrome.exe']) {
  const cmds = cmdlines(exe);
  for (const [pid, cmd] of cmds) {
    if (cmd && cmd.includes('--remote-debugging-port')) candidates.push({ exe, pid, cmd });
  }
}
const all = new Map([...tasklist('msedge.exe'), ...tasklist('chrome.exe')].map((r) => [r.pid, r]));

if (!candidates.length) {
  console.log('没有发现自动化浏览器残留（Edge/Chrome 都没有 --remote-debugging-port 的主进程）。');
} else {
  console.log(`发现 ${candidates.length} 个自动化浏览器主进程：`);
  for (const c of candidates) {
    const m = all.get(c.pid);
    console.log(`  pid=${c.pid} ${c.exe} ${m ? m.mem.toFixed(0) + 'MB' : ''}`);
    if (KILL) {
      try {
        execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { windowsHide: true });
        console.log(`    已关闭（含子进程）pid=${c.pid}`);
      } catch (e) {
        console.log(`    关闭失败 pid=${c.pid}: ${e.message.split('\n')[0]}`);
      }
    }
  }
}

// 2) 孤儿 ffmpeg（转码/抽帧跑完没退的）
const ff = tasklist('ffmpeg.exe');
if (ff.length) {
  console.log(`发现 ffmpeg ${ff.length} 个：`);
  for (const r of ff) {
    console.log(`  pid=${r.pid} ${r.mem.toFixed(0)}MB`);
    if (KILL) { try { execFileSync('taskkill', ['/PID', String(r.pid), '/F'], { windowsHide: true }); } catch {} }
  }
}

const after = GB(os.freemem());
console.log(`可用内存：${before} GB → ${after} GB（${(after - before >= 0 ? '+' : '') + (after - before).toFixed(2)} GB）`);

// 3) 大件排行，方便判断该关谁
const rows = [...all.values()];
for (const exe of ['DeepSeek Harness.exe', 'firefox.exe', 'Weixin.exe', 'node.exe', 'python.exe']) {
  rows.push(...tasklist(exe));
}
rows.sort((a, b) => b.mem - a.mem);
console.log('当前占用前 8（进程名 / pid / MB）：');
for (const r of rows.slice(0, 8)) console.log(`  ${r.name.padEnd(20)} ${String(r.pid).padEnd(7)} ${r.mem.toFixed(0)}`);

if (!KILL) console.log('（dry-run）要真的关，加 --kill');
