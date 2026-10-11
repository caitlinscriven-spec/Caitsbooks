/* Caitsbooks — data store, persistence & small helpers.
   The library is kept in this browser (so it works offline) and, once
   cloud saving is connected, copied automatically to a private GitHub
   repository after every change (see sync.js). */

const STORE_KEY = 'caitsbooks.v1';

const Store = {
  data: { books: [], settings: { goal: 30, name: 'Caitlin' }, dismissed: [], deleted: {}, recCache: null },
  // id -> JSON of each book as last seen, used to timestamp what changed
  snap: new Map(),
  settingsSnap: '',

  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) this.replace(JSON.parse(raw));
    } catch (e) {
      console.warn('Could not load library', e);
    }
    this.data.books.forEach(normaliseBook);
    this.resnap();
  },

  /** Swap in a whole library (from storage, a merge or a backup) without timestamping it. */
  replace(data) {
    this.data = Object.assign({ books: [], dismissed: [], deleted: {}, recCache: null }, data);
    this.data.settings = Object.assign({ goal: 30, name: 'Caitlin' }, data.settings || {});
    this.data.deleted = this.data.deleted || {};
    this.data.books.forEach(normaliseBook);
  },

  resnap() {
    this.snap = new Map(this.data.books.map(b => [b.id, bookFingerprint(b)]));
    this.settingsSnap = JSON.stringify(this.data.settings);
  },

  /** Note what changed since last time (so devices can merge), keep a local copy, then sync. */
  save() {
    const now = Date.now();
    const seen = new Set();
    for (const b of this.data.books) {
      seen.add(b.id);
      const fp = bookFingerprint(b);
      if (this.snap.get(b.id) !== fp) {
        b.updatedAt = now;
        this.snap.set(b.id, fp);
      }
    }
    for (const id of [...this.snap.keys()]) {
      if (!seen.has(id)) {
        this.data.deleted[id] = now;
        this.snap.delete(id);
      }
    }
    const sj = JSON.stringify(this.data.settings);
    if (sj !== this.settingsSnap) {
      this.data.settingsUpdatedAt = now;
      this.settingsSnap = sj;
    }
    this.saveLocal();
    if (typeof Sync !== 'undefined') Sync.schedule();
  },

  saveLocal() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('Could not save library on this device', e);
    }
  },

  get books() { return this.data.books; },
  byId(id) { return this.data.books.find(b => b.id === id); },

  add(book) {
    normaliseBook(book);
    this.data.books.push(book);
    this.save();
    return book;
  },

  remove(id) {
    this.data.books = this.data.books.filter(b => b.id !== id);
    this.save();
  },

  /** Find an existing copy of a book by Open Library key, or title + first author. */
  findMatch({ olKey, title, authors }) {
    if (olKey) {
      const hit = this.data.books.find(b => b.olKey === olKey);
      if (hit) return hit;
    }
    const t = normTitle(title);
    const a = normName((authors || [])[0] || '');
    return this.data.books.find(b => normTitle(b.title) === t && (!a || normName(b.authors[0] || '') === a));
  }
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normaliseBook(b) {
  b.id = b.id || uid();
  b.title = b.title || 'Untitled';
  b.authors = Array.isArray(b.authors) ? b.authors : (b.authors ? [b.authors] : []);
  b.subjects = b.subjects || [];
  b.reads = b.reads || [];
  b.status = b.status || 'want';
  b.rating = typeof b.rating === 'number' ? b.rating : 0;
  b.addedAt = b.addedAt || today();
  return b;
}

/** The parts of a book only its owner changes. Looked-up details (covers,
    subjects, series…) are left out so a background look-up never counts
    as an edit that could outvote a real change made on another device. */
const OWNER_FIELDS = ['title', 'authors', 'status', 'rating', 'reads', 'notes', 'pages', 'spineColour'];
function bookFingerprint(b) {
  return JSON.stringify(OWNER_FIELDS.map(k => b[k] ?? null));
}

function normTitle(t) {
  return (t || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]/g, '');
}
function normName(n) {
  return (n || '').toLowerCase().replace(/[^a-z]/g, '');
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Small deterministic hash so a book always gets the same spine. */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 3.75 -> "3¾" */
function fmtRating(r) {
  if (!r) return '—';
  const whole = Math.floor(r);
  const frac = Math.round((r - whole) * 4);
  return (whole || (frac ? '' : '0')) + ['', '¼', '½', '¾'][frac];
}

function fmtDate(d) {
  if (!d) return 'no date';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day || 1).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Lifecycle helpers ------------------------------------------------------- */

function currentRead(book) {
  const last = book.reads[book.reads.length - 1];
  return last && !last.end ? last : null;
}

function startReading(book) {
  if (!currentRead(book)) book.reads.push({ start: today(), end: null });
  book.status = 'reading';
  Store.save();
}

function finishReading(book, date) {
  let r = currentRead(book);
  if (!r) {
    r = { start: null, end: null };
    book.reads.push(r);
  }
  r.end = date || today();
  book.status = 'read';
  Store.save();
}

function reRead(book) {
  book.reads.push({ start: today(), end: null, reread: true });
  book.status = 'reading';
  Store.save();
}

function finishedReads(book) {
  return book.reads.filter(r => r.end && !r.dnf);
}

function firstFinish(book) {
  const ends = finishedReads(book).map(r => r.end).sort();
  return ends[0] || null;
}

function lastFinish(book) {
  const ends = finishedReads(book).map(r => r.end).sort();
  return ends[ends.length - 1] || null;
}
