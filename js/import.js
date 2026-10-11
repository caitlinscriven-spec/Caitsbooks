/* Caitsbooks — importing previous ratings.
   Understands Goodreads exports, StoryGraph exports, a simple
   "Title, Author, Rating, Date Read" CSV, and Caitsbooks JSON backups. */

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(f => f !== '')) rows.push(row);
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
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

function quarter(n) {
  const v = parseFloat(n);
  if (!v || isNaN(v)) return 0;
  return Math.min(5, Math.max(0, Math.round(v * 4) / 4));
}

function statusFrom(s) {
  s = (s || '').toLowerCase();
  if (s.includes('current')) return 'reading';
  if (s.includes('did-not') || s.includes('dnf') || s.includes('abandon')) return 'dnf';
  if (s.includes('to-read') || s.includes('to read') || s.includes('want')) return 'want';
  if (s.includes('read')) return 'read';
  return null;
}

function rowToBook(r) {
  const get = (...keys) => {
    for (const k of keys) if (r[k] != null && r[k] !== '') return r[k];
    return '';
  };
  const rawTitle = get('title', 'book title', 'name');
  if (!rawTitle) return null;
  const { title, series } = splitSeriesFromTitle(rawTitle);

  const authorStr = get('author', 'authors', 'author name');
  const authors = authorStr.split(/\s*,\s*(?=[A-Z])|\s*;\s*|\s+&\s+/).filter(Boolean).slice(0, 4);
  const additional = get('additional authors');
  // Goodreads keeps co-authors separately; StoryGraph uses a comma list already.
  if (additional && authors.length === 1) authors.push(...additional.split(/\s*,\s*/).filter(Boolean).slice(0, 2));

  const rating = quarter(get('my rating', 'star rating', 'rating', 'stars'));
  let status = statusFrom(get('exclusive shelf', 'read status', 'status', 'shelf'));

  // Collect every finish date we can find.
  const ends = [];
  const datesRead = get('dates read');
  if (datesRead) {
    // StoryGraph: "2023/01/02-2023/01/15, 2024/03/01-2024/03/09"
    datesRead.split(/,\s*/).forEach(part => {
      const ds = part.match(/\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}/g) || [];
      if (ds.length) ends.push({ start: ds.length > 1 ? toISODate(ds[0]) : null, end: toISODate(ds[ds.length - 1]) });
    });
  }
  if (!ends.length) {
    const end = toISODate(get('date read', 'last date read', 'date finished', 'finished', 'read date'));
    const start = toISODate(get('date started', 'started'));
    if (end) ends.push({ start, end });
  }
  const readCount = parseInt(get('read count'), 10) || 0;
  if (!status) status = ends.length || rating ? 'read' : 'want';

  let reads = [];
  if (status === 'read' || status === 'dnf') {
    reads = ends.map(e => ({ start: e.start, end: e.end }));
    if (status === 'read') {
      // Goodreads only keeps the latest date; keep the read count honest with undated reads.
      while (reads.length < readCount) reads.unshift({ start: null, end: null });
      if (!reads.length) reads.push({ start: null, end: null });
    }
    reads.forEach((rd, i) => { if (i > 0) rd.reread = true; if (status === 'dnf') rd.dnf = true; });
  } else if (status === 'reading') {
    reads = [{ start: toISODate(get('date started')) || today(), end: null }];
  }

  return {
    title,
    authors,
    rating: status === 'want' ? 0 : rating,
    status,
    reads,
    series,
    pages: parseInt(get('number of pages', 'pages', 'page count'), 10) || null,
    year: parseInt(get('original publication year', 'year published', 'year'), 10) || null,
    isbn: cleanIsbn(get('isbn13', 'isbn/uid', 'isbn')),
    notes: get('my review', 'review', 'notes'),
    moods: get('moods'),
    addedAt: toISODate(get('date added')) || today(),
    subjects: [],
    imported: true
  };
}

/** Returns { added, updated, skipped } */
function importRows(rows) {
  let added = 0, updated = 0, skipped = 0;
  for (const r of rows) {
    const b = rowToBook(r);
    if (!b) { skipped++; continue; }
    const existing = Store.findMatch(b);
    if (existing) {
      if (b.rating) existing.rating = b.rating;
      if (b.status !== 'want' || existing.status === 'want') existing.status = b.status;
      if (b.reads.some(r => r.end) || !existing.reads.length) existing.reads = b.reads;
      existing.notes = existing.notes || b.notes;
      existing.series = existing.series || b.series;
      updated++;
    } else {
      normaliseBook(b);
      Store.data.books.push(b);
      added++;
    }
  }
  Store.save();
  return { added, updated, skipped };
}

function importBackup(json) {
  const data = JSON.parse(json);
  if (!data || !Array.isArray(data.books)) throw new Error('That file is not a Caitsbooks backup.');
  Store.data = Object.assign({ books: [], settings: {}, dismissed: [] }, data);
  Store.data.books.forEach(normaliseBook);
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
