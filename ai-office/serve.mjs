#!/usr/bin/env node
// AI Agent 辦公室的本機伺服器：掃描這台電腦上的 Claude Code 工作階段紀錄，
// 以 office-data.json 提供給 index.html。只綁 127.0.0.1，資料不會離開這台電腦。
//
//   node ai-office/serve.mjs            開在 http://localhost:8787
//   node ai-office/serve.mjs --port 9000
//   node ai-office/serve.mjs --print    只印出 office-data.json 的內容
//   node ai-office/serve.mjs --dir <紀錄資料夾>   預設 ~/.claude/projects

import { createServer } from 'node:http';
import { readdirSync, statSync, openSync, readSync, closeSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const ROOT = opt('--dir', join(homedir(), '.claude', 'projects'));
const PORT = Number(opt('--port', 8787));
const HERE = dirname(fileURLToPath(import.meta.url));

const WORKING_MS = 90 * 1000;          // 90 秒內還在寫紀錄：算工作中
const WAITING_MS = 3 * 60 * 60 * 1000; // 3 小時內停下來：算等你回覆；更久算已完成
const TAIL_BYTES = 400 * 1024;
const MAX_ROOMS = 12;

const PRESET = {
  fable:  { name: 'Fable',  color: '#3f9b54', gear: 'leaf' },
  opus:   { name: 'Opus',   color: '#c0446b', gear: 'glasses' },
  sonnet: { name: 'Sonnet', color: '#2f74d0', gear: 'antenna' },
  haiku:  { name: 'Haiku',  color: '#d9a21b', gear: 'bow' },
  claude: { name: 'Claude', color: '#b5673a', gear: 'cap' },
};
const familyOf = (model) => (/fable|opus|sonnet|haiku/.exec(String(model || '').toLowerCase()) || ['claude'])[0];

function tail(file, size) {
  const start = Math.max(0, size - TAIL_BYTES), buf = Buffer.alloc(size - start), fd = openSync(file, 'r');
  try { readSync(fd, buf, 0, buf.length, start); } finally { closeSync(fd); }
  const text = buf.toString('utf8');
  return start ? text.slice(text.indexOf('\n') + 1) : text; // 從中間切入時丟掉第一行殘句
}

function readSession(file, st) {
  const info = { cwd: null, model: null, prompt: null, ended: false };
  for (const line of tail(file, st.size).split('\n')) {
    if (!line) continue;
    let d; try { d = JSON.parse(line); } catch { continue; }
    if (d.type === 'last-prompt' && typeof d.lastPrompt === 'string') info.prompt = d.lastPrompt;
    if (d.isSidechain || (d.type !== 'user' && d.type !== 'assistant')) continue;
    if (d.cwd && (!info.cwd || d.cwd.length < info.cwd.length)) info.cwd = d.cwd; // 取最上層的資料夾，不被中途 cd 影響
    if (d.type === 'assistant' && d.message) {
      if (d.message.model && !String(d.message.model).startsWith('<')) info.model = d.message.model;
      info.ended = d.message.stop_reason === 'end_turn';
    } else info.ended = false;
  }
  return info;
}

function scan() {
  const files = [];
  let dirs = [];
  try { dirs = readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { /* 沒有紀錄資料夾 */ }
  for (const d of dirs) {
    let names = [];
    try { names = readdirSync(join(ROOT, d.name)).filter((n) => n.endsWith('.jsonl')); } catch { continue; }
    for (const n of names) {
      const file = join(ROOT, d.name, n);
      try { const st = statSync(file); if (st.size) files.push({ file, st, dir: d.name }); } catch { /* 檔案剛好被移走 */ }
    }
  }
  files.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);

  const byCwd = new Map(), now = Date.now();
  for (const f of files.slice(0, 80)) {
    let info; try { info = readSession(f.file, f.st); } catch { continue; }
    const cwd = info.cwd || f.dir;
    const room = byCwd.get(cwd);
    if (room) { room.count++; continue; }             // 同一個資料夾只留最新的那個工作階段
    if (byCwd.size >= MAX_ROOMS) continue;
    const age = now - f.st.mtimeMs;
    const status = age < WORKING_MS ? 'build' : age < WAITING_MS ? 'wait' : 'idle';
    const prompt = (info.prompt || '').split('\n')[0].trim();
    byCwd.set(cwd, {
      id: 'local-' + basename(f.file, '.jsonl'), name: basename(cwd) || cwd, status, count: 1,
      task: status === 'wait' && !info.ended ? '停在半路（可能在等你按允許）：' + prompt.slice(0, 50)
        : prompt.slice(0, 70) || '沒有摘要',
      model: info.model, updated: new Date(f.st.mtimeMs).toISOString(), kind: '本機',
    });
  }

  const agents = new Map();
  const projects = [...byCwd.values()].map((r) => {
    const fam = familyOf(r.model);
    if (!agents.has(fam)) agents.set(fam, { id: fam, role: r.model || '模型未知', ...PRESET[fam] });
    return {
      id: r.id, name: r.name, status: r.status, task: r.task, members: [fam], updated: r.updated,
      kind: r.count > 1 ? `本機・這個資料夾共 ${r.count} 個工作階段` : '本機',
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { live: true, source: '本機即時', agents: [...agents.values()], projects };
}

if (args.includes('--print')) {
  console.log(JSON.stringify(scan(), null, 2));
} else {
  createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/office-data.json') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(scan()));
    } else if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(readFileSync(join(HERE, 'index.html')));
    } else { res.writeHead(404); res.end('not found'); }
  }).listen(PORT, '127.0.0.1', () => console.log(`AI Agent 辦公室：http://localhost:${PORT}（讀 ${ROOT}）`));
}
