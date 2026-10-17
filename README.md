---
description: "GoodTypst：把 Typst 文档接进 DSH 会话——改稿、编译、把编译错误和排版结果带回来"
kind: "package-bundle"
---

# dsh-plugin-goodtypst

Typst 是一套排版语言：一份 `.typ` 源文件编译成 PDF、PNG 或 SVG。

这个插件要解决的事很小也很具体——**在会话里改 typst 稿子时，看不见排版结果**。模型把间距改了、把表格重排了、把公式挪进 `$...$`，你看不到它长什么样；编译失败了，错误也停在终端里，模型拿不到。

## 现在是什么状态

**骨架版（0.1.0）。** 仓库里现在只有一件事被验证过：插件能被 DSH 正常加载——工具注册成功、配置读到、`fs` 服务可用。

线上一共一条工具：

| 工具 | 作用 |
| --- | --- |
| `goodtypst_status` | 回报插件版本、`typstBinary` 配置、单文件读取上限；传入 `.typ` 路径时，顺带返回字符数、行数和首行 |

它**不会编译**文档。传路径的那一半是用来确认「路径对不对、文件是不是空的」，免得模型在错误的路径上反复编译。

## 路线

按顺序做，每一步都能单独跑通再往上叠：

1. **编译** `goodtypst_compile`：调 `typst compile`，拿 PDF；`--root` 按工作区或文档目录设定，输出落在临时目录，不污染工作区。
2. **读错误**：编译失败时把 typst 的报错原文和出错行带回来，让模型能直接在源文件里改。
3. **出图**：`typst compile --format png --ppi` 按页出图，一页一张，先给模型看，再考虑接右侧栏预览。
4. **可调**：字体路径（`--font-path`）、`--root`、默认输出格式，都做成配置项。

## 安装

插件的源码放在工作区的 `plugins/` 下，profile 用 `link:` 链进去，改完源码立刻可见。

```bash
# 1. 装依赖（插件自己的 node_modules）
cd plugins/dsh-plugin-goodtypst
pnpm install

# 2. 链进 profile
cd ~/.dsh/profiles/desktop
pnpm add link:/Users/capyapple/Documents/deepseek-harness/default-workspace/plugins/dsh-plugin-goodtypst
```

然后确认 profile 的 `package.json` 里 `dsh.profile.bundles` 包含 `dsh-plugin-goodtypst`（走 DSH 插件管理器安装时会自动追加），重启 DeepSeek Harness 生效。

卸载：`pnpm remove dsh-plugin-goodtypst`，并把 `dsh.profile.bundles` 里那一项删掉。

## 配置

默认值在 `cordis.patch.yml` 里声明，想改就在 profile 自己的 `cordis.patch.yml` 里用同一个 `id`（`goodtypst`）覆盖——覆盖是整块 `config` 替换，不是逐项合并。

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `typstBinary` | `typst` | 编译器位置；默认走 PATH，也可以写绝对路径（例如 `/opt/homebrew/bin/typst`） |
| `maxSourceBytes` | `4194304` | 单个 `.typ` 源文件的读取上限，超过就报错而不是把内存吃光 |

编译相关的配置（`root`、`fontPath`、输出格式）等工具真正落地时再加。

## 环境要求

- DSH `0.2.0-rc.2`（cordis `~4.0.4`）
- [Typst](https://typst.app) 编译器：骨架阶段还不需要，但后续的编译工具跑在它上面。本机验证过的版本是 `typst 0.15.1`。

## 开发

```bash
pnpm install
pnpm test          # node --test test/*.test.js
```

测试不启动 DSH，也不用真 `ctx`：把 `ctx.tools` / `ctx.fs` 换成记录用的假对象，`defineTool` 和 `schemastery` 用真包，所以 schema 和配置默认值走的是和线上同一条代码路径。

## 许可

MIT，见 [LICENSE](LICENSE)。
