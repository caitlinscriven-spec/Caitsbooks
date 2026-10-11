# Caitlin's Bookshop

A personal book tracker dressed as an independent bookshop: an oxblood-and-gold shop sign, covers face-out, opinions on handwritten shelf-talkers. There's no server. Your ratings are saved automatically to a private GitHub repository that only you can see.

## What it does

- **Find a book**: search Open Library by title, author or ISBN. It fills in author, page count, cover, year and series position.
- **Track reading**: *To read → Reading → Finished*, plus *Did not finish* and a **↻ Re-read** button. Every read keeps its own start and finish dates.
- **Quarter-star ratings**: tap the left or right part of a star for ¼, ½, ¾ or a full star. Arrow keys work too.
- **The shop**: what you're reading sits on the counter, your highest-rated books are staff picks with your own shelf-talker notes, recent reads are new arrivals, and everything you've read is a wall of covers you can search and sort.
- **Audiobooks**: every read is marked Print, Ebook or Audiobook (with an optional narrator), and Stats shows how you read and whether you rate audiobooks differently. Imports pick this up from Goodreads' *Binding* and StoryGraph's *Format* columns.
- **Next in series**: each book shows the next one in its series (Open Library, with Wikidata as a fallback), with a one-tap "add to to-read".
- **Stats**: books, pages and average rating by month and by year, how you rate quarter-star by quarter-star, top authors, favourite themes and a yearly goal. The enchanted rose glows brighter as you get closer to your goal.
- **Recommendations**: based on *your* scale. 3★ counts as "didn't vibe", 4★ as a genuine thumbs up, and 5★ pulls hardest. Suggestions come from three places: the next book in series you're enjoying, more from authors you love, and books matching themes you rate highly.

## Covers

Covers come from Open Library, which mixes editions from every language. The app picks the cover in this order:

1. one you chose with **Change cover** on a book (English print and ebook editions only),
2. the exact edition in your imported file (its ISBN),
3. Open Library's best English print edition (audiobook covers are skipped),
4. Open Library's general cover.

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
