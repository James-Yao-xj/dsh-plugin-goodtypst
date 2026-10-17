/**
 * 风格检查的单元测试：规则表是这一层的唯一真相，逐条钉住。
 *   node --test test/style.test.js
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONTENT_MARKER, contentRegion, lint } from '../lib/style.js';
import { readingSource, slidesSources } from '../lib/templates.js';

const READING_OPTIONS = { title: '第一讲', subtitle: '主题', meta: '整理', runningHeader: 'CS:APP' };
const SLIDES_OPTIONS = { title: 'T', subtitle: 'S', author: 'A', institute: 'I', date: 'D' };

/** 取某类违规的规则 id 列表。 */
const rulesOf = (result) => result.violations.map((violation) => violation.rule);

test('模板自身生成的内容通过检查（前导不参与）', () => {
  const reading = lint(readingSource(READING_OPTIONS), 'reading');
  assert.equal(reading.ok, true, JSON.stringify(reading.violations));
  assert.equal(reading.hasMarker, true);

  const { deck } = slidesSources(SLIDES_OPTIONS);
  const slides = lint(deck, 'slides');
  assert.equal(slides.ok, true, JSON.stringify(slides.violations));
});

test('标记之前的版式前导不参与检查', () => {
  const source = ['#set page(margin: 0cm)', CONTENT_MARKER, '= 标题', '正文'].join('\n');
  const result = lint(source, 'reading');
  assert.ok(!rulesOf(result).includes('reading.page'));
});

test('阅读文稿：颜色、卡片、多栏、改版式全部报 error', () => {
  const body = [
    CONTENT_MARKER,
    '= 第一节',
    '#text(fill: red)[红字]',
    '#rect(fill: rgb("#fff"))[卡片]',
    '#block[块]',
    '#highlight[高亮]',
    '#grid(columns: 2)[左][右]',
    '#set page(margin: 0cm)',
    '#set text(size: 9pt)',
    '#show heading: it => it'
  ].join('\n');
  const result = lint(body, 'reading');
  assert.equal(result.ok, false);
  const rules = rulesOf(result);
  for (const rule of [
    'reading.fill',
    'reading.color',
    'reading.card',
    'reading.block',
    'reading.highlight',
    'reading.columns',
    'reading.page',
    'reading.text',
    'reading.show'
  ]) {
    assert.ok(rules.includes(rule), `缺少 ${rule}`);
  }
});

test('演示文稿：带框卡片报 error，无框两列与主题色不报', () => {
  const body = [
    CONTENT_MARKER,
    '#slide(title: "结论", section: "语境")[',
    '  #box(width: 100%, stroke: 1pt)[卡片]',
    '  #rect(fill: pku-light)[卡片]',
    '  #grid(columns: (1fr, 1fr), column-gutter: 0.7cm, [#keypoint("A", [x])], [#keypoint("B", [y])])',
    '  #text(size: 17pt, fill: pku-red)[强调]',
    ']'
  ].join('\n');
  const result = lint(body, 'slides');
  assert.equal(result.ok, false);
  const rules = rulesOf(result);
  assert.ok(rules.includes('slides.box'));
  assert.ok(rules.includes('slides.rect'));
  assert.ok(!rules.some((rule) => rule.startsWith('slides.fill')), '主题色 fill 不该被拦');
});

test('演示文稿：自定义颜色与表格分别报 error / warn', () => {
  const body = [
    CONTENT_MARKER,
    '#text(fill: rgb("#123456"))[自定义色]',
    '#text(fill: #a1b2c3)[十六进制]',
    '#table(columns: 2, [a], [b])'
  ].join('\n');
  const result = lint(body, 'slides');
  const colors = result.violations.filter((violation) => violation.rule === 'slides.color');
  assert.equal(colors.length, 2);
  assert.equal(colors[0].level, 'error');
  assert.ok(rulesOf(result).includes('slides.table'));
  assert.ok(rulesOf(result).includes('slides.density') === false);
});

test('没有模板标记时给一条 warn，并整份参与检查', () => {
  const result = lint('= 标题\n#rect(fill: red)[卡片]', 'reading');
  assert.equal(result.ok, false);
  assert.ok(rulesOf(result).includes('reading.marker'));
  assert.ok(rulesOf(result).includes('reading.card'));
});

test('未知类型直接报错，不返回一份「看起来通过」的结果', () => {
  assert.throws(() => lint('= x', 'paper'), /未知的文稿类型/);
});

test('contentRegion 给出行号偏移', () => {
  const source = ['前导一', '前导二', CONTENT_MARKER, '正文'].join('\n');
  const region = contentRegion(source);
  assert.equal(region.hasMarker, true);
  assert.equal(region.offsetLine, 2);
  assert.ok(region.text.startsWith(CONTENT_MARKER));
});
