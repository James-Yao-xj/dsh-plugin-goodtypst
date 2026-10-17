// GoodTypst · 演示文稿（slides）
//
// 风格：4:3、PKU 配色、单栏要点式。一页一个论点，留白比文字重要。
// 只改下面 5 个变量与每页 #slide 的内容，版式不要动；写法见 prompts/slides.md。

#import "template.typ": *

#let deck-title = "标题"
#let deck-subtitle = "一句话副标题"
#let deck-author = "作者"
#let deck-institute = "北京大学信息科学技术学院"
#let deck-date = "2026 年 10 月 14 日"

#show: doc => pku-theme(
  title: deck-title,
  subtitle: deck-subtitle,
  author: deck-author,
  institute: deck-institute,
  date: deck-date,
  doc,
)

// GoodTypst:content —— 这行以上是封面与版式前导，风格检查从这里往下开始。

// ── 每页：title 是结论，section 是这句结论的语境 ──────────────────────
//
//   允许的构件（都在 template.typ 里）：
//     · #keypoint("小标题", [正文]) —— 可以两列并排（grid 1fr 1fr）
//     · #metric("36.2%", "说明")    —— 可以三列并排
//     · #align(center)[#image("fig.png", width: 100%)]
//     · #source-line[数据来源]
//     · #text(size: 17pt, fill: pku-red)[一句强调]
//
//   禁止：带框/带底的卡片（rect、box、block 配 stroke/fill）、表格、
//   大段正文（一页连续超过 3 行就不是幻灯片了）。

#slide(title: "结论式标题", section: "这一页想让听众记住的一句话")[
  #v(0.4cm)
  - 第一条要点
  - 第二条要点
  #v(0.6cm)
  #text(size: 17pt, fill: pku-blue)[一句总结。]
]

#slide(title: "第二页标题", section: "换一个角度说同一件事")[
  #v(0.45cm)
  #keypoint("小标题一", [两列并排时，一列讲一个侧面，不要写成两段正文。])
  #v(0.55cm)
  #keypoint("小标题二", [仍然是无框文字，不加底色、不加边框。])
]
