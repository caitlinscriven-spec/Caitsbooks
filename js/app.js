/* Caitsbooks — the enchanted library itself. */

const SPINE_COLOURS = [
  '#b03a5b', '#e58fa9', '#7a2e3b', '#3f5e5a', '#c9a66b', '#5b3f6b',
  '#f2c4d0', '#2f4858', '#8c4a2f', '#d46a8a', '#4a6b45', '#e9d8c4',
  '#9c2f4f', '#f7a8b8', '#6b4e71', '#c75b7a'
];
const SHELF_W = 252;      // usable px per shelf
const SHELVES_PER_CASE = 5;
const MIN_CASES = 4;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STAR_PATH = 'M12 1.8l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.6l-6.3 3.6 1.5-7.1L1.8 9.2 9 8.4z';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const ui = {
  view: 'library',
  shelfSort: 'read',
  shelfFilter: '',
  statsYear: String(new Date().getFullYear()),
  searchResults: null,
  lastQuery: ''
};

/* ------------------------------------------------------------------ boot */

document.addEventListener('DOMContentLoaded', () => {
  Store.load();
  Sync.init();
  $('#owner-name').textContent = Store.data.settings.name || 'Caitlin';
  window.addEventListener('hashchange', route);
  document.addEventListener('click', onClick);
  route();
  if (Store.books.some(b => !b.enriched && b.imported)) runEnricher();
});

function route() {
  const v = (location.hash || '#library').slice(1);
  ui.view = ['library', 'find', 'tbr', 'stats', 'recs', 'settings'].includes(v) ? v : 'library';
  $$('.nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + ui.view));
  render();
  window.scrollTo({ top: 0 });
}

function render() {
  const main = $('#view');
  ({
    library: renderLibrary,
    find: renderFind,
    tbr: renderTbr,
    stats: renderStats,
    recs: renderRecs,
    settings: renderSettings
  })[ui.view](main);
  renderGoalRose();
}

/* --------------------------------------------------------------- clicks */

function onClick(e) {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const { action, id } = t.dataset;
  const book = id ? Store.byId(id) : null;
  switch (action) {
    case 'open': openBook(id); break;
    case 'start': startReading(book); toast(`Off you go into “${book.title}” ✨`); refresh(); break;
    case 'finish': finishFlow(book); break;
    case 'reread': reRead(book); toast(`Round ${book.reads.length} of “${book.title}” begins ↻`); refresh(); break;
    case 'dnf': {
      const r = currentRead(book);
      if (r) { r.end = today(); r.dnf = true; }
      book.status = 'dnf';
      Store.save();
      toast('Set aside. Not every book is your book.');
      refresh();
      break;
    }
    case 'want': book.status = 'want'; book.reads = book.reads.filter(r => r.end); Store.save(); refresh(); break;
    case 'delete':
      if (confirm(`Remove “${book.title}” from your library?`)) { Store.remove(id); closeModal(); render(); }
      break;
    case 'add-result': addResult(+t.dataset.idx, t.dataset.as, t.dataset.src); break;
    case 'dismiss-rec': dismissRec(t.dataset.key); break;
    case 'close-modal': closeModal(); break;
  }
}

function refresh() {
  render();
  if ($('#modal').open && $('#modal').dataset.id) openBook($('#modal').dataset.id);
}

/* ------------------------------------------------------------- stars */

function starsDisplay(value, size = 16) {
  let out = `<span class="stars" style="--s:${size}px" aria-label="${fmtRating(value)} stars">`;
  for (let i = 0; i < 5; i++) {
    const pct = Math.max(0, Math.min(1, value - i)) * 100;
    out += `<span class="star"><svg viewBox="0 0 24 24"><path d="${STAR_PATH}"/></svg><span class="fill" style="width:${pct}%"><svg viewBox="0 0 24 24"><path d="${STAR_PATH}"/></svg></span></span>`;
  }
  return out + '</span>';
}

/** Interactive quarter-star rating. Tap the left/right part of a star for ¼ ½ ¾ or a full star. */
function starPicker(value, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'star-picker';
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'slider');
  wrap.setAttribute('aria-valuemin', '0');
  wrap.setAttribute('aria-valuemax', '5');
  let current = value;
  const draw = v => {
    wrap.innerHTML = starsDisplay(v, 34) + `<span class="star-val">${v ? fmtRating(v) : 'tap to rate'}</span>`;
    wrap.setAttribute('aria-valuenow', v);
  };
  const valFromEvent = e => {
    const stars = $('.stars', wrap).getBoundingClientRect();
    const x = (e.clientX - stars.left) / stars.width;
    return Math.max(0.25, Math.min(5, Math.ceil(x * 20) / 4));
  };
  wrap.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') draw(valFromEvent(e)); });
  wrap.addEventListener('pointerleave', () => draw(current));
  wrap.addEventListener('click', e => {
    if (!e.target.closest('.stars')) return;
    current = valFromEvent(e);
    draw(current);
    onChange(current);
  });
  wrap.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') current = Math.min(5, current + 0.25);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') current = Math.max(0, current - 0.25);
    else return;
    e.preventDefault();
    draw(current);
    onChange(current);
  });
  draw(current);
  return wrap;
}

/* ----------------------------------------------------------- library */

function spineHTML(b) {
  const h = hash(b.id + b.title);
  const colour = b.spineColour || SPINE_COLOURS[h % SPINE_COLOURS.length];
  const width = spineWidth(b);
  const height = 80 + (h >> 4) % 26;
  const light = isLight(colour);
  const style = ['plain', 'bands', 'plate', 'bands'][(h >> 8) % 4];
  const gilded = b.rating >= 4.75;
  return `<button class="spine ${style} ${light ? 'light' : ''} ${gilded ? 'gilded' : ''}"
      style="--c:${colour};width:${width}px;height:${height}px"
      data-action="open" data-id="${b.id}"
      title="${esc(b.title)} — ${esc(b.authors[0] || '')}${b.rating ? ' · ' + fmtRating(b.rating) + '★' : ''}">
      <span class="spine-title">${esc(b.title)}</span>
      ${gilded ? '<span class="spine-rose">❀</span>' : ''}
    </button>`;
}

function spineWidth(b) {
  return Math.max(15, Math.min(44, Math.round((b.pages || 320) / 15)));
}

function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, bl = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * bl) > 165;
}

function shelfBooks() {
  let list = Store.books.filter(b => b.status === 'read');
  const f = ui.shelfFilter.trim().toLowerCase();
  if (f) list = list.filter(b => (b.title + ' ' + b.authors.join(' ') + ' ' + (b.series?.name || '')).toLowerCase().includes(f));
  const finish = b => firstFinish(b) || '0000' + b.addedAt;
  const sorts = {
    read: (a, b) => finish(a).localeCompare(finish(b)),
    rating: (a, b) => b.rating - a.rating || finish(a).localeCompare(finish(b)),
    author: (a, b) => (lastName(a.authors[0]) + a.year).localeCompare(lastName(b.authors[0]) + b.year),
    colour: (a, b) => hueOf(a) - hueOf(b)
  };
  return list.sort(sorts[ui.shelfSort]);
}

function lastName(n) { return (n || '').split(' ').pop().toLowerCase(); }
function hueOf(b) {
  const c = SPINE_COLOURS[hash(b.id + b.title) % SPINE_COLOURS.length];
  return SPINE_COLOURS.indexOf(c);
}

function packShelves(books) {
  const shelves = [[]];
  let used = 0;
  for (const b of books) {
    const w = spineWidth(b) + 2;
    if (used + w > SHELF_W && shelves[shelves.length - 1].length) {
      shelves.push([]);
      used = 0;
    }
    shelves[shelves.length - 1].push(b);
    used += w;
  }
  return shelves;
}

function renderLibrary(main) {
  const reading = Store.books.filter(b => b.status === 'reading');
  const shelved = shelfBooks();
  const allRead = Store.books.filter(b => b.status === 'read').length;
  const shelves = packShelves(shelved);
  const casesNeeded = Math.ceil(shelves.length / SHELVES_PER_CASE);
  const cases = Math.max(MIN_CASES, casesNeeded + (ui.shelfFilter ? 0 : 1));
  const year = new Date().getFullYear();
  const thisYear = Store.books.reduce((n, b) => n + finishedReads(b).filter(r => r.end.startsWith(year)).length, 0);

  let hall = '';
  for (let c = 0; c < cases; c++) {
    if (c > 0 && c % 3 === 2) hall += windowHTML();
    hall += `<div class="bookcase" data-case="${c}"><div class="case-crown"><span>❦</span></div>`;
    for (let s = 0; s < SHELVES_PER_CASE; s++) {
      const books = shelves[c * SHELVES_PER_CASE + s] || [];
      hall += `<div class="shelf">${books.map(spineHTML).join('')}</div>`;
    }
    hall += `</div>`;
  }

  main.innerHTML = `
    <section class="intro">
      <h2>Welcome home, <span class="script">${esc(Store.data.settings.name || 'Caitlin')}</span></h2>
      <p>${allRead ? `${allRead} book${allRead === 1 ? '' : 's'} on your shelves · ${thisYear} finished in ${year}` : 'Your shelves are waiting. Find a book or import your past ratings to start filling them.'}</p>
    </section>

    <section class="nook">
      <h3 class="section-title">On the reading table</h3>
      ${reading.length ? `<div class="nook-row">${reading.map(readingCard).join('')}</div>`
        : `<p class="muted">Nothing open right now. <a href="#tbr">Pick something from your to-read pile</a> or <a href="#find">find a new book</a>.</p>`}
    </section>

    <section class="hall-wrap">
      <div class="hall-controls">
        <h3 class="section-title">The Grand Library</h3>
        <div class="controls">
          <input type="search" id="shelf-filter" placeholder="Search your shelves…" value="${esc(ui.shelfFilter)}">
          <select id="shelf-sort" aria-label="Arrange shelves">
            <option value="read">In the order I read them</option>
            <option value="rating">By my rating</option>
            <option value="author">By author</option>
            <option value="colour">By colour</option>
          </select>
        </div>
      </div>
      <div class="hall" id="hall">
        <div class="hall-inner">
          <div class="rail"></div>
          <div class="ladder" id="ladder">${ladderSVG()}</div>
          <div class="cases">${hall}</div>
        </div>
        <div class="floor"></div>
      </div>
      <p class="hint">Hover a spine for its title, tap to open it. Spine thickness follows page count; gold roses mark the rare 5-stars.</p>
    </section>`;

  $('#shelf-sort').value = ui.shelfSort;
  $('#shelf-sort').onchange = e => { ui.shelfSort = e.target.value; renderLibrary(main); };
  const filter = $('#shelf-filter');
  filter.oninput = debounce(() => {
    ui.shelfFilter = filter.value;
    renderLibrary(main);
    const f = $('#shelf-filter');
    f.focus();
    f.setSelectionRange(f.value.length, f.value.length);
  }, 250);
  setupLadder();
}

function readingCard(b) {
  const r = currentRead(b);
  const days = r && r.start ? Math.max(1, Math.round((Date.now() - new Date(r.start)) / 864e5)) : null;
  return `<article class="reading-card">
    ${coverHTML(b, 'reading-cover')}
    <div>
      <h4 data-action="open" data-id="${b.id}">${esc(b.title)}</h4>
      <p class="muted">${esc(b.authors.join(', '))}</p>
      <p class="small">${r && r.reread ? '↻ Re-reading · ' : ''}${days ? `day ${days}` : 'reading'}${b.pages ? ` · ${b.pages} pages` : ''}</p>
      <div class="btn-row">
        <button class="btn primary" data-action="finish" data-id="${b.id}">Finished ✿</button>
        <button class="btn ghost" data-action="open" data-id="${b.id}">Open</button>
      </div>
    </div>
  </article>`;
}

function coverHTML(b, cls = 'cover') {
  const src = b.cover || coverUrl(b.coverId);
  const colour = SPINE_COLOURS[hash((b.id || b.olKey || '') + b.title) % SPINE_COLOURS.length];
  return `<div class="${cls} cover-box" style="--c:${colour}">
    <span class="cover-fallback">${esc(b.title)}</span>
    ${src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
  </div>`;
}

function windowHTML() {
  return `<div class="arch-window" aria-hidden="true">
    <div class="pane"><span class="moon"></span><span class="twinkle t1">✦</span><span class="twinkle t2">✧</span><span class="twinkle t3">✦</span></div>
    <div class="curtain left"></div><div class="curtain right"></div>
  </div>`;
}

function ladderSVG() {
  let rungs = '';
  for (let y = 40; y < 560; y += 46) rungs += `<line x1="14" x2="66" y1="${y}" y2="${y}"/>`;
  return `<svg viewBox="0 0 80 600" preserveAspectRatio="none" aria-hidden="true">
    <circle cx="40" cy="8" r="7" class="hook"/>
    <line x1="14" y1="10" x2="10" y2="590" class="rail-side"/>
    <line x1="66" y1="10" x2="70" y2="590" class="rail-side"/>
    <g class="rungs">${rungs}</g>
    <circle cx="10" cy="590" r="7" class="wheel"/><circle cx="70" cy="590" r="7" class="wheel"/>
  </svg>`;
}

function setupLadder() {
  const hall = $('#hall'), ladder = $('#ladder');
  if (!hall) return;
  const inner = $('.hall-inner', hall);
  const place = x => {
    const max = inner.scrollWidth - 90;
    ladder.style.left = Math.max(10, Math.min(max, x - 40)) + 'px';
  };
  place(hall.clientWidth * 0.62);
  hall.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const rect = inner.getBoundingClientRect();
    place(e.clientX - rect.left);
  });
  hall.addEventListener('scroll', () => place(hall.scrollLeft + hall.clientWidth * 0.62), { passive: true });
}

/* --------------------------------------------------------------- find */

function renderFind(main) {
  main.innerHTML = `
    <section class="intro">
      <h2>Find a book</h2>
      <p>Search by title, author or ISBN. Covers, page counts and series come from Open Library.</p>
    </section>
    <form id="search-form" class="search-bar">
      <input type="search" id="q" placeholder="e.g. A Court of Thorns and Roses" value="${esc(ui.lastQuery)}" autocomplete="off">
      <button class="btn primary">Search ✦</button>
    </form>
    <div id="results"></div>`;
  $('#search-form').onsubmit = async e => {
    e.preventDefault();
    const q = $('#q').value.trim();
    if (!q) return;
    ui.lastQuery = q;
    $('#results').innerHTML = loadingHTML('Climbing the ladder…');
    try {
      ui.searchResults = await Api.search(q);
      drawResults();
    } catch (err) {
      $('#results').innerHTML = `<p class="muted">Couldn't reach Open Library just now (${esc(err.message)}). Try again in a moment.</p>`;
    }
  };
  if (ui.searchResults) drawResults();
  $('#q').focus();
}

function drawResults() {
  const el = $('#results');
  if (!ui.searchResults.length) { el.innerHTML = `<p class="muted">No books found. Try fewer words, or add the author's name.</p>`; return; }
  el.innerHTML = `<div class="card-grid">${ui.searchResults.map((r, i) => resultCard(r, i, 'search')).join('')}</div>`;
}

function resultCard(r, i, src, extra = '') {
  const existing = Store.findMatch(r);
  const statusLabel = existing && { want: 'On your to-read pile', reading: 'Reading now', read: `Read · ${fmtRating(existing.rating)}★`, dnf: 'Set aside' }[existing.status];
  return `<article class="book-card">
    ${coverHTML(r)}
    <div class="book-card-body">
      <h4>${esc(r.title)}</h4>
      <p class="muted">${esc(r.authors.slice(0, 2).join(', ') || 'Unknown author')}</p>
      <p class="small">${[r.year, r.pages && r.pages + ' pages'].filter(Boolean).join(' · ')}</p>
      ${r.series ? `<p class="badge">${esc(r.series.name)}${r.series.position != null ? ' #' + r.series.position : ''}</p>` : ''}
      ${r.communityRating ? `<p class="small muted">Others: ${r.communityRating}★</p>` : ''}
      ${extra}
      ${existing ? `<p class="owned" data-action="open" data-id="${existing.id}">✓ ${statusLabel}</p>` : `
      <div class="btn-row">
        <button class="btn small" data-action="add-result" data-idx="${i}" data-as="want" data-src="${src}">+ To read</button>
        <button class="btn small" data-action="add-result" data-idx="${i}" data-as="reading" data-src="${src}">Reading</button>
        <button class="btn small" data-action="add-result" data-idx="${i}" data-as="read" data-src="${src}">Read it</button>
      </div>`}
    </div>
  </article>`;
}

function addResult(idx, as, src) {
  const list = src === 'recs' ? recList : ui.searchResults;
  const r = list && list[idx];
  if (!r) return;
  const book = Store.add({
    ...structuredClone(r),
    status: as,
    enriched: true,
    reads: as === 'reading' ? [{ start: today(), end: null }] : as === 'read' ? [{ start: null, end: today() }] : []
  });
  if (as === 'read') {
    render();
    openBook(book.id);
    toast('Added to your shelves. Give it a rating and fix the date if you need to.');
  } else {
    toast(as === 'want' ? `“${book.title}” added to your to-read pile` : `“${book.title}” is on the reading table`);
    render();
  }
}

/* ---------------------------------------------------------------- TBR */

function renderTbr(main) {
  const want = Store.books.filter(b => b.status === 'want').sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  const dnf = Store.books.filter(b => b.status === 'dnf');
  main.innerHTML = `
    <section class="intro">
      <h2>The to-read pile</h2>
      <p>${want.length} book${want.length === 1 ? '' : 's'} waiting their turn.</p>
    </section>
    ${want.length ? `<div class="card-grid">${want.map(b => `
      <article class="book-card">
        ${coverHTML(b)}
        <div class="book-card-body">
          <h4 data-action="open" data-id="${b.id}">${esc(b.title)}</h4>
          <p class="muted">${esc(b.authors.join(', '))}</p>
          <p class="small">${[b.pages && b.pages + ' pages', b.series && `${b.series.name} #${b.series.position ?? '?'}`].filter(Boolean).map(esc).join(' · ')}</p>
          <div class="btn-row">
            <button class="btn small primary" data-action="start" data-id="${b.id}">Start reading</button>
            <button class="btn small ghost" data-action="open" data-id="${b.id}">Details</button>
          </div>
        </div>
      </article>`).join('')}</div>`
      : `<p class="muted">Empty! Have a look at <a href="#recs">recommendations</a> or <a href="#find">search for something</a>.</p>`}
    ${dnf.length ? `<details class="dnf"><summary>Set aside (${dnf.length})</summary>
      <ul>${dnf.map(b => `<li><a data-action="open" data-id="${b.id}">${esc(b.title)}</a> <span class="muted">· ${esc(b.authors[0] || '')}</span></li>`).join('')}</ul></details>` : ''}`;
}

/* ------------------------------------------------------------ the modal */

function openBook(id) {
  const b = Store.byId(id);
  if (!b) return;
  const m = $('#modal');
  m.dataset.id = id;
  const reads = b.reads.map((r, i) => `
    <li class="read-row" data-i="${i}">
      <span>${i === 0 ? 'First read' : `Re-read ${i}`}</span>
      <label>started <input type="date" data-field="start" value="${r.start || ''}"></label>
      <label>finished <input type="date" data-field="end" value="${r.end || ''}"></label>
      <button class="link" data-remove-read="${i}" title="Remove this read">✕</button>
    </li>`).join('');

  const actions = {
    want: `<button class="btn primary" data-action="start" data-id="${id}">Start reading</button>
           <button class="btn" id="mark-read">I've read it</button>`,
    reading: `<button class="btn primary" data-action="finish" data-id="${id}">Finished ✿</button>
              <button class="btn ghost" data-action="dnf" data-id="${id}">Did not finish</button>`,
    read: `<button class="btn primary" data-action="reread" data-id="${id}">↻ Re-read</button>`,
    dnf: `<button class="btn" data-action="start" data-id="${id}">Give it another go</button>
          <button class="btn ghost" data-action="want" data-id="${id}">Back to to-read</button>`
  }[b.status];

  m.innerHTML = `
    <div class="modal-inner">
      <button class="close" data-action="close-modal" aria-label="Close">✕</button>
      <div class="modal-grid">
        <div>${coverHTML(b, 'modal-cover')}</div>
        <div>
          <p class="status-pill ${b.status}">${{ want: 'To read', reading: 'Reading', read: 'Read', dnf: 'Set aside' }[b.status]}${finishedReads(b).length > 1 ? ` · read ${finishedReads(b).length}×` : ''}</p>
          <h2>${esc(b.title)}</h2>
          <p class="muted">${esc(b.authors.join(', ') || 'Unknown author')}</p>
          <p class="small">${[b.year, b.pages && b.pages + ' pages'].filter(Boolean).join(' · ')}</p>
          ${b.series ? `<p class="badge">${esc(b.series.name)}${b.series.position != null ? ' #' + b.series.position : ''}</p>` : ''}
          <div id="rating-slot"></div>
          <div class="btn-row">${actions}</div>
        </div>
      </div>
      <div id="next-in-series"></div>
      <div class="desc" id="desc"></div>
      ${b.subjects.length ? `<p class="tags">${b.subjects.slice(0, 8).map(s => `<span>${esc(s)}</span>`).join('')}</p>` : ''}
      <h3 class="section-title small-title">Reading history</h3>
      ${reads ? `<ul class="reads">${reads}</ul>` : '<p class="muted small">Not read yet.</p>'}
      <button class="link" id="add-read">+ add a past read</button>
      <h3 class="section-title small-title">My notes</h3>
      <textarea id="notes" rows="3" placeholder="Thoughts, quotes, vibes…">${esc(b.notes || '')}</textarea>
      <div class="modal-foot">
        <label class="small">Pages <input type="number" id="pages" min="1" value="${b.pages || ''}" style="width:6em"></label>
        <button class="link danger" data-action="delete" data-id="${id}">Remove from library</button>
      </div>
    </div>`;

  if (b.status !== 'want') {
    $('#rating-slot', m).appendChild(starPicker(b.rating, v => { b.rating = v; Store.save(); }));
  }
  const markRead = $('#mark-read', m);
  if (markRead) markRead.onclick = () => { finishReading(b); refresh(); };
  $$('.read-row input', m).forEach(inp => inp.onchange = () => {
    const i = +inp.closest('.read-row').dataset.i;
    b.reads[i][inp.dataset.field] = inp.value || null;
    if (b.reads.every(r => r.end) && b.status === 'reading') b.status = 'read';
    Store.save();
  });
  $$('[data-remove-read]', m).forEach(btn => btn.onclick = () => {
    b.reads.splice(+btn.dataset.removeRead, 1);
    if (!b.reads.length && b.status !== 'want') b.status = 'want';
    Store.save();
    refresh();
  });
  $('#add-read', m).onclick = () => {
    b.reads.unshift({ start: null, end: today() });
    b.reads.forEach((r, i) => r.reread = i > 0);
    if (b.status === 'want') b.status = 'read';
    Store.save();
    refresh();
  };
  $('#notes', m).onchange = e => { b.notes = e.target.value; Store.save(); };
  $('#pages', m).onchange = e => { b.pages = parseInt(e.target.value, 10) || null; Store.save(); };

  if (!m.open) m.showModal();
  m.onclose = () => { delete m.dataset.id; render(); };
  m.onclick = e => { if (e.target === m) closeModal(); };

  if (b.description) $('#desc', m).textContent = b.description;
  else if (b.olKey) Api.description(b.olKey).then(d => {
    if (!d) return;
    b.description = d;
    Store.save();
    if (m.dataset.id === id) $('#desc', m).textContent = d;
  }).catch(() => {});

  loadNextInSeries(b).then(next => {
    if (!next || m.dataset.id !== id) return;
    const owned = Store.findMatch(next);
    $('#next-in-series', m).innerHTML = `<div class="next-series">
      <span class="small muted">Next in ${esc(b.series.name)}</span>
      <strong>#${next.series.position} · ${esc(next.title)}</strong>
      ${owned ? `<a class="small" data-action="open" data-id="${owned.id}">✓ already in your library</a>`
        : `<button class="btn small" id="add-next">+ add to to-read</button>`}
    </div>`;
    const add = $('#add-next', m);
    if (add) add.onclick = () => {
      Store.add({ ...next, status: 'want', reads: [], enriched: true });
      toast(`“${next.title}” added to your to-read pile`);
      openBook(id);
    };
  }).catch(() => {});
}

function closeModal() {
  const m = $('#modal');
  if (m.open) m.close();
}

/** Look up the next book in a series (Open Library first, Wikidata fallback). */
async function loadNextInSeries(b) {
  if (!b.series && !b.seriesChecked) {
    b.seriesChecked = true;
    try {
      const w = await Api.wikidataSeries(b.title);
      if (w && w.position != null) b.series = { name: w.name, key: null, position: w.position, wd: w.books };
      Store.save();
    } catch (e) { /* no series */ }
  }
  if (!b.series || b.series.position == null) return null;
  let list = [];
  if (b.series.key) list = await Api.seriesBooks(b.series.key);
  if (!list.length) {
    const w = b.series.wd || (await Api.wikidataSeries(b.title).catch(() => null))?.books || [];
    const nextW = w.find(x => x.position > b.series.position && Number.isInteger(x.position));
    if (!nextW) return null;
    const found = await Api.searchBy({ title: nextW.title, author: b.authors[0], limit: 1 });
    const f = found[0] || { title: nextW.title, authors: b.authors, subjects: [] };
    return { ...f, series: { name: b.series.name, key: null, position: nextW.position } };
  }
  const later = list.filter(x => x.series.position > b.series.position);
  return later.find(x => Number.isInteger(x.series.position)) || later[0] || null;
}

function finishFlow(book) {
  finishReading(book);
  petals();
  toast(`“${book.title}” is on the shelf ❀`);
  render();
  openBook(book.id);
}

/* --------------------------------------------------------------- stats */

function allFinishes() {
  const out = [];
  for (const b of Store.books) for (const r of b.reads) if (r.end && !r.dnf) out.push({ book: b, end: r.end, reread: !!r.reread });
  return out;
}

function renderStats(main) {
  const finishes = allFinishes();
  const years = [...new Set(finishes.map(f => f.end.slice(0, 4)))].sort();
  const thisYear = String(new Date().getFullYear());
  if (!years.includes(thisYear)) years.push(thisYear);
  const sel = ui.statsYear;
  const inPeriod = sel === 'all' ? finishes : finishes.filter(f => f.end.startsWith(sel));
  const rated = inPeriod.filter(f => f.book.rating);
  const pages = inPeriod.reduce((s, f) => s + (f.book.pages || 0), 0);
  const avg = rated.length ? rated.reduce((s, f) => s + f.book.rating, 0) / rated.length : 0;
  const fives = inPeriod.filter(f => f.book.rating >= 5);
  const longest = inPeriod.slice().sort((a, b) => (b.book.pages || 0) - (a.book.pages || 0))[0];
  const goal = +Store.data.settings.goal || 0;

  main.innerHTML = `
    <section class="intro">
      <h2>Reading stats</h2>
      <div class="year-pills">
        ${years.map(y => `<button class="pill ${y === sel ? 'active' : ''}" data-year="${y}">${y}</button>`).join('')}
        <button class="pill ${sel === 'all' ? 'active' : ''}" data-year="all">All time</button>
      </div>
    </section>

    <div class="tiles">
      ${tile(inPeriod.length, 'books finished', inPeriod.filter(f => f.reread).length ? `incl. ${inPeriod.filter(f => f.reread).length} re-read${inPeriod.filter(f => f.reread).length > 1 ? 's' : ''}` : '')}
      ${tile(pages.toLocaleString(), 'pages turned', inPeriod.length ? `≈ ${Math.round(pages / Math.max(1, inPeriod.length))} per book` : '')}
      ${tile(avg ? avg.toFixed(2) : '—', 'average rating', avg ? starsDisplay(avg, 14) : '')}
      ${tile(fives.length, 'five-star books', inPeriod.length ? `${Math.round(fives.length / inPeriod.length * 100)}% (very exclusive)` : '')}
    </div>

    ${sel === thisYear && goal ? goalHTML(inPeriod.length, goal) : ''}

    <div class="chart-grid">
      ${sel === 'all' ? `
        <figure class="chart-card wide"><figcaption>Books finished per year</figcaption><div id="c-years"></div></figure>
        <figure class="chart-card"><figcaption>Pages per year</figcaption><div id="c-pages"></div></figure>
        <figure class="chart-card"><figcaption>Average rating per year</figcaption><div id="c-avg"></div></figure>
      ` : `
        <figure class="chart-card wide"><figcaption>Books finished each month of ${sel}</figcaption><div id="c-months"></div></figure>
        <figure class="chart-card"><figcaption>Pages per month</figcaption><div id="c-pages"></div></figure>
        <figure class="chart-card"><figcaption>Average rating per month</figcaption><div id="c-avg"></div></figure>
      `}
      <figure class="chart-card wide"><figcaption>How I rate (quarter-star by quarter-star)</figcaption><div id="c-dist"></div></figure>
      <figure class="chart-card"><figcaption>Most-read authors</figcaption><div id="c-authors"></div></figure>
      <figure class="chart-card"><figcaption>Favourite themes <span class="muted small">(weighted by rating)</span></figcaption><div id="c-subjects"></div></figure>
    </div>

    <div class="highlights">
      ${fives.length ? `<div><h3 class="section-title">The five-star club</h3><div class="cover-row">${uniqBooks(fives).map(b => `<div data-action="open" data-id="${b.id}" title="${esc(b.title)}">${coverHTML(b, 'mini-cover')}</div>`).join('')}</div></div>` : ''}
      ${longest && longest.book.pages ? `<p class="small">Longest adventure: <a data-action="open" data-id="${longest.book.id}">${esc(longest.book.title)}</a> (${longest.book.pages} pages)</p>` : ''}
      ${finishes.length < Store.books.filter(b => b.status === 'read').length ? `<p class="small muted">Some books have no finish date, so they're on your shelves but not in these charts. Add dates from each book's reading history.</p>` : ''}
    </div>`;

  $$('.year-pills .pill', main).forEach(p => p.onclick = () => { ui.statsYear = p.dataset.year; renderStats(main); });

  if (sel === 'all') {
    const ys = years.length ? range(+years[0], +years[years.length - 1]) : [];
    const per = y => inPeriod.filter(f => f.end.startsWith(y));
    Charts.bars($('#c-years'), ys.map(y => ({ label: String(y), value: per(String(y)).length, tip: `${y}: ${per(String(y)).length} books` })), { title: 'Books per year' });
    Charts.bars($('#c-pages'), ys.map(y => ({ label: String(y), value: per(String(y)).reduce((s, f) => s + (f.book.pages || 0), 0) })), { height: 200, format: kfmt, title: 'Pages per year' });
    Charts.bars($('#c-avg'), ys.map(y => avgBar(String(y), per(String(y)))), { height: 200, format: v => v, title: 'Average rating per year' });
  } else {
    const per = m => inPeriod.filter(f => +f.end.slice(5, 7) === m + 1);
    const nowM = new Date().getMonth();
    const hl = i => sel === thisYear && i === nowM;
    Charts.bars($('#c-months'), MONTHS.map((l, m) => ({ label: l, value: per(m).length, tip: `${l}: ${per(m).length} book${per(m).length === 1 ? '' : 's'}${per(m).length ? ' — ' + per(m).map(f => f.book.title).slice(0, 4).join(', ') + (per(m).length > 4 ? '…' : '') : ''}` })), { highlight: hl, title: 'Books per month' });
    Charts.bars($('#c-pages'), MONTHS.map((l, m) => ({ label: l, value: per(m).reduce((s, f) => s + (f.book.pages || 0), 0) })), { height: 200, format: kfmt, highlight: hl, title: 'Pages per month' });
    Charts.bars($('#c-avg'), MONTHS.map((l, m) => avgBar(l, per(m))), { height: 200, highlight: hl, title: 'Average rating per month' });
  }

  const dist = [];
  for (let v = 0.25; v <= 5; v += 0.25) {
    const n = uniqBooks(rated).filter(b => b.rating === v).length;
    dist.push({ label: Number.isInteger(v) ? v + '★' : '', value: n, tip: `${fmtRating(v)}★: ${n} book${n === 1 ? '' : 's'}` });
  }
  Charts.bars($('#c-dist'), dist, { allLabels: true, title: 'Rating distribution' });

  const authors = {};
  uniqBooks(inPeriod).forEach(b => b.authors.slice(0, 1).forEach(a => {
    authors[a] = authors[a] || { n: 0, sum: 0, rated: 0 };
    authors[a].n++;
    if (b.rating) { authors[a].sum += b.rating; authors[a].rated++; }
  }));
  Charts.hbars($('#c-authors'), Object.entries(authors).sort((a, b) => b[1].n - a[1].n || b[1].sum - a[1].sum).slice(0, 8)
    .map(([a, s]) => ({ label: a, value: s.n, tip: s.rated ? `avg ${(s.sum / s.rated).toFixed(2)}★` : '' })));

  const prof = tasteProfile(uniqBooks(inPeriod));
  Charts.hbars($('#c-subjects'), prof.subjects.slice(0, 8).map(s => ({ label: s.name, value: Math.round(s.score * 100) / 100, tip: `${s.n} book${s.n > 1 ? 's' : ''}` })), { format: v => '♥'.repeat(Math.min(5, Math.max(1, Math.round(v)))) });
}

function tile(big, label, sub) {
  return `<div class="tile"><span class="tile-big">${big}</span><span class="tile-label">${label}</span><span class="tile-sub">${sub || ''}</span></div>`;
}

function goalHTML(n, goal) {
  const pct = Math.min(100, Math.round(n / goal * 100));
  return `<div class="goal">
    <span>${n} of ${goal} books toward this year's goal</span>
    <div class="goal-track"><div class="goal-fill" style="width:${pct}%"><span>❀</span></div></div>
  </div>`;
}

function avgBar(label, list) {
  const r = list.filter(f => f.book.rating);
  const v = r.length ? Math.round(r.reduce((s, f) => s + f.book.rating, 0) / r.length * 100) / 100 : 0;
  return { label, value: v, tip: r.length ? `${label}: ${v}★ across ${r.length} book${r.length > 1 ? 's' : ''}` : `${label}: no ratings` };
}

function uniqBooks(finishes) {
  return [...new Map(finishes.map(f => [f.book.id, f.book])).values()];
}
function range(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }
function kfmt(v) { return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : v; }

/* ------------------------------------------------------ recommendations */

/** Caitlin's scale: 3★ = "didn't vibe", 4★ = genuinely good, 5★ = rare treasure. */
function weight(r) { return r - 3.25; }

function tasteProfile(books) {
  const rated = books.filter(b => b.rating);
  const authors = {}, subjects = {};
  for (const b of rated) {
    const w = weight(b.rating);
    for (const a of b.authors.slice(0, 2)) {
      authors[a] = authors[a] || { name: a, score: 0, n: 0, sum: 0 };
      authors[a].score += w; authors[a].n++; authors[a].sum += b.rating;
    }
    for (const s of b.subjects) {
      const k = s.toLowerCase();
      subjects[k] = subjects[k] || { name: s, score: 0, n: 0 };
      subjects[k].score += w; subjects[k].n++;
    }
  }
  return {
    authors: Object.values(authors).sort((a, b) => b.score - a.score),
    subjects: Object.values(subjects).filter(s => s.score > 0).sort((a, b) => b.score - a.score),
    subjectMap: subjects,
    authorMap: authors
  };
}

let recList = [];

function renderRecs(main) {
  const rated = Store.books.filter(b => b.rating && b.status === 'read');
  main.innerHTML = `
    <section class="intro">
      <h2>What to read next</h2>
      <p>Picked from your own ratings. A 3★ counts as “didn't vibe” and a 4★ as a genuine thumbs up, so a 5★ pulls hardest.</p>
      <button class="btn" id="refresh-recs">↻ Shuffle the shelves</button>
    </section>
    <div id="recs">${rated.length < 3 ? `<p class="muted">Rate at least three books (or import your history in <a href="#settings">Settings</a>) and I'll start suggesting.</p>` : loadingHTML('Consulting the enchanted catalogue…')}</div>`;
  $('#refresh-recs').onclick = () => { Store.data.recCache = null; renderRecs(main); };
  if (rated.length < 3) return;

  const cache = Store.data.recCache;
  if (cache && Date.now() - cache.at < 864e5 * 2) drawRecs(cache.sections);
  else buildRecs().then(sections => {
    Store.data.recCache = { at: Date.now(), sections };
    Store.save();
    if (ui.view === 'recs') drawRecs(sections);
  }).catch(err => {
    if (ui.view === 'recs') $('#recs').innerHTML = `<p class="muted">Couldn't reach Open Library (${esc(err.message)}). Try again shortly.</p>`;
  });
}

async function buildRecs() {
  const books = Store.books;
  const prof = tasteProfile(books.filter(b => b.status === 'read'));
  const dismissed = new Set(Store.data.dismissed || []);
  const seen = new Set();
  const keep = (c, allowMidSeries) => {
    if (!c || !c.olKey || seen.has(c.olKey) || dismissed.has(c.olKey)) return false;
    // Don't drop her into book 4 of something she hasn't started.
    if (!allowMidSeries && c.series && c.series.position > 1) return false;
    if (/ \/ |box(ed)? set|collection|omnibus|\bbooks? \d+\s*-\s*\d+/i.test(c.title) || c.pages > 2000) return false;
    if (Store.findMatch(c)) return false;
    const a = prof.authorMap[c.authors[0]];
    if (a && a.sum / a.n < 3.25) return false; // author you didn't vibe with
    seen.add(c.olKey);
    return true;
  };
  const score = c => {
    let s = (c.communityRating || 3.5) * 0.4;
    for (const sub of c.subjects) { const p = prof.subjectMap[sub.toLowerCase()]; if (p) s += p.score / Math.max(2, p.n); }
    const a = prof.authorMap[c.authors[0]];
    if (a) s += a.score;
    if (!c.cover) s -= 1;
    return s;
  };

  // 1. Next in series you're enjoying
  const seriesGroups = {};
  for (const b of books.filter(b => b.series && b.status === 'read')) {
    const k = b.series.key || b.series.name;
    (seriesGroups[k] = seriesGroups[k] || []).push(b);
  }
  const seriesRecs = [];
  const groups = Object.values(seriesGroups)
    .map(list => ({ list, avg: list.filter(b => b.rating).reduce((s, b) => s + b.rating, 0) / Math.max(1, list.filter(b => b.rating).length) }))
    .filter(g => g.avg >= 3.5)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 8);
  await Promise.all(groups.map(async g => {
    const furthest = g.list.slice().sort((a, b) => (b.series.position || 0) - (a.series.position || 0))[0];
    try {
      const next = await loadNextInSeries(furthest);
      if (next && keep({ ...next, olKey: next.olKey || 'series:' + next.title }, true)) {
        seriesRecs.push({ ...next, why: `You gave ${furthest.series.name} ${fmtRating(g.avg)}★ on average` });
      }
    } catch (e) { /* skip */ }
  }));

  // 2. More from authors you adore
  const loved = prof.authors.filter(a => a.sum / a.n >= 3.75).slice(0, 5);
  const authorRecs = [];
  await Promise.all(loved.map(async a => {
    try {
      const res = await Api.searchBy({ author: a.name, sort: 'rating', limit: 20 });
      res.filter(c => c.authors[0] === a.name || normName(c.authors[0]) === normName(a.name))
        .filter(c => keep(c)).slice(0, 3)
        .forEach(c => authorRecs.push({ ...c, why: `You average ${fmtRating(Math.round(a.sum / a.n * 4) / 4)}★ for ${a.name}` }));
    } catch (e) { /* skip */ }
  }));

  // 3. Themes you love
  const topSubjects = prof.subjects.filter(s => s.n >= 2).slice(0, 6);
  const themed = [];
  await Promise.all(topSubjects.map(async s => {
    try {
      const res = await Api.searchBy({ subject: s.name, sort: 'rating', limit: 30 });
      res.forEach(c => themed.push({ ...c, why: `Because you love ${s.name.toLowerCase()}` }));
    } catch (e) { /* skip */ }
  }));
  const themeRecs = themed.sort((a, b) => score(b) - score(a)).filter(c => keep(c)).slice(0, 12);

  return [
    { title: 'Next in a series you’re enjoying', items: seriesRecs },
    { title: 'More from authors you adore', items: authorRecs.sort((a, b) => score(b) - score(a)).slice(0, 12) },
    { title: 'Matched to your favourite themes', items: themeRecs }
  ];
}

function drawRecs(sections) {
  recList = [];
  const html = sections.filter(s => s.items.length).map(s => `
    <h3 class="section-title">${esc(s.title)}</h3>
    <div class="card-grid">${s.items.map(c => {
      const i = recList.push(c) - 1;
      return resultCard(c, i, 'recs', `<p class="why">${esc(c.why)}</p><button class="link small" data-action="dismiss-rec" data-key="${esc(c.olKey || '')}">not for me</button>`);
    }).join('')}</div>`).join('');
  $('#recs').innerHTML = html || `<p class="muted">I couldn't find anything new. Try rating a few more books, or tap “Shuffle the shelves”.</p>`;
}

function dismissRec(key) {
  Store.data.dismissed = [...new Set([...(Store.data.dismissed || []), key])];
  const c = Store.data.recCache;
  if (c) c.sections.forEach(s => s.items = s.items.filter(i => i.olKey !== key));
  Store.save();
  drawRecs(c ? c.sections : []);
}

/* ------------------------------------------------------------ settings */

function renderSettings(main) {
  const s = Store.data.settings;
  const unenriched = Store.books.filter(b => !b.enriched).length;
  main.innerHTML = `
    <section class="intro"><h2>Settings &amp; imports</h2></section>

    ${cloudPanelHTML()}

    <div class="settings-grid">
      <div class="panel">
        <h3 class="section-title">Import past ratings</h3>
        <p class="small">Upload a CSV export from <strong>Goodreads</strong> (My Books → Import/Export → Export Library) or <strong>StoryGraph</strong> (Manage Account → Export StoryGraph Library). Quarter stars from StoryGraph are kept.</p>
        <p class="small muted">Any other CSV works too if it has columns called <code>Title</code>, <code>Author</code>, <code>Rating</code> and optionally <code>Date Read</code>, <code>Pages</code>, <code>Status</code>.</p>
        <label class="file-btn btn primary">Choose CSV file<input type="file" id="csv" accept=".csv,text/csv" hidden></label>
        <div id="import-status"></div>
      </div>

      <div class="panel">
        <h3 class="section-title">About you</h3>
        <label>Your name <input id="set-name" value="${esc(s.name || '')}"></label>
        <label>Yearly reading goal <input id="set-goal" type="number" min="0" value="${esc(s.goal || '')}"></label>
      </div>

      <div class="panel">
        <h3 class="section-title">Extra copy</h3>
        <p class="small">Cloud saving already keeps every version for you. If you'd also like a file of your own, download one here. You can restore from it later.</p>
        <div class="btn-row">
          <button class="btn" id="export">Download a copy</button>
          <label class="file-btn btn ghost">Restore from a copy<input type="file" id="restore" accept=".json,application/json" hidden></label>
        </div>
      </div>

      <div class="panel">
        <h3 class="section-title">Housekeeping</h3>
        <p class="small">${Store.books.length} books in total. ${unenriched ? `${unenriched} still need covers and details.` : 'All books have been looked up.'}</p>
        <div class="btn-row">
          <button class="btn" id="re-enrich">Look up missing covers again</button>
          <button class="btn ghost danger" id="wipe">Erase everything</button>
        </div>
      </div>
    </div>`;

  $('#set-name').onchange = e => { s.name = e.target.value.trim(); Store.save(); $('#owner-name').textContent = s.name || 'Caitlin'; };
  $('#set-goal').onchange = e => { s.goal = parseInt(e.target.value, 10) || 0; Store.save(); renderGoalRose(); };
  $('#csv').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const rows = parseCSV(await file.text());
      const res = importRows(rows);
      $('#import-status').innerHTML = `<p class="ok">✿ Imported ${res.added} new book${res.added === 1 ? '' : 's'}${res.updated ? `, updated ${res.updated}` : ''}. Now fetching covers in the background…</p><div class="progress"><div id="enrich-bar"></div></div><p class="small muted" id="enrich-text"></p>`;
      Store.data.recCache = null;
      runEnricher();
    } catch (err) {
      $('#import-status').innerHTML = `<p class="danger">Couldn't read that file: ${esc(err.message)}</p>`;
    }
  };
  wireCloudPanel(main);
  $('#export').onclick = exportBackup;
  $('#restore').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Restoring replaces your current library with the backup. Continue?')) return;
    try {
      const n = importBackup(await file.text());
      toast(`Restored ${n} books`);
      render();
    } catch (err) { toast(err.message); }
  };
  $('#re-enrich').onclick = () => {
    Store.books.forEach(b => { if (!b.cover || !b.pages) b.enriched = false; });
    Store.save();
    runEnricher();
    renderSettings(main);
    toast('Looking up covers…');
  };
  $('#wipe').onclick = () => {
    if (confirm('Erase your entire library? Download a backup first if you might want it back.') && confirm('Really erase everything?')) {
      Store.data.books = [];
      Store.data.recCache = null;
      Store.save();
      render();
    }
  };
}

/* ------------------------------------------------------- cloud saving */

function cloudPanelHTML() {
  if (Sync.connected) {
    const c = Sync.cfg;
    return `<div class="panel cloud-panel connected">
      <h3 class="section-title">Cloud saving is on</h3>
      <p>Every change is saved automatically to your private repository
        <a href="https://github.com/${esc(c.owner)}/${esc(c.repo)}/commits" target="_blank" rel="noopener">${esc(c.owner)}/${esc(c.repo)}</a>.
        GitHub keeps every version, so an older copy can always be restored from its history.</p>
      <p class="small muted">On another phone, tablet or computer, open this site and connect there with the same details. Your library appears and stays in step on every device.</p>
      <div class="btn-row">
        <button class="btn" id="sync-now">Save now</button>
        <button class="btn ghost" id="sync-off">Disconnect this device</button>
      </div>
    </div>`;
  }
  return `<div class="panel cloud-panel">
    <h3 class="section-title">Turn on cloud saving</h3>
    <p>Right now your library lives only in this browser. Connect a private GitHub repository and every change saves automatically, keeps its full history, and appears on all your devices. You do this once per device and it takes about five minutes.</p>
    <ol class="steps">
      <li><strong>Make a private repository for your library.</strong>
        <a href="https://github.com/new?name=caitsbooks-data&visibility=private" target="_blank" rel="noopener">Open GitHub's “new repository” page</a>.
        The name <code>caitsbooks-data</code> is filled in. Make sure <em>Private</em> is selected, then press <em>Create repository</em>.</li>
      <li><strong>Make an access key that can only touch that repository.</strong>
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Open GitHub's “new fine-grained token” page</a>, then:
        <ul>
          <li>Token name: <code>Caitsbooks</code>. Expiration: the longest option offered.</li>
          <li>Repository access: <em>Only select repositories</em> → choose <code>caitlinsbooklistings</code>.</li>
          <li>Permissions → Repository permissions → <em>Contents</em> → <em>Read and write</em>.</li>
          <li>Press <em>Generate token</em> and copy the key (it starts with <code>github_pat_</code>).</li>
        </ul></li>
      <li><strong>Paste the details here.</strong>
        <form id="cloud-form" class="cloud-form">
          <label>GitHub username <input id="gh-owner" autocomplete="username" required value="caitlinscriven-spec"></label>
          <label>Repository name <input id="gh-repo" required value="caitlinsbooklistings"></label>
          <label>Access key <input id="gh-token" type="password" autocomplete="off" required placeholder="github_pat_…"></label>
          <button class="btn primary" id="gh-connect">Connect and save</button>
        </form>
        <div id="cloud-msg"></div></li>
    </ol>
    <p class="small muted">The key is kept only on this device and can only read and write that one repository. Anything already in this browser is merged with what's in the cloud, so nothing is lost.</p>
  </div>`;
}

function wireCloudPanel(main) {
  const form = $('#cloud-form');
  if (form) form.onsubmit = async e => {
    e.preventDefault();
    const btn = $('#gh-connect');
    btn.disabled = true;
    btn.textContent = 'Connecting…';
    $('#cloud-msg').innerHTML = '';
    try {
      await Sync.connect({
        owner: $('#gh-owner').value.trim(),
        repo: $('#gh-repo').value.trim(),
        token: $('#gh-token').value.trim()
      });
      toast('Cloud saving is on ☁');
      renderSettings(main);
    } catch (err) {
      $('#cloud-msg').innerHTML = `<p class="danger small">Couldn't connect: ${esc(err.status ? friendlyError(err) : err.message)}</p>`;
      btn.disabled = false;
      btn.textContent = 'Connect and save';
    }
  };
  const now = $('#sync-now');
  if (now) now.onclick = async () => { await Sync.flush(); toast(Sync.state === 'saved' ? 'Saved ✓' : 'Not saved: ' + Sync.message); };
  const off = $('#sync-off');
  if (off) off.onclick = () => {
    if (!confirm('Stop cloud saving on this device? Your cloud copy stays safe on GitHub.')) return;
    Sync.disconnect();
    renderSettings(main);
  };
}

function runEnricher() {
  Enricher.run((done, total, book) => {
    const bar = $('#enrich-bar'), text = $('#enrich-text');
    if (bar) bar.style.width = (done / total * 100) + '%';
    if (text) text.textContent = done < total ? `Looked up ${done} of ${total}: ${book.title}` : `All ${total} looked up ✓`;
    if (done === total && ui.view !== 'settings') render();
  });
}

/* --------------------------------------------------------- whimsy bits */

function renderGoalRose() {
  const year = String(new Date().getFullYear());
  const n = allFinishes().filter(f => f.end.startsWith(year)).length;
  const goal = +Store.data.settings.goal || 0;
  const el = $('#rose-count');
  el.textContent = goal ? `${n} / ${goal} in ${year}` : `${n} read in ${year}`;
  const glow = goal ? Math.min(1, n / goal) : 0.6;
  $('#rose').style.setProperty('--glow', glow.toFixed(2));
}

function petals() {
  const box = document.createElement('div');
  box.className = 'petals';
  for (let i = 0; i < 26; i++) {
    const p = document.createElement('span');
    p.className = 'petal';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.animationDelay = Math.random() * 1.2 + 's';
    p.style.animationDuration = 3 + Math.random() * 2.5 + 's';
    p.style.setProperty('--drift', (Math.random() * 160 - 80) + 'px');
    p.style.setProperty('--spin', (Math.random() * 720 - 360) + 'deg');
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 6500);
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 3200);
}

function loadingHTML(msg) {
  return `<div class="loading"><span class="sparkle">✦</span><span class="sparkle">✧</span><span class="sparkle">✦</span><p>${esc(msg)}</p></div>`;
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
