/* Caitsbooks — talking to the outside world.
   Open Library (search, covers, series, subjects) is the main source.
   Wikidata is a fallback for series order when Open Library doesn't know. */

const OL = 'https://openlibrary.org';
const OL_FIELDS = [
  'key', 'title', 'author_name', 'number_of_pages_median', 'cover_i', 'first_publish_year',
  'subject', 'isbn', 'series_name', 'series_key', 'series_position', 'ratings_average', 'ratings_count'
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

/** Turn an Open Library search doc into our book shape (not yet saved). */
function docToBook(d) {
  const pos = d.series_position && d.series_position[0];
  return {
    olKey: d.key,
    title: d.title,
    authors: d.author_name || [],
    pages: d.number_of_pages_median || null,
    coverId: d.cover_i || null,
    cover: coverUrl(d.cover_i),
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
    const url = `${OL}/search.json?q=${encodeURIComponent(query)}&limit=${limit}&fields=${OL_FIELDS}`;
    const data = await getJSON(url);
    return (data.docs || []).map(docToBook);
  },

  async searchBy({ title, author, subject, sort, limit = 20 }) {
    const p = new URLSearchParams({ fields: OL_FIELDS, limit });
    if (title) p.set('title', title);
    if (author) p.set('author', author);
    if (subject) p.set('subject', subject);
    if (sort) p.set('sort', sort);
    if (author || subject) p.set('language', 'eng');
    const data = await getJSON(`${OL}/search.json?${p}`);
    return (data.docs || []).map(docToBook);
  },

  /** Best single match for an imported title/author. */
  async lookup(title, author, isbn) {
    if (isbn) {
      try {
        const r = await this.search(`isbn:${isbn}`, 1);
        if (r[0]) return r[0];
      } catch (e) { /* fall through */ }
    }
    const r = await this.searchBy({ title, author, limit: 3 });
    return r[0] || null;
  },

  /** Every book in an Open Library series, ordered. */
  async seriesBooks(seriesKey) {
    const url = `${OL}/search.json?q=${encodeURIComponent('series_key:' + seriesKey)}&limit=60&fields=${OL_FIELDS}`;
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

  async description(olKey) {
    if (!olKey) return '';
    const w = await getJSON(`${OL}${olKey}.json`);
    const d = typeof w.description === 'string' ? w.description : (w.description && w.description.value) || '';
    return d.replace(/\r/g, '').split(/\n-{3,}|\n\[/)[0].trim().slice(0, 1500);
  }
};

/** Fill in cover/pages/subjects/series for a stored book (used after imports). */
async function enrichBook(book) {
  const found = await Api.lookup(book.title, book.authors[0], book.isbn);
  if (found) {
    book.olKey = book.olKey || found.olKey;
    if (!book.coverId && found.coverId) {
      book.coverId = found.coverId;
      book.cover = found.cover;
    }
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
}

/** Background queue so a big import doesn't hammer Open Library. */
const Enricher = {
  running: false,
  async run(onProgress) {
    if (this.running) return;
    this.running = true;
    try {
      const todo = Store.books.filter(b => !b.enriched);
      let done = 0;
      for (const book of todo) {
        try {
          await enrichBook(book);
        } catch (e) {
          console.warn('enrich failed', book.title, e);
          book.enriched = true; // don't retry forever; user can re-run from settings
        }
        done++;
        if (done % 5 === 0 || done === todo.length) Store.save();
        onProgress && onProgress(done, todo.length, book);
        await new Promise(r => setTimeout(r, 350));
      }
      Store.save();
    } finally {
      this.running = false;
    }
  }
};
