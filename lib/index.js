/**
 * GoodTypst（宿主半）。
 *
 * Typst 是一套排版语言：一份 `.typ` 源文件编译成 PDF / PNG / SVG。
 * 这个插件解决的事很具体——**在会话里写 typst 稿子时，看不见排版结果，
 * 也守不住版式**：模型很容易把阅读笔记写成五彩斑斓的卡片堆，
 * 把幻灯片写成左右两块带框的对比框。
 *
 * 所以这里做三件事：
 *   1. 内置两份模板（阅读文稿 / 演示文稿），与用户认可的样例逐字同版式；
 *   2. 四个工具：查状态、列模板、按模板起稿、按风格自查；
 *   3. 一段系统提示：用户说「用 Typst 写文稿」时先问要哪一种，再按模板走。
 *
 * 编译与出图还没做（见 README 的路线）；现在这一层的职责是「写对版式」。
 *
 * @module dsh-plugin-goodtypst
 */

import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { KINDS, lint } from './style.js';
import { TEMPLATE_KINDS, loadPrompt, scaffold } from './templates.js';

/** Cordis 插件名，用于加载器诊断。 */
const name = 'goodtypst';

/** 需要的服务：工具注册表、文件系统、系统提示。 */
const inject = ['tools', 'fs', 'systemPrompt'];

/** 插件版本；状态工具里报出来，方便确认装进去的是哪一版。 */
const PLUGIN_VERSION = '0.3.0';

/** 部署侧可调参数。 */
const Config = z.object({
  /** typst 编译器可执行文件：默认走 PATH 里的 `typst`，也可以写绝对路径。 */
  typstBinary: z.string().default('typst'),
  /** 允许读取的 `.typ` 源文件字节上限；超过就报错，而不是把内存吃光。 */
  maxSourceBytes: z.natural().default(4 * 1024 * 1024)
});

/** 起稿时各字段的兜底值：调用方没给就用模板里的占位文案。 */
const DEFAULTS = {
  reading: {
    title: '标题',
    subtitle: '副标题',
    meta: '笔记整理',
    runningHeader: '课程名'
  },
  slides: {
    title: '标题',
    subtitle: '一句话副标题',
    author: '作者',
    institute: '北京大学信息科学技术学院',
    date: '日期'
  }
};

/** 系统提示里的路由段：决定「先问哪一句」。 */
const ROUTING = `## Typst 文稿（GoodTypst）

用户要求用 Typst 写文稿、笔记、讲稿或幻灯片时：

1. **先确认载体**：阅读文稿（A4 纵向长文：课程笔记、讲稿、阅读材料）还是演示文稿（4:3 幻灯片：汇报、分享、答辩）。用户没说清就问一句，不要替他猜，也不要同时做两种。
2. **用模板起稿**：调用 \`goodtypst_new\`（kind 为 \`reading\` 或 \`slides\`）在用户指定的路径生成模板副本，再往里面写内容。不要从零手写版式。
3. **写完自查**：调用 \`goodtypst_check\`，把 error 全部清掉再交付；warn 尽量改。
4. 模板里的版式前导（\`#set page\`、字体、主题函数）一行都不要改。

下面两节是硬性风格约束，与其他写作习惯冲突时以这里为准。`;

/**
 * 拼出系统提示正文：路由段 + 两份风格约束。
 * @param onError - 读不到提示词时的回调（不打断插件加载）。
 * @returns 提示词全文。
 */
function composeStyleGuide(onError) {
  const parts = [ROUTING];
  for (const id of ['reading', 'slides']) {
    try {
      parts.push(loadPrompt(id));
    } catch (error) {
      onError?.(`[goodtypst] 读不到风格提示词 ${id}.md：${error.message}`);
    }
  }
  return parts.join('\n\n');
}

/**
 * 把状态快照渲染成模型读到的那几行文本。
 * @param value - `goodtypst_status` 的返回值。
 * @returns 多行文本。
 */
function formatStatus(value) {
  const lines = [
    `GoodTypst v${value.pluginVersion} 已加载，插件本身可用。`,
    `typst 编译器配置：${value.typstBinary}（编译工具还没接，目前不调用）`,
    `单文件读取上限：${(value.maxSourceBytes / 1024 / 1024).toFixed(1)} MiB`,
    `可用模板：${value.templates.join('、')}`
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
 * 状态工具：插件是否就绪；给了 path 就顺带读一眼源文件。
 * @param ctx - 插件上下文。
 * @param config - 已解析的配置。
 * @returns 工具定义。
 */
function statusTool(ctx, config) {
  return defineTool({
    name: 'goodtypst_status',
    description:
      '检查 GoodTypst 插件是否就绪（编译器配置、文件读取上限、可用模板）。' +
      '传入一个 .typ 路径时，顺带返回该文件的字符数、行数和首行——用来确认路径对不对、文件是不是空的。',
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
          templates: { type: 'array', required: true, items: { type: 'string' } },
          path: { type: 'string' },
          chars: { type: 'integer' },
          lines: { type: 'integer' },
          firstLine: { type: 'string' }
        }
      },
      render: (_args, value) => [{ type: 'text', text: formatStatus(value) }]
    },
    async execute(args, exec) {
      const status = {
        ready: true,
        pluginVersion: PLUGIN_VERSION,
        typstBinary: config.typstBinary,
        maxSourceBytes: config.maxSourceBytes,
        templates: TEMPLATE_KINDS.map((entry) => entry.id)
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
 * 模板清单工具：让模型在两个模板之间做选择，而不是自己发明版式。
 * @returns 工具定义。
 */
function templatesTool() {
  return defineTool({
    name: 'goodtypst_templates',
    description:
      '列出 GoodTypst 内置的两种文稿模板：reading（阅读文稿，A4 单栏黑白）与 slides（演示文稿，4:3 PKU 配色）。' +
      '用户要写 Typst 文稿但还没说清是哪种时，用这个工具对照两者的适用场景再问一句。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kinds: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                label: { type: 'string', required: true },
                useWhen: { type: 'string', required: true },
                files: { type: 'array', required: true, items: { type: 'string' } },
                constraints: { type: 'array', required: true, items: { type: 'string' } }
              }
            }
          }
        }
      },
      render: (_args, value) => [{ type: 'text', text: formatTemplates(value) }]
    },
    async execute() {
      return { kinds: TEMPLATE_KINDS };
    }
  });
}

/**
 * 把模板清单渲染成模型读到的文本。
 * @param value - `goodtypst_templates` 的返回值。
 * @returns 多行文本。
 */
function formatTemplates(value) {
  const blocks = value.kinds.map((kind) => {
    const lines = [`【${kind.label}】kind = "${kind.id}"`, `适用：${kind.useWhen}`, `文件：${kind.files.join('、')}`, '约束：'];
    for (const constraint of kind.constraints) lines.push(`  - ${constraint}`);
    return lines.join('\n');
  });
  blocks.push('不确定用户要哪一种时，直接问：「要阅读文稿（课程笔记那种长文）还是演示文稿（汇报用的幻灯片）？」');
  return blocks.join('\n\n');
}

/**
 * 取本次调用要盖上的沙箱策略。
 *
 * 宿主的 write / edit 工具会把会话的 standing policy 一起交给 `ctx.fs.writeText`；
 * 不传的话受限文件系统按默认拒绝处理，连工作区内的写入都会被拦。所以这里做同一件事：
 * 从 `sandboxPolicy` 服务取当前会话的策略，顺便把 `workspaceRoot` 当相对路径的基准。
 * @param ctx - 插件上下文。
 * @param exec - 工具执行上下文。
 * @returns 策略对象；没有挂载受限文件系统时为 undefined。
 */
function standingSandboxPolicy(ctx, exec) {
  const policy = typeof ctx.get === 'function' ? ctx.get('sandboxPolicy') : undefined;
  if (policy === undefined) return undefined;
  return policy.resolve(exec.agent === undefined ? {} : { session: exec.agent.session });
}

/**
 * 起稿工具：把模板复制到用户指定的路径，并填好标题页的元数据。
 * @param ctx - 插件上下文。
 * @param config - 已解析的配置。
 * @returns 工具定义。
 */
function newTool(ctx, config) {
  return defineTool({
    name: 'goodtypst_new',
    description:
      '用 GoodTypst 模板起一份 Typst 文稿：kind 选 reading（A4 单栏黑白阅读文稿）或 slides（4:3 PKU 配色演示文稿），' +
      'path 是要创建的入口 .typ 路径。阅读文稿写一个文件；演示文稿同时写 template.typ 与 assets/images/pku-logo.svg。' +
      '已存在的文件不会被覆盖。起稿之后往模板里填内容，不要改版式前导。',
    parameters: {
      kind: {
        type: 'string',
        required: true,
        description: `文稿类型：${KINDS.join('（阅读文稿）或 ')}（演示文稿）。`
      },
      path: {
        type: 'string',
        required: true,
        description: '入口 .typ 文件路径，相对当前工作目录或绝对路径；父目录会自动创建。'
      },
      title: { type: 'string', description: '阅读文稿：第几讲（如「第二讲」）；演示文稿：封面主标题。' },
      subtitle: { type: 'string', description: '副标题：阅读文稿写本讲主题，演示文稿写一句话副标题。' },
      meta: { type: 'string', description: '阅读文稿标题页下面的说明，如「笔记整理自2026年9月10日课程」。' },
      running_header: { type: 'string', description: '阅读文稿页眉里的课程名，如「Introduction to Computer System」。' },
      author: { type: 'string', description: '演示文稿封面作者。' },
      institute: { type: 'string', description: '演示文稿封面单位，如「北京大学信息科学技术学院」。' },
      date: { type: 'string', description: '演示文稿封面日期。' }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true },
          entry: { type: 'string', required: true },
          files: { type: 'array', required: true, items: { type: 'string' } },
          reminder: { type: 'string', required: true }
        }
      },
      render: (_args, value) => [{ type: 'text', text: formatNew(value) }]
    },
    async execute(args, exec) {
      if (!KINDS.includes(args.kind)) {
        throw new Error(`kind 只能是 ${KINDS.join(' 或 ')}（收到 ${args.kind ?? '空'}）。`);
      }
      if (typeof args.path !== 'string' || args.path.trim() === '') {
        throw new Error('path 不能为空：请给出入口 .typ 的路径。');
      }

      const options = {
        ...DEFAULTS[args.kind],
        title: args.title,
        subtitle: args.subtitle,
        meta: args.meta,
        runningHeader: args.running_header,
        author: args.author,
        institute: args.institute,
        date: args.date
      };
      for (const key of Object.keys(options)) {
        if (options[key] === undefined) options[key] = DEFAULTS[args.kind][key];
      }

      const policy = standingSandboxPolicy(ctx, exec);
      const cwd = policy?.workspaceRoot ?? exec.agent?.session.header.cwd;
      const files = scaffold(args.kind, args.path, options);
      const written = [];
      for (const file of files) {
        try {
          const target = await ctx.fs.resolve(file.path, { cwd, signal: exec.signal });
          const info = await ctx.fs.stat(target, exec.signal);
          if (info !== undefined) {
            throw new Error(`目标已存在：${file.path}。GoodTypst 不覆盖已有文件，换个路径或先确认要替换哪一份。`);
          }
          await ctx.fs.writeText(target, file.content, { kind: 'createIfAbsent' }, exec.signal, policy);
        } catch (error) {
          // 文件策略会拦下工作区外的写入；把原文换成一句能照着做的。
          if (error?.code === 'FS_SANDBOX_DENIED') {
            throw new Error(
              `写不进 ${file.path}：当前文件策略不允许写这个位置。` +
                `把文稿放到工作区内，或者让用户用 write 工具（可带 sandbox_permissions）落盘。`
            );
          }
          throw error;
        }
        written.push(file.path);
      }

      return {
        kind: args.kind,
        entry: args.path,
        files: written,
        reminder:
          args.kind === 'reading'
            ? '接着用 goodtypst_check 自查；正文只写黑白文字，不用颜色、卡片、多栏。'
            : '接着用 goodtypst_check 自查；每页一个论点，禁止带框卡片与表格。'
      };
    }
  });
}

/**
 * 把起稿结果渲染成模型读到的文本。
 * @param value - `goodtypst_new` 的返回值。
 * @returns 多行文本。
 */
function formatNew(value) {
  const lines = [`已按 ${value.kind} 模板起稿：${value.entry}`, `写入了 ${value.files.length} 个文件：`];
  for (const file of value.files) lines.push(`  - ${file}`);
  lines.push(value.reminder);
  return lines.join('\n');
}

/**
 * 风格自查工具：把模板约束落成可执行的检查。
 * @param ctx - 插件上下文。
 * @param config - 已解析的配置。
 * @returns 工具定义。
 */
function checkTool(ctx, config) {
  return defineTool({
    name: 'goodtypst_check',
    description:
      '按 GoodTypst 的风格约束检查一份 .typ 文件（kind 为 reading 或 slides），返回带行号的违规列表。' +
      'error 必须改掉：阅读文稿里出现颜色/卡片/多栏，演示文稿里出现带框卡片/表格/自定义颜色都算。' +
      '写完文稿后调用它，把 error 清干净再交付。',
    parameters: {
      kind: {
        type: 'string',
        required: true,
        description: `文稿类型：${KINDS.join(' 或 ')}。`
      },
      path: {
        type: 'string',
        required: true,
        description: '要检查的 .typ 文件路径，相对当前工作目录或绝对路径。'
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true },
          ok: { type: 'boolean', required: true },
          hasMarker: { type: 'boolean', required: true },
          violations: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                line: { type: 'integer', required: true },
                level: { type: 'string', required: true },
                rule: { type: 'string', required: true },
                text: { type: 'string', required: true },
                hint: { type: 'string', required: true }
              }
            }
          },
          stats: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
              lines: { type: 'integer', required: true },
              chars: { type: 'integer', required: true }
            }
          }
        }
      },
      render: (_args, value) => [{ type: 'text', text: formatCheck(value) }]
    },
    async execute(args, exec) {
      if (!KINDS.includes(args.kind)) {
        throw new Error(`kind 只能是 ${KINDS.join(' 或 ')}（收到 ${args.kind ?? '空'}）。`);
      }
      const target = await ctx.fs.resolve(args.path, {
        cwd: exec.agent?.session.header.cwd,
        signal: exec.signal
      });
      const info = await ctx.fs.stat(target, exec.signal);
      if (info === undefined) {
        throw new Error(`找不到文件：${args.path}`);
      }
      if ((info.size ?? 0) > config.maxSourceBytes) {
        throw new Error(`${args.path} 超过 maxSourceBytes（${config.maxSourceBytes}），不检查这么大的文件。`);
      }
      const source = await ctx.fs.readText(target, exec.signal);
      return lint(source, args.kind);
    }
  });
}

/**
 * 把检查结果渲染成模型读到的文本。
 * @param value - `goodtypst_check` 的返回值。
 * @returns 多行文本。
 */
function formatCheck(value) {
  const errors = value.violations.filter((violation) => violation.level === 'error').length;
  const warnings = value.violations.length - errors;
  if (value.violations.length === 0) {
    return `GoodTypst 风格检查通过（${value.kind}，${value.stats.lines} 行）：没有发现偏离模板的写法。`;
  }
  const lines = [
    `GoodTypst 风格检查：${value.kind}，${errors} 个 error / ${warnings} 个 warn。`,
    value.ok ? '没有 error，可以交付；warn 建议顺手改掉。' : '先把 error 全部改掉再交付。'
  ];
  for (const violation of value.violations) {
    const where = violation.text === '' ? '' : `  ← ${violation.text}`;
    lines.push(`第 ${violation.line} 行 [${violation.level}] ${violation.rule}：${violation.hint}${where}`);
  }
  return lines.join('\n');
}

/**
 * 装上一个插件实例。
 * @param ctx - Cordis 插件上下文。
 * @param config - 已按 `Config` 解析的配置。
 */
function apply(ctx, config) {
  ctx.tools.register(statusTool(ctx, config));
  ctx.tools.register(templatesTool());
  ctx.tools.register(newTool(ctx, config));
  ctx.tools.register(checkTool(ctx, config));

  // 风格约束常驻系统提示：用户一开口要 Typst 文稿，模型就知道先问哪一种、
  // 该用哪个模板、哪些写法是明令禁止的。
  const styleGuide = composeStyleGuide((message) => ctx.logger?.warn?.(message));
  ctx.systemPrompt.section({
    name: 'goodtypst:writing',
    order: 1500,
    interpolate: false,
    text: () => styleGuide
  });
}

export { apply, Config, inject, name, PLUGIN_VERSION };
