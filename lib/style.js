/**
 * 风格检查：把“不要五彩斑斓”“不要带框卡片”这类口头规矩变成可执行的 lint。
 *
 * 只做行级正则 + 少量全文检查，刻意保持简单：它拦的是最典型的那几类跑偏
 * （上色、卡片、多栏、改版式），不是 Typst 语法检查——语法交给 `typst compile`。
 *
 * 模板在正文开始处留了一行标记 `// GoodTypst:content`，标记之前是版式前导，
 * 不参与检查；没有标记（比如从零手写的文件）就整份检查。
 *
 * @module dsh-plugin-goodtypst/style
 */

/** 模板里标记“正文从这里开始”的注释行。 */
export const CONTENT_MARKER = '// GoodTypst:content';

/**
 * 一种文稿的规则表。`re` 逐行匹配，`hint` 是给模型的修改建议。
 * @typedef {{ id: string, level: 'error' | 'warn', re: RegExp, hint: string }} LineRule
 */

/** @type {Record<string, LineRule[]>} */
const LINE_RULES = {
  reading: [
    {
      id: 'reading.fill',
      level: 'error',
      re: /(^|[^\w-])fill\s*:/,
      hint: '阅读文稿只有黑白灰：去掉 fill（底色、彩色文字都算“五彩斑斓的页面”）。'
    },
    {
      id: 'reading.color',
      level: 'error',
      re: /\brgb\s*\(|\b(?:hsl|hsv|oklab|oklch|luma|cmyk)\./,
      hint: '不要写颜色常量；需要强调就用字重、字号或列表。'
    },
    {
      id: 'reading.card',
      level: 'error',
      re: /\b(?:rect|box)\s*[\(\[]/,
      hint: '不要用卡片/色块容器（rect、box）；居中用 align(center)[...]。'
    },
    {
      id: 'reading.block',
      level: 'error',
      re: /\bblock\s*[\(\[]/,
      hint: '不要用 block 分块，正文线性地写下去即可。'
    },
    {
      id: 'reading.highlight',
      level: 'error',
      re: /\bhighlight\s*[\(\[]/,
      hint: '不要高亮底色；强调用加粗 *...* 或斜体 _..._。'
    },
    {
      id: 'reading.columns',
      level: 'error',
      re: /\bcolumns\s*\(|\bgrid\s*\(/,
      hint: '不要多栏排版；表格用 table，其余内容单栏顺序写。'
    },
    {
      id: 'reading.quotes',
      level: 'error',
      re: /[\u300C\u300D]/,
      hint: '不用直角引号（U+300C / U+300D）；引文一律用“……”或者不加引号。'
    },
    {
      id: 'reading.page',
      level: 'error',
      re: /#set\s+page\s*\(/,
      hint: '页边距、页眉页脚由模板固定，不要改 #set page。'
    },
    {
      id: 'reading.text',
      level: 'error',
      re: /#set\s+text\s*\(/,
      hint: '字体由 ctyp 处理中英混排，不要改 #set text；局部字号用 #text(size: ...)。'
    },
    {
      id: 'reading.show',
      level: 'error',
      re: /#show\s+(?!:)/,
      hint: '不要自己写 show 规则，样式由模板负责。'
    }
  ],
  slides: [
    {
      id: 'slides.rect',
      level: 'error',
      re: /\brect\s*[\(\[]/,
      hint: '禁止带边框/底色的卡片（rect）；这是 AI 味最重的写法。'
    },
    {
      id: 'slides.box',
      level: 'error',
      re: /\bbox\s*[\(\[]/,
      hint: '禁止带边框/底色的卡片（box）；页眉页脚已经在模板里做好了。'
    },
    {
      id: 'slides.block',
      level: 'error',
      re: /\bblock\s*\([^)]*(?:stroke|fill)\s*:/,
      hint: '禁止用 block 做卡片（stroke/fill）；纯文字分组不带框时可以不用 block。'
    },
    {
      id: 'slides.quotes',
      level: 'error',
      re: /[\u300C\u300D]/,
      hint: '不用直角引号（U+300C / U+300D）；引文一律用“……”或者不加引号。'
    },
    {
      id: 'slides.columns',
      level: 'error',
      re: /\b(?:columns|grid)\s*\(/,
      hint: '不用并列/多栏结构；要点一条条往下写，对比用“A 是……；B 是……”的顺序陈述。'
    },
    {
      id: 'slides.metric',
      level: 'error',
      re: /\bmetric\s*[\\(\[]/,
      hint: '不用“大号数字 + 一行小字”的排版；把数字写进完整的句子里。'
    },
    {
      id: 'slides.highlight',
      level: 'error',
      re: /\bhighlight\s*[\(\[]/,
      hint: '不要高亮底色；强调用 pku-red / pku-blue 的文字颜色。'
    },
    {
      id: 'slides.color',
      level: 'error',
      re: /\brgb\s*\(|#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/,
      hint: '只能用主题变量 pku-red / pku-blue / pku-gray / pku-light / accent。'
    },
    {
      id: 'slides.page',
      level: 'error',
      re: /#set\s+page\s*\(/,
      hint: '版式由模板固定，不要改 #set page。'
    },
    {
      id: 'slides.text',
      level: 'error',
      re: /#set\s+text\s*\(/,
      hint: '字体与字号由模板固定，不要改 #set text；局部字号用 #text(size: ...)。'
    },
    {
      id: 'slides.table',
      level: 'warn',
      re: /\btable\s*\(/,
      hint: '演示文稿尽量不用表格；需要对比就按“A 是……；B 是……”的顺序陈述。'
    },
    {
      id: 'slides.density',
      level: 'warn',
      re: /^[^=\[\]#]{90,}$/,
      hint: '这一行太长：幻灯片一页正文不超过 60 个汉字，长句拆成要点。'
    }
  ]
};

/**
 * 全文级检查：缺了模板前导或结构要素时给一条 warn（不阻断）。
 * @type {Record<string, { id: string, test: (source: string, hasMarker: boolean) => boolean, hint: string }[]>}
 */
const SOURCE_RULES = {
  reading: [
    {
      id: 'reading.template',
      test: (source) => !source.includes('@preview/ctyp'),
      hint: '没有找到 ctyp 前导：这份文件可能没用 GoodTypst 阅读文稿模板起稿，版式会和样例不一致。'
    },
    {
      id: 'reading.structure',
      test: (source) => !/^=\s/m.test(source),
      hint: '没有一级标题（= ...）：正文至少应该有一个讲/章级标题。'
    }
  ],
  slides: [
    {
      id: 'slides.template',
      test: (source) => !/template\.typ/.test(source),
      hint: '没有 import 模板 template.typ：版式可能和样例不一致。'
    },
    {
      id: 'slides.structure',
      test: (source) => !/#slide\s*\(/.test(source),
      hint: '没有 #slide(...)：演示文稿的每一页都用 #slide(title:, section:)[...]。'
    }
  ]
};

/** 所有合法的文稿类型。 */
export const KINDS = ['reading', 'slides'];

/**
 * 把源文件切成“参与检查的正文”和它前面的标记偏移。
 * @param source - 完整源文件。
 * @returns 正文文本、行号偏移、是否找到标记。
 */
export function contentRegion(source) {
  const at = source.indexOf(CONTENT_MARKER);
  if (at === -1) return { text: source, offsetLine: 0, hasMarker: false };
  const offsetLine = source.slice(0, at).split('\n').length - 1;
  return { text: source.slice(at), offsetLine, hasMarker: true };
}

/**
 * 检查一份 Typst 源文件是否符合该文稿类型的风格约束。
 * @param source - 源文件全文。
 * @param kind - `reading` 或 `slides`。
 * @returns 检查结果：`ok` 为真表示没有 error。
 */
export function lint(source, kind) {
  const rules = LINE_RULES[kind];
  if (rules === undefined) {
    throw new Error(`未知的文稿类型：${kind}（可选：${KINDS.join('、')}）`);
  }

  const { text, offsetLine, hasMarker } = contentRegion(source);
  /** @type {{ line: number, level: 'error' | 'warn', rule: string, text: string, hint: string }[]} */
  const violations = [];

  text.split('\n').forEach((raw, index) => {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('//')) return;
    for (const rule of rules) {
      if (rule.re.test(raw)) {
        violations.push({
          line: index + 1 + offsetLine,
          level: rule.level,
          rule: rule.id,
          text: trimmed.slice(0, 120),
          hint: rule.hint
        });
      }
    }
  });

  if (!hasMarker) {
    violations.push({
      line: 1,
      level: 'warn',
      rule: `${kind}.marker`,
      text: '',
      hint: `没有找到模板标记 ${CONTENT_MARKER}：整份文件都参与检查，可能连版式前导一起报错。`
    });
  }
  for (const rule of SOURCE_RULES[kind] ?? []) {
    if (rule.test(source, hasMarker)) {
      violations.push({ line: 1, level: 'warn', rule: rule.id, text: '', hint: rule.hint });
    }
  }

  violations.sort((left, right) => left.line - right.line || left.level.localeCompare(right.level));
  return {
    kind,
    ok: violations.every((violation) => violation.level !== 'error'),
    hasMarker,
    violations,
    stats: { lines: source.split('\n').length, chars: source.length }
  };
}
