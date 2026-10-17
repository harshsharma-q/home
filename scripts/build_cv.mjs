/*
  CV BUILD

  Builds a PDF curriculum vitae from the same data as the website: the Google
  Sheet (tabs missing from the Sheet fall back to assets/content.js) and the
  weekly arXiv feed in assets/publications.js. The page is printed with
  headless Chrome; nothing else needs to be installed. The deploy workflow
  runs this script and publishes the result as assets/cv.pdf.

  Usage: node scripts/build_cv.mjs [options]

    --out <file>       output PDF (default assets/cv.pdf). Keep custom local
                       CVs in private/, which Git ignores:
                       --out private/cv-short.pdf
    --html <file>      also save the generated HTML, to preview in a browser
    --no-sheet         use assets/content.js only
    --sections a,b,c   print only these sections (names as in cvOptions; the
                       order stays as in content.js)
    --scope "publications=journal; talks=talks since:2024"
                       override section scopes
    --max-pages N      allow up to N pages
    --no-page-limit    print every included section, however long
    --chrome <path>    Chrome, Chromium or Edge binary (default: CHROME_PATH,
                       then the usual install locations)
    --help             show this text

  The page limit is cvOptions.pageLimit in content.js (2). A "page limit" row
  in the Sheet's CVOptions tab overrides it: include = no removes the limit,
  scope = 3 allows three pages. --max-pages and --no-page-limit override both.

  Sections and their scopes (cvOptions in content.js, CVOptions tab):
    contact                 name, title, address, email, website, profiles
    research interests      titles (one line per group) | full
    education
    publications            all | journal | preprints | arXiv IDs or DOIs
    fellowships and awards
    talks                   all | talks (no posters), and optionally since:YYYY
    research visits
    teaching                all | courses | assistantships
    schools attended        all, and optionally since:YYYY
    referees

  While the PDF is longer than the limit, the next section in
  cvOptions.dropOrder that is still printed is left out ("posters" removes
  only the posters from talks). Rows marked PLACEHOLDER are never printed.
  Set CI=1 to run Chrome with --no-sandbox.

  Exit status: 0 when the PDF is written (also with warnings, such as a CV
  still over its limit), 1 when there is no browser, Chrome fails or writes
  no PDF, 2 for an invalid option.
*/
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";
import vm from "node:vm";
import { inflateSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_FILES = ["assets/content.js", "assets/sheet-config.js", "assets/publications.js", "assets/site-data.js"];
const CV_TABS = ["profile", "publications", "talks", "education", "awards", "research", "teaching", "visits", "cvOptions"];
const WEBSITE = "https://harshsharma-q.github.io/portfolio/";
const FONTS = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap";
const SHEET_TIMEOUT_MS = 20000;
const FONT_BUDGET_MS = 15000;
const CHROME_TIMEOUT_MS = 90000;

const log = message => console.log(message);
const warnings = [];
const warn = message => { warnings.push(message); console.warn(`  warning: ${message}`); };
const annotate = message => { if (process.env.GITHUB_ACTIONS) console.log(`::warning::${message}`); };
class BuildError extends Error {}

const sectionName = value => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const capitalise = text => text.charAt(0).toUpperCase() + text.slice(1);
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

// ---------- command line ----------
let args;
try {
  ({ values: args } = parseArgs({
    options: {
      out: { type: "string" },
      html: { type: "string" },
      "no-sheet": { type: "boolean" },
      sections: { type: "string" },
      scope: { type: "string" },
      "max-pages": { type: "string" },
      "no-page-limit": { type: "boolean" },
      chrome: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  }));
} catch (error) {
  console.error(`${error.message}\nRun "node scripts/build_cv.mjs --help" for the options.`);
  process.exit(2);
}
if (args.help) {
  // The help text is the comment at the top of this file.
  const source = await readFile(fileURLToPath(import.meta.url), "utf8");
  console.log(source.match(/\/\*([\s\S]*?)\*\//)[1].replace(/^ {2}/gm, "").trim());
  process.exit(0);
}
const maxPages = args["max-pages"] === undefined ? null : Number(args["max-pages"]);
if (maxPages !== null && !(Number.isInteger(maxPages) && maxPages > 0)) {
  console.error(`--max-pages needs a whole number of pages, not "${args["max-pages"]}".`);
  process.exit(2);
}

// ---------- data ----------
// The data files assign window.X, so they run in a context whose global is also "window".
const loadData = async () => {
  const context = vm.createContext({ console, fetch, URL, setTimeout, clearTimeout, AbortController, AbortSignal });
  context.window = context;
  for (const file of DATA_FILES) vm.runInContext(await readFile(path.join(root, file), "utf8"), context, { filename: file });
  const { SITE_CONTENT: bundled, SHEET_CONFIG: config, PUBLICATIONS: feed, SiteData: S } = context;
  if (args["no-sheet"] || !config?.enabled) {
    log(`Data: assets/content.js only (${args["no-sheet"] ? "--no-sheet" : "the Sheet is disabled in sheet-config.js"})`);
    return { S, feed, data: bundled, sources: Object.fromEntries(CV_TABS.map(key => [key, "bundled"])) };
  }
  log("Data: Google Sheet, with assets/content.js for tabs it cannot provide");
  const fetchImpl = (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(SHEET_TIMEOUT_MS) });
  const { data, sources } = await S.loadSheet({ config, bundled, keys: CV_TABS, fetchImpl, warn: message => log(`  ${message}`) });
  return { S, feed, data, sources };
};

const describeSources = sources => {
  const from = kind => Object.keys(sources).filter(key => sources[key] === kind);
  return [["Sheet", from("sheet")], ["content.js", from("bundled")]].filter(([, keys]) => keys.length).map(([label, keys]) => `${label}: ${keys.join(", ")}`).join("; ");
};

// Applies --sections, --scope, --max-pages and --no-page-limit, and says where the page limit came from.
const applyOptions = (settings, data, S) => {
  const find = name => settings.sections.find(item => item.section === name);
  if (args.sections) {
    const names = args.sections.split(",").map(sectionName).filter(Boolean);
    names.filter(name => !find(name)).forEach(name => warn(`--sections: unknown section "${name}"`));
    settings.sections.forEach(item => { item.include = names.includes(item.section); });
  }
  (args.scope || "").split(";").map(part => part.trim()).filter(Boolean).forEach(part => {
    const [name, ...scope] = part.split("=");
    const target = find(sectionName(name));
    if (target && scope.length) target.scope = scope.join("=").trim();
    else warn(`--scope: ignored "${part}" (write section=scope, e.g. publications=journal)`);
  });
  if (args["no-page-limit"]) settings.pageLimit = 0;
  else if (maxPages) settings.pageLimit = maxPages;
  if (args["no-page-limit"] || maxPages) return "command line";
  // cvSettings ignores a "page limit" row without a page count, so a row counts only if it
  // changes the limit from at least one of two different starting values.
  const setsLimit = row => sectionName(row.section) === "page limit" && [1, 2].some(start => S.cvSettings({ pageLimit: start }, [row]).pageLimit !== start);
  return (data.cvOptionsSheet || []).some(setsLimit) ? "CVOptions tab" : "cvOptions in content.js";
};

// Scopes each section understands. Anything else is reported once, and the section prints as by default.
const SCOPES = {
  "research interests": /^(?:titles|full)?$/i,
  talks: /^(?:(?:all|talks|since:\d{4})(?:\s+|$))*$/i,
  teaching: /^(?:all|courses|assistantships)?$/i,
  "schools attended": /^(?:(?:all|since:\d{4})(?:\s+|$))*$/i,
};

// ---------- sections ----------
// Each section returns its blocks (HTML that stays on one page) and the number of items printed.
const makeSections = ({ S, data, papers, selfName }) => {
  const { clean, esc, rich, plain } = S;
  const usable = rows => (rows || []).filter(row => S.hasContent(row) && !S.isPlaceholder(row));
  const since = scope => Number(clean(scope).match(/since:\s*(\d{4})/i)?.[1]) || 0;
  const link = (url, label) => `<a href="${esc(url)}">${esc(label)}</a>`;
  const strong = text => clean(text) ? `<strong>${esc(text)}</strong>` : "";
  const joined = (...parts) => parts.filter(Boolean).join(", ");
  const detail = html => html ? `<div class="detail">${html}</div>` : "";
  const entry = (date, body) => `<div class="entry"><div class="date">${esc(date)}</div><div class="body">${body}</div></div>`;
  // The heading and the first block go into one unbreakable block, so a heading never ends a page.
  const subsection = (heading, blocks) => blocks.length ? [`<div class="keep"><h3>${esc(heading)}</h3>${blocks[0]}</div>`, ...blocks.slice(1)] : [];
  // "Loss-tolerant quantum sensing" reads "loss-tolerant …" mid-sentence; "NV centers" keeps its capitals.
  const midSentence = text => /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;

  const selectPapers = scope => {
    const kind = clean(scope).toLowerCase();
    if (!kind || kind === "all") return papers;
    if (kind === "journal") return papers.filter(S.isJournal);
    if (kind === "preprints") return papers.filter(item => !S.isJournal(item));
    return S.paperRefs(papers, scope);
  };
  const paper = item => {
    const isSelf = name => name.toLowerCase().replace(/\s+/g, " ") === selfName;
    const authors = S.splitAuthors(item.authors).map(name => isSelf(name) ? `<strong>${esc(name)}</strong>` : esc(name)).join(", ");
    const arxiv = item.id ? link(`https://arxiv.org/abs/${item.id}`, `arXiv:${item.id}`) : "";
    const doi = item.doi ? link(`https://doi.org/${item.doi}`, `doi:${item.doi}`) : "";
    const year = item.year ? esc(item.year) : "";
    const dated = reference => reference ? `${reference}${year ? ` (${year})` : ""}` : year;
    // "Phys. Rev. A 114, 032414 (2026) · doi · arXiv"; a preprint: "arXiv:ID (2025) · doi", "doi (2025)" or the year alone.
    const venue = (S.isJournal(item) ? [dated(esc(S.journalName(item))), doi, arxiv] : [dated(arxiv || doi), arxiv && doi]).filter(Boolean).join(" · ");
    return `<div>${authors}</div><div class="pub-title">${esc(item.title)}</div>${venue ? `<div class="pub-venue">${venue}</div>` : ""}`;
  };

  const teachingEntry = row => {
    const hours = /^\d+(?:\.\d+)?$/.test(clean(row.hours)) ? `${clean(row.hours)} hours` : clean(row.hours);
    const role = [row.role, row.level, hours].map(clean).filter(Boolean).map(esc).join(", ");
    return entry(row.period, joined(strong(row.course), esc(row.institution)) + detail(role) + detail(rich(row.notes)));
  };

  return {
    "research interests": scope => {
      // Rows without a title introduce the website's research section in the first person; the CV leaves them out.
      const groups = S.groupResearch(usable(data.research).filter(row => clean(row.title)));
      const count = groups.reduce((sum, group) => sum + group.items.length, 0);
      if (clean(scope).toLowerCase() === "full") {
        const blocks = groups.flatMap(group => {
          const items = group.items.map(row => `<p class="interest"><strong>${esc(plain(row.title))}.</strong> ${rich(row.text)}</p>`);
          return group.label ? subsection(group.label, items) : items;
        });
        return { count, blocks };
      }
      return {
        count,
        blocks: groups.map(group => {
          const titles = group.items.map((row, index) => esc(index ? midSentence(plain(row.title)) : plain(row.title))).join("; ");
          return `<p class="interest">${group.label ? `<span class="label">${esc(group.label)}:</span> ` : ""}${titles.replace(/\.?$/, ".")}</p>`;
        }),
      };
    },

    education: () => {
      const rows = usable(data.education);
      return { count: rows.length, blocks: rows.map(row => entry(row.period, joined(strong(row.degree), esc(row.institution)) + detail(rich(row.detail)))) };
    },

    publications: scope => {
      const selected = selectPapers(scope);
      const numbered = list => list.map((item, index) => entry(`${index + 1}.`, paper(item)));
      return {
        count: selected.length,
        blocks: [
          ...subsection("Journal articles", numbered(selected.filter(S.isJournal))),
          ...subsection("Preprints", numbered(selected.filter(item => !S.isJournal(item)))),
        ],
      };
    },

    "fellowships and awards": () => {
      const rows = usable(data.awards);
      return { count: rows.length, blocks: rows.map(row => entry(row.year, joined(strong(row.title), esc(row.organization)) + detail(rich(row.detail)))) };
    },

    talks: (scope, state) => {
      const noPosters = state.noPosters || /(?:^|\s)talks(?:\s|$)/i.test(clean(scope));
      const rows = usable(data.talks).filter(item => !(noPosters && S.isPoster(item)) && Number(item.year || 0) >= since(scope));
      const groups = S.groupTalks(rows);
      const events = groups.flatMap(group => group.items);
      const posters = events.filter(S.isPoster).length;
      return {
        count: events.length,
        posters,
        heading: posters ? "Talks and posters" : "Talks",
        blocks: groups.map(group => `<div class="talk"><div class="talk-title">${esc(group.title)}</div>${group.items.map(item =>
          entry(item.year, [esc(item.type), joined(esc(item.event), esc(item.venue))].filter(Boolean).join(" · "))).join("")}</div>`),
      };
    },

    "research visits": () => {
      const rows = usable(data.visits);
      return { count: rows.length, blocks: rows.map(row => entry(row.period, `${strong(row.institution)}${clean(row.host) ? ` (host: ${esc(row.host)})` : ""}${detail(rich(row.detail))}`)) };
    },

    teaching: scope => {
      const kind = clean(scope).toLowerCase();
      const groups = S.groupTeaching(usable(data.teaching));
      const courses = kind === "assistantships" ? [] : groups.courses;
      const assistantships = kind === "courses" ? [] : groups.assistantships;
      return {
        count: courses.length + assistantships.length,
        blocks: [...subsection("Courses taught", courses.map(teachingEntry)), ...subsection("Teaching assistantships", assistantships.map(teachingEntry))],
      };
    },

    "schools attended": scope => {
      const rows = S.attendedEvents(usable(data.talks)).filter(item => Number(item.year || 0) >= since(scope));
      return { count: rows.length, heading: "Schools and workshops attended", blocks: rows.map(item => entry(item.year, joined(esc(item.event), esc(item.venue)))) };
    },

    referees: () => ({ count: 1, blocks: ['<p class="interest">Available on request.</p>'] }),

    // Contact details sit in the page header, not in a section of their own.
    contact: () => {
      const profile = data.profile || {};
      const orcid = clean(profile.orcid).match(/\d{4}-\d{4}-\d{4}-\d{3}[\dX]/)?.[0];
      const lines = [
        clean(profile.email) && link(`mailto:${clean(profile.email)}`, clean(profile.email)),
        link(WEBSITE, WEBSITE.replace(/^https:\/\//, "").replace(/\/$/, "")),
        clean(profile.orcid) && link(clean(profile.orcid), orcid ? `ORCID ${orcid}` : "ORCID"),
        [[profile.scholar, "Google Scholar"], [profile.arxiv, "arXiv"], [profile.github, "GitHub"]]
          .filter(([url]) => clean(url)).map(([url, label]) => link(clean(url), label)).join(" · "),
      ].filter(Boolean);
      return { count: lines.length + (clean(profile.address) ? 1 : 0), lines, address: clean(profile.address) };
    },
  };
};

const renderCv = ({ S, profile, settings, sections, state, css, fontCss, footer }) => {
  const { esc, clean } = S;
  const printed = [], omitted = [];
  let posters = 0;
  const active = settings.sections.filter(item => item.include && !state.dropped.has(item.section) && sections[item.section]);

  const contact = active.some(item => item.section === "contact") ? sections.contact() : null;
  if (contact) printed.push({ section: "contact", scope: "", count: contact.count });
  const header = `<header class="cv-header"><div>
    <h1>${esc(profile.name)}</h1>
    ${clean(profile.title) ? `<p class="role">${esc(profile.title)}</p>` : ""}
    ${contact?.address ? `<p class="address">${esc(contact.address)}</p>` : ""}
  </div>${contact?.lines.length ? `<ul class="contact">${contact.lines.map(line => `<li>${line}</li>`).join("")}</ul>` : ""}</header>`;

  const body = active.filter(item => item.section !== "contact").map(item => {
    const result = sections[item.section](item.scope, state);
    if (!result.blocks.length) { omitted.push(item.section); return ""; }
    printed.push({ section: item.section, scope: item.scope, count: result.count });
    posters += result.posters || 0;
    const [first, ...rest] = result.blocks;
    return `<section><div class="keep"><h2>${esc(result.heading || capitalise(item.section))}</h2>${first}</div>${rest.join("")}</section>`;
  }).join("\n");

  const quote = text => `"${text.replace(/[\\"]/g, "\\$&")}"`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(footer.title)}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fontCss ? `<style>
${fontCss}</style>` : `<link rel="stylesheet" href="${FONTS}">`}
<style>
${css}
@page {
  @bottom-left { content: ${quote(footer.left)}; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); }
}
</style>
</head>
<body>
${header}
<main>
${body}
</main>
</body>
</html>
`;
  return { html, printed, omitted, posters };
};

// Google Fonts sends browsers variable fonts, which Chrome embeds in the PDF as Type 3 outlines.
// A plain request gets static TrueType files, which embed as ordinary fonts; without them the
// page falls back to the website's stylesheet link.
const loadFontCss = async () => {
  try {
    const response = await fetch(FONTS, { signal: AbortSignal.timeout(SHEET_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const css = await response.text();
    if (!/@font-face[\s\S]*format\('truetype'\)/.test(css)) throw new Error("no TrueType fonts in the response");
    return css;
  } catch (error) {
    warn(`static web fonts unavailable (${error.message}); using the website's font stylesheet`);
    return null;
  }
};

// ---------- printing ----------
const isExecutable = file => access(file, constants.X_OK).then(() => true, () => false);
const chromeCandidates = () => {
  if (process.platform === "win32") {
    return [
      [process.env.ProgramFiles, "Google/Chrome/Application/chrome.exe"],
      [process.env["ProgramFiles(x86)"], "Google/Chrome/Application/chrome.exe"],
      [process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"],
      [process.env["ProgramFiles(x86)"], "Microsoft/Edge/Application/msedge.exe"],
    ].filter(([base]) => base).map(([base, file]) => path.join(base, file));
  }
  if (process.platform === "darwin") return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  return ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].flatMap(name => dirs.map(dir => path.join(dir, name)));
};
const findChrome = async () => {
  const chosen = args.chrome || process.env.CHROME_PATH;
  if (chosen) {
    if (await isExecutable(chosen)) return chosen;
    throw new BuildError(`no browser at ${chosen} (from ${args.chrome ? "--chrome" : "CHROME_PATH"}).`);
  }
  for (const candidate of chromeCandidates()) if (await isExecutable(candidate)) return candidate;
  throw new BuildError("Google Chrome or Chromium was not found. Install Chrome, or pass --chrome <path> or set CHROME_PATH.");
};

const run = promisify(execFile);
const printPdf = async ({ chrome, htmlFile, pdfFile, profileDir }) => {
  await rm(pdfFile, { force: true });
  const flags = [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    `--user-data-dir=${profileDir}`, "--no-pdf-header-footer",
    // Virtual time pauses while the web fonts download, so the page is printed with them.
    `--virtual-time-budget=${FONT_BUDGET_MS}`, `--print-to-pdf=${pdfFile}`,
    ...(process.env.CI ? ["--no-sandbox"] : []),
  ];
  try {
    await run(chrome, [...flags, pathToFileURL(htmlFile).href], { timeout: CHROME_TIMEOUT_MS, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    const reason = error.killed
      ? `no PDF after ${CHROME_TIMEOUT_MS / 1000} s. Inside a sandboxed environment, set CI=1 to run Chrome with --no-sandbox`
      : `exit code ${error.code}. ${String(error.stderr || error.message).trim().split("\n").slice(-3).join(" / ")}`;
    throw new BuildError(`Chrome failed: ${reason}`);
  }
  try { return await readFile(pdfFile); }
  catch { throw new BuildError("Chrome finished but did not write a PDF."); }
};

// Chrome scales a whole page down when something on it is wider than the page, which would take
// text below 10pt. Skia draws the page body with "s 0 0 s x y cm" (s = 3.125 at 100%) and the footer
// margin boxes always at 100%, so a page whose smallest such scale is below its largest was shrunk.
// Returns the smallest ratio over all pages, or null if the page contents could not be read.
const printScale = (buffer, text) => {
  let smallest = null;
  for (const page of text.matchAll(/\/Type\s*\/Page\b[\s\S]*?endobj/g)) {
    const refs = page[0].match(/\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/)?.[1].match(/\d+(?=\s+\d+\s+R)/g) || [];
    const content = refs.map(ref => {
      const header = new RegExp(`(?:^|\\s)${ref}\\s+0\\s+obj\\s*<<([^>]*)>>\\s*stream\\r?\\n`).exec(text);
      if (!header) return "";
      const start = header.index + header[0].length;
      const length = Number(header[1].match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/)?.[1]) || text.indexOf("endstream", start) - start;
      const bytes = buffer.subarray(start, start + length);
      try { return /\/FlateDecode/.test(header[1]) ? inflateSync(bytes).toString("latin1") : bytes.toString("latin1"); }
      catch { return ""; }
    }).join("\n");
    const scales = [...content.matchAll(/(?:^|\s)(\d*\.?\d+) 0 0 \1 -?[\d.]+ -?[\d.]+ cm/g)].map(match => Number(match[1])).filter(scale => scale > 1);
    if (scales.length < 2) continue;
    const ratio = Math.min(...scales) / Math.max(...scales);
    smallest = smallest === null ? ratio : Math.min(smallest, ratio);
  }
  return smallest;
};

// Chrome's PDFs (Skia) keep page objects uncompressed, so they can be read from the raw bytes.
// Page objects are counted; the page tree's /Count is a cross-check.
const inspectPdf = buffer => {
  const text = buffer.toString("latin1");
  const pageObjects = (text.match(/\/Type\s*\/Page\b/g) || []).length;
  const treeCount = Math.max(0, ...[...text.matchAll(/\/Type\s*\/Pages\b/g)].map(match => {
    const dict = text.slice(text.lastIndexOf("<<", match.index), text.indexOf(">>", match.index));
    return Number(dict.match(/\/Count\s+(\d+)/)?.[1]) || 0;
  }));
  if (!pageObjects || pageObjects !== treeCount) warn(`page count unclear (${pageObjects} page objects, page tree says ${treeCount}); using the larger`);
  const box = text.match(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/);
  const size = box ? [box[3] - box[1], box[4] - box[2]] : null;
  // Font names look like /FontName /AAAAAA+Inter-Medium or /BaseFont /BAAAAA+Source-Serif-4-28pt-SemiBold.
  const fonts = [...new Set([...text.matchAll(/\/(?:FontName|BaseFont)\s*\/(?:[A-Z]{6}\+)?([^\s/<>[\]()]+)/g)]
    .map(match => match[1].replace(/#([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))))];
  return {
    pages: Math.max(pageObjects, treeCount),
    scale: printScale(buffer, text),
    size,
    isA4: Boolean(size) && Math.abs(size[0] - 595.28) < 2 && Math.abs(size[1] - 841.89) < 2,
    inter: fonts.some(name => /^inter\b/i.test(name)),
    serif: fonts.some(name => /source\W*serif/i.test(name)),
    fonts,
  };
};

// ---------- build ----------
const main = async () => {
  const chrome = await findChrome();
  log(`Chrome: ${chrome}`);
  const { S, feed, data, sources } = await loadData();
  log(`  ${describeSources(sources)}`);
  const profile = data.profile || {};
  const papers = S.mergePublications(feed, data.publications).filter(item => !S.isPlaceholder(item));
  const settings = S.cvSettings(data.cvOptions, data.cvOptionsSheet);
  settings.warnings.forEach(warn);
  const limitSource = applyOptions(settings, data, S);

  const sections = makeSections({ S, data, papers, selfName: sectionName(profile.name) });
  settings.sections.filter(item => !sections[item.section]).forEach(item => warn(`cvOptions: no section called "${item.section}"; it is skipped`));
  settings.sections.filter(item => item.include && SCOPES[item.section] && !SCOPES[item.section].test(S.clean(item.scope)))
    .forEach(item => warn(`${item.section}: unknown scope "${item.scope}"; printing it as by default`));
  const publications = settings.sections.find(item => item.section === "publications");
  if (publications?.include && !/^(?:all|journal|preprints)?$/i.test(S.clean(publications.scope)) && !S.paperRefs(papers, publications.scope).length) {
    warn(`publications: no paper matches the scope "${publications.scope}"`);
  }
  settings.dropOrder.filter(name => name !== "posters" && !sections[name]).forEach(name => warn(`dropOrder: unknown entry "${name}"`));

  const built = new Date();
  const name = S.clean(profile.name) || "Curriculum vitae";
  const footer = {
    title: `${name} · Curriculum vitae`,
    left: `${name} · Curriculum vitae · ${built.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`,
  };
  const css = await readFile(path.join(root, "scripts/cv/cv.css"), "utf8");
  const fontCss = await loadFontCss();
  const limit = settings.pageLimit;
  log(`Page limit: ${limit ? plural(limit, "page") : "none"} (${limitSource})`);

  const state = { dropped: new Set(), noPosters: false };
  const droppedForLength = [];
  const temp = await mkdtemp(path.join(os.tmpdir(), "cv-build-"));
  try {
    const htmlFile = path.join(temp, "cv.html"), pdfFile = path.join(temp, "cv.pdf");
    let cv, pdf, info;
    for (let attempt = 1; ; attempt += 1) {
      cv = renderCv({ S, profile, settings, sections, state, css, fontCss, footer });
      if (attempt === 1) cv.omitted.forEach(section => log(`  ${section}: nothing to print (no rows in its scope, or only PLACEHOLDER rows); left out`));
      await writeFile(htmlFile, cv.html);
      pdf = await printPdf({ chrome, htmlFile, pdfFile, profileDir: path.join(temp, "profile") });
      info = inspectPdf(pdf);
      log(`Print ${attempt}: ${plural(info.pages, "page")}`);
      if (!limit || info.pages <= limit) break;
      const next = settings.dropOrder.find(entry => entry === "posters" ? cv.posters > 0 : cv.printed.some(item => item.section === entry));
      if (!next) {
        warn(`the CV is ${plural(info.pages, "page")}, over the limit of ${limit}, after the whole drop order; writing it anyway`);
        annotate(`CV is ${info.pages} pages (limit ${limit})`);
        break;
      }
      if (next === "posters") state.noPosters = true;
      else state.dropped.add(next);
      droppedForLength.push(next);
      log(`  over the limit of ${plural(limit, "page")}: leaving out ${next === "posters" ? "posters (from talks)" : next}`);
    }

    const out = args.out ? path.resolve(args.out) : path.join(root, "assets/cv.pdf");
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, pdf);
    if (args.html) {
      await mkdir(path.dirname(path.resolve(args.html)), { recursive: true });
      await writeFile(path.resolve(args.html), cv.html);
    }
    if (!info.inter || !info.serif) {
      const missing = [!info.inter && "Inter", !info.serif && "Source Serif 4"].filter(Boolean).join(" and ");
      warn(`${missing} not embedded, so fallback fonts were used (fonts in the PDF: ${info.fonts.join(", ") || "none found"})`);
      annotate(`CV printed without ${missing}`);
    }
    const shrunk = info.scale !== null && info.scale < 0.995;
    if (shrunk) {
      warn(`Chrome scaled a page down to ${Math.round(info.scale * 100)}% because something on it is wider than the page, so its text is below 10pt`);
      annotate(`CV text scaled to ${Math.round(info.scale * 100)}% (below 10pt)`);
    }

    const excluded = settings.sections.filter(item => !item.include).map(item => item.section);
    const width = Math.max(...cv.printed.map(item => item.section.length));
    log("\nSummary");
    log(`  Data         ${describeSources(sources)}`);
    log("  Printed");
    cv.printed.forEach(item => log(`    ${item.section.padEnd(width)}  ${plural(item.count, "item")}${S.clean(item.scope) ? `  (scope: ${S.clean(item.scope)})` : ""}`));
    if (cv.omitted.length) log(`  Omitted      ${cv.omitted.join(", ")} (nothing to print)`);
    if (excluded.length) log(`  Not included ${excluded.join(", ")}`);
    if (droppedForLength.length) log(`  Dropped      ${droppedForLength.join(", ")} (page limit)`);
    log(`  Pages        ${info.pages}${limit ? ` (limit ${limit})` : " (no limit)"}`);
    log(`  Page size    ${info.size ? `${info.size.map(value => value.toFixed(2)).join(" x ")} pt${info.isA4 ? " (A4)" : ""}` : "unknown"}`);
    log(`  Fonts        ${info.inter && info.serif ? "Inter and Source Serif 4 embedded" : `fallback fonts used (${info.fonts.join(", ")})`}`);
    log(`  Text scale   ${info.scale === null ? "not checked (page contents not readable)" : shrunk ? `${Math.round(info.scale * 100)}%, below 10pt` : "100%"}`);
    log(`  Output       ${path.relative(process.cwd(), out) || out} (${Math.round(pdf.length / 1024)} KB)${args.html ? `, HTML ${args.html}` : ""}`);
    if (warnings.length) log(`  Warnings     ${warnings.length} (see above)`);
  } finally {
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
};

try {
  await main();
} catch (error) {
  console.error(`CV build failed: ${error instanceof BuildError ? error.message : error.stack}`);
  process.exitCode = 1;
}
