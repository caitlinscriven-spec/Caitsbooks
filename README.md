# Caitlin's Enchanted Library 🌹

A personal, very pink, Beauty-and-the-Beast-ish book tracker. No accounts and no server. Your ratings never leave your browser.

## What it does

- **Find a book**: search Open Library by title, author or ISBN. It fills in author, page count, cover, year and series position.
- **Track reading**: *To read → Reading → Finished*, plus *Did not finish* and a **↻ Re-read** button. Every read keeps its own start and finish dates.
- **Quarter-star ratings**: tap the left or right part of a star for ¼, ½, ¾ or a full star. Arrow keys work too.
- **The Grand Library**: finished books fill arched bookcases as spines. Thicker spines mean more pages, and gold roses mark the rare 5-stars. A rolling ladder follows you along the brass rail.
- **Next in series**: each book shows the next one in its series (Open Library, with Wikidata as a fallback), with a one-tap "add to to-read".
- **Stats**: books, pages and average rating by month and by year, how you rate quarter-star by quarter-star, top authors, favourite themes and a yearly goal. The enchanted rose glows brighter as you get closer to your goal.
- **Recommendations**: based on *your* scale. 3★ counts as "didn't vibe", 4★ as a genuine thumbs up, and 5★ pulls hardest. Suggestions come from three places: the next book in series you're enjoying, more from authors you love, and books matching themes you rate highly.

## Importing your old ratings

Settings → **Import past ratings** accepts:

- **Goodreads**: My Books → Import and export → Export Library
- **StoryGraph**: Manage Account → Export StoryGraph Library (quarter stars are kept)
- Any CSV with `Title`, `Author`, `Rating` columns and optionally `Date Read`, `Pages`, `Status`

Covers and details are then looked up in the background.

## Running it

It's plain HTML/CSS/JS with no build step.

- **Easiest**: turn on GitHub Pages for this repo (Settings → Pages → Deploy from a branch → pick the branch, `/ (root)`). Then open the URL on your phone or laptop.
- **Locally**: open `index.html` in a browser, or run `python3 -m http.server` in this folder and visit http://localhost:8000.

Your library is saved in the browser you use it in. Use **Settings → Download backup** now and then, and **Restore backup** to move it to another device.
