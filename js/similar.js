/* Caitsbooks — a bookseller's "if you liked them, try…" knowledge.
   For each author, writers whose books readers of that author tend to love.
   Keyed by author name; matched loosely (case and punctuation ignored).
   It's a starting point the recommender scores against Caitlin's own ratings
   and genres, so an odd pairing here simply gets outranked. */

const SIMILAR_AUTHORS = {
  // Domestic suspense and twisty thrillers
  'Lisa Jewell': ['Sally Hepworth', 'Liane Moriarty', 'Ruth Ware', 'Shari Lapena', 'Lucy Foley', 'Clare Mackintosh', 'Jane Harper', 'Riley Sager'],
  'Sally Hepworth': ['Liane Moriarty', 'Lisa Jewell', 'Jane Harper', 'Holly Wainwright', 'Shari Lapena', 'Clare Mackintosh', 'Kate Morton'],
  'Liane Moriarty': ['Sally Hepworth', 'Lisa Jewell', 'Celeste Ng', 'Jane Harper', 'Holly Wainwright', 'Jodi Picoult', 'Emily Henry'],
  'Alice Feeney': ['Riley Sager', 'Lucy Foley', 'Ruth Ware', 'Shari Lapena', 'Lisa Jewell', 'Ashley Elston', 'Clare Mackintosh'],
  'Amy Tintera': ['Ashley Elston', 'Alice Feeney', 'Riley Sager', 'Lucy Foley', 'Jane Harper', 'Janice Hallett'],
  'Gillian Flynn': ['Ruth Ware', 'Tana French', 'Riley Sager', 'Lisa Jewell', 'Alice Feeney', 'Jane Harper'],
  'Freida McFadden': ['Alice Feeney', 'Shari Lapena', 'Lucy Foley', 'Riley Sager', 'B.A. Paris'],
  'Kendra Elliot': ['Melinda Leigh', 'Lisa Gardner', 'Karin Slaughter', 'Jane Harper'],
  'Pip Drysdale': ['Lisa Jewell', 'Alice Feeney', 'Lucy Foley', 'Shari Lapena', 'Ruth Ware'],
  'Colleen Hoover': ['Taylor Jenkins Reid', 'Emily Henry', 'Abby Jimenez', 'Freida McFadden', 'Tarryn Fisher'],

  // Book-club fiction, families, big feelings
  'Jodi Picoult': ['Diane Chamberlain', 'Liane Moriarty', 'Celeste Ng', 'Kristin Hannah', 'Lisa Genova', 'Chris Bohjalian'],
  'Taylor Jenkins Reid': ['Ann Napolitano', 'Rebecca Serle', 'Emma Straub', 'Elin Hilderbrand', 'Emily Henry', 'Abby Jimenez'],
  'Sarah Damoff': ['Ann Napolitano', 'Ann Patchett', 'Celeste Ng', 'Taylor Jenkins Reid', 'Abraham Verghese'],
  'Florence Knapp': ['Claire Keegan', 'Maggie O\'Farrell', 'Ann Patchett', 'Anne Tyler', 'Elizabeth Strout', 'Ann Napolitano'],
  'Meg Mason': ['Sally Rooney', 'Nina Stibbe', 'Anne Tyler', 'Elizabeth Strout'],
  'Matt Haig': ['Gabrielle Zevin', 'Fredrik Backman', 'Shelby Van Pelt', 'Gail Honeyman', 'Mitch Albom'],
  'Fredrik Backman': ['Gail Honeyman', 'Shelby Van Pelt', 'Gabrielle Zevin', 'Bonnie Garmus', 'Rachel Joyce', 'Clare Pooley', 'Sara Nisha Adams'],
  'Shelby Van Pelt': ['Fredrik Backman', 'Gabrielle Zevin', 'Bonnie Garmus', 'Gail Honeyman', 'Sara Nisha Adams', 'Clare Pooley'],
  'Bonnie Garmus': ['Gabrielle Zevin', 'Shelby Van Pelt', 'Gail Honeyman', 'Ann Napolitano', 'Fredrik Backman'],
  'Gail Honeyman': ['Fredrik Backman', 'Shelby Van Pelt', 'Rachel Joyce', 'Bonnie Garmus', 'Clare Pooley'],
  'Allen Levi': ['Mitch Albom', 'Fredrik Backman', 'Shelby Van Pelt', 'Rachel Joyce'],
  'Emma Grey': ['Holly Wainwright', 'Sally Hepworth', 'Abby Jimenez', 'Beth O\'Leary', 'Mhairi McFarlane'],
  'Milly Johnson': ['Mhairi McFarlane', 'Beth O\'Leary', 'Jenny Colgan', 'Sophie Kinsella'],
  'Jenny Colgan': ['Milly Johnson', 'Beth O\'Leary', 'Mhairi McFarlane', 'Sophie Kinsella', 'Felicity Hayes-McCoy'],

  // Historical fiction
  'Kristin Hannah': ['Kate Quinn', 'Martha Hall Kelly', 'Kristin Harmel', 'Ruta Sepetys', 'Heather Morris', 'Lisa Wingate', 'Pam Jenoff'],
  'Kate Morton': ['Natasha Lester', 'Lucinda Riley', 'Kate Quinn', 'Kristin Harmel', 'Pip Williams', 'Lisa Wingate'],
  'Pip Williams': ['Kate Grenville', 'Natasha Lester', 'Geraldine Brooks', 'Kate Morton', 'Kate Quinn'],
  'Markus Zusak': ['Anthony Doerr', 'John Boyne', 'Ruta Sepetys', 'Kristin Hannah', 'Heather Morris'],
  'Anthony Doerr': ['Markus Zusak', 'Kristin Hannah', 'Abraham Verghese', 'Ann Patchett', 'Ruta Sepetys'],
  'John Boyne': ['Hanya Yanagihara', 'Markus Zusak', 'Ann Patchett', 'Kate Atkinson', 'Garth Greenwell'],
  'Khaled Hosseini': ['Elif Shafak', 'Abraham Verghese', 'Kristin Hannah', 'Markus Zusak', 'Lisa See'],
  'Abraham Verghese': ['Ann Patchett', 'Barbara Kingsolver', 'Anthony Doerr', 'Khaled Hosseini', 'Elif Shafak'],
  'Kathryn Stockett': ['Sue Monk Kidd', 'Delia Owens', 'Lisa Wingate', 'Kristin Hannah'],
  'William Andrews': ['Lisa See', 'Kristin Hannah', 'Heather Morris', 'Jamie Ford'],
  'Hanya Yanagihara': ['John Boyne', 'Garth Greenwell', 'Ann Patchett', 'Douglas Stuart'],
  'Bryce Courtenay': ['Wilbur Smith', 'Colleen McCullough', 'Tim Winton'],

  // Romantasy and fantasy
  'Rebecca Yarros': ['Carissa Broadbent', 'Jennifer L. Armentrout', 'Elise Kova', 'Raven Kennedy', 'Danielle L. Jensen', 'Rachel Gillig', 'Hannah Whitten', 'Scarlett St. Clair'],
  'Sarah J. Maas': ['Jennifer L. Armentrout', 'Carissa Broadbent', 'Holly Black', 'Leigh Bardugo', 'Elise Kova', 'Raven Kennedy'],
  'Olivia Wildenstein': ['Carissa Broadbent', 'Elise Kova', 'Raven Kennedy', 'Jennifer L. Armentrout', 'Scarlett St. Clair'],
  'Ivy Asher': ['Raven Kennedy', 'Jennifer L. Armentrout', 'Carissa Broadbent', 'Laura Thalassa'],
  'Marianna Peci': ['Carissa Broadbent', 'Elise Kova', 'Raven Kennedy'],
  'Erin A. Craig': ['Rachel Gillig', 'Hannah Whitten', 'Stephanie Garber', 'Holly Black', 'Margaret Rogerson'],
  'James Islington': ['Brandon Sanderson', 'Pierce Brown', 'R.F. Kuang', 'John Gwynne', 'Joe Abercrombie', 'Scott Lynch'],
  'Brandon Sanderson': ['James Islington', 'Travis Baldree', 'Pierce Brown', 'Robin Hobb'],
  'Kiersten White': ['Holly Black', 'Leigh Bardugo', 'Marie Rutkoski', 'Rachel Hartman', 'Tamora Pierce'],
  'Tamora Pierce': ['Kiersten White', 'Robin McKinley', 'Rachel Hartman', 'Holly Black'],
  'J.K. Rowling': ['Jessica Townsend', 'Philip Pullman', 'Rick Riordan'],
  'C.S. Lewis': ['Philip Pullman', 'Jessica Townsend', 'Madeleine L\'Engle'],

  // Cosy and witchy fantasy
  'C.J. Archer': ['Travis Baldree', 'Heather Fawcett', 'India Holton', 'Sangu Mandanna', 'Juliet Marillier'],
  'Abigail Drake': ['Sangu Mandanna', 'Travis Baldree', 'Heather Fawcett', 'Rebecca Thorne'],
  'Maisey Yates': ['Sangu Mandanna', 'Heather Fawcett', 'India Holton'],

  // Romance
  'Ashley Poston': ['Emily Henry', 'Abby Jimenez', 'Rebecca Serle', 'Annabel Monaghan', 'Carley Fortune', 'Christina Lauren'],
  'Emily Henry': ['Abby Jimenez', 'Ashley Poston', 'Carley Fortune', 'Christina Lauren', 'Annabel Monaghan', 'Tessa Bailey'],
  'Julia Quinn': ['Lisa Kleypas', 'Tessa Dare', 'Sarah MacLean', 'Evie Dunmore'],
  'Chloe Walsh': ['Elle Kennedy', 'Mariana Zapata', 'L.J. Shen', 'Penelope Douglas'],
  'S.T. Abby': ['Penelope Douglas', 'L.J. Shen', 'Rina Kent'],
  'Ilsa Madden-Mills': ['Elle Kennedy', 'Lucy Score', 'Mariana Zapata']
};

function similarKey(name) { return (name || '').toLowerCase().replace(/[^a-z]/g, ''); }
const SIMILAR_INDEX = Object.fromEntries(Object.entries(SIMILAR_AUTHORS).map(([k, v]) => [similarKey(k), v]));
