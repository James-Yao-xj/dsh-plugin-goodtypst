// GoodTypst · 演示文稿主题（slides）
//
// 与样例 Slides/template.typ 同一套版式：4:3、PKU 配色、宋体正文、
// 上方浅灰页眉条（左：本页语境，右：校徽）、下方细红线页脚（右：页码）。
// 这里只放主题与构件，正文写在 slides.typ 里；写法见 prompts/slides.md。

#let pku-red = rgb("#8f1728")
#let pku-blue = rgb("#163d73")
#let pku-gray = rgb("#667085")
#let pku-light = rgb("#f4f6f8")
#let accent = rgb("#c68b3c")

// 校徽：原始位图打包进 SVG，模板保持纯文本，可随仓库一起分发。
// 想换成自己的校徽 / 单位标志，替换这个文件即可。
#let logo-path = "assets/images/pku-logo.svg"

#let pku-theme(
  title: none,
  subtitle: none,
  author: none,
  institute: none,
  date: none,
  body,
) = {
  set text(font: ("Songti SC", "STSong"), size: 18pt, fill: rgb("#18212f"))
  set par(leading: 0.64em)

  page(
    paper: "presentation-4-3",
    margin: (x: 1.5cm, top: 1.7cm, bottom: 1.4cm),
    header: none,
    footer: none,
  )[
    #align(center)[
      #v(0.3cm)
      #image(logo-path, height: 3.1cm)
      #v(0.65cm)
      #text(size: 50pt, weight: "bold", fill: pku-red)[#title]
      #v(0.35cm)
      #text(size: 40pt, fill: pku-blue)[#subtitle]
      #v(0.9cm)
      #text(size: 30pt, weight: "bold")[#author]
      #v(0.18cm)
      #text(size: 16pt, fill: pku-gray)[#institute]
      #v(0.5cm)
      #text(size: 20pt, fill: pku-gray)[#date]
    ]
  ]

  body
}

#let slide(title: none, section: none, body) = page(
  paper: "presentation-4-3",
  margin: (x: 1.25cm, top: 1.55cm, bottom: 1.3cm),
  header: box(
    width: 100%,
    height: 0.9cm,
    fill: pku-light,
    stroke: (bottom: 1.5pt + pku-blue),
    inset: (x: 12pt, y: 8pt),
    grid(
      columns: (1fr, auto),
      align(left + horizon, text(size: 15pt, fill: black, weight: "bold")[#section]),
      align(right + horizon, image(logo-path, height: 0.42cm)),
    ),
  ),
  footer: box(
    width: 100%,
    height: 0.65cm,
    stroke: (top: 1pt + pku-red),
    inset: (x: 8pt, y: 5pt),
    context align(right + horizon, text(size: 9pt, fill: pku-gray)[#counter(page).display()]),
  ),
)[
  #if title != none {
    text(size: 24pt, weight: "bold", fill: pku-red)[#title]
    v(0.22cm)
  }
  #body
]

#let source-line(body) = {
  v(0.12cm)
  text(size: 8.5pt, fill: pku-gray)[#body]
}

#let metric(value, label, color: pku-red) = align(center)[
  #text(size: 29pt, weight: "bold", fill: color)[#value]
  #linebreak()
  #text(size: 12pt, fill: pku-gray)[#label]
]

#let keypoint(title, body, color: pku-blue) = {
  text(size: 16pt, weight: "bold", fill: color)[#title]
  v(0.06cm)
  text(size: 13.5pt)[#body]
}
