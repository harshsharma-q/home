/*
  SHARED CONTENT LOADING

  Used by every page (through assets/site.js) and by the CV build
  (scripts/build_cv.mjs, which runs this file in Node). It reads the Google
  Sheet configured in assets/sheet-config.js, falls back to the bundled copy in
  assets/content.js, and merges publications with the weekly arXiv feed in
  assets/publications.js. It uses no browser-only APIs.
*/
(root => {
  // ---------- text helpers ----------
  const clean = value => String(value ?? "").trim();
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  // Escapes text and turns [label](https://…) into links.
  const rich = value => esc(value).replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g, (_, label, url) => `<a href="${url}"${url.startsWith("http") ? ' target="_blank" rel="noreferrer"' : ""}>${label}</a>`);
  // Drops [label](url) markup, keeping the label (for plain-text uses).
  const plain = value => clean(value).replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^)\s]+\)/g, "$1");
  const hasContent = row => Object.values(row || {}).some(value => clean(value));
  // Rows marked PLACEHOLDER in any cell are waiting for real data: pages show a note instead, and the CV skips them.
  const isPlaceholder = row => Object.values(row || {}).some(value => /\bPLACEHOLDER\b/i.test(String(value ?? "")));
  const arxivId = value => clean(value).replace(/^https?:\/\/arxiv\.org\/(?:abs|pdf)\//i, "").replace(/^arxiv:\s*/i, "").replace(/\.pdf$/i, "").replace(/v\d+$/, "");
  const doiOf = value => clean(value).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
  const yesNo = value => {
    const text = clean(value).toLowerCase();
    if (/^(yes|y|true|1|include|on)$/.test(text)) return true;
    if (/^(no|n|false|0|exclude|off)$/.test(text)) return false;
    return null;
  };

  // ---------- Google Sheet ----------
  const parseCsv = text => {
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { row.push(cell); cell = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[index + 1] === "\n") index += 1;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += char;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const headers = (rows.shift() || []).map(header => header.trim());
    return { headers, rows: rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))).filter(hasContent) };
  };

  // Unknown tab names make Google return the first tab, so each tab is accepted only if its headers match.
  const fetchTab = async (config, { name, columns }, { fetchImpl, warn }) => {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(config.spreadsheetId)}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(name)}`;
      const response = await fetchImpl(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { headers, rows } = parseCsv(await response.text());
      if (!columns.every(column => headers.includes(column))) throw new Error(`unexpected columns: ${headers.join(", ")}`);
      return rows;
    } catch (error) {
      warn(`Sheet tab "${name}" was not used (${error.message}); using the bundled copy.`);
      return null;
    }
  };

  // Reads the tabs listed in `keys` (all configured tabs if omitted). Returns the merged
  // content and, for each tab, whether it came from the Sheet or the bundled copy.
  const loadSheet = async ({ config, bundled, keys, fetchImpl = (...args) => root.fetch(...args), warn = message => console.warn(message) }) => {
    const tabs = Object.entries(config.tabs || {}).filter(([key]) => !keys || keys.includes(key));
    const entries = await Promise.all(tabs.map(async ([key, tab]) => [key, await fetchTab(config, tab, { fetchImpl, warn })]));
    const data = JSON.parse(JSON.stringify(bundled));
    const sources = {};
    entries.forEach(([key, rows]) => {
      sources[key] = rows ? "sheet" : "bundled";
      if (!rows) return;
      if (key === "profile") data.profile = Object.fromEntries(rows.filter(row => clean(row.field)).map(row => [clean(row.field), clean(row.value)]));
      // CVOptions rows adjust the bundled cvOptions instead of replacing them.
      else if (key === "cvOptions") data.cvOptionsSheet = rows;
      else data[key] = rows;
    });
    return { data, sources };
  };

  // ---------- publications ----------
  // The year of a journal reference is "(2026)" or a standalone four-digit year, never part of
  // an article number such as 020321; without one, the year comes from the arXiv ID.
  const yearOf = item => {
    const journal = clean(item.journal);
    const journalYear = (journal.match(/\((?:19|20)\d{2}\)/g) || journal.match(/(?<!\d)(?:19|20)\d{2}(?!\d)/g) || []).at(-1);
    if (journalYear) return Number(journalYear.replace(/\D/g, ""));
    const fromId = arxivId(item.arxiv || item.id).match(/^(\d{2})(\d{2})\./);
    return fromId ? 2000 + Number(fromId[1]) : Number(item.year) || 0;
  };
  const splitAuthors = authors => clean(authors).split(/\s*[·,]\s*/).filter(Boolean);
  const isJournal = item => Boolean(clean(item.journal));
  // Journal reference without its "(2026)".
  const journalName = item => clean(item.journal).replace(/\s*\((?:19|20)\d{2}\)/g, "");
  // Short citation used for links: "Phys. Rev. A 114, 032414 (2026)" or "arXiv:2512.15607".
  const shortRef = item => isJournal(item) ? `${journalName(item)} (${item.year})` : item.id ? `arXiv:${item.id}` : clean(item.title);

  // The weekly arXiv feed (assets/publications.js) adds new papers; Sheet rows add summaries and override fields.
  const mergePublications = (feed, rows) => {
    const byKey = new Map();
    (feed || []).forEach(item => byKey.set(arxivId(item.id), { ...item, arxiv: item.id }));
    (rows || []).forEach(row => {
      const key = arxivId(row.arxiv) || clean(row.doi) || clean(row.title);
      const overrides = Object.fromEntries(Object.entries(row).filter(([, value]) => clean(value)).map(([field, value]) => [field, clean(value)]));
      byKey.set(key, { ...(byKey.get(key) || {}), ...overrides });
    });
    return [...byKey.values()]
      .map(item => ({ ...item, id: arxivId(item.arxiv || item.id), doi: doiOf(item.doi), year: yearOf(item) }))
      .sort((a, b) => b.year - a.year || b.id.localeCompare(a.id));
  };

  // Finds a paper by arXiv ID or DOI.
  const findPaper = (papers, reference) => {
    const id = arxivId(reference), doi = doiOf(reference).toLowerCase();
    return papers.find(item => (id && item.id === id) || (doi && item.doi && item.doi.toLowerCase() === doi)) || null;
  };
  // "arXiv:2408.11628, 10.22331/q-2025-05-22-1754" -> matching papers, in the order given.
  const paperRefs = (papers, references) => clean(references).replace(/arxiv:\s+/gi, "arXiv:").split(/[\s,;]+/).filter(Boolean)
    .map(reference => findPaper(papers, reference)).filter(Boolean);

  const bibtex = item => {
    const authors = splitAuthors(item.authors);
    const surname = (authors[0] || "Author").split(/\s+/).map(part => part.replace(/[^A-Za-z]/g, "")).filter(part => part.length > 1).at(-1) || "Author";
    const firstWord = clean(item.title).replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).find(word => word.length > 3) || "paper";
    const fields = [`  title={${item.title}}`, `  author={${authors.join(" and ")}}`];
    if (item.journal) fields.push(`  journal={${journalName(item)}}`);
    fields.push(`  year={${item.year}}`);
    if (item.doi) fields.push(`  doi={${item.doi}}`);
    if (item.id) fields.push(`  eprint={${item.id}}`, "  archivePrefix={arXiv}");
    return `@${item.journal ? "article" : "misc"}{${surname}${item.year}${firstWord},\n${fields.join(",\n")}\n}`;
  };

  // ---------- research, projects, talks, teaching ----------
  // Research rows with a group (for example "Main" or "Also") are shown under that heading;
  // a row without a title is an introductory paragraph.
  const groupResearch = rows => {
    const groups = [];
    (rows || []).filter(hasContent).forEach(row => {
      const label = clean(row.group);
      const last = groups.at(-1);
      if (last && last.label === label) last.items.push(row);
      else groups.push({ label, items: [row] });
    });
    return groups;
  };

  const isPoster = item => /poster/i.test(clean(item.type));
  // Rows with a title are talks or posters; the same title given at several events is listed once.
  const groupTalks = talks => {
    const groups = new Map();
    (talks || []).filter(item => clean(item.title)).forEach(item => {
      const key = clean(item.title).toLowerCase().replace(/\s+/g, " ");
      if (!groups.has(key)) groups.set(key, { title: clean(item.title), items: [] });
      groups.get(key).items.push(item);
    });
    return [...groups.values()]
      .map(group => ({ ...group, items: [...group.items].sort((a, b) => Number(b.year) - Number(a.year)) }))
      .sort((a, b) => Number(b.items[0].year) - Number(a.items[0].year));
  };
  const attendedEvents = talks => (talks || []).filter(item => hasContent(item) && !clean(item.title));


  // Teaching rows grouped by institution, in the order the institutions first appear. A note that
  // every row of an institution shares (such as "As part of …") belongs to the group, not the rows.
  const teachingByInstitution = rows => {
    const groups = [];
    (rows || []).filter(hasContent).forEach(row => {
      const institution = clean(row.institution);
      let group = groups.find(item => item.institution === institution);
      if (!group) groups.push(group = { institution, rows: [] });
      group.rows.push(row);
    });
    return groups.map(group => {
      const notes = [...new Set(group.rows.map(row => clean(row.notes)))];
      const note = notes.length === 1 ? notes[0] : "";
      return { ...group, note, rows: note ? group.rows.map(row => ({ ...row, notes: "" })) : group.rows };
    });
  };

  // ---------- CV options ----------
  const CV_SECTIONS = ["contact", "research interests", "education", "publications", "fellowships and awards", "talks", "research visits", "teaching", "schools attended", "referees"];
  const sectionName = value => clean(value).toLowerCase().replace(/\s+/g, " ");

  // Combines cvOptions from content.js with optional CVOptions Sheet rows [section, include, scope].
  // The special row "page limit" sets the maximum number of pages: include = no (or 0 pages)
  // removes the limit; the number may be in either column.
  const cvSettings = (cvOptions = {}, sheetRows = null) => {
    const warnings = [];
    const sections = (cvOptions.sections || []).map(item => ({
      section: sectionName(item.section),
      include: typeof item.include === "boolean" ? item.include : yesNo(item.include) ?? true,
      scope: clean(item.scope),
    }));
    let pageLimit = Number(cvOptions.pageLimit) || 0;
    (sheetRows || []).forEach(row => {
      const name = sectionName(row.section);
      const include = yesNo(row.include);
      if (!name) return;
      if (name === "page limit") {
        const count = clean(row.scope) || (include === null ? clean(row.include) : "");
        const pages = /^\d+$/.test(count) ? Number(count) : NaN;
        if (include === false || pages === 0) pageLimit = 0;
        else if (pages > 0) pageLimit = pages;
        else if (count) warnings.push(`CVOptions: page limit "${count}" is not a whole number and was ignored`);
        else warnings.push(`CVOptions: the page limit row gives no page count (if you typed one, format the scope column as plain text); keeping ${pageLimit || "no limit"}`);
        return;
      }
      const target = sections.find(item => item.section === name);
      if (!target) { warnings.push(`CVOptions: unknown section "${clean(row.section)}" ignored`); return; }
      if (include !== null) target.include = include;
      if (clean(row.scope)) target.scope = clean(row.scope);
    });
    return { sections, pageLimit, dropOrder: (cvOptions.dropOrder || []).map(sectionName), warnings };
  };

  root.SiteData = {
    clean, esc, rich, plain, hasContent, isPlaceholder, arxivId, doiOf, yesNo,
    parseCsv, loadSheet,
    yearOf, splitAuthors, isJournal, journalName, shortRef, mergePublications, findPaper, paperRefs, bibtex,
    groupResearch, isPoster, groupTalks, attendedEvents, teachingByInstitution,
    CV_SECTIONS, cvSettings,
  };
})(typeof window !== "undefined" ? window : globalThis);
