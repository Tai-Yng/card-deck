import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeImported, contentFingerprint } from '../lib/merge-deck.mjs';

const mk = (over = {}) => Object.assign({
  id: 'hot100-1', title: '1. 两数之和', difficulty: '简单',
  tags: ['Hot100', '哈希'], lang: 'cpp', body: '思路', code: 'a;',
}, over);

test('新增/未变/更新 三分支', () => {
  const deck = {
    updatedAt: 'T0',
    cards: [
      { id: 'demo-0001', title: '1. 两数之和', difficulty: '简单', tags: ['哈希表'], lang: 'cpp', body: 'b', code: 'c', updatedAt: 'T0' },
      Object.assign(mk({ body: '旧思路' }), { updatedAt: 'T0', review: { box: 3, due: 'd1', last: 'l1' } }),
    ],
    deleted: { 'c999': 'T0' },
  };
  const imported = [mk(), mk({ id: 'hot100-2', title: '2. 加法' })];
  const stat = mergeImported(deck, imported, 'T1');
  assert.deepEqual([stat.added, stat.updated, stat.unchanged], [1, 1, 0]);
  const c1 = deck.cards.find((c) => c.id === 'hot100-1');
  assert.equal(c1.body, '思路');                 // 笔记内容覆盖
  assert.equal(c1.updatedAt, 'T1');              // updatedAt 刷新
  assert.equal(c1.review.box, 3);                // review 保留
  assert.equal(deck.cards.find((c) => c.id === 'demo-0001').updatedAt, 'T0');  // 示例卡不动
  assert.deepEqual(deck.deleted, { 'c999': 'T0' });                            // 墓碑不动
  assert.equal(deck.updatedAt, 'T1');            // 有变化 → deck.updatedAt 刷新
});

test('内容未变完全不触碰；重跑零变化', () => {
  const imported = [mk(), mk({ id: 'hot100-2', title: '2. 加法' })];
  const deck = { updatedAt: 'T1', cards: [], deleted: {} };
  mergeImported(deck, imported, 'T1');
  const snapshot = JSON.stringify(deck);
  const stat2 = mergeImported(deck, imported, 'T2');
  assert.deepEqual([stat2.added, stat2.updated, stat2.unchanged], [0, 0, 2]);
  assert.equal(JSON.stringify(deck), snapshot);  // 第二次运行零变化（含 updatedAt 不动）
});

test('contentFingerprint 覆盖全部内容字段', () => {
  assert.notEqual(contentFingerprint(mk({ body: 'a' })), contentFingerprint(mk({ body: 'b' })));
  assert.equal(contentFingerprint(mk({ review: { box: 5 } })), contentFingerprint(mk()));  // review 不参与指纹
});
