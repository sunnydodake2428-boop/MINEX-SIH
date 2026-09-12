/* ==========================================================================
   MINEX app.js — vanilla JS, no build step.
   Drives: auth, app shell chrome (notifications/settings/language/read
   aloud), and all 5 modules. Everything reads from MINEX_DATA (data.js), so
   a figure shown in one module is the same record another module can
   verify. Translation strings come from i18n.js (I18N.t()).
   ========================================================================== */

(function(){

  /* ---------------------------- shared state ---------------------------- */
  const state = {
    user:null,
    currentModule:"command",
    conflictStatus:{}, // id -> 'a_verified' | 'b_verified' | 'needs_review'
    evidenceContext:null, // whatever record is open in the evidence drawer
    miningRecent:[],
    reportVersions:[],
    histChartInstance:null,
    reportChartInstance:null,
    activeTopicFilter:null,
    lastGeneratedReport:null
  };
  MINEX_DATA.conflicts.forEach(c => state.conflictStatus[c.id] = c.status);

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  function toast(msg){
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>t.classList.remove("show"), 2600);
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  function highlight(text, q){
    if(!q) return escapeHtml(text);
    const esc = escapeHtml(text);
    const words = q.split(/\s+/).filter(Boolean).map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    if(!words.length) return esc;
    const re = new RegExp("("+words.join("|")+")","ig");
    return esc.replace(re, "<mark>$1</mark>");
  }

  function statusLabel(s){
    return { verified:"Verified", review:"Needs review", flagged:"Flagged" }[s] || s;
  }

  /* ============================================================
     LANGUAGE (i18n)
     ============================================================ */
  function initLanguage(){
    $$("[data-set-lang]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        I18N.setLang(btn.dataset.setLang);
        $$("[data-set-lang]").forEach(b=>b.classList.toggle("on", b.dataset.setLang===I18N.getLang()));
        if($("#langSelect")) syncLangSelect();
        if($("#topbarLangLabel")) $("#topbarLangLabel").textContent = I18N.t("lang_"+I18N.getLang());
      });
    });
    if($("#langSelect")){
      syncLangSelect();
      $("#langSelect").addEventListener("change", e=>{
        I18N.setLang(e.target.value);
        $$("[data-set-lang]").forEach(b=>b.classList.toggle("on", b.dataset.setLang===I18N.getLang()));
      });
    }
    document.addEventListener("minex:langchange", ()=>{
      if($("#topbarLangLabel")) $("#topbarLangLabel").textContent = I18N.t("lang_"+I18N.getLang());
      // re-render whatever dynamic content is currently visible so it too
      // reflects updated static labels (buttons inside generated markup)
      rerenderCurrentModule();
    });
    I18N.apply();
    $$("[data-set-lang]").forEach(b=>b.classList.toggle("on", b.dataset.setLang===I18N.getLang()));
    if($("#topbarLangLabel")) $("#topbarLangLabel").textContent = I18N.t("lang_"+I18N.getLang());
  }

  function syncLangSelect(){
    const map = {en:"English", hi:"Hindi", mr:"Marathi"};
    const target = map[I18N.getLang()];
    Array.from($("#langSelect").options).forEach(o=>{ if(o.textContent===target) $("#langSelect").value = o.value; });
  }

  function rerenderCurrentModule(){
    const mod = state.currentModule;
    if(mod==="command") renderCommandCenter();
    if(mod==="docintel") { renderRepo(); runDocSearch(); renderTopics(); }
    if(mod==="trust") renderTrustCenter();
    if(mod==="historical") updateHistorical();
    if(mod==="report") renderVersions();
  }

  /* ============================================================
     READ ALOUD (browser SpeechSynthesis)
     ============================================================ */
  const readAloud = {
    supported: typeof window!=="undefined" && "speechSynthesis" in window,
    utter:null,
    playing:false
  };

  function initReadAloud(){
    if(!readAloud.supported){
      $("#readAloudBar")?.setAttribute("hidden","");
      return;
    }
    $("#raPlay").addEventListener("click", startReadAloud);
    $("#raPause").addEventListener("click", ()=>{ if(speechSynthesis.speaking) speechSynthesis.pause(); updateRaButtons("paused"); });
    $("#raResume").addEventListener("click", ()=>{ if(speechSynthesis.paused) speechSynthesis.resume(); updateRaButtons("playing"); });
    $("#raStop").addEventListener("click", ()=>{ speechSynthesis.cancel(); updateRaButtons("stopped"); });
  }

  function updateRaButtons(mode){
    $("#raPlay").hidden = mode==="playing";
    $("#raPause").hidden = mode!=="playing";
    $("#raResume").hidden = mode!=="paused";
    $("#raStop").hidden = mode==="stopped";
  }

  function collectReadableText(mod){
    // Pulls meaningful, already-rendered content for the visible module —
    // headings, KPI values, insight text, table rows, evidence — and
    // deliberately skips nav items, icon buttons and decorative chrome.
    const map = {
      command:"#moduleCommand", docintel:"#moduleDocIntel", mining:"#moduleMining",
      trust:"#moduleTrust", historical:"#moduleHistorical", report:"#moduleReport"
    };
    const root = document.querySelector(map[mod]);
    if(!root) return "";
    const parts = [];
    root.querySelectorAll("h2, .section-head p, .cc-card-title, .cc-card-desc, .cc-card-kpi, .answer-text, .answer-label, .key-figure b, .key-figure span, .drawer-snippet, .conflict-source b, .conflict-source .val, .hist-row .v, .stat-tile b, .stat-tile span, .result-title, .result-snippet, .doc-name").forEach(el=>{
      const txt = el.textContent.trim();
      if(txt) parts.push(txt);
    });
    return parts.join(". ");
  }

  function startReadAloud(){
    if(!readAloud.supported){ toast("Read aloud isn't supported in this browser."); return; }
    speechSynthesis.cancel();
    const text = collectReadableText(state.currentModule);
    if(!text){ toast("Nothing to read on this screen yet."); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = I18N.speechTag();
    const voices = speechSynthesis.getVoices();
    const match = voices.find(v=>v.lang && v.lang.toLowerCase().startsWith(u.lang.split("-")[0]));
    if(match) u.voice = match; // graceful fallback to default voice if no match
    u.onend = ()=>updateRaButtons("stopped");
    u.onerror = ()=>updateRaButtons("stopped");
    readAloud.utter = u;
    speechSynthesis.speak(u);
    updateRaButtons("playing");
  }

  /* ============================================================
     AUTH
     ============================================================ */
  function initAuth(){
    $("#tabLogin").addEventListener("click", ()=>switchAuthTab("login"));
    $("#tabSignup").addEventListener("click", ()=>switchAuthTab("signup"));

    $$(".pwd-toggle").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const target = document.getElementById(btn.dataset.target);
        const showing = target.type === "text";
        target.type = showing ? "password" : "text";
        btn.textContent = showing ? "Show" : "Hide";
      });
    });

    $("#loginForm").addEventListener("submit", e=>{
      e.preventDefault();
      const email = $("#loginEmail").value.trim();
      doAuth({ name: email.split("@")[0] || "User", email, org:"CMPDI", method:"Email & password" });
    });

    $("#signupForm").addEventListener("submit", e=>{
      e.preventDefault();
      const pw = $("#suPassword").value, cf = $("#suConfirm").value;
      if(pw !== cf){
        showAuthError("Passwords don't match.");
        return;
      }
      doAuth({ name: $("#suName").value.trim() || "User", email: $("#suEmail").value.trim(), org: $("#suOrg").value.trim() || "CMPDI", method:"Email & password" });
    });

    $("#googleBtn").addEventListener("click", ()=>{
      doAuth({ name:"Google User", email:"user@gmail.com", org:"CMPDI", method:"Google (simulated)" });
    });

    $("#demoBtn").addEventListener("click", ()=>{
      doAuth({ name:"Guest", email:"guest@minex.demo", org:"Demo Mode", method:"Guest / demo mode" });
    });
  }

  function switchAuthTab(tab){
    $("#tabLogin").classList.toggle("on", tab==="login");
    $("#tabSignup").classList.toggle("on", tab==="signup");
    $("#loginForm").hidden = tab !== "login";
    $("#signupForm").hidden = tab !== "signup";
    $("#authError").hidden = true;
  }

  function showAuthError(msg){
    const el = $("#authError");
    el.textContent = msg;
    el.hidden = false;
  }

  function doAuth(user){
    $("#authError").hidden = true;
    $("#authLoading").hidden = false;
    $("#authLoadingText").textContent = "Signing in…";
    $("#loginForm").hidden = true;
    $("#signupForm").hidden = true;
    setTimeout(()=>{
      state.user = user;
      $("#authScreen").hidden = true;
      $("#appShell").hidden = false;
      renderAccountChrome();
      switchModule("command");
      toast(`Welcome, ${user.name.split(" ")[0]}.`);
    }, 700);
  }

  function renderAccountChrome(){
    const initials = state.user.name.split(" ").map(p=>p[0]).join("").slice(0,2).toUpperCase();
    $("#avatarBtn").textContent = initials;
    $("#settingsAvatar").textContent = initials;
    $("#settingsName").textContent = state.user.name;
    $("#settingsEmail").textContent = state.user.email;
    $("#settingsRole").textContent = "Mining Data Analyst";
    $("#settingsOrg").textContent = state.user.org;
    $("#settingsEmpId").textContent = "EMP-" + Math.floor(10000 + Math.random()*89999);
    $("#settingsMethod").textContent = state.user.method;
  }

  /* ============================================================
     APP CHROME: notifications, settings, logout, nav
     ============================================================ */
  function initChrome(){
    renderNotifications();

    $("#bellBtn").addEventListener("click", e=>{
      e.stopPropagation();
      $("#notifDropdown").classList.toggle("open");
    });
    document.addEventListener("click", ()=>$("#notifDropdown").classList.remove("open"));
    $("#notifDropdown").addEventListener("click", e=>e.stopPropagation());

    $("#markAllRead").addEventListener("click", ()=>{
      MINEX_DATA.notifications.forEach(n=>n.unread=false);
      renderNotifications();
    });

    $("#avatarBtn").addEventListener("click", ()=>$("#settingsOverlay").classList.add("open"));
    $("#settingsClose").addEventListener("click", ()=>$("#settingsOverlay").classList.remove("open"));
    $("#settingsOverlay").addEventListener("click", e=>{ if(e.target.id==="settingsOverlay") $("#settingsOverlay").classList.remove("open"); });

    $("#logoutBtn").addEventListener("click", ()=>{
      $("#settingsOverlay").classList.remove("open");
      $("#appShell").hidden = true;
      $("#authScreen").hidden = false;
      state.user = null;
      toast("Signed out.");
    });

    $$(".nav-item").forEach(btn=>{
      btn.addEventListener("click", ()=>switchModule(btn.dataset.module));
    });

    $("#drawerClose").addEventListener("click", closeEvidenceDrawer);
    $("#overlay").addEventListener("click", e=>{ if(e.target.id==="overlay") closeEvidenceDrawer(); });
    $("#techToggle").addEventListener("click", ()=>{
      $("#techPanel").classList.toggle("open");
      $("#techToggle").textContent = $("#techPanel").classList.contains("open") ? "Hide technical details" : "Show technical details";
    });
    $("#drawerMarkVerified").addEventListener("click", ()=>resolveEvidenceStatus("verified"));
    $("#drawerMarkReview").addEventListener("click", ()=>resolveEvidenceStatus("review"));
    $("#drawerOpenSource").addEventListener("click", ()=>toast("Opening source document preview (prototype — full viewer not wired up yet)."));
    $("#handoffBtn").addEventListener("click", ()=>{
      const ctx = state.evidenceContext;
      closeEvidenceDrawer();
      switchModule("mining");
      if(ctx && ctx.suggestQuery){
        $("#miningQueryInput").value = ctx.suggestQuery;
        runMiningQuery(ctx.suggestQuery);
      }
    });
  }

  function renderNotifications(){
    const unread = MINEX_DATA.notifications.filter(n=>n.unread).length;
    $("#notifBadge").hidden = unread === 0;
    $("#notifBadge").textContent = unread;
    $("#notifList").innerHTML = MINEX_DATA.notifications.map(n => `
      <div class="notif-item ${n.unread?'unread':''}">
        <div class="notif-icon">${n.icon}</div>
        <div>
          <div class="notif-text">${n.text}</div>
          <div class="notif-time">${n.time}</div>
        </div>
      </div>`).join("") || `<div class="notif-empty">${I18N.t("no_notifications")}</div>`;
  }

  function switchModule(mod){
    state.currentModule = mod;
    if(readAloud.supported){ speechSynthesis.cancel(); updateRaButtons("stopped"); }
    $$(".nav-item").forEach(b=>b.classList.toggle("active", b.dataset.module===mod));
    const map = {
      command:"moduleCommand", docintel:"moduleDocIntel", mining:"moduleMining",
      trust:"moduleTrust", historical:"moduleHistorical", report:"moduleReport"
    };
    Object.values(map).forEach(id => { const el = document.getElementById(id); if(el) el.hidden = true; });
    document.getElementById(map[mod]).hidden = false;

    const labels = {
      command:I18N.t("nav_command"), docintel:I18N.t("nav_docintel"), mining:I18N.t("nav_mining"),
      trust:I18N.t("nav_trust"), historical:I18N.t("nav_historical"), report:I18N.t("nav_report")
    };
    $("#crumbModule").textContent = labels[mod];
    window.scrollTo({top:0, behavior:"smooth"});

    if(mod==="command") renderCommandCenter();
    if(mod==="docintel" && !$("#repoWrap").dataset.built) renderDocIntel();
    if(mod==="mining" && !$("#miningSuggested").dataset.built) renderMiningIntel();
    if(mod==="trust") renderTrustCenter();
    if(mod==="historical") renderHistorical();
    if(mod==="report") renderReportStudio();
  }

  /* ============================================================
     EVIDENCE DRAWER (shared by all modules)
     ============================================================ */
  function openEvidenceDrawer(ctx){
    // ctx: {title, sub, snippet, confidence, status, sourceType, recordId, method, indexed, suggestQuery}
    state.evidenceContext = ctx;
    $("#drawerTitle").textContent = ctx.title;
    $("#drawerSub").textContent = ctx.sub;
    $("#drawerSnippet").innerHTML = ctx.snippetHtml || escapeHtml(ctx.snippet||"");
    $("#factConfidence").textContent = ctx.confidence!=null ? ctx.confidence+"%" : "—";
    $("#factStatus").textContent = statusLabel(ctx.status||"review");
    $("#factSource").textContent = ctx.sourceType || "—";
    $("#techRecord").textContent = ctx.recordId || "—";
    $("#techMethod").textContent = ctx.method || "Text + table extraction (OCR fallback)";
    $("#techIndexed").textContent = ctx.indexed || "—";
    $("#techPanel").classList.remove("open");
    $("#techToggle").textContent = "Show technical details";
    $("#overlay").classList.add("open");
  }
  function closeEvidenceDrawer(){ $("#overlay").classList.remove("open"); }

  function resolveEvidenceStatus(newStatus){
    const ctx = state.evidenceContext;
    if(!ctx){ closeEvidenceDrawer(); return; }
    if(ctx.docId){
      const doc = MINEX_DATA.documents.find(d=>d.id===ctx.docId);
      if(doc) doc.status = newStatus;
    }
    toast(newStatus==="verified" ? "Marked verified." : "Flagged for human review.");
    closeEvidenceDrawer();
    if(state.currentModule==="docintel") renderRepo();
    if(state.currentModule==="trust") renderTrustCenter();
  }

  /* ============================================================
     COMMAND CENTER
     ============================================================ */
  function renderCommandCenter(){
    const h = MINEX_DATA.historical[MINEX_DATA.historical.length-1];
    const conflictCount = MINEX_DATA.conflicts.filter(c=>state.conflictStatus[c.id]==="unresolved").length;

    const cards = [
      { mod:"docintel", num:"01", title:"Document Intelligence", desc:"Search, extract and verify mining records across every uploaded document.",
        kpi: MINEX_DATA.documents.length, kpiLabel:"documents indexed" },
      { mod:"mining", num:"02", title:"Mining Intelligence", desc:"Ask a question in plain language and get an answer grounded in evidence.",
        kpi: h.production+" MT", kpiLabel:"latest production (2025)" },
      { mod:"trust", num:"03", title:"Data Trust Center", desc:"Every conflict MINEX finds, with both sources shown side by side.",
        kpi: conflictCount, kpiLabel:"unresolved conflicts", statusClass: conflictCount? "status flagged":"status verified", statusText: conflictCount? "Needs review":"All clear" },
      { mod:"historical", num:"04", title:"Historical Intelligence", desc:"A connected 2020–2025 dataset across production, safety and quality.",
        kpi:"6 yrs", kpiLabel:"of tracked history" },
      { mod:"report", num:"05", title:"AI Report Studio", desc:"Generate a sourced report from verified records, then version it.",
        kpi: state.reportVersions.length, kpiLabel:"saved versions" }
    ];

    $("#ccGrid").innerHTML = cards.map(c => `
      <button class="cc-card" data-goto="${c.mod}">
        <div class="cc-card-top">
          <div><div class="cc-card-num">${c.num}</div><div class="cc-card-title">${c.title}</div></div>
          ${c.statusText ? `<span class="cc-card-status ${c.statusClass}">${c.statusText}</span>` : ""}
        </div>
        <div class="cc-card-desc">${c.desc}</div>
        <div><div class="cc-card-kpi">${c.kpi}</div><div class="cc-card-kpi-label">${c.kpiLabel}</div></div>
      </button>`).join("");

    $$("#ccGrid [data-goto]").forEach(b=>b.addEventListener("click", ()=>switchModule(b.dataset.goto)));
    $("#docCount").textContent = MINEX_DATA.documents.reduce((s,d)=>s+d.records,0).toLocaleString();

    renderImpact();
  }

  function renderImpact(){
    const wrap = $("#impactGrid");
    if(!wrap) return;
    wrap.innerHTML = minexImpactBenchmarks().map(b => `
      <div class="stat-tile impact-tile" title="${escapeHtml(b.basis)}">
        <b>${escapeHtml(String(b.value))}</b>
        <span>${escapeHtml(b.label)}</span>
        <span class="impact-note ${b.note==='Benchmark pending'?'pending':''}">${escapeHtml(b.note)}</span>
      </div>`).join("");
  }

  /* ============================================================
     DOCUMENT INTELLIGENCE
     ============================================================ */
  function renderDocIntel(){
    $("#repoWrap").dataset.built = "1";

    $("#browseBtn").addEventListener("click", ()=>$("#fileInput").click());
    $("#fileInput").addEventListener("change", onFilesSelected);
    $("#uploadBtn").addEventListener("click", startIngestPipeline);

    $("#searchInput").addEventListener("input", runDocSearch);
    $$("#filterRow .chip").forEach(chip=>{
      chip.addEventListener("click", ()=>{
        $$("#filterRow .chip").forEach(c=>c.classList.remove("on"));
        chip.classList.add("on");
        runDocSearch();
      });
    });

    renderTopics();
    renderRepo();
    runDocSearch();
  }

  /* ---- Word cloud & topic identification (deterministic, from data.js) -- */
  function renderTopics(){
    const wrap = $("#topicsWrap");
    if(!wrap) return;
    const counts = minexTopicCounts();
    const max = Math.max(...counts.map(c=>c.count));
    const min = Math.min(...counts.map(c=>c.count));
    wrap.innerHTML = counts.map(c=>{
      const scale = max===min ? 1 : (c.count-min)/(max-min); // 0..1
      const size = 12.5 + scale*13; // px, 12.5–25.5
      const active = state.activeTopicFilter===c.topic ? "active" : "";
      return `<button class="wordcloud-tag ${active}" style="font-size:${size.toFixed(1)}px" data-topic="${escapeHtml(c.topic)}">${escapeHtml(c.topic)} <span class="wc-count">${c.count}</span></button>`;
    }).join("");
    $$("#topicsWrap [data-topic]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const topic = btn.dataset.topic;
        state.activeTopicFilter = state.activeTopicFilter===topic ? null : topic;
        renderTopics();
        runDocSearch();
      });
    });
  }

  function onFilesSelected(){
    const files = Array.from($("#fileInput").files);
    const box = $("#selectedFiles");
    if(!files.length){ box.hidden = true; return; }
    box.hidden = false;
    box.textContent = files.length===1 ? `Selected: ${files[0].name}` : `Selected ${files.length} files: ${files.map(f=>f.name).join(", ")}`;
  }

  function startIngestPipeline(){
    const files = Array.from($("#fileInput").files);
    const fileName = files.length ? files[0].name : "New_Mining_Record.pdf";
    if(files.length > 1) toast(`Queued ${files.length} files — processing ${fileName} first.`);

    const card = $("#pipelineCard");
    card.hidden = false;
    $("#pipelineFileName").textContent = "Processing " + fileName;
    const steps = [$("#step1"), $("#step2"), $("#step3"), $("#step4")];
    steps.forEach(s=>{ s.classList.remove("active","done"); s.querySelector(".step-state").textContent = "Pending"; });

    const labels = ["Uploading…","Extracting text & tables…","Structuring records…","Ready to search"];
    let i = 0;
    $("#pipelineJob").textContent = labels[0];

    function tick(){
      if(i>0){ steps[i-1].classList.remove("active"); steps[i-1].classList.add("done"); steps[i-1].querySelector(".step-state").textContent = "Complete"; }
      if(i < steps.length){
        steps[i].classList.add("active");
        steps[i].querySelector(".step-state").textContent = "Processing…";
        $("#pipelineJob").textContent = labels[i];
        i++;
        setTimeout(tick, 850);
      } else {
        $("#pipelineJob").textContent = "Ready to search";
        toast(`${fileName} processed — added to the repository (synthetic demo extraction).`);
        const newDoc = {
          id:"D-" + (2000 + MINEX_DATA.documents.length),
          name: fileName.replace(/\.[a-z0-9]+$/i,""), type: guessType(fileName),
          year: new Date().getFullYear(), mine:"CMPDI — Talcher", pages: 12 + Math.floor(Math.random()*40),
          records: 20 + Math.floor(Math.random()*80), topics:["Coal Production"], confidence: 85 + Math.floor(Math.random()*10),
          status:"review", uploadedDate: new Date().toISOString().slice(0,10)
        };
        MINEX_DATA.documents.push(newDoc);
        renderRepo();
        renderTopics();
        $("#fileInput").value = "";
        $("#selectedFiles").hidden = true;
      }
    }
    tick();
  }
  function guessType(name){
    const ext = (name.split(".").pop()||"").toLowerCase();
    if(["xls","xlsx","csv"].includes(ext)) return "excel";
    if(["png","jpg","jpeg","tif","tiff"].includes(ext)) return "scan";
    return "pdf";
  }

  function runDocSearch(){
    const q = $("#searchInput").value.trim().toLowerCase();
    const filter = $("#filterRow .chip.on")?.dataset.filter || "all";
    const topicFilter = state.activeTopicFilter;
    let matches = [];

    MINEX_DATA.documents.forEach(doc=>{
      if(filter !== "all" && doc.type !== filter) return;
      if(topicFilter && !doc.topics.includes(topicFilter)) return;
      const hay = (doc.name + " " + doc.topics.join(" ") + " " + doc.mine).toLowerCase();
      if(!q || hay.includes(q) || doc.topics.some(t=>t.toLowerCase().includes(q))){
        matches.push(doc);
      }
    });

    const topicNote = topicFilter ? ` — filtered by topic "${escapeHtml(topicFilter)}"` : "";
    $("#resultCount").innerHTML = q ? `<b>${matches.length}</b> result${matches.length!==1?'s':''} for "${escapeHtml($("#searchInput").value)}"${topicNote}` : `<b>${matches.length}</b> documents${topicNote}`;

    if(!matches.length){
      $("#resultsWrap").innerHTML = `<div class="empty-state">No matches. Try a different term, topic or format filter.</div>`;
      return;
    }

    $("#resultsWrap").innerHTML = matches.map(doc => {
      const snippet = `…${doc.mine} reports ${doc.topics[0].toLowerCase()} figures across ${doc.pages} pages, extracted at ${doc.confidence}% confidence…`;
      return `
      <div class="result">
        <div class="result-top">
          <div>
            <div class="result-title">${escapeHtml(doc.name)}</div>
            <div class="result-meta">${doc.mine} · ${doc.year} · ${doc.type.toUpperCase()}</div>
          </div>
          <div class="result-loc">Page ${1+Math.floor(Math.random()*doc.pages)}</div>
        </div>
        <div class="result-snippet">${highlight(snippet, q)}</div>
        <div class="result-matchcount">${doc.records} extracted records</div>
        <div class="result-bottom">
          <div class="result-confidence">Confidence: ${doc.confidence}%</div>
          <div class="result-actions">
            <button class="link-btn" data-view="${doc.id}">${I18N.t("view_evidence")}</button>
          </div>
        </div>
      </div>`;
    }).join("");

    $$("#resultsWrap [data-view]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const doc = MINEX_DATA.documents.find(d=>d.id===btn.dataset.view);
        openEvidenceDrawer({
          title: doc.name, sub: `${doc.mine} · ${doc.year}`,
          snippet: `${doc.mine} reports ${doc.topics[0].toLowerCase()} figures across ${doc.pages} pages of ${doc.name.toLowerCase()}.`,
          confidence: doc.confidence, status: doc.status, sourceType: doc.type.toUpperCase(),
          docId: doc.id, recordId: doc.id, indexed: doc.uploadedDate,
          suggestQuery: `Show reports related to ${doc.topics[0].toLowerCase()}.`
        });
      });
    });
  }

  function renderRepo(){
    $("#repoWrap").innerHTML = MINEX_DATA.documents.map(doc => `
      <div class="doc-row">
        <div class="doc-row-top">
          <div>
            <div class="doc-name">${escapeHtml(doc.name)}</div>
            <div class="doc-sub">${doc.mine} · ${doc.pages} pages · ${doc.records} records</div>
          </div>
          <div class="doc-date">${doc.uploadedDate}</div>
        </div>
        <div class="tag-row">
          <span class="tag status ${doc.status}">${statusLabel(doc.status)}</span>
          ${doc.topics.map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join("")}
        </div>
        <div class="doc-actions">
          <button class="link-btn" data-repo-evidence="${doc.id}">${I18N.t("view_evidence")}</button>
          <button class="link-btn result-secondary" data-repo-analyze="${doc.id}">${I18N.t("analyze_mining")}</button>
        </div>
      </div>`).join("");

    $$("#repoWrap [data-repo-evidence]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const doc = MINEX_DATA.documents.find(d=>d.id===btn.dataset.repoEvidence);
        openEvidenceDrawer({
          title: doc.name, sub:`${doc.mine} · ${doc.year}`,
          snippet:`${doc.records} structured records extracted from ${doc.pages} pages.`,
          confidence: doc.confidence, status: doc.status, sourceType: doc.type.toUpperCase(),
          docId: doc.id, recordId: doc.id, indexed: doc.uploadedDate,
          suggestQuery:`Show reports related to ${doc.topics[0].toLowerCase()}.`
        });
      });
    });
    $$("#repoWrap [data-repo-analyze]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const doc = MINEX_DATA.documents.find(d=>d.id===btn.dataset.repoAnalyze);
        switchModule("mining");
        const q = `Show reports related to ${doc.topics[0].toLowerCase()}.`;
        $("#miningQueryInput").value = q;
        runMiningQuery(q);
      });
    });
  }

  /* ============================================================
     MINING INTELLIGENCE — Ask MINEX
     ============================================================ */
  function renderMiningIntel(){
    $("#miningSuggested").dataset.built = "1";
    $("#miningSuggested").innerHTML = MINEX_DATA.suggestedQueries.map(q=>`<button class="chip" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join("");
    $$("#miningSuggested .chip").forEach(c=>c.addEventListener("click", ()=>{
      $("#miningQueryInput").value = c.dataset.q;
      runMiningQuery(c.dataset.q);
    }));

    $("#miningAskBtn").addEventListener("click", ()=>runMiningQuery($("#miningQueryInput").value));
    $("#miningQueryInput").addEventListener("keydown", e=>{ if(e.key==="Enter") runMiningQuery($("#miningQueryInput").value); });
    initVoiceQuery();
  }

  /* ---- Voice query: Web Speech API when available, honest fallback ----- */
  function initVoiceQuery(){
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR){
      $("#miningVoiceBtn").addEventListener("click", ()=>toast("Voice query needs browser speech recognition, which isn't available here — type your question instead."));
      return;
    }
    const recognition = new SR();
    recognition.lang = I18N.speechTag();
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    let listening = false;

    $("#miningVoiceBtn").addEventListener("click", ()=>{
      if(listening){ recognition.stop(); return; }
      try{
        recognition.lang = I18N.speechTag();
        recognition.start();
        listening = true;
        $("#miningVoiceBtn").classList.add("listening");
        toast("Listening…");
      }catch(e){
        toast("Voice query couldn't start — type your question instead.");
      }
    });
    recognition.onresult = e=>{
      const said = e.results[0][0].transcript;
      $("#miningQueryInput").value = said;
      runMiningQuery(said);
    };
    recognition.onerror = ()=>toast("Didn't catch that — try typing your question instead.");
    recognition.onend = ()=>{ listening=false; $("#miningVoiceBtn").classList.remove("listening"); };
  }

  function pushRecentQuery(q){
    state.miningRecent = [q, ...state.miningRecent.filter(x=>x!==q)].slice(0,5);
    $("#miningRecent").hidden = state.miningRecent.length===0;
    $("#miningRecentList").innerHTML = state.miningRecent.map(q=>`<button class="chip" data-rq="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join("");
    $$("#miningRecentList [data-rq]").forEach(c=>c.addEventListener("click", ()=>{ $("#miningQueryInput").value = c.dataset.rq; runMiningQuery(c.dataset.rq); }));
  }

  function runMiningQuery(rawQ){
    const q = (rawQ||"").trim();
    if(!q){ toast("Type a question first."); return; }
    pushRecentQuery(q);
    const lower = q.toLowerCase();
    const H = MINEX_DATA.historical;

    let payload;
    if(lower.includes("conflict")){
      payload = buildConflictAnswer();
    } else if(lower.includes("highest")){
      const top = H.reduce((a,b)=>b.production>a.production?b:a);
      payload = { answer:`Coal production reached its highest recorded value in ${top.year}, at ${top.production} MT.`,
        figures:[{label:top.year, value:top.production+" MT"}], chartMetric:"production",
        docYear: top.year, sources:[minexFindSourceDoc("production", top.year)], confidence:95 };
    } else if(lower.includes("target") && lower.includes("actual") || (lower.includes("target") && lower.includes("variance"))){
      const last = H[H.length-1];
      const diff = (last.production - last.target).toFixed(1);
      payload = { answer:`In ${last.year}, actual coal production was ${last.production} MT against a target of ${last.target} MT — a variance of ${diff>0?'+':''}${diff} MT.`,
        figures:[{label:"Actual", value:last.production+" MT"},{label:"Target", value:last.target+" MT"},{label:"Variance", value:(diff>0?'+':'')+diff+" MT"}],
        chartMetric:"target", docYear:last.year, sources:[minexFindSourceDoc("target", last.year)], confidence:92 };
    } else if(lower.includes("compare") || (lower.match(/\b(19|20)\d{2}\b/g)||[]).length>=2){
      const years = (lower.match(/\b(19|20)\d{2}\b/g)||[]).map(Number);
      const y1 = H.find(h=>h.year===years[0]) || H[0];
      const y2 = H.find(h=>h.year===years[1]) || H[H.length-1];
      const pct = (((y2.production-y1.production)/y1.production)*100).toFixed(1);
      payload = { answer:`Coal production moved from ${y1.production} MT in ${y1.year} to ${y2.production} MT in ${y2.year}, a change of ${pct}%.`,
        figures:[{label:y1.year, value:y1.production+" MT"},{label:y2.year, value:y2.production+" MT"},{label:"Change", value:pct+"%"}],
        chartMetric:"production", docYear:y2.year, sources:[minexFindSourceDoc("production", y1.year), minexFindSourceDoc("production", y2.year)], confidence:93 };
    } else if(lower.includes("seam")){
      const doc = MINEX_DATA.documents.find(d=>d.topics.includes("Seam Thickness"));
      payload = { answer:`One report in the repository discusses seam thickness in detail: ${doc.name} (${doc.mine}, ${doc.year}).`,
        figures:[], chartMetric:null, sources:[doc], confidence:doc.confidence, related:"seam thickness" };
    } else if(lower.includes("which documents") || lower.includes("which records") && lower.includes("mention")){
      const matches = MINEX_DATA.documents.filter(d=>d.topics.some(t=>t.toLowerCase().includes("coal production")||t.toLowerCase().includes("production")));
      payload = { answer: matches.length ? `${matches.length} document(s) mention coal production.` : `No documents in the current dataset mention coal production.`,
        figures:[], chartMetric:null, sources:matches, confidence: matches.length?90:40, needsReview: !matches.length };
    } else if(lower.includes("production") || lower.includes("2020") || lower.includes("2025") || lower.includes("trend")){
      payload = { answer:`Coal production rose from ${H[0].production} MT in ${H[0].year} to ${H[H.length-1].production} MT in ${H[H.length-1].year}, a ${(((H[H.length-1].production-H[0].production)/H[0].production)*100).toFixed(1)}% increase over the period.`,
        figures: H.map(h=>({label:h.year, value:h.production+" MT"})), chartMetric:"production",
        docYear:H[H.length-1].year, sources:[minexFindSourceDoc("production", H[H.length-1].year)], confidence:94 };
    } else {
      payload = { answer:`Information not found in the available records. Try one of the suggested questions, or rephrase using a metric name (production, target, overburden, dispatch, safety, quality).`,
        figures:[], chartMetric:null, sources:[], confidence:40, needsReview:true };
    }

    renderMiningAnswer(q, payload);
  }

  function buildConflictAnswer(){
    const c = MINEX_DATA.conflicts[0];
    return {
      answer:`MINEX found conflicting values for ${c.metric} in ${c.year}: ${c.sourceA.doc} reports ${c.sourceA.value} ${c.sourceA.unit}, while ${c.sourceB.doc} reports ${c.sourceB.value} ${c.sourceB.unit}.`,
      figures:[{label:c.sourceA.doc.split(" ")[0], value:c.sourceA.value+" "+c.sourceA.unit},{label:c.sourceB.doc.split(" ")[0], value:c.sourceB.value+" "+c.sourceB.unit}],
      chartMetric:"production", docYear:c.year,
      sources:[MINEX_DATA.documents.find(d=>d.id===c.sourceA.docId), MINEX_DATA.documents.find(d=>d.id===c.sourceB.docId)],
      confidence:60, isConflict:true, conflictId:c.id
    };
  }

  function renderMiningAnswer(q, p){
    const confClass = p.confidence>=85?"high":p.confidence>=65?"medium":"low";
    const chartId = "miAnswerChart" + Date.now();

    const html = `
      <div class="answer-card">
        <div class="answer-q">Asked: "${escapeHtml(q)}"</div>
        <div class="answer-section">
          <div class="answer-label">Answer</div>
          <div class="answer-text">${escapeHtml(p.answer)}</div>
          ${p.isConflict ? `<div class="needs-review-banner">⚠ Conflict detected — resolve in Data Trust Center before reporting this figure.</div>` : ""}
          ${p.needsReview ? `<div class="needs-review-banner">Needs review — insufficient evidence for a confident answer.</div>` : ""}
        </div>
        ${p.figures.length ? `
        <div class="answer-section">
          <div class="answer-label">Key figures</div>
          <div class="key-figures">${p.figures.map(f=>`<div class="key-figure"><b>${escapeHtml(String(f.value))}</b><span>${escapeHtml(String(f.label))}</span></div>`).join("")}</div>
        </div>`: ""}
        ${p.chartMetric ? `
        <div class="answer-section">
          <div class="answer-label">Trend</div>
          <div class="chart-card"><canvas id="${chartId}" height="160"></canvas></div>
        </div>` : ""}
        ${p.sources.length ? `
        <div class="answer-section">
          <div class="answer-label">Source documents &amp; evidence</div>
          ${p.sources.map(s=>`<div class="source-item"><span>${escapeHtml(s.name)} · ${s.mine}</span><button class="link-btn" data-mi-evidence="${s.id}">Open Evidence</button></div>`).join("")}
        </div>`:""}
        <div class="answer-section">
          <div class="answer-label">Confidence</div>
          <span class="confidence-pill ${confClass}">${p.confidence}% confidence</span>
        </div>
        ${p.isConflict ? `
        <div class="answer-section">
          <div class="answer-label">Related information</div>
          <button class="link-btn" data-goto-trust="1">Resolve this conflict in Data Trust Center →</button>
        </div>`:""}
      </div>`;

    $("#miningAnswerWrap").innerHTML = html + $("#miningAnswerWrap").innerHTML;

    if(p.chartMetric){
      const meta = MINEX_DATA.metricMeta[p.chartMetric];
      const H = MINEX_DATA.historical;
      new Chart(document.getElementById(chartId), {
        type:"line",
        data:{ labels:H.map(h=>h.year), datasets:[{ label:meta.label+" ("+meta.unit+")", data:H.map(h=>h[p.chartMetric]), borderColor:meta.color, backgroundColor:meta.color+"33", tension:0.3, fill:true }]},
        options:{ plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:false } } }
      });
    }

    $$("[data-mi-evidence]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const doc = MINEX_DATA.documents.find(d=>d.id===btn.dataset.miEvidence);
        openEvidenceDrawer({
          title: doc.name, sub:`${doc.mine} · ${doc.year}`,
          snippet:`Referenced by Mining Intelligence in answer to: "${q}"`,
          confidence: doc.confidence, status: doc.status, sourceType: doc.type.toUpperCase(),
          docId: doc.id, recordId: doc.id, indexed: doc.uploadedDate
        });
      });
    });
    $$("[data-goto-trust]").forEach(btn=>btn.addEventListener("click", ()=>switchModule("trust")));
  }

  /* ============================================================
     DATA TRUST CENTER
     ============================================================ */
  function renderTrustCenter(){
    const verified = MINEX_DATA.documents.filter(d=>d.status==="verified").length;
    const review = MINEX_DATA.documents.filter(d=>d.status==="review").length;
    const flagged = MINEX_DATA.documents.filter(d=>d.status==="flagged").length;
    const conflicts = MINEX_DATA.conflicts.filter(c=>state.conflictStatus[c.id]==="unresolved").length;
    const totalRecords = MINEX_DATA.documents.reduce((s,d)=>s+d.records,0);
    const validationCoverage = (((verified) / MINEX_DATA.documents.length) * 100).toFixed(0);

    $("#trustSummary").innerHTML = `
      <div class="stat-tile"><b>${totalRecords.toLocaleString()}</b><span>${I18N.t("records_checked")}</span></div>
      <div class="stat-tile ${conflicts?'flagged':'verified'}"><b>${MINEX_DATA.conflicts.length}</b><span>${I18N.t("conflicts_found")}</span></div>
      <div class="stat-tile verified"><b>${verified}</b><span>${I18N.t("records_verified")}</span></div>
      <div class="stat-tile review"><b>${review}</b><span>${I18N.t("needs_review_stat")}</span></div>
      <div class="stat-tile"><b>${validationCoverage}%</b><span>${I18N.t("validation_coverage")}</span></div>
      <div class="stat-tile flagged"><b>${flagged}</b><span>Flagged</span></div>`;

    $("#conflictsWrap").innerHTML = MINEX_DATA.conflicts.map(renderConflictCard).join("") || `<div class="empty-state">No conflicts detected.</div>`;
    wireConflictButtons();

    // simple data-quality checks derived from the dataset (duplicates / missing / unit checks)
    const checks = [
      { title:"Duplicate detection", detail: MINEX_DATA.documents.length>1 ? "No exact duplicate documents found." : "Not enough documents to compare.", ok:true },
      { title:"Missing values", detail: `${MINEX_DATA.documents.filter(d=>!d.topics.length).length} documents missing topic tags.`, ok: MINEX_DATA.documents.every(d=>d.topics.length) },
      { title:"Unit consistency", detail:"Production figures consistently reported in MT across sources.", ok:true },
      { title:"Low-confidence extractions", detail: `${MINEX_DATA.documents.filter(d=>d.confidence<90).length} document(s) below 90% extraction confidence.`, ok: MINEX_DATA.documents.every(d=>d.confidence>=90) }
    ];
    $("#qualityWrap").innerHTML = checks.map(c=>`
      <div class="stat-tile ${c.ok?'verified':'review'}">
        <b style="font-size:14px;">${c.ok?'✓':'!'}</b>
        <span style="display:block;font-weight:600;color:var(--ink);margin-bottom:4px;">${c.title}</span>
        <span>${c.detail}</span>
      </div>`).join("");
  }

  function renderConflictCard(c){
    const status = state.conflictStatus[c.id];
    const diff = (c.sourceB.value - c.sourceA.value).toFixed(1);
    let resolvedNote = "";
    if(status==="a_verified") resolvedNote = `<div class="conflict-resolved">✓ Resolved — ${c.sourceA.doc} marked as the verified source.</div>`;
    if(status==="b_verified") resolvedNote = `<div class="conflict-resolved">✓ Resolved — ${c.sourceB.doc} marked as the verified source.</div>`;
    if(status==="needs_review") resolvedNote = `<div class="conflict-resolved" style="background:var(--review-wash);color:var(--review);">↻ Sent for human review.</div>`;

    return `
    <div class="conflict-card" data-conflict="${c.id}">
      <div class="conflict-badge">Conflict detected</div>
      <div style="font-size:13.5px;font-weight:600;margin-bottom:6px;">${c.metric} — ${c.year}</div>
      <div class="conflict-sources">
        <div class="conflict-source">
          <b>Source A</b>
          <div class="val">${c.sourceA.value} ${c.sourceA.unit}</div>
          <div class="meta">${c.sourceA.doc} · Page ${c.sourceA.page} · ${c.sourceA.date}</div>
        </div>
        <div class="conflict-source">
          <b>Source B</b>
          <div class="val">${c.sourceB.value} ${c.sourceB.unit}</div>
          <div class="meta">${c.sourceB.doc} · Page ${c.sourceB.page} · ${c.sourceB.date}</div>
        </div>
      </div>
      <div class="conflict-diff">Difference: ${diff} ${c.sourceA.unit} (${((diff/c.sourceA.value)*100).toFixed(1)}%) · Confidence: 60%</div>
      ${resolvedNote}
      <div class="conflict-actions">
        <button class="btn" data-compare="${c.id}">${I18N.t("compare_sources")}</button>
        <button class="btn" data-open-source="${c.id}">${I18N.t("open_source")}</button>
      </div>
      ${!status || status==="unresolved" ? `
      <div class="conflict-actions">
        <button class="btn btn-verified" data-resolve="${c.id}" data-choice="a_verified">${I18N.t("mark_a_verified")}</button>
        <button class="btn btn-verified" data-resolve="${c.id}" data-choice="b_verified">${I18N.t("mark_b_verified")}</button>
        <button class="btn btn-review" data-resolve="${c.id}" data-choice="needs_review">${I18N.t("needs_human_review")}</button>
      </div>` : `<div class="conflict-actions"><button class="btn" data-resolve="${c.id}" data-choice="unresolved">Reopen</button></div>`}
      <div class="conflict-footer">MINEX identifies the conflict. Final verification remains with the authorized human expert.</div>
    </div>`;
  }

  function wireConflictButtons(){
    $$("[data-resolve]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        state.conflictStatus[btn.dataset.resolve] = btn.dataset.choice;
        const c = MINEX_DATA.conflicts.find(x=>x.id===btn.dataset.resolve);
        if(btn.dataset.choice==="a_verified") MINEX_DATA.documents.find(d=>d.id===c.sourceA.docId).status="verified";
        if(btn.dataset.choice==="b_verified") MINEX_DATA.documents.find(d=>d.id===c.sourceB.docId).status="verified";
        toast(btn.dataset.choice==="needs_review" ? "Sent for human review." : "Marked verified.");
        renderTrustCenter();
      });
    });
    $$("[data-compare]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const c = MINEX_DATA.conflicts.find(x=>x.id===btn.dataset.compare);
        const docA = MINEX_DATA.documents.find(d=>d.id===c.sourceA.docId);
        const docB = MINEX_DATA.documents.find(d=>d.id===c.sourceB.docId);
        const diff = (c.sourceB.value - c.sourceA.value).toFixed(1);
        openEvidenceDrawer({
          title:`${c.metric} — ${c.year} (side-by-side)`, sub:`Comparing ${c.sourceA.doc} vs ${c.sourceB.doc}`,
          snippetHtml:`<b>Source A</b> — ${escapeHtml(c.sourceA.doc)}, page ${c.sourceA.page}: ${c.sourceA.value} ${c.sourceA.unit}<br><br>`+
            `<b>Source B</b> — ${escapeHtml(c.sourceB.doc)}, page ${c.sourceB.page}: ${c.sourceB.value} ${c.sourceB.unit}<br><br>`+
            `Difference: ${diff} ${c.sourceA.unit} (${((diff/c.sourceA.value)*100).toFixed(1)}%). Neither source is auto-selected — a human expert decides.`,
          confidence:60, status: state.conflictStatus[c.id]==="unresolved" ? "review" : state.conflictStatus[c.id],
          sourceType:"Comparison", recordId:c.id, indexed: c.sourceB.date
        });
      });
    });
    $$("[data-open-source]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const c = MINEX_DATA.conflicts.find(x=>x.id===btn.dataset.openSource);
        toast(`Opening ${c.sourceA.doc} / ${c.sourceB.doc} preview (prototype — full viewer not wired up yet).`);
      });
    });
  }

  /* ============================================================
     HISTORICAL INTELLIGENCE
     ============================================================ */
  function renderHistorical(){
    const H = MINEX_DATA.historical;
    const yearOptions = H.map(h=>`<option value="${h.year}">${h.year}</option>`).join("");
    if(!$("#histFrom").dataset.built){
      $("#histFrom").dataset.built = "1";
      $("#histFrom").innerHTML = yearOptions;
      $("#histTo").innerHTML = yearOptions;
      $("#histFrom").value = H[0].year;
      $("#histTo").value = H[H.length-1].year;
      $("#histMetric").addEventListener("change", updateHistorical);
      $("#histFrom").addEventListener("change", updateHistorical);
      $("#histTo").addEventListener("change", updateHistorical);
    }
    updateHistorical();
  }

  function updateHistorical(){
    const metric = $("#histMetric").value;
    let from = parseInt($("#histFrom").value), to = parseInt($("#histTo").value);
    if(from > to){ [from, to] = [to, from]; }
    const meta = MINEX_DATA.metricMeta[metric];
    const rows = MINEX_DATA.historical.filter(h => h.year>=from && h.year<=to);

    const values = rows.map(r=>r[metric]);
    const highest = rows.reduce((a,b)=>b[metric]>a[metric]?b:a);
    const lowest = rows.reduce((a,b)=>b[metric]<a[metric]?b:a);
    const avg = (values.reduce((s,v)=>s+v,0)/values.length).toFixed(1);
    const pctChange = rows.length>1 ? (((rows[rows.length-1][metric]-rows[0][metric])/rows[0][metric])*100).toFixed(1) : "0.0";
    const trendUp = rows.length>1 && rows[rows.length-1][metric] >= rows[0][metric];

    $("#histKpis").innerHTML = `
      <div class="stat-tile"><b>${highest[metric]} ${meta.unit}</b><span>Highest (${highest.year})</span></div>
      <div class="stat-tile"><b>${lowest[metric]} ${meta.unit}</b><span>Lowest (${lowest.year})</span></div>
      <div class="stat-tile"><b>${avg} ${meta.unit}</b><span>Average</span></div>
      <div class="stat-tile ${trendUp?'verified':'flagged'}"><b>${pctChange>=0?'+':''}${pctChange}%</b><span>Change, ${from}–${to}</span></div>`;

    const ctx = document.getElementById("histChart");
    if(state.histChartInstance) state.histChartInstance.destroy();
    state.histChartInstance = new Chart(ctx, {
      type:"line",
      data:{ labels: rows.map(r=>r.year),
        datasets: metric==="production" ? [
          { label:`${meta.label} (${meta.unit})`, data: rows.map(r=>r.production), borderColor: meta.color, backgroundColor: meta.color+"33", tension:0.3, fill:true },
          { label:`Target (${meta.unit})`, data: rows.map(r=>r.target), borderColor:"#A8781E", borderDash:[6,4], tension:0.3, fill:false }
        ] : [{ label:`${meta.label} (${meta.unit})`, data: rows.map(r=>r[metric]), borderColor: meta.color, backgroundColor: meta.color+"33", tension:0.3, fill:true }]
      },
      options:{ plugins:{legend:{display: metric==="production"}}, scales:{ y:{ beginAtZero:false } } }
    });

    const dir = trendUp ? "increased" : "decreased";
    let insight = `${meta.label} ${dir} by ${Math.abs(pctChange)}% between ${from} and ${to}. ${meta.label} reached its highest value in ${highest.year}`;
    if(metric==="production"){
      const last = rows[rows.length-1];
      insight += last.production < last.target ? `, while actual production in ${last.year} remained below the ${last.target} ${meta.unit} target.` : `, meeting or exceeding the ${last.year} target of ${last.target} ${meta.unit}.`;
    } else {
      insight += ".";
    }
    $("#histInsight").textContent = insight;

    $("#histTable").innerHTML = rows.map(r=>{
      const doc = minexFindSourceDoc(metric, r.year);
      return `<div class="hist-row">
        <div class="yr">${r.year}</div>
        <div class="v">${r[metric]} ${meta.unit}</div>
        <div class="src"><button class="link-btn" data-hist-src="${doc.id}" data-hist-year="${r.year}">${doc.name}</button> · ${statusLabel(doc.status)}</div>
      </div>`;
    }).join("");

    $$("[data-hist-src]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const doc = MINEX_DATA.documents.find(d=>d.id===btn.dataset.histSrc);
        openEvidenceDrawer({
          title: doc.name, sub:`${doc.mine} · ${btn.dataset.histYear}`,
          snippet:`Source for ${meta.label} in ${btn.dataset.histYear}, used in Historical Intelligence.`,
          confidence: doc.confidence, status: doc.status, sourceType: doc.type.toUpperCase(),
          docId: doc.id, recordId: doc.id, indexed: doc.uploadedDate
        });
      });
    });
  }

  /* ============================================================
     AI REPORT STUDIO
     ============================================================ */
  function renderReportStudio(){
    if(!$("#reportYears").dataset.built){
      $("#reportYears").dataset.built = "1";
      $("#reportYears").innerHTML = MINEX_DATA.historical.map(h=>`<label class="checkbox-row"><input type="checkbox" value="${h.year}" class="rpt-year" checked> ${h.year}</label>`).join("");
      $("#reportMetrics").innerHTML = Object.entries(MINEX_DATA.metricMeta).map(([k,m])=>`<label class="checkbox-row"><input type="checkbox" value="${k}" class="rpt-metric" ${k==='production'||k==='target'?'checked':''}> ${m.label}</label>`).join("");
      $("#generateReportBtn").addEventListener("click", generateReport);
    }
  }

  function generateReport(){
    const years = $$(".rpt-year:checked").map(c=>parseInt(c.value)).sort();
    const metrics = $$(".rpt-metric:checked").map(c=>c.value);
    const includeConflicts = $("#reportIncludeConflicts").checked;
    const includeSources = $("#reportIncludeSources").checked;

    if(!years.length || !metrics.length){ toast("Select at least one year and one metric."); return; }

    const rows = MINEX_DATA.historical.filter(h=>years.includes(h.year));
    const first = rows[0], last = rows[rows.length-1];
    const pctChange = (((last.production-first.production)/first.production)*100).toFixed(1);
    const conflict = MINEX_DATA.conflicts.find(c=>years.includes(c.year));

    state.lastGeneratedReport = { years, metrics, includeConflicts, includeSources, rows, first, last, pctChange, conflict };

    const chartId = "reportChart" + Date.now();
    const html = `
      <div class="report-preview" id="reportPreview">
        <h3>MINEX Mining Intelligence Report</h3>
        <div class="rp-sub">Covering ${first.year}–${last.year} · Generated ${new Date().toLocaleString()} · ${I18N.t("synthetic_label")}</div>

        <h4>Executive summary</h4>
        <p style="font-size:13.5px;line-height:1.6;">Coal production ${pctChange>=0?'increased':'decreased'} by ${Math.abs(pctChange)}% between ${first.year} and ${last.year}, reaching ${last.production} MT against a ${last.target} MT target.${conflict?` One unresolved data conflict was identified for ${conflict.metric} in ${conflict.year} and is flagged below.`:''}</p>

        <h4>Key metrics</h4>
        <table>
          <tr><th>Year</th>${metrics.map(m=>`<th>${MINEX_DATA.metricMeta[m].label}</th>`).join("")}</tr>
          ${rows.map(r=>`<tr><td>${r.year}</td>${metrics.map(m=>`<td>${r[m]} ${MINEX_DATA.metricMeta[m].unit}</td>`).join("")}</tr>`).join("")}
        </table>

        <h4>Trend chart</h4>
        <div class="chart-card"><canvas id="${chartId}" height="160"></canvas></div>

        <h4>Key findings</h4>
        <p style="font-size:13.5px;">Highest production year: ${rows.reduce((a,b)=>b.production>a.production?b:a).year}. Average safety compliance: ${(rows.reduce((s,r)=>s+r.safety,0)/rows.length).toFixed(1)}%.</p>

        ${includeConflicts ? `<h4>Data conflicts</h4><p style="font-size:13.5px;">${conflict ? `${conflict.metric} (${conflict.year}): ${conflict.sourceA.doc} reports ${conflict.sourceA.value} ${conflict.sourceA.unit} vs. ${conflict.sourceB.doc} at ${conflict.sourceB.value} ${conflict.sourceB.unit}. Status: ${state.conflictStatus[conflict.id]==='unresolved' ? 'Unresolved — pending human review.' : 'Resolved.'}` : 'No conflicts detected in the selected range.'}</p>` : ""}

        ${includeSources ? `<h4>Source references</h4><p style="font-size:13.5px;">${years.map(y=>minexFindSourceDoc(metrics[0],y).name+" ("+y+")").join(", ")}</p>` : ""}

        <div class="report-preview-actions">
          <button class="btn" id="regenBtn">${I18N.t("regenerate")}</button>
          <button class="btn btn-primary" id="saveVersionBtn">${I18N.t("save_version")}</button>
          <button class="btn" id="downloadPdfBtn">${I18N.t("download_pdf")}</button>
        </div>
      </div>`;
    $("#reportPreviewWrap").innerHTML = html;

    new Chart(document.getElementById(chartId), {
      type:"line",
      data:{ labels: rows.map(r=>r.year),
        datasets: metrics.map(m=>({ label:MINEX_DATA.metricMeta[m].label+" ("+MINEX_DATA.metricMeta[m].unit+")", data: rows.map(r=>r[m]), borderColor: MINEX_DATA.metricMeta[m].color, backgroundColor: MINEX_DATA.metricMeta[m].color+"22", tension:0.3, fill:false }))
      },
      options:{ plugins:{legend:{display:true}}, scales:{ y:{ beginAtZero:false } } }
    });

    $("#regenBtn").addEventListener("click", generateReport);
    $("#downloadPdfBtn").addEventListener("click", downloadReportPdf);
    $("#saveVersionBtn").addEventListener("click", ()=>{
      state.reportVersions.push({
        n: state.reportVersions.length+1, years:[first.year,last.year], metrics:[...metrics],
        includeConflicts, created: new Date().toLocaleString(), by: state.user?.name || "User"
      });
      renderVersions();
      toast("Version saved.");
    });
  }

  /* ---- Real, working PDF export via html2canvas + jsPDF (CDN) ---------- */
  function downloadReportPdf(){
    const node = document.getElementById("reportPreview");
    if(!node){ toast("Generate a report first."); return; }
    if(!window.html2canvas || !window.jspdf){
      toast("PDF export libraries didn't load — check your internet connection and try again.");
      return;
    }
    toast("Preparing PDF…");
    window.html2canvas(node, { backgroundColor:"#FFFFFF", scale:2 }).then(canvas=>{
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit:"pt", format:"a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW - 40;
      const imgH = (canvas.height * imgW) / canvas.width;
      const img = canvas.toDataURL("image/png");

      let heightLeft = imgH;
      let position = 20;
      pdf.addImage(img, "PNG", 20, position, imgW, imgH);
      heightLeft -= (pageH - 40);
      while(heightLeft > 0){
        pdf.addPage();
        position = heightLeft - imgH + 20;
        pdf.addImage(img, "PNG", 20, position, imgW, imgH);
        heightLeft -= (pageH - 40);
      }
      const r = state.lastGeneratedReport;
      const filename = `MINEX_Report_${r.first.year}_${r.last.year}.pdf`;
      pdf.save(filename);
      toast(`${filename} downloaded.`);
    }).catch(()=>toast("PDF export failed — try again."));
  }

  function renderVersions(){
    if(!state.reportVersions.length){
      $("#reportVersionsWrap").innerHTML = `<div class="empty-state">No versions saved yet. Generate a report and save a version.</div>`;
      return;
    }
    $("#reportVersionsWrap").innerHTML = state.reportVersions.slice().reverse().map((v,idx)=>{
      const prev = state.reportVersions[state.reportVersions.length-2-idx];
      let diff = "Initial version.";
      if(prev){
        const parts = [];
        if(prev.years[0]!==v.years[0] || prev.years[1]!==v.years[1]) parts.push(`year range changed to ${v.years[0]}–${v.years[1]}`);
        if(JSON.stringify(prev.metrics)!==JSON.stringify(v.metrics)) parts.push(`metrics changed to ${v.metrics.join(", ")}`);
        if(prev.includeConflicts!==v.includeConflicts) parts.push(`conflicts section ${v.includeConflicts?'added':'removed'}`);
        diff = parts.length ? "Changed: " + parts.join("; ") + "." : "No structural changes from previous version.";
      }
      return `<div class="version-item">
        <div><b>Version ${v.n}</b><div class="vmeta">${v.created} · by ${v.by} · ${diff}</div></div>
        <button class="link-btn" data-view-version="${v.n}">View</button>
      </div>`;
    }).join("");
    $$("[data-view-version]").forEach(btn=>btn.addEventListener("click", ()=>toast(`Version ${btn.dataset.viewVersion} preview would open here in a full build.`)));
  }

  /* ============================================================
     BOOT
     ============================================================ */
  document.addEventListener("DOMContentLoaded", ()=>{
    initLanguage();
    initAuth();
    initChrome();
    initReadAloud();
  });

})();