import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChapter, buildCard } from '../lib/parse-hot100.mjs';

const SAMPLE = [
  '# 哈希（LeetCode Hot 100）',
  '',
  '| 编号 | 题目 | 难度 | 核心考点 |',
  '| --- | --- | --- | --- |',
  '| 1 | 两数之和 | 简单 | 哈希表一次遍历 |',
  '',
  '## 1. 两数之和',
  '> 难度：简单　考点：哈希表一次遍历',
  '',
  '**思路**：暴力枚举是 O(n²)。用 `哈希表` 边遍边查，**先查再存**。',
  '',
  '**为什么不能用双指针**：数组无序，双指针前提不成立。',
  '',
  '**复杂度**：时间 O(n)；空间 O(n)。',
  '',
  '```cpp',
  'class Solution { /* twoSum */ };',
  '```',
  '',
  '**要点**：',
  '- 先查再存，天然避免重复用同一元素。',
  '这是上一条的续行。',
  '',
].join('\n');

test('章节名取 H1 括注前缀', () => {
  assert.equal(parseChapter('01-哈希.md', SAMPLE).chapter, '哈希');
});

test('字段完整提取：难度/考点/思路/复杂度/代码/要点', () => {
  const { questions } = parseChapter('01-哈希.md', SAMPLE);
  assert.equal(questions.length, 1);
  const q = questions[0];
  assert.equal(q.num, 1);
  assert.equal(q.title, '两数之和');
  assert.equal(q.difficulty, '简单');
  assert.equal(q.kaodian, '哈希表一次遍历');
  assert.deepEqual(q.silu, [
    '暴力枚举是 O(n²)。用 哈希表 边遍边查，先查再存。',
    '为什么不能用双指针：数组无序，双指针前提不成立。',
  ]);
  assert.equal(q.fuzadu, '时间 O(n)；空间 O(n)。');
  assert.deepEqual(q.codeLines, ['class Solution { /* twoSum */ };']);
  assert.deepEqual(q.bullets, ['先查再存，天然避免重复用同一元素。这是上一条的续行。']);
});

test('buildCard 映射约定与 markdown 清理', () => {
  const { chapter, questions } = parseChapter('01-哈希.md', SAMPLE);
  const card = buildCard(questions[0], chapter);
  assert.equal(card.id, 'hot100-1');
  assert.equal(card.title, '1. 两数之和');
  assert.deepEqual(card.tags, ['Hot100', '哈希']);
  assert.equal(card.lang, 'cpp');
  assert.equal(card.code, 'class Solution { /* twoSum */ };');
  assert.ok(!card.body.includes('**'));
  assert.ok(!card.body.includes('`'));
  assert.ok(card.body.startsWith('考点：哈希表一次遍历'));
  assert.ok(card.body.includes('【思路】'));
  assert.ok(card.body.includes('【复杂度】'));
  assert.ok(card.body.includes('【要点】\n- '));
});

test('缺 H1 时报错', () => {
  assert.throws(() => parseChapter('x.md', '## 1. 两数之和'), /H1/);
});
