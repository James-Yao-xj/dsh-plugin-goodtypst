/**
 * 插件主体的集成测试：用假的 `ctx` 把 `apply()` 跑起来。
 *
 * 刻意**不**依赖 cordis 运行时，也**不**需要启动 DSH：插件与宿主之间只有
 * `ctx.xxx` 这一个接缝，换成记录用的假对象即可在毫秒级验证真实逻辑。
 * `defineTool` / `schemastery` 用的是真包，所以工具 schema 与配置默认值
 * 走的是和线上完全一样的代码路径。
 *   node --test test/plugin.test.js
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply, Config, PLUGIN_VERSION, inject, name as pluginName } from '../lib/index.js';

/** 一个最小的假文件系统，接口对齐 `dsh-fs`：resolve / stat / readText。 */
function fakeFs(files) {
  return {
    async resolve(path) {
      const key = path.replace(/^\.\//, '');
      if (files[key] === undefined) throw new Error(`ENOENT ${key}`);
      return { targetKey: key, displayPath: key };
    },
    async stat(target) {
      const data = files[target.targetKey];
      if (data === undefined) return undefined;
      return { version: `v:${data.length}`, type: 'file', size: data.length };
    },
    async readText(target) {
      return files[target.targetKey].toString('utf8');
    }
  };
}

/** 把插件装上，返回工具表与调用辅助函数。 */
function mount(files = {}, overrides = {}) {
  const tools = new Map();
  const ctx = {
    fs: fakeFs(files),
    tools: { register: (tool) => tools.set(tool.name, tool) }
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

  return { tools, call, render };
}

const DOC = ['#set page(width: 10cm)', '= 你好，Typst', '', '一段正文。'].join('\n');

test('插件身份与依赖声明', () => {
  assert.equal(pluginName, 'goodtypst');
  assert.deepEqual(inject, ['tools', 'fs']);
  assert.equal(PLUGIN_VERSION, '0.1.0');
});

test('默认配置走 cordis.patch.yml 里承诺的那套值', () => {
  const config = Config({});
  assert.equal(config.typstBinary, 'typst');
  assert.equal(config.maxSourceBytes, 4194304);
});

test('注册且只注册一个工具，名字符合 goodtypst_ 前缀', () => {
  const { tools } = mount();
  assert.deepEqual([...tools.keys()], ['goodtypst_status']);
});

test('不给 path 时只回报插件状态，不碰文件系统', async () => {
  const { call, render } = mount();
  const value = await call('goodtypst_status', {});
  assert.deepEqual(value, {
    ready: true,
    pluginVersion: '0.1.0',
    typstBinary: 'typst',
    maxSourceBytes: 4194304
  });

  const text = render('goodtypst_status', {}, value);
  assert.match(text, /已加载/);
  assert.match(text, /typst/);
});

test('给了 path 时读出字符数、行数与首行', async () => {
  const { call, render } = mount({ 'doc/main.typ': DOC });
  const value = await call('goodtypst_status', { path: 'doc/main.typ' });
  assert.equal(value.path, 'doc/main.typ');
  assert.equal(value.chars, DOC.length);
  assert.equal(value.lines, DOC.split('\n').length);
  assert.equal(value.firstLine, '#set page(width: 10cm)');
  assert.match(render('goodtypst_status', { path: 'doc/main.typ' }, value), /4 行/);
});

test('文件不存在时明确报错，而不是返回一份空状态', async () => {
  const { call } = mount({});
  await assert.rejects(() => call('goodtypst_status', { path: 'nope.typ' }), /ENOENT|找不到/);
});

test('超过 maxSourceBytes 就拒绝读取', async () => {
  const { call } = mount({ 'big.typ': 'x'.repeat(64) }, { maxSourceBytes: 16 });
  await assert.rejects(() => call('goodtypst_status', { path: 'big.typ' }), /maxSourceBytes/);
});
