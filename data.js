/* ==========================================================================
   MINEX centralized demo dataset.
   Every module (Document Intelligence, Mining Intelligence, Data Trust
   Center, Historical Intelligence, AI Report Studio) reads from this single
   object so a number in one module traces back to the same record another
   module can verify. All figures are SYNTHETIC DEMO DATA.
   ========================================================================== */

const MINEX_DATA = {

  /* ---------------- Documents (Document Intelligence repository) -------- */
  documents: [
    { id:"D-1001", name:"Annual Production Statement 2024", type:"pdf", year:2024, mine:"CMPDI — Talcher", pages:48, records:212, topics:["Coal Production","Dispatch","Production Target"], confidence:96, status:"verified", uploadedDate:"2024-11-02" },
    { id:"D-1002", name:"Production Summary 2024", type:"excel", year:2024, mine:"CMPDI — Talcher", pages:9, records:64, topics:["Coal Production","Dispatch"], confidence:91, status:"review", uploadedDate:"2024-11-10" },
    { id:"D-1003", name:"Geological Report 2023", type:"pdf", year:2023, mine:"BCCL — Jharia", pages:112, records:340, topics:["Geology","Seam Thickness","Overburden"], confidence:94, status:"verified", uploadedDate:"2023-08-14" },
    { id:"D-1004", name:"Mine Plan 2022", type:"pdf", year:2022, mine:"MCL — Talcher", pages:76, records:180, topics:["Mining Plan","Overburden","Production Target"], confidence:89, status:"verified", uploadedDate:"2022-05-20" },
    { id:"D-1005", name:"Production Summary 2021", type:"excel", year:2021, mine:"MCL — Talcher", pages:6, records:48, topics:["Coal Production","Dispatch"], confidence:93, status:"verified", uploadedDate:"2021-12-01" },
    { id:"D-1006", name:"Hydrogeological Report 2024", type:"pdf", year:2024, mine:"BCCL — Jharia", pages:58, records:97, topics:["Groundwater","Geology"], confidence:88, status:"review", uploadedDate:"2024-06-18" },
    { id:"D-1007", name:"Safety Compliance Report 2023", type:"scan", year:2023, mine:"CMPDI — Talcher", pages:34, records:120, topics:["Safety","Compliance"], confidence:82, status:"verified", uploadedDate:"2023-10-05" },
    { id:"D-1008", name:"Coal Quality Report 2024", type:"excel", year:2024, mine:"CMPDI — Talcher", pages:14, records:88, topics:["Coal Quality","Coal Grade"], confidence:95, status:"verified", uploadedDate:"2024-09-01" },
    { id:"D-1009", name:"Project Report 2022", type:"pdf", year:2022, mine:"MCL — Talcher", pages:64, records:150, topics:["Mining Plan","Production Target"], confidence:90, status:"flagged", uploadedDate:"2022-03-11" }
  ],

  /* ---------------- Historical time series (2020-2025) ------------------ */
  /* production/target/overburden/dispatch in the stated units; safety and
     quality are percentages. */
  historical: [
    { year:2020, production:42.8, target:45.0, overburden:91.2, dispatch:41.6, safety:94.2, quality:78.4 },
    { year:2021, production:45.3, target:46.0, overburden:95.7, dispatch:44.1, safety:95.1, quality:79.1 },
    { year:2022, production:47.1, target:48.0, overburden:99.4, dispatch:46.3, safety:96.0, quality:80.0 },
    { year:2023, production:49.8, target:50.0, overburden:104.8, dispatch:48.9, safety:96.8, quality:80.9 },
    { year:2024, production:52.4, target:52.0, overburden:109.7, dispatch:51.6, safety:97.6, quality:81.6 },
    { year:2025, production:54.1, target:55.0, overburden:112.3, dispatch:53.2, safety:98.1, quality:82.3 }
  ],

  metricMeta: {
    production:  { label:"Coal Production",      unit:"MT",   color:"#9C5B22" },
    target:      { label:"Production Target",    unit:"MT",   color:"#A8781E" },
    overburden:  { label:"Overburden Removal",    unit:"MCuM", color:"#6B5D4B" },
    dispatch:    { label:"Dispatch",              unit:"MT",   color:"#3F6E4E" },
    safety:      { label:"Safety Compliance",     unit:"%",    color:"#3F6E4E" },
    quality:     { label:"Coal Grade / Quality",  unit:"%",    color:"#A5372B" }
  },

  /* ---------------- Conflicts (Data Trust Center) ------------------------ */
  conflicts: [
    {
      id:"C-01",
      metric:"Coal Production",
      year:2024,
      sourceA:{ doc:"Annual Production Statement 2024", docId:"D-1001", page:18, value:52.4, unit:"MT", date:"2024-11-02" },
      sourceB:{ doc:"Production Summary 2024",           docId:"D-1002", page:7,  value:54.1, unit:"MT", date:"2024-11-10" },
      status:"unresolved" /* unresolved | a_verified | b_verified | needs_review */
    }
  ],

  /* ---------------- Ask MINEX: canned queries the demo highlights -------- */
  suggestedQueries: [
    "What was coal production from 2020 to 2025?",
    "Which year had the highest production?",
    "Compare production between 2022 and 2025.",
    "What was the production target versus actual production?",
    "Show reports related to seam thickness.",
    "Which records contain conflicting production values?"
  ],

  notifications: [
    { icon:"⚠️", text:"Conflict detected: Coal Production 2024 differs between two sources.", time:"2h ago", unread:true },
    { icon:"📄", text:"Hydrogeological Report 2024 finished processing — 97 records extracted.", time:"5h ago", unread:true },
    { icon:"✅", text:"Safety Compliance Report 2023 marked verified.", time:"1d ago", unread:false },
    { icon:"📊", text:"Historical Intelligence updated with 2025 figures.", time:"2d ago", unread:false }
  ]
};

/* Helper: find the document record a metric/year most plausibly traces to,
   so Historical Intelligence and Mining Intelligence can point at real
   Document Intelligence entries instead of inventing citations. */
function minexFindSourceDoc(metricKey, year){
  const topicByMetric = {
    production:"Coal Production", target:"Production Target", overburden:"Overburden",
    dispatch:"Dispatch", safety:"Safety", quality:"Coal Quality"
  };
  const topic = topicByMetric[metricKey];
  const candidates = MINEX_DATA.documents.filter(d => d.year === year && d.topics.some(t => t.includes(topic) || topic.includes(t)));
  return candidates[0] || MINEX_DATA.documents.find(d => d.year === year) || MINEX_DATA.documents[0];
}

/* ==========================================================================
   Deterministic derived data — word cloud / topic counts and MINEX Impact
   benchmarks. Nothing here is random; every number is computed once from
   MINEX_DATA.documents / MINEX_DATA.historical above, so it changes only
   when the underlying dataset changes (e.g. a new document is ingested).
   ========================================================================== */

function minexTopicCounts(){
  const counts = {};
  MINEX_DATA.documents.forEach(doc=>{
    doc.topics.forEach(t=>{ counts[t] = (counts[t]||0) + 1; });
  });
  return Object.entries(counts)
    .map(([topic,count])=>({topic,count}))
    .sort((a,b)=>b.count-a.count);
}

/* Prototype benchmarks for the Command Center "MINEX Impact" section.
   Each is either a real calculation over the dataset (labelled Prototype
   Benchmark) or explicitly marked "Benchmark pending" when there is no
   dataset-backed way to measure it in this prototype — never invented. */
function minexImpactBenchmarks(){
  const docs = MINEX_DATA.documents;
  const avgConfidence = (docs.reduce((s,d)=>s+d.confidence,0)/docs.length).toFixed(1);
  const verifiedShare = ((docs.filter(d=>d.status==="verified").length/docs.length)*100).toFixed(0);
  const totalRecords = docs.reduce((s,d)=>s+d.records,0);
  const conflictsResolvable = MINEX_DATA.conflicts.length;
  return [
    { label:"Average extraction confidence", value:avgConfidence+"%", note:"Prototype Benchmark", basis:"Mean of extraction confidence across all "+docs.length+" indexed documents." },
    { label:"Verified document coverage", value:verifiedShare+"%", note:"Prototype Benchmark", basis:"Share of documents currently marked Verified in the repository." },
    { label:"Records made searchable", value:totalRecords.toLocaleString(), note:"Prototype Benchmark", basis:"Sum of structured records extracted across all documents." },
    { label:"Conflicts surfaced for review", value:conflictsResolvable, note:"Prototype Benchmark", basis:"Cross-source figures MINEX flagged instead of silently picking one." },
    { label:"Report preparation time saved", value:"—", note:"Benchmark pending", basis:"Requires a measured baseline against manual report preparation, not yet available in this prototype." },
    { label:"Query response time", value:"—", note:"Benchmark pending", basis:"Requires production-scale timing data, not available from this static demo dataset." }
  ];
}