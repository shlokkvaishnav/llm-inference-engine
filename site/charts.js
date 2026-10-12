// Small charts with no libraries. Bars are plain HTML (they are lists, so a screen reader reads every value).
// Line charts are SVG. Every chart can also show its numbers as a table.

const SVG = 'http://www.w3.org/2000/svg'

function html(tag, attrs = {}, kids = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else if (k === 'style') node.setAttribute('style', v)
    else node.setAttribute(k, v)
  }
  for (const kid of [].concat(kids)) node.append(kid)
  return node
}

function svg(tag, attrs = {}, kids = []) {
  const node = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  for (const kid of [].concat(kids)) node.append(kid)
  return node
}

export async function loadJson(path) {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`)
  return res.json()
}

// Shows a message in place of a chart whose data did not load.
export function showError(root, error) {
  root.replaceChildren(html('p', { class: 'chart-error', role: 'alert' }, `This chart could not load its data. ${error.message}`))
}

// A table of the numbers behind a chart, hidden until opened.
export function dataTable(root, { caption, columns, rows }) {
  const table = html('table', {}, [
    html('caption', {}, caption),
    html('thead', {}, html('tr', {}, columns.map((c) => html('th', { scope: 'col' }, c)))),
    html('tbody', {}, rows.map((r) => html('tr', {}, r.map((cell, i) => html(i === 0 ? 'th' : 'td', i === 0 ? { scope: 'row' } : {}, String(cell)))))),
  ])
  root.append(html('details', { class: 'numbers' }, [html('summary', {}, 'Show the numbers'), table]))
}

// Horizontal bars. Each item: { label, value, text, total, muted }.
// `total` draws a lighter bar behind the value, for "hits out of total".
export function barChart(root, { items, max, caption }) {
  const top = max ?? Math.max(...items.map((i) => i.total ?? i.value))
  const list = html('ul', { class: 'bars', 'aria-label': caption ?? '' })
  for (const item of items) {
    const fill = html('div', { class: `bar-fill${item.muted ? ' muted' : ''}`, style: `width:${(item.value / top) * 100}%` })
    const track = html('div', { class: 'bar-track' }, [
      ...(item.total != null ? [html('div', { class: 'bar-total', style: `width:${(item.total / top) * 100}%` })] : []),
      fill,
    ])
    list.append(
      html('li', { class: 'bar' }, [
        html('span', { class: 'bar-label' }, item.label),
        track,
        html('span', { class: 'bar-value' }, item.text ?? String(item.value)),
      ]),
    )
  }
  root.append(list)
}

function niceStep(rough) {
  const pow = 10 ** Math.floor(Math.log10(rough))
  const f = rough / pow
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow
}

// A line chart. series: [{ name, points: [{x, y}], dashed }]. markers: [{ x, text }] draw a vertical line.
export function lineChart(root, { series, xTicks, xLabel, yLabel, yMax, yFormat = String, markers = [], summary }) {
  const W = 560
  const H = 300
  const m = { l: 56, r: 16, t: 16, b: 46 }
  const xs = series.flatMap((s) => s.points.map((p) => p.x))
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const top = yMax ?? niceStep(Math.max(...series.flatMap((s) => s.points.map((p) => p.y))) / 4) * 4
  const sx = (x) => m.l + ((x - xMin) / (xMax - xMin || 1)) * (W - m.l - m.r)
  const sy = (y) => H - m.b - (y / top) * (H - m.t - m.b)
  const step = niceStep(top / 4)
  const yTicks = []
  for (let v = 0; v <= top + 1e-9; v += step) yTicks.push(v)

  const g = []
  for (const v of yTicks) {
    g.push(svg('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: sy(v), y2: sy(v) }))
    g.push(svg('text', { class: 'tick', x: m.l - 8, y: sy(v) + 4, 'text-anchor': 'end' }, document.createTextNode(yFormat(v))))
  }
  for (const v of xTicks) {
    g.push(svg('text', { class: 'tick', x: sx(v), y: H - m.b + 18, 'text-anchor': 'middle' }, document.createTextNode(String(v))))
  }
  g.push(svg('line', { class: 'axis', x1: m.l, x2: W - m.r, y1: sy(0), y2: sy(0) }))
  g.push(svg('text', { class: 'label', x: (m.l + W - m.r) / 2, y: H - 6, 'text-anchor': 'middle' }, document.createTextNode(xLabel)))
  g.push(svg('text', { class: 'label', x: 14, y: (m.t + H - m.b) / 2, 'text-anchor': 'middle', transform: `rotate(-90 14 ${(m.t + H - m.b) / 2})` }, document.createTextNode(yLabel)))
  for (const mk of markers) {
    g.push(svg('line', { class: 'marker', x1: sx(mk.x), x2: sx(mk.x), y1: m.t, y2: sy(0) }))
    g.push(svg('text', { class: 'marker-text', x: sx(mk.x) + 6, y: m.t + 12 }, document.createTextNode(mk.text)))
  }
  series.forEach((s, i) => {
    const d = s.points.map((p, j) => `${j ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ')
    g.push(svg('path', { class: `line s${i + 1}${s.dashed ? ' dashed' : ''}`, d }))
    if (s.points.length <= 12) for (const p of s.points) g.push(svg('circle', { class: `dot s${i + 1}`, cx: sx(p.x), cy: sy(p.y), r: 3.5 }))
  })

  root.append(
    svg('svg', { class: 'line-chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': summary ?? yLabel }, g),
    html('ul', { class: 'legend' }, series.map((s, i) => html('li', {}, [html('span', { class: `swatch s${i + 1}${s.dashed ? ' dashed' : ''}` }), s.name]))),
  )
}
