/* Caitsbooks — Caitlin's Bookshop: the app itself. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STAR_PATH = 'M12 1.8l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.6l-6.3 3.6 1.5-7.1L1.8 9.2 9 8.4z';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const ui = {
  view: 'library',
  shelfSort: 'recent',
  shelfFilter: '',
  shelfFormat: 'all',
  showAll: false,
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
  if (Store.books.some(needsLookup)) runEnricher();
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
}

/* --------------------------------------------------------------- clicks */

function onClick(e) {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const { action, id } = t.dataset;
  const book = id ? Store.byId(id) : null;
  switch (action) {
    case 'open': openBook(id); break;
    case 'start': startReading(book); toast(`“${book.title}” is on the counter`); refresh(); break;
    case 'set-format': setFormat(book, t.dataset.fmt); refresh(); break;
    case 'finish': finishFlow(book); break;
    case 'reread': reRead(book); toast(`Round ${book.reads.length} of “${book.title}”. Pick print, ebook or audio on the counter.`); refresh(); break;
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

/* ---------------------------------------------------------- the shop */

// Fallback jackets: grown-up cloth-bound colours for books without a cover photo.
const JACKETS = ['#7b2d3b', '#2f4a3a', '#25344f', '#a8773a', '#5a3d5c', '#b8476b', '#33302e', '#9a4b2c', '#3f5e66', '#7d6448'];

const FORMATS = { print: 'Print', ebook: 'Ebook', audio: 'Audiobook' };
const ICONS = {
  print: '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M3 5.5c3-1.5 6-1.5 9 .5 3-2 6-2 9-.5v14c-3-1.5-6-1.5-9 .5-3-2-6-2-9-.5z"/><path d="M12 6v14"/></svg>',
  ebook: '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><rect x="5.5" y="2.5" width="13" height="19" rx="2"/><path d="M10 18h4"/></svg>',
  audio: '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4.5" height="7" rx="1.5"/><rect x="16.5" y="14" width="4.5" height="7" rx="1.5"/></svg>'
};

/** How a particular read happened. Older records have no format and count as print. */
function readFormat(r, b) { return (r && r.format) || (b && b.format) || 'print'; }
/** The format of the latest read (or the planned one for the to-read pile). */
function formatOf(b) { return readFormat(b.reads[b.reads.length - 1], b); }

function setFormat(b, fmt) {
  b.format = fmt;
  const r = currentRead(b) || b.reads[b.reads.length - 1];
  if (r) r.format = fmt;
  Store.save();
}

function formatPicker(b) {
  const cur = formatOf(b);
  const short = { print: 'Print', ebook: 'Ebook', audio: 'Audio' };
  return `<div class="fmt-picker" role="radiogroup" aria-label="Format">${Object.entries(short).map(([k, label]) =>
    `<button type="button" role="radio" aria-checked="${k === cur}" data-action="set-format" data-fmt="${k}" data-id="${b.id}">${ICONS[k]}${label}</button>`).join('')}</div>`;
}

function formatBadge(b) {
  return formatOf(b) === 'audio' ? `<span class="fmt-badge" title="Audiobook">${ICONS.audio}</span>` : '';
}

/** Covers to try, best first: one she chose, Apple Books', Open Library's English one, her own edition's. */
function coverSources(b) {
  const out = [];
  if (b.coverPick) out.push(typeof b.coverPick === 'string' ? b.coverPick : coverUrl(b.coverPick));
  if (b.coverApple) out.push(b.coverApple);
  if (b.coverId) out.push(coverUrl(b.coverId));
  else if (b.cover) out.push(b.cover);
  // Her own edition's cover, by ISBN, as a backup if the checked cover won't load.
  if (b.userIsbn) out.push(`https://covers.openlibrary.org/b/isbn/${b.userIsbn}-M.jpg?default=false`);
  return [...new Set(out)];
}

/** An <img> that moves on to the next source if one fails or is a blank placeholder. */
function nextCover(img) {
  const rest = JSON.parse(img.dataset.rest || '[]');
  if (!rest.length) { img.remove(); return; }
  img.dataset.rest = JSON.stringify(rest.slice(1));
  img.src = rest[0];
}
function checkCover(img) { if (img.naturalWidth < 10) nextCover(img); }

function coverHTML(b, cls = 'cover') {
  const [src, ...rest] = coverSources(b);
  const jacket = JACKETS[hash((b.id || b.olKey || '') + b.title) % JACKETS.length];
  return `<div class="${cls} jacket" style="--j:${jacket}">
    <span class="jacket-title">${esc(b.title)}</span>
    <span class="jacket-author">${esc((b.authors || [])[0] || '')}</span>
    ${src ? `<img src="${esc(src)}" data-rest="${esc(JSON.stringify(rest))}" alt="" loading="lazy" onerror="nextCover(this)" onload="checkCover(this)">` : ''}
  </div>`;
}

function lastName(n) { return (n || '').split(' ').pop().toLowerCase(); }

/** What goes on a shelf-talker card: her own notes if she wrote some, otherwise a line for the rating. */
function talkerLine(b) {
  const note = (b.notes || '').replace(/\s+/g, ' ').trim();
  if (note) {
    const first = note.match(/^.{1,120}?[.!?](\s|$)/);
    return first ? first[0].trim() : note.slice(0, 110) + (note.length > 110 ? '…' : '');
  }
  if (b.rating >= 5) return 'A rare five stars. Drop everything.';
  if (b.rating >= 4.75) return 'So close to perfect it hurts.';
  if (b.rating >= 4.5) return 'Loved this one.';
  if (b.rating >= 4) return 'Genuinely good.';
  return 'Worth a look.';
}

function collectionBooks() {
  let list = Store.books.filter(b => b.status === 'read');
  if (ui.shelfFormat === 'audio') list = list.filter(b => b.reads.some(r => readFormat(r, b) === 'audio'));
  if (ui.shelfFormat === 'five') list = list.filter(b => b.rating >= 4.75);
  const f = ui.shelfFilter.trim().toLowerCase();
  if (f) list = list.filter(b => (b.title + ' ' + b.authors.join(' ') + ' ' + (b.series?.name || '') + ' ' + (b.narrator || '')).toLowerCase().includes(f));
  const finish = b => lastFinish(b) || '';
  const sorts = {
    recent: (a, b) => finish(b).localeCompare(finish(a)),
    rating: (a, b) => b.rating - a.rating || finish(b).localeCompare(finish(a)),
    author: (a, b) => (lastName(a.authors[0]) + a.title).localeCompare(lastName(b.authors[0]) + b.title),
    title: (a, b) => normTitle(a.title).localeCompare(normTitle(b.title))
  };
  return list.sort(sorts[ui.shelfSort] || sorts.recent);
}

function renderLibrary(main) {
  const read = Store.books.filter(b => b.status === 'read');
  const reading = Store.books.filter(b => b.status === 'reading');
  const name = esc(Store.data.settings.name || 'Caitlin');

  if (!read.length && !reading.length) {
    main.innerHTML = `<section class="welcome">
      <p class="eyebrow">Opening day</p>
      <h2>The shelves are bare, ${name}.</h2>
      <p>Bring in your past ratings from Goodreads, StoryGraph or a spreadsheet, or look up the book you're reading right now.</p>
      <div class="btn-row"><a class="btn primary" href="#settings">Import my ratings</a><a class="btn" href="#find">Find a book</a></div>
    </section>`;
    return;
  }

  const byFinish = read.slice().sort((a, b) => (lastFinish(b) || '').localeCompare(lastFinish(a) || ''));
  const arrivals = byFinish.filter(b => lastFinish(b)).slice(0, 10);
  const picks = byFinish.filter(b => b.rating >= 4.5).slice(0, 4);
  const wall = collectionBooks();
  const shown = ui.showAll ? wall : wall.slice(0, 48);
  const audioCount = read.filter(b => b.reads.some(r => readFormat(r, b) === 'audio')).length;

  main.innerHTML = `
    ${reading.length ? `<section class="section">
      <div class="section-head"><div><p class="eyebrow">Currently reading</p><h2>On the counter</h2></div></div>
      <div class="counter-row">${reading.map(counterCard).join('')}</div>
    </section>` : ''}

    ${picks.length ? `<section class="section">
      <div class="section-head"><div><p class="eyebrow">Staff picks</p><h2>The ones I'd put in your hands</h2>
        <p>Your highest-rated books, most recent first.</p></div></div>
      <div class="picks">${picks.map((b, i) => `
        <figure class="pick">
          <button class="pick-cover" data-action="open" data-id="${b.id}" aria-label="${esc(b.title)}">${coverHTML(b)}${formatBadge(b)}</button>
          <div class="pick-ledge" aria-hidden="true"></div>
          <figcaption class="talker" style="--tilt:${[-1.4, 1.1, -0.6, 1.6][i % 4]}deg">
            <span class="talker-label">${starsDisplay(b.rating, 12)} &nbsp;${fmtRating(b.rating)}</span>
            <span class="talker-note">${esc(talkerLine(b))}</span>
            <span class="talker-title">${esc(b.title)} · ${esc(b.authors[0] || '')}</span>
          </figcaption>
        </figure>`).join('')}</div>
    </section>` : ''}

    ${arrivals.length ? `<section class="section">
      <div class="section-head"><div><p class="eyebrow">Just finished</p><h2>New arrivals</h2></div></div>
      <div class="ledge-wrap"><div class="ledge">${arrivals.map(b => `
        <button class="ledge-item" data-action="open" data-id="${b.id}" title="${esc(b.title)}">
          ${coverHTML(b)}${formatBadge(b)}
          <span class="ledge-caption"><span>${b.rating ? starsDisplay(b.rating, 10) : 'unrated'}</span><span>${esc(shortDate(lastFinish(b)))}</span></span>
        </button>`).join('')}</div></div>
    </section>` : ''}

    <section class="section">
      <div class="section-head"><div><p class="eyebrow">Everything I've read</p><h2>The collection</h2>
        <p>${read.length} books${audioCount ? `, ${audioCount} of them listened to` : ''}.</p></div></div>
      <div class="toolbar">
        <input type="search" id="shelf-filter" placeholder="Search title, author, series or narrator" value="${esc(ui.shelfFilter)}">
        <select id="shelf-sort" aria-label="Sort">
          <option value="recent">Most recently read</option>
          <option value="rating">My rating</option>
          <option value="author">Author</option>
          <option value="title">Title</option>
        </select>
        <div class="chips" role="group" aria-label="Show">
          <button class="chip" data-fmt-filter="all" aria-pressed="${ui.shelfFormat === 'all'}">All</button>
          <button class="chip" data-fmt-filter="audio" aria-pressed="${ui.shelfFormat === 'audio'}">${ICONS.audio}Audiobooks</button>
          <button class="chip" data-fmt-filter="five" aria-pressed="${ui.shelfFormat === 'five'}">Five-star club</button>
        </div>
      </div>
      ${wall.length ? `<div class="wall">${shown.map(b => `
        <button class="wall-item" data-action="open" data-id="${b.id}">
          ${coverHTML(b)}${formatBadge(b)}
          <span class="wall-title">${esc(b.title)}</span>
          <span class="wall-meta"><span>${b.rating ? starsDisplay(b.rating, 11) : 'unrated'}</span><span>${finishedReads(b).length > 1 ? `read ${finishedReads(b).length}×` : ''}</span></span>
        </button>`).join('')}</div>
        ${shown.length < wall.length ? `<div class="more-row"><button class="btn" id="show-all">Show all ${wall.length}</button></div>` : ''}`
        : `<p class="muted">Nothing matches that.</p>`}
    </section>`;

  $('#shelf-sort').value = ui.shelfSort;
  $('#shelf-sort').onchange = e => { ui.shelfSort = e.target.value; renderLibrary(main); };
  $$('[data-fmt-filter]', main).forEach(c => c.onclick = () => { ui.shelfFormat = c.dataset.fmtFilter; renderLibrary(main); });
  const more = $('#show-all', main);
  if (more) more.onclick = () => { ui.showAll = true; renderLibrary(main); };
  const filter = $('#shelf-filter');
  filter.oninput = debounce(() => {
    ui.shelfFilter = filter.value;
    renderLibrary(main);
    const f = $('#shelf-filter');
    f.focus();
    f.setSelectionRange(f.value.length, f.value.length);
  }, 250);
}

function shortDate(d) {
  if (!d) return '';
  const [y, m] = d.split('-').map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2) === String(new Date().getFullYear()).slice(2) ? '' : "'" + String(y).slice(2)}`.trim();
}

function counterCard(b) {
  const r = currentRead(b);
  const days = r && r.start ? Math.max(1, Math.round((Date.now() - new Date(r.start)) / 864e5)) : null;
  const listening = formatOf(b) === 'audio';
  return `<article class="counter-card">
    <div class="cover-lg" data-action="open" data-id="${b.id}">${coverHTML(b)}</div>
    <div>
      <p class="eyebrow">${r && r.reread ? 'Re-reading · ' : ''}${days ? `Day ${days}` : (listening ? 'Listening' : 'Reading')}${b.pages && !listening ? ` · ${b.pages} pages` : ''}</p>
      <h3 data-action="open" data-id="${b.id}">${esc(b.title)}</h3>
      <p class="byline">${esc(b.authors.join(', '))}${listening && b.narrator ? ` · read by ${esc(b.narrator)}` : ''}</p>
      ${formatPicker(b)}
      <div class="btn-row">
        <button class="btn primary" data-action="finish" data-id="${b.id}">Finished</button>
        <button class="btn ghost" data-action="open" data-id="${b.id}">Details</button>
      </div>
    </div>
  </article>`;
}

/* --------------------------------------------------------------- find */

function renderFind(main) {
  main.innerHTML = `
    <section class="intro">
      <p class="eyebrow">Ask at the counter</p>
      <h2>Find a book</h2>
      <p>Search by title, author or ISBN. Covers, page counts and series come from Open Library.</p>
    </section>
    <form id="search-form" class="search-bar">
      <input type="search" id="q" placeholder="e.g. A Court of Thorns and Roses" value="${esc(ui.lastQuery)}" autocomplete="off">
      <button class="btn primary">Search</button>
    </form>
    <div id="results"></div>`;
  $('#search-form').onsubmit = async e => {
    e.preventDefault();
    const q = $('#q').value.trim();
    if (!q) return;
    ui.lastQuery = q;
    $('#results').innerHTML = loadingHTML('Checking the catalogue…');
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
  const statusLabel = existing && { want: 'Up next', reading: 'On the counter', read: `Read · ${fmtRating(existing.rating)}★`, dnf: 'Set aside' }[existing.status];
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
        <button class="btn small" data-action="add-result" data-idx="${i}" data-as="want" data-src="${src}">Up next</button>
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
    reads: as === 'reading' ? [{ start: today(), end: null, format: 'print' }] : as === 'read' ? [{ start: null, end: today(), format: 'print' }] : []
  });
  if (as === 'read') {
    render();
    openBook(book.id);
    toast('Shelved. Give it a rating, and fix the date if you need to.');
  } else {
    toast(as === 'want' ? `“${book.title}” is up next` : `“${book.title}” is on the counter`);
    render();
  }
}

/* ---------------------------------------------------------------- TBR */

function renderTbr(main) {
  const want = Store.books.filter(b => b.status === 'want').sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  const dnf = Store.books.filter(b => b.status === 'dnf');
  main.innerHTML = `
    <section class="intro">
      <p class="eyebrow">The to-be-read table</p>
      <h2>Up next</h2>
      <p>${want.length ? `${want.length} book${want.length === 1 ? '' : 's'} waiting their turn. Newest additions first.` : 'Nothing waiting. Have a look at <a href="#recs">your picks</a> or <a href="#find">find something</a>.'}</p>
    </section>
    ${want.length ? `<div class="wall">${want.map(b => `
      <div class="tbr-item">
        <button class="wall-item" data-action="open" data-id="${b.id}">${coverHTML(b)}${formatBadge(b)}<span class="wall-title">${esc(b.title)}</span></button>
        <span class="wall-meta"><span>${esc(b.authors[0] || '')}</span></span>
        <button class="btn small primary" data-action="start" data-id="${b.id}">Start ${formatOf(b) === 'audio' ? 'listening' : 'reading'}</button>
      </div>`).join('')}</div>` : ''}
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
      <select data-field="format" aria-label="Format">${Object.entries(FORMATS).map(([k, l]) => `<option value="${k}" ${readFormat(r, b) === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label>started <input type="date" data-field="start" value="${r.start || ''}"></label>
      <label>finished <input type="date" data-field="end" value="${r.end || ''}"></label>
      <button class="link" data-remove-read="${i}" title="Remove this read">Remove</button>
    </li>`).join('');
  const listening = formatOf(b) === 'audio' || b.reads.some(r => readFormat(r, b) === 'audio');

  const actions = {
    want: `<button class="btn primary" data-action="start" data-id="${id}">Start ${formatOf(b) === 'audio' ? 'listening' : 'reading'}</button>
           <button class="btn" id="mark-read">I've read it</button>`,
    reading: `<button class="btn primary" data-action="finish" data-id="${id}">Finished</button>
              <button class="btn ghost" data-action="dnf" data-id="${id}">Did not finish</button>`,
    read: `<button class="btn" data-action="reread" data-id="${id}">Re-read</button>`,
    dnf: `<button class="btn" data-action="start" data-id="${id}">Give it another go</button>
          <button class="btn ghost" data-action="want" data-id="${id}">Back to up next</button>`
  }[b.status];

  m.innerHTML = `
    <div class="modal-inner">
      <button class="close" data-action="close-modal" aria-label="Close">✕</button>
      <div class="modal-grid">
        <div class="modal-cover-col">${coverHTML(b, 'modal-cover')}
          <button class="link small" id="change-cover">Change cover</button></div>
        <div>
          <p class="eyebrow status-pill">${{ want: 'Up next', reading: formatOf(b) === 'audio' ? 'Listening now' : 'Reading now', read: 'Read', dnf: 'Set aside' }[b.status]}${finishedReads(b).length > 1 ? ` · read ${finishedReads(b).length}×` : ''}</p>
          <h2>${esc(b.title)}</h2>
          <p class="byline">${esc(b.authors.join(', ') || 'Unknown author')}</p>
          <p class="small muted">${[b.year, b.pages && b.pages + ' pages'].filter(Boolean).join(' · ')}</p>
          ${b.series ? `<p class="badge">${esc(b.series.name)}${b.series.position != null ? ' #' + b.series.position : ''}</p>` : ''}
          <div class="rating-block" id="rating-slot"></div>
          <div>${formatPicker(b)}</div>
          ${listening ? `<label class="narrator">${ICONS.audio} Narrated by <input id="narrator" placeholder="Narrator's name" value="${esc(b.narrator || '')}"></label>` : ''}
          <div class="btn-row">${actions}</div>
        </div>
      </div>
      <div id="cover-choices"></div>
      <div id="next-in-series"></div>
      <div class="desc" id="desc"></div>
      ${b.subjects.length ? `<p class="tags">${b.subjects.slice(0, 8).map(s => `<span>${esc(s)}</span>`).join('')}</p>` : ''}
      <div class="modal-section">
        <h3 class="small-title">My shelf-talker</h3>
        <p class="small muted">What you'd write on the card next to it in the shop. The first line shows on your staff picks.</p>
        <div class="talker-edit"><textarea id="notes" rows="3" placeholder="Thoughts, quotes, vibes…">${esc(b.notes || '')}</textarea></div>
      </div>
      <div class="modal-section">
        <h3 class="small-title">Reading history</h3>
        ${reads ? `<ul class="reads">${reads}</ul>` : '<p class="muted small">Not read yet.</p>'}
        <button class="link" id="add-read">+ add a past read</button>
      </div>
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
  $$('.read-row input, .read-row select', m).forEach(inp => inp.onchange = () => {
    const i = +inp.closest('.read-row').dataset.i;
    b.reads[i][inp.dataset.field] = inp.value || null;
    if (inp.dataset.field === 'format' && i === b.reads.length - 1) b.format = inp.value;
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
    b.reads.unshift({ start: null, end: today(), format: b.format || 'print' });
    b.reads.forEach((r, i) => r.reread = i > 0);
    if (b.status === 'want') b.status = 'read';
    Store.save();
    refresh();
  };
  $('#notes', m).onchange = e => { b.notes = e.target.value; Store.save(); };
  const change = $('#change-cover', m);
  if (change) change.onclick = async () => {
    const box = $('#cover-choices', m);
    box.innerHTML = loadingHTML('Finding covers from Apple Books and Open Library…');
    // Ask both catalogues; either one failing just means fewer choices.
    const [apple, ol] = await Promise.all([
      appleMatches(b.title, b.authors[0], { all: true }).catch(() => []),
      b.olKey ? Api.englishCovers(b.olKey).catch(() => []) : []
    ]);
    if (m.dataset.id !== id) return;
    const choices = [
      ...[...new Map(apple.map(c => [c.url, c])).values()].map(c => ({ pick: c.url, src: c.url, label: 'Apple Books' })),
      ...ol.map(c => ({ pick: String(c.id), src: coverUrl(c.id), label: c.year || 'Open Library' }))
    ];
    box.innerHTML = choices.length ? `<div class="cover-choices">
        <p class="small muted">Pick the one you know. Apple Books covers first, then English editions from Open Library.</p>
        <div class="choice-grid">${choices.map(c => `<button class="choice" data-pick="${esc(c.pick)}">
          <img src="${esc(c.src)}" alt="" loading="lazy" onload="if (this.naturalWidth < 10) this.parentNode.remove()" onerror="this.parentNode.remove()">
          <span>${esc(c.label)}</span></button>`).join('')}</div></div>`
      : '<p class="small muted">Neither Apple Books nor Open Library has a cover for this book.</p>';
    $$('.choice', box).forEach(btn => btn.onclick = () => {
      const v = btn.dataset.pick;
      b.coverPick = /^\d+$/.test(v) ? +v : v; // Open Library cover id, or an Apple image address
      Store.save();
      toast('Cover changed');
      openBook(id);
    });
  };
  const narr = $('#narrator', m);
  if (narr) narr.onchange = e => { b.narrator = e.target.value.trim(); Store.save(); };
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
        : `<button class="btn small" id="add-next">Add to up next</button>`}
    </div>`;
    const add = $('#add-next', m);
    if (add) add.onclick = () => {
      Store.add({ ...next, status: 'want', reads: [], enriched: true });
      toast(`“${next.title}” is up next`);
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
      if (w && w.position != null) b.series = { name: w.name, key: null, position: w.position, wd: w.books, v2: true };
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
  toast(`“${book.title}” is shelved. How many stars?`);
  render();
  openBook(book.id);
}

/* --------------------------------------------------------------- stats */

function allFinishes() {
  const out = [];
  for (const b of Store.books) for (const r of b.reads) if (r.end && !r.dnf) out.push({ book: b, end: r.end, reread: !!r.reread, format: readFormat(r, b) });
  return out;
}

/** Books read with no finish date (e.g. imported from long ago): one entry each, with no date. */
function undatedReads() {
  return Store.books
    .filter(b => b.status === 'read' && !finishedReads(b).length)
    .map(b => ({ book: b, end: null, undated: true, reread: false, format: formatOf(b) }));
}

function renderStats(main) {
  const finishes = allFinishes();
  const undated = undatedReads();
  const years = [...new Set(finishes.map(f => f.end.slice(0, 4)))].sort();
  const thisYear = String(new Date().getFullYear());
  if (!years.includes(thisYear)) years.push(thisYear);
  // Open on this year if anything is dated this year, otherwise on All time.
  if (!ui.statsYearChosen && !finishes.some(f => f.end.startsWith(thisYear))) ui.statsYear = 'all';
  const sel = ui.statsYear;
  const inPeriod = sel === 'all' ? finishes.concat(undated) : finishes.filter(f => f.end.startsWith(sel));
  const rated = inPeriod.filter(f => f.book.rating);
  // Audiobooks are a different experience: they don't count towards pages turned.
  const listened = inPeriod.filter(f => f.format === 'audio');
  const onPage = inPeriod.filter(f => f.format !== 'audio');
  const pages = onPage.reduce((s, f) => s + (f.book.pages || 0), 0);
  const avg = rated.length ? rated.reduce((s, f) => s + f.book.rating, 0) / rated.length : 0;
  const fives = inPeriod.filter(f => f.book.rating >= 5);
  const longest = onPage.slice().sort((a, b) => (b.book.pages || 0) - (a.book.pages || 0))[0];
  const goal = +Store.data.settings.goal || 0;

  main.innerHTML = `
    <section class="intro">
      <p class="eyebrow">The ledger</p>
      <h2>Reading stats</h2>
      <div class="year-pills">
        ${years.map(y => `<button class="pill ${y === sel ? 'active' : ''}" data-year="${y}">${y}</button>`).join('')}
        <button class="pill ${sel === 'all' ? 'active' : ''}" data-year="all">All time</button>
      </div>
    </section>

    <div class="tiles">
      ${tile(inPeriod.length, 'books finished', [
        inPeriod.filter(f => f.reread).length ? `incl. ${inPeriod.filter(f => f.reread).length} re-read${inPeriod.filter(f => f.reread).length > 1 ? 's' : ''}` : '',
        sel === 'all' && undated.length ? `${undated.length} from before you tracked dates` : ''
      ].filter(Boolean).join(' · '))}
      ${tile(pages.toLocaleString(), 'pages turned', listened.length ? `on the page · plus ${listened.length} audiobook${listened.length === 1 ? '' : 's'}` : (onPage.length ? `≈ ${Math.round(pages / onPage.length)} per book` : ''))}
      ${tile(listened.length, 'audiobooks', inPeriod.length ? `${Math.round(listened.length / inPeriod.length * 100)}% of your reading` : '')}
      ${tile(avg ? avg.toFixed(2) : '—', 'average rating', avg ? starsDisplay(avg, 14) : '')}
      ${tile(fives.length, 'five-star books', inPeriod.length ? `${Math.round(fives.length / inPeriod.length * 100)}% (very exclusive)` : '')}
    </div>

    ${sel === thisYear && goal ? goalHTML(inPeriod.length, goal) : ''}
    ${sel !== 'all' && !inPeriod.length ? `<p class="empty-note">No finished books with a ${sel} date yet.${undated.length ? ` Your ${undated.length} books without a finish date are under <a data-year-link="all">All time</a>.` : ''}</p>` : ''}

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
      <figure class="chart-card"><figcaption>How I read</figcaption><div id="c-formats"></div><p class="small muted" id="fmt-note"></p></figure>
      <figure class="chart-card"><figcaption>Most-read authors</figcaption><div id="c-authors"></div></figure>
      <figure class="chart-card"><figcaption>Favourite themes <span class="muted small">(weighted by rating)</span></figcaption><div id="c-subjects"></div></figure>
    </div>

    <div class="highlights">
      ${fives.length ? `<div><h3 class="section-title">The five-star club</h3><div class="cover-row">${uniqBooks(fives).map(b => `<div data-action="open" data-id="${b.id}" title="${esc(b.title)}">${coverHTML(b, 'mini-cover')}</div>`).join('')}</div></div>` : ''}
      ${longest && longest.book.pages ? `<p class="small">Longest adventure: <a data-action="open" data-id="${longest.book.id}">${esc(longest.book.title)}</a> (${longest.book.pages} pages)</p>` : ''}
      ${undated.length ? `<p class="small muted">${undated.length} book${undated.length === 1 ? ' has' : 's have'} no finish date. They count in All time (shown as “Earlier” on the yearly charts) but not in any single year. You can add a date from a book's reading history.</p>` : ''}
    </div>`;

  $$('.year-pills .pill', main).forEach(p => p.onclick = () => { ui.statsYear = p.dataset.year; ui.statsYearChosen = true; renderStats(main); });
  const allLink = $('[data-year-link]', main);
  if (allLink) allLink.onclick = () => { ui.statsYear = 'all'; ui.statsYearChosen = true; renderStats(main); };

  if (sel === 'all') {
    // Undated books get their own "Earlier" bar in front of the dated years.
    const ys = (undated.length ? ['Earlier'] : []).concat(range(+years[0], +years[years.length - 1]).map(String));
    const per = y => y === 'Earlier' ? undated : finishes.filter(f => f.end.startsWith(y));
    Charts.bars($('#c-years'), ys.map(y => ({ label: y, value: per(y).length, tip: `${y === 'Earlier' ? 'No finish date' : y}: ${per(y).length} book${per(y).length === 1 ? '' : 's'}` })), { title: 'Books per year' });
    Charts.bars($('#c-pages'), ys.map(y => ({ label: y, value: per(y).filter(f => f.format !== 'audio').reduce((s, f) => s + (f.book.pages || 0), 0) })), { height: 200, format: kfmt, title: 'Pages per year' });
    Charts.bars($('#c-avg'), ys.map(y => avgBar(y, per(y))), { height: 200, format: v => v, title: 'Average rating per year' });
  } else {
    const per = m => inPeriod.filter(f => +f.end.slice(5, 7) === m + 1);
    const nowM = new Date().getMonth();
    const hl = i => sel === thisYear && i === nowM;
    Charts.bars($('#c-months'), MONTHS.map((l, m) => ({ label: l, value: per(m).length, tip: `${l}: ${per(m).length} book${per(m).length === 1 ? '' : 's'}${per(m).length ? ' — ' + per(m).map(f => f.book.title).slice(0, 4).join(', ') + (per(m).length > 4 ? '…' : '') : ''}` })), { highlight: hl, title: 'Books per month' });
    Charts.bars($('#c-pages'), MONTHS.map((l, m) => ({ label: l, value: per(m).filter(f => f.format !== 'audio').reduce((s, f) => s + (f.book.pages || 0), 0) })), { height: 200, format: kfmt, highlight: hl, title: 'Pages per month' });
    Charts.bars($('#c-avg'), MONTHS.map((l, m) => avgBar(l, per(m))), { height: 200, highlight: hl, title: 'Average rating per month' });
  }

  const dist = [];
  for (let v = 0.25; v <= 5; v += 0.25) {
    const n = uniqBooks(rated).filter(b => b.rating === v).length;
    dist.push({ label: Number.isInteger(v) ? v + '★' : '', value: n, tip: `${fmtRating(v)}★: ${n} book${n === 1 ? '' : 's'}` });
  }
  Charts.bars($('#c-dist'), dist, { allLabels: true, title: 'Rating distribution' });

  const byFmt = Object.keys(FORMATS).map(k => {
    const list = inPeriod.filter(f => f.format === k);
    const r = list.filter(f => f.book.rating);
    return { k, n: list.length, avg: r.length ? r.reduce((s, f) => s + f.book.rating, 0) / r.length : 0 };
  });
  Charts.hbars($('#c-formats'), byFmt.filter(f => f.n).map(f => ({ label: FORMATS[f.k], value: f.n, tip: f.avg ? `average ${f.avg.toFixed(2)}★` : '' })));
  const audioF = byFmt.find(f => f.k === 'audio'), pageAvg = inPeriod.filter(f => f.format !== 'audio' && f.book.rating);
  if (audioF.avg && pageAvg.length) {
    const diff = audioF.avg - pageAvg.reduce((s, f) => s + f.book.rating, 0) / pageAvg.length;
    $('#fmt-note').textContent = Math.abs(diff) < 0.1 ? 'You rate audiobooks about the same as books you read.'
      : `You rate audiobooks ${Math.abs(diff).toFixed(2)}★ ${diff > 0 ? 'higher' : 'lower'} than books you read on the page.`;
  }

  const authors = {};
  uniqBooks(inPeriod).forEach(b => b.authors.slice(0, 1).forEach(a => {
    authors[a] = authors[a] || { n: 0, sum: 0, rated: 0 };
    authors[a].n++;
    if (b.rating) { authors[a].sum += b.rating; authors[a].rated++; }
  }));
  Charts.hbars($('#c-authors'), Object.entries(authors).sort((a, b) => b[1].n - a[1].n || b[1].sum - a[1].sum).slice(0, 8)
    .map(([a, s]) => ({ label: a, value: s.n, tip: s.rated ? `avg ${(s.sum / s.rated).toFixed(2)}★` : '' })));

  const prof = tasteProfile(uniqBooks(inPeriod), { recency: false });
  Charts.hbars($('#c-subjects'), prof.subjects.slice(0, 8).map(s => ({ label: s.name, value: Math.round(s.score * 100) / 100, tip: `${s.n} book${s.n > 1 ? 's' : ''}` })), { format: v => '♥'.repeat(Math.min(5, Math.max(1, Math.round(v)))) });
}

function tile(big, label, sub) {
  return `<div class="tile"><span class="tile-big">${big}</span><span class="tile-label">${label}</span><span class="tile-sub">${sub || ''}</span></div>`;
}

function goalHTML(n, goal) {
  const pct = Math.min(100, Math.round(n / goal * 100));
  return `<div class="goal">
    <span>${n} of ${goal} books toward this year's goal</span>
    <div class="goal-track"><div class="goal-fill" style="width:${pct}%"></div></div>
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

/** Taste changes. A read counts in full now, half after five years, a quarter
    after ten; a book with no finish date is assumed to be a long-ago read. */
const UNDATED_TASTE = 0.25;
function freshness(b) {
  const d = lastFinish(b);
  if (!d) return UNDATED_TASTE;
  const years = (Date.now() - Date.parse(d)) / (365.25 * 864e5);
  return Math.max(0.25, Math.min(1, Math.pow(0.5, years / 5)));
}

function tasteProfile(books, { recency = true } = {}) {
  const rated = books.filter(b => b.rating);
  const authors = {}, subjects = {};
  for (const b of rated) {
    const f = recency ? freshness(b) : 1;
    const w = weight(b.rating) * f;
    for (const a of b.authors.slice(0, 2)) {
      authors[a] = authors[a] || { name: a, score: 0, n: 0, sum: 0, fresh: 0 };
      authors[a].score += w; authors[a].n++; authors[a].sum += b.rating;
      authors[a].fresh = Math.max(authors[a].fresh, f);
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
      <p class="eyebrow">Picked for you</p>
      <h2>What to read next</h2>
      <p>Picked from your own ratings. A 3★ counts as “didn't vibe” and a 4★ as a genuine thumbs up, so a 5★ pulls hardest.</p>
      <p class="small">Taste changes, so recent reads count most. Books from years ago, or imported without a finish date, count for a quarter as much. Re-read one, or add when you read it, to give it full weight again.</p>
      <button class="btn" id="refresh-recs">Fresh picks</button>
    </section>
    <div id="recs">${rated.length < 3 ? `<p class="muted">Rate at least three books (or import your history in <a href="#settings">Settings</a>) and I'll start suggesting.</p>` : loadingHTML('Pulling a few things off the shelves for you…')}</div>`;
  $('#refresh-recs').onclick = () => { Store.data.recCache = null; renderRecs(main); };
  if (rated.length < 3) return;

  const cache = Store.data.recCache;
  if (cache && cache.v === 2 && Date.now() - cache.at < 864e5 * 2) drawRecs(cache.sections);
  else buildRecs().then(sections => {
    Store.data.recCache = { v: 2, at: Date.now(), sections };
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
    .map(list => ({
      list,
      avg: list.filter(b => b.rating).reduce((s, b) => s + b.rating, 0) / Math.max(1, list.filter(b => b.rating).length),
      fresh: Math.max(...list.map(freshness))
    }))
    // Only series you've read in roughly the last five years; childhood series stay put.
    .filter(g => g.avg >= 3.5 && g.fresh >= 0.5)
    .sort((a, b) => b.avg * b.fresh - a.avg * a.fresh)
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
  const loved = prof.authors.filter(a => a.sum / a.n >= 3.75 && a.score >= 0.5).slice(0, 5);
  const authorRecs = [];
  await Promise.all(loved.map(async a => {
    try {
      const res = await Api.searchBy({ author: a.name, sort: 'rating', limit: 20 });
      res.filter(c => c.authors[0] === a.name || normName(c.authors[0]) === normName(a.name))
        .filter(c => keep(c)).slice(0, 3)
        .forEach(c => authorRecs.push({ ...c, why: `You average ${fmtRating(Math.round(a.sum / a.n * 4) / 4)}★ for ${a.name}${a.fresh < 0.5 ? ' (mostly a while ago)' : ''}` }));
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
  $('#recs').innerHTML = html || `<p class="muted">I couldn't find anything new. Try rating a few more books, or tap “Fresh picks”.</p>`;
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
    <section class="intro"><p class="eyebrow">Back office</p><h2>Settings &amp; imports</h2></section>

    ${cloudPanelHTML()}

    <div id="import-preview"></div>

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
        <p class="small muted">App version ${esc(window.APP_VERSION || 'dev')}</p>
        <p class="small">${Store.books.length} books in total. ${unenriched ? `${unenriched} still need covers and details.` : 'All books have been looked up.'}
          “Find missing covers” looks again for any book still showing a plain coloured cover. To swap a cover you don't like, open the book and tap Change cover.</p>
        <div class="progress"><div id="enrich-bar"></div></div><p class="small muted" id="enrich-text"></p>
        <div class="btn-row">
          <button class="btn" id="re-enrich">Find missing covers</button>
          <button class="btn ghost danger" id="wipe">Erase everything</button>
        </div>
      </div>
    </div>`;

  $('#set-name').onchange = e => { s.name = e.target.value.trim(); Store.save(); $('#owner-name').textContent = s.name || 'Caitlin'; };
  $('#set-goal').onchange = e => { s.goal = parseInt(e.target.value, 10) || 0; Store.save(); };
  $('#csv').onchange = async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const table = parseTable(await file.text());
      if (!table.rows.length) throw new Error('it looks empty.');
      showImportPreview(table, file.name);
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
    // Only books still without a cover; finished work is never thrown away.
    Store.books.forEach(b => {
      if (b.coverPick || b.coverApple || b.coverId) return;
      b.lookupTries = 0;
      b.appleTried = false;
      b.coverV = 0;
      if (!b.olKey) b.enriched = false;
    });
    Store.save();
    renderSettings(main);
    runEnricher();
    toast('Looking for missing covers. Keep the app open until the progress line disappears.');
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

/* --------------------------------------------------------- import preview */

const STATUS_WORDS = { read: 'Read', reading: 'Reading', want: 'To read', dnf: 'Set aside' };

function showImportPreview(table, fileName) {
  const box = $('#import-preview');
  const cols = detectColumns(table.headers);
  let fallback = 'read';

  const options = sel => `<option value="-1">(not in this file)</option>` +
    table.headers.map((h, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(h || `Column ${i + 1}`)}</option>`).join('');

  const draw = () => {
    const books = table.rows.map(r => rowToBook(r, cols, fallback)).filter(Boolean);
    const count = st => books.filter(b => b.status === st).length;
    const rated = books.filter(b => b.rating).length;
    const dated = books.filter(b => b.reads.some(r => r.end)).length;
    const already = books.filter(b => Store.findMatch(b)).length;
    box.innerHTML = `<div class="panel import-panel">
      <h3 class="section-title">Check your import</h3>
      <p>I found <strong>${books.length} books</strong> in <em>${esc(fileName)}</em>. Check the columns and the example rows below, then import.</p>
      <div class="map-grid">
        ${Object.entries(COLUMN_ROLES).map(([role, spec]) => `
          <label>${spec.label}<select data-role="${role}">${options(cols[role])}</select></label>`).join('')}
        <label>Books with no status count as
          <select id="fallback">
            <option value="read" ${fallback === 'read' ? 'selected' : ''}>Read</option>
            <option value="want" ${fallback === 'want' ? 'selected' : ''}>To read</option>
          </select></label>
      </div>
      <p class="chips">
        <span class="chip read">${count('read')} read</span>
        <span class="chip">${count('reading')} reading</span>
        <span class="chip">${count('want')} to read</span>
        ${count('dnf') ? `<span class="chip">${count('dnf')} set aside</span>` : ''}
        <span class="chip">${rated} with a rating</span>
        ${books.some(b => b.format === 'audio') ? `<span class="chip">${ICONS.audio}${books.filter(b => b.format === 'audio').length} audiobooks</span>` : ''}
        <span class="chip">${dated} with a finish date</span>
      </p>
      ${cols.title < 0 ? '<p class="danger small">Pick which column holds the book titles.</p>' : ''}
      <div class="table-wrap"><table class="preview-table">
        <thead><tr><th>Title</th><th>Author</th><th>Status</th><th>Rating</th><th>Finished</th></tr></thead>
        <tbody>${books.slice(0, 6).map(b => `<tr>
          <td>${esc(b.title)}</td><td>${esc(b.authors[0] || '')}</td>
          <td>${STATUS_WORDS[b.status]}</td>
          <td>${b.rating ? starsDisplay(b.rating, 13) + ' ' + fmtRating(b.rating) : '—'}</td>
          <td>${esc((b.reads.find(r => r.end) || {}).end || '—')}</td></tr>`).join('')}</tbody>
      </table></div>
      ${already ? `<p class="small">${already} of these are already in your library. They'll be updated to match this file, which also fixes books an earlier import put on your to-read pile by mistake.</p>` : ''}
      <div class="btn-row">
        <button class="btn primary" id="do-import" ${books.length && cols.title >= 0 ? '' : 'disabled'}>Import ${books.length} books</button>
        <button class="btn ghost" id="cancel-import">Cancel</button>
      </div>
    </div>`;

    $$('select[data-role]', box).forEach(sel => sel.onchange = () => { cols[sel.dataset.role] = +sel.value; draw(); });
    $('#fallback', box).onchange = e => { fallback = e.target.value; draw(); };
    $('#cancel-import', box).onclick = () => { box.innerHTML = ''; };
    $('#do-import', box).onclick = () => {
      const res = importBooks(books);
      box.innerHTML = '';
      $('#import-status').innerHTML = `<p class="ok">✿ Imported ${res.added} new book${res.added === 1 ? '' : 's'}${res.updated ? ` and updated ${res.updated}` : ''}. Covers are being fetched in the background…</p><div class="progress"><div id="enrich-bar"></div></div><p class="small muted" id="enrich-text"></p>`;
      Store.data.recCache = null;
      runEnricher();
      $('#import-status').scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
  };
  draw();
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        <a href="https://github.com/new?name=caitlinsbooklistings&visibility=private" target="_blank" rel="noopener">Open GitHub's “new repository” page</a>.
        Make sure <em>Private</em> is selected, then press <em>Create repository</em>. Already made one (like <code>caitlinsbooklistings</code>)? Skip to step 2.</li>
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
  const banner = $('#lookup-status');
  const pending = Store.books.filter(needsLookup).length;
  if (banner && pending) { banner.hidden = false; banner.textContent = `Updating covers and details for ${pending} books…`; }
  Enricher.run((done, total, book, failed) => {
    if (banner) {
      banner.hidden = done >= total;
      banner.textContent = `Updating covers and details: ${done} of ${total}…`;
    }
    // Let covers appear as they arrive, unless she's in the middle of something.
    const busy = $('#modal').open || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (done % 8 === 0 && done < total && !busy && ['library', 'tbr'].includes(ui.view)) render();
    $$('[id=enrich-bar]').forEach(bar => { bar.style.width = (done / total * 100) + '%'; });
    const msg = done < total ? `Looked up ${done} of ${total}: ${book.title}`
      : `All ${total} looked up ✓${failed ? ` (${failed} couldn't be reached and will be retried next time you open the app)` : ''}`;
    $$('[id=enrich-text]').forEach(t => { t.textContent = msg; });
    if (done === total && ui.view !== 'settings') render();
  });
}

/* --------------------------------------------------------- whimsy bits */

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 3200);
}

function loadingHTML(msg) {
  return `<p class="loading">${esc(msg)}</p>`;
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
