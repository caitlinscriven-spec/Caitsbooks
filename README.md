# Caitlin's Bookshop

A personal book tracker dressed as an independent bookshop: an oxblood-and-gold shop sign, covers face-out, opinions on handwritten shelf-talkers. There's no server. Your ratings are saved automatically to a private GitHub repository that only you can see.

## What it does

- **Find a book**: search Open Library by title, author or ISBN. It fills in author, page count, cover, year and series position.
- **Track reading**: *To read → Reading → Finished*, plus *Did not finish*. Any book you've read can be re-read or re-listened to (from its card, or from Find a book); a re-read counts toward that year's stats and keeps your original rating. Every read keeps its own dates and format.
- **Quarter-star ratings**: tap the left or right part of a star for ¼, ½, ¾ or a full star. Arrow keys work too.
- **The shop**: what you're reading sits on the counter, your highest-rated books are staff picks with your own shelf-talker notes, recent reads are new arrivals, and everything you've read is a wall of covers you can search and sort.
- **Audiobooks**: every read is marked Print, Ebook or Audiobook (with an optional narrator), and Stats shows how you read and whether you rate audiobooks differently. Imports pick this up from Goodreads' *Binding* and StoryGraph's *Format* columns.
- **Next in series**: each book shows the next one in its series (Open Library, with Wikidata as a fallback), with a one-tap "add to to-read".
- **Stats**: books, pages and average rating by month and by year, how you rate quarter-star by quarter-star, how you read (print, ebook, audio), top authors, favourite genres and a yearly goal.
- **Recommendations**: based on *your* scale (3★ = didn't vibe, 4★ = thumbs up, 5★ pulls hardest) and on how recently you read things (undated books are judged by when they were published, so childhood reads count for less). Three kinds of pick, each with its reason:
  - *Because you loved…*: authors similar to the ones you rate highly (from a bookseller's map in `js/similar.js`), starting with the book most readers start with;
  - *Next in a series you're enjoying*;
  - *More from authors you adore*, most-read first.
  Authors you didn't vibe with are never used. Covers and genres come from Apple Books; Open Library fills gaps.

## Covers

The app picks each book's cover in this order:

1. one you chose with **Change cover** on the book (it offers Apple Books and English Open Library editions),
2. **Apple Books**: the edition sold in Australian (then US and UK) stores, matched on title and author,
3. Open Library's English edition,
4. the edition in your imported file (its ISBN).

Covers are looked up once per book, saved to the cloud with the rest of your library, and shared across your devices. Settings → **Find missing covers** retries any book still showing a plain coloured cover.

## Importing your old ratings

Settings → **Import past ratings** accepts:

- **Goodreads**: My Books → Import and export → Export Library
- **StoryGraph**: Manage Account → Export StoryGraph Library (quarter stars are kept)
- Any CSV with `Title`, `Author`, `Rating` columns and optionally `Date Read`, `Pages`, `Status`

Covers and details are then looked up in the background.

## Cloud saving (set up once per device)

Every change saves itself to `library.json` in a **private** repository (`caitsbooks-data`). Every save is a commit, so GitHub keeps the full history and any earlier version can be restored. Each device also keeps its own copy, so the app works offline and catches up when you're back online. Changes made on different devices are merged: the newest edit to each book wins, and removed books stay removed.

Settings → **Turn on cloud saving** walks you through it:

1. Create a private repository called `caitsbooks-data` on GitHub.
2. Create a *fine-grained* access key limited to that one repository, with **Contents: Read and write**.
3. Paste your username, the repository name and the key into the app.

The key is stored only on that device. If it ever expires, the app shows a warning at the top of every page. Your changes stay safe on the device until you paste in a new key, and then they save.

## Hosting the app

The app itself contains no personal data, so it can be hosted for free with GitHub Pages:

1. Make **this** repository public: Settings → General → Danger Zone → Change visibility. Your ratings live in the separate private `caitsbooks-data` repository.
2. Settings → Pages → *Deploy from a branch* → choose the branch, folder `/ (root)` → Save.
3. After a minute your library is at `https://<your-username>.github.io/Caitsbooks/`. Add it to your phone's home screen.

To run it locally instead: `python3 -m http.server` in this folder, then visit http://localhost:8000.
