(() => {
  const SHEET_TIMEOUT_MS = 2500;
  const S = window.SiteData;
  const { clean, esc, rich } = S;
  const bundled = window.SITE_CONTENT || {};
  const config = window.SHEET_CONFIG || {};
  const page = document.body.dataset.page || "home";
  const $ = id => document.getElementById(id);
  const external = (url, label) => url ? `<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(label)}</a>` : "";

  // ---------- shared header and footer (the one place the navigation is defined) ----------
  const NAV = [
    { page: "home", href: "index.html", label: "Home" },
    { page: "publications", href: "publications.html", label: "Publications" },
    { page: "talks", href: "talks.html", label: "Talks" },
    { page: "teaching", href: "teaching.html", label: "Teaching" },
    { page: "cv", href: "cv.html", label: "CV" },
  ];
  // Sheet tabs each page reads; every page uses the profile for the header and footer.
  const PAGE_TABS = {
    home: ["profile", "publications", "research", "projects"],
    publications: ["profile", "publications"],
    talks: ["profile", "talks"],
    teaching: ["profile", "teaching"],
    cv: ["profile", "education", "awards", "qualifications"],
  };

  const renderChrome = () => {
    $("site-header").innerHTML = `<div class="wrap header-inner">
      <a class="site-name" href="index.html">${esc(bundled.profile?.name)}</a>
      <nav aria-label="Main">${NAV.map(item => `<a href="${item.href}"${item.page === page ? ' aria-current="page"' : ""}>${item.label}</a>`).join("")}</nav>
    </div>`;
    $("contact").innerHTML = `<div class="wrap footer-inner"><p id="footer-address"></p><p><a id="footer-email"></a></p></div>`;
  };

  // The CV PDF is built by the deploy workflow. Its links appear only once the file exists,
  // unless the profile's cv field points to another PDF.
  // A later render wins over an earlier call that is still waiting for the check.
  let cvExists, cvRun = 0;
  const showCvLinks = async profile => {
    if (!document.querySelector("[data-cv-link]")) return;
    const run = ++cvRun;
    let href = clean(profile.cv);
    if (!href) {
      cvExists ??= fetch("assets/cv.pdf", { method: "HEAD", cache: "no-store" }).then(response => response.ok).catch(() => false);
      const exists = await cvExists;
      if (run !== cvRun) return;
      if (exists) href = "assets/cv.pdf";
    }
    document.querySelectorAll("[data-cv-link]").forEach(link => {
      (link.closest("[data-cv-item]") || link).hidden = !href;
      if (href) link.href = href;
    });
    document.querySelectorAll("[data-cv-missing]").forEach(note => { note.hidden = Boolean(href); });
  };

  const renderProfileChrome = profile => {
    document.querySelectorAll(".site-name").forEach(link => { link.textContent = profile.name || ""; });
    $("footer-address").textContent = profile.address || "";
    const email = $("footer-email");
    email.textContent = profile.email || "";
    email.href = profile.email ? `mailto:${profile.email}` : "#";
    email.hidden = !profile.email;
  };

  // ---------- shared pieces ----------
  const paperUrl = item => item.doi ? `https://doi.org/${item.doi}` : item.id ? `https://arxiv.org/abs/${item.id}` : "";
  const refLink = item => external(paperUrl(item), S.shortRef(item));
  const PROFILE_LINKS = { scholar: "Google Scholar", arxiv: "arXiv", orcid: "ORCID", linkedin: "LinkedIn", github: "GitHub" };
  const profileLinks = (profile, keys = Object.keys(PROFILE_LINKS)) => keys.map(key => external(profile[key], PROFILE_LINKS[key])).filter(Boolean);
  const block = (rows, render, className = "compact") => rows.length ? `<ul class="${className}">${rows.map(render).join("")}</ul>` : "";
  // Lists led by a period such as "2022 – 2027" get a wider date column.
  const datedBlock = (rows, render) => block(rows, render, "compact dated");
  const datedRow = (date, body) => `<li><span class="entry-year wide">${esc(date)}</span><span>${body}</span></li>`;
  const detail = text => clean(text) ? `<small>${rich(text)}</small>` : "";

  // ---------- home ----------
  const renderIntro = profile => {
    $("profile-name").textContent = profile.name || "";
    $("profile-title").textContent = profile.title || "";
    $("profile-bio").innerHTML = clean(profile.bio).split(/\n+/).filter(Boolean).map(paragraph => `<p>${rich(paragraph)}</p>`).join("");
    const availability = $("profile-availability");
    availability.innerHTML = rich(profile.availability);
    availability.hidden = !clean(profile.availability);
    $("profile-links").innerHTML = [
      profile.email && `<li><a href="mailto:${esc(profile.email)}">${esc(profile.email)}</a></li>`,
      `<li data-cv-item hidden><a data-cv-link target="_blank" rel="noreferrer">Download CV (PDF)</a></li>`,
      ...profileLinks(profile).map(link => `<li>${link}</li>`),
    ].filter(Boolean).join("");
    const portrait = $("profile-portrait");
    portrait.hidden = !profile.photo;
    if (profile.photo) { $("profile-photo").src = profile.photo; $("profile-photo").alt = `Portrait of ${profile.name || ""}`; }
  };

  const renderResearch = (rows, papers) => {
    $("research-list").innerHTML = S.groupResearch(rows).map(group => {
      const tag = group.label ? "h4" : "h3";
      const items = group.items.map(row => {
        if (!clean(row.title)) return `<p class="lead">${rich(row.text)}</p>`;
        const related = S.paperRefs(papers, row.papers);
        const refs = related.length ? `<p class="refs">${related.length > 1 ? "Papers" : "Paper"}: ${related.map(refLink).join(", ")}</p>` : "";
        return `<article class="interest"><${tag}>${esc(row.title)}</${tag}><p>${rich(row.text)}</p>${refs}</article>`;
      }).join("");
      return group.label ? `<h3 class="subhead">${esc(group.label)}</h3>${items}` : items;
    }).join("");
  };

  // Ongoing work only: published papers and preprints are on the Publications page. A project's
  // papers are the published work it builds on.
  const renderProjects = (rows, papers) => {
    const projects = rows.filter(S.hasContent);
    $("projects").hidden = !projects.length;
    $("project-list").innerHTML = projects.map(row => {
      const related = S.paperRefs(papers, row.papers);
      const refs = related.length ? `<p class="refs">Builds on: ${related.map(refLink).join(", ")}</p>` : "";
      return `<article class="project"><p class="project-status">In progress</p>${clean(row.title) ? `<h3>${esc(row.title)}</h3>` : ""}<p>${rich(row.text)}</p>${refs}</article>`;
    }).join("");
  };

  const renderStructuredData = (profile, papers) => {
    let script = document.getElementById("person-jsonld");
    if (!script) {
      script = Object.assign(document.createElement("script"), { type: "application/ld+json", id: "person-jsonld" });
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Person",
      name: profile.name,
      url: "https://harshsharma-q.github.io/portfolio/",
      image: "https://harshsharma-q.github.io/portfolio/assets/harsh-sharma.jpg",
      jobTitle: profile.title,
      email: profile.email ? `mailto:${profile.email}` : undefined,
      affiliation: { "@type": "CollegeOrUniversity", name: "Indian Institute of Technology Bombay", url: "https://www.iitb.ac.in/" },
      sameAs: [profile.scholar, profile.orcid, profile.arxiv, profile.linkedin, profile.github].filter(Boolean),
      subjectOf: papers.filter(item => item.doi).map(item => ({ "@type": "ScholarlyArticle", name: item.title, url: `https://doi.org/${item.doi}` })),
    });
  };

  // ---------- publications ----------
  const renderPublicationList = (target, papers, selfName) => {
    const authorHtml = authors => S.splitAuthors(authors).map(name => name === selfName ? `<strong>${esc(name)}</strong>` : esc(name)).join(", ");
    $(target).innerHTML = papers.map(item => {
      const venue = S.isJournal(item) ? esc(S.journalName(item)) : item.id ? `Preprint, arXiv:${esc(item.id)}` : "";
      const titleUrl = paperUrl(item);
      const links = [
        item.id && external(`https://arxiv.org/abs/${item.id}`, "arXiv"),
        item.id && external(`https://arxiv.org/pdf/${item.id}`, "PDF"),
        item.doi && external(`https://doi.org/${item.doi}`, "DOI"),
        `<button type="button" class="link-button" data-bibtex="${esc(S.bibtex(item))}">BibTeX</button>`,
      ].filter(Boolean);
      return `<article class="entry pub"><span class="entry-year">${esc(item.year || "")}</span><div>
        <h3>${titleUrl ? `<a href="${esc(titleUrl)}" target="_blank" rel="noreferrer">${esc(item.title)}</a>` : esc(item.title)}</h3>
        <p class="pub-authors">${authorHtml(item.authors)}</p>
        ${venue ? `<p class="pub-venue">${venue}</p>` : ""}
        ${clean(item.summary) ? `<p class="pub-summary">${rich(item.summary)}</p>` : ""}
        <p class="entry-links">${links.join("")}</p>
      </div></article>`;
    }).join("") || `<p class="placeholder-note">None at the moment.</p>`;
  };

  const renderPublications = (papers, profile) => {
    $("publication-profiles").innerHTML = profileLinks(profile, ["scholar", "arxiv", "orcid"]).join(", ");
    $("publication-profiles-line").hidden = !$("publication-profiles").innerHTML;
    renderPublicationList("journal-list", papers.filter(S.isJournal), profile.name);
    renderPublicationList("preprint-list", papers.filter(item => !S.isJournal(item)), profile.name);
  };

  // Copying BibTeX is wired once; the buttons are re-created whenever the list is rendered.
  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-bibtex]");
    if (!button) return;
    try { await navigator.clipboard.writeText(button.dataset.bibtex); button.textContent = "Copied"; }
    catch (_) { button.textContent = "Copy failed"; }
    window.setTimeout(() => { button.textContent = "BibTeX"; }, 1600);
  });

  // ---------- talks ----------
  const renderTalks = talks => {
    $("talk-list").innerHTML = S.groupTalks(talks).map(group => `<article class="talk"><h3>${esc(group.title)}</h3><ul>${group.items.map(item => {
      const where = [item.event, item.venue].map(clean).filter(Boolean).map(esc).join(", ");
      const links = [external(item.eventUrl, clean(item.eventLabel) || "Event"), external(item.videoUrl, "Video")].filter(Boolean).join("");
      return `<li><span class="entry-year">${esc(item.year)}</span><span>${clean(item.type) ? `${esc(item.type)} · ` : ""}${where}${links ? ` <span class="entry-links">${links}</span>` : ""}</span></li>`;
    }).join("")}</ul></article>`).join("") || `<p class="placeholder-note">None at the moment.</p>`;

    $("attended-list").innerHTML = block(S.attendedEvents(talks), item => {
      const name = clean(item.eventUrl) ? external(item.eventUrl, item.event) : esc(item.event);
      return `<li><span class="entry-year">${esc(item.year)}</span><span>${name}${clean(item.venue) ? `, ${esc(item.venue)}` : ""}</span></li>`;
    }) || `<p class="placeholder-note">None at the moment.</p>`;
  };

  // ---------- teaching ----------
  const renderTeaching = rows => {
    const { courses, assistantships } = S.groupTeaching(rows);
    const list = (target, items) => {
      $(target).innerHTML = datedBlock(items, row => {
        const meta = [row.role, row.level, clean(row.hours) && `${clean(row.hours)} hours`].map(clean).filter(Boolean).map(esc).join(" · ");
        const where = clean(row.institution) ? `, ${esc(row.institution)}` : "";
        return datedRow(row.period, `<strong>${esc(row.course)}</strong>${where}${meta ? `<small>${meta}</small>` : ""}${detail(row.notes)}`);
      }) || `<p class="placeholder-note">To be added.</p>`;
    };
    list("course-list", courses);
    list("assistantship-list", assistantships);
  };

  // ---------- CV ----------
  const renderBackground = data => {
    $("education-list").innerHTML = datedBlock(data.education || [], item => datedRow(item.period, `<strong>${esc(item.degree)}</strong>, ${esc(item.institution)}${detail(item.detail)}`));
    $("award-list").innerHTML = datedBlock(data.awards || [], item => datedRow(item.year, `<strong>${esc(item.title)}</strong>, ${esc(item.organization)}${detail(item.detail)}`));
    const exams = data.qualifications || [];
    $("qualifications").hidden = !exams.length;
    $("qualification-list").innerHTML = datedBlock(exams, item => datedRow(item.year, `${esc(item.title)}: ${esc(item.organization)}`));
  };

  // ---------- rendering ----------
  const RENDER = {
    home: (data, profile) => {
      const papers = S.mergePublications(window.PUBLICATIONS, data.publications);
      renderIntro(profile);
      renderResearch(data.research || [], papers);
      renderProjects(data.projects || [], papers);
      renderStructuredData(profile, papers);
    },
    publications: (data, profile) => renderPublications(S.mergePublications(window.PUBLICATIONS, data.publications), profile),
    talks: data => renderTalks(data.talks || []),
    teaching: data => renderTeaching(data.teaching || []),
    cv: data => renderBackground(data),
  };

  let rendered = "";
  const render = data => {
    const signature = JSON.stringify(data);
    if (signature === rendered) return;
    const firstRender = !rendered;
    rendered = signature;
    const profile = data.profile || {};
    // Rows marked PLACEHOLDER are waiting for real data and are never shown.
    const ready = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Array.isArray(value) ? value.filter(row => !S.isPlaceholder(row)) : value]));
    renderProfileChrome(profile);
    // Show the page even if a section fails to render.
    try { RENDER[page](ready, profile); }
    finally { $("main").classList.remove("is-loading"); }
    showCvLinks(profile);
    // Content arrives after the browser has already jumped to #section, so jump again once it is in place.
    const target = firstRender && location.hash.length > 1 && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) {
      const root = document.documentElement;
      root.style.scrollBehavior = "auto";
      target.scrollIntoView();
      root.style.scrollBehavior = "";
    }
  };

  // ---------- page behaviour ----------
  renderChrome();
  const header = $("site-header");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 4);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Wait briefly for the Sheet so visitors do not see the bundled copy flash first.
  if (config.enabled && config.spreadsheetId) {
    const fallback = window.setTimeout(() => render(bundled), SHEET_TIMEOUT_MS);
    S.loadSheet({ config, bundled, keys: PAGE_TABS[page] }).then(({ data }) => { window.clearTimeout(fallback); render(data); });
  } else {
    render(bundled);
  }
})();
