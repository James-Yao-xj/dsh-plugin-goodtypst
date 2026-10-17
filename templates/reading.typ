// GoodTypst · 阅读文稿模板（reading）
//
// 版式与样例 Lesson2.typ 完全一致：A4 单栏、纯黑白、ctyp 处理中英混排、
// 页眉一行灰线加居中课程名、页脚居中页码、一级标题自动编号。
//
// 只改下面 4 个变量，上面的样式不要动；正文怎么写见 prompts/reading.md。

#let doc-title = "第二讲"
#let doc-subtitle = "bits, byte and Integers"
#let doc-meta = "笔记整理自2026年9月10日课程"
#let doc-running-header = "Introduction to Computer System"

#import "@preview/ctyp:0.3.0": ctyp
#let (ctypset, cjk) = ctyp()
#let (song, hei, kai, fang) = cjk
#show: ctypset

#set page(
  paper: "a4",
  margin: (top: 1.7cm, bottom: 1.5cm, left: 1cm, right: 1cm),
  header: context [
    #text(10pt, black)[
      #align(center)[#doc-running-header]]
    #line(length: 100%, stroke: gray)
  ],
  footer: context [
    #set align(center)
    #counter(page).display("1")
  ]
)

#set heading(numbering: "1.")

#align(center)[
  #text(size: 24pt, weight: "bold")[#doc-title]\
  #text(size: 24pt)[#doc-subtitle]
  #v(5pt)
  #text(size: 16pt)[#emph[#doc-meta]]
]

// GoodTypst:content —— 这行以上是版式前导，风格检查从这里往下开始。

// ── 正文：一级标题＝讲/章，二级标题＝节，不要三级标题 ────────────────────
//
//   · 只写黑白文字：不用颜色、底色、卡片、多栏。
//   · 表格居中：columns: N, align: center, inset: 7pt, stroke: 0.6pt，
//     表头用 table.header；表格也用 #align(center)[...] 包住。
//   · 代码块居中：#align(center)[```cpp ... ```]
//   · 图片居中：#align(center)[#image("fig.png", width: 80%)]
//   · 公式：行内 $...$；独立公式单独一行 $ ... $。
//   · 来源说明用脚注 #footnote[...]，不要另起一行小字。

= 第一节标题

== 小节标题

正文从这里开始。

= 第二节标题
