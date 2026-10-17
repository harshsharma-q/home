# Harsh Sharma — Academic Website

A small academic website with a downloadable CV, published with GitHub Pages at
https://harsh-sharma.in/. It is plain HTML, CSS and JavaScript
with no build step for the site.

## Pages

| Page | Contents |
| --- | --- |
| `index.html` | About (bio, availability, links), research interests (`#research`), ongoing projects (`#projects`), contact footer (`#contact`) |
| `publications.html` | Journal articles and preprints, with arXiv, PDF, DOI and BibTeX links |
| `talks.html` | Talks and posters; schools and workshops attended |
| `teaching.html` | Teaching assistantships, grouped by institution |
| `cv.html` | Education, fellowships and awards, research visits, national examinations (when listed), and **Download CV (PDF)** |

Every page has the same header and footer. They are defined once, in
`assets/site.js` (the `NAV` list), and the current page is highlighted.
`assets/site-data.js` loads and merges the content; the pages and the CV build
both use it, so they always show the same data.

## Editing content: Google Sheets

All content comes from a Google Sheet, so ordinary edits need no GitHub commit.
Each tab is used only if its first row contains the columns listed below,
spelled exactly as shown. Extra columns are allowed. A tab that is missing,
renamed or has other column names is ignored, and the bundled copy in
`assets/content.js` is used instead.

| Tab | First-row columns | Used for |
| --- | --- | --- |
| `Profile` | `field`, `value` | One row per field: `name`, `title`, `bio`, `availability`, `email`, `address`, `photo`, `cv`, `scholar`, `arxiv`, `orcid`, `linkedin`, `github`. Blank values are hidden. Each line of `bio` is a paragraph. `cv` may link to a PDF that replaces the built CV. |
| `Publications` | `arxiv`, `title`, `authors`, `journal`, `doi`, `summary` | Adds journal references and papers that are not in the arXiv feed. Write IDs as `arXiv:2408.11628`. The `summary` column is kept but not shown, because the research interests describe the work. |
| `Talks` | `year`, `type`, `title`, `event`, `venue` (optional: `eventUrl`, `eventLabel`, `videoUrl`) | Rows with a title are talks or posters; rows without one are schools and workshops attended. |
| `Education` | `period`, `degree`, `institution` (optional: `detail`) | CV page and CV. |
| `Awards` | `year`, `title`, `organization` (optional: `detail`) | "Fellowships and awards" on the CV page and in the CV. |
| `Qualifications` | `year`, `title`, `organization` | "National examinations" on the CV page. Keep only the first row to hide the section. |
| `Research` *(optional)* | `title`, `text`, `papers` (optional: `group`) | Research interests on the home page. `papers` lists arXiv IDs or DOIs; each is shown as a link to that paper. Consecutive rows with the same `group` (for example `Main interests`) appear under that heading. A row without a title is an introductory paragraph. |
| `Projects` *(optional)* | `title`, `text`, `papers` | Ongoing projects on the home page, in row order; the section is hidden when there are none. Published papers and preprints are listed on the Publications page only. `papers` lists the published work a project builds on (arXiv IDs or DOIs), shown as "Builds on: …". |
| `Teaching` *(optional)* | `period`, `role`, `course`, `institution`, `hours`, `level`, `notes` (optional: `topics`) | "Teaching assistantships" on the Teaching page and in the CV, grouped by institution in row order. A note that every row of an institution shares (for example "As part of the Prime Minister's Research Fellowship") is shown once under the institution. `topics` says what you taught or ran (for example a lab experiment) and is shown as "Topics: …". |
| `Visits` *(optional)* | `period`, `institution`, `host`, `detail` | Research visits on the CV page and in the CV. |
| `CVOptions` *(optional)* | `section`, `include`, `scope` | CV sections and page limit (see below). |

Rows with the word `PLACEHOLDER` in any cell are waiting for real data: the
pages and the CV leave them out (a section with nothing left shows "To be
added." on the Teaching page).

Do not rename tabs or change the first row of a tab. Links can be written in any
text as `[label](https://…)`. Everything in the Sheet is public.

### Connecting a Sheet

1. To add an optional tab, create a tab with exactly the name above and type the
   column names into its first row.
2. The Sheet must be shared as **Anyone with the link — Viewer**.
3. `assets/sheet-config.js` holds the Sheet ID, the tabs and `enabled: true`.
   Set `enabled: false` to use only `assets/content.js`.

Each page reads only the tabs it needs. It waits up to 2.5 seconds for the
Sheet, then shows the bundled copy and switches to the Sheet when it arrives.
Keep `assets/content.js` roughly in step with the Sheet; it must stay valid
JSON, which the deploy workflow checks.

## Publications from arXiv

`.github/workflows/pages.yml` refreshes `assets/publications.js` weekly from the
arXiv author feed (`sharma_h_2`), so new preprints appear automatically. Rows in
the Publications tab are matched by arXiv ID and override or add fields. Papers with a journal reference are listed as journal articles; the
rest as preprints.

The J. Phys. A paper (arXiv:2302.07003) is not in the author feed, because it was
submitted from a co-author's account and has not been claimed. Its row in the
Sheet and in `assets/content.js` is its only source, so keep that row complete.

## Downloadable CV

`scripts/build_cv.mjs` builds `assets/cv.pdf` (A4, site fonts, no text smaller
than 10 pt) from the same data as the website: the Sheet, falling back to
`assets/content.js` for any tab the Sheet does not have, plus
`assets/publications.js`. It prints a print-only template (`scripts/cv/cv.css`)
with headless Chrome. It uses only Node built-ins and the Chrome that GitHub's
Ubuntu runner already provides, so it adds no dependencies.

The deploy workflow builds the CV on every push to `main`, on the weekly
schedule (after the arXiv refresh) and on manual runs. The PDF is deployed with
the site but not committed (`assets/cv.pdf` is in `.gitignore`). The build step
has `continue-on-error: true`: if it fails, the site still deploys and the CV
links stay hidden until the next successful build.

The site shows the **Download CV (PDF)** links on the CV page and the home page
by itself once `assets/cv.pdf` is deployed. Leave `cv` in the Profile tab
empty, unless you want those links to open a different PDF instead.

### Choosing sections

`cvOptions` in `assets/content.js` lists the sections in print order, each with
`include` and `scope`, plus `pageLimit` and `dropOrder`. The optional
`CVOptions` tab (first row `section | include | scope`) overrides `include` and
`scope` by section name. A blank cell keeps the value from `content.js`, and
the order always follows `content.js`.

| `section` | `scope` values |
| --- | --- |
| `contact` | — (title, department address, email, website, ORCID, Google Scholar, arXiv, GitHub if set; never LinkedIn). If excluded, only the name and title are printed. |
| `research interests` | `titles` (one line per group, default) or `full` (titles with their text) |
| `education` | — |
| `publications` | `all` (default), `journal`, `preprints`, or a list of arXiv IDs or DOIs |
| `fellowships and awards` | — |
| `talks` | `all` (default), `talks` (leave out posters), `since:YYYY`; combine with spaces |
| `research visits` | — |
| `teaching` | — (all rows, grouped by institution, under "Teaching assistantships") |
| `schools attended` | `all` (default), `since:YYYY` |
| `referees` | — (prints "Available on request.") |

`include` accepts `yes`/`no` (also `true`/`false`, `1`/`0`). Rows marked
`PLACEHOLDER` in any cell are never printed, and a section with nothing to
print is left out. A long link pasted into a cell wraps inside its column.

### Page limit

The CV is limited to `pageLimit` pages (default 2). If it is longer, the build
drops optional sections in `dropOrder` until it fits; it never shrinks text.
The default order is: schools attended, teaching, research visits, posters
(posters are removed from the talks), talks, research interests. Contact,
education, publications, fellowships and awards, and referees are never
dropped. If the CV is still too long after the whole drop order, the PDF is
written anyway and the workflow run shows the warning
`CV is N pages (limit L)`.

To allow a longer CV, add this row to the `CVOptions` tab:

| section | include | scope |
| --- | --- | --- |
| `page limit` | `no` | |

or set `pageLimit` to `0` in `content.js` (no limit). A row
`page limit | yes | 3` allows up to 3 pages. A `page limit` row without a page
count is ignored, with a warning. Format the `scope` column of the CVOptions
tab as plain text (**Format → Number → Plain text**): Google sends each column
with a single type, so a number in a text column can arrive empty.

The site reads the Sheet on every page load, but the PDF is rebuilt only when
the workflow runs. To apply a CVOptions or other CV change straight away, open
**Actions → Deploy portfolio to GitHub Pages → Run workflow** on GitHub.

### Local and private builds

```bash
node scripts/build_cv.mjs                       # assets/cv.pdf (Sheet, else content.js)
node scripts/build_cv.mjs --no-sheet            # assets/cv.pdf from content.js only
node scripts/build_cv.mjs --sections contact,education,publications --out private/cv-short.pdf
node scripts/build_cv.mjs --scope "publications=journal; talks=talks since:2024" --out private/cv-journal.pdf
node scripts/build_cv.mjs --max-pages 3 --out private/cv-3pages.pdf
node scripts/build_cv.mjs --no-page-limit --html private/cv.html --out private/cv-long.pdf
```

Without `--out`, a build overwrites `assets/cv.pdf`, so give every custom CV an
`--out` path in `private/`, which Git ignores and which is never deployed.
`--chrome <path>` (or `CHROME_PATH`) selects the browser. Run
`node scripts/build_cv.mjs --help` for all options. These options replace the
earlier local `private/cv-builder.html`.

At the end, the script prints a summary:

- the source of each tab
- the sections printed, with scope and item count
- the sections left out as empty or dropped for length
- the page count and size
- whether Inter and Source Serif 4 are embedded
- whether Chrome had to scale a page down (that would put text below 10 pt, and is reported as a warning)
- the output file

Warnings do not fail the build. It exits with 0 whenever a PDF is written, 1
when no browser is found or Chrome fails or writes no PDF, and 2 for an
invalid option. If Chrome hangs inside a sandboxed environment, set `CI=1` to
run it with `--no-sandbox` (GitHub's runner sets `CI` already).

## Old page addresses

| Old address | Now |
| --- | --- |
| `research.html` | `index.html#research` |
| `activities.html` | `talks.html` |
| `background.html` | `cv.html` |
| `contact.html` | `index.html#contact` |

`publications.html` is a page again. The redirect pages keep old links working.

## Checks

```bash
node scripts/validate_site.mjs
python3 scripts/update_arxiv.py
```

`validate_site.mjs` checks every page, the navigation, local links, the JSON in
`assets/content.js` (including `cvOptions`), the Sheet tab columns, the
redirects and `sitemap.xml`. The deploy workflow runs it on every deploy.

## Local website preview

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/`.
