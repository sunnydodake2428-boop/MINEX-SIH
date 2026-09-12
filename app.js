/* ============================================================
   DEMO DATASET
   ============================================================ */
const documents = [
  {
    id: "PRD-2024-042",
    title: "Annual Production Statement 2024",
    sub: "CMPDI Head Office",
    type: "pdf",
    typeLabel: "PDF",
    loc: "Page 42",
    date: "2024",
    status: "verified",
    confidence: "98.4%",
    sourceType: "Public source document",
    method: "OCR + table extraction",
    indexed: "3 days ago",
    text: "Total raw coal production across North Karanpura coalfields reached 54.1 MT in FY24, outperforming targets by 8.4 percent with mechanized shovel-dumper combinations."
  },
  {
    id: "PRD-2023-118",
    title: "Overburden Removal & Production Reconciliation, Q3",
    sub: "BCCL, Dhanbad mining zone",
    type: "excel",
    typeLabel: "Excel",
    loc: "Sheet: Production",
    date: "2023",
    status: "verified",
    confidence: "96.1%",
    sourceType: "Public source document",
    method: "Structured cell parsing",
    indexed: "1 week ago",
    text: "Quarterly coal production and overburden removal reconciled against target. Coal production for Q3 stood at 13.9 MT against a target of 13.1 MT.",
    cells: [
      "Coal production Q1: 12.6 MT",
      "Coal production Q2: 13.2 MT",
      "Coal production Q3: 13.9 MT",
      "Coal production Q4 (proj.): 14.1 MT",
      "Overburden removal Q3: 28.4 MCuM",
      "Target variance: +6.1%"
    ]
  },
  {
    id: "GEO-2022-076",
    title: "Jharia Coalfield Stratum Core Log #JH-992",
    sub: "CMPDI Regional Institute II",
    type: "scan",
    typeLabel: "Scanned PDF",
    loc: "Page 15",
    date: "2022",
    status: "review",
    confidence: "82.7%",
    sourceType: "Scanned field log",
    method: "OCR, low scan quality",
    indexed: "2 weeks ago",
    text: "Seam thickness recorded at 4.2 m at borehole JH-992. Adjacent production block flagged for updated coal production estimate pending resurvey."
  },
  {
    id: "ENV-2024-067",
    title: "Environmental Clearance Monitoring Report",
    sub: "MoEFCC compliance filing",
    type: "pdf",
    typeLabel: "PDF",
    loc: "Page 67",
    date: "2024",
    status: "verified",
    confidence: "94.8%",
    sourceType: "Public source document",
    method: "OCR + table extraction",
    indexed: "5 days ago",
    text: "Dust suppression and water injection logged during active high-capacity coal production blasting cycles across the Eastern block conveyors."
  },
  {
    id: "PRD-2021-009",
    title: "Talcher Coalfield Pit Slope Radar Log",
    sub: "MCL, Angul division",
    type: "pdf",
    typeLabel: "PDF",
    loc: "Page 4",
    date: "2021",
    status: "flagged",
    confidence: "71.3%",
    sourceType: "Field telemetry export",
    method: "OCR, partial table loss",
    indexed: "3 weeks ago",
    text: "Slope stability radar readings taken during active bench operations; no production figures captured in this excerpt."
  }
];

const notifications = [
  {icon:"📄", text:"Annual_Production_Statement_2024.pdf uploaded successfully.", time:"2 minutes ago", unread:true},
  {icon:"🔎", text:"326 records extracted from Annual Production Statement 2024.", time:"2 minutes ago", unread:true},
  {icon:"⚠️", text:"Conflict detected — Coal Production 2024 has two differing source values.", time:"1 hour ago", unread:true},
  {icon:"✅", text:"Record PRD-2024-042 marked verified by Analyst.", time:"3 hours ago", unread:false},
  {icon:"📊", text:"Historical analysis for Coal Production (2020–2025) is ready.", time:"Yesterday", unread:false}
];

const moduleInfo = {
  command: {
    icon: "🧭",
    title: "Command Center",
    text: "The KPI overview dashboard — production trends, verification status across the repository, and open conflicts at a glance — is next up in the build.",
    crumb: "Command Center"
  },
  mining: {
    icon: "⛏️",
    title: "Mining Intelligence",
    text: "Ask MINEX natural-language questions over your documents, with automatic conflict detection — e.g. two sources disagreeing on 2024 coal production (52.4 MT vs 54.1 MT) — lands here next.",
    crumb: "Mining Intelligence"
  },
  trust: {
    icon: "🛡️",
    title: "Data Trust Center",
    text: "A rollup of verified vs. flagged records across the whole repository, so analysts know what to trust before reporting on it.",
    crumb: "Data Trust Center"
  },
  historical: {
    icon: "📈",
    title: "Historical Intelligence",
    text: "Multi-year trend charts built from verified records, so a conflict resolved in Mining Intelligence can be traced across history.",
    crumb: "Historical Intelligence"
  },
  report: {
    icon: "📝",
    title: "AI Report Studio",
    text: "Turn a verified, trend-backed finding into a citation-linked report draft, ready for review and export.",
    crumb: "AI Report Studio"
  }
};

let session = null;       // { name, email, org, method }
let activeFilter = "all";
let currentDrawer = null;
let currentModule = "docintel";
let pendingFiles = [];
let indexedCount = 1420;

/* ============================================================
   SMALL HELPERS
   ============================================================ */
function $(id){ return document.getElementById(id); }

function showToast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 2600);
}

function initials(name){
  return name.split(" ").filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join("");
}

/* ============================================================
   AUTH
   ============================================================ */
function setAuthTab(tab){
  $("tabLogin").classList.toggle("on", tab === "login");
  $("tabSignup").classList.toggle("on", tab === "signup");
  $("loginForm").hidden = tab !== "login";
  $("signupForm").hidden = tab !== "signup";
  $("authError").hidden = true;
}

function showAuthError(msg){
  $("authError").textContent = msg;
  $("authError").hidden = false;
}

function startAuthLoading(text){
  $("authLoading").hidden = false;
  $("authLoadingText").textContent = text;
  $("loginForm").hidden = true;
  $("signupForm").hidden = true;
}

function enterApp(newSession){
  session = newSession;
  $("authScreen").hidden = true;
  $("appShell").hidden = false;
  $("avatarBtn").textContent = initials(session.name);
  $("settingsAvatar").textContent = initials(session.name);
  $("settingsName").textContent = session.name;
  $("settingsEmail").textContent = session.email;
  $("settingsRole").textContent = session.role;
  $("settingsOrg").textContent = session.org;
  $("settingsEmpId").textContent = session.empId;
  $("settingsMethod").textContent = session.method;
  renderNotifications();
  renderResults();
  renderRepo();
  setModule("docintel");
  showToast("Signed in as " + session.name);
}

function handleLogin(e){
  e.preventDefault();
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  if(!email || !password){
    showAuthError("Enter your email and password to continue.");
    return;
  }
  $("authError").hidden = true;
  startAuthLoading("Signing in…");
  setTimeout(() => {
    $("authLoading").hidden = true;
    enterApp({
      name: email.split("@")[0].replace(/[._]/g," ").replace(/\b\w/g, c => c.toUpperCase()),
      email: email,
      role: "Verification Analyst",
      org: "CMPDI Head Office",
      empId: "EMP-" + Math.floor(1000 + Math.random()*9000),
      method: "Email & password"
    });
  }, 900);
}

function handleSignup(e){
  e.preventDefault();
  const name = $("suName").value.trim();
  const email = $("suEmail").value.trim();
  const org = $("suOrg").value.trim();
  const pw = $("suPassword").value;
  const confirm = $("suConfirm").value;
  if(!name || !email || !org || !pw){
    showAuthError("Fill in every field to create an account.");
    return;
  }
  if(pw !== confirm){
    showAuthError("Passwords don't match.");
    return;
  }
  $("authError").hidden = true;
  startAuthLoading("Creating your account…");
  setTimeout(() => {
    $("authLoading").hidden = true;
    enterApp({
      name: name,
      email: email,
      role: "Verification Analyst",
      org: org,
      empId: "EMP-" + Math.floor(1000 + Math.random()*9000),
      method: "Email & password"
    });
  }, 900);
}

function handleGoogleAuth(){
  $("authError").hidden = true;
  startAuthLoading("Connecting to Google…");
  setTimeout(() => {
    $("authLoading").hidden = true;
    enterApp({
      name: "Rahul Sharma",
      email: "rahul.sharma@gmail.com",
      role: "Verification Analyst",
      org: "CMPDI Head Office",
      empId: "EMP-4821",
      method: "Google"
    });
  }, 1100);
}

function handleDemoLogin(){
  enterApp({
    name: "Guest Reviewer",
    email: "guest@minex.demo",
    role: "SIH Evaluator (demo access)",
    org: "Prototype demo session",
    empId: "GUEST",
    method: "Guest / demo mode"
  });
}

function handleLogout(){
  $("settingsOverlay").classList.remove("open");
  session = null;
  $("appShell").hidden = true;
  $("authScreen").hidden = false;
  $("loginForm").reset();
  $("signupForm").reset();
  setAuthTab("login");
  showToast("You've been logged out.");
}

/* ============================================================
   MODULE SWITCHING (nav row)
   ============================================================ */
function setModule(key){
  currentModule = key;
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.module === key));

  const isDocIntel = key === "docintel";
  $("moduleDocIntel").hidden = !isDocIntel;
  $("moduleComingSoon").hidden = isDocIntel;

  if(isDocIntel){
    $("crumbModule").textContent = "Document Intelligence";
  } else {
    const info = moduleInfo[key];
    $("crumbModule").textContent = info.crumb;
    $("comingSoonIcon").textContent = info.icon;
    $("comingSoonTitle").textContent = info.title;
    $("comingSoonText").textContent = info.text;
  }
}

/* ============================================================
   NOTIFICATIONS
   ============================================================ */
function renderNotifications(){
  const list = $("notifList");
  const unreadCount = notifications.filter(n => n.unread).length;
  const badge = $("notifBadge");
  if(unreadCount > 0){
    badge.hidden = false;
    badge.textContent = unreadCount;
  } else {
    badge.hidden = true;
  }

  if(notifications.length === 0){
    list.innerHTML = '<div class="notif-empty">You\'re all caught up.</div>';
    return;
  }

  list.innerHTML = notifications.map(n => `
    <div class="notif-item ${n.unread ? "unread" : ""}">
      <div class="notif-icon">${n.icon}</div>
      <div>
        <div class="notif-text">${n.text}</div>
        <div class="notif-time">${n.time}</div>
      </div>
    </div>
  `).join("");
}

/* ============================================================
   SEARCH ENGINE (Global Document Search)
   ============================================================ */
function highlight(text, term){
  if(!term) return text;
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if(idx === -1) return text;
  return text.slice(0, idx) + "<mark>" + text.slice(idx, idx+term.length) + "</mark>" + text.slice(idx+term.length);
}

function countOccurrences(str, term){
  if(!term) return 0;
  const lower = str.toLowerCase();
  const t = term.toLowerCase();
  let count = 0, idx = 0;
  while((idx = lower.indexOf(t, idx)) !== -1){
    count++;
    idx += t.length;
  }
  return count;
}

function docMatches(d, term){
  if(term === "") return true;
  const t = term.toLowerCase();
  if(d.title.toLowerCase().includes(t) || d.text.toLowerCase().includes(t)) return true;
  if(d.cells && d.cells.some(c => c.toLowerCase().includes(t))) return true;
  return false;
}

function matchDetail(d, term){
  if(d.cells){
    const matchedCells = d.cells.filter(c => c.toLowerCase().includes(term.toLowerCase()));
    if(matchedCells.length > 0){
      return {
        label: "Match found in " + matchedCells.length + " cell" + (matchedCells.length === 1 ? "" : "s"),
        snippets: matchedCells.slice(0, 2).map(c => highlight(c, term))
      };
    }
  }
  const n = countOccurrences(d.title + " " + d.text, term);
  return {
    label: n + " occurrence" + (n === 1 ? "" : "s"),
    snippets: ["…" + highlight(d.text, term) + "…"]
  };
}

function renderResults(){
  const term = $("searchInput").value.trim();
  const wrap = $("resultsWrap");
  const count = $("resultCount");

  let matches = documents.filter(d => docMatches(d, term) && (activeFilter === "all" || d.type === activeFilter));

  if(term === ""){
    wrap.innerHTML = "";
    count.textContent = "";
    return;
  }

  count.innerHTML = matches.length
    ? "Found in <b>" + matches.length + "</b> document" + (matches.length===1 ? "" : "s")
    : "";

  if(matches.length === 0){
    wrap.innerHTML = '<div class="empty-state">No matching information found in the available documents.<br>Try a shorter phrase, or check a different format filter.</div>';
    return;
  }

  wrap.innerHTML = matches.map(d => {
    const detail = matchDetail(d, term);
    return `
    <div class="result">
      <div class="result-top">
        <div>
          <div class="result-title">${d.title}</div>
          <div class="result-meta">${d.typeLabel} · ${d.sub}</div>
        </div>
        <div class="result-loc">${d.loc}<br>${d.date}</div>
      </div>
      <div class="result-matchcount">${detail.label}</div>
      ${detail.snippets.map(s => `<div class="result-snippet">${s}</div>`).join("")}
      <div class="result-bottom">
        <div class="result-confidence">Extraction confidence ${d.confidence}</div>
        <div class="result-actions">
          <button class="link-btn" onclick="openDrawer('${d.id}')">View evidence</button>
          <button class="link-btn result-secondary" onclick="openDrawer('${d.id}')">Open document</button>
        </div>
      </div>
    </div>
  `;}).join("");
}

function statusLabel(s){
  if(s === "verified") return {cls:"verified", text:"Verified"};
  if(s === "review") return {cls:"review", text:"Needs review"};
  return {cls:"flagged", text:"Flagged"};
}

function renderRepo(){
  const wrap = $("repoWrap");
  wrap.innerHTML = documents.map(d => {
    const st = statusLabel(d.status);
    return `
    <div class="doc-row">
      <div class="doc-row-top">
        <div>
          <div class="doc-name">${d.title}</div>
          <div class="doc-sub">${d.sub}</div>
        </div>
        <div class="doc-date">${d.date}</div>
      </div>
      <div class="tag-row">
        <span class="tag">${d.typeLabel}</span>
        <span class="tag status ${st.cls}">${st.text}</span>
      </div>
      <div class="doc-actions">
        <button class="link-btn" onclick="openDrawer('${d.id}')">View evidence</button>
        <button class="link-btn" style="color:var(--ink-soft)">Open source</button>
      </div>
    </div>`;
  }).join("");
}

function openDrawer(id){
  const d = documents.find(x => x.id === id);
  if(!d) return;
  const term = $("searchInput").value.trim();
  currentDrawer = {doc: d, term: term};
  $("drawerTitle").textContent = d.title;
  $("drawerSub").textContent = d.sub + " · " + d.loc;
  $("drawerSnippet").innerHTML = "“…" + highlight(d.text, term) + "…”";
  $("factConfidence").textContent = d.confidence;
  const st = statusLabel(d.status);
  $("factStatus").textContent = st.text;
  $("factSource").textContent = d.sourceType;
  $("techRecord").textContent = d.id;
  $("techMethod").textContent = d.method;
  $("techIndexed").textContent = d.indexed;
  $("techPanel").classList.remove("open");
  $("techToggle").textContent = "Show technical details";
  $("overlay").classList.add("open");
}

/* ============================================================
   FILE UPLOAD PIPELINE (Browse + Upload)
   ============================================================ */
function extFor(file){
  const name = file.name.toLowerCase();
  if(name.endsWith(".pdf")) return {type:"pdf", typeLabel:"PDF", method:"OCR + table extraction"};
  if(name.endsWith(".xls") || name.endsWith(".xlsx") || name.endsWith(".csv")) return {type:"excel", typeLabel:"Excel", method:"Structured cell parsing"};
  if(name.endsWith(".doc") || name.endsWith(".docx")) return {type:"pdf", typeLabel:"Word", method:"Document text extraction"};
  if(name.match(/\.(png|jpe?g|tiff?)$/)) return {type:"scan", typeLabel:"Image (OCR)", method:"OCR, scanned image"};
  return {type:"pdf", typeLabel:"Document", method:"Text extraction"};
}

function renderSelectedFiles(){
  const wrap = $("selectedFiles");
  if(pendingFiles.length === 0){
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  wrap.textContent = "Selected: " + pendingFiles.map(f => f.name).join(", ");
}

function setStep(stepEl, state, text){
  stepEl.classList.remove("active", "done");
  if(state) stepEl.classList.add(state);
  stepEl.querySelector(".step-state").textContent = text;
}

function addDocumentFromFile(file){
  const meta = extFor(file);
  const id = "UPL-" + Date.now().toString().slice(-6) + Math.floor(Math.random()*90+10);
  const doc = {
    id,
    title: file.name.replace(/\.[^.]+$/, ""),
    sub: (session && session.org) ? "Uploaded via " + session.org : "Uploaded just now",
    type: meta.type,
    typeLabel: meta.typeLabel,
    loc: "Newly indexed",
    date: new Date().getFullYear().toString(),
    status: "review",
    confidence: (88 + Math.random()*10).toFixed(1) + "%",
    sourceType: "User-uploaded document",
    method: meta.method,
    indexed: "Just now",
    text: "This document was just uploaded to the prototype and is queued for full-text indexing. It currently matches searches on its file name."
  };
  documents.unshift(doc);
  indexedCount++;
  $("docCount").textContent = indexedCount.toLocaleString("en-IN");
  renderRepo();
  renderResults();
  notifications.unshift({icon:"📄", text: file.name + " uploaded and indexed successfully.", time:"Just now", unread:true});
  renderNotifications();
}

function runUploadPipeline(files){
  $("pipelineCard").hidden = false;
  const s1 = $("step1"), s2 = $("step2"), s3 = $("step3"), s4 = $("step4");
  let i = 0;

  function processNext(){
    if(i >= files.length){
      showToast(files.length + " document" + (files.length === 1 ? "" : "s") + " indexed successfully.");
      return;
    }
    const file = files[i];
    $("pipelineFileName").textContent = "Processing " + file.name;
    $("pipelineJob").textContent = "Uploading…";
    setStep(s1, "active", "Uploading");
    setStep(s2, null, "Queued");
    setStep(s3, null, "Queued");
    setStep(s4, null, "Pending");

    setTimeout(() => {
      setStep(s1, "done", "Complete");
      setStep(s2, "active", "0%");
      $("pipelineJob").textContent = "Extracting text & tables…";
      let pct = 0;
      const iv = setInterval(() => {
        pct += 25;
        if(pct >= 100){
          clearInterval(iv);
          setStep(s2, "done", "Complete");
          setStep(s3, "active", "Structuring…");
          setTimeout(() => {
            setStep(s3, "done", "Complete");
            setStep(s4, "done", "Ready");
            $("pipelineJob").textContent = "Ready to search";
            addDocumentFromFile(file);
            i++;
            setTimeout(processNext, 500);
          }, 650);
        } else {
          setStep(s2, "active", pct + "%");
        }
      }, 220);
    }, 400);
  }
  processNext();
}

/* ============================================================
   WIRING
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {

  // Auth tabs
  $("tabLogin").onclick = () => setAuthTab("login");
  $("tabSignup").onclick = () => setAuthTab("signup");
  $("loginForm").addEventListener("submit", handleLogin);
  $("signupForm").addEventListener("submit", handleSignup);
  $("googleBtn").onclick = handleGoogleAuth;
  $("demoBtn").onclick = handleDemoLogin;
  $("forgotLink").onclick = (e) => {
    e.preventDefault();
    showToast("Password reset isn't wired up in this prototype yet.");
  };
  document.querySelectorAll(".pwd-toggle").forEach(btn => {
    btn.onclick = () => {
      const input = $(btn.dataset.target);
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
    };
  });

  // Notifications
  $("bellBtn").onclick = (e) => {
    e.stopPropagation();
    $("notifDropdown").classList.toggle("open");
  };
  $("markAllRead").onclick = () => {
    notifications.forEach(n => n.unread = false);
    renderNotifications();
  };
  document.addEventListener("click", (e) => {
    if(!$("notifDropdown").contains(e.target) && e.target !== $("bellBtn")){
      $("notifDropdown").classList.remove("open");
    }
  });

  // Settings / account drawer
  $("avatarBtn").onclick = () => $("settingsOverlay").classList.add("open");
  $("settingsClose").onclick = () => $("settingsOverlay").classList.remove("open");
  $("settingsOverlay").addEventListener("click", (e) => {
    if(e.target.id === "settingsOverlay") $("settingsOverlay").classList.remove("open");
  });
  $("logoutBtn").onclick = handleLogout;
  $("langSelect").addEventListener("change", (e) => {
    showToast("Interface language set to " + e.target.value + ".");
  });

  // Module nav (Command Center / Mining Intelligence / Data Trust Center / Historical Intelligence / AI Report Studio)
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.onclick = () => setModule(btn.dataset.module);
  });
  $("comingSoonBack").onclick = () => setModule("docintel");

  // Upload — Browse opens the real file picker, Upload runs the pipeline on what's selected
  $("browseBtn").onclick = () => $("fileInput").click();
  $("fileInput").addEventListener("change", (e) => {
    pendingFiles = Array.from(e.target.files);
    renderSelectedFiles();
    if(pendingFiles.length){
      showToast(pendingFiles.length + " file" + (pendingFiles.length === 1 ? "" : "s") + " ready — click Upload documents to process.");
    }
  });
  $("uploadBtn").onclick = () => {
    if(pendingFiles.length === 0){
      showToast("Browse and select files first, then click Upload documents.");
      return;
    }
    const files = pendingFiles.slice();
    pendingFiles = [];
    renderSelectedFiles();
    $("fileInput").value = "";
    runUploadPipeline(files);
  };

  // Evidence drawer
  $("drawerClose").onclick = () => $("overlay").classList.remove("open");
  $("overlay").addEventListener("click", (e) => {
    if(e.target.id === "overlay") $("overlay").classList.remove("open");
  });
  $("techToggle").onclick = () => {
    const open = $("techPanel").classList.toggle("open");
    $("techToggle").textContent = open ? "Hide technical details" : "Show technical details";
  };
  $("handoffBtn").onclick = () => {
    if(!currentDrawer) return;
    const term = currentDrawer.term || currentDrawer.doc.title;
    $("overlay").classList.remove("open");
    setModule("mining");
    showToast('Opening "' + term + '" in Mining Intelligence, scoped to ' + currentDrawer.doc.title);
  };

  // Search
  $("searchInput").addEventListener("input", renderResults);
  $("filterRow").addEventListener("click", (e) => {
    if(e.target.dataset.filter){
      activeFilter = e.target.dataset.filter;
      document.querySelectorAll(".chip").forEach(c => c.classList.remove("on"));
      e.target.classList.add("on");
      renderResults();
    }
  });
});