// npm run report: report/deck.json + report/slides/*.html → REPORT.html (một file duy nhất, mở offline).
// Slide giữ nguyên định dạng của bộ slide trình chiếu; script thêm khung trình chiếu, mục lục,
// ghi chú và chế độ "Đọc tài liệu" (mọi slide kèm giải thích, in ra PDF được).
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const deck = JSON.parse(fs.readFileSync(path.join(ROOT, 'report', 'deck.json'), 'utf8'))

/** @param {string} s */
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** @param {string} html */
const text = html =>
  html.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#160;/g, ' ').replace(/\s+/g, ' ').trim()

// Icon của định dạng slide (<x-icon>) đổi thành SVG ngay lúc build để hiển thị cả khi tắt JavaScript.
/** @type {Record<string, string>} */
const ICONS = {
  Lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  Clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  Database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  Link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  Users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/><path d="M16 4a4 4 0 0 1 0 8"/><path d="M22 21c0-3-1.8-5.6-4.5-6.6"/>',
  Warning: '<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5"/><path d="M12 18h.01"/>',
}
/** @param {string} html */
const inlineIcons = html =>
  html.replace(/<x-icon name="(\w+)"( style="[^"]*")?><\/x-icon>/g, (m, name, style = '') => {
    if (!ICONS[name]) throw new Error(`build-report: chưa có SVG cho x-icon "${name}"`)
    return `<svg class="x-icon"${style} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
  })

const sectionStarts = Object.fromEntries(Object.values(deck.sections).map(s => [s.start, s.description]))

const slides = deck.order.map((id, i) => {
  const raw = fs.readFileSync(path.join(ROOT, 'report', 'slides', `${id}.html`), 'utf8').trim()
  const notesMatch = raw.match(/<aside>([\s\S]*?)<\/aside>/)
  const notes = notesMatch ? text(notesMatch[1]) : ''
  const section = inlineIcons(raw.replace(/<aside>[\s\S]*?<\/aside>\s*/, ''))
  const h2 = section.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)
  const h1 = section.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
  const p = section.match(/<p[^>]*>([\s\S]*?)<\/p>/)
  const h1Text = h1 ? text(h1[1]) : ''
  const title = h2 ? text(h2[1]) : h1Text.length > 6 ? h1Text : text(p ? p[1] : id)
  return { id, n: i + 1, title, notes, section, sectionTitle: sectionStarts[id] || null }
})

const groups = []
for (const s of slides) {
  if (s.sectionTitle || !groups.length) groups.push({ label: s.sectionTitle || 'Mở đầu', items: [] })
  groups[groups.length - 1].items.push(s)
}

const toc = groups
  .map(g => `<optgroup label="${esc(g.label)}">${g.items.map(s => `<option value="${s.n}">${s.n}. ${esc(s.title)}</option>`).join('')}</optgroup>`)
  .join('')

const docToc = groups
  .map(g => `<li><b>${esc(g.label)}</b><ol>${g.items.map(s => `<li value="${s.n}"><a href="#${s.n}">${esc(s.title)}</a></li>`).join('')}</ol></li>`)
  .join('')

const figures = slides
  .map(s => `${s.sectionTitle ? `<h2 class="doc-section">${esc(s.sectionTitle)}</h2>\n` : ''}<figure class="slide" id="slide-${s.n}" data-n="${s.n}" data-title="${esc(s.title)}">
<h3 class="doc-title"><span>${s.n}</span> ${esc(s.title)}</h3>
<div class="frame"><div class="canvas">
${s.section}
</div></div>
<figcaption class="notes"><b>Giải thích:</b> ${esc(s.notes)}</figcaption>
</figure>`)
  .join('\n')

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap'

const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>REPORT — DocShare: phân quyền kiểu Zanzibar · Nhóm 07</title>
<meta name="description" content="Báo cáo dạng slide của Nhóm 07: DocShare, hệ thống chia sẻ tài liệu kiểu Google Drive phân quyền theo Zanzibar (OpenFGA + engine tự viết), kèm giải thích từng lựa chọn của nhóm.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONT_HREF}">
<style>
:root { --s: .5; --ink: #1B2430; --paper: #F6F4EF; --line: #D9D2C3; --muted: #5B616B; --blue: #1F5FA8; --bar: 52px }
* { box-sizing: border-box }
html, body { margin: 0 }
body { background: #E9E5DC; color: var(--ink); font: 16px/1.5 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif }
a { color: var(--blue) }
.bar { position: sticky; top: 0; z-index: 10; height: var(--bar); display: flex; align-items: center; gap: 10px; padding: 0 16px; background: var(--ink); color: #F3EFE6 }
.bar .title { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0 }
.bar button, .bar select { font: inherit; font-size: 14px; color: #F3EFE6; background: #2A3544; border: 1px solid #3A4656; border-radius: 6px; padding: 5px 10px; cursor: pointer }
.bar select { max-width: 340px }
.bar button:hover, .bar select:hover { border-color: #8DB8E8 }
.bar button:focus-visible, .bar select:focus-visible { outline: 3px solid #8DB8E8; outline-offset: 2px }
.bar .count { font-variant-numeric: tabular-nums; font-size: 14px; color: #B9C0CC; white-space: nowrap }
#deck { padding: 24px 16px 64px }
.intro { max-width: 1200px; margin: 0 auto 32px; background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 24px 28px }
.intro h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.25 }
.intro p { margin: 8px 0 }
.intro ol { margin: 8px 0 0; padding-left: 20px; columns: 2; column-gap: 32px }
.intro ol ol { columns: 1; padding-left: 20px; margin: 4px 0 10px }
.doc-section { max-width: 1200px; margin: 40px auto 12px; font-size: 22px; color: var(--muted); border-bottom: 2px solid var(--line); padding-bottom: 6px }
.slide { max-width: 1200px; margin: 0 auto 32px }
.doc-title { margin: 0 0 8px; font-size: 18px }
.doc-title span { display: inline-block; min-width: 2em; color: var(--muted) }
.frame { position: relative; width: calc(1920px * var(--s)); height: calc(1080px * var(--s)); overflow: hidden; border-radius: 10px; box-shadow: 0 2px 10px rgba(27,36,48,.18); background: #fff; margin: 0 auto }
.canvas { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; transform: scale(var(--s)); transform-origin: 0 0 }
.notes { margin: 10px 0 0; background: var(--paper); border-left: 4px solid var(--blue); border-radius: 6px; padding: 12px 16px; font-size: 15px; line-height: 1.6 }

/* Mặc định của định dạng slide */
.canvas section { position: absolute; inset: 0; width: 1920px; height: 1080px; overflow: hidden }
.canvas section * { margin: 0 }
.canvas h1 { font-size: 96px; font-weight: 600; line-height: 1.1 }
.canvas h2 { font-size: 64px; font-weight: 600; line-height: 1.15 }
.canvas h3 { font-size: 44px; font-weight: 600; line-height: 1.2 }
.canvas p { font-size: 32px; line-height: 1.4 }
.canvas ol, .canvas ul { padding-left: 1.3em }
.canvas table { border-collapse: collapse; width: 100% }
.canvas th, .canvas td { padding: .35em .6em; border-bottom: 1px solid rgba(27,36,48,.18); text-align: left; vertical-align: top }
.canvas th { font-weight: 700 }
x-shape { display: block; flex: none }
x-shape[kind="arrow-right"] { clip-path: polygon(0 30%, 60% 30%, 60% 0, 100% 50%, 60% 100%, 60% 70%, 0 70%) }
svg.x-icon { display: block; flex: none }

/* Chế độ trình chiếu (bật bằng JavaScript) */
body.present { overflow: hidden; background: #11161E }
body.present .intro, body.present .doc-section, body.present .doc-title, body.present .notes { display: none }
body.present #deck { padding: 0; height: calc(100vh - var(--bar)); display: flex; align-items: center; justify-content: center }
body.present .slide { display: none; margin: 0; max-width: none }
body.present .slide.active { display: block }
body.present .frame { border-radius: 0; box-shadow: none }
#notesPanel { display: none }
body.present.show-notes #notesPanel { display: block; position: fixed; left: 0; right: 0; bottom: 0; max-height: 34vh; overflow: auto; background: rgba(17,22,30,.95); color: #E6E9EE; padding: 14px 20px; font-size: 16px; line-height: 1.6; border-top: 1px solid #3A4656 }
.doc-only { display: block }
body.present .doc-only { display: none }

@media print {
  .bar, #notesPanel { display: none !important }
  body { background: #fff }
  body.present { overflow: visible }
  body.present #deck { display: block; height: auto }
  body.present .slide, .slide { display: block !important; break-inside: avoid; page-break-inside: avoid; margin-bottom: 16px }
  body.present .intro, body.present .doc-section, body.present .doc-title, body.present .notes { display: block }
  .frame { box-shadow: none; border: 1px solid #ccc }
}
@media (max-width: 760px) {
  .bar .title { display: none }
  .bar select { max-width: 150px }
  .intro ol { columns: 1 }
}
</style>
</head>
<body>
<header class="bar">
  <div class="title">REPORT · DocShare · Phân quyền kiểu Zanzibar · Nhóm 07</div>
  <button id="prev" type="button" aria-label="Slide trước" hidden>←</button>
  <select id="toc" aria-label="Chọn slide" hidden>${toc}</select>
  <span class="count" id="count" hidden></span>
  <button id="next" type="button" aria-label="Slide sau" hidden>→</button>
  <button id="notesBtn" type="button" title="Phím N" hidden>Ghi chú</button>
  <button id="modeBtn" type="button" title="Phím D" hidden>Đọc tài liệu</button>
  <button id="fsBtn" type="button" title="Phím F" hidden>Toàn màn hình</button>
</header>
<main id="deck">
<section class="intro doc-only">
  <h1>REPORT — DocShare: phân quyền kiểu Zanzibar cho hệ thống chia sẻ tài liệu</h1>
  <p><b>Nhóm 07</b> · 23127045 · 23127102 · 23127159 · 23127183 · 23127393</p>
  <p>Bộ slide báo cáo gồm ${slides.length} slide. Mỗi slide có phần <b>giải thích</b> bên dưới; phần "Các lựa chọn của nhóm" trình bày từng quyết định theo khung <i>Nhóm chọn vì / Không chọn / Đánh đổi chấp nhận</i>. Báo cáo chi tiết: <a href="REPORT.md">REPORT.md</a> · Hướng dẫn triển khai: <a href="README.md">README.md</a> · Thiết kế: <a href="docs/thiet-ke.md">docs/thiet-ke.md</a> · Evidence: <a href="docs/evidence/">docs/evidence/</a>.</p>
  <p>Trình chiếu: bấm <b>Trình chiếu</b> trên thanh trên cùng, dùng phím ← → để chuyển slide, <b>N</b> bật ghi chú, <b>F</b> toàn màn hình, <b>D</b> quay lại chế độ đọc. In ra PDF: Ctrl+P ở chế độ đọc.</p>
  <ol>${docToc}</ol>
</section>
${figures}
</main>
<div id="notesPanel" aria-live="polite"></div>
<script>
(function () {
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'))
  var body = document.body
  var current = 0
  var $ = function (id) { return document.getElementById(id) }
  ;['prev', 'toc', 'count', 'next', 'notesBtn', 'modeBtn', 'fsBtn'].forEach(function (id) { $(id).hidden = false })

  function fit() {
    var s
    if (body.classList.contains('present')) {
      var h = window.innerHeight - $('deck').getBoundingClientRect().top
      s = Math.min(window.innerWidth / 1920, h / 1080)
    } else {
      s = Math.min(1200, document.documentElement.clientWidth - 32) / 1920
    }
    document.documentElement.style.setProperty('--s', String(Math.max(s, 0.1)))
  }

  function show(n) {
    current = Math.max(0, Math.min(slides.length - 1, n))
    slides.forEach(function (el, i) { el.classList.toggle('active', i === current) })
    $('toc').value = String(current + 1)
    $('count').textContent = (current + 1) + ' / ' + slides.length
    var notes = slides[current].querySelector('.notes')
    $('notesPanel').textContent = notes ? notes.textContent : ''
    if (body.classList.contains('present')) history.replaceState(null, '', '#' + (current + 1))
  }

  function setMode(present) {
    body.classList.toggle('present', present)
    $('modeBtn').textContent = present ? 'Đọc tài liệu' : 'Trình chiếu'
    fit()
    if (present) show(current)
    else {
      history.replaceState(null, '', '#doc')
      slides[current].scrollIntoView({ block: 'start' })
    }
  }

  $('prev').onclick = function () { if (!body.classList.contains('present')) setMode(true); show(current - 1) }
  $('next').onclick = function () { if (!body.classList.contains('present')) setMode(true); show(current + 1) }
  $('toc').onchange = function () {
    current = Number(this.value) - 1
    if (body.classList.contains('present')) show(current)
    else slides[current].scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  $('notesBtn').onclick = function () { if (!body.classList.contains('present')) setMode(true); body.classList.toggle('show-notes') }
  $('modeBtn').onclick = function () { setMode(!body.classList.contains('present')) }
  $('fsBtn').onclick = function () {
    if (!body.classList.contains('present')) setMode(true)
    if (document.fullscreenElement) document.exitFullscreen()
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen()
  }

  document.addEventListener('keydown', function (e) {
    if (e.target && /^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName)) return
    var k = e.key
    if (k === 'd' || k === 'D') return setMode(!body.classList.contains('present'))
    if (!body.classList.contains('present')) return
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') { e.preventDefault(); show(current + 1) }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); show(current - 1) }
    else if (k === 'Home') show(0)
    else if (k === 'End') show(slides.length - 1)
    else if (k === 'n' || k === 'N') body.classList.toggle('show-notes')
    else if (k === 'f' || k === 'F') $('fsBtn').onclick()
  })

  slides.forEach(function (el, i) {
    el.querySelector('.frame').addEventListener('click', function () {
      if (body.classList.contains('present')) show(current + 1)
    })
  })

  window.addEventListener('hashchange', function () {
    var n = Number(location.hash.slice(1))
    if (n > 0) { current = n - 1; if (body.classList.contains('present')) show(current); else setMode(true) }
  })
  window.addEventListener('resize', fit)
  document.addEventListener('fullscreenchange', fit)
  window.addEventListener('beforeprint', function () { body.classList.remove('present'); fit() })

  // Mở bằng #12 thì vào thẳng trình chiếu slide 12; mặc định là chế độ đọc tài liệu.
  var start = Number(location.hash.slice(1))
  if (start > 0) { current = start - 1; setMode(true) }
  else { fit(); show(0); $('modeBtn').textContent = 'Trình chiếu' }
  // Ở chế độ đọc, cập nhật slide hiện tại theo vị trí cuộn để mục lục và nút ← → đi đúng chỗ.
  window.addEventListener('scroll', function () {
    if (body.classList.contains('present')) return
    for (var i = slides.length - 1; i >= 0; i--) {
      if (slides[i].getBoundingClientRect().top < 120) { current = i; $('toc').value = String(i + 1); $('count').textContent = (i + 1) + ' / ' + slides.length; return }
    }
  }, { passive: true })
})()
</script>
</body>
</html>
`

fs.writeFileSync(path.join(ROOT, 'REPORT.html'), html)
console.log(`đã ghi REPORT.html (${slides.length} slide, ${Math.round(html.length / 1024)} KB)`)
