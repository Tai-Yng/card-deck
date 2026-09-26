/* 解析 leetcode-hot100 章节笔记 → 题卡。纯函数、零依赖。
   语料事实（2026-09-26 全库核查）：每题恰有 难度/思路/复杂度/cpp围栏/要点 各一个锚点；
   已知例外：03-560 题思路节内含额外加粗段落「为什么不能用滑动窗口」→ 并入思路保持阅读顺序。 */

const DIFFS = new Set(['简单', '中等', '困难']);

export function stripMarkdown(s) {
  return s.replace(/\*\*/g, '').replace(/`([^`]*)`/g, '$1');
}

export function parseChapter(fileName, text) {
  const h1 = text.match(/^# (.+?)（/m);
  if (!h1) throw new Error(fileName + ': 找不到 H1 章节标题');
  const chapter = h1[1].trim();

  const questions = [];
  const lines = text.split(/\r?\n/);
  let cur = null;
  let section = null;   // null | 'silu' | 'fuzadu' | 'yaodian'
  let inFence = false;

  for (const line of lines) {
    if (inFence) {
      if (line.startsWith('```')) { inFence = false; continue; }
      cur.codeLines.push(line);
      continue;
    }

    const h2 = line.match(/^## (\d+)\. (.+)$/);
    if (h2) {
      if (cur) questions.push(cur);
      cur = { num: Number(h2[1]), title: h2[2].trim(), difficulty: '', kaodian: '', silu: [], fuzadu: '', bullets: [], codeLines: [] };
      section = null;
      continue;
    }
    if (!cur) continue;   // H1、表格、空行等题外内容

    if (line.startsWith('```')) { inFence = true; continue; }

    const bq = line.match(/^>\s*难度：(\S+)\s*考点：(.*)$/);
    if (bq) { cur.difficulty = bq[1]; cur.kaodian = bq[2].trim(); section = null; continue; }

    let m;
    if ((m = line.match(/^\*\*思路\*\*：(.*)$/))) { section = 'silu'; cur.silu.push(stripMarkdown(m[1].trim())); continue; }
    if ((m = line.match(/^\*\*复杂度\*\*：(.*)$/))) { section = 'fuzadu'; cur.fuzadu = stripMarkdown(m[1].trim()); continue; }
    if (/^\*\*要点\*\*：\s*$/.test(line)) { section = 'yaodian'; continue; }

    if (line.startsWith('- ') && section === 'yaodian') {
      cur.bullets.push(stripMarkdown(line.slice(2).trim()));
      continue;
    }

    if (/^\*\*.+\*\*：/.test(line)) {   // 未知加粗段落 → 并入思路节尾
      section = 'silu';
      cur.silu.push(stripMarkdown(line.trim()));
      continue;
    }

    const t = line.trim();
    if (!t) continue;
    // 续行：并入所在节最后一段/最后一条
    if (section === 'silu' && cur.silu.length) cur.silu[cur.silu.length - 1] += stripMarkdown(t);
    else if (section === 'fuzadu') cur.fuzadu += stripMarkdown(t);
    else if (section === 'yaodian' && cur.bullets.length) cur.bullets[cur.bullets.length - 1] += stripMarkdown(t);
  }
  if (cur) questions.push(cur);
  return { chapter, questions };
}

export function buildCard(q, chapter) {
  if (!DIFFS.has(q.difficulty)) throw new Error('难度非法: ' + q.difficulty);
  const bodyParts = [
    '考点：' + q.kaodian,
    '【思路】' + q.silu.join('\n\n'),
    '【复杂度】' + q.fuzadu,
    '【要点】\n' + q.bullets.map((b) => '- ' + b).join('\n'),
  ];
  return {
    id: 'hot100-' + q.num,
    title: q.num + '. ' + q.title,
    difficulty: q.difficulty,
    tags: ['Hot100', chapter],
    lang: 'cpp',
    body: bodyParts.join('\n\n'),
    code: q.codeLines.join('\n'),
  };
}
