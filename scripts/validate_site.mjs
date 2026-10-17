import { access, readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = "https://harshsharma-q.github.io/portfolio/";
const scripts = ["assets/content.js", "assets/sheet-config.js", "assets/publications.js", "assets/site-data.js", "assets/site.js"];
// Pages in navigation order: the data-page key site.js uses, and the elements it fills in.
const pages = {
  "index.html": { key: "home", ids: ["about", "research", "projects", "profile-name", "profile-title", "profile-bio", "profile-availability", "profile-links", "profile-portrait", "profile-photo", "research-list", "project-list"] },
  "publications.html": { key: "publications", ids: ["publication-profiles", "publication-profiles-line", "journal-list", "preprint-list"] },
  "talks.html": { key: "talks", ids: ["talk-list", "attended-list"] },
  "teaching.html": { key: "teaching", ids: ["course-list", "assistantship-list"] },
  "cv.html": { key: "cv", ids: ["education-list", "award-list", "qualifications", "qualification-list"] },
};
const redirects = {
  "research.html": "index.html#research",
  "activities.html": "talks.html",
  "background.html": "cv.html",
  "contact.html": "index.html#contact",
};
// The original Sheet tabs must keep these columns; the other tabs are optional.
const fixedTabs = {
  profile: ["field", "value"],
  publications: ["arxiv", "title", "authors", "journal", "doi", "summary"],
  talks: ["year", "type", "title", "event", "venue"],
  education: ["period", "degree", "institution"],
  awards: ["year", "title", "organization"],
  qualifications: ["year", "title", "organization"],
};
const optionalTabs = {
  research: ["title", "text", "papers"],
  projects: ["title", "text", "papers"],
  teaching: ["period", "role", "course", "institution", "hours", "level", "notes"],
  visits: ["period", "institution", "host", "detail"],
  cvOptions: ["section", "include", "scope"],
};
// Built by the deploy workflow, not stored in the repository.
const buildOutputs = new Set(["assets/cv.pdf"]);
const canonical = page => page === "index.html" ? site : `${site}${page}`;
const errors = [];

// Loads the browser data files the same way scripts/build_cv.mjs does.
const context = vm.createContext({ console });
context.window = context;
for (const file of scripts.slice(0, 4)) {
  try { vm.runInContext(await readFile(path.join(root, file), "utf8"), context, { filename: file }); }
  catch (error) { errors.push(`${file}: does not run (${error.message})`); }
}

for (const [page, { key, ids: required }] of Object.entries(pages)) {
  let html;
  try { html = await readFile(path.join(root, page), "utf8"); }
  catch { errors.push(`${page}: page is missing`); continue; }
  for (const snippet of ["<title>", 'name="description"', `rel="canonical" href="${canonical(page)}"`, `data-page="${key}"`, 'id="site-header"', 'id="main"', 'id="contact"', ...scripts]) {
    if (!html.includes(snippet)) errors.push(`${page}: missing ${snippet}`);
  }
  if (html.includes("private/")) errors.push(`${page}: public page references private owner tools`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const duplicates = ids.filter((id, position) => ids.indexOf(id) !== position);
  if (duplicates.length) errors.push(`${page}: duplicate ids ${[...new Set(duplicates)].join(", ")}`);
  const missingIds = required.filter(id => !ids.includes(id));
  if (missingIds.length) errors.push(`${page}: missing elements ${missingIds.join(", ")}`);
  for (const [, reference] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    if (/^(?:https?:|mailto:|#|data:)/.test(reference)) continue;
    const local = reference.split(/[?#]/)[0];
    if (!local || buildOutputs.has(local)) continue;
    try { await access(path.join(root, local)); }
    catch { errors.push(`${page}: missing local reference ${local}`); }
  }
  const order = scripts.map(item => html.indexOf(item));
  if (!order.every((value, position) => value >= 0 && (position === 0 || value > order[position - 1]))) errors.push(`${page}: data scripts are out of order`);
}

// The navigation is defined once, in site.js, and must list the pages above in order.
const siteJs = await readFile(path.join(root, "assets/site.js"), "utf8");
const nav = [...(siteJs.match(/const NAV = \[([\s\S]*?)\];/)?.[1] || "").matchAll(/page: "([^"]+)", href: "([^"]+)"/g)].map(match => `${match[2]}=${match[1]}`);
const expectedNav = Object.entries(pages).map(([page, { key }]) => `${page}=${key}`);
if (nav.join() !== expectedNav.join()) errors.push(`assets/site.js: NAV should be ${expectedNav.join(", ")} (found ${nav.join(", ") || "nothing"})`);
// Each page also needs a renderer and its list of Sheet tabs.
const blocks = { RENDER: /const RENDER = \{([\s\S]*?)\n {2}\};/, PAGE_TABS: /const PAGE_TABS = \{([\s\S]*?)\n {2}\};/ };
for (const [block, pattern] of Object.entries(blocks)) {
  const keys = [...(siteJs.match(pattern)?.[1] || "").matchAll(/^ {4}(\w+):/gm)].map(match => match[1]);
  const missing = Object.values(pages).map(page => page.key).filter(key => !keys.includes(key));
  if (missing.length) errors.push(`assets/site.js: ${block} lacks ${missing.join(", ")}`);
}

const content = await readFile(path.join(root, "assets/content.js"), "utf8");
let data = {};
try {
  data = JSON.parse(content.slice(content.indexOf("{", content.indexOf("window.SITE_CONTENT")), content.lastIndexOf("}") + 1));
} catch (error) {
  errors.push(`assets/content.js: content is not valid JSON (${error.message})`);
}
for (const key of [...Object.keys(fixedTabs), ...Object.keys(optionalTabs).filter(key => key !== "cvOptions"), "cvOptions"]) {
  if (!(key in data)) errors.push(`assets/content.js: missing "${key}"`);
}
for (const [key, columns] of Object.entries(optionalTabs)) {
  if (key === "cvOptions" || !Array.isArray(data[key])) continue;
  data[key].forEach((row, index) => {
    const missing = columns.filter(column => !(column in row));
    if (missing.length) errors.push(`assets/content.js: ${key}[${index}] lacks ${missing.join(", ")}`);
  });
}
const sections = context.SiteData?.CV_SECTIONS || [];
const options = data.cvOptions || {};
if (!Number.isInteger(options.pageLimit) || options.pageLimit < 0) errors.push("assets/content.js: cvOptions.pageLimit must be 0 (no limit) or a positive whole number");
(options.sections || []).forEach((item, index, all) => {
  if (!sections.includes(item.section)) errors.push(`assets/content.js: cvOptions has unknown section "${item.section}"`);
  if (typeof item.include !== "boolean") errors.push(`assets/content.js: cvOptions "${item.section}" include must be true or false`);
  if (all.findIndex(other => other.section === item.section) !== index) errors.push(`assets/content.js: cvOptions lists "${item.section}" twice`);
});
(options.dropOrder || []).forEach(name => {
  if (name !== "posters" && !sections.includes(name)) errors.push(`assets/content.js: cvOptions.dropOrder has unknown section "${name}"`);
});

const tabs = context.SHEET_CONFIG?.tabs || {};
for (const [key, columns] of Object.entries({ ...fixedTabs, ...optionalTabs })) {
  if (JSON.stringify(tabs[key]?.columns) !== JSON.stringify(columns)) errors.push(`assets/sheet-config.js: tab "${key}" should have columns ${columns.join(", ")}`);
}

for (const [page, target] of Object.entries(redirects)) {
  try {
    const source = await readFile(path.join(root, page), "utf8");
    if (!source.includes(`url=${target}"`)) errors.push(`${page}: should redirect to ${target}`);
    if (!(target.split("#")[0] in pages)) errors.push(`${page}: redirect target ${target} is not a page`);
  } catch {
    errors.push(`${page}: redirect page is missing`);
  }
}

const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
for (const page of Object.keys(pages)) {
  if (!sitemap.includes(`<loc>${canonical(page)}</loc>`)) errors.push(`sitemap.xml: missing ${canonical(page)}`);
}
const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].length;
if (listed !== Object.keys(pages).length) errors.push(`sitemap.xml: lists ${listed} URLs, expected ${Object.keys(pages).length}`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Validated ${Object.keys(pages).length} pages, the navigation, local assets, content data and CV options, Sheet tab schemas, ${Object.keys(redirects).length} redirects, and the sitemap.`);
