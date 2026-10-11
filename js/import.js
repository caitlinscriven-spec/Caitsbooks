/* Caitsbooks — importing previous ratings.
   Understands Goodreads exports, StoryGraph exports, a simple
   "Title, Author, Rating, Date Read" CSV, and Caitsbooks JSON backups. */

/** Read CSV (or semicolon/tab separated) text into { headers, rows }. */
function parseTable(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const count = ch => firstLine.split(ch).length - 1;
  const delim = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];

  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(f => f.trim() !== '')) rows.push(row);

  // The header is whichever of the first few rows looks most like column names.
  const looksLikeHeader = r => r.filter(c => Object.values(COLUMN_ROLES).some(sp => sp.like.test(c.toLowerCase().trim()))).length;
  let h = 0;
  rows.slice(0, 10).forEach((r, i) => { if (looksLikeHeader(r) > looksLikeHeader(rows[h])) h = i; });
  return { headers: (rows[h] || []).map(c => c.trim()), rows: rows.slice(h + 1).map(r => r.map(c => c.trim())) };
}

/** Work out which column holds what. Each entry is a column index, or -1. */
const COLUMN_ROLES = {
  title: { label: 'Title', exact: ['title', 'book title'], like: /title|book|name/, not: /author|series|publisher|shelf/ },
  author: { label: 'Author', exact: ['author', 'authors', 'author name'], like: /author|writer|by/, not: /l-f|additional/ },
  rating: { label: 'My rating', exact: ['my rating', 'star rating', 'rating', 'stars', 'my stars'], like: /rating|stars?|score|rated/, not: /average|avg|count|goodreads/ },
  status: { label: 'Read or not', exact: ['exclusive shelf', 'read status', 'status', 'shelf'], like: /status|shelf|read\?|have read|finished\?|done\?/, not: /bookshelves/ },
  dateRead: { label: 'Date finished', exact: ['date read', 'last date read', 'date finished', 'finished', 'read date', 'date completed'], like: /date.*(read|finish|complet|end)|finished|completed|read on|when/, not: /start|added|dates read/ }
};
const EXTRA_COLUMNS = {
  datesRead: ['dates read'],
  dateStarted: ['date started', 'started', 'start date'],
  readCount: ['read count', 'times read'],
  pages: ['number of pages', 'pages', 'page count', 'length'],
  year: ['original publication year', 'year published', 'year', 'published'],
  isbn: ['isbn13', 'isbn/uid', 'isbn'],
  review: ['my review', 'review', 'notes', 'comments', 'thoughts'],
  additional: ['additional authors'],
  dateAdded: ['date added', 'added'],
  moods: ['moods'],
  format: ['format', 'binding', 'edition', 'type', 'medium']
};

function detectColumns(headers) {
  const low = headers.map(h => h.toLowerCase().trim());
  const cols = {};
  for (const [role, spec] of Object.entries(COLUMN_ROLES)) {
    let i = -1;
    for (const e of spec.exact) { i = low.indexOf(e); if (i >= 0) break; }
    if (i < 0) i = low.findIndex(h => spec.like.test(h) && !spec.not.test(h));
    cols[role] = i;
  }
  for (const [role, names] of Object.entries(EXTRA_COLUMNS)) {
    let i = -1;
    for (const e of names) { i = low.indexOf(e); if (i >= 0) break; }
    cols[role] = i;
  }
  return cols;
}

/** "2023/05/14", "2023-05-14", "14/05/2023" -> "2023-05-14" */
function toISODate(s) {
  if (!s) return null;
  let m = s.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return null;
}

function cleanIsbn(s) {
  const v = (s || '').replace(/[^0-9X]/gi, '');
  return v.length >= 10 ? v : null;
}

/** Goodreads titles look like "Heir of Fire (Throne of Glass, #3)". */
function splitSeriesFromTitle(title) {
  const m = title.match(/^(.*?)\s*\(([^()]+?),?\s*#(\d+(?:\.\d+)?)\)\s*$/);
  if (!m) return { title, series: null };
  return { title: m[1].trim(), series: { name: m[2].trim(), key: null, position: parseFloat(m[3]) } };
}

/** "4", "4.5", "3¾", "★★★★½", "8/10", "4 out of 5", "4 stars" -> quarter stars (0 = none). */
function parseRating(raw) {
  let s = String(raw || '').trim();
  if (!s) return 0;
  const glyph = { '¼': 0.25, '½': 0.5, '¾': 0.75 };
  let v;
  const stars = (s.match(/[★⭐]/g) || []).length;
  if (stars) {
    v = stars + (glyph[(s.match(/[¼½¾]/) || [])[0]] || 0);
  } else {
    const out = s.match(/(\d+(?:[.,]\d+)?)\s*(?:\/|out of)\s*(\d+)/i);
    if (out) {
      v = parseFloat(out[1].replace(',', '.')) / parseFloat(out[2]) * 5;
    } else {
      const m = s.match(/(\d+(?:[.,]\d+)?)\s*([¼½¾])?/);
      if (!m) return 0;
      v = parseFloat(m[1].replace(',', '.')) + (glyph[m[2]] || 0);
      if (v > 5 && v <= 10) v = v / 2; // a 10-point scale
    }
  }
  if (!v || isNaN(v)) return 0;
  return Math.min(5, Math.max(0.25, Math.round(v * 4) / 4));
}

/** "Audible Audio", "audio", "Kindle Edition", "Paperback" -> audio / ebook / print (null if unknown). */
function formatFrom(raw) {
  const s = String(raw || '').toLowerCase();
  if (!s) return null;
  if (/audio|audible|listen|narrat/.test(s)) return 'audio';
  if (/kindle|ebook|e-book|digital|epub|nook|kobo|electronic/.test(s)) return 'ebook';
  if (/paper|hard|print|mass market|book/.test(s)) return 'print';
  return null;
}

function statusFrom(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (!s) return null;
  if (/did.?not|dnf|abandon|gave up|stopped/.test(s)) return 'dnf';
  if (/to.?read|tbr|want|wish|unread|not read|not started|^no$|^n$|plan/.test(s)) return 'want';
  if (/current|in progress|^reading$|reading now|started/.test(s)) return 'reading';
  if (/read|finish|complet|done|^yes$|^y$|✓|✔|^x$|^true$/.test(s)) return 'read';
  return null;
}

/** Turn one spreadsheet row into a book. Rows with no recognisable status use `fallback`. */
function rowToBook(cells, cols, fallback = 'read') {
  const at = role => (cols[role] >= 0 ? (cells[cols[role]] || '').trim() : '');
  const rawTitle = at('title');
  if (!rawTitle) return null;
  const { title, series } = splitSeriesFromTitle(rawTitle);

  const authors = at('author').split(/\s*,\s*(?=[A-Z])|\s*;\s*|\s+&\s+/).filter(Boolean).slice(0, 4);
  // Goodreads keeps co-authors separately; StoryGraph uses a comma list already.
  const additional = at('additional');
  if (additional && authors.length === 1) authors.push(...additional.split(/\s*,\s*/).filter(Boolean).slice(0, 2));

  const rating = parseRating(at('rating'));
  const format = formatFrom(at('format'));
  const status = statusFrom(at('status')) || fallback;

  // Collect every finish date we can find.
  const ends = [];
  const datesRead = at('datesRead');
  if (datesRead) {
    // StoryGraph: "2023/01/02-2023/01/15, 2024/03/01-2024/03/09"
    datesRead.split(/,\s*/).forEach(part => {
      const ds = part.match(/\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}/g) || [];
      if (ds.length) ends.push({ start: ds.length > 1 ? toISODate(ds[0]) : null, end: toISODate(ds[ds.length - 1]) });
    });
  }
  if (!ends.length) {
    const end = toISODate(at('dateRead'));
    if (end) ends.push({ start: toISODate(at('dateStarted')), end });
  }
  const readCount = parseInt(at('readCount'), 10) || 0;

  let reads = [];
  if (status === 'read' || status === 'dnf') {
    reads = ends.map(e => ({ start: e.start, end: e.end }));
    if (status === 'read') {
      // Goodreads only keeps the latest date; keep the read count honest with undated reads.
      while (reads.length < readCount) reads.unshift({ start: null, end: null });
      if (!reads.length) reads.push({ start: null, end: null });
    }
    reads.forEach((rd, i) => { if (i > 0) rd.reread = true; if (status === 'dnf') rd.dnf = true; if (format) rd.format = format; });
  } else if (status === 'reading') {
    reads = [{ start: toISODate(at('dateStarted')) || today(), end: null, ...(format ? { format } : {}) }];
  }

  return {
    title,
    authors,
    rating: status === 'want' ? 0 : rating,
    ...(format ? { format } : {}),
    status,
    reads,
    series,
    pages: parseInt(at('pages'), 10) || null,
    year: parseInt(at('year'), 10) || null,
    isbn: cleanIsbn(at('isbn')),
    userIsbn: cleanIsbn(at('isbn')), // the exact edition she read, so its cover wins
    notes: at('review'),
    moods: at('moods'),
    addedAt: toISODate(at('dateAdded')) || today(),
    subjects: [],
    imported: true
  };
}

/** Add parsed books, updating any already in the library. Returns { added, updated }. */
function importBooks(books) {
  let added = 0, updated = 0;
  for (const b of books) {
    const existing = Store.findMatch(b);
    if (existing) {
      if (b.rating) existing.rating = b.rating;
      if (b.status !== 'want' || existing.status === 'want') existing.status = b.status;
      if (b.reads.some(r => r.end) || !existing.reads.length || existing.reads.every(r => !r.end)) existing.reads = b.reads;
      existing.notes = existing.notes || b.notes;
      existing.series = existing.series || b.series;
      if (b.format) existing.format = b.format;
      updated++;
    } else {
      normaliseBook(b);
      Store.data.books.push(b);
      added++;
    }
  }
  Store.save();
  return { added, updated };
}

function importBackup(json) {
  const data = JSON.parse(json);
  if (!data || !Array.isArray(data.books)) throw new Error('That file is not a Caitsbooks backup.');
  Store.replace(data);
  Store.save();
  return data.books.length;
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(Store.data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `caitsbooks-backup-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
