/* Caitsbooks — talking to the outside world.
   Open Library (search, covers, series, subjects) is the main source.
   Wikidata is a fallback for series order when Open Library doesn't know. */

const OL = 'https://openlibrary.org';
const OL_FIELDS = [
  'key', 'title', 'author_name', 'number_of_pages_median', 'cover_i', 'first_publish_year',
  'subject', 'isbn', 'series_name', 'series_key', 'series_position', 'ratings_average', 'ratings_count',
  // the best-matching English edition, for an English cover
  'editions', 'editions.cover_i', 'editions.language', 'editions.format', 'editions.publisher'
].join(',');

// Subjects that say nothing about taste.
const BORING_SUBJECTS = /^(fiction|general|large type books|accessible book|protected daisy|in library|lending library|open library|reading level|nyt:|new york times|award:|series:|\[series|english|literature|novel|novels|fiction, general|fiction in english|translations into|american|british|juvenile|children's|ficción|roman|long now|internet archive|place:|time:|person:|overdrive|kindle|ebook|audiobook|textbooks|ebooks)/i;

// Open Library is free and kind; be kind back. At most 2 requests in flight,
// and one gentle retry when it's busy.
const MAX_IN_FLIGHT = 2;
let inFlight = 0;
const waiting = [];

async function throttled(fn) {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise(r => waiting.push(r));
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    const next = waiting.shift();
    if (next) next();
  }
}

async function getJSON(url, retries = 2) {
  try {
    return await throttled(async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
  } catch (e) {
    if (retries <= 0) throw e;
    await new Promise(r => setTimeout(r, 1500 * (3 - retries)));
    return getJSON(url, retries - 1);
  }
}

function coverUrl(coverId, size = 'M') {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : '';
}

function cleanSubjects(list) {
  const seen = new Set();
  const out = [];
  for (const s of list || []) {
    const t = s.trim();
    const k = t.toLowerCase();
    if (!t || t.length > 40 || BORING_SUBJECTS.test(t) || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= 15) break;
  }
  return out;
}

// Bump when the cover-choosing rules change, so every book's cover is chosen again once.
const COVER_RULES = 3;

/** The cover of the English edition Open Library matched, unless it's an audiobook's. */
function englishCover(d) {
  const ed = d.editions && d.editions.docs && d.editions.docs[0];
  if (!ed || !ed.cover_i) return null;
  if (!(ed.language || []).includes('eng')) return null;
  if (/audio/i.test((ed.format || []).join(' ')) || /librivox/i.test((ed.publisher || []).join(' '))) return null;
  return ed.cover_i;
}

/** Turn an Open Library search doc into our book shape (not yet saved). */
function docToBook(d) {
  const english = englishCover(d);
  const cover = english || d.cover_i || null;
  const pos = d.series_position && d.series_position[0];
  return {
    olKey: d.key,
    title: d.title,
    authors: d.author_name || [],
    pages: d.number_of_pages_median || null,
    coverId: cover,
    englishCoverId: english,
    workCoverId: d.cover_i || null,
    cover: coverUrl(cover),
    coverV: COVER_RULES,
    year: d.first_publish_year || null,
    isbn: (d.isbn || []).find(i => i.length === 13) || (d.isbn || [])[0] || null,
    subjects: cleanSubjects(d.subject),
    series: d.series_name && d.series_name[0]
      ? { name: d.series_name[0], key: d.series_key && d.series_key[0], position: pos ? parseFloat(pos) : null }
      : null,
    communityRating: d.ratings_average ? Math.round(d.ratings_average * 100) / 100 : null
  };
}

const Api = {
  async search(query, limit = 20) {
    const url = `${OL}/search.json?q=${encodeURIComponent(query)}&lang=en&limit=${limit}&fields=${OL_FIELDS}`;
    const data = await getJSON(url);
    return (data.docs || []).map(docToBook);
  },

  async searchBy({ title, author, subject, sort, limit = 20 }) {
    const p = new URLSearchParams({ fields: OL_FIELDS, limit, lang: 'en' });
    if (title) p.set('title', title);
    if (author) p.set('author', author);
    if (subject) p.set('subject', subject);
    if (sort) p.set('sort', sort);
    if (author || subject) p.set('language', 'eng');
    const data = await getJSON(`${OL}/search.json?${p}`);
    return (data.docs || []).map(docToBook);
  },

  /** Best single match for an imported title/author. Tries progressively looser searches. */
  async lookup(title, author, isbn) {
    if (isbn) {
      try {
        const r = await this.search(`isbn:${isbn}`, 1);
        if (r[0]) return r[0];
      } catch (e) { /* fall through */ }
    }
    const surname = (author || '').split(/\s+/).pop();
    const short = title.split(/:|, or |\(/i)[0].trim(); // "Babel, or the Necessity of Violence" -> "Babel"
    const sameAuthor = r => !surname || r.authors.some(a => normName(a).endsWith(normName(surname)));
    const attempts = [
      () => this.searchBy({ title, author, limit: 3 }),
      () => this.searchBy({ title: short, author: surname, limit: 5 }),
      () => this.search(`${short} ${surname}`, 5)
    ];
    for (const attempt of attempts) {
      const r = (await attempt()).filter(sameAuthor);
      if (r[0]) return r[0];
    }
    return null;
  },

  /** Every book in an Open Library series, ordered. */
  async seriesBooks(seriesKey) {
    const url = `${OL}/search.json?q=${encodeURIComponent('series_key:' + seriesKey)}&lang=en&limit=60&fields=${OL_FIELDS}`;
    const data = await getJSON(url);
    return (data.docs || []).map(docToBook)
      .filter(b => b.series && b.series.position != null)
      .sort((a, b) => a.series.position - b.series.position);
  },

  /** Fallback: ask Wikidata which series a title belongs to and the ordering. */
  async wikidataSeries(title) {
    const q = `SELECT ?s ?sLabel ?book ?bookLabel ?ord WHERE {
      ?item rdfs:label ${JSON.stringify(title)}@en; wdt:P179 ?s; wdt:P50 [].
      ?book wdt:P50 [].
      ?book p:P179 ?st. ?st ps:P179 ?s. OPTIONAL { ?st pq:P1545 ?ord }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } LIMIT 80`;
    const data = await getJSON(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`);
    const rows = data.results.bindings;
    if (!rows.length) return null;
    const name = rows[0].sLabel.value;
    const books = rows
      .filter(r => r.ord && !isNaN(parseFloat(r.ord.value)))
      .map(r => ({ title: r.bookLabel.value, position: parseFloat(r.ord.value) }))
      .sort((a, b) => a.position - b.position);
    const me = books.find(b => normTitle(b.title) === normTitle(title));
    // Some series have no English name on Wikidata; call it after its first book.
    const label = /^Q\d+$/.test(name) ? `the ${(books[0] || { title }).title} series` : name;
    return { name: label, position: me ? me.position : null, books };
  },

  /** Cover ids of a work's English print and ebook editions, for choosing a cover. */
  async englishCovers(olKey) {
    const data = await getJSON(`${OL}${olKey}/editions.json?limit=200`);
    const seen = new Set();
    const out = [];
    for (const e of data.entries || []) {
      const eng = (e.languages || []).some(l => l.key === '/languages/eng');
      const audio = /audio|cd|mp3/i.test(e.physical_format || '') || /librivox/i.test((e.publishers || []).join(' '));
      const id = (e.covers || []).find(c => c > 0);
      if (!eng || audio || !id || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, year: (e.publish_date || '').match(/\d{4}/)?.[0] || '', publisher: (e.publishers || [])[0] || '' });
    }
    // Newer editions first: they're the ones most people own.
    return out.sort((a, b) => (b.year || '0').localeCompare(a.year || '0')).slice(0, 24);
  },

  /** The most likely English print/ebook cover from a work's full edition list (newest, with an ISBN). */
  async bestEnglishCover(olKey) {
    const data = await getJSON(`${OL}${olKey}/editions.json?limit=200`);
    const scored = [];
    for (const e of data.entries || []) {
      const eng = (e.languages || []).some(l => l.key === '/languages/eng');
      const fmt = (e.physical_format || '').toLowerCase();
      const audio = /audio|cd|mp3|cassette/.test(fmt) || /librivox/i.test((e.publishers || []).join(' '));
      const id = (e.covers || []).find(c => c > 0);
      if (!eng || audio || !id) continue;
      const year = +((e.publish_date || '').match(/\d{4}/) || [0])[0];
      let score = year;                                   // newer editions are the ones people own
      if ((e.isbn_13 || []).length) score += 30;          // a real retail edition
      if (/paperback|hardcover|ebook|kindle/.test(fmt)) score += 20;
      scored.push({ id, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored[0] ? scored[0].id : null;
  },

  /** Is this cover from an English edition? Uses the edition's language, or failing that its title. */
  async coverIsEnglish(coverId, title) {
    const info = await getJSON(`https://covers.openlibrary.org/b/id/${coverId}.json`);
    if (!info || !info.olid) return false;              // can't tell where it came from
    const ed = await getJSON(`${OL}/books/${info.olid}.json`);
    const langs = (ed.languages || []).map(l => l.key);
    if (langs.length) return langs.includes('/languages/eng');
    // No language recorded: trust it only if the edition carries the English title.
    return !!title && normTitle(ed.title || '') === normTitle(title);
  },

  /**
   * Choose a book's cover. The work's main cover is usually the familiar one, so keep it
   * unless it belongs to a foreign edition; then use the matched English edition, then
   * the best English print edition.
   */
  async pickCover({ olKey, title, workCoverId, englishCoverId }) {
    if (workCoverId && (await this.coverIsEnglish(workCoverId, title).catch(() => false))) return workCoverId;
    if (englishCoverId) return englishCoverId;
    if (olKey) {
      const best = await this.bestEnglishCover(olKey).catch(() => null);
      if (best) return best;
    }
    return workCoverId || null;
  },

  /** Choose a stored book's cover again from scratch. Throws if Open Library can't be reached. */
  async recheckCover(book) {
    const url = `${OL}/search.json?q=${encodeURIComponent(`key:"${book.olKey}"`)}&lang=en&limit=1&fields=key,cover_i,editions,editions.cover_i,editions.language,editions.format,editions.publisher`;
    const d = ((await getJSON(url)).docs || [])[0];
    const id = await this.pickCover({ olKey: book.olKey, title: book.title, workCoverId: d && d.cover_i, englishCoverId: d && englishCover(d) });
    if (id && !book.coverPick) setCover(book, id);
    book.coverV = COVER_RULES;
    book.coverAt = Date.now();
  },

  async description(olKey) {
    if (!olKey) return '';
    const w = await getJSON(`${OL}${olKey}.json`);
    const d = typeof w.description === 'string' ? w.description : (w.description && w.description.value) || '';
    return d.replace(/\r/g, '').split(/\n-{3,}|\n\[/)[0].trim().slice(0, 1500);
  }
};

function setCover(book, id) {
  book.coverId = id;
  book.cover = coverUrl(id);
  book.coverAt = Date.now();
}

/** Fill in cover/pages/subjects/series for a stored book (used after imports). */
async function enrichBook(book) {
  const found = await Api.lookup(book.title, book.authors[0], book.isbn);
  if (found) {
    book.olKey = book.olKey || found.olKey;
    const id = await Api.pickCover(found);
    if (id && !book.coverPick) setCover(book, id);
    book.coverV = COVER_RULES;
    book.pages = book.pages || found.pages;
    book.year = book.year || found.year;
    book.isbn = book.isbn || found.isbn;
    if (!book.subjects.length) book.subjects = found.subjects;
    if (found.series && (!book.series || !book.series.key)) {
      book.series = {
        name: (book.series && book.series.name) || found.series.name,
        key: found.series.key,
        position: (book.series && book.series.position) ?? found.series.position
      };
    }
  }
  if (!book.cover && book.isbn) book.cover = `https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg?default=false`;
  book.enriched = true;
  book.coverV = COVER_RULES;
}

/** Does this book still need details or an English cover from Open Library? */
function needsLookup(b) {
  if ((b.lookupTries || 0) >= 3) return false;
  // Unlooked-up books, and (once per change of rules) every book whose cover she hasn't chosen herself.
  return !b.enriched || (b.coverV !== COVER_RULES && !b.coverPick && (!!b.olKey || !b.coverId));
}

/** Background queue so a big import doesn't hammer Open Library. */
const Enricher = {
  running: false,
  async run(onProgress) {
    if (this.running) return;
    this.running = true;
    try {
      // New imports need looking up; older books may need their cover swapped for an English one.
      const todo = Store.books.filter(needsLookup);
      let done = 0, failed = 0;
      for (const book of todo) {
        try {
          if (!book.enriched || !book.olKey) await enrichBook(book);
          else await Api.recheckCover(book);
          book.lookupTries = 0;
        } catch (e) {
          // Open Library is often slow; try again on a later visit, giving up after three goes.
          console.warn('look-up failed', book.title, e);
          book.lookupTries = (book.lookupTries || 0) + 1;
          if (book.lookupTries >= 3) { book.enriched = true; book.coverV = COVER_RULES; }
          failed++;
        }
        done++;
        if (done % 5 === 0 || done === todo.length) Store.save();
        onProgress && onProgress(done, todo.length, book, failed);
        await new Promise(r => setTimeout(r, 350));
      }
      Store.save();
    } finally {
      this.running = false;
    }
  }
};
