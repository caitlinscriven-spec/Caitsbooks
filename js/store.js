/* Caitsbooks — data store, persistence & small helpers.
   Everything lives in this browser's localStorage. Nothing is sent anywhere
   except book look-ups to Open Library / Wikidata. */

const STORE_KEY = 'caitsbooks.v1';

const Store = {
  data: { books: [], settings: { goal: 30, name: 'Caitlin' }, dismissed: [], recCache: null },

  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = Object.assign(this.data, parsed);
        this.data.settings = Object.assign({ goal: 30, name: 'Caitlin' }, parsed.settings || {});
      }
    } catch (e) {
      console.warn('Could not load library', e);
    }
    this.data.books.forEach(normaliseBook);
  },

  save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('Could not save library', e);
      toast('Hmm, your browser would not let me save. Try exporting a backup.');
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
