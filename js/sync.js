/* Caitsbooks — automatic cloud saving to a private GitHub repository.

   After every change the whole library is written to `library.json` in a
   private repo the owner controls. Every save is a commit, so GitHub keeps
   the full history and any earlier version can be restored. Each device
   keeps its own copy too, so the app works offline and catches up later.

   Two devices can change things independently: each book carries an
   `updatedAt` stamp and removed books leave a tombstone in `deleted`, so a
   merge keeps the newest version of every book. */

const SYNC_KEY = 'caitsbooks.github';
const SYNC_FILE = 'library.json';
const SYNC_DELAY = 4000;

const Sync = {
  cfg: null,           // { owner, repo, token }
  state: 'off',        // off | saving | saved | error
  message: '',
  lastSaved: null,
  timer: null,
  running: false,
  again: false,

  init() {
    try { this.cfg = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null'); } catch (e) { this.cfg = null; }
    this.setState(this.cfg ? 'saving' : 'off', this.cfg ? 'Checking for changes…' : '');
    if (this.cfg) this.run();
    document.addEventListener('visibilitychange', () => {
      if (!this.cfg) return;
      // Leaving the page: save anything pending right away. Coming back: pick up other devices' changes.
      if (document.visibilityState === 'hidden' && this.timer) this.flush();
      if (document.visibilityState === 'visible') this.run();
    });
  },

  get connected() { return !!this.cfg; },

  schedule() {
    if (!this.cfg) return;
    this.setState('saving', 'Saving…');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), SYNC_DELAY);
  },

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    return this.run();
  },

  /** Pull, merge, push. Only one at a time; a change made meanwhile triggers another round. */
  async run() {
    if (!this.cfg) return;
    if (this.running) { this.again = true; return; }
    this.running = true;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const remote = await this.fetchRemote();
        const merged = mergeLibraries(Store.data, remote.data);
        const localChanged = canonical(merged) !== canonical(Store.data);
        if (localChanged) {
          Store.replace(Object.assign(merged, { recCache: Store.data.recCache }));
          Store.resnap();
          Store.saveLocal();
          if (typeof render === 'function') render();
        }
        if (remote.data && canonical(merged) === canonical(remote.data)) break;
        try {
          await this.push(merged, remote.sha);
          break;
        } catch (e) {
          if (e.status === 409 || e.status === 422) continue; // another device saved first: merge again
          throw e;
        }
      }
      this.lastSaved = new Date();
      this.setState('saved', '');
    } catch (e) {
      console.warn('Cloud save failed', e);
      this.setState('error', friendlyError(e));
    } finally {
      this.running = false;
      if (this.again) { this.again = false; this.run(); }
    }
  },

  async fetchRemote() {
    const res = await this.api(`contents/${SYNC_FILE}`, { allow404: true });
    if (!res) return { sha: null, data: null };
    let text;
    if (res.content) text = fromBase64(res.content);
    else text = await this.api(`contents/${SYNC_FILE}`, { raw: true }); // files over 1 MB
    let data = null;
    try { data = JSON.parse(text); } catch (e) { throw Object.assign(new Error('The library file in your repo is damaged.'), { status: 0 }); }
    return { sha: res.sha, data };
  },

  async push(data, sha) {
    const n = data.books.length;
    await this.api(`contents/${SYNC_FILE}`, {
      method: 'PUT',
      body: {
        message: `Update library (${n} book${n === 1 ? '' : 's'})`,
        content: toBase64(JSON.stringify(forCloud(data), null, 1)),
        ...(sha ? { sha } : {})
      }
    });
  },

  async api(path, { method = 'GET', body, raw = false, allow404 = false, cfg = this.cfg } = {}) {
    const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}${path ? '/' + path : ''}`;
    const res = await fetch(url, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (allow404 && res.status === 404) return null;
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).message || ''; } catch (e) { /* ignore */ }
      throw Object.assign(new Error(msg || `GitHub said ${res.status}`), { status: res.status });
    }
    return raw ? res.text() : res.json();
  },

  /** Check the details work before saving them. Returns the repo info. */
  async connect(cfg) {
    const repo = await this.api('', { cfg });
    if (!repo.private) {
      throw Object.assign(new Error(`“${cfg.repo}” is a public repository, so anyone could read your ratings. Make it private on GitHub (Settings → Danger Zone → Change visibility), then connect again.`), { status: 0 });
    }
    this.cfg = cfg;
    try { localStorage.setItem(SYNC_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
    await this.run();
    if (this.state === 'error') {
      const msg = this.message;
      this.disconnect();
      throw Object.assign(new Error(msg), { status: 0 });
    }
    return repo;
  },

  disconnect() {
    this.cfg = null;
    clearTimeout(this.timer);
    try { localStorage.removeItem(SYNC_KEY); } catch (e) { /* ignore */ }
    this.setState('off', '');
  },

  setState(state, message) {
    this.state = state;
    this.message = message;
    const el = document.getElementById('sync-status');
    if (!el) return;
    el.className = `sync-status ${state}`;
    el.innerHTML = {
      off: `<a href="#settings">⚠ Saved on this device only. Turn on cloud saving</a>`,
      saving: `<span class="dot"></span> ${esc(message || 'Saving…')}`,
      saved: `✓ Saved to your cloud library`,
      error: `<a href="#settings">⚠ Not saving to the cloud: ${esc(message)}</a>`
    }[state];
    el.title = state === 'saved' && this.lastSaved ? `Last saved ${this.lastSaved.toLocaleTimeString()}` : '';
  }
};

/* ------------------------------------------------------------- merging */

function mergeLibraries(local, remote) {
  if (!remote) return JSON.parse(JSON.stringify(local));
  const deleted = { ...(remote.deleted || {}) };
  for (const [id, t] of Object.entries(local.deleted || {})) deleted[id] = Math.max(deleted[id] || 0, t);

  const byId = new Map();
  for (const b of remote.books || []) byId.set(b.id, b);
  for (const b of local.books || []) {
    const r = byId.get(b.id);
    if (!r) { byId.set(b.id, b); continue; }
    // The most recent edit wins; looked-up details either side has are kept.
    const [win, lose] = (b.updatedAt || 0) >= (r.updatedAt || 0) ? [b, r] : [r, b];
    const merged = { ...win };
    for (const [k, v] of Object.entries(lose)) {
      if (!OWNER_FIELDS.includes(k) && (merged[k] == null || (Array.isArray(merged[k]) && !merged[k].length))) merged[k] = v;
    }
    // Covers follow whichever device looked them up most recently, whoever edited the book last.
    if ((lose.coverAt || 0) > (merged.coverAt || 0)) {
      for (const k of ['coverId', 'cover', 'coverV', 'coverAt', 'coverApple', 'appleTried']) if (k in lose) merged[k] = lose[k];
    }
    byId.set(b.id, merged);
  }
  const books = [...byId.values()]
    .filter(b => !(deleted[b.id] && deleted[b.id] >= (b.updatedAt || 0)))
    .map(b => JSON.parse(JSON.stringify(b)));

  const localNewer = (local.settingsUpdatedAt || 0) >= (remote.settingsUpdatedAt || 0);
  return {
    books,
    deleted,
    settings: { ...(localNewer ? local.settings : remote.settings) },
    settingsUpdatedAt: Math.max(local.settingsUpdatedAt || 0, remote.settingsUpdatedAt || 0),
    dismissed: [...new Set([...(remote.dismissed || []), ...(local.dismissed || [])])]
  };
}

/** What goes in the cloud file: no cached descriptions or recommendation cache. */
function forCloud(data) {
  return {
    app: 'caitsbooks',
    version: 1,
    settings: data.settings,
    settingsUpdatedAt: data.settingsUpdatedAt || 0,
    dismissed: data.dismissed || [],
    deleted: data.deleted || {},
    books: data.books.map(({ description, ...b }) => b).sort((a, b) => a.id.localeCompare(b.id))
  };
}

function canonical(data) {
  const c = forCloud(data);
  delete c.app;
  delete c.version;
  return JSON.stringify(c);
}

/* ------------------------------------------------------------- helpers */

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function friendlyError(e) {
  if (e.status === 401) return 'your GitHub access key has expired or was revoked. Add a new one in Settings.';
  if (e.status === 403) return 'your access key can’t write to the repository. Check it has “Contents: Read and write”.';
  if (e.status === 404) return 'the repository wasn’t found. Check the name, and that the key is allowed to use it.';
  if (e.status === 0 && e.message) return e.message;
  if (!navigator.onLine) return 'you’re offline. Changes are kept on this device and will save when you’re back online.';
  return `couldn’t reach GitHub (${e.message}). It will try again on your next change.`;
}
