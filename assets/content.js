/*
  BUNDLED WEBSITE CONTENT (fallback copy of the Google Sheet)

  The live site reads the Google Sheet configured in assets/sheet-config.js.
  This file is used when the Sheet is disabled or unreachable, or when an
  optional tab (Research, Projects, Teaching, Visits, CVOptions) does not exist,
  so keep it roughly in step with the Sheet. The CV build (scripts/build_cv.mjs)
  reads the same data. Everything after the equals sign must stay valid JSON:
  double quotes, no trailing commas, no comments.

  Rows with PLACEHOLDER in any cell are waiting for real data: the pages show
  "to be added" instead, and the CV leaves them out.
*/
window.SITE_CONTENT = {
  "profile": {
    "name": "Harsh Sharma",
    "title": "PhD candidate, Department of Physics, IIT Bombay",
    "bio": "I am a PhD candidate in physics at IIT Bombay and a Prime Minister's Research Fellow, working with [Prof. Himadri Shekhar Dhar](https://www.phy.iitb.ac.in/employee-profile/himadri-shekhar-dhar) on quantum information theory. My main research is on quantum error correction and quantum sensing with spin ensembles, using schemes that need only collective control and measurement, because individual spins are hard to address in most ensemble experiments. I have also worked on hybrid spin–cavity systems, quantum thermodynamics and multipartite entanglement.",
    "availability": "I expect to complete my PhD in July 2027 and am looking for postdoctoral and research positions in quantum error correction and quantum sensing.",
    "email": "harsh.sharma@iitb.ac.in",
    "address": "Department of Physics, IIT Bombay, Powai, Mumbai 400076, India",
    "photo": "assets/harsh-sharma.jpg",
    "cv": "",
    "scholar": "https://scholar.google.com/citations?user=EXCrXG0AAAAJ&hl=en",
    "arxiv": "https://arxiv.org/a/sharma_h_2.html",
    "orcid": "https://orcid.org/0000-0003-0136-2655",
    "linkedin": "https://www.linkedin.com/in/harshsharma0810",
    "github": ""
  },
  "research": [
    {
      "group": "",
      "title": "",
      "text": "My work is theoretical. Where possible, I build protocols from the controls and noise processes of specific experimental platforms, such as trapped ions, NV centers and superconducting circuits.",
      "papers": ""
    },
    {
      "group": "Main interests",
      "title": "Quantum error correction for spin ensembles",
      "text": "Error correction for ensembles of spins that are hard to address individually, such as ions in Penning traps, NV centers in diamond and atomic clouds. The codes use permutation-invariant states, including mixed states of lower total spin. They correct one round of individual or collective decay, dephasing and pumping, or the loss of a spin, using only collective measurement and control of the ensemble.",
      "papers": "arXiv:2408.11628"
    },
    {
      "group": "Main interests",
      "title": "Loss-tolerant quantum sensing",
      "text": "Error correction for Ramsey sensing with spin ensembles. A probe encoded in an error-correcting code tolerates collective decay: in simulations of 20 spins, its quantum Fisher information stays comparable to that of a GHZ probe with no decay. No encoded probe can protect this sensing protocol against individual decay or pumping.",
      "papers": "arXiv:2408.11628"
    },
    {
      "group": "Other interests",
      "title": "Hybrid spin–cavity systems",
      "text": "Spin ensembles coupled to cavities, used to store and transfer quantum information. Differences in the spins' frequencies (inhomogeneous broadening) cause decoherence. A parametric drive on the cavity strengthens the effective spin–cavity coupling and protects information encoded in the driven system.",
      "papers": "arXiv:2207.14354"
    },
    {
      "group": "Other interests",
      "title": "Quantum thermodynamics",
      "text": "Quantum batteries made of spins. In a battery of N spins coupled to two cavity modes, the charging power can scale as N² for suitable parameters, compared with N for spins charged independently.",
      "papers": "arXiv:2512.15607"
    },
    {
      "group": "Other interests",
      "title": "Multipartite entanglement",
      "text": "Estimating genuine multipartite entanglement in strongly interacting systems from ergotropy, the maximum work that can be extracted from a state by unitary operations. The estimate uses quenches of the interactions or local measurements.",
      "papers": "arXiv:2511.03266"
    }
  ],
  "projects": [
    {
      "title": "Decoding accumulated errors in unresolvable spin ensembles",
      "text": "Our codes for unresolvable spin ensembles correct one round of errors at a time. Repeated individual errors lower the total spin of the ensemble, and after several rounds the code can no longer protect the stored information. I am working on decoding errors that accumulate over several rounds in these ensembles.",
      "papers": "arXiv:2408.11628"
    }
  ],
  "publications": [
    {
      "arxiv": "arXiv:2408.11628",
      "title": "Quantum error correction for an unresolvable spin ensemble",
      "authors": "Harsh Sharma, Himadri Shekhar Dhar, Hoi-Kwan Lau",
      "journal": "Phys. Rev. A 114, 032414 (2026)",
      "doi": "10.1103/1fm4-32my",
      "summary": "Error-correcting codes for spin ensembles whose spins cannot be individually addressed. Information is stored in permutation-invariant states, and errors from individual and collective dephasing, decay, and pumping are corrected using only collective measurement and control. We apply the scheme to quantum memories and to loss-tolerant sensing."
    },
    {
      "arxiv": "arXiv:2512.15607",
      "title": "Quadratic power enhancement in extended Dicke quantum battery",
      "authors": "Harsh Sharma, Himadri Shekhar Dhar",
      "journal": "",
      "doi": "",
      "summary": "A quantum battery of N two-level systems coupled to two cavity modes, one of them in the dispersive regime. For suitable parameters, quantum correlations and the speed of evolution both scale as N², so the charging power scales as N² rather than N."
    },
    {
      "arxiv": "arXiv:2511.03266",
      "title": "Thermodynamic Probes of Multipartite Entanglement in Strongly Interacting Quantum Systems",
      "authors": "Harsh Sharma, Sampriti Saha, A. S. Majumdar, Manik Banik, Himadri Shekhar Dhar",
      "journal": "",
      "doi": "",
      "summary": "We use global and local ergotropy, the maximum work extractable from a state, to quantify genuine multipartite entanglement in strongly interacting systems, through controlled quenches or local measurements. Examples include the Tavis–Cummings, three-level Dicke, and transverse-field Ising models, and noisy parametrized circuits."
    },
    {
      "arxiv": "arXiv:2207.14354",
      "title": "Protecting information in a parametrically driven hybrid quantum system",
      "authors": "Siddharth Tiwary, Harsh Sharma, Himadri Shekhar Dhar",
      "journal": "Quantum 9, 1754 (2025)",
      "doi": "10.22331/q-2025-05-22-1754",
      "summary": "Inhomogeneity in a spin ensemble coupled to a cavity disrupts the storage and transfer of quantum information. Using a variational renormalization-group treatment, we show that a parametric drive strongly protects the encoded information against this decoherence."
    },
    {
      "arxiv": "arXiv:2302.07003",
      "title": "Improving performance of quantum heat engines using modified Otto cycle",
      "authors": "Revathy B. S., Harsh Sharma, Uma Divakaran",
      "journal": "J. Phys. A: Math. Theor. 57, 165302 (2024)",
      "doi": "10.1088/1751-8121/ad38ee",
      "summary": "Adding a period of free evolution of suitable length at the end of one unitary stroke of a finite-time quantum Otto cycle brings the working medium to a less excited state. This increases both work output and efficiency, especially when the engine operates across a critical point."
    }
  ],
  "talks": [
    { "year": "2025", "type": "Talk", "title": "Quantum Error Correction for Unresolvable Spin Ensembles", "event": "Quantum Trajectories", "venue": "ICTS–TIFR, Bengaluru", "eventUrl": "https://www.icts.res.in/program/qt", "eventLabel": "Programme", "videoUrl": "https://www.youtube.com/watch?v=PrN4ENJrXX4" },
    { "year": "2025", "type": "Talk", "title": "Quantum Error Correction for Unresolvable Spin Ensembles", "event": "APS Global Physics Summit", "venue": "Anaheim, California, USA", "eventUrl": "https://meetings-archive.aps.org/smt/2025/mar-t33/11/", "eventLabel": "Abstract", "videoUrl": "" },
    { "year": "2025", "type": "Poster", "title": "Protecting Information in a Parametrically Driven Hybrid Quantum System", "event": "Quantum Symposium for Young Investigators", "venue": "CQuICC, IIT Madras", "eventUrl": "https://sites.google.com/physics.iitm.ac.in/qsyi-2025/program", "eventLabel": "Programme", "videoUrl": "" },
    { "year": "2024", "type": "Talk", "title": "Quantum Error Correction for Unresolvable Spin Ensembles", "event": "CAP Congress", "venue": "Western University, Ontario, Canada", "eventUrl": "https://indico.global/event/440/contributions/10771/", "eventLabel": "Abstract", "videoUrl": "" },
    { "year": "2024", "type": "Workshop", "title": "", "event": "Quantum Information and Quantum Dynamics", "venue": "IIT Bombay", "eventUrl": "", "eventLabel": "", "videoUrl": "" },
    { "year": "2024", "type": "Conference", "title": "", "event": "Photonics, Quantum Information, and Quantum Communication", "venue": "S. N. Bose National Centre for Basic Sciences, Kolkata", "eventUrl": "https://www.bose.res.in/Conferences/PQIQC23/", "eventLabel": "", "videoUrl": "" },
    { "year": "2023", "type": "Workshop", "title": "", "event": "CREATE Commercialization & Communication", "venue": "Quantum Algorithms Institute, Canada", "eventUrl": "https://www.quantumalgorithmsinstitute.ca/", "eventLabel": "", "videoUrl": "" },
    { "year": "2023", "type": "Workshop", "title": "", "event": "ICONS 2023: Quantum Science and Technology", "venue": "QuICST, IIT Bombay", "eventUrl": "https://rnd.iitb.ac.in/sites/default/files/2024-10/Final_Report_QST%20Workshop%20%5BICONS%202023%5D_compressed.pdf", "eventLabel": "", "videoUrl": "" },
    { "year": "2021", "type": "Workshop", "title": "", "event": "Simulation Methods in Scientific Computing", "venue": "IIT Kharagpur", "eventUrl": "https://ccds.iitkgp.ac.in/nodal-center.php", "eventLabel": "", "videoUrl": "" },
    { "year": "2018", "type": "Camp", "title": "", "event": "NIUS Exposure-cum-Nurture Camp", "venue": "HBCSE, TIFR, Mumbai", "eventUrl": "https://nius.hbcse.tifr.res.in/", "eventLabel": "", "videoUrl": "" }
  ],
  "teaching": [
    { "period": "PLACEHOLDER", "role": "Instructor", "course": "PLACEHOLDER: course title", "institution": "PLACEHOLDER: institution", "hours": "", "level": "", "notes": "PLACEHOLDER: replace with a course taught as a Prime Minister's Research Fellow" },
    { "period": "PLACEHOLDER", "role": "Teaching assistant", "course": "PLACEHOLDER: course code and title", "institution": "IIT Bombay", "hours": "", "level": "", "notes": "PLACEHOLDER: replace with a teaching assistantship at IIT Bombay" }
  ],
  "education": [
    { "period": "2022 – 2027", "degree": "PhD in Physics", "institution": "Indian Institute of Technology Bombay", "detail": "Expected completion: July 2027" },
    { "period": "2020 – 2022", "degree": "M.Sc. in Physics", "institution": "Indian Institute of Technology Palakkad", "detail": "" },
    { "period": "2017 – 2020", "degree": "B.Sc. (Hons.) in Physics", "institution": "Pt. Ravishankar Shukla University, Raipur", "detail": "" }
  ],
  "awards": [
    { "year": "2023", "title": "SFU–Mitacs Globalink Research Award", "organization": "Mitacs and Simon Fraser University", "detail": "Three-month collaboration on quantum error suppression in hybrid quantum systems" },
    { "year": "2022", "title": "Prime Minister’s Research Fellowship", "organization": "Ministry of Education, Government of India", "detail": "Direct entry, cycle 9" },
    { "year": "2022", "title": "Best M.Sc. Project in Physics", "organization": "IIT Palakkad", "detail": "" },
    { "year": "2022", "title": "Best M.Sc. Student in Physics", "organization": "IIT Palakkad", "detail": "Highest CGPA in the programme" }
  ],
  "qualifications": [
    { "year": "2022", "title": "CSIR–UGC NET (Lectureship)", "organization": "All India Rank 45" },
    { "year": "2021", "title": "Graduate Aptitude Test in Engineering (GATE)", "organization": "All India Rank 1544" },
    { "year": "2020", "title": "Joint Admission Test for M.Sc. (JAM)", "organization": "All India Rank 666" }
  ],
  "visits": [
    { "period": "2023", "institution": "Simon Fraser University, Canada", "host": "PLACEHOLDER: host", "detail": "PLACEHOLDER: dates of the visit supported by the SFU–Mitacs Globalink Research Award" }
  ],
  "cvOptions": {
    "pageLimit": 2,
    "sections": [
      { "section": "contact", "include": true, "scope": "" },
      { "section": "research interests", "include": true, "scope": "titles" },
      { "section": "education", "include": true, "scope": "" },
      { "section": "publications", "include": true, "scope": "all" },
      { "section": "fellowships and awards", "include": true, "scope": "" },
      { "section": "talks", "include": true, "scope": "all" },
      { "section": "research visits", "include": true, "scope": "" },
      { "section": "teaching", "include": true, "scope": "all" },
      { "section": "schools attended", "include": true, "scope": "all" },
      { "section": "referees", "include": true, "scope": "" }
    ],
    "dropOrder": ["schools attended", "teaching", "research visits", "posters", "talks", "research interests"]
  }
};
