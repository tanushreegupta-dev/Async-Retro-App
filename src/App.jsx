import { useState, useEffect, useCallback, useRef } from "react";

// ── Supabase config ──
const SUPABASE_URL = "https://etserxilunoxlwphblaf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0c2VyeGlsdW5veGx3cGhibGFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MzY3MjksImV4cCI6MjA5MDIxMjcyOX0.dpOe9SxhdElxcf_Ps7KhFLkHrQPJmomaGC-48pCJhAM";
const DB = `${SUPABASE_URL}/rest/v1`;
const HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Prefer": "return=representation",
};

// ── Supabase helpers ──
async function dbGetAdmins() {
  try {
    const r = await fetch(`${DB}/admins?select=*`, { headers: HEADERS });
    const data = await r.json();
    return Array.isArray(data) ? data.map(a => ({ username: a.username, password: a.password, displayName: a.display_name, createdAt: a.created_at })) : [];
  } catch(e) { return []; }
}

async function dbSaveAdmin(admin) {
  try {
    await fetch(`${DB}/admins`, {
      method: "POST",
      headers: { ...HEADERS, "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ username: admin.username, password: admin.password, display_name: admin.displayName, created_at: admin.createdAt }),
    });
  } catch(e) {}
}

async function dbDeleteAdmin(username) {
  try {
    await fetch(`${DB}/admins?username=eq.${username}`, { method: "DELETE", headers: HEADERS });
  } catch(e) {}
}

async function dbGetBoards() {
  try {
    const r = await fetch(`${DB}/boards?select=*`, { headers: HEADERS });
    const data = await r.json();
    return Array.isArray(data) ? data.map(b => ({ ...b.data, id: b.id, ownedBy: b.owned_by, ownedByName: b.owned_by_name, createdAt: b.created_at })) : [];
  } catch(e) { return []; }
}

async function dbSaveBoard(board) {
  try {
    await fetch(`${DB}/boards`, {
      method: "POST",
      headers: { ...HEADERS, "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ id: board.id, owned_by: board.ownedBy, owned_by_name: board.ownedByName, created_at: board.createdAt, data: board }),
    });
  } catch(e) {}
}

async function dbDeleteBoard(id) {
  try {
    await fetch(`${DB}/boards?id=eq.${id}`, { method: "DELETE", headers: HEADERS });
  } catch(e) {}
}

const PHASES = ["setup","context","shoutouts","timeline","collect","discuss","actions"];
const PHASE_LABELS = { setup:"Setup", context:"Context", shoutouts:"Kudos Board", timeline:"Timeline", collect:"Collect", discuss:"Discuss", actions:"Actions" };

const DEFAULT_COLS = [
  { id:"c1", label:"What helped us forward", emoji:"🌱", color:"#3a7d44", bg:"rgba(58,125,68,0.08)",   text:"#1a3d20", border:"rgba(58,125,68,0.22)" },
  { id:"c2", label:"What held us back",      emoji:"🧱", color:"#b05a2f", bg:"rgba(176,90,47,0.08)",   text:"#4a1e0a", border:"rgba(176,90,47,0.22)" },
  { id:"c3", label:"Growth opportunities",   emoji:"🚀", color:"#3a5fa8", bg:"rgba(58,95,168,0.08)",   text:"#162244", border:"rgba(58,95,168,0.22)" },
];
const PALETTE = [
  { emoji:"✨", color:"#3a5fa8", bg:"rgba(58,95,168,0.08)",   text:"#162244", border:"rgba(58,95,168,0.22)" },
  { emoji:"🌱", color:"#3a7d44", bg:"rgba(58,125,68,0.08)",   text:"#1a3d20", border:"rgba(58,125,68,0.22)" },
  { emoji:"🧱", color:"#b05a2f", bg:"rgba(176,90,47,0.08)",   text:"#4a1e0a", border:"rgba(176,90,47,0.22)" },
  { emoji:"💡", color:"#a07820", bg:"rgba(160,120,32,0.08)",  text:"#3d2e08", border:"rgba(160,120,32,0.22)" },
  { emoji:"🎯", color:"#7a3a9a", bg:"rgba(122,58,154,0.08)",  text:"#31164a", border:"rgba(122,58,154,0.22)" },
  { emoji:"⚡", color:"#1e8a8a", bg:"rgba(30,138,138,0.08)",  text:"#0a3636", border:"rgba(30,138,138,0.22)" },
];
const EVENT_TYPES = [
  { value:"delivery",  label:"Delivery",  color:"#3a7d44" },
  { value:"milestone", label:"Milestone", color:"#3a5fa8" },
  { value:"incident",  label:"Incident",  color:"#b05a2f" },
  { value:"meeting",   label:"Meeting",   color:"#1e8a8a" },
  { value:"other",     label:"Other",     color:"#7a6f65" },
];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

const uid      = () => Math.random().toString(36).slice(2,10);
const NAMES    = ["Anon","Shadow","Ghost","Unnamed","Phantom","Mystery"];
const newAlias = () => NAMES[Math.floor(Math.random()*NAMES.length)]+" "+Math.floor(10+Math.random()*90);
const evType   = v  => EVENT_TYPES.find(e=>e.value===v)||EVENT_TYPES[4];
const fmtDate  = iso => { if(!iso)return""; const[y,m,d]=iso.split("-"); return `${MONTHS[+m-1].slice(0,3)} ${+d}, ${y}`; };

const mkBoard  = (ownedBy, ownedByName) => ({
  id: uid(), ownedBy, ownedByName,
  retro:{ title:"", team:"", startDate:"", endDate:"" },
  context:{ headline:"", body:"", highlights:[], links:[] },
  columns: DEFAULT_COLS,
  cards:[], shoutouts:[], events:[], actions:[],
  published:false, summary:"", summaryPublished:false,
  createdAt: Date.now(),
});

// ── localStorage — used only as offline fallback ──
const storageSave = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
};
const storageLoad = (key) => {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch(e) { return null; }
};

const BG_DOTS = `url("data:image/svg+xml,%3Csvg width='32' height='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='1.2' fill='rgba(120,113,108,0.1)'/%3E%3C/svg%3E")`;
const BG_MAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='600' viewBox='0 0 900 600'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23faf9f7'/%3E%3Cstop offset='100%25' stop-color='%23f2ede8'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='900' height='600' fill='url(%23g)'/%3E%3Ccircle cx='100' cy='90' r='200' fill='%23e8d5c4' opacity='.25'/%3E%3Ccircle cx='820' cy='480' r='240' fill='%23c8ddd4' opacity='.22'/%3E%3Ccircle cx='780' cy='50' r='130' fill='%23d4dff0' opacity='.2'/%3E%3C/svg%3E")`;
const COL_PATS = [
  `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='20' cy='20' r='1.5' fill='rgba(58,125,68,0.12)'/%3E%3C/svg%3E")`,
  `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='18' y='18' width='4' height='4' rx='1' fill='rgba(176,90,47,0.1)'/%3E%3C/svg%3E")`,
  `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 18L22 20L20 22L18 20Z' fill='rgba(58,95,168,0.1)'/%3E%3C/svg%3E")`,
  `url("data:image/svg+xml,%3Csvg width='36' height='36' viewBox='0 0 36 36' xmlns='http://www.w3.org/2000/svg'%3E%3Cline x1='0' y1='18' x2='36' y2='18' stroke='rgba(30,138,138,0.08)' stroke-width='1'/%3E%3C/svg%3E")`,
];

const T = {
  bg:"linear-gradient(145deg,#faf9f7 0%,#f7f4f0 50%,#f2ede8 100%)",
  card:"rgba(255,255,255,0.85)", border:"rgba(120,113,108,0.15)",
  inp:"rgba(255,255,255,0.95)", inpBdr:"rgba(120,113,108,0.22)",
  p:"#2c2825", s:"#6b6560", t:"#a39e99", acc:"#7a6f65",
};
const si = { width:"100%", boxSizing:"border-box", fontSize:"13px", padding:"9px 13px",
  borderRadius:"8px", border:`1px solid ${T.inpBdr}`, background:T.inp, color:T.p, fontFamily:"inherit" };
const sl = { fontSize:"10px", fontWeight:500, letterSpacing:"0.08em", textTransform:"uppercase",
  color:T.s, display:"block", marginBottom:"6px" };

const Btn = ({onClick,children,full,color,small,ghost,danger,disabled}) => ghost
  ? <button onClick={onClick} disabled={disabled} style={{fontSize:"12px",padding:"7px 14px",borderRadius:"8px",cursor:disabled?"not-allowed":"pointer",border:`1px solid ${danger?"rgba(160,100,80,0.35)":T.border}`,background:"transparent",color:danger?"#a06050":T.s,width:full?"100%":"auto",opacity:disabled?.5:1}}>{children}</button>
  : <button onClick={onClick} disabled={disabled} style={{fontSize:small?"11px":"12px",fontWeight:500,letterSpacing:"0.04em",padding:small?"5px 12px":"9px 22px",borderRadius:"8px",cursor:disabled?"not-allowed":"pointer",width:full?"100%":"auto",background:color||"linear-gradient(135deg,#8a8078,#b0a898)",color:"#fff",border:"none",opacity:disabled?.5:1}}>{children}</button>;

const Panel  = ({children,style={}}) => <div style={{background:T.card,borderRadius:"14px",border:`1px solid ${T.border}`,...style}}>{children}</div>;
const Pip    = ({color,size=8}) => <span style={{width:size,height:size,borderRadius:"50%",background:color,display:"inline-block",flexShrink:0}}/>;
const Av     = ({name,color="#7a6f65",size=24}) => <div style={{width:size,height:size,borderRadius:"50%",background:`${color}22`,border:`1px solid ${color}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:Math.floor(size*0.38),fontWeight:500,color,flexShrink:0}}>{(name||"?").slice(0,2).toUpperCase()}</div>;
const Tag    = ({label,color}) => <span style={{fontSize:"10px",fontWeight:500,letterSpacing:"0.06em",textTransform:"uppercase",padding:"3px 9px",borderRadius:"5px",background:`${color}18`,color,border:`1px solid ${color}35`}}>{label}</span>;
const SL     = ({children,sub}) => <div style={{marginBottom:"1.25rem"}}><div style={{fontSize:"11px",fontWeight:500,letterSpacing:"0.09em",textTransform:"uppercase",color:T.acc}}>{children}</div>{sub&&<div style={{fontSize:"13px",color:T.s,marginTop:"4px",lineHeight:1.6}}>{sub}</div>}</div>;
const Hr     = () => <div style={{height:"1px",background:"rgba(120,113,108,0.12)",margin:"1.25rem 0"}}/>;

function CalPicker({value, onChange}) {
  const today = new Date();
  const init  = value ? new Date(value+"T12:00:00") : today;
  const [view,setView] = useState({y:init.getFullYear(),m:init.getMonth()});
  const [open,setOpen] = useState(false);
  const ref = useRef();
  useEffect(()=>{
    const h = e => { if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h);
  },[]);
  const first = new Date(view.y,view.m,1).getDay();
  const days  = new Date(view.y,view.m+1,0).getDate();
  const cells = [...Array(first).fill(null),...Array.from({length:days},(_,i)=>i+1)];
  while(cells.length%7) cells.push(null);
  const sel   = value ? new Date(value+"T12:00:00") : null;
  const isSel = d => sel&&sel.getFullYear()===view.y&&sel.getMonth()===view.m&&sel.getDate()===d;
  const isTod = d => today.getFullYear()===view.y&&today.getMonth()===view.m&&today.getDate()===d;
  const pick  = d => { onChange(`${view.y}-${String(view.m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`); setOpen(false); };
  const nav   = delta => { const d=new Date(view.y,view.m+delta,1); setView({y:d.getFullYear(),m:d.getMonth()}); };
  return (
    <div ref={ref} style={{position:"relative"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{...si,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",userSelect:"none"}}>
        <span style={{color:value?T.p:T.t}}>{value?fmtDate(value):"Pick a date…"}</span>
        <span style={{fontSize:"11px",color:T.t}}>▾</span>
      </div>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,zIndex:999,background:"#faf9f7",border:`1px solid ${T.border}`,borderRadius:"12px",padding:"14px",width:"260px",boxShadow:"0 4px 24px rgba(44,40,37,0.12)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
            <button onClick={()=>nav(-1)} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:"16px",color:T.s,padding:"2px 8px"}}>‹</button>
            <span style={{fontSize:"12px",fontWeight:500,color:T.p}}>{MONTHS[view.m]} {view.y}</span>
            <button onClick={()=>nav(1)}  style={{background:"transparent",border:"none",cursor:"pointer",fontSize:"16px",color:T.s,padding:"2px 8px"}}>›</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:"4px"}}>
            {DAYS.map(d=><div key={d} style={{textAlign:"center",fontSize:"10px",color:T.t,fontWeight:500,padding:"2px 0"}}>{d}</div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"2px"}}>
            {cells.map((d,i)=>(
              <button key={i} onClick={()=>d&&pick(d)} style={{textAlign:"center",fontSize:"12px",padding:"5px 2px",borderRadius:"6px",border:"none",cursor:d?"pointer":"default",background:d&&isSel(d)?"#7a6f65":d&&isTod(d)?"rgba(122,111,101,0.1)":"transparent",color:d&&isSel(d)?"#fff":d?T.p:"transparent",fontWeight:d&&isTod(d)?500:400}}>{d||""}</button>
            ))}
          </div>
          {value&&<div style={{marginTop:"10px",paddingTop:"10px",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"center"}}><button onClick={()=>{onChange("");setOpen(false);}} style={{fontSize:"11px",color:T.t,background:"transparent",border:"none",cursor:"pointer"}}>Clear</button></div>}
        </div>
      )}
    </div>
  );
}

function SummaryModal({board,text,setText,generating,onClose,onSave,onRegen,onUnpublish}){
  const pub = board?.summaryPublished;
  let parsed = null;
  try { if(text) parsed = JSON.parse(text); } catch(_) {}
  const hc  = { Green:"#3a7d44", Amber:"#a07820", Red:"#a05050" };
  const hbg = { Green:"rgba(58,125,68,0.08)", Amber:"rgba(160,120,32,0.08)", Red:"rgba(160,80,80,0.08)" };
  const pc  = { High:"#a05050", Medium:"#a07820", Low:"#6a8c78" };
  const h   = parsed?.overallHealth||"Amber";
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(44,40,37,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:"1.5rem"}}>
      <div style={{background:"#faf9f7",borderRadius:"16px",border:`1px solid ${T.border}`,width:"100%",maxWidth:"780px",maxHeight:"90vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"16px 24px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{fontSize:"14px",fontWeight:500,color:T.p,display:"flex",alignItems:"center",gap:"8px"}}>
              AI Retro Summary
              {pub&&<span style={{fontSize:"10px",padding:"2px 8px",borderRadius:"99px",background:"rgba(106,140,120,0.15)",color:"#3a6050",border:"1px solid rgba(106,140,120,0.3)",fontWeight:500}}>Published</span>}
            </div>
            <div style={{fontSize:"12px",color:T.s,marginTop:"2px"}}>{board?.retro?.title||"Untitled"}{board?.retro?.team?" · "+board.retro.team:""}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
            {pub&&<button onClick={onUnpublish} style={{fontSize:"11px",padding:"4px 10px",borderRadius:"6px",border:"1px solid rgba(160,80,80,0.3)",background:"transparent",color:"#a05050",cursor:"pointer"}}>Unpublish</button>}
            <button onClick={onClose} style={{fontSize:"20px",background:"transparent",border:"none",color:T.t,cursor:"pointer",lineHeight:1}}>×</button>
          </div>
        </div>
        <div style={{flex:1,overflow:"auto",padding:"20px 24px"}}>
          {generating ? (
            <div style={{textAlign:"center",padding:"4rem",color:T.s}}>
              <div style={{fontSize:"24px",marginBottom:"12px",opacity:.4}}>✦</div>
              <div style={{fontSize:"13px",fontWeight:500}}>Generating structured summary…</div>
              <div style={{fontSize:"12px",color:T.t,marginTop:"6px"}}>Analysing responses, actions, and patterns</div>
            </div>
          ) : !parsed ? (
            <div style={{textAlign:"center",padding:"4rem",color:T.s}}>
              <div style={{fontSize:"13px",marginBottom:"16px"}}>No summary yet. Generate one to get started.</div>
              <button onClick={onRegen} style={{fontSize:"12px",padding:"8px 20px",borderRadius:"8px",background:"linear-gradient(135deg,#6a7a8c,#8a9aaa)",color:"#fff",border:"none",cursor:"pointer"}}>Generate summary ↗</button>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
              <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:"12px",alignItems:"start"}}>
                <div style={{padding:"14px 18px",borderRadius:"12px",background:hbg[h],border:`1px solid ${hc[h]}30`,textAlign:"center",minWidth:"90px"}}>
                  <div style={{fontSize:"22px",fontWeight:500,color:hc[h]}}>{h==="Green"?"●":h==="Amber"?"◐":"○"}</div>
                  <div style={{fontSize:"11px",fontWeight:500,color:hc[h],marginTop:"4px",letterSpacing:"0.05em",textTransform:"uppercase"}}>{h}</div>
                </div>
                <div style={{padding:"14px 18px",borderRadius:"12px",background:"rgba(120,113,108,0.05)",border:`1px solid ${T.border}`}}>
                  <div style={{fontSize:"10px",fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase",color:T.t,marginBottom:"6px"}}>Executive summary</div>
                  <div style={{fontSize:"13px",color:T.p,lineHeight:1.7}}>{parsed.executiveSummary}</div>
                  {parsed.healthReason&&<div style={{fontSize:"12px",color:T.s,marginTop:"6px",fontStyle:"italic"}}>{parsed.healthReason}</div>}
                </div>
              </div>
              {parsed.metrics&&(
                <div>
                  <div style={{fontSize:"10px",fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase",color:T.t,marginBottom:"8px"}}>Sprint metrics</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:"8px"}}>
                    {[
                      {l:"Responses",   v:parsed.metrics.totalResponses,    c:"#6a7a8c"},
                      {l:"Participation",v:parsed.metrics.participationRate, c:"#6a8c78"},
                      {l:"Open actions",v:parsed.metrics.openActions,       c:"#a07820"},
                      {l:"Done actions",v:parsed.metrics.completedActions,  c:"#6a8c78"},
                      {l:"Kudos",       v:parsed.metrics.kudosGiven,        c:"#8c7a6a"},
                      {l:"Events",      v:parsed.metrics.timelineEvents,    c:"#7a7a8c"},
                    ].map(m=>(
                      <div key={m.l} style={{padding:"10px 12px",borderRadius:"10px",background:`${m.c}0d`,border:`1px solid ${m.c}22`,textAlign:"center"}}>
                        <div style={{fontSize:"18px",fontWeight:500,color:m.c,lineHeight:1}}>{m.v??"-"}</div>
                        <div style={{fontSize:"10px",color:T.s,marginTop:"4px"}}>{m.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:"10px"}}>
                {[
                  {title:"Top wins",     items:parsed.topWins,     color:"#6a8c78",bg:"rgba(106,140,120,0.07)",icon:"🌱"},
                  {title:"Top blockers", items:parsed.topBlockers, color:"#a05050",bg:"rgba(160,80,80,0.07)", icon:"🧱"},
                  {title:"Growth areas", items:parsed.growthAreas, color:"#6a7a8c",bg:"rgba(106,122,140,0.07)",icon:"🚀"},
                ].map(s=>(
                  <div key={s.title} style={{padding:"14px",borderRadius:"12px",background:s.bg,border:`1px solid ${s.color}25`}}>
                    <div style={{fontSize:"10px",fontWeight:500,letterSpacing:"0.07em",textTransform:"uppercase",color:s.color,marginBottom:"10px",display:"flex",alignItems:"center",gap:"5px"}}>
                      <span style={{fontSize:"12px"}}>{s.icon}</span>{s.title}
                    </div>
                    {(s.items||[]).length===0
                      ?<div style={{fontSize:"12px",color:T.t,fontStyle:"italic"}}>None</div>
                      :(s.items||[]).map((it,i)=>(
                        <div key={i} style={{display:"flex",gap:"7px",marginBottom:"8px",alignItems:"flex-start"}}>
                          <span style={{width:16,height:16,borderRadius:"50%",background:`${s.color}22`,color:s.color,fontSize:"9px",fontWeight:500,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:"1px"}}>{i+1}</span>
                          <span style={{fontSize:"12px",color:T.p,lineHeight:1.5}}>{it}</span>
                        </div>
                      ))
                    }
                  </div>
                ))}
              </div>
              {(parsed.criticalActions||[]).length>0&&(
                <div>
                  <div style={{fontSize:"10px",fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase",color:T.t,marginBottom:"8px"}}>Critical action items</div>
                  <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                    {parsed.criticalActions.map((a,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",padding:"10px 14px",borderRadius:"10px",background:"rgba(255,255,255,0.7)",border:`1px solid ${T.border}`}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:pc[a.priority]||T.s,flexShrink:0}}/>
                        <div style={{flex:1,fontSize:"13px",color:T.p}}>{a.action}</div>
                        {a.owner&&<span style={{fontSize:"11px",color:T.s,whiteSpace:"nowrap"}}>{a.owner}</span>}
                        {a.due&&<span style={{fontSize:"11px",color:T.s,whiteSpace:"nowrap"}}>Due {a.due}</span>}
                        <span style={{fontSize:"10px",fontWeight:500,padding:"2px 8px",borderRadius:"99px",background:a.status==="Done"?"rgba(106,140,120,0.15)":"rgba(160,120,32,0.12)",color:a.status==="Done"?"#3a6050":"#6a4a10",border:`1px solid ${a.status==="Done"?"rgba(106,140,120,0.3)":"rgba(160,120,32,0.25)"}`}}>{a.status}</span>
                        <span style={{fontSize:"10px",fontWeight:500,padding:"2px 8px",borderRadius:"99px",background:`${pc[a.priority]||T.s}15`,color:pc[a.priority]||T.s,border:`1px solid ${pc[a.priority]||T.s}30`}}>{a.priority}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
                {(parsed.risks||[]).length>0&&(
                  <div style={{padding:"14px",borderRadius:"12px",background:"rgba(160,80,80,0.05)",border:"1px solid rgba(160,80,80,0.15)"}}>
                    <div style={{fontSize:"10px",fontWeight:500,letterSpacing:"0.07em",textTransform:"uppercase",color:"#a05050",marginBottom:"10px"}}>⚠ Forward risks</div>
                    {parsed.risks.map((r,i)=>(
                      <div key={i} style={{display:"flex",gap:"7px",marginBottom:"8px",alignItems:"flex-start"}}>
                        <span style={{fontSize:"10px",color:"#a05050",flexShrink:0,marginTop:"2px"}}>▲</span>
                        <span style={{fontSize:"12px",color:T.p,lineHeight:1.5}}>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
                {(parsed.recommendedNextSteps||[]).length>0&&(
                  <div style={{padding:"14px",borderRadius:"12px",background:"rgba(106,122,140,0.06)",border:"1px solid rgba(106,122,140,0.18)"}}>
                    <div style={{fontSize:"10px",fontWeight:500,letterSpacing:"0.07em",textTransform:"uppercase",color:"#6a7a8c",marginBottom:"10px"}}>→ Recommended next steps</div>
                    {parsed.recommendedNextSteps.map((s,i)=>(
                      <div key={i} style={{display:"flex",gap:"7px",marginBottom:"8px",alignItems:"flex-start"}}>
                        <span style={{width:16,height:16,borderRadius:"50%",background:"rgba(106,122,140,0.15)",color:"#6a7a8c",fontSize:"9px",fontWeight:500,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:"1px"}}>{i+1}</span>
                        <span style={{fontSize:"12px",color:T.p,lineHeight:1.5}}>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {(parsed.recognitions||[]).length>0&&(
                <div style={{padding:"14px 16px",borderRadius:"12px",background:"rgba(140,122,106,0.06)",border:"1px solid rgba(140,122,106,0.18)"}}>
                  <div style={{fontSize:"10px",fontWeight:500,letterSpacing:"0.07em",textTransform:"uppercase",color:"#8c7a6a",marginBottom:"10px"}}>★ Recognitions</div>
                  {parsed.recognitions.map((r,i)=>(
                    <div key={i} style={{fontSize:"12px",color:T.p,lineHeight:1.5,display:"flex",gap:"7px",marginBottom:"4px"}}>
                      <span style={{color:"#8c7a6a",flexShrink:0}}>★</span>{r}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{padding:"12px 24px",borderTop:`1px solid ${T.border}`,display:"flex",gap:"10px",alignItems:"center",flexShrink:0}}>
          <button onClick={onRegen} disabled={generating} style={{fontSize:"12px",padding:"7px 14px",borderRadius:"8px",border:"1px solid rgba(106,122,140,0.3)",background:"transparent",color:"#6a7a8c",cursor:"pointer"}}>↺ Regenerate</button>
          <div style={{flex:1}}/>
          {!pub
            ?<button onClick={()=>onSave(true)} disabled={generating||!parsed} style={{fontSize:"12px",fontWeight:500,padding:"8px 20px",borderRadius:"8px",background:"linear-gradient(135deg,#6a8c78,#8aaa94)",color:"#fff",border:"none",cursor:"pointer"}}>Publish to team →</button>
            :<button onClick={()=>onSave(true)} disabled={generating||!parsed} style={{fontSize:"12px",fontWeight:500,padding:"8px 20px",borderRadius:"8px",background:"linear-gradient(135deg,#6a7a8c,#8a9aaa)",color:"#fff",border:"none",cursor:"pointer"}}>Update & republish →</button>
          }
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [screen,       setScreen]       = useState("login");
  const [loginUser,    setLoginUser]    = useState("");
  const [loginPass,    setLoginPass]    = useState("");
  const [loginErr,     setLoginErr]     = useState("");
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [admins,       setAdmins]       = useState([]);
  const [boards,       setBoards]       = useState([]);
  const [saTab,        setSaTab]        = useState("accounts");
  const [newAd,        setNewAd]        = useState({username:"",password:"",displayName:""});
  const [adErr,        setAdErr]        = useState("");
  const [boardId,      setBoardId]      = useState(null);
  const [phase,        setPhase]        = useState("setup");
  const [pBoardId,     setPBoardId]     = useState("");
  const [pName,        setPName]        = useState("");
  const [pAnon,        setPAnon]        = useState(true);
  const [pAlias]                        = useState(newAlias);
  const [drafts,       setDrafts]       = useState({});
  const [expandedCard, setExpandedCard] = useState(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [editingCol,   setEditingCol]   = useState(null);
  const [newCol,       setNewCol]       = useState("");
  const [newShoutout,  setNewShoutout]  = useState({to:"",message:""});
  const [newEvent,     setNewEvent]     = useState({date:"",title:"",type:"delivery",note:""});
  const [newAction,    setNewAction]    = useState({text:"",owner:"",due:""});
  const [newHL,        setNewHL]        = useState("");
  const [newLink,      setNewLink]      = useState({label:"",url:""});
  const [sumModal,     setSumModal]     = useState(false);
  const [sumBoardId,   setSumBoardId]   = useState(null);
  const [sumText,      setSumText]      = useState("");
  const [sumGen,       setSumGen]       = useState(false);

  const pName_      = pAnon ? pAlias : (pName||"Participant");
  const activeBoard = boards.find(b=>b.id===boardId);
  const myBoards    = boards.filter(b=>b.ownedBy===currentAdmin?.username);

  // ── Load from Supabase on mount ──
  const [storageReady, setStorageReady] = useState(false);

  useEffect(()=>{
    (async()=>{
      const a = await dbGetAdmins();
      if(a.length) { setAdmins(a); storageSave("retro:admins", a); }
      else { const local = storageLoad("retro:admins"); if(local) setAdmins(local); }
      const b = await dbGetBoards();
      if(b.length) { setBoards(b); storageSave("retro:boards", b); }
      else { const local = storageLoad("retro:boards"); if(local) setBoards(local); }
      setStorageReady(true);
    })();
  },[]);

  // ── Poll Supabase every 5s for cross-device sync ──
  useEffect(()=>{
    if(screen==="login") return;
    const iv = setInterval(async()=>{
      const a = await dbGetAdmins(); if(a.length) setAdmins(a);
      const b = await dbGetBoards(); if(b.length) setBoards(b);
    }, POLL_MS);
    return()=>clearInterval(iv);
  },[screen]);

  // ── Auth ──
  function doLogin() {
    const u = loginUser.trim(), p = loginPass.trim();
    if(!u||!p){ setLoginErr("Enter username and password."); return; }
    if(u===SUPER_ADMIN.username && p===SUPER_ADMIN.password){
      setIsSuperAdmin(true); setCurrentAdmin(null); setScreen("superadmin"); setLoginErr(""); return;
    }
    const found = admins.find(a=>a.username===u && a.password===p);
    if(found){ setCurrentAdmin(found); setIsSuperAdmin(false); setScreen("facilitator"); setLoginErr(""); return; }
    setLoginErr("Incorrect username or password.");
  }

  function doJoin() {
    if(!pAnon&&!pName.trim()){ setLoginErr("Enter your name or join anonymously."); return; }
    if(!pBoardId.trim()){ setLoginErr("Enter a Board ID."); return; }
    const board = boards.find(b=>b.id===pBoardId.trim());
    if(!board){ setLoginErr("Board not found. Check the ID."); return; }
    if(!board.published){ setLoginErr("This board isn't published yet."); return; }
    setBoardId(pBoardId.trim()); setPhase("context"); setScreen("participant"); setLoginErr("");
  }

  function signOut(){
    setScreen("login"); setCurrentAdmin(null); setIsSuperAdmin(false);
    setBoardId(null); setLoginUser(""); setLoginPass(""); setLoginErr("");
    setSaTab("accounts"); setPhase("setup");
  }

  // ── Save to Supabase + localStorage backup ──
  function saveBoards(updated) {
    setBoards(updated);
    storageSave("retro:boards", updated);
    // upsert each board to Supabase
    updated.forEach(b => dbSaveBoard(b));
  }

  function saveAdmins(updated) {
    setAdmins(updated);
    storageSave("retro:admins", updated);
  }

  // ── Admin management ──
  function addAdmin(){
    const {username,password,displayName}=newAd;
    if(!username.trim()||!password.trim()||!displayName.trim()){setAdErr("All fields required.");return;}
    if(username.trim()===SUPER_ADMIN.username){setAdErr("That username is reserved.");return;}
    if(admins.find(a=>a.username===username.trim())){setAdErr("Username already exists.");return;}
    const admin = {username:username.trim(),password:password.trim(),displayName:displayName.trim(),createdAt:Date.now()};
    const updated=[...admins, admin];
    setAdmins(updated); storageSave("retro:admins", updated);
    dbSaveAdmin(admin);
    setNewAd({username:"",password:"",displayName:""}); setAdErr("");
  }

  function removeAdmin(un){
    const updated=admins.filter(a=>a.username!==un);
    setAdmins(updated); storageSave("retro:admins", updated);
    dbDeleteAdmin(un);
  }
  function updateBoard(fn){ saveBoards(boards.map(b=>b.id===boardId?fn(b):b)); }
  function mutate(field,fn){ updateBoard(b=>({...b,[field]:fn(b[field])})); }
  function createBoard(){ const b=mkBoard(currentAdmin.username,currentAdmin.displayName); const updated=[...boards,b]; saveBoards(updated); setBoardId(b.id); setPhase("setup"); setScreen("board"); }
  function openBoard(id){ setBoardId(id); setPhase("setup"); setScreen("board"); }
  function deleteBoard(id){
    const updated=boards.filter(b=>b.id!==id);
    saveBoards(updated);
    dbDeleteBoard(id);
    if(boardId===id){ setBoardId(null); setScreen("facilitator"); }
  }
  const setRetroF = (k,v) => updateBoard(b=>({...b,retro:{...b.retro,[k]:v}}));
  const setCtxF   = (k,v) => updateBoard(b=>({...b,context:{...(b.context||{}),[k]:v}}));
  function submitCard(colId){ const t=(drafts[colId]||"").trim(); if(!t)return; mutate("cards",c=>[...c,{id:uid(),colId,text:t,author:pName_,ts:Date.now(),comments:[]}]); setDrafts(p=>({...p,[colId]:""})); }
  function addComment(){ if(!commentDraft.trim()||!expandedCard)return; mutate("cards",c=>c.map(x=>x.id===expandedCard?{...x,comments:[...x.comments,{id:uid(),text:commentDraft.trim(),author:pName_,ts:Date.now()}]}:x)); setCommentDraft(""); }
  function removeCard(id){ mutate("cards",c=>c.filter(x=>x.id!==id)); setExpandedCard(null); }
  function addAction(){ if(!newAction.text.trim())return; mutate("actions",a=>[...a,{id:uid(),...newAction,done:false}]); setNewAction({text:"",owner:"",due:""}); }
  function toggleAction(id){ mutate("actions",a=>a.map(x=>x.id===id?{...x,done:!x.done}:x)); }
  function removeAction(id){ mutate("actions",a=>a.filter(x=>x.id!==id)); }
  function addShoutout(){ if(!newShoutout.to.trim()||!newShoutout.message.trim())return; mutate("shoutouts",s=>[...s,{id:uid(),...newShoutout,from:pName_}]); setNewShoutout({to:"",message:""}); }
  function removeShoutout(id){ mutate("shoutouts",s=>s.filter(x=>x.id!==id)); }
  function addEvent(){ if(!newEvent.title.trim()||!newEvent.date)return; mutate("events",e=>[...e,{id:uid(),...newEvent}].sort((a,b)=>a.date.localeCompare(b.date))); setNewEvent({date:"",title:"",type:"delivery",note:""}); }
  function removeEvent(id){ mutate("events",e=>e.filter(x=>x.id!==id)); }
  function addColumn(){ if(!newCol.trim())return; const p=PALETTE[(activeBoard?.columns||[]).length%PALETTE.length]; mutate("columns",c=>[...c,{id:uid(),label:newCol.trim(),...p}]); setNewCol(""); }
  function removeColumn(id){ mutate("columns",c=>c.filter(x=>x.id!==id)); }
  function addHL(){ if(!newHL.trim())return; setCtxF("highlights",[...(activeBoard?.context?.highlights||[]),{id:uid(),text:newHL.trim()}]); setNewHL(""); }
  function removeHL(id){ setCtxF("highlights",(activeBoard?.context?.highlights||[]).filter(h=>h.id!==id)); }
  function addLink(){ if(!newLink.label.trim()||!newLink.url.trim())return; setCtxF("links",[...(activeBoard?.context?.links||[]),{id:uid(),...newLink}]); setNewLink({label:"",url:""}); }
  function removeLink(id){ setCtxF("links",(activeBoard?.context?.links||[]).filter(l=>l.id!==id)); }
  function togglePublish(){ updateBoard(b=>({...b,published:!b.published})); }

  // ── AI Summary ──
  async function openSummary(bid){
    const b=boards.find(x=>x.id===bid); if(!b)return;
    setSumBoardId(bid); setSumText(b.summary||""); setSumModal(true);
    if(b.summary) return;
    setSumGen(true);
    const ctx=b.context||{};
    const totalCards=b.cards.length, openA=b.actions.filter(a=>!a.done).length, doneA=b.actions.filter(a=>a.done).length;
    const prompt=`You are an executive leadership coach analyzing an async retrospective. Return ONLY valid JSON, no markdown, no extra text.

RETRO DATA:
- Title: ${b.retro.title||"Untitled"} | Team: ${b.retro.team||"N/A"} | Period: ${b.retro.startDate||"?"} to ${b.retro.endDate||"?"}
- Context: ${ctx.headline||""} ${ctx.body||""}
- Highlights: ${(ctx.highlights||[]).map(h=>h.text).join("; ")||"None"}
- Kudos (${b.shoutouts.length}): ${b.shoutouts.map(s=>`${s.from}→${s.to}: ${s.message}`).join(" | ")||"None"}
- Timeline (${b.events.length}): ${b.events.map(e=>`[${e.type}] ${e.date}: ${e.title}`).join(" | ")||"None"}
${b.columns.map(c=>{const cc=b.cards.filter(x=>x.colId===c.id);return`- ${c.label} (${cc.length}): ${cc.map(x=>x.text).join(" | ")||"None"}`;}).join("\n")}
- Actions: ${b.actions.length} total, ${doneA} done, ${openA} open
${b.actions.map(a=>`  [${a.done?"DONE":"OPEN"}] ${a.text}${a.owner?" | "+a.owner:""}${a.due?" | Due "+a.due:""}`).join("\n")||"  None"}

Return this exact JSON:
{"overallHealth":"Green|Amber|Red","healthReason":"one sentence","executiveSummary":"2-3 sentences","metrics":{"totalResponses":${totalCards},"participationRate":"estimated %","openActions":${openA},"completedActions":${doneA},"kudosGiven":${b.shoutouts.length},"timelineEvents":${b.events.length}},"topWins":["max 3 wins"],"topBlockers":["max 3 blockers"],"growthAreas":["max 3 areas"],"recognitions":["max 3 kudos"],"criticalActions":[{"action":"","owner":"","due":"","priority":"High|Medium|Low","status":"Open|Done"}],"risks":["max 2 risks"],"recommendedNextSteps":["3 next steps"]}`;
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:2000,messages:[{role:"user",content:prompt}]})});
      const data=await res.json();
      const raw=data.content?.find(x=>x.type==="text")?.text||"{}";
      const clean=raw.replace(/```json|```/g,"").trim();
      setSumText(clean);
      saveBoards(boards.map(x=>x.id===bid?{...x,summary:clean}:x));
    }catch(e){ setSumText("{}"); }
    setSumGen(false);
  }
  function saveSummary(publish){
    saveBoards(boards.map(b=>b.id===sumBoardId?{...b,summary:sumText,summaryPublished:publish?true:b.summaryPublished}:b));
    if(publish) setSumModal(false);
  }
  function unpublishSummary(){ saveBoards(boards.map(b=>b.id===sumBoardId?{...b,summaryPublished:false}:b)); }

  const isFacil = screen==="board";
  const pName__ = isFacil ? (currentAdmin?.displayName||"Facilitator") : pName_;

  if(!storageReady) return(
    <div style={{background:T.bg,minHeight:"700px",padding:"2rem",borderRadius:"16px",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"}}>
      <div style={{textAlign:"center",color:T.s}}>
        <div style={{fontSize:"22px",marginBottom:"12px",opacity:.4}}>◎</div>
        <div style={{fontSize:"13px",fontWeight:500}}>Connecting to database…</div>
        <div style={{fontSize:"12px",color:T.t,marginTop:"6px"}}>Loading your boards and accounts</div>
      </div>
    </div>
  );

  const wrap = content => (
    <div style={{background:T.bg,backgroundImage:`${BG_DOTS},${BG_MAIN}`,backgroundSize:"32px 32px,cover",minHeight:"700px",padding:"2rem",borderRadius:"16px",color:T.p,fontFamily:"inherit",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:"200px",pointerEvents:"none",zIndex:0}}>
        <div style={{position:"absolute",width:320,height:320,borderRadius:"50%",background:"radial-gradient(circle,rgba(122,111,101,0.1) 0%,transparent 70%)",top:-120,left:-60}}/>
        <div style={{position:"absolute",width:240,height:240,borderRadius:"50%",background:"radial-gradient(circle,rgba(58,125,68,0.08) 0%,transparent 70%)",top:-80,right:40}}/>
      </div>
      <div style={{position:"relative",zIndex:1}}>{content}</div>
    </div>
  );

  // ── LOGIN ──
  if(screen==="login") return wrap(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"620px"}}>
      <div style={{width:"100%",maxWidth:"500px"}}>
        <div style={{textAlign:"center",marginBottom:"2rem"}}>
          <div style={{fontSize:"10px",fontWeight:500,letterSpacing:"0.12em",textTransform:"uppercase",color:T.acc,marginBottom:"8px"}}>Async retrospective</div>
          <div style={{fontSize:"28px",fontWeight:500,color:T.p}}>Retro Board</div>
          <div style={{fontSize:"13px",color:T.s,marginTop:"4px"}}>Sign in to get started</div>
        </div>
        <Panel style={{padding:"22px 24px",marginBottom:"12px"}}>
          <div style={{fontSize:"13px",fontWeight:500,color:T.p,marginBottom:"16px"}}>Facilitator sign-in</div>
          <label style={sl}>Username</label>
          <input value={loginUser} onChange={e=>{setLoginUser(e.target.value);setLoginErr("");}} onKeyDown={e=>e.key==="Enter"&&doLogin()} placeholder="Enter username" style={{...si,marginBottom:"10px"}}/>
          <label style={sl}>Password</label>
          <input value={loginPass} onChange={e=>{setLoginPass(e.target.value);setLoginErr("");}} onKeyDown={e=>e.key==="Enter"&&doLogin()} type="password" placeholder="Enter password" style={{...si,marginBottom:loginErr?"8px":"14px"}}/>
          {loginErr&&<div style={{fontSize:"11px",color:"#b05a2f",marginBottom:"10px",padding:"6px 10px",borderRadius:"6px",background:"rgba(176,90,47,0.08)",border:"1px solid rgba(176,90,47,0.2)"}}>{loginErr}</div>}
          <Btn onClick={doLogin} full color="linear-gradient(135deg,#6a7a8c,#8a9aaa)">Sign in →</Btn>
        </Panel>
        <Panel style={{padding:"22px 24px"}}>
          <div style={{fontSize:"13px",fontWeight:500,color:T.p,marginBottom:"16px"}}>Join as participant</div>
          <label style={sl}>Board ID</label>
          <input value={pBoardId} onChange={e=>{setPBoardId(e.target.value);setLoginErr("");}} placeholder="Paste board ID here" style={{...si,marginBottom:"10px"}}/>
          <label style={sl}>Your name</label>
          <input value={pName} onChange={e=>setPName(e.target.value)} disabled={pAnon} placeholder="Enter your name" style={{...si,opacity:pAnon?.5:1,marginBottom:"8px"}}/>
          <label style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"12px",color:T.s,cursor:"pointer",marginBottom:"14px"}}>
            <input type="checkbox" checked={pAnon} onChange={e=>setPAnon(e.target.checked)}/>
            Join anonymously as <strong style={{color:T.p}}>{pAlias}</strong>
          </label>
          <Btn onClick={doJoin} full color="linear-gradient(135deg,#6a8c78,#8aaa94)">Join board →</Btn>
        </Panel>
      </div>
    </div>
  );

  // ── SUPER ADMIN ──
  if(screen==="superadmin") return wrap(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"2rem",flexWrap:"wrap",gap:"12px"}}>
        <div>
          <div style={{fontSize:"10px",fontWeight:500,letterSpacing:"0.12em",textTransform:"uppercase",color:"#6a7a8c",marginBottom:"4px"}}>Super admin</div>
          <div style={{fontSize:"22px",fontWeight:500}}>Admin control panel</div>
          <div style={{fontSize:"12px",color:T.s,marginTop:"3px"}}>{admins.length} facilitator{admins.length!==1?"s":""} · {boards.length} boards total</div>
        </div>
        <div style={{display:"flex",gap:"8px"}}>
          <Btn onClick={()=>setSaTab("accounts")} color={saTab==="accounts"?"linear-gradient(135deg,#6a7a8c,#8a9aaa)":undefined} ghost={saTab!=="accounts"}>Accounts</Btn>
          <Btn onClick={()=>setSaTab("boards")}   color={saTab==="boards"?"linear-gradient(135deg,#6a8c78,#8aaa94)":undefined} ghost={saTab!=="boards"}>All boards</Btn>
          <Btn onClick={signOut} ghost>Sign out</Btn>
        </div>
      </div>
      {saTab==="accounts"&&(
        <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,380px)",gap:"2rem",alignItems:"start"}}>
          <div>
            <SL sub="All facilitator accounts. Each manages their own retro boards independently.">Facilitator accounts</SL>
            {admins.length===0
              ?<div style={{padding:"2.5rem",textAlign:"center",border:"1px dashed rgba(120,113,108,0.25)",borderRadius:"12px",fontSize:"13px",color:T.s}}>No facilitator accounts yet.</div>
              :<div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                {admins.map(a=>(
                  <Panel key={a.username} style={{padding:"14px 18px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                      <Av name={a.displayName} color="#6a7a8c" size={36}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:"13px",fontWeight:500}}>{a.displayName}</div>
                        <div style={{fontSize:"11px",color:T.s,marginTop:"2px",display:"flex",gap:"12px"}}>
                          <span>@{a.username}</span>
                          <span>{boards.filter(b=>b.ownedBy===a.username).length} boards</span>
                          {a.createdAt&&<span>Since {new Date(a.createdAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      <Btn onClick={()=>{ if(window.confirm(`Remove ${a.displayName}? Their boards will be preserved.`)) removeAdmin(a.username); }} ghost danger small>Remove</Btn>
                    </div>
                  </Panel>
                ))}
              </div>
            }
          </div>
          <div>
            <SL sub="Create a new facilitator who can run their own retro boards.">New facilitator</SL>
            <Panel style={{padding:"20px 24px"}}>
              <div style={{display:"flex",flexDirection:"column",gap:"12px",marginBottom:"14px"}}>
                <div><label style={sl}>Display name</label><input value={newAd.displayName} onChange={e=>setNewAd(p=>({...p,displayName:e.target.value}))} placeholder="e.g. Alex Johnson" style={si}/></div>
                <div><label style={sl}>Username</label><input value={newAd.username} onChange={e=>setNewAd(p=>({...p,username:e.target.value}))} placeholder="e.g. alexj" style={si}/></div>
                <div><label style={sl}>Password</label><input type="password" value={newAd.password} onChange={e=>setNewAd(p=>({...p,password:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addAdmin()} placeholder="Set a password" style={si}/></div>
              </div>
              {adErr&&<div style={{fontSize:"11px",color:"#b05a2f",marginBottom:"10px"}}>{adErr}</div>}
              <Btn onClick={addAdmin} full color="linear-gradient(135deg,#6a7a8c,#8a9aaa)">Create facilitator →</Btn>
            </Panel>
          </div>
        </div>
      )}
      {saTab==="boards"&&(
        <div>
          <SL sub="Every retro board across all facilitators.">All boards</SL>
          {boards.length===0
            ?<div style={{padding:"2.5rem",textAlign:"center",border:"1px dashed rgba(120,113,108,0.25)",borderRadius:"12px",fontSize:"13px",color:T.s}}>No boards yet.</div>
            :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"14px"}}>
              {boards.map(b=>{
                const doneA=b.actions.filter(a=>a.done).length;
                const owner=admins.find(a=>a.username===b.ownedBy);
                return(
                  <Panel key={b.id} style={{padding:"18px 20px"}}>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:"8px"}}>
                      <div><div style={{fontSize:"14px",fontWeight:500,marginBottom:"2px"}}>{b.retro.title||"Untitled"}</div><div style={{fontSize:"11px",color:T.s}}>{b.retro.team||""}</div></div>
                      <span style={{fontSize:"10px",fontWeight:500,padding:"3px 8px",borderRadius:"99px",background:b.published?"rgba(58,125,68,0.12)":"rgba(176,90,47,0.1)",color:b.published?"#1a3d20":"#4a1e0a",border:`1px solid ${b.published?"rgba(58,125,68,0.3)":"rgba(176,90,47,0.25)"}`}}>{b.published?"Live":"Draft"}</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"10px",padding:"5px 8px",borderRadius:"6px",background:"rgba(106,122,140,0.06)",border:"1px solid rgba(106,122,140,0.15)"}}>
                      <Av name={owner?.displayName||b.ownedByName||"?"} color="#6a7a8c" size={18}/>
                      <span style={{fontSize:"11px",color:"#6a7a8c",fontWeight:500}}>{owner?.displayName||b.ownedByName||"Unknown"}</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"6px",marginBottom:"12px"}}>
                      {[{l:"Cards",v:b.cards.length,c:"#6a7a8c"},{l:"Kudos",v:b.shoutouts.length,c:"#8c7a6a"},{l:"Actions",v:b.actions.length,c:"#6a8c78"}].map(m=>(
                        <div key={m.l} style={{textAlign:"center",padding:"6px 4px",borderRadius:"6px",background:`${m.c}0d`}}>
                          <div style={{fontSize:"16px",fontWeight:500,color:m.c}}>{m.v}</div>
                          <div style={{fontSize:"10px",color:T.s}}>{m.l}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{display:"flex",gap:"6px"}}>
                      <Btn onClick={()=>openBoard(b.id)} small color="linear-gradient(135deg,#6a7a8c,#8a9aaa)">Open</Btn>
                      <Btn onClick={()=>{ if(window.confirm(`Delete "${b.retro.title||"Untitled"}"? This cannot be undone.`)) deleteBoard(b.id); }} small ghost danger>Delete</Btn>
                    </div>
                  </Panel>
                );
              })}
            </div>
          }
        </div>
      )}
      {sumModal&&<SummaryModal board={boards.find(b=>b.id===sumBoardId)} text={sumText} setText={setSumText} generating={sumGen} onClose={()=>setSumModal(false)} onSave={saveSummary} onRegen={()=>openSummary(sumBoardId)} onUnpublish={unpublishSummary}/>}
    </div>
  );

  // ── FACILITATOR DASHBOARD ──
  if(screen==="facilitator") return wrap(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"2rem",flexWrap:"wrap",gap:"12px"}}>
        <div>
          <div style={{fontSize:"10px",fontWeight:500,letterSpacing:"0.12em",textTransform:"uppercase",color:T.acc,marginBottom:"4px"}}>Facilitator dashboard</div>
          <div style={{fontSize:"22px",fontWeight:500}}>Welcome, {currentAdmin?.displayName}</div>
          <div style={{fontSize:"12px",color:T.s,marginTop:"3px"}}>{myBoards.length} board{myBoards.length!==1?"s":""}</div>
        </div>
        <div style={{display:"flex",gap:"8px"}}>
          <Btn onClick={createBoard} color="linear-gradient(135deg,#6a8c78,#8aaa94)">+ New board</Btn>
          <Btn onClick={signOut} ghost>Sign out</Btn>
        </div>
      </div>
      {myBoards.length===0
        ?<div style={{padding:"4rem",textAlign:"center",border:"1px dashed rgba(120,113,108,0.25)",borderRadius:"16px"}}>
          <div style={{fontSize:"13px",color:T.s,marginBottom:"16px"}}>No boards yet. Create your first retro board.</div>
          <Btn onClick={createBoard}>Create board →</Btn>
        </div>
        :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"14px"}}>
          {myBoards.map(b=>{
            const doneA=b.actions.filter(a=>a.done).length;
            return(
              <Panel key={b.id} style={{padding:"20px 22px"}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:"8px"}}>
                  <div><div style={{fontSize:"14px",fontWeight:500,marginBottom:"2px"}}>{b.retro.title||"Untitled board"}</div><div style={{fontSize:"11px",color:T.s}}>{[b.retro.team,b.retro.startDate?fmtDate(b.retro.startDate):""].filter(Boolean).join(" · ")}</div></div>
                  <span style={{fontSize:"10px",fontWeight:500,padding:"3px 8px",borderRadius:"99px",background:b.published?"rgba(58,125,68,0.12)":"rgba(176,90,47,0.1)",color:b.published?"#1a3d20":"#4a1e0a",border:`1px solid ${b.published?"rgba(58,125,68,0.3)":"rgba(176,90,47,0.25)"}`}}>{b.published?"Live":"Draft"}</span>
                </div>
                <Hr/>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px",marginBottom:"12px"}}>
                  {[{l:"Cards",v:b.cards.length,c:"#6a7a8c"},{l:"Kudos",v:b.shoutouts.length,c:"#8c7a6a"},{l:"Actions",v:b.actions.length,c:"#6a8c78"}].map(m=>(
                    <div key={m.l} style={{textAlign:"center",padding:"8px 4px",borderRadius:"8px",background:`${m.c}0d`}}>
                      <div style={{fontSize:"18px",fontWeight:500,color:m.c}}>{m.v}</div>
                      <div style={{fontSize:"10px",color:T.s,marginTop:"1px"}}>{m.l}</div>
                    </div>
                  ))}
                </div>
                {b.actions.length>0&&(
                  <div style={{marginBottom:"12px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}><span style={{fontSize:"10px",color:T.s}}>Actions</span><span style={{fontSize:"10px",fontWeight:500,color:"#6a8c78"}}>{doneA}/{b.actions.length}</span></div>
                    <div style={{height:"4px",borderRadius:"99px",background:"rgba(106,140,120,0.15)",overflow:"hidden"}}><div style={{height:"100%",width:`${b.actions.length?Math.round(doneA/b.actions.length*100):0}%`,background:"linear-gradient(90deg,#6a8c78,#8aaa94)",borderRadius:"99px"}}/></div>
                  </div>
                )}
                <div style={{display:"flex",gap:"8px",alignItems:"center",marginBottom:"10px"}}>
                  <Btn onClick={e=>{e.stopPropagation();openSummary(b.id);}} small color="linear-gradient(135deg,#6a7a8c,#8a9aaa)">AI Summary</Btn>
                  {b.summaryPublished&&<span style={{fontSize:"10px",fontWeight:500,padding:"2px 8px",borderRadius:"99px",background:"rgba(106,140,120,0.12)",color:"#3a6050",border:"1px solid rgba(106,140,120,0.3)"}}>Summary live</span>}
                  <div style={{marginLeft:"auto",display:"flex",gap:"6px"}}>
                    <Btn onClick={()=>openBoard(b.id)} small ghost>Edit</Btn>
                    <Btn onClick={()=>{ if(window.confirm(`Delete "${b.retro.title||"Untitled board"}"? Cannot be undone.`)) deleteBoard(b.id); }} small ghost danger>Delete</Btn>
                  </div>
                </div>
                <div style={{padding:"6px 10px",borderRadius:"6px",background:"rgba(120,113,108,0.06)",border:`1px solid ${T.border}`}}>
                  <div style={{fontSize:"9px",color:T.t,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:"2px"}}>Board ID — share with team</div>
                  <div style={{fontSize:"11px",fontWeight:500,color:T.s,fontFamily:"monospace",wordBreak:"break-all"}}>{b.id}</div>
                </div>
              </Panel>
            );
          })}
        </div>
      }
      {sumModal&&<SummaryModal board={boards.find(b=>b.id===sumBoardId)} text={sumText} setText={setSumText} generating={sumGen} onClose={()=>setSumModal(false)} onSave={saveSummary} onRegen={()=>openSummary(sumBoardId)} onUnpublish={unpublishSummary}/>}
    </div>
  );

  // ── BOARD NOT FOUND ──
  if(!activeBoard) return wrap(<div style={{textAlign:"center",padding:"4rem",color:T.s}}>Board not found.</div>);

  const {retro,columns,cards,actions,shoutouts,events,published,context={}}=activeBoard;
  const exp       = cards.find(c=>c.id===expandedCard);
  const doneCount = actions.filter(a=>a.done).length;
  const phaseIdx  = PHASES.indexOf(phase);

  const PhaseNav = () => (
    <Panel style={{padding:"8px",minWidth:"172px"}}>
      {PHASES.map((p,i)=>{
        const done=i<phaseIdx,active=p===phase,locked=!isFacil&&(p==="setup"||p==="timeline");
        return(
          <button key={p} onClick={()=>!locked&&setPhase(p)} style={{display:"flex",alignItems:"center",gap:"10px",padding:"7px 10px",borderRadius:"8px",border:"none",cursor:locked?"not-allowed":"pointer",width:"100%",textAlign:"left",background:active?"rgba(122,111,101,0.1)":"transparent",opacity:locked?.4:1}}>
            <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"9px",fontWeight:500,background:active?"#7a6f65":done?"rgba(106,140,120,0.2)":"rgba(120,113,108,0.1)",color:active?"#fff":done?"#3a6050":T.t,border:active||done?"none":`1px solid ${T.border}`}}>
              {done?<svg width="9" height="9" viewBox="0 0 10 10"><polyline points="2,5 4,8 8,2" fill="none" stroke="#3a6050" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>:i+1}
            </div>
            <span style={{fontSize:"12px",fontWeight:active?500:400,color:active?T.p:done?T.s:T.t}}>{PHASE_LABELS[p]}</span>
            {locked&&<span style={{marginLeft:"auto",fontSize:"10px",color:T.t}}>🔒</span>}
          </button>
        );
      })}
    </Panel>
  );

  // ── BOARD VIEW ──
  return wrap(
    <div>
      <div style={{marginBottom:"2rem"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"16px",flexWrap:"wrap"}}>
          <div>
            <button onClick={()=>setScreen(isFacil?"facilitator":"login")} style={{fontSize:"11px",color:T.s,background:"transparent",border:"none",cursor:"pointer",padding:"0 0 8px",display:"flex",alignItems:"center",gap:"4px"}}>
              ← {isFacil?"My boards":"Back to login"}
            </button>
            <div style={{fontSize:"10px",fontWeight:500,letterSpacing:"0.12em",textTransform:"uppercase",color:T.acc,marginBottom:"6px"}}>Async retrospective</div>
            <div style={{fontSize:"24px",fontWeight:500}}>{retro.title||"Retro Board"}</div>
            <div style={{display:"flex",gap:"8px",marginTop:"8px",flexWrap:"wrap",alignItems:"center"}}>
              {retro.team&&<Tag label={retro.team} color="#7a6f65"/>}
              {(retro.startDate||retro.endDate)&&<Tag label={`${retro.startDate?fmtDate(retro.startDate):"?"} → ${retro.endDate?fmtDate(retro.endDate):"?"}`} color="#7a6f65"/>}
              <span style={{fontSize:"10px",fontWeight:500,padding:"3px 10px",borderRadius:"99px",background:published?"rgba(106,140,120,0.12)":"rgba(176,90,47,0.1)",color:published?"#3a6050":"#4a1e0a",border:`1px solid ${published?"rgba(106,140,120,0.3)":"rgba(176,90,47,0.25)"}`}}>{published?"Published":"Draft"}</span>
              <Tag label={isFacil?"Facilitator":"Participant"} color={isFacil?"#6a7a8c":"#6a8c78"}/>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"8px",alignItems:"flex-end"}}>
            {isFacil&&(
              <div style={{display:"flex",gap:"8px"}}>
                <Btn onClick={()=>openSummary(boardId)} small color="linear-gradient(135deg,#6a7a8c,#8a9aaa)">AI Summary</Btn>
                {!published?<Btn onClick={togglePublish} color="linear-gradient(135deg,#6a8c78,#8aaa94)">Publish →</Btn>:<Btn onClick={togglePublish} ghost>Unpublish</Btn>}
                <Btn onClick={()=>{ if(window.confirm(`Delete "${retro.title||"Untitled"}"? Cannot be undone.`)) deleteBoard(boardId); }} ghost danger small>Delete</Btn>
              </div>
            )}
            <PhaseNav/>
          </div>
        </div>
        <div style={{height:"1px",background:"rgba(120,113,108,0.12)",marginTop:"1.5rem"}}/>
      </div>

      {!isFacil&&(phase==="setup"||phase==="timeline")&&(
        <Panel style={{padding:"2.5rem",textAlign:"center",maxWidth:"480px",margin:"0 auto"}}>
          <div style={{fontSize:"24px",marginBottom:"12px"}}>🔒</div>
          <div style={{fontSize:"14px",fontWeight:500,marginBottom:"6px"}}>Facilitator only</div>
          <div style={{fontSize:"13px",color:T.s,marginBottom:"16px",lineHeight:1.6}}>Setup and timeline are managed by your facilitator.</div>
          <Btn onClick={()=>setPhase("context")} color="linear-gradient(135deg,#6a8c78,#8aaa94)">View context →</Btn>
        </Panel>
      )}

      {/* SETUP */}
      {phase==="setup"&&isFacil&&(
        <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:"2rem",alignItems:"start"}}>
          <div>
            <SL sub="Configure before publishing to your team.">Board setup</SL>
            <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
              {[["title","Retro title","e.g. Q2 Sprint 8 retro"],["team","Team / org","e.g. Platform team"]].map(([k,l,ph])=>(
                <div key={k}><label style={sl}>{l}</label><input value={retro[k]||""} onChange={e=>setRetroF(k,e.target.value)} placeholder={ph} style={si}/></div>
              ))}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
                <div><label style={sl}>Start date</label><CalPicker value={retro.startDate||""} onChange={d=>setRetroF("startDate",d)}/></div>
                <div><label style={sl}>End date</label><CalPicker value={retro.endDate||""} onChange={d=>setRetroF("endDate",d)}/></div>
              </div>
            </div>
            <Hr/>
            <Panel style={{padding:"14px 16px",marginBottom:"1rem"}}>
              <div style={{fontSize:"11px",fontWeight:500,color:T.s,marginBottom:"6px",letterSpacing:"0.04em",textTransform:"uppercase"}}>Board ID — share with participants</div>
              <div style={{fontFamily:"monospace",fontSize:"12px",fontWeight:500,color:T.acc,padding:"8px 12px",background:"rgba(120,113,108,0.06)",borderRadius:"6px",wordBreak:"break-all"}}>{boardId}</div>
            </Panel>
            {!published&&<Btn onClick={togglePublish} full color="linear-gradient(135deg,#6a8c78,#8aaa94)">Publish board for team →</Btn>}
          </div>
          <div>
            <SL sub="Define the columns participants will respond to.">Discussion columns</SL>
            <div style={{display:"flex",flexDirection:"column",gap:"8px",marginBottom:"12px"}}>
              {columns.map(col=>(
                <div key={col.id} style={{display:"flex",alignItems:"center",gap:"10px",padding:"10px 14px",borderRadius:"10px",border:`1px solid ${col.border}`,background:col.bg}}>
                  {col.emoji?<span style={{fontSize:"16px",lineHeight:1,flexShrink:0}}>{col.emoji}</span>:<Pip color={col.color} size={8}/>}
                  {editingCol===col.id
                    ?<input autoFocus value={col.label} onChange={e=>mutate("columns",c=>c.map(x=>x.id===col.id?{...x,label:e.target.value}:x))} onBlur={()=>setEditingCol(null)} onKeyDown={e=>e.key==="Enter"&&setEditingCol(null)} style={{...si,background:"transparent",border:"none",padding:"0",color:col.text,fontWeight:500,flex:1}}/>
                    :<span style={{flex:1,fontSize:"13px",fontWeight:500,color:col.text}}>{col.label}</span>
                  }
                  <button onClick={()=>setEditingCol(col.id)} style={{fontSize:"11px",background:"transparent",border:"none",color:col.color,cursor:"pointer"}}>edit</button>
                  <button onClick={()=>removeColumn(col.id)} style={{fontSize:"15px",background:"transparent",border:"none",color:col.color,cursor:"pointer",lineHeight:1}}>×</button>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:"8px"}}>
              <input value={newCol} onChange={e=>setNewCol(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addColumn()} placeholder="Add a column…" style={{...si,flex:1}}/>
              <Btn onClick={addColumn}>Add</Btn>
            </div>
          </div>
        </div>
      )}

      {/* CONTEXT */}
      {phase==="context"&&(
        <div style={{maxWidth:"700px"}}>
          <SL sub={isFacil?"Give participants background on the sprint period.":"Context set by your facilitator."}>Sprint context</SL>
          {isFacil?(
            <>
              <Panel style={{padding:"20px 24px",marginBottom:"1.25rem"}}>
                <label style={sl}>Context headline</label>
                <input value={context.headline||""} onChange={e=>setCtxF("headline",e.target.value)} placeholder="e.g. A challenging sprint with a major release…" style={{...si,marginBottom:"12px"}}/>
                <label style={sl}>Body / narrative</label>
                <textarea rows={4} value={context.body||""} onChange={e=>setCtxF("body",e.target.value)} placeholder="Provide more detail…" style={{...si,resize:"vertical",lineHeight:1.7}}/>
              </Panel>
              <Panel style={{padding:"20px 24px",marginBottom:"1.25rem"}}>
                <label style={sl}>Key highlights</label>
                <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
                  <input value={newHL} onChange={e=>setNewHL(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addHL()} placeholder="Add a highlight…" style={{...si,flex:1}}/>
                  <Btn onClick={addHL} small>Add</Btn>
                </div>
                {(context.highlights||[]).length===0?<div style={{fontSize:"12px",color:T.t,fontStyle:"italic"}}>No highlights yet</div>:(
                  <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                    {(context.highlights||[]).map(h=>(
                      <div key={h.id} style={{display:"flex",alignItems:"flex-start",gap:"8px",padding:"8px 12px",borderRadius:"8px",background:"rgba(120,113,108,0.04)",border:`1px solid ${T.border}`}}>
                        <span style={{color:T.acc,marginTop:"1px",flexShrink:0}}>◆</span>
                        <span style={{flex:1,fontSize:"13px",color:T.p,lineHeight:1.5}}>{h.text}</span>
                        <button onClick={()=>removeHL(h.id)} style={{fontSize:"14px",background:"transparent",border:"none",color:T.t,cursor:"pointer",padding:"0"}}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
              <Panel style={{padding:"20px 24px"}}>
                <label style={sl}>Reference links</label>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:"8px",marginBottom:"10px",alignItems:"end"}}>
                  <div><label style={{...sl,marginBottom:"4px"}}>Label</label><input value={newLink.label} onChange={e=>setNewLink(p=>({...p,label:e.target.value}))} placeholder="Sprint board" style={si}/></div>
                  <div><label style={{...sl,marginBottom:"4px"}}>URL</label><input value={newLink.url} onChange={e=>setNewLink(p=>({...p,url:e.target.value}))} placeholder="https://…" style={si}/></div>
                  <Btn onClick={addLink} small>Add</Btn>
                </div>
                {(context.links||[]).length===0?<div style={{fontSize:"12px",color:T.t,fontStyle:"italic"}}>No links yet</div>:(
                  <div style={{display:"flex",flexWrap:"wrap",gap:"8px"}}>
                    {(context.links||[]).map(l=>(
                      <div key={l.id} style={{display:"flex",alignItems:"center",gap:"6px",padding:"5px 12px",borderRadius:"99px",background:"rgba(106,122,140,0.1)",border:"1px solid rgba(106,122,140,0.2)"}}>
                        <span style={{fontSize:"12px",color:"#6a7a8c",fontWeight:500}}>{l.label}</span>
                        <button onClick={()=>removeLink(l.id)} style={{fontSize:"13px",background:"transparent",border:"none",color:T.t,cursor:"pointer",padding:"0"}}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </>
          ):(
            <div>
              {(!context.headline&&!context.body&&!(context.highlights||[]).length&&!(context.links||[]).length)
                ?<div style={{padding:"2.5rem",textAlign:"center",border:"1px dashed rgba(120,113,108,0.25)",borderRadius:"12px",fontSize:"13px",color:T.s}}>No context added yet.</div>
                :<>
                  {context.headline&&<div style={{fontSize:"18px",fontWeight:500,color:T.p,marginBottom:"12px",lineHeight:1.4}}>{context.headline}</div>}
                  {context.body&&<div style={{fontSize:"13px",color:T.s,lineHeight:1.8,marginBottom:"1.25rem",padding:"16px 20px",borderRadius:"10px",background:"rgba(255,255,255,0.7)",border:`1px solid ${T.border}`}}>{context.body}</div>}
                  {(context.highlights||[]).length>0&&(
                    <div style={{marginBottom:"1.25rem"}}>
                      <div style={{fontSize:"11px",fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase",color:T.acc,marginBottom:"10px"}}>Key highlights</div>
                      {(context.highlights||[]).map(h=>(
                        <div key={h.id} style={{display:"flex",alignItems:"flex-start",gap:"10px",padding:"10px 14px",borderRadius:"8px",background:"rgba(255,255,255,0.7)",border:`1px solid ${T.border}`,marginBottom:"6px"}}>
                          <span style={{color:T.acc,marginTop:"2px",flexShrink:0,fontSize:"10px"}}>◆</span>
                          <span style={{fontSize:"13px",color:T.p,lineHeight:1.6}}>{h.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(context.links||[]).length>0&&(
                    <div>
                      <div style={{fontSize:"11px",fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase",color:T.acc,marginBottom:"10px"}}>Reference links</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:"8px"}}>
                        {(context.links||[]).map(l=>(
                          <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:"5px",padding:"6px 14px",borderRadius:"99px",background:"rgba(106,122,140,0.1)",border:"1px solid rgba(106,122,140,0.25)",color:"#6a7a8c",fontSize:"12px",fontWeight:500,textDecoration:"none"}}>{l.label} ↗</a>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              }
            </div>
          )}
        </div>
      )}

      {/* TIMELINE */}
      {phase==="timeline"&&isFacil&&(
        <div style={{maxWidth:"700px"}}>
          <SL sub="Document key events, deliveries, and milestones.">Sprint timeline</SL>
          <Panel style={{padding:"20px 24px",marginBottom:"1.5rem"}}>
            <div style={{display:"grid",gridTemplateColumns:"200px 1fr 140px",gap:"12px",marginBottom:"12px"}}>
              <div><label style={sl}>Date</label><CalPicker value={newEvent.date} onChange={d=>setNewEvent(p=>({...p,date:d}))}/></div>
              <div><label style={sl}>Title</label><input value={newEvent.title} onChange={e=>setNewEvent(p=>({...p,title:e.target.value}))} placeholder="e.g. v3.1 released" style={si}/></div>
              <div><label style={sl}>Type</label><select value={newEvent.type} onChange={e=>setNewEvent(p=>({...p,type:e.target.value}))} style={{...si,cursor:"pointer"}}>{EVENT_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
            </div>
            <div style={{marginBottom:"14px"}}><label style={sl}>Notes</label><input value={newEvent.note} onChange={e=>setNewEvent(p=>({...p,note:e.target.value}))} placeholder="Context or outcome…" style={si}/></div>
            <Btn onClick={addEvent}>Add event →</Btn>
          </Panel>
          {events.length===0?<div style={{padding:"2rem",textAlign:"center",border:"1px dashed rgba(120,113,108,0.25)",borderRadius:"12px",fontSize:"13px",color:T.s}}>No events yet</div>:(
            <div style={{position:"relative",paddingLeft:"30px"}}>
              <div style={{position:"absolute",left:"10px",top:"16px",bottom:"16px",width:"1px",background:"linear-gradient(to bottom,rgba(122,111,101,0.4),rgba(122,111,101,0.05))"}}/>
              {events.map(ev=>{const et=evType(ev.type);return(
                <div key={ev.id} style={{position:"relative",marginBottom:"12px",display:"flex",gap:"12px"}}>
                  <div style={{position:"absolute",left:"-22px",top:"14px",width:"14px",height:"14px",borderRadius:"50%",background:et.color}}/>
                  <div style={{flex:1,padding:"14px 18px",borderRadius:"10px",border:`1px solid ${et.color}30`,background:`${et.color}0d`}}>
                    <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap",marginBottom:ev.note?"6px":"0"}}>
                      <Tag label={et.label} color={et.color}/>
                      <span style={{fontSize:"13px",fontWeight:500,color:T.p,flex:1}}>{ev.title}</span>
                      <span style={{fontSize:"11px",color:et.color,fontWeight:500}}>{fmtDate(ev.date)}</span>
                    </div>
                    {ev.note&&<div style={{fontSize:"12px",color:T.s,lineHeight:1.6}}>{ev.note}</div>}
                  </div>
                  <button onClick={()=>removeEvent(ev.id)} style={{fontSize:"16px",background:"transparent",border:"none",color:T.t,cursor:"pointer",padding:"12px 0 0"}}>×</button>
                </div>
              );})}
            </div>
          )}
        </div>
      )}

      {/* KUDOS */}
      {phase==="shoutouts"&&(
        <div style={{maxWidth:"600px"}}>
          <SL sub="Acknowledge outstanding contributions before diving into feedback.">Kudos board</SL>
          <Panel style={{padding:"20px 24px",marginBottom:"1.5rem"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"12px"}}>
              <div><label style={sl}>Recognizing</label><input value={newShoutout.to} onChange={e=>setNewShoutout(p=>({...p,to:e.target.value}))} placeholder="Name or role" style={si}/></div>
              <div><label style={sl}>From</label><input value={pName__} disabled style={{...si,opacity:.45}}/></div>
            </div>
            <div style={{marginBottom:"14px"}}><label style={sl}>Message</label><textarea rows={2} value={newShoutout.message} onChange={e=>setNewShoutout(p=>({...p,message:e.target.value}))} placeholder="Describe the contribution…" style={{...si,resize:"vertical",lineHeight:1.6}}/></div>
            <Btn onClick={addShoutout} color="linear-gradient(135deg,#8c7a6a,#aa9888)">Post kudos →</Btn>
          </Panel>
          {shoutouts.length===0?<div style={{padding:"2.5rem",textAlign:"center",border:"1px dashed rgba(140,122,106,0.3)",borderRadius:"12px",fontSize:"13px",color:T.s}}>No kudos yet!</div>:(
            <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              {shoutouts.map(s=>(
                <div key={s.id} style={{padding:"18px 20px",borderRadius:"12px",border:"1px solid rgba(140,122,106,0.25)",background:"rgba(140,122,106,0.07)",display:"flex",gap:"14px"}}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#8c7a6a,#aa9888)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:"16px",color:"#fff"}}>★</span></div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:"13px",fontWeight:500,color:"#3a2a1a",marginBottom:"4px"}}>{s.to}</div>
                    <div style={{fontSize:"13px",color:"#5a4a3a",lineHeight:1.6}}>{s.message}</div>
                    <div style={{fontSize:"11px",color:"#8c7a6a",marginTop:"8px"}}>from {s.from}</div>
                  </div>
                  {(isFacil||s.from===pName__)&&<button onClick={()=>removeShoutout(s.id)} style={{fontSize:"16px",background:"transparent",border:"none",color:"rgba(140,122,106,0.5)",cursor:"pointer",padding:"0"}}>×</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* COLLECT */}
      {phase==="collect"&&(
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.25rem",flexWrap:"wrap",gap:"8px"}}>
            <SL sub={`Submitting as ${pName__}`}>Collect responses</SL>
            <div style={{display:"flex",gap:"12px",marginBottom:"1.25rem"}}>
              {columns.map(col=><div key={col.id} style={{display:"flex",alignItems:"center",gap:"5px"}}><Pip color={col.color} size={6}/><span style={{fontSize:"11px",fontWeight:500,color:T.s}}>{cards.filter(c=>c.colId===col.id).length}</span></div>)}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(columns.length,3)},minmax(0,1fr))`,gap:"14px"}}>
            {columns.map((col,ci)=>{
              const colCards=cards.filter(c=>c.colId===col.id);
              const pat=COL_PATS[ci%COL_PATS.length];
              return(
                <div key={col.id} style={{borderRadius:"14px",border:`1px solid ${col.border}`,overflow:"hidden"}}>
                  <div style={{padding:"12px 16px",background:`${col.color}15`,backgroundImage:pat,borderBottom:`1px solid ${col.border}`,display:"flex",alignItems:"center",gap:"8px"}}>
                    {col.emoji?<span style={{fontSize:"16px",lineHeight:1,flexShrink:0}}>{col.emoji}</span>:<Pip color={col.color} size={8}/>}
                    <span style={{fontSize:"12px",fontWeight:500,color:col.text}}>{col.label}</span>
                    {colCards.length>0&&<span style={{marginLeft:"auto",fontSize:"10px",fontWeight:500,color:col.color,border:`1px solid ${col.color}`,borderRadius:"99px",padding:"2px 8px"}}>{colCards.length}</span>}
                  </div>
                  <div style={{padding:"14px",background:"rgba(255,255,255,0.55)",backgroundImage:pat}}>
                    <textarea rows={3} value={drafts[col.id]||""} onChange={e=>setDrafts(p=>({...p,[col.id]:e.target.value}))} placeholder="Share your perspective…" style={{...si,resize:"vertical",lineHeight:1.6,marginBottom:"10px",background:"rgba(255,255,255,0.85)",border:`1px solid ${col.border}`}}/>
                    <Btn onClick={()=>submitCard(col.id)} color={`linear-gradient(135deg,${col.color}88,${col.color}aa)`}>Submit →</Btn>
                  </div>
                  <div style={{padding:"0 14px 14px",background:"rgba(255,255,255,0.4)",backgroundImage:pat,display:"flex",flexDirection:"column",gap:"8px"}}>
                    {colCards.map(card=>(
                      <div key={card.id} onClick={()=>setExpandedCard(expandedCard===card.id?null:card.id)} style={{padding:"12px 14px",borderRadius:"10px",cursor:"pointer",border:expandedCard===card.id?`1px solid ${col.color}`:`1px solid ${col.border}`,background:expandedCard===card.id?`${col.color}12`:"rgba(255,255,255,0.8)"}}>
                        <div style={{fontSize:"13px",lineHeight:1.6,color:T.p}}>{card.text}</div>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:"8px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:"6px"}}><Av name={card.author} color={col.color} size={20}/><span style={{fontSize:"11px",color:T.s}}>{card.author}</span></div>
                          {card.comments.length>0&&<span style={{fontSize:"10px",fontWeight:500,color:col.color}}>{card.comments.length} {card.comments.length===1?"reply":"replies"}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DISCUSS */}
      {phase==="discuss"&&(
        <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,340px)",gap:"20px",alignItems:"start"}}>
          <div>
            <SL sub={`${cards.length} responses across ${columns.length} topics`}>Discussion</SL>
            {columns.map((col,ci)=>{
              const colCards=cards.filter(c=>c.colId===col.id);
              if(!colCards.length)return null;
              const pat=COL_PATS[ci%COL_PATS.length];
              return(
                <div key={col.id} style={{marginBottom:"1.5rem"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"10px",paddingBottom:"8px",borderBottom:`1px solid ${col.border}`}}>
                    {col.emoji?<span style={{fontSize:"14px",lineHeight:1}}>{col.emoji}</span>:<Pip color={col.color} size={8}/>}
                    <span style={{fontSize:"11px",fontWeight:500,color:col.text,letterSpacing:"0.05em",textTransform:"uppercase"}}>{col.label}</span>
                    <span style={{fontSize:"11px",color:col.color}}>({colCards.length})</span>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                    {colCards.map(card=>(
                      <div key={card.id} onClick={()=>setExpandedCard(expandedCard===card.id?null:card.id)} style={{padding:"12px 16px",borderRadius:"10px",cursor:"pointer",border:expandedCard===card.id?`1px solid ${col.color}`:`1px solid ${col.border}`,background:expandedCard===card.id?`${col.color}12`:"rgba(255,255,255,0.75)",backgroundImage:expandedCard===card.id?"none":pat}}>
                        <div style={{fontSize:"13px",lineHeight:1.6,color:T.p}}>{card.text}</div>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:"8px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:"6px"}}><Av name={card.author} color={col.color} size={20}/><span style={{fontSize:"11px",color:T.s}}>{card.author}</span></div>
                          {card.comments.length>0&&<span style={{fontSize:"10px",fontWeight:500,color:col.color}}>{card.comments.length} {card.comments.length===1?"reply":"replies"}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{position:"sticky",top:"1rem"}}>
            {exp?(()=>{
              const col=columns.find(c=>c.id===exp.colId)||{color:"#888",bg:"#eee",text:"#333",border:T.border};
              return(
                <div style={{borderRadius:"14px",border:`1px solid ${col.border}`,overflow:"hidden",background:"rgba(255,255,255,0.92)"}}>
                  <div style={{padding:"12px 16px",background:`${col.color}15`,borderBottom:`1px solid ${col.border}`,display:"flex",alignItems:"center",gap:"8px"}}>
                    {col.emoji?<span style={{fontSize:"14px"}}>{col.emoji}</span>:<Pip color={col.color} size={8}/>}
                    <span style={{fontSize:"12px",fontWeight:500,color:col.text,flex:1}}>{col.label}</span>
                    <Btn onClick={()=>setExpandedCard(null)} ghost small>close</Btn>
                  </div>
                  <div style={{padding:"18px 20px"}}>
                    <div style={{fontSize:"14px",lineHeight:1.7,marginBottom:"14px",color:T.p}}>{exp.text}</div>
                    <div style={{display:"flex",alignItems:"center",gap:"8px",paddingBottom:"14px",borderBottom:"1px solid rgba(120,113,108,0.1)",marginBottom:"14px"}}>
                      <Av name={exp.author} color={col.color} size={24}/><span style={{fontSize:"12px",color:T.s}}>{exp.author}</span>
                    </div>
                    {exp.comments.map(cm=>(
                      <div key={cm.id} style={{marginBottom:"12px",paddingLeft:"14px",borderLeft:`2px solid ${col.color}40`}}>
                        <div style={{fontSize:"13px",lineHeight:1.6,color:T.p}}>{cm.text}</div>
                        <div style={{fontSize:"11px",color:T.s,marginTop:"4px"}}>{cm.author}</div>
                      </div>
                    ))}
                    <textarea rows={2} value={commentDraft} onChange={e=>setCommentDraft(e.target.value)} placeholder="Add a reply…" style={{...si,resize:"vertical",lineHeight:1.6,marginTop:exp.comments.length?"12px":"0",marginBottom:"10px"}}/>
                    <div style={{display:"flex",gap:"8px"}}>
                      <Btn onClick={addComment}>Reply →</Btn>
                      {(isFacil||exp.author===pName__)&&<Btn onClick={()=>removeCard(exp.id)} ghost danger>Remove</Btn>}
                    </div>
                  </div>
                </div>
              );
            })():(
              <div style={{padding:"3rem 2rem",textAlign:"center",border:"1px dashed rgba(120,113,108,0.25)",borderRadius:"14px"}}>
                <div style={{fontSize:"13px",color:T.s}}>Select a card to view its thread</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ACTIONS */}
      {phase==="actions"&&(
        <div style={{maxWidth:"700px"}}>
          {actions.length>0&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"12px",marginBottom:"2rem"}}>
              {[{l:"Total",v:actions.length,c:"#6a7a8c"},{l:"Completed",v:doneCount,c:"#6a8c78"},{l:"Remaining",v:actions.length-doneCount,c:"#8c7a6a"}].map(m=>(
                <div key={m.l} style={{padding:"18px 20px",borderRadius:"12px",background:`${m.c}10`,border:`1px solid ${m.c}30`}}>
                  <div style={{fontSize:"10px",fontWeight:500,letterSpacing:"0.09em",textTransform:"uppercase",color:m.c,marginBottom:"8px"}}>{m.l}</div>
                  <div style={{fontSize:"30px",fontWeight:500,color:m.c,lineHeight:1}}>{m.v}</div>
                </div>
              ))}
            </div>
          )}
          <SL sub={isFacil?"Define clear owners and deadlines.":"Action items set by your facilitator."}>Action items</SL>
          {isFacil&&(
            <Panel style={{padding:"20px 24px",marginBottom:"1.5rem"}}>
              <div style={{marginBottom:"12px"}}><label style={sl}>Action</label><input value={newAction.text} onChange={e=>setNewAction(p=>({...p,text:e.target.value}))} placeholder="What needs to happen?" style={si}/></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"14px"}}>
                <div><label style={sl}>Owner</label><input value={newAction.owner} onChange={e=>setNewAction(p=>({...p,owner:e.target.value}))} placeholder="Accountable individual" style={si}/></div>
                <div><label style={sl}>Due date</label><CalPicker value={newAction.due} onChange={d=>setNewAction(p=>({...p,due:d}))}/></div>
              </div>
              <Btn onClick={addAction}>Add action item →</Btn>
            </Panel>
          )}
          {actions.length===0
            ?<div style={{padding:"2.5rem",textAlign:"center",border:"1px dashed rgba(120,113,108,0.25)",borderRadius:"12px",fontSize:"13px",color:T.s}}>{isFacil?"No action items yet":"No action items added yet"}</div>
            :<div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
              {actions.map((a,i)=>(
                <div key={a.id} style={{display:"flex",alignItems:"flex-start",gap:"14px",padding:"14px 18px",borderRadius:"12px",border:`1px solid ${a.done?"rgba(106,140,120,0.25)":"rgba(120,113,108,0.15)"}`,background:a.done?"rgba(106,140,120,0.06)":"rgba(255,255,255,0.7)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"10px",paddingTop:"1px"}}>
                    <span style={{fontSize:"10px",fontWeight:500,color:T.t,minWidth:14,textAlign:"right"}}>{i+1}</span>
                    <input type="checkbox" checked={a.done} onChange={()=>isFacil&&toggleAction(a.id)} style={{flexShrink:0,cursor:isFacil?"pointer":"default",accentColor:"#6a8c78"}}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:"13px",fontWeight:500,textDecoration:a.done?"line-through":"none",color:a.done?T.t:T.p,lineHeight:1.5}}>{a.text}</div>
                    <div style={{display:"flex",gap:"10px",marginTop:"6px",flexWrap:"wrap",alignItems:"center"}}>
                      {a.owner&&<div style={{display:"flex",alignItems:"center",gap:"6px"}}><Av name={a.owner} color="#6a7a8c" size={20}/><span style={{fontSize:"12px",color:T.s}}>{a.owner}</span></div>}
                      {a.due&&<span style={{fontSize:"11px",color:T.s}}>Due {fmtDate(a.due)}</span>}
                      {a.done&&<Tag label="Complete" color="#6a8c78"/>}
                    </div>
                  </div>
                  {isFacil&&<button onClick={()=>removeAction(a.id)} style={{fontSize:"16px",background:"transparent",border:"none",color:T.t,cursor:"pointer",padding:"0"}}>×</button>}
                </div>
              ))}
            </div>
          }
          {!isFacil&&activeBoard?.summaryPublished&&activeBoard?.summary&&(()=>{
            let parsed=null; try{parsed=JSON.parse(activeBoard.summary);}catch(_){}
            const h=parsed?.overallHealth||"Amber";
            const hc={Green:"#3a7d44",Amber:"#a07820",Red:"#a05050"};
            const pc={High:"#a05050",Medium:"#a07820",Low:"#6a8c78"};
            return(
              <div style={{marginTop:"2rem",padding:"20px 24px",borderRadius:"14px",border:"1px solid rgba(106,122,140,0.25)",background:"rgba(106,122,140,0.04)"}}>
                <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"16px"}}>
                  <span style={{fontSize:"11px",fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase",color:"#6a7a8c"}}>Retro summary — published by facilitator</span>
                </div>
                {parsed?(
                  <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
                    <div style={{display:"flex",gap:"10px",alignItems:"flex-start"}}>
                      <div style={{padding:"10px 14px",borderRadius:"10px",background:`rgba(${h==="Green"?"58,125,68":h==="Amber"?"160,120,32":"160,80,80"},0.08)`,border:`1px solid ${hc[h]}30`,textAlign:"center",minWidth:"70px"}}>
                        <div style={{fontSize:"16px",fontWeight:500,color:hc[h]}}>{h==="Green"?"●":h==="Amber"?"◐":"○"}</div>
                        <div style={{fontSize:"10px",color:hc[h],fontWeight:500,marginTop:"3px",textTransform:"uppercase"}}>{h}</div>
                      </div>
                      <div style={{flex:1,fontSize:"13px",color:T.p,lineHeight:1.7}}>{parsed.executiveSummary}</div>
                    </div>
                    {(parsed.criticalActions||[]).length>0&&(
                      <div>
                        <div style={{fontSize:"10px",fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase",color:T.t,marginBottom:"8px"}}>Action items</div>
                        {parsed.criticalActions.map((a,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:"8px",padding:"8px 12px",borderRadius:"8px",background:"rgba(255,255,255,0.7)",border:`1px solid ${T.border}`,marginBottom:"5px"}}>
                            <div style={{width:7,height:7,borderRadius:"50%",background:pc[a.priority]||T.s,flexShrink:0}}/>
                            <div style={{flex:1,fontSize:"12px",color:T.p}}>{a.action}</div>
                            {a.owner&&<span style={{fontSize:"11px",color:T.s}}>{a.owner}</span>}
                            {a.due&&<span style={{fontSize:"11px",color:T.s}}>Due {a.due}</span>}
                            <span style={{fontSize:"10px",fontWeight:500,padding:"2px 7px",borderRadius:"99px",background:a.status==="Done"?"rgba(106,140,120,0.15)":"rgba(160,120,32,0.12)",color:a.status==="Done"?"#3a6050":"#6a4a10"}}>{a.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(parsed.recommendedNextSteps||[]).length>0&&(
                      <div>
                        <div style={{fontSize:"10px",fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase",color:T.t,marginBottom:"8px"}}>→ Next steps</div>
                        {parsed.recommendedNextSteps.map((s,i)=>(
                          <div key={i} style={{display:"flex",gap:"7px",marginBottom:"6px",alignItems:"flex-start"}}>
                            <span style={{width:16,height:16,borderRadius:"50%",background:"rgba(106,122,140,0.15)",color:"#6a7a8c",fontSize:"9px",fontWeight:500,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:"1px"}}>{i+1}</span>
                            <span style={{fontSize:"12px",color:T.p,lineHeight:1.5}}>{s}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ):<div style={{fontSize:"13px",lineHeight:1.9,color:T.p,whiteSpace:"pre-wrap"}}>{activeBoard.summary}</div>}
              </div>
            );
          })()}
        </div>
      )}
      {sumModal&&<SummaryModal board={boards.find(b=>b.id===sumBoardId)} text={sumText} setText={setSumText} generating={sumGen} onClose={()=>setSumModal(false)} onSave={saveSummary} onRegen={()=>openSummary(sumBoardId)} onUnpublish={unpublishSummary}/>}
    </div>
  );
}
