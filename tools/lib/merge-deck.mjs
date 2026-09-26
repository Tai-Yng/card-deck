/* 幂等合并：按 id 三分支——新增 / 内容未变(不触碰) / 内容变化(更新+刷 updatedAt+保 review)。
   指纹只含内容字段：review 进度、updatedAt 不参与判定。 */

export function contentFingerprint(c) {
  return [c.title, c.difficulty, (c.tags || []).join(','), c.body, c.code].join('\u0000');
}

export function mergeImported(deck, imported, nowIso) {
  let added = 0, updated = 0, unchanged = 0;
  const byId = new Map(deck.cards.map((c) => [c.id, c]));
  for (const card of imported) {
    const existing = byId.get(card.id);
    if (!existing) {
      deck.cards.push(Object.assign({}, card, { updatedAt: nowIso }));
      byId.set(card.id, deck.cards[deck.cards.length - 1]);
      added++;
    } else if (contentFingerprint(existing) !== contentFingerprint(card)) {
      existing.title = card.title;
      existing.difficulty = card.difficulty;
      existing.tags = card.tags;
      existing.lang = card.lang;
      existing.body = card.body;
      existing.code = card.code;
      existing.updatedAt = nowIso;   // review 对象不触碰 → 进度保留
      updated++;
    } else {
      unchanged++;
    }
  }
  if (added || updated) deck.updatedAt = nowIso;
  return { added, updated, unchanged };
}
