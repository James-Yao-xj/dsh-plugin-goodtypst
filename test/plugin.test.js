/**
 * 插件主体的集成测试：用假的 `ctx` 把 `apply()` 跑起来。
 *
 * 不启动 DSH，也不依赖 cordis 运行时：插件与宿主之间只有 `ctx.xxx` 这一个接缝。
 * `defineTool` / `schemastery` 用真包，所以工具 schema 与配置默认值走的是
 * 和线上完全一样的代码路径。
 *   node --test test/plugin.test.js
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply, Config, PLUGIN_VERSION, inject, name as pluginName } from '../lib/index.js';

/**
 * 一个最小的假文件系统：接口对齐 `dsh-fs` 的 resolve / stat / readText / writeText。
 * @param files - 初始文件表（key 到 Buffer）。
 */
function fakeFs(files = {}) {
  const writes = new Map();
  const policies = new Map();
  return {
    writes,
    policies,
    async resolve(path) {
      const key = path.replace(/^\.\//, '');
      return { targetKey: key, displayPath: key };
    },
    async stat(target) {
      const data = files[target.targetKey];
      if (data === undefined) return undefined;
      return { version: `v:${data.length}`, type: 'file', size: data.length };
    },
    async readText(target) {
      const data = files[target.targetKey];
      if (data === undefined) throw new Error(`ENOENT ${target.targetKey}`);
      return data.toString('utf8');
    },
    async writeText(target, content, _expected, _signal, policy) {
      writes.set(target.targetKey, content);
      policies.set(target.targetKey, policy);
      files[target.targetKey] = Buffer.from(content);
      return { operation: 'create', version: 'v1', before: null, after: content };
    }
  };
}

/** 把插件装上，返回工具表、系统提示段与调用辅助函数。 */
function mount(files = {}, overrides = {}, policy = undefined) {
  const tools = new Map();
  const sections = [];
  const fs = fakeFs(files);
  const ctx = {
    fs,
    get: (service) => (service === 'sandboxPolicy' && policy !== undefined ? policy : undefined),
    tools: { register: (tool) => tools.set(tool.name, tool) },
    systemPrompt: {
      section: (section) => {
        sections.push(section);
        return () => {};
      }
    }
  };
  apply(ctx, Config(overrides));

  const session = { header: { cwd: '/workspace' } };
  const exec = { agent: { session }, signal: undefined };
  const call = (toolName, args) => tools.get(toolName).execute(args, exec);
  const render = (toolName, args, value) =>
    tools
      .get(toolName)
      .output.render(args, value)
      .map((part) => part.text)
      .join('\n');

  return { tools, sections, fs, call, render };
}

test('插件身份与依赖声明', () => {
  assert.equal(pluginName, 'goodtypst');
  assert.deepEqual(inject, ['tools', 'fs', 'systemPrompt']);
  assert.equal(PLUGIN_VERSION, '0.4.0');
});

test('默认配置走 cordis.patch.yml 里承诺的那套值', () => {
  const config = Config({});
  assert.equal(config.typstBinary, 'typst');
  assert.equal(config.maxSourceBytes, 4194304);
});

test('注册四个工具，名字都带 goodtypst_ 前缀', () => {
  const { tools } = mount();
  assert.deepEqual([...tools.keys()], ['goodtypst_status', 'goodtypst_templates', 'goodtypst_new', 'goodtypst_check']);
});

test('注册一段系统提示，里面写清两种文稿与关键禁令', () => {
  const { sections } = mount();
  assert.equal(sections.length, 1);
  const text = sections[0].text({});
  assert.match(text, /阅读文稿/);
  assert.match(text, /演示文稿/);
  assert.match(text, /带边框或底色的卡片/);
  assert.match(text, /五彩斑斓/);
  assert.equal(sections[0].interpolate, false);
});

test('不给 path 时只回报插件状态', async () => {
  const { call, render } = mount();
  const value = await call('goodtypst_status', {});
  assert.deepEqual(value, {
    ready: true,
    pluginVersion: '0.4.0',
    typstBinary: 'typst',
    maxSourceBytes: 4194304,
    templates: ['reading', 'slides']
  });
  assert.match(render('goodtypst_status', {}, value), /reading/);
});

test('模板清单给出两种类型与强制约束', async () => {
  const { call } = mount();
  const value = await call('goodtypst_templates', {});
  assert.deepEqual(value.kinds.map((kind) => kind.id), ['reading', 'slides']);
  const slides = value.kinds.find((kind) => kind.id === 'slides');
  assert.ok(slides.files.includes('template.typ'));
  assert.ok(slides.constraints.some((line) => line.includes('卡片')));
});

test('起稿阅读文稿：写一个文件，元数据落到标题页', async () => {
  const { call, fs, render } = mount();
  const value = await call('goodtypst_new', {
    kind: 'reading',
    path: 'notes/Lesson2.typ',
    title: '第二讲',
    subtitle: 'bits, byte and Integers',
    meta: '笔记整理自2026年9月10日课程',
    running_header: 'Introduction to Computer System'
  });
  assert.deepEqual(value.files, ['notes/Lesson2.typ']);
  const source = fs.writes.get('notes/Lesson2.typ');
  assert.match(source, /#let doc-title = "第二讲"/);
  assert.match(source, /#let doc-subtitle = "bits, byte and Integers"/);
  assert.match(source, /@preview\/ctyp/);
  assert.match(render('goodtypst_new', {}, value), /notes\/Lesson2\.typ/);
});

test('起稿演示文稿：同时写模板、正文与校徽', async () => {
  const { call, fs } = mount();
  const value = await call('goodtypst_new', {
    kind: 'slides',
    path: 'talk/slides.typ',
    title: '示例标题',
    subtitle: '操作驱动的视觉问答',
    author: '姚行健',
    institute: '北京大学信息科学技术学院',
    date: '2026 年 10 月 14 日'
  });
  assert.deepEqual(value.files, ['talk/slides.typ', 'talk/template.typ', 'talk/assets/images/pku-logo.svg']);
  assert.match(fs.writes.get('talk/slides.typ'), /#let deck-title = "示例标题"/);
  assert.match(fs.writes.get('talk/template.typ'), /#let pku-theme/);
  assert.match(fs.writes.get('talk/assets/images/pku-logo.svg'), /data:image\/png;base64/);
});

test('把会话的沙箱策略交给 writeText，否则受限文件系统会拦掉工作区内写入', async () => {
  const policy = { resolve: () => ({ mode: 'workspace-write', workspaceRoot: '/workspace' }) };
  const { call, fs } = mount({}, {}, policy);
  await call('goodtypst_new', { kind: 'reading', path: 'notes/a.typ' });
  assert.deepEqual(fs.policies.get('notes/a.typ'), { mode: 'workspace-write', workspaceRoot: '/workspace' });
});

test('不覆盖已存在的文件', async () => {
  const { call } = mount({ 'notes/old.typ': 'x' });
  await assert.rejects(() => call('goodtypst_new', { kind: 'reading', path: 'notes/old.typ' }), /已存在/);
});

test('写入被文件策略拦下时，报错改成能照着做的一句话', async () => {
  const { call, fs } = mount();
  fs.writeText = async () => {
    const error = new Error('sandbox denied');
    error.code = 'FS_SANDBOX_DENIED';
    throw error;
  };
  await assert.rejects(() => call('goodtypst_new', { kind: 'reading', path: 'a.typ' }), /文件策略不允许写这个位置/);
});

test('两种文稿都不允许直角引号', async () => {
  const reading = ['// GoodTypst:content', '= 标题', '他说“不行”。'].join('\n').replace('“', '\u300c').replace('”', '\u300d');
  const readingMount = mount({ 'a.typ': reading });
  const readingValue = await readingMount.call('goodtypst_check', { kind: 'reading', path: 'a.typ' });
  assert.ok(readingValue.violations.some((v) => v.rule === 'reading.quotes'));

  const slides = ['// GoodTypst:content', '#slide(title: "标题", section: "语境")[正文]', '备注\u300c引用\u300d'].join('\n');
  const slidesMount = mount({ 'b.typ': slides });
  const slidesValue = await slidesMount.call('goodtypst_check', { kind: 'slides', path: 'b.typ' });
  assert.ok(slidesValue.violations.some((v) => v.rule === 'slides.quotes'));
});

test('kind 写错时给出可选值', async () => {
  const { call } = mount();
  await assert.rejects(() => call('goodtypst_new', { kind: 'paper', path: 'a.typ' }), /reading 或 slides/);
  await assert.rejects(() => call('goodtypst_check', { kind: 'paper', path: 'a.typ' }), /reading 或 slides/);
});

test('风格检查：干净的阅读文稿通过', async () => {
  const { call } = mount();
  const scaffolded = (await call('goodtypst_new', { kind: 'reading', path: 'ok.typ' })).files;
  assert.deepEqual(scaffolded, ['ok.typ']);
  const value = await call('goodtypst_check', { kind: 'reading', path: 'ok.typ' });
  assert.equal(value.ok, true);
  assert.deepEqual(value.violations, []);
});

test('风格检查：彩色卡片会被拦下并给出行号', async () => {
  const body = [
    '// GoodTypst:content',
    '= 第一节',
    '#rect(fill: rgb("#ff0000"))[彩色卡片]',
    '#highlight[高亮]',
    '#columns(2)[左][右]',
    '#set page(margin: 0cm)'
  ].join('\n');
  const { call, render } = mount({ 'bad.typ': body });
  const value = await call('goodtypst_check', { kind: 'reading', path: 'bad.typ' });
  assert.equal(value.ok, false);
  const rules = value.violations.map((violation) => violation.rule);
  for (const rule of ['reading.fill', 'reading.color', 'reading.card', 'reading.highlight', 'reading.columns', 'reading.page']) {
    assert.ok(rules.includes(rule), `缺少 ${rule}`);
  }
  assert.ok(value.violations.every((violation) => violation.line >= 1));
  assert.match(render('goodtypst_check', {}, value), /第 3 行/);
});

test('风格检查：演示文稿的带框卡片与并列结构都是 error', async () => {
  const body = [
    '// GoodTypst:content',
    '#slide(title: "结论", section: "语境")[',
    '  #box(width: 100%, stroke: 1pt)[带框卡片]',
    '  #keypoint("无框", [可以两列])',
    '  #grid(columns: (1fr, 1fr), [#keypoint("A", [x])], [#keypoint("B", [y])])',
    ']'
  ].join('\n');
  const { call } = mount({ 'deck.typ': body });
  const value = await call('goodtypst_check', { kind: 'slides', path: 'deck.typ' });
  assert.equal(value.ok, false);
  const rules = value.violations.map((violation) => violation.rule);
  assert.ok(rules.includes('slides.box'));
  assert.ok(!rules.includes('slides.rect'));
  assert.ok(rules.includes('slides.columns'));
  assert.equal(value.violations.filter((violation) => violation.rule === 'slides.box').length, 1);
});
