/**
 * GoodTypst（宿主半）—— 骨架版。
 *
 * Typst 是一套排版语言：一份 `.typ` 源文件编译成 PDF / PNG / SVG。
 * 这个插件想解决的事很小也很具体——**在会话里改 typst 稿子时，看不见排版结果**：
 * 模型改了间距、表格、公式，你看不到它长什么样；编译报错也只存在于终端里。
 *
 * 所以最终形态是三件事：
 *   1. 编译：调 `typst compile`，把源文件变成 PDF（或按页出图）；
 *   2. 读错误：编译失败时把 `typst` 的错误位置翻译成「第几行、哪个表达式」；
 *   3. 交给人看：把页面渲染成图片，既能进会话，也能在右侧栏预览。
 *
 * 骨架阶段只做一件事：证明插件能被加载——工具注册成功、配置读到了、`fs` 可用。
 * 一次性同时去摸宿主 API 和 typst CLI，出问题时不好判断是谁的错。
 *
 * @module dsh-plugin-goodtypst
 */

import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';

/** Cordis 插件名，用于加载器诊断。 */
const name = 'goodtypst';

/** 需要的服务：工具注册表 + 文件系统（读 `.typ` 源文件）。 */
const inject = ['tools', 'fs'];

/** 插件版本；状态工具里报出来，方便确认装进去的是哪一版。 */
const PLUGIN_VERSION = '0.1.0';

/** 部署侧可调参数。 */
const Config = z.object({
  /** typst 编译器可执行文件：默认走 PATH 里的 `typst`，也可以写绝对路径。 */
  typstBinary: z.string().default('typst'),
  /** 允许读取的 `.typ` 源文件字节上限；超过就报错，而不是把内存吃光。 */
  maxSourceBytes: z.natural().default(4 * 1024 * 1024)
});

/**
 * 把状态快照渲染成模型读到的那几行文本。
 * @param value - `goodtypst_status` 的返回值。
 * @returns 多行文本。
 */
function formatStatus(value) {
  const lines = [
    `GoodTypst v${value.pluginVersion} 已加载，插件本身可用。`,
    `typst 编译器配置：${value.typstBinary}（骨架阶段尚不调用）`,
    `单文件读取上限：${(value.maxSourceBytes / 1024 / 1024).toFixed(1)} MiB`
  ];
  if (value.path !== undefined) {
    lines.push(
      `源文件：${value.path}（${value.chars} 字符 / ${value.lines} 行）`,
      `首行：${value.firstLine === '' ? '（空）' : value.firstLine}`
    );
  } else {
    lines.push('想顺带检查一份 .typ 文件，就把 path 传进来。');
  }
  return lines.join('\n');
}

/**
 * 状态工具：不给 path 时回报插件自身状态；给了 path 就顺带读一眼源文件。
 * @param ctx - 插件上下文。
 * @param config - 已解析的配置。
 * @returns 工具定义。
 */
function statusTool(ctx, config) {
  return defineTool({
    name: 'goodtypst_status',
    description:
      '检查 GoodTypst 插件是否就绪（编译器配置、文件读取上限）。' +
      '传入一个 .typ 路径时，顺带返回该文件的字符数、行数和首行——用来确认路径对不对、文件是不是空的。' +
      '这个工具不会编译文档，编译能力在后续版本里加。',
    parameters: {
      path: {
        type: 'string',
        description: '可选的 .typ 源文件路径，相对当前工作目录或绝对路径。'
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ready: { type: 'boolean', required: true },
          pluginVersion: { type: 'string', required: true },
          typstBinary: { type: 'string', required: true },
          maxSourceBytes: { type: 'integer', required: true },
          path: { type: 'string' },
          chars: { type: 'integer' },
          lines: { type: 'integer' },
          firstLine: { type: 'string' }
        }
      },
      render: (_args, value) => [{ type: 'text', text: formatStatus(value) }]
    },
    async execute(args, exec) {
      /** @type {{ready: boolean, pluginVersion: string, typstBinary: string, maxSourceBytes: number, path?: string, chars?: number, lines?: number, firstLine?: string}} */
      const status = {
        ready: true,
        pluginVersion: PLUGIN_VERSION,
        typstBinary: config.typstBinary,
        maxSourceBytes: config.maxSourceBytes
      };
      if (args.path === undefined) return status;

      const target = await ctx.fs.resolve(args.path, {
        cwd: exec.agent?.session.header.cwd,
        signal: exec.signal
      });
      const info = await ctx.fs.stat(target, exec.signal);
      if (info === undefined) {
        throw new Error(`找不到文件：${args.path}`);
      }
      const bytes = info.size ?? 0;
      if (bytes > config.maxSourceBytes) {
        throw new Error(
          `${args.path} 有 ${bytes} 字节，超过 maxSourceBytes（${config.maxSourceBytes}）。` +
            `确认这就是要读的源文件，或把这一项调大再试。`
        );
      }

      const text = await ctx.fs.readText(target, exec.signal);
      const allLines = text.split('\n');
      return {
        ...status,
        path: target.displayPath ?? args.path,
        chars: text.length,
        lines: allLines.length,
        firstLine: (allLines.find((line) => line.trim() !== '') ?? '').trim().slice(0, 120)
      };
    }
  });
}

/**
 * 装上一个插件实例。
 * @param ctx - Cordis 插件上下文。
 * @param config - 已按 `Config` 解析的配置。
 */
function apply(ctx, config) {
  ctx.tools.register(statusTool(ctx, config));
}

export { apply, Config, inject, name, PLUGIN_VERSION };
