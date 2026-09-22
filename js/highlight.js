/* 极简语法高亮：零依赖，支持 C++ / C / Python / Java / JavaScript / Go，其余语言原样转义显示 */
window.Highlight = (function () {
  'use strict';

  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  const KW = {
    cpp: 'alignas alignof auto bool break case catch char char8_t char16_t char32_t class const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do double dynamic_cast else enum explicit extern false float for friend goto if inline int long mutable namespace new noexcept nullptr operator private protected public reinterpret_cast requires return short signed sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while',
    python: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda match case nonlocal not or pass raise return try while with yield None True False self',
    java: 'abstract assert boolean break byte case catch char class continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var record true false null',
    javascript: 'async await break case catch class const continue debugger default delete do else enum export extends false finally for from function get if implements import in instanceof interface let new null of return set static super switch this throw true try type typeof undefined var void while with yield',
    go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false iota'
  };

  /* 关键字表是空格分隔字符串，转成正则的 | 分隔 */
  const kwRule = (kw) => ['\\b(?:' + kw.trim().split(/\s+/).join('|') + ')\\b', 'kw'];

  /* C 系语言共用规则：注释 / 字符串 / 预处理 / 数字 / 关键字 / 大写开头类型 */
  const cLike = (kw) => [
    ['\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*', 'cm'],
    ['"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'', 'st'],
    ['#[ \\t]*[A-Za-z_]\\w*', 'pp'],
    ['\\b(?:0[xX][0-9a-fA-F]+|(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?)[uUlLfF]*\\b', 'nu'],
    kwRule(kw),
    ['\\b[A-Z][A-Za-z0-9_]*\\b', 'ty']
  ];

  const RULES = {
    cpp: cLike(KW.cpp),
    c: cLike(KW.cpp),
    java: cLike(KW.java),
    python: [
      ['#[^\\n]*', 'cm'],
      ['"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'', 'st'],
      ['(?:[rbuf]{0,2})"(?:\\\\.|[^"\\\\\\n])*"|(?:[rbuf]{0,2})\'(?:\\\\.|[^\'\\\\\\n])*\'', 'st'],
      ['\\b(?:0[xXoObB][0-9a-fA-F_]+|(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?)[jJlL]*\\b', 'nu'],
      kwRule(KW.python),
      ['\\b[A-Z][A-Za-z0-9_]*\\b', 'ty']
    ],
    javascript: [
      ['\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*', 'cm'],
      ['"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`', 'st'],
      ['\\b(?:0[xX][0-9a-fA-F]+|(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?)\\b', 'nu'],
      kwRule(KW.javascript),
      ['\\b[A-Z][A-Za-z0-9_$]*\\b', 'ty']
    ],
    go: [
      ['\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*', 'cm'],
      ['"(?:\\\\.|[^"\\\\\\n])*"|`[^`]*`|\'(?:\\\\.|[^\'\\\\\\n])*\'', 'st'],
      ['\\b(?:0[xX][0-9a-fA-F]+|(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?)\\b', 'nu'],
      kwRule(KW.go),
      ['\\b[A-Z][A-Za-z0-9_]*\\b', 'ty']
    ]
  };

  const ALIAS = {
    'c++': 'cpp', cc: 'cpp', cxx: 'cpp', h: 'cpp', hpp: 'cpp',
    py: 'python', js: 'javascript', ts: 'javascript', typescript: 'javascript',
    golang: 'go', text: null, plain: null, '': null
  };

  function norm(lang) {
    const l = String(lang || '').toLowerCase().trim();
    if (Object.prototype.hasOwnProperty.call(ALIAS, l)) return ALIAS[l];
    return RULES[l] ? l : null;
  }

  function run(code, lang) {
    const rules = norm(lang) ? RULES[norm(lang)] : null;
    const s = String(code == null ? '' : code);
    if (!rules) return esc(s);

    /* 每条规则包一个唯一命名组，匹配后按组序号取对应样式类 */
    const re = new RegExp(rules.map((r, i) => '(?<g' + i + '>' + r[0] + ')').join('|'), 'g');
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(s)) !== null) {
      if (m[0] === '') { re.lastIndex += 1; continue; }   // 兜底防死循环（当前规则不会匹配空串）
      out += esc(s.slice(last, m.index));
      let cls = '';
      for (let i = 0; i < rules.length; i++) {
        if (m.groups['g' + i] !== undefined) { cls = rules[i][1]; break; }
      }
      out += '<span class="tk-' + cls + '">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
    }
    out += esc(s.slice(last));
    return out;
  }

  return { run: run, norm: norm };
})();
