/* Caitsbooks — tiny hand-rolled SVG charts (no libraries needed). */

const Charts = {
  /**
   * Vertical bar chart.
   * data: [{ label, value, tip }]
   * opts: { height, color, format, highlight(index) }
   */
  bars(el, data, opts = {}) {
    const W = Math.max(300, el.clientWidth || 640), H = opts.height || 220;
    const pad = { t: 18, r: 8, b: 30, l: 34 };
    const max = Math.max(1, ...data.map(d => d.value));
    const nice = niceMax(max);
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const slot = iw / Math.max(1, data.length);
    const bw = Math.max(3, Math.min(42, slot * 0.62));
    const fmt = opts.format || (v => v);
    const ticks = nice <= 4 ? Array.from({ length: nice + 1 }, (_, i) => i) : [0, nice / 2, nice];
    const labelEvery = opts.allLabels ? 1 : Math.ceil(data.length / (W / 46));

    let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(opts.title || 'chart')}">`;
    ticks.forEach(t => {
      const y = pad.t + ih - (t / nice) * ih;
      svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" class="grid"/>`;
      svg += `<text x="${pad.l - 6}" y="${y + 4}" class="tick" text-anchor="end">${fmt(Math.round(t * 10) / 10)}</text>`;
    });
    data.forEach((d, i) => {
      const x = pad.l + slot * i + (slot - bw) / 2;
      const h = (d.value / nice) * ih;
      const y = pad.t + ih - h;
      const r = Math.min(4, bw / 2, h);
      const cls = opts.highlight && opts.highlight(i) ? 'bar hl' : 'bar';
      svg += `<g class="col" data-tip="${esc(d.tip || `${d.label}: ${fmt(d.value)}`)}">`;
      svg += `<rect class="hit" x="${pad.l + slot * i}" y="${pad.t}" width="${slot}" height="${ih}"/>`;
      if (d.value > 0) {
        // rounded top, square base
        svg += `<path class="${cls}" d="M${x},${pad.t + ih} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${pad.t + ih} Z"/>`;
      }
      svg += `</g>`;
      if (i % labelEvery === 0 && d.label) {
        svg += `<text x="${x + bw / 2}" y="${H - 10}" class="tick" text-anchor="middle">${esc(d.label)}</text>`;
      }
    });
    svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}" class="axis"/>`;
    svg += `</svg>`;
    el.innerHTML = svg;
    attachTips(el);
  },

  /** Horizontal bars for ranked lists (top authors, subjects). */
  hbars(el, data, opts = {}) {
    if (!data.length) { el.innerHTML = `<p class="muted">Nothing here yet.</p>`; return; }
    const max = Math.max(...data.map(d => d.value));
    el.innerHTML = `<div class="hbars">${data.map(d => `
      <div class="hbar-row" data-tip="${esc(d.tip || '')}">
        <span class="hbar-label">${esc(d.label)}</span>
        <span class="hbar-track"><span class="hbar-fill" style="width:${(d.value / max) * 100}%"></span></span>
        <span class="hbar-val">${esc(opts.format ? opts.format(d.value) : d.value)}</span>
      </div>`).join('')}</div>`;
    attachTips(el);
  }
};

function niceMax(v) {
  if (v <= 5) return Math.ceil(v);
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return v;
}

let tipEl;
function attachTips(root) {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'chart-tip';
    document.body.appendChild(tipEl);
  }
  root.querySelectorAll('[data-tip]').forEach(n => {
    if (!n.dataset.tip) return;
    n.addEventListener('pointerenter', () => { tipEl.textContent = n.dataset.tip; tipEl.classList.add('show'); n.classList.add('hover'); });
    n.addEventListener('pointermove', e => {
      tipEl.style.left = Math.min(window.innerWidth - tipEl.offsetWidth - 8, e.clientX + 12) + 'px';
      tipEl.style.top = (e.clientY - 36) + 'px';
    });
    n.addEventListener('pointerleave', () => { tipEl.classList.remove('show'); n.classList.remove('hover'); });
  });
}
