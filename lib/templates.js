/**
 * 模板装配层：读取随包分发的两份模板，把标题、作者这类元数据塞进去。
 *
 * 模板本身是可直接编译的 `.typ` 文件（`templates/`），这里只做两件事：
 *   1. 读文件（`loadTemplate`）——打包进插件，不依赖用户的 typst 包缓存；
 *   2. 替换文件顶部那几个 `#let xxx = "..."` 变量，其余逐字不动。
 *
 * 这样「模板长什么样」和「脚手架生成什么」只有一份真相：改 `templates/` 即可。
 *
 * @module dsh-plugin-goodtypst/templates
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** 模板根目录（`templates/`），相对本文件解析，安装到 profile 后依然有效。 */
const TEMPLATE_ROOT = new URL('../templates/', import.meta.url);

/** 风格提示词目录（`prompts/`）。 */
const PROMPT_ROOT = new URL('../prompts/', import.meta.url);

/**
 * 一种文稿模板的说明，供 `goodtypst_templates` 与系统提示使用。
 * @typedef {{ id: string, label: string, useWhen: string, files: string[], constraints: string[] }} TemplateInfo
 */

/** @type {TemplateInfo[]} */
export const TEMPLATE_KINDS = [
  {
    id: 'reading',
    label: '阅读文稿',
    useWhen: '课程笔记、讲稿整理、长文阅读；A4 纵向、单栏、纯黑白。',
    files: ['<name>.typ'],
    constraints: [
      '整份文档只有黑白灰，没有任何颜色、底色、高亮',
      '不用卡片容器（rect / box / block）、不用多栏（columns / grid）',
      '页眉页脚、字体、编号由模板固定，不写 #set page / #set text / #show',
      '表格、代码块、图片一律居中'
    ]
  },
  {
    id: 'slides',
    label: '演示文稿',
    useWhen: '课程汇报、论文分享、答辩；4:3、PKU 配色、一页一个论点。',
    files: ['<name>.typ', 'template.typ', 'assets/images/pku-logo.svg'],
    constraints: [
      '一页一个论点：title 是结论，section 是这句结论的语境',
      '禁止带边框或底色的卡片（rect / box / block 配 stroke / fill）',
      '不用表格；对比用无框 keypoint 两列',
      '颜色只来自主题变量 pku-red / pku-blue / pku-gray / pku-light / accent',
      '一页正文不超过 60 个汉字，长句拆成要点'
    ]
  }
];

/**
 * 读一份模板文件。
 * @param relativePath - 相对 `templates/` 的路径，例如 `reading.typ`。
 * @returns 文件全文。
 */
export function loadTemplate(relativePath) {
  return readFileSync(new URL(relativePath, TEMPLATE_ROOT), 'utf8');
}

/**
 * 读一份风格提示词（Markdown）。
 * @param id - `reading` 或 `slides`。
 * @returns 提示词全文。
 */
export function loadPrompt(id) {
  return readFileSync(new URL(`${id}.md`, PROMPT_ROOT), 'utf8');
}

/**
 * 把 `#let name = "..."` 这一行换成新值。
 *
 * 值用 `JSON.stringify` 转义——Typst 字符串的 `\"`、`\\`、`\n` 转义与 JSON 一致，
 * 所以引号、反斜杠、换行都不会把模板改坏。
 * @param source - 模板全文。
 * @param name - 变量名。
 * @param value - 新值。
 * @returns 替换后的全文。
 */
export function setVariable(source, name, value) {
  const prefix = `#let ${name} = `;
  const lines = source.split('\n');
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (index === -1) {
    throw new Error(`模板缺少变量 ${name}，模板与插件版本可能不匹配。`);
  }
  lines[index] = `${prefix}${JSON.stringify(value)}`;
  return lines.join('\n');
}

/**
 * 生成阅读文稿。
 * @param options - 标题页与页眉的四个字段。
 * @returns 单文件源文本。
 */
export function readingSource(options) {
  let source = loadTemplate('reading.typ');
  source = setVariable(source, 'doc-title', options.title);
  source = setVariable(source, 'doc-subtitle', options.subtitle);
  source = setVariable(source, 'doc-meta', options.meta);
  source = setVariable(source, 'doc-running-header', options.runningHeader);
  return source;
}

/**
 * 生成演示文稿的三份文件。
 * @param options - 封面的五个字段。
 * @returns 主题、正文、校徽三份内容。
 */
export function slidesSources(options) {
  let deck = loadTemplate('slides/slides.typ');
  deck = setVariable(deck, 'deck-title', options.title);
  deck = setVariable(deck, 'deck-subtitle', options.subtitle);
  deck = setVariable(deck, 'deck-author', options.author);
  deck = setVariable(deck, 'deck-institute', options.institute);
  deck = setVariable(deck, 'deck-date', options.date);
  return {
    deck,
    theme: loadTemplate('slides/template.typ'),
    logo: loadTemplate('slides/assets/images/pku-logo.svg')
  };
}

/**
 * 算出一次脚手架要写哪些文件、各自内容是什么（纯函数，不碰磁盘）。
 * @param kind - `reading` 或 `slides`。
 * @param targetPath - 用户指定的入口 `.typ` 路径。
 * @param options - 模板元数据。
 * @returns 待写文件列表，路径相对调用方给出的目录。
 */
export function scaffold(kind, targetPath, options) {
  if (kind === 'reading') {
    return [{ path: targetPath, content: readingSource(options) }];
  }
  if (kind === 'slides') {
    const dir = dirname(targetPath);
    const { deck, theme, logo } = slidesSources(options);
    return [
      { path: targetPath, content: deck },
      { path: join(dir, 'template.typ'), content: theme },
      { path: join(dir, 'assets', 'images', 'pku-logo.svg'), content: logo }
    ];
  }
  throw new Error(`未知的文稿类型：${kind}（可选：${TEMPLATE_KINDS.map((entry) => entry.id).join('、')}）`);
}
