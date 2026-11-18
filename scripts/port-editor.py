#!/usr/bin/env python3
"""One-off port: reference/trip-mindmap.html -> src/editor/editor.js, src/editor/markup.ts, styles.css.

Every rewrite is an exact replacement with an asserted match count, so if the
reference changes the port fails loudly instead of silently drifting.
Run from the repo root:  python3 scripts/port-editor.py
"""
import re, sys

SRC = open('reference/trip-mindmap.html').read()


def R(t, a, b, n=1):
    c = t.count(a)
    if c != n:
        sys.exit(f'port-editor: expected {n} match(es), found {c}: {a[:100]!r}')
    return t.replace(a, b)


def replace_fn(lines, name, new):
    """Replace a top-level `function name(` definition and its indented continuation lines."""
    idx = [i for i, l in enumerate(lines) if l.startswith(f'function {name}(')]
    if len(idx) != 1:
        sys.exit(f'port-editor: function {name} found {len(idx)} times')
    i = idx[0]
    j = i + 1
    while j < len(lines) and lines[j].startswith(' '):
        j += 1
    lines[i:j] = [new] if new is not None else []


# ---------------------------------------------------------------- script
s0 = SRC.index('<script>\n(function(){') + len('<script>\n(function(){\n')
s1 = SRC.index('})();\n</script>', s0)
js = SRC[s0:s1]

# The big model/storage/gazetteer/agent-logic regions are replaced wholesale.
def cut(t, start, end, new):
    a = t.index(start)
    b = t.index(end, a)
    return t[:a] + new + t[b:]

js = cut(js, 'function newNode(text,parent,o)', 'const N=id=>cur.nodes[id];', 'const newNode=mkNode;\n')
js = cut(js, '/* ---------- map list ---------- */', '/* ---------- route map ---------- */',
         '/* ---------- storage: the host owns the file ---------- */\n'
         'let saveT=null;\n'
         'function dirty(){if(!cur||RO)return;if(AG.preview)return;cur.updatedAt=Date.now();opts.onChange&&opts.onChange(cur)}\n'
         'function flushNow(){}\nfunction renderList(){}\n\n')
js = cut(js, 'const GAZ=[', 'function computeRoute(){',
         "function placeOf(id){return placeOfDoc(cur,id)}\n"
         "$('#placeList').innerHTML=PLACE_NAMES.map(g=>`<option value=\"${esc(g)}\">`).join('')+'<option value=\"None\">';\n"
         '/* Stays (date ranges) and fixed bookings with a place become stops; overlapping maybes are alternatives. */\n')

lines = js.split('\n')
F = lambda n, new: replace_fn(lines, n, new)
F('isDesc', 'function isDesc(a,b){return OPS.isDesc(cur,a,b)}')
F('groupOf', 'function groupOf(id){return OPS.groupOf(cur,id)}')
F('colorKeyOf', 'function colorKeyOf(id){return OPS.colorKeyOf(cur,id)}')
F('setColor', 'function setColor(id,c){const n=N(id);if(!n||(n.color||null)===(c||null))return;mutate(()=>OPS.setColor(cur,id,c||null))}')
F('mutate', 'function mutate(fn){if(RO)return;undo.push(snapState());if(undo.length>200)undo.shift();redo=[];fn();changed()}\n'
            'function tryMutate(fn){if(RO)return false;const s=snapState();if(!fn())return false;undo.push(s);if(undo.length>200)undo.shift();redo=[];changed();return true}')
F('addChild', 'function addChild(pid,edit=true){if(RO)return null;let id;mutate(()=>{id=OPS.addChild(cur,pid);sel=id});if(edit)startEdit(id,true);return id}')
F('addSibling', 'function addSibling(id){if(RO)return;if(!id||id===cur.rootId)return addChild(cur.rootId);let nid;mutate(()=>{nid=OPS.addSibling(cur,id);sel=nid});startEdit(nid,true)}')
F('addNext', 'function addNext(id){if(RO||!TRIP())return;if(!id||id===cur.rootId){addChild(cur.rootId);return}let nid;mutate(()=>{nid=OPS.addNext(cur,id);sel=nid});startEdit(nid,true)}')
F('toggleNext', 'function toggleNext(id){if(!TRIP()||!id||id===cur.rootId)return;const n=N(id);if(n.parent===cur.rootId&&!n.next)return;mutate(()=>OPS.toggleNext(cur,id))}')
F('delNode', 'function delNode(id){if(!id||id===cur.rootId)return;mutate(()=>{sel=OPS.delNode(cur,id)})}')
F('reorder', 'function reorder(id,d){if(!id||id===cur.rootId)return;tryMutate(()=>OPS.reorder(cur,id,d))}')
F('reparent', 'function reparent(id,tid,side){tryMutate(()=>OPS.reparent(cur,id,tid,undefined,side))}')
F('setDates', 'function setDates(id,s,e){OPS.setDates(cur,id,s,e)}')
F('sideOf', 'function sideOf(id){return OPS.sideOf(cur,id)}')
F('nextOf', 'function nextOf(id){return OPS.nextOf(cur,id)}')
F('normalize', 'function normalize(){if(!cur)return;GROUPS=null;OPS.normalize(cur)}')
F('computeRoute', 'function computeRoute(){return computeRouteDoc(cur)}')
F('agOutline', None)
F('agSet', None)
F('agRawDelete', None)
F('agApply', 'function agApply(ops){const r=applyOps(cur,ops);return{touched:new Set(r.touched),lines:r.lines,skipped:r.skipped}}')
F('agDesc', 'function agDesc(n){return describeNode(cur,n)}')
F('renderAll', "function renderAll(){if(!cur)return;normalize();root.classList.toggle('mm-general',!TRIP());root.classList.toggle('mm-ro',RO);"
               "const ti=$('#title');if(ti&&document.activeElement!==ti)ti.value=titleText;renderMap();renderInsp();renderCal();scheduleRoute()}")
F('setCal', 'function setCal(on){if(!TRIP())return;cur.cal=on;dirty();renderAll();requestAnimationFrame(fit)}')
js = '\n'.join(lines)

# agRules is a multi-line template literal: replace by marker range
js = cut(js, 'function agRules(){', 'const okDate=', 'function agRules(){return aiRules(cur,toIso(todayN))}\n')

# --- globals -> editor-scoped
js = R(js, 'const $=s=>document.querySelector(s);\n', '')
js = R(js, "const LS_KEY='tripmindmap.maps.v1', LS_LAST='tripmindmap.last';\n", '')
js = R(js, "lsGet('tripmindmap.notes')", "lsGet('mindmap.notes')")
js = R(js, "lsSet('tripmindmap.notes'", "lsSet('mindmap.notes'", 2)
js = R(js, "lsGet('tripmindmap.route')==='1'", "lsGet('mindmap.route')==='1'&&!RO")
js = R(js, "lsSet('tripmindmap.route'", "lsSet('mindmap.route'")
js = R(js, "document.querySelectorAll('.hov')", "root.querySelectorAll('.hov')")
js = R(js, "if(id)document.querySelectorAll(`[data-id=", "if(id)root.querySelectorAll(`[data-id=")
js = R(js, "document.querySelectorAll('#modes button')", "root.querySelectorAll('#modes button')", 2)
js = R(js, "document.addEventListener('pointerdown',", "on(document,'pointerdown',")
js = R(js, "document.addEventListener('keydown',e=>{", "on(root,'keydown',e=>{if(RO)return;")
js = R(js, "$('#helpBtn').onclick=", "on(root,'keydown',e=>{if(e.defaultPrevented)e.stopPropagation()});\n$('#helpBtn').onclick=")
js = R(js, "document.addEventListener('fullscreenchange',", "on(document,'fullscreenchange',")
js = R(js, "addEventListener('resize',", "on(window,'resize',")
js = R(js, "new ResizeObserver(()=>{if(cur&&!barDrag){applyView()}}).observe(mapPane);",
       "const ro=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>{if(cur&&!barDrag){applyView()}}):null;if(ro){ro.observe(mapPane);cleanups.push(()=>ro.disconnect())}")
js = R(js, "const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;",
       "const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;")
js = R(js, "try{const t=JSON.parse(document.getElementById('landData').textContent);landGeo=topojson.feature(t,t.objects.land)}",
       "try{landGeo=topoFeature(landTopo,landTopo.objects.land)}")
js = R(js, "if(!window.d3||!window.topojson){", "if(false){")

# --- canvas text measuring (injectable for tests)
js = R(js, "const mctx=document.createElement('canvas').getContext('2d');",
       "const mctx=(()=>{let c=null;try{c=document.createElement('canvas').getContext('2d')}catch(e){}return c||{font:'',measureText:t=>({width:String(t).length*7})}})();")
js = R(js, "function tw(t,root){mctx.font=(root?'600 15px':'500 13px')+' Inter, system-ui, sans-serif';return mctx.measureText(t).width}",
       "function tw(t,isRoot){const font=(isRoot?'600 15px':'500 13px')+' Inter, system-ui, sans-serif';if(opts.measureText)return opts.measureText(t,font);mctx.font=font;return mctx.measureText(t).width}")

# --- trip-only behaviour in general maps
js = R(js, "const cap=!isR&&n.start?15:0;", "const cap=!isR&&n.start&&TRIP()?15:0;", 2)
js = R(js, "else if(n.maybe){fill=", "else if(n.maybe&&TRIP()){fill=")
js = R(js, "(isR?`<span class=\"hint\">The centre of the map. Dates go on the ideas around it.</span>`:",
       "(isR?(TRIP()?`<span class=\"hint\">The centre of the map. Dates go on the ideas around it.</span>`:''):!TRIP()?'':")
js = R(js, "insp.innerHTML=`<span class=\"hint\">Select an idea to give it dates.",
       "insp.innerHTML=`<span class=\"hint\">Select an idea${TRIP()?' to give it dates':''}.")
js = R(js, "  if(isR)return;\n  const dS=$('#dS')", "  if(isR||!TRIP())return;\n  const dS=$('#dS')")
js = R(js, "...(isR?[]:[['nextadd','Add next stop','Ctrl+Enter'],", "...(isR||!TRIP()?[]:[['nextadd','Add next stop','Ctrl+Enter'],")
js = R(js, "...(isR?[]:[['dates','Set dates','Ctrl+D'],", "...(isR||!TRIP()?[]:[['dates','Set dates','Ctrl+D'],")
js = R(js, "case'maybe':if(sel!==cur.rootId)", "case'maybe':if(TRIP()&&sel!==cur.rootId)")
js = R(js, "case'fixed':if(sel!==cur.rootId)", "case'fixed':if(TRIP()&&sel!==cur.rootId)")
js = R(js, "case'dates':focusDates();break;", "case'dates':if(TRIP())focusDates();break;")
js = R(js, "  $('#modes').hidden=!cur.cal;", "  const calOn=cur.cal&&TRIP();$('#modes').hidden=!calOn;")
js = R(js, "  if(!cur.cal){calPane.hidden=true;threads.innerHTML='';return}", "  if(!calOn){calPane.hidden=true;threads.innerHTML='';return}")
js = R(js, "  if(mod&&lk==='k'){e.preventDefault();setCal(!cur.cal);return}", "  if(mod&&lk==='k'){e.preventDefault();if(TRIP())setCal(!cur.cal);return}")
js = R(js, "  if(mod&&lk==='d'){e.preventDefault();if(!sel)select(cur.rootId);focusDates();return}",
       "  if(mod&&lk==='d'){e.preventDefault();if(!TRIP())return;if(!sel)select(cur.rootId);focusDates();return}")
js = R(js, "  if(mod&&k==='Enter'){e.preventDefault();addNext(sel||cur.rootId);return}", "  if(mod&&k==='Enter'){e.preventDefault();if(TRIP())addNext(sel||cur.rootId);return}")
js = R(js, "  if(cur.cal&&!e.altKey&&(k==='1'", "  if(TRIP()&&cur.cal&&!e.altKey&&(k==='1'")
js = R(js, "  if(lk==='r'&&!e.altKey){e.preventDefault();setRoute(!routeOpen);return}", "  if(lk==='r'&&!e.altKey){e.preventDefault();if(TRIP())setRoute(!routeOpen);return}")
js = R(js, "  if(lk==='m'&&!e.altKey){e.preventDefault();act('maybe');return}", "  if(lk==='m'&&!e.altKey){e.preventDefault();if(TRIP())act('maybe');return}")
js = R(js, "  if(lk==='f'&&!e.altKey){e.preventDefault();act('fixed');return}", "  if(lk==='f'&&!e.altKey){e.preventDefault();if(TRIP())act('fixed');return}")
js = R(js, "  if(lk==='n'&&!e.altKey){e.preventDefault();toggleNext(sel);return}", "  if(lk==='n'&&!e.altKey){e.preventDefault();if(TRIP())toggleNext(sel);return}")
js = R(js, "function scheduleRoute(){if(!routeOpen||animating)return;", "function scheduleRoute(){if(!routeOpen||animating||!TRIP())return;")

# --- title: the header shows the file name; editing it renames the file
js = R(js, "$('#title').addEventListener('input',e=>{cur.title=e.target.value;N(cur.rootId).text=e.target.value;cur.updatedAt=Date.now();dirty();renderMap();renderList();if(sel===cur.rootId)renderInsp()});\n",
       "$('#title').addEventListener('change',e=>{const v=e.target.value.trim();if(v&&v!==titleText&&opts.onRename)opts.onRename(v);else e.target.value=titleText});\n")
js = R(js, "$('#bannerX').onclick=()=>{cur.example=false;$('#banner').hidden=true;if(!cur.unsaved)dirty()};\n", '')

# --- read-only embeds: no editing gestures
js = R(js, "  if(g){const id=g.dataset.id;if(editing", "  if(g&&RO){pan={sx:e.clientX,sy:e.clientY,tx:view.tx,ty:view.ty,moved:false};mapSvg.setPointerCapture?.(e.pointerId);return}\n  if(g){const id=g.dataset.id;if(editing")
js = R(js, "dragNode={id,sx:e.clientX,sy:e.clientY,moved:false,el:null};mapSvg.setPointerCapture(e.pointerId)}",
       "dragNode={id,sx:e.clientX,sy:e.clientY,moved:false,el:null};mapSvg.setPointerCapture?.(e.pointerId);"
       "clearTimeout(lp);const lx=e.clientX,ly=e.clientY;if(e.pointerType!=='mouse')lp=setTimeout(()=>{lp=null;if(dragNode&&!dragNode.moved){dragNode=null;showCtx(lx,ly)}},500)}")
js = R(js, "pan={sx:e.clientX,sy:e.clientY,tx:view.tx,ty:view.ty,moved:false};mapSvg.setPointerCapture(e.pointerId);mapSvg.classList.add('panning')}});",
       "pan={sx:e.clientX,sy:e.clientY,tx:view.tx,ty:view.ty,moved:false};mapSvg.setPointerCapture?.(e.pointerId);mapSvg.classList.add('panning')}});")
js = R(js, "  if(dragNode){const dx=e.clientX-dragNode.sx,dy=e.clientY-dragNode.sy;if(!dragNode.moved&&Math.hypot(dx,dy)<6)return;",
       "  if(pinch)return;\n  if(dragNode){const dx=e.clientX-dragNode.sx,dy=e.clientY-dragNode.sy;if(Math.hypot(dx,dy)>8){clearTimeout(lp);lp=null}if(!dragNode.moved&&Math.hypot(dx,dy)<6)return;")
js = R(js, "const endPtr=e=>{mapSvg.classList.remove('panning');", "const endPtr=e=>{mapSvg.classList.remove('panning');clearTimeout(lp);lp=null;")
js = R(js, "mapSvg.addEventListener('dblclick',e=>{const p=", "mapSvg.addEventListener('dblclick',e=>{if(RO){opts.onOpen&&opts.onOpen();return}const p=")
js = R(js, "mapSvg.addEventListener('contextmenu',e=>{e.preventDefault();", "mapSvg.addEventListener('contextmenu',e=>{e.preventDefault();if(RO)return;")
js = R(js, "mapSvg.addEventListener('wheel',e=>{e.preventDefault();", "mapSvg.addEventListener('wheel',e=>{if(RO&&!(e.ctrlKey||e.metaKey))return;e.preventDefault();")
js = R(js, "let pan=null;", "let pan=null,lp=null,pinch=null;const ptrs=new Map();\n"
       "mapSvg.addEventListener('pointerdown',e=>{ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});if(ptrs.size===2){const[a,b]=[...ptrs.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1};clearTimeout(lp);lp=null;dragNode=null;pan=null}},true);\n"
       "mapSvg.addEventListener('pointermove',e=>{if(!ptrs.has(e.pointerId))return;ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pinch&&ptrs.size===2){const[a,b]=[...ptrs.values()];const d=Math.hypot(a.x-b.x,a.y-b.y)||1;const r=mapSvg.getBoundingClientRect();zoomAt(d/pinch.d,(a.x+b.x)/2-r.left,(a.y+b.y)/2-r.top);pinch.d=d}},true);\n"
       "const ptrEnd=e=>{ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null};mapSvg.addEventListener('pointerup',ptrEnd,true);mapSvg.addEventListener('pointercancel',ptrEnd,true);")

# --- Ask AI: OpenAI via opts.ai instead of claude.ai sample
js = R(js, "(async()=>{try{if(window.claude&&window.claude.use)AG.sample=await window.claude.use('sample')}catch(e){}", "(async()=>{AG.sample=opts.ai||null;")
js = R(js, "if(!AG.sample){agMsg('sys','Ask Claude only works when this page is opened on claude.ai.');return}",
       "if(!AG.sample){agMsg('sys','Add an OpenAI API key in Settings → Trip Mindmap to use Ask AI.');return}")
js = R(js, "const res=await AG.sample.json([{role:'user',content:agRules()},...AG.turns.slice(-12)],{signal:AG.ctl.signal,cache:false,onText:()=>{}});",
       "const res=await AG.sample.ask([{role:'system',content:agRules()},...AG.turns.slice(-12)],{signal:AG.ctl.signal});")
js = R(js, "catch(e){const c=e&&e.code;AG.turns.pop();agMsg('sys',AGERR[c]||'Something went wrong reaching Claude. Try again.');if(e&&e.text&&c!=='invalid_json'&&c!=='cancelled')agMsg('ai',e.text)}",
       "catch(e){AG.turns.pop();const m=e&&e.message;agMsg('sys',m==='Stopped'||(e&&e.code==='cancelled')?'Stopped.':(m||'Something went wrong reaching the AI. Try again.'))}")
js = R(js, "const ideas=['Suggest 3 things to do at each stop','What should I do between Tokyo and Hanoi?','Find gaps or overlaps in my dates','Add packing and visa reminders as notes'];",
       "const ideas=TRIP()?['Suggest 3 things to do at each stop','What should I do between my stops?','Find gaps or overlaps in my dates','Add packing and visa reminders as notes']:['Suggest 5 more ideas for each branch','Group these ideas into themes','What am I missing?','Turn the top branch into next steps'];")
js = R(js, "Ask for trip ideas or changes. Claude\\'s edits show up highlighted", "Ask for ${TRIP()?\\'trip \\':\\'\\'}ideas or changes. The AI\\'s edits show up highlighted")
js = R(js, "w.innerHTML='<div class=\"ag-msg sys\">Ask for ${TRIP()", "w.innerHTML=`<div class=\"ag-msg sys\">Ask for ${TRIP()")
js = R(js, "map until you keep or revert them.</div>'+ideas", "map until you keep or revert them.</div>`+ideas")
js = js.replace("${TRIP()?\\'trip \\':\\'\\'}", "${TRIP()?'trip ':''}").replace("The AI\\'s edits", "The AI's edits")
js = R(js, "agMsg('sys',\"Claude's changes didn't match this map, so nothing changed.\")", "agMsg('sys',\"The AI's changes didn't match this map, so nothing changed.\")")
js = R(js, "function agReset(){agDiscard();AG.turns=[];agLog.innerHTML='';AG.mapId=cur?cur.id:null;", "function agReset(){agDiscard();AG.turns=[];agLog.innerHTML='';AG.mapId=cur?cur.uid:null;")
js = R(js, "if(open){if(AG.mapId!==(cur&&cur.id))agReset();", "if(open&&RO)return;if(open){if(AG.mapId!==(cur&&cur.uid))agReset();")
js = R(js, "  const mapAt=cur.id;", "  const mapAt=cur.uid;")
js = R(js, "    if(!cur||cur.id!==mapAt)throw{code:'cancelled'};", "    if(!cur||cur.uid!==mapAt)throw{code:'cancelled'};")
js = R(js, "agMsg('sys',`Kept ${n} change${n===1?'':'s'}.`);", "agMsg('sys',`Kept ${n} change${n===1?'':'s'}.`);AG.kept=true;")

# --- init: the host supplies the doc
js = R(js, "cur=makeExample();renderAll();requestAnimationFrame(fit);if(routeOpen)setRoute(true);\n"
           "document.fonts&&document.fonts.ready.then(()=>{renderAll();fit()});\ninitStore();\n", '')

HEADER = r"""// @ts-nocheck
// Mind map editor, ported from reference/trip-mindmap.html by scripts/port-editor.py.
// Pure logic lives in ../model, ../trip and ../ai; this file is rendering and interaction.
import * as OPS from '../model/ops';
import { newNode as mkNode } from '../model/schema';
import { placeOf as placeOfDoc, computeRoute as computeRouteDoc, findPlace, detectPlace, PLACE_NAMES } from '../trip/route';
import { rules as aiRules } from '../ai/prompt';
import { applyOps, describe as describeNode } from '../ai/apply';
import { geoNaturalEarth1, geoPath, geoGraticule10, geoInterpolate, geoDistance } from 'd3';
import { feature as topoFeature } from 'topojson-client';
import landTopo from 'world-atlas/land-110m.json';
import { MARKUP } from './markup';

const d3 = { geoNaturalEarth1, geoPath, geoGraticule10, geoInterpolate, geoDistance };
let uidSeq = 0;

export function createEditor(host, opts) {
const root = document.createElement('div');
root.className = 'mm-root';
root.tabIndex = -1;
root.innerHTML = MARKUP;
host.appendChild(root);
const $ = s => root.querySelector(s);
const cleanups = [];
const on = (t, ev, f, o) => { t.addEventListener(ev, f, o); cleanups.push(() => t.removeEventListener(ev, f, o)); };
const RO = !!opts.readOnly;
let titleText = opts.title || '';
const TRIP = () => !!cur && cur.kind === 'trip';
"""

FOOTER = r"""
/* ---------- host API ---------- */
function load(doc, title){
  if(AG.preview)agRevert();
  if(editing){editing=null;ed.hidden=true}
  cur=doc;cur.uid=++uidSeq;titleText=title||titleText;sel=null;hov=null;undo=[];redo=[];colorPick=false;
  if(!TRIP()&&routeOpen){routeOpen=false;routeEl.hidden=true}
  renderAll();requestAnimationFrame(()=>{fit();if(routeOpen&&TRIP())setRoute(true)});
}
load(opts.doc, opts.title);
const isFieldFocused=()=>{const a=document.activeElement;return !!a&&root.contains(a)&&isField(a)};
return {
  setDoc(doc,title){load(doc,title)},
  getDoc(){const o={...cur};delete o.uid;if(AG.preview){const s=JSON.parse(AG.preview.snap);o.nodes=s.nodes;o.rootId=s.rootId}return o},
  isBusy(){return !!editing||!!AG.preview||!!AG.busy||!!barDrag||!!dragNode||isFieldFocused()},
  focus(){mapPane.focus({preventScroll:true})},
  setTitle(t){titleText=t;const ti=$('#title');if(ti&&document.activeElement!==ti)ti.value=t},
  destroy(){AG.ctl&&AG.ctl.abort();clearTimeout(saveT);clearTimeout(lp);cleanups.forEach(f=>f());root.remove()},
  root,
};
}
"""

# d3 usage in the reference is d3.geo* only; check nothing else slipped in
used = set(re.findall(r'd3\.(\w+)', js))
allowed = {'geoNaturalEarth1', 'geoPath', 'geoGraticule10', 'geoInterpolate', 'geoDistance'}
if not used <= allowed:
    sys.exit(f'port-editor: unexpected d3 functions {used - allowed}')
for bad in ['window.claude', 'localStorage.setItem(LS', 'initStore', 'makeExample', "document.querySelector("]:
    if bad in js:
        sys.exit(f'port-editor: leftover reference to {bad}')

open('src/editor/editor.js', 'w').write(HEADER + js + FOOTER)

# ---------------------------------------------------------------- markup
st = SRC.index('<div class="app">')
en = SRC.index('<script type="application/json" id="landData">')
mk = SRC[st:en].strip()
mk = R(mk, mk[mk.index('  <aside>'):mk.index('  <main>')], '')
mk = R(mk, '      <select id="mapPick" aria-label="Choose map"></select>\n', '')
mk = R(mk, '<input id="title" aria-label="Map name" autocomplete="off">', '<input id="title" aria-label="File name" autocomplete="off" title="Rename the file">')
mk = R(mk, '<label class="toggle" title="Calendar (Ctrl+K)">', '<label class="toggle trip" title="Calendar (Ctrl+K)">')
mk = R(mk, '<div class="seg" id="modes" hidden>', '<div class="seg trip" id="modes" hidden>')
mk = R(mk, '<button class="btn" id="agentBtn" type="button" title="Ask Claude for ideas or changes (/)">Ask Claude</button>',
       '<button class="btn" id="agentBtn" type="button" title="Ask AI for ideas or changes (/)">Ask AI</button>')
mk = R(mk, '<button class="btn" id="routeBtn"', '<button class="btn trip" id="routeBtn"')
mk = R(mk, mk[mk.index('    <div id="banner" hidden>'):mk.index('    <div class="insp" id="insp">')], '')
mk = R(mk, '<button type="button" data-act="nextadd">', '<button type="button" class="trip" data-act="nextadd">')
mk = R(mk, '<button type="button" data-act="dates">', '<button type="button" class="trip" data-act="dates">')
mk = R(mk, '<section id="agent" class="agent" hidden aria-label="Ask Claude">', '<section id="agent" class="agent" hidden aria-label="Ask AI">')
mk = R(mk, '<strong>Ask Claude</strong>', '<strong>Ask AI</strong>')
mk = R(mk, 'aria-label="Close Ask Claude"', 'aria-label="Close Ask AI"')
mk = R(mk, '<aside id="route" hidden aria-label="Route map">', '<aside id="route" class="trip" hidden aria-label="Route map">')
for row in ['<tr><td><kbd class="k">Ctrl</kbd> + <kbd class="k">Enter</kbd></td>', '<tr><td><kbd class="k">N</kbd></td>',
            '<tr><td><kbd class="k">Ctrl</kbd> + <kbd class="k">D</kbd></td>', '<tr><td><kbd class="k">M</kbd></td>',
            '<tr><td><kbd class="k">F</kbd></td>', '<tr><td><kbd class="k">Ctrl</kbd> + <kbd class="k">K</kbd></td>',
            '<tr><td><kbd class="k">1</kbd> <kbd class="k">2</kbd> <kbd class="k">3</kbd></td>', '<tr><td><kbd class="k">R</kbd></td>']:
    mk = R(mk, row, row.replace('<tr>', '<tr class="trip">', 1))
mk = R(mk, '<td>Ask Claude for ideas or changes</td>', '<td>Ask AI for ideas or changes</td>')
mk = R(mk, ' Ideas with dates always sort by date.', '<span class="trip"> Ideas with dates always sort by date.</span>')
mk = R(mk, ' Drag calendar bars to move them, drag their ends to change dates.', '<span class="trip"> Drag calendar bars to move them, drag their ends to change dates.</span>')
assert '`' not in mk and '${' not in mk
open('src/editor/markup.ts', 'w').write('// Editor markup, ported from reference/trip-mindmap.html by scripts/port-editor.py.\nexport const MARKUP = `\n' + mk + '\n`;\n')

# ---------------------------------------------------------------- css
css = SRC[SRC.index('<style>') + 7:SRC.index('</style>')]
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)

def blocks(t):
    """Split top-level CSS into (prelude, body) pairs, keeping @media/@keyframes bodies raw."""
    out, i = [], 0
    while True:
        j = t.find('{', i)
        if j < 0:
            break
        pre = t[i:j].strip()
        depth, k = 1, j + 1
        while depth:
            if t[k] == '{': depth += 1
            elif t[k] == '}': depth -= 1
            k += 1
        out.append((pre, t[j + 1:k - 1]))
        i = k
    return out

OBS = {  # map the reference palette onto the active Obsidian theme
    '--bg': 'var(--background-primary)', '--panel': 'var(--background-primary)', '--panel-2': 'var(--background-secondary)',
    '--ink': 'var(--text-normal)', '--muted': 'var(--text-muted)', '--line': 'var(--background-modifier-border)',
    '--accent': 'var(--interactive-accent)', '--accent-soft': 'var(--background-modifier-hover)',
    '--c-red': 'var(--color-red)', '--c-orange': 'var(--color-orange)', '--c-yellow': 'var(--color-yellow)', '--c-green': 'var(--color-green)',
    '--c-teal': 'var(--color-cyan)', '--c-blue': 'var(--color-blue)', '--c-purple': 'var(--color-purple)', '--c-pink': 'var(--color-pink)',
    '--font-body': 'var(--font-interface)', '--font-display': 'var(--font-interface)',
}

def vars_of(body, drop_mapped):
    decls = [d.strip() for d in body.split(';') if d.strip()]
    keep = []
    for d in decls:
        name = d.split(':', 1)[0].strip()
        if name in OBS:
            if drop_mapped: continue
            d = f'{name}:{OBS[name]}'
        keep.append(d)
    return ';'.join(keep)

def scope(sel):
    parts = []
    for s in sel.split(','):
        s = s.strip()
        if s in ('html', 'body', 'html,body'):
            continue
        parts.append('.mm-root ' + s)
    return ','.join(parts)

out = []
for pre, body in blocks(css):
    if pre == ':root':
        out.append('.mm-root{' + vars_of(body, False) + '}')
    elif pre.startswith('@media (prefers-color-scheme: dark)'):
        inner = blocks(body)
        out.append('.theme-dark .mm-root{' + vars_of(inner[0][1], True) + '}')
    elif pre == ':root[data-theme="dark"]':
        continue
    elif pre == 'html,body':
        continue
    elif pre == 'body':
        out.append('.mm-root{height:100%;position:relative;' + body.replace('overflow:hidden', 'overflow:hidden;outline:none') + '}')
    elif pre.startswith('@keyframes'):
        out.append(pre + '{' + body + '}')
    elif pre.startswith('@media'):
        inner = ''.join(scope(p) + '{' + b + '}' for p, b in blocks(body) if scope(p))
        out.append(pre + '{' + inner + '}')
    else:
        sc = scope(pre)
        if sc:
            out.append(sc + '{' + body + '}')

css_out = '\n'.join(out)
css_out = R(css_out, '.mm-root .app{height:100%;box-sizing:border-box;display:grid;grid-template-columns:230px minmax(0,1fr) auto;',
            '.mm-root .app{height:100%;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr) auto;')
EXTRA = r"""
/* ---- plugin additions ---- */
.mm-root.mm-general .trip{display:none!important}
.mm-root.mm-ro .bar,.mm-root.mm-ro .insp,.mm-root.mm-ro .acts-bar,.mm-root.mm-ro #zSnap,.mm-root.mm-ro #zSide,.mm-root.mm-ro #agent{display:none!important}
.mm-root.mm-ro .app{padding:0}
.mm-host{height:100%;position:relative}
.mm-error{padding:24px;color:var(--text-error);font-family:var(--font-interface)}
.mm-error pre{white-space:pre-wrap;color:var(--text-muted)}
.mm-conflict{display:flex;gap:8px;align-items:center;padding:6px 12px;background:var(--background-modifier-error-hover,var(--background-secondary));border-bottom:1px solid var(--background-modifier-border);font-size:13px}
.mm-conflict .spacer{flex:1}
.mm-embed{position:relative;border:1px solid var(--background-modifier-border);border-radius:8px;overflow:hidden}
.mm-embed-open{position:absolute;top:6px;right:6px;z-index:5}
"""
open('styles.css', 'w').write('/* Mindmap plugin styles: ported from reference/trip-mindmap.html by scripts/port-editor.py, scoped under .mm-root */\n' + css_out + EXTRA)
print('ported: editor.js', len(HEADER + js + FOOTER), 'markup', len(mk), 'css', len(css_out))
