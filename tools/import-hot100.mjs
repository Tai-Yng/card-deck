#!/usr/bin/env node
/* 全量导入 leetcode-hot100 笔记 → data/cards.json + js/seed.js。
   用法：node tools/import-hot100.mjs [--dry-run]
   先全量校验后写盘；校验失败非零码退出且不写任何文件。 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChapter, buildCard } from './lib/parse-hot100.mjs';
import { mergeImported } from './lib/merge-deck.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOTES_DIR = path.resolve(ROOT, '..', 'leetcode-hot100');
const CARDS_PATH = path.join(ROOT, 'data', 'cards.json');
const SEED_PATH = path.join(ROOT, 'js', 'seed.js');

/* 期望题数表（来源 leetcode-hot100/README.md；笔记结构调整时同步更新） */
const EXPECTED = { '01': 3, '02': 4, '03': 5, '04': 9, '05': 14, '06': 15, '07': 4, '08': 8, '09': 6, '10': 8, '11': 4, '12': 15, '13': 5 };
const DIFFS = new Set(['简单', '中等', '困难']);

const dryRun = process.argv.includes('--dry-run');

/* 1. 枚举 + 解析 + 逐题校验 */
const files = fs.readdirSync(NOTES_DIR)
  .filter((f) => /^(0[1-9]|1[0-3])-.+\.md$/.test(f))
  .sort();
if (files.length !== Object.keys(EXPECTED).length) {
  console.error('✗ 章节文件数 ' + files.length + ' 与期望表 ' + Object.keys(EXPECTED).length + ' 不符，中止');
  process.exit(1);
}

const errors = [];
const imported = [];
const rows = [];
for (const f of files) {
  const key = f.slice(0, 2);
  let parsed;
  try {
    parsed = parseChapter(f, fs.readFileSync(path.join(NOTES_DIR, f), 'utf8'));
  } catch (e) {
    errors.push(e.message);
    continue;
  }
  for (const q of parsed.questions) {
    const problems = [];
    if (!DIFFS.has(q.difficulty)) problems.push('难度非法: ' + (q.difficulty || '空'));
    if (!q.kaodian) problems.push('缺考点');
    if (!q.silu.length || !q.silu.join('').trim()) problems.push('缺思路');
    if (!q.fuzadu.trim()) problems.push('缺复杂度');
    if (!q.bullets.length) problems.push('缺要点');
    if (!q.codeLines.length) problems.push('缺代码块');
    if (problems.length) errors.push(f + ' 第' + q.num + '题「' + q.title + '」: ' + problems.join('、'));
    else imported.push(buildCard(q, parsed.chapter));
  }
  rows.push([key + ' ' + parsed.chapter, parsed.questions.length, EXPECTED[key]]);
  if (parsed.questions.length !== EXPECTED[key]) {
    errors.push(f + ': 解析 ' + parsed.questions.length + ' 题，期望表为 ' + EXPECTED[key] + ' 题（笔记结构变化？更新 EXPECTED 表）');
  }
}

/* 2. 报告 */
console.log('章节            解析 期望');
for (const [name, got, exp] of rows) console.log(name.padEnd(14, '　') + String(got).padStart(4) + String(exp).padStart(4));
console.log('合计            ' + String(imported.length).padStart(4) + '  100');

if (errors.length) {
  console.error('\n✗ 校验未通过（' + errors.length + ' 项），未写任何文件：');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
if (dryRun) { console.log('\n✓ dry-run 通过：' + imported.length + ' 题，未写盘'); process.exit(0); }

/* 3. 合并 + 落盘 */
const deck = fs.existsSync(CARDS_PATH)
  ? JSON.parse(fs.readFileSync(CARDS_PATH, 'utf8'))
  : { version: 1, updatedAt: '', cards: [], deleted: {} };
const nowIso = new Date().toISOString();
const stat = mergeImported(deck, imported, nowIso);

fs.writeFileSync(CARDS_PATH, JSON.stringify(deck, null, 2) + '\n');
const seedText = '// 自动生成的离线兜底数据（与 data/cards.json 保持一致，勿手改；改请改 data/cards.json 后重新生成）\n'
  + 'window.SEED = ' + JSON.stringify({ version: 1, updatedAt: deck.updatedAt, cards: deck.cards, deleted: deck.deleted }, null, 2) + ';\n';
fs.writeFileSync(SEED_PATH, seedText);

console.log('\n✓ 新增 ' + stat.added + ' · 更新 ' + stat.updated + ' · 未变 ' + stat.unchanged
  + ' · 题库共 ' + deck.cards.length + ' 张卡');
console.log('  ' + path.relative(ROOT, CARDS_PATH) + ' / ' + path.relative(ROOT, SEED_PATH) + ' 已写入');
