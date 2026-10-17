/**
 * 模板装配的单元测试：不碰 ctx，只验证「读模板 + 填元数据」这一层。
 *   node --test test/templates.test.js
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TEMPLATE_KINDS, readingSource, scaffold, setVariable, slidesSources } from '../lib/templates.js';

test('两种模板都在清单里，且各有文件与约束', () => {
  assert.deepEqual(TEMPLATE_KINDS.map((kind) => kind.id), ['reading', 'slides']);
  for (const kind of TEMPLATE_KINDS) {
    assert.ok(kind.files.length > 0);
    assert.ok(kind.constraints.length > 0);
    assert.ok(kind.useWhen.length > 0);
  }
});

test('setVariable 只改指定那一行，并做字符串转义', () => {
  const source = '#let a = "old"\n#let b = "keep"\n';
  const updated = setVariable(source, 'a', '带"引号"和\\反斜杠');
  assert.equal(updated.split('\n')[0], '#let a = "带\\"引号\\"和\\\\反斜杠"');
  assert.equal(updated.split('\n')[1], '#let b = "keep"');
});

test('setVariable 找不到变量时报错，而不是静默写坏模板', () => {
  assert.throws(() => setVariable('#let a = "x"\n', 'missing', 'v'), /missing/);
});

test('阅读文稿只产出一个文件，保留 ctyp 前导与内容标记', () => {
  const source = readingSource({ title: '第一讲', subtitle: '主题', meta: '整理于课上', runningHeader: 'CS:APP' });
  assert.match(source, /#let doc-title = "第一讲"/);
  assert.match(source, /#let doc-running-header = "CS:APP"/);
  assert.match(source, /@preview\/ctyp/);
  assert.match(source, /\/\/ GoodTypst:content/);
  assert.match(source, /#set heading\(numbering: "1\."\)/);
});

test('演示文稿产出主题、正文与内嵌校徽', () => {
  const { deck, theme, logo } = slidesSources({
    title: '示例标题',
    subtitle: '副标题',
    author: '作者',
    institute: '单位',
    date: '日期'
  });
  assert.match(deck, /#let deck-title = "示例标题"/);
  assert.match(deck, /#show: doc => pku-theme/);
  assert.match(theme, /#let slide\(/);
  assert.match(theme, /#let keypoint\(/);
  assert.match(theme, /presentation-4-3/);
  assert.match(logo, /data:image\/png;base64/);
});

test('scaffold 把文件放到入口文件同级的正确位置', () => {
  const reading = scaffold('reading', 'notes/a.typ', { title: 't', subtitle: 's', meta: 'm', runningHeader: 'r' });
  assert.deepEqual(reading.map((file) => file.path), ['notes/a.typ']);

  const slides = scaffold('slides', 'talk/slides.typ', {
    title: 't',
    subtitle: 's',
    author: 'a',
    institute: 'i',
    date: 'd'
  });
  assert.deepEqual(slides.map((file) => file.path), [
    'talk/slides.typ',
    'talk/template.typ',
    'talk/assets/images/pku-logo.svg'
  ]);
});

test('scaffold 拒绝未知类型', () => {
  assert.throws(() => scaffold('paper', 'a.typ', {}), /未知的文稿类型/);
});
