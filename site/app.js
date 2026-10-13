import { Engine, Sequence, Status, staticBatchingSteps } from './sim.js'

const $ = (id) => document.getElementById(id)
function h(tag, attrs = {}, kids = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else if (k === 'style') node.setAttribute('style', v)
    else node.setAttribute(k, v)
  }
  for (const kid of [].concat(kids)) if (kid != null) node.append(kid)
  return node
}

// ------------------------------------------------------------------ tabs
const tabs = [...document.querySelectorAll('[role="tab"]')]
function select(id, focus = false) {
  for (const t of tabs) {
    const on = t.getAttribute('aria-controls') === id
    t.setAttribute('aria-selected', String(on))
    t.tabIndex = on ? 0 : -1
    $(t.getAttribute('aria-controls')).hidden = !on
    if (on && focus) t.focus()
  }
  history.replaceState(null, '', `#${id}`)
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => select(t.getAttribute('aria-controls')))
  t.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
    if (step) select(tabs[(i + step + tabs.length) % tabs.length].getAttribute('aria-controls'), true)
  })
})
if (['lab', 'playground'].includes(location.hash.slice(1))) select(location.hash.slice(1))

// ------------------------------------------------------------------ scheduler lab
const HUES = [340, 200, 32, 145, 268, 8, 182, 55, 300, 100, 228, 20]
const colour = (id) => `hsl(${HUES[id % HUES.length]} 55% 45%)`

// Each workload: config plus requests [arrival step, prompt tokens, max new tokens].
const PRESETS = {
  mixed: { blocks: 24, bs: 4, batch: 4, reqs: [[0, 8, 6], [0, 5, 12], [0, 11, 4], [1, 4, 9], [2, 9, 5], [3, 6, 14], [4, 12, 3], [5, 3, 7]] },
  tail: { blocks: 48, bs: 4, batch: 4, reqs: [[0, 6, 40], [0, 5, 4], [0, 7, 4], [0, 4, 5], [2, 6, 4], [3, 5, 3], [5, 8, 4], [6, 4, 5], [8, 6, 3], [10, 5, 4]] },
  burst: { blocks: 32, bs: 4, batch: 4, reqs: [[0, 6, 10], [0, 8, 8], [0, 5, 12], [6, 7, 6], [6, 4, 9], [6, 9, 5], [6, 6, 7], [6, 5, 4]] },
  pressure: { blocks: 10, bs: 4, batch: 4, reqs: [[0, 6, 12], [0, 5, 14], [0, 7, 10], [0, 4, 9], [2, 3, 6]] },
}

const lab = { engine: null, pending: [], requests: [], history: new Map(), timer: null, nextId: 0, done: false }

function resetLab(fromPreset = false) {
  stop()
  const p = PRESETS[$('preset').value]
  if (fromPreset) {
    $('cfg-blocks').value = p.blocks
    $('cfg-bs').value = String(p.bs)
    $('cfg-batch').value = p.batch
  }
  const cfg = { numBlocks: +$('cfg-blocks').value, blockSize: +$('cfg-bs').value, maxBatchSize: +$('cfg-batch').value }
  lab.engine = new Engine(cfg)
  lab.pending = p.reqs.map(([at, prompt, max], id) => ({ at, prompt, max, id }))
  lab.requests = lab.pending.map((r) => ({ arrival: r.at, maxTokens: r.max }))
  lab.nextId = lab.pending.length
  lab.history = new Map()
  lab.done = false
  $('log').replaceChildren()
  $('compare').textContent = ''
  render()
}

function log(text, cls) {
  const line = h('p', cls ? { class: cls } : {}, text)
  $('log').append(line)
  $('log').scrollTop = $('log').scrollHeight
}

function labStep() {
  const e = lab.engine
  const step = e.stepCount
  for (const r of lab.pending.filter((x) => x.at <= step)) {
    e.addRequest(new Sequence(r.id, r.prompt, r.max))
    lab.pending.splice(lab.pending.indexOf(r), 1)
    log(`step ${step}: request #${r.id} arrives (${r.prompt} prompt tokens, up to ${r.max} new)`)
  }
  if (!e.scheduler.hasWork()) {
    if (!lab.pending.length) return finish()
    e.stepCount += 1 // idle step: nothing to run until the next arrival
    render()
    return
  }
  const out = e.step()
  for (const s of out.preempted) log(`step ${step}: preempt #${s.id}: it needs a new block and the pool is empty. Its blocks are freed; it goes to the front of the queue and will recompute.`, 'pre')
  for (const s of out.prefilled) log(`step ${step}: admit #${s.id}: prefill ${s.promptTokens} tokens into ${s.blockTable.length} block(s)${s.preemptions ? ' (recompute)' : ''}`)
  for (const s of out.finished) log(`step ${step}: #${s.id} finished, its ${Math.ceil(s.length / e.blockManager.blockSize)} block(s) return to the pool`)
  const ran = new Set(out.scheduled.map((s) => s.id))
  const pre = new Set(out.preempted.map((s) => s.id))
  for (const s of e.sequences) {
    if (!lab.history.has(s.id)) lab.history.set(s.id, [])
    const row = lab.history.get(s.id)
    while (row.length < step) row.push('none')
    row.push(pre.has(s.id) ? 'preempted' : ran.has(s.id) ? 'running' : s.status === Status.FINISHED ? 'finished' : 'waiting')
  }
  render()
  if (!e.scheduler.hasWork() && !lab.pending.length) finish()
}

function finish() {
  stop()
  if (lab.done) return
  lab.done = true
  const e = lab.engine
  const staticSteps = staticBatchingSteps(lab.requests, e.scheduler.maxBatchSize)
  $('compare').innerHTML = `<strong>Continuous batching finished in ${e.stepCount} steps.</strong> Static batching with the same batch size would take ${staticSteps} steps: each batch waits for its longest request, and a new request waits for the whole batch. (Static batching here has no memory limit, so it is the best case for it.)`
  log(`done: ${e.stepCount} steps, ${e.tokens} tokens, ${e.preemptions} preemption(s)`)
}

function render() {
  const e = lab.engine
  const bm = e.blockManager
  // Stats
  const used = bm.numBlocks - bm.numFreeBlocks
  const stats = [
    [String(e.stepCount), 'steps'],
    [String(e.tokens), 'tokens generated'],
    [`${used} / ${bm.numBlocks}`, 'KV blocks in use'],
    [String(e.preemptions), 'preemptions'],
  ]
  $('lab-stats').replaceChildren(...stats.map(([v, d]) => h('div', { class: 'stat' }, [h('dt', {}, v), h('dd', {}, d)])))
  // Pool: colour each block by its owner
  const owner = new Map()
  for (const s of e.sequences) for (const b of s.blockTable) owner.set(b, s.id)
  $('pool').setAttribute('aria-label', `${used} of ${bm.numBlocks} KV-cache blocks in use`)
  $('pool').replaceChildren(
    ...Array.from({ length: bm.numBlocks }, (_, b) => {
      const id = owner.get(b)
      return id == null ? h('div', { class: 'cell free', title: `block ${b}: free` }, String(b)) : h('div', { class: 'cell', style: `background:${colour(id)}`, title: `block ${b}: request #${id}` }, `#${id}`)
    }),
  )
  // Queues
  const chip = (s) => h('li', { class: 'seq', style: `background:${colour(s.id)}` }, [`#${s.id}`, h('small', {}, `${s.length} tok · ${s.blockTable.length} blk`)])
  $('q-waiting').replaceChildren(...e.scheduler.waiting.map(chip))
  $('q-running').replaceChildren(...e.scheduler.running.map(chip))
  // Timeline
  const steps = Math.max(1, ...[...lab.history.values()].map((r) => r.length))
  const tl = $('timeline')
  tl.style.gridTemplateColumns = `3rem repeat(${steps}, minmax(.55rem, 1fr))`
  const cells = []
  for (const [id, row] of [...lab.history.entries()].sort((a, b) => a[0] - b[0])) {
    cells.push(h('div', { class: 'row-label' }, `#${id}`))
    for (let i = 0; i < steps; i++) {
      const st = row[i] ?? 'none'
      cells.push(h('div', { class: `tl ${st}`, style: st === 'running' ? `background:${colour(id)}` : '', title: `#${id}, step ${i}: ${st}` }))
    }
  }
  tl.replaceChildren(...cells)
  $('play').textContent = lab.timer ? 'Pause' : 'Play'
}

function stop() {
  clearInterval(lab.timer)
  lab.timer = null
  if ($('play')) $('play').textContent = 'Play'
}

$('play').addEventListener('click', () => {
  if (lab.timer) return stop()
  if (lab.done) resetLab()
  lab.timer = setInterval(labStep, 1100 - 100 * +$('speed').value)
  render()
})
$('speed').addEventListener('input', () => { if (lab.timer) { stop(); $('play').click() } })
$('step').addEventListener('click', () => { stop(); if (!lab.done) labStep() })
$('reset').addEventListener('click', () => resetLab())
$('preset').addEventListener('change', () => resetLab(true))
for (const id of ['cfg-blocks', 'cfg-bs', 'cfg-batch']) $(id).addEventListener('change', () => resetLab())
$('add').addEventListener('click', () => {
  const r = { at: lab.engine.stepCount, prompt: +$('add-prompt').value, max: +$('add-max').value, id: lab.nextId++ }
  const cap = lab.engine.blockManager.numBlocks * lab.engine.blockManager.blockSize
  if (r.prompt + r.max > cap) return log(`request too long: ${r.prompt + r.max} tokens do not fit in ${cap} slots`, 'pre')
  lab.pending.push(r)
  lab.requests.push({ arrival: r.at, maxTokens: r.max })
  lab.done = false
  $('compare').textContent = ''
  log(`you added request #${r.id}; it arrives at step ${r.at}`)
})
resetLab(true)

// ------------------------------------------------------------------ playground
const play = { model: null, controller: null }
const base = () => $('server').value.replace(/\/+$/, '')

$('connect').addEventListener('click', async () => {
  const conn = $('conn')
  conn.className = 'status'
  conn.textContent = 'Connecting…'
  try {
    const health = await fetch(`${base()}/health`)
    if (!health.ok) throw new Error(`health check returned ${health.status}`)
    const models = await (await fetch(`${base()}/v1/models`)).json()
    play.model = models.data?.[0]?.id ?? 'default'
    conn.className = 'status ok'
    conn.textContent = `Connected to ${base()}. Model: ${play.model}.`
    $('send').disabled = false
  } catch (error) {
    conn.className = 'status err'
    conn.textContent = `Could not connect (${error.message}). Is the server running, and is this page's address in MINI_VLLM_CORS_ORIGINS?`
    $('send').disabled = true
  }
})

async function streamOne(i, body, signal, lane, t0, onUpdate) {
  const stats = { i, t0, first: null, end: null, tokens: 0, finish: null, error: null }
  const out = lane.querySelector('.gen')
  try {
    const res = await fetch(`${base()}/v1/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`)
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += value
      let cut
      while ((cut = buf.indexOf('\n\n')) >= 0) {
        const event = buf.slice(0, cut)
        buf = buf.slice(cut + 2)
        for (const line of event.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') continue
          const chunk = JSON.parse(data)
          const choice = chunk.choices?.[0]
          if (choice?.text) {
            stats.first ??= performance.now()
            stats.tokens += 1
            out.textContent += choice.text
          }
          if (choice?.finish_reason) stats.finish = choice.finish_reason
          if (chunk.usage) stats.tokens = chunk.usage.completion_tokens
        }
      }
      onUpdate(stats)
    }
  } catch (error) {
    stats.error = error.name === 'AbortError' ? 'stopped' : error.message
  }
  stats.end = performance.now()
  onUpdate(stats)
  return stats
}

function laneHeader(lane, s) {
  const ttft = s.first ? `${Math.round(s.first - s.t0)} ms` : '…'
  const gen = s.first && s.end ? (s.end - s.first) / 1000 : s.first ? (performance.now() - s.first) / 1000 : 0
  const tps = gen > 0 && s.tokens > 1 ? `${((s.tokens - 1) / gen).toFixed(1)} tok/s` : '…'
  lane.querySelector('header').replaceChildren(
    h('strong', {}, `Request ${s.i + 1}`), h('span', {}, `first token ${ttft}`), h('span', {}, `${s.tokens} tokens`), h('span', {}, tps),
    h('span', {}, s.error ? `error: ${s.error}` : s.end ? `finished: ${s.finish ?? '–'}` : 'streaming…'),
  )
}

function drawGantt(all) {
  const tMax = Math.max(...all.map((s) => (s.end ?? performance.now()) - s.t0), 1)
  $('gantt').replaceChildren(
    h('p', { class: 'muted', style: 'font: .85rem var(--sans); margin: 0' }, 'Grey: waiting for the first token. Colour: streaming. All requests were sent at the same moment.'),
    ...all.map((s) => {
      const first = s.first ? s.first - s.t0 : (s.end ?? performance.now()) - s.t0
      const end = (s.end ?? performance.now()) - s.t0
      return h('div', { class: 'gbar' }, [
        h('span', {}, `Req ${s.i + 1}`),
        h('div', { class: 'gtrack' }, [h('div', { class: 'gwait', style: `left:0;width:${(100 * first) / tMax}%` }), h('div', { class: 'ggen', style: `left:${(100 * first) / tMax}%;width:${(100 * (end - first)) / tMax}%` })]),
      ])
    }),
  )
}

$('send').addEventListener('click', async () => {
  const copies = Math.max(1, Math.min(16, +$('copies').value))
  const prompt = $('prompt').value
  const stopText = $('stop').value
  const body = { model: play.model, prompt, max_tokens: +$('max-tokens').value, temperature: +$('temperature').value, top_p: +$('top-p').value, stream: true, ...(stopText ? { stop: stopText } : {}) }
  play.controller = new AbortController()
  $('send').disabled = true
  $('cancel').disabled = false
  $('run-status').textContent = `Sending ${copies} request(s) at once…`
  const lanes = Array.from({ length: copies }, () => h('div', { class: 'lane' }, [h('header'), h('p', { class: 'text' }, [h('span', { class: 'prompt' }, prompt), h('span', { class: 'gen' })])]))
  $('lanes').replaceChildren(...lanes)
  const live = []
  const t0 = performance.now()
  const results = await Promise.all(
    lanes.map((lane, i) =>
      streamOne(i, body, play.controller.signal, lane, t0, (s) => {
        live[i] = s
        laneHeader(lane, s)
        drawGantt(live.filter(Boolean))
      }),
    ),
  )
  const ok = results.filter((r) => !r.error)
  const ttfts = ok.filter((r) => r.first).map((r) => r.first - r.t0).sort((a, b) => a - b)
  const wall = (Math.max(...results.map((r) => r.end)) - t0) / 1000
  const tokens = ok.reduce((n, r) => n + r.tokens, 0)
  $('run-status').textContent = ok.length
    ? `${ok.length} of ${copies} finished. ${tokens} tokens in ${wall.toFixed(2)} s = ${(tokens / wall).toFixed(1)} tok/s overall. Median time to first token ${Math.round(ttfts[Math.floor(ttfts.length / 2)] ?? 0)} ms.`
    : `No request finished: ${results[0]?.error ?? 'unknown error'}`
  $('send').disabled = false
  $('cancel').disabled = true
})
$('cancel').addEventListener('click', () => play.controller?.abort())
