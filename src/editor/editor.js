// @ts-nocheck
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
const DAY=864e5, MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], WD=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const toDay=iso=>{if(!iso)return null;const[y,m,d]=iso.split('-').map(Number);return Math.round(Date.UTC(y,m-1,d)/DAY)};
const toIso=n=>new Date(n*DAY).toISOString().slice(0,10);
const fmt=n=>{const d=new Date(n*DAY);return d.getUTCDate()+' '+MON[d.getUTCMonth()]};
const fmtW=n=>WD[new Date(n*DAY).getUTCDay()]+' '+fmt(n);
const rid=()=>Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-3);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const todayN=Math.floor(Date.now()/DAY);
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,v);return true}catch(e){return false}};

/* ---------- model ---------- */
let maps={}, cur=null, sel=null, hov=null, LAY={}, undo=[], redo=[];
const view={s:1,tx:0,ty:0};
const newNode=mkNode;
const N=id=>cur.nodes[id];
function isDesc(a,b){return OPS.isDesc(cur,a,b)}
function topOf(id){let n=N(id);if(!n||id===cur.rootId)return null;while(n.parent!==cur.rootId)n=N(n.parent);return n.id}
/* A "group" is any idea that has sub-ideas (a stage of the trip), or a lone idea hanging off the centre.
   Each group gets its own colour and calendar lane; leaf ideas take their group's colour. Works for
   chains (Trip -> Japan -> Vietnam -> ...) as well as classic fans. */
let GROUPS=null;
function groupOf(id){return OPS.groupOf(cur,id)}
function groups(){if(GROUPS)return GROUPS;const out=[];const w=id=>{if(groupOf(id)===id)out.push(id);N(id).children.forEach(w)};w(cur.rootId);GROUPS=out;return out}
const PAL=['red','orange','yellow','green','teal','blue','purple','pink'];
function colorKeyOf(id){return OPS.colorKeyOf(cur,id)}
function setColor(id,c){const n=N(id);if(!n||(n.color||null)===(c||null))return;mutate(()=>OPS.setColor(cur,id,c||null))}
let colorPick=false;
function colorOf(id){const ck=colorKeyOf(id);if(ck)return 'var(--c-'+ck+')';const g=groupOf(id);if(!g)return 'var(--ink)';const i=groups().indexOf(g);return 'var(--b'+((i<0?0:i)%6+1)+')'}
function label(n){return (n.fixed?'✈ ':'')+(n.text||'Untitled')}
function dateCap(n){if(!n.start)return '';const s=toDay(n.start);if(!n.end||n.end===n.start)return fmtW(s);const e=toDay(n.end);return fmt(s)+' – '+fmt(e)+' · '+(e-s)+'n'}

function snapState(){return JSON.stringify({rootId:cur.rootId,nodes:cur.nodes})}
function mutate(fn){if(RO)return;undo.push(snapState());if(undo.length>200)undo.shift();redo=[];fn();changed()}
function tryMutate(fn){if(RO)return false;const s=snapState();if(!fn())return false;undo.push(s);if(undo.length>200)undo.shift();redo=[];changed();return true}
function changed(){normalize();cur.updatedAt=Date.now();dirty();renderAll()}
function restore(s){const o=JSON.parse(s);cur.nodes=o.nodes;cur.rootId=o.rootId;if(sel&&!cur.nodes[sel])sel=null;changed()}
function doUndo(){if(!undo.length)return;redo.push(snapState());restore(undo.pop())}
function doRedo(){if(!redo.length)return;undo.push(snapState());restore(redo.pop())}

function addChild(pid,edit=true){if(RO)return null;let id;mutate(()=>{id=OPS.addChild(cur,pid);sel=id});if(edit)startEdit(id,true);return id}
function addSibling(id){if(RO)return;if(!id||id===cur.rootId)return addChild(cur.rootId);let nid;mutate(()=>{nid=OPS.addSibling(cur,id);sel=nid});startEdit(nid,true)}
function addNext(id){if(RO||!TRIP())return;if(!id||id===cur.rootId){addChild(cur.rootId);return}let nid;mutate(()=>{nid=OPS.addNext(cur,id);sel=nid});startEdit(nid,true)}
function toggleNext(id){if(!TRIP()||!id||id===cur.rootId)return;const n=N(id);if(n.parent===cur.rootId&&!n.next)return;mutate(()=>OPS.toggleNext(cur,id))}
function delNode(id){if(!id||id===cur.rootId)return;mutate(()=>{sel=OPS.delNode(cur,id)})}
function reorder(id,d){if(!id||id===cur.rootId)return;tryMutate(()=>OPS.reorder(cur,id,d))}
function reparent(id,tid,side){tryMutate(()=>OPS.reparent(cur,id,tid,undefined,side))}
function setDates(id,s,e){OPS.setDates(cur,id,s,e)}
function sideOf(id){return OPS.sideOf(cur,id)}

/* ---------- layout ---------- */
const mctx=(()=>{let c=null;try{c=document.createElement('canvas').getContext('2d')}catch(e){}return c||{font:'',measureText:t=>({width:String(t).length*7})}})();
function tw(t,isRoot){const font=(isRoot?'600 15px':'500 13px')+' Inter, system-ui, sans-serif';if(opts.measureText)return opts.measureText(t,font);mctx.font=font;return mctx.measureText(t).width}
function trunc(t,max,root){if(tw(t,root)<=max)return t;let s=t;while(s.length>1&&tw(s+'…',root)>max)s=s.slice(0,-1);return s+'…'}
const HG=34,VG=10,MAXW=250;
/* Next stops: a child flagged `next` continues its parent's journey. Stops sit on one line joined by arrows;
   each stop's own ideas hang below it as a column. Everything else is an ordinary right-growing tree. */
function nextOf(id){return OPS.nextOf(cur,id)}
const IND=22,DG=12,SG=64;
function nodeSize(id){const n=N(id),isR=id===cur.rootId;const t=label(n);const w=Math.max(isR?130:56,Math.min(MAXW,Math.ceil(tw(t,isR))+(isR?40:24)));const h=isR?42:30;const cap=!isR&&n.start&&TRIP()?15:0;return{w,h,cap}}
function layout(){if(cur.layout==='both')return layoutBoth();
  const L={},M={};const isCol=id=>id!==cur.rootId&&(!!N(id).next||nextOf(id)!=null);
  const meas=id=>{const n=N(id),s=nodeSize(id);let r;
    if(isCol(id)){const nx=nextOf(id);const det=n.collapsed?[]:n.children.filter(c=>c!==nx);let dh=0,dw=0;det.forEach((c,i)=>{const m=meas(c);dh+=m.h+(i?VG:0);dw=Math.max(dw,m.w)});
      const colW=Math.max(s.w,det.length?IND+dw:0),colH=s.h+s.cap+(det.length?DG+dh:0);let w=colW,h=colH;if(nx){const m=meas(nx);w=colW+SG+m.w;h=Math.max(colH,m.h)}r={col:true,w,h,colW,det,nx}}
    else{const kids=n.collapsed?[]:n.children;let ch=0,cw=0;kids.forEach((c,i)=>{const m=meas(c);ch+=m.h+(i?VG:0);cw=Math.max(cw,m.w)});r={col:false,w:s.w+(kids.length?HG+cw:0),h:Math.max(s.h+s.cap,ch),kids,ch}}
    M[id]=r;return r};
  const place=(id,x,top,depth,ox,oy)=>{const n=N(id),s=nodeSize(id),m=M[id];L[id]=s;const o=n.off;const ax=ox+(o?o.x:0),ay=oy+(o?o.y:0);s.depth=depth;s.side='R';s.x=x;
    if(m.col){s.mode='col';s.y=top+s.h/2;let y=top+s.h+s.cap+DG;m.det.forEach(c=>{place(c,x+IND,y,depth+1,ax,ay);y+=M[c].h+VG});if(m.nx)place(m.nx,x+m.colW+SG,top,depth,ax,ay)}
    else{s.mode='tree';const cy=top+m.h/2;s.y=cy-s.cap/2;let y=cy-m.ch/2;m.kids.forEach(c=>{place(c,x+s.w+HG*(id===cur.rootId?1.6:1),y,depth+1,ax,ay);y+=M[c].h+VG})}
    if(id!==cur.rootId){s.x+=ax;s.y+=ay}};
  const rm=meas(cur.rootId);const rs=nodeSize(cur.rootId);M[cur.rootId].w+=HG*.6;place(cur.rootId,-rs.w/2,-rm.h/2,0,0,0);return L}
function layoutBoth(){
  const L={},root=N(cur.rootId);const vis=id=>N(id).collapsed?[]:N(id).children;
  const size=(id)=>{const n=N(id),isR=id===cur.rootId;const t=label(n);const w=Math.max(isR?130:56,Math.min(MAXW,Math.ceil(tw(t,isR))+(isR?40:24)));const h=isR?42:30;const cap=!isR&&n.start&&TRIP()?15:0;return{w,h,cap}};
  const tot=id=>{const s=size(id);const ch=vis(id);let sub=0;ch.forEach((c,i)=>{sub+=tot(c)+(i?VG:0)});s.tot=Math.max(s.h+s.cap,sub);L[id]=s;return s.tot};
  const rs=size(cur.rootId);rs.x=-rs.w/2;rs.y=0;rs.depth=0;rs.side=null;
  const place=(id,side,edge,top,depth,ox,oy)=>{const l=L[id];const cy=top+l.tot/2;l.side=side;l.depth=depth;l.y=cy-l.cap/2;l.x=side==='R'?edge:edge-l.w;const o=N(id).off;const ax=ox+(o?o.x:0),ay=oy+(o?o.y:0);const ch=vis(id);let sub=0;ch.forEach((c,i)=>{sub+=L[c].tot+(i?VG:0)});let y=cy-sub/2;const nx=side==='R'?l.x+l.w+HG:l.x-HG;ch.forEach(c=>{place(c,side,nx,y,depth+1,ax,ay);y+=L[c].tot+VG});l.x+=ax;l.y+=ay};
  const kids=root.collapsed?[]:root.children;
  ['L','R'].forEach(sd=>{const arr=kids.filter(c=>sideOf(c)===sd);let total=0;arr.forEach((c,i)=>{total+=tot(c)+(i?VG*2:0)});let y=-total/2;arr.forEach(c=>{place(c,sd,sd==='R'?rs.w/2+HG*1.6:-rs.w/2-HG*1.6,y,1,0,0);y+=L[c].tot+VG*2})});
  L[cur.rootId]=rs;return L;
}

/* ---------- map render ---------- */
const vp=$('#vp'),mapSvg=$('#mapSvg'),mapPane=$('#mapPane');
let dragNode=null,dropT=null;
function renderMap(){
  LAY=layout();let E='',G='';
  for(const id in LAY){if(id===cur.rootId)continue;const n=N(id),c=LAY[id],p=LAY[n.parent];if(!p)continue;
    if(p.mode==='col'&&n.next){const x1=p.x+p.w+2,y1=p.y,x2=c.x-4,y2=c.y,mx=(x1+x2)/2,col=colorOf(id);
      E+=`<path d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2-9} ${y2}" fill="none" style="stroke:${col}" stroke-width="3.2" stroke-linecap="round"/><path d="M${x2} ${y2} L${x2-11} ${y2-6.5} L${x2-11} ${y2+6.5} Z" style="fill:${col}"/>`;continue}
    if(p.mode==='col'){const px=p.x+12,py=p.y+p.h/2+p.cap+1,cy=c.y,r=Math.min(8,Math.max(0,cy-py));
      E+=`<path d="M${px} ${py} V${cy-r} Q${px} ${cy} ${px+r} ${cy} H${c.x}" fill="none" style="stroke:${colorOf(id)}" stroke-opacity=".55" stroke-width="1.6"/>`;continue}
    const x1=c.side==='R'?p.x+p.w:p.x,x2=c.side==='R'?c.x:c.x+c.w,y1=p.y,y2=c.y,mx=(x1+x2)/2;
    E+=`<path d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}" fill="none" style="stroke:${colorOf(id)}" stroke-opacity=".55" stroke-width="${c.depth===1?2.4:1.6}"/>`}
  for(const id in LAY){const n=N(id),l=LAY[id],isR=id===cur.rootId,col=colorOf(id);
    let fill,stroke,txt,dash='',sw=1.6,rx=isR?21:(l.depth===1?9:15);
    if(isR){fill='var(--ink)';stroke='var(--ink)';txt='var(--bg)'}
    else if(n.maybe&&TRIP()){fill='var(--panel)';stroke=col;txt='var(--ink)';dash='5 4'}
    else if(l.depth===1){fill=col;stroke=col;txt='var(--on-branch)'}
    else{fill='var(--panel)';stroke=col;txt='var(--ink)'}
    if(n.fixed){stroke='var(--fixed)';sw=2}
    const t=trunc(label(n),l.w-(isR?40:24),isR);
    let g=`<g class="node${hov===id?' hov':''}" data-id="${id}" transform="translate(${l.x} ${l.y-l.h/2})">`;
    if(sel===id)g+=`<rect x="-4" y="-4" width="${l.w+8}" height="${l.h+8}" rx="${rx+4}" fill="none" style="stroke:var(--accent)" stroke-width="2.5"/>`;
    if(AG.preview&&AG.preview.touched.has(id))g+=`<rect x="-6" y="-6" width="${l.w+12}" height="${l.h+12}" rx="${rx+6}" fill="none" style="stroke:var(--accent)" stroke-width="2.2" stroke-dasharray="3 3" opacity=".9"/>`;
    if(dropT===id)g+=`<rect x="-5" y="-5" width="${l.w+10}" height="${l.h+10}" rx="${rx+5}" fill="none" style="stroke:var(--accent)" stroke-width="2" stroke-dasharray="4 3"/>`;
    g+=`<rect class="box" width="${l.w}" height="${l.h}" rx="${rx}" style="fill:${fill};stroke:${stroke}" stroke-width="${sw}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
    g+=`<text class="lbl" x="${l.w/2}" y="${l.h/2+4.5}" text-anchor="middle" style="fill:${txt};${isR?'font-size:15px;font-weight:600':''}">${esc(t)}</text>`;
    if(l.cap)g+=`<text class="cap" x="${l.w/2}" y="${l.h+12}" text-anchor="middle">${esc(dateCap(n))}</text>`;
    if(n.notes){g+=`<title>${esc(n.notes)}</title><g class="nb"><circle cx="${l.w-1}" cy="1" r="7.5" style="fill:var(--panel);stroke:${col}" stroke-width="1.3"/><path d="M${l.w-4.5} -1.6h7M${l.w-4.5} 1h7M${l.w-4.5} 3.6h4.5" style="stroke:var(--ink)" stroke-width="1.1" stroke-linecap="round"/></g>`}
    if(n.collapsed&&n.children.length){const cx=l.side==='L'?-9:l.w+9;g+=`<circle cx="${cx}" cy="${l.h/2}" r="8.5" style="fill:var(--panel);stroke:${col}" stroke-width="1.5"/><text x="${cx}" y="${l.h/2+3.5}" text-anchor="middle" style="fill:var(--ink);font-size:10px;font-weight:600">${countDesc(id)}</text>`}
    g+='</g>';G+=g}
  vp.innerHTML=E+G;applyView();
  $('#actsBar').hidden=!sel;$('#zSide').textContent=cur.layout==='both'?'One side':'Both sides';
}
function freeDrop(id,dx,dy){const n=N(id),p=N(n.parent),l=LAY[id];
  mutate(()=>{const o=n.off||{x:0,y:0};n.off={x:Math.round(o.x+dx),y:Math.round(o.y+dy)}})}
function snapNow(){mutate(()=>{for(const id in cur.nodes){const n=cur.nodes[id];if(n.children.length<2||!n.children.every(c=>LAY[c]))continue;
    n.children=n.children.map((c,i)=>({c,i,l:LAY[c]})).sort((a,b)=>{const dy=a.l.y-b.l.y;if(Math.abs(dy)>15)return dy;return (a.l.x-b.l.x)||(a.i-b.i)}).map(x=>x.c)}
  for(const id in cur.nodes)cur.nodes[id].off=null})}
/* Siblings with a date (their own, or the earliest inside their branch) always run in date order.
   Undated siblings keep their slots, so their manual / snapped order is preserved. */
function normalize(){if(!cur)return;GROUPS=null;OPS.normalize(cur)}
function setSides(both){cur.layout=both?'both':'right';dirty();renderAll();requestAnimationFrame(fit)}
function countDesc(id){let c=0;const w=x=>N(x).children.forEach(k=>{c++;w(k)});w(id);return c}
function applyView(){vp.setAttribute('transform',`translate(${view.tx} ${view.ty}) scale(${view.s})`);if(editing)placeEditor();drawThreads()}
function fit(){const W=mapPane.clientWidth,H=mapPane.clientHeight;if(!W||!H)return;let a=1e9,b=1e9,c=-1e9,d=-1e9;for(const id in LAY){const l=LAY[id];a=Math.min(a,l.x);c=Math.max(c,l.x+l.w);b=Math.min(b,l.y-l.h/2);d=Math.max(d,l.y+l.h/2+l.cap)}const bw=c-a,bh=d-b;view.s=Math.max(.35,Math.min(1.1,(W-48)/bw,(H-60)/bh));view.tx=W/2-(a+bw/2)*view.s;view.ty=H/2-(b+bh/2)*view.s-8;applyView()}
function zoomAt(f,px,py){const s2=Math.max(.3,Math.min(2.5,view.s*f));view.tx=px-(px-view.tx)*(s2/view.s);view.ty=py-(py-view.ty)*(s2/view.s);view.s=s2;applyView()}
function ensureVisible(id){const l=LAY[id];if(!l)return;const W=mapPane.clientWidth,H=mapPane.clientHeight,m=40;const x1=l.x*view.s+view.tx,x2=(l.x+l.w)*view.s+view.tx,y1=(l.y-l.h/2)*view.s+view.ty,y2=(l.y+l.h/2+l.cap)*view.s+view.ty;let dx=0,dy=0;if(x1<m)dx=m-x1;else if(x2>W-m)dx=W-m-x2;if(y1<m)dy=m-y1;else if(y2>H-m-44)dy=H-m-44-y2;if(dx||dy){view.tx+=dx;view.ty+=dy;applyView()}}
const toMap=(cx,cy)=>{const r=mapSvg.getBoundingClientRect();return{x:(cx-r.left-view.tx)/view.s,y:(cy-r.top-view.ty)/view.s}};
function hitNode(p,skip){for(const id in LAY){if(skip&&(id===skip||isDesc(id,skip)))continue;const l=LAY[id];if(p.x>=l.x-4&&p.x<=l.x+l.w+4&&p.y>=l.y-l.h/2-4&&p.y<=l.y+l.h/2+4)return id}return null}

let pan=null,lp=null,pinch=null;const ptrs=new Map();
mapSvg.addEventListener('pointerdown',e=>{ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});if(ptrs.size===2){const[a,b]=[...ptrs.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1};clearTimeout(lp);lp=null;dragNode=null;pan=null}},true);
mapSvg.addEventListener('pointermove',e=>{if(!ptrs.has(e.pointerId))return;ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pinch&&ptrs.size===2){const[a,b]=[...ptrs.values()];const d=Math.hypot(a.x-b.x,a.y-b.y)||1;const r=mapSvg.getBoundingClientRect();zoomAt(d/pinch.d,(a.x+b.x)/2-r.left,(a.y+b.y)/2-r.top);pinch.d=d}},true);
const ptrEnd=e=>{ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null};mapSvg.addEventListener('pointerup',ptrEnd,true);mapSvg.addEventListener('pointercancel',ptrEnd,true);
mapSvg.addEventListener('pointerdown',e=>{hideCtx();if(e.button!==0)return;mapPane.focus({preventScroll:true});const g=e.target.closest('g.node');
  if(g&&RO){pan={sx:e.clientX,sy:e.clientY,tx:view.tx,ty:view.ty,moved:false};mapSvg.setPointerCapture?.(e.pointerId);return}
  if(g){const id=g.dataset.id;if(editing&&editing.id!==id)commitEdit();if(sel!==id)select(id);dragNode={id,sx:e.clientX,sy:e.clientY,moved:false,el:null};mapSvg.setPointerCapture?.(e.pointerId);clearTimeout(lp);const lx=e.clientX,ly=e.clientY;if(e.pointerType!=='mouse')lp=setTimeout(()=>{lp=null;if(dragNode&&!dragNode.moved){dragNode=null;showCtx(lx,ly)}},500)}
  else{if(editing)commitEdit();pan={sx:e.clientX,sy:e.clientY,tx:view.tx,ty:view.ty,moved:false};mapSvg.setPointerCapture?.(e.pointerId);mapSvg.classList.add('panning')}});
mapSvg.addEventListener('pointermove',e=>{
  if(pinch)return;
  if(dragNode){const dx=e.clientX-dragNode.sx,dy=e.clientY-dragNode.sy;if(Math.hypot(dx,dy)>8){clearTimeout(lp);lp=null}if(!dragNode.moved&&Math.hypot(dx,dy)<6)return;if(dragNode.id===cur.rootId)return;dragNode.moved=true;
    const el=vp.querySelector(`g.node[data-id="${dragNode.id}"]`);const l=LAY[dragNode.id];if(el){el.classList.add('dragging');el.setAttribute('transform',`translate(${l.x+dx/view.s} ${l.y-l.h/2+dy/view.s})`);vp.appendChild(el)}
    const t=hitNode(toMap(e.clientX,e.clientY),dragNode.id);if(t!==dropT){dropT=t;vp.querySelectorAll('.droprect').forEach(r=>r.remove());if(t){const tl=LAY[t];const r=document.createElementNS('http://www.w3.org/2000/svg','rect');r.setAttribute('class','droprect');r.setAttribute('x',tl.x-5);r.setAttribute('y',tl.y-tl.h/2-5);r.setAttribute('width',tl.w+10);r.setAttribute('height',tl.h+10);r.setAttribute('rx',12);r.setAttribute('fill','none');r.setAttribute('stroke-width','2');r.setAttribute('stroke-dasharray','4 3');r.style.stroke='var(--accent)';vp.insertBefore(r,vp.firstChild)}}
  }else if(pan){const dx=e.clientX-pan.sx,dy=e.clientY-pan.sy;if(Math.hypot(dx,dy)>3)pan.moved=true;view.tx=pan.tx+dx;view.ty=pan.ty+dy;applyView()}
  else{const g=e.target.closest('g.node');setHov(g?g.dataset.id:null)}});
const endPtr=e=>{mapSvg.classList.remove('panning');clearTimeout(lp);lp=null;
  if(dragNode){const d=dragNode;dragNode=null;if(d.moved){const t=dropT;dropT=null;if(t){const p=toMap(e.clientX,e.clientY);reparent(d.id,t,p.x<LAY[cur.rootId].x+LAY[cur.rootId].w/2?'L':'R')}else freeDrop(d.id,(e.clientX-d.sx)/view.s,(e.clientY-d.sy)/view.s)}}
  if(pan){if(!pan.moved&&sel){select(null)}pan=null}};
mapSvg.addEventListener('pointerup',endPtr);mapSvg.addEventListener('pointercancel',endPtr);
mapSvg.addEventListener('pointerleave',()=>{if(!dragNode&&!pan)setHov(null)});
mapSvg.addEventListener('dblclick',e=>{if(RO){opts.onOpen&&opts.onOpen();return}const p=toMap(e.clientX,e.clientY);const hid=hitNode(p);if(hid){startEdit(hid)}else{const r=N(cur.rootId);let id;mutate(()=>{const n=newNode('',r.id,{side:p.x<0?'L':'R'});cur.nodes[n.id]=n;r.children.push(n.id);r.collapsed=false;id=n.id;sel=id});startEdit(id,true)}});
mapSvg.addEventListener('wheel',e=>{if(RO&&!(e.ctrlKey||e.metaKey))return;e.preventDefault();const r=mapSvg.getBoundingClientRect();if(e.ctrlKey||e.metaKey){zoomAt(Math.exp(-e.deltaY*0.0022),e.clientX-r.left,e.clientY-r.top)}else{view.tx-=e.deltaX;view.ty-=e.deltaY;applyView()}},{passive:false});
mapSvg.addEventListener('contextmenu',e=>{e.preventDefault();if(RO)return;const g=e.target.closest('g.node');if(g){select(g.dataset.id);showCtx(e.clientX,e.clientY)}});
$('#zIn').onclick=()=>zoomAt(1.2,mapPane.clientWidth/2,mapPane.clientHeight/2);
$('#zOut').onclick=()=>zoomAt(1/1.2,mapPane.clientWidth/2,mapPane.clientHeight/2);
$('#zFit').onclick=fit;$('#zSnap').onclick=snapNow;$('#zSide').onclick=()=>setSides(cur.layout!=='both');

/* ---------- editing ---------- */
const ed=$('#nodeEdit');let editing=null;
function startEdit(id,isNew){if(!LAY[id])renderMap();editing={id,isNew:!!isNew,orig:N(id).text};ed.value=N(id).text;ed.hidden=false;placeEditor();ensureVisible(id);placeEditor();ed.focus();ed.select()}
function placeEditor(){if(!editing||!LAY[editing.id])return;const l=LAY[editing.id];const w=Math.max(l.w,190)*view.s;ed.style.left=(l.x*view.s+view.tx-(w-l.w*view.s)/2)+'px';ed.style.top=((l.y-l.h/2)*view.s+view.ty)+'px';ed.style.width=w+'px';ed.style.height=(l.h*view.s)+'px';ed.style.fontSize=(13*view.s)+'px'}
function commitEdit(){if(!editing)return true;const e=editing;editing=null;ed.hidden=true;const v=ed.value.trim();const n=N(e.id);if(!n)return true;
  if(!v&&e.isNew){if(undo.length)restore(undo.pop());mapPane.focus({preventScroll:true});return false}
  if(v!==e.orig){if(!e.isNew)undo.push(snapState());n.text=v||e.orig||'Untitled';if(e.id===cur.rootId&&cur.title!==n.text){cur.title=n.text}changed()}else renderAll();
  mapPane.focus({preventScroll:true});return true}
function cancelEdit(){if(!editing)return;const e=editing;editing=null;ed.hidden=true;if(e.isNew&&undo.length)restore(undo.pop());mapPane.focus({preventScroll:true})}
ed.addEventListener('keydown',e=>{e.stopPropagation();
  if(e.key==='Escape'){e.preventDefault();cancelEdit()}
  else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();const id=editing.id;if(commitEdit()&&N(id))addNext(id)}
  else if(e.key==='Enter'&&e.shiftKey){e.preventDefault();const id=editing.id;if(commitEdit()&&N(id))addSibling(id)}
  else if(e.key==='Enter'){e.preventDefault();commitEdit()}
  else if(e.key==='Tab'){e.preventDefault();const id=editing.id;if(commitEdit()&&N(id))addChild(id)}});
ed.addEventListener('blur',()=>{setTimeout(()=>{if(editing&&document.activeElement!==ed)commitEdit()},0)});

/* ---------- selection / hover ---------- */
function select(id){if(id!==sel)colorPick=false;sel=id;renderMap();renderInsp();renderCal();if(id)ensureVisible(id)}
function setHov(id){if(hov===id)return;hov=id;root.querySelectorAll('.hov').forEach(x=>x.classList.remove('hov'));if(id)root.querySelectorAll(`[data-id="${id}"]`).forEach(x=>x.classList.add('hov'));drawThreads()}

/* ---------- inspector ---------- */
const insp=$('#insp');let notesOpen=lsGet('mindmap.notes')==='1';
function renderInsp(){
  if(!sel||!N(sel)){insp.innerHTML=`<span class="hint">Select an idea${TRIP()?' to give it dates':''}. <b>Tab</b> adds a child, <b>Shift+Enter</b> a sibling, <b>?</b> lists every shortcut.</span>`;return}
  const n=N(sel),isR=sel===cur.rootId;const s=toDay(n.start),e=toDay(n.end);
  const nights=s!=null&&e!=null?`${e-s} night${e-s===1?'':'s'}`:(s!=null?fmtW(s):'No dates yet');
  insp.innerHTML=`<span class="nm"><span class="dot" style="background:${isR?'var(--ink)':colorOf(sel)}"></span><input id="dN" aria-label="Idea name" value="${esc(n.text)}" autocomplete="off"></span>`+
   `<span class="csw${colorPick?' pick':''}" role="group" aria-label="Colour" title="Colour (C, then 1–8, 0 = auto)">`+PAL.map((c,i)=>`<button type="button" data-c="${c}" class="${n.color===c?'on':''}" style="background:var(--c-${c})" aria-label="${c}" title="${c[0].toUpperCase()+c.slice(1)} (${i+1})"><span class="lbl">${i+1}</span></button>`).join('')+`<button type="button" data-c="" class="auto${n.color?'':' on'}" aria-label="Auto colour" title="Auto (0)"><span class="lbl">0</span></button></span>`+
   (isR?(TRIP()?`<span class="hint">The centre of the map. Dates go on the ideas around it.</span>`:''):!TRIP()?'':
   `<label>From <input type="date" id="dS" value="${n.start||''}"></label><label>To <input type="date" id="dE" value="${n.end||''}"></label><span class="nights">${nights}</span>`+
   `<label class="chk"><input type="checkbox" id="dM" ${n.maybe?'checked':''}>Maybe</label><label class="chk"><input type="checkbox" id="dF" ${n.fixed?'checked':''}>Fixed booking</label>`+
   `<label>Place <input id="dP" list="placeList" autocomplete="off" value="${n.place==='-'?'None':esc(n.place||'')}" placeholder="${(()=>{const p=placeOf(sel);return p?'Auto: '+esc(p.name):'Auto: none'})()}"></label>`+
   (n.start?`<button class="linkbtn" type="button" id="dC">Clear dates</button>`:''));
  insp.insertAdjacentHTML('beforeend',`<button class="linkbtn" type="button" id="nBtn">${notesOpen?'Hide notes':(n.notes?'Notes ●':'Add notes')}</button>`+(notesOpen?`<textarea id="nTxt" rows="3" placeholder="Notes for ${esc(n.text||'this idea')}: links, prices, confirmation numbers, thoughts…">${esc(n.notes||'')}</textarea>`:''));
  insp.querySelector('.csw').onclick=ev=>{const b=ev.target.closest('button');if(!b)return;colorPick=false;setColor(sel,b.dataset.c||null);renderInsp()};
  const dN=$('#dN');dN.onchange=()=>{const v=dN.value.trim();if(!v||v===n.text)return;mutate(()=>{n.text=v;if(isR)cur.title=v})};dN.onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();dN.blur();mapPane.focus({preventScroll:true})}};
  $('#nBtn').onclick=()=>{notesOpen=!notesOpen;lsSet('mindmap.notes',notesOpen?'1':'0');renderInsp();if(notesOpen)$('#nTxt')?.focus()};
  const nT=$('#nTxt');if(nT){let snap0=null,orig='';const grow=()=>{nT.style.height='auto';nT.style.height=Math.min(320,nT.scrollHeight+2)+'px'};grow();
    nT.onfocus=()=>{snap0=snapState();orig=n.notes||''};
    nT.oninput=()=>{const v=nT.value;if(v)n.notes=v;else delete n.notes;cur.updatedAt=Date.now();dirty();grow();cancelAnimationFrame(nT._r);nT._r=requestAnimationFrame(renderMap)};
    nT.onblur=()=>{if(snap0&&(n.notes||'')!==orig){undo.push(snap0);redo=[]}snap0=null}}
  if(isR||!TRIP())return;
  const dS=$('#dS'),dE=$('#dE');
  dS.onchange=()=>mutate(()=>{let e2=dE.value||null;if(!n.start&&dS.value&&!e2&&!n.fixed)e2=null;setDates(sel,dS.value||null,e2)});
  dE.onchange=()=>mutate(()=>{let s2=dS.value||dE.value||null;setDates(sel,s2,dE.value||null)});
  $('#dM').onchange=ev=>mutate(()=>{n.maybe=ev.target.checked});
  $('#dF').onchange=ev=>mutate(()=>{n.fixed=ev.target.checked;if(n.fixed)n.end=null});
  const dP=$('#dP');dP.onchange=()=>{const v=dP.value.trim();let nv;if(!v)nv=undefined;else if(v.toLowerCase()==='none')nv='-';else{const p=findPlace(v);if(!p){dP.value=n.place==='-'?'None':(n.place||'');dP.title='Pick a place from the list';return}nv=p.name}if(nv===n.place)return;mutate(()=>{if(nv===undefined)delete n.place;else n.place=nv})};dP.onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();dP.blur()}};
  const c=$('#dC');if(c)c.onclick=()=>mutate(()=>setDates(sel,null,null));
}

/* ---------- calendar ---------- */
const calPane=$('#calPane'),calScroll=$('#calScroll'),calSvg=$('#calSvg'),tray=$('#tray'),threads=$('#threads'),stage=$('#stage');
let C=null,frozen=null,barDrag=null;
function calRange(){let lo=Infinity,hi=-Infinity;for(const id in cur.nodes){if(id===cur.rootId)continue;const n=cur.nodes[id];if(!n.start)continue;const s=toDay(n.start);lo=Math.min(lo,s);hi=Math.max(hi,toDay(n.end)||s)}if(!isFinite(lo)){lo=todayN;hi=todayN+42}lo-=2;hi+=4;lo-=(new Date(lo*DAY).getUTCDay()+6)%7;return[lo,hi]}
function subtreeIds(id){const out=[];const w=x=>{out.push(x);N(x).children.forEach(w)};w(id);return out}
function pack(items){const rows=[];items.sort((a,b)=>a.x1-b.x1||a.x2-b.x2);items.forEach(it=>{let r=rows.findIndex(end=>end<=it.x1-4);if(r<0){r=rows.length;rows.push(0)}rows[r]=it.xr;it.row=r});return rows.length}
function itemFor(id){const n=N(id),X=C.X,s=toDay(n.start),e=toDay(n.end);const point=e==null;const x1=X(s),x2=point?x1:X(e);const lab=label(n)+(point?'':' · '+(e-s)+'n');const lw=tw(lab)*11.5/13+14;const inside=!point&&(x2-x1)>=lw;return{id,n,x1,x2,point,lab,inside,xr:inside?x2:(point?x1+10:x2)+lw}}
function barSvg(it,y,h){const n=it.n,col=colorOf(it.id),isSel=sel===it.id;let s=`<g class="bar${hov===it.id?' hov':''}" data-id="${it.id}" data-x1="${it.x1}" data-x2="${it.x2}" data-point="${it.point?1:0}">`+(n.notes?`<title>${esc(n.notes)}</title>`:'');
  if(it.point){const cx=it.x1,cy=y+h/2;s+=`<path class="hit" d="M${cx} ${cy-8} L${cx+8} ${cy} L${cx} ${cy+8} L${cx-8} ${cy} Z" style="fill:${n.fixed?'var(--fixed)':(n.maybe?'var(--panel)':col)};stroke:${n.fixed?'var(--fixed)':col}" stroke-width="1.6" ${n.maybe?'stroke-dasharray="3 2"':''}/>`;
    if(isSel)s+=`<path d="M${cx} ${cy-12} L${cx+12} ${cy} L${cx} ${cy+12} L${cx-12} ${cy} Z" fill="none" style="stroke:var(--accent)" stroke-width="2"/>`;
    s+=`<text x="${cx+12}" y="${cy+4}" style="fill:var(--ink)">${esc(it.lab)}</text>`}
  else{const w=Math.max(4,it.x2-it.x1);const filled=!n.maybe;s+=`<rect class="hit" x="${it.x1}" y="${y}" width="${w}" height="${h}" rx="6" style="fill:${filled?col:'var(--panel)'};stroke:${n.fixed?'var(--fixed)':col}" stroke-width="1.6" ${n.maybe?'stroke-dasharray="5 3"':''}/>`;
    if(isSel)s+=`<rect x="${it.x1-3}" y="${y-3}" width="${w+6}" height="${h+6}" rx="8" fill="none" style="stroke:var(--accent)" stroke-width="2"/>`;
    s+=`<rect x="${it.x1}" y="${y}" width="7" height="${h}" fill="transparent" style="cursor:ew-resize" data-edge="l"/><rect x="${it.x1+w-7}" y="${y}" width="7" height="${h}" fill="transparent" style="cursor:ew-resize" data-edge="r"/>`;
    s+=it.inside?`<text x="${it.x1+8}" y="${y+h/2+4}" style="fill:${filled?'var(--on-branch)':'var(--ink)'};font-weight:500">${esc(it.lab)}</text>`:`<text x="${it.x2+6}" y="${y+h/2+4}" style="fill:var(--ink)">${esc(it.lab)}</text>`}
  return s+'</g>'}
function renderCal(){
  const calOn=cur.cal&&TRIP();$('#modes').hidden=!calOn;root.querySelectorAll('#modes button').forEach(b=>b.classList.toggle('on',b.dataset.mode===cur.mode));$('#calToggle').checked=!!cur.cal;
  if(!calOn){calPane.hidden=true;threads.innerHTML='';return}
  calPane.hidden=false;const mode=cur.mode;const[lo,hi]=frozen||calRange();const days=hi-lo;
  const W=calScroll.clientWidth||700;const gut=mode==='a'?150:mode==='b'?180:14;const dw=Math.max(11,(W-gut-24)/days);
  const X=d=>gut+(d-lo)*dw;C={lo,hi,dw,X,gut};const width=Math.ceil(gut+days*dw+24);
  const HEAD=40,RH=30,BH=22;let body='',y=HEAD+8;
  const fixedIds=Object.keys(cur.nodes).filter(id=>id!==cur.rootId&&N(id).fixed&&N(id).start);
  const dated=id=>id!==cur.rootId&&N(id).start&&!N(id).fixed;
  const undated=[];
  if(mode==='a'){
    groups().forEach(top=>{const col=colorOf(top);const items=[top,...N(top).children.filter(c=>groupOf(c)!==c)].filter(dated).map(itemFor);const rows=Math.max(1,pack(items));const h=rows*RH+10;
      body+=`<line x1="0" x2="${width}" y1="${y+h}" y2="${y+h}" style="stroke:var(--line)"/>`;
      body+=`<g data-id="${top}" class="lane"><circle cx="16" cy="${y+16}" r="5" style="fill:${col}"/><text x="28" y="${y+20}" style="fill:var(--ink);font-weight:600;font-size:12.5px">${esc(trunc(N(top).text||'Untitled',gut-36))}</text></g>`;
      if(!items.length)body+=`<text x="${gut+8}" y="${y+20}" class="cal-t">No dates in this branch yet</text>`;
      items.forEach(it=>{body+=barSvg(it,y+5+it.row*RH,BH)});y+=h});
    Object.keys(cur.nodes).forEach(id=>{const n=N(id);if(id===cur.rootId||n.start)return;if(n.children.length)return;undated.push(id)});
  }else if(mode==='b'){
    const rows=[];const walk=(id,d)=>{rows.push({id,d});if(!N(id).collapsed)N(id).children.forEach(c=>walk(c,d+1))};walk(cur.rootId,0);
    body+=`<rect x="0" y="${HEAD}" width="${gut-6}" height="${rows.length*RH+16}" style="fill:var(--panel-2)"/><text x="10" y="${HEAD+13}" class="cal-t" style="font-size:10px;letter-spacing:.06em">NO DATE YET</text>`;
    const pos={};
    rows.forEach((r,i)=>{const n=N(r.id),yy=y+8+i*RH;let x;if(r.id!==cur.rootId&&n.start){x=X(toDay(n.start))}else{x=10+r.d*12}pos[r.id]={x,y:yy}});
    rows.forEach(r=>{if(r.id===cur.rootId)return;const p=pos[N(r.id).parent],c=pos[r.id];if(!p)return;const ax=p.x+6,ay=p.y+BH,cy=c.y+BH/2;const r2=Math.min(8,Math.abs(cy-ay));const dir=c.x>=ax?1:-1;
      body+=`<path d="M${ax} ${ay} V${cy-r2} Q${ax} ${cy} ${ax+dir*r2} ${cy} H${c.x}" fill="none" style="stroke:${colorOf(r.id)}" stroke-opacity=".5" stroke-width="1.5"/>`});
    rows.forEach(r=>{const n=N(r.id),c=pos[r.id],isR=r.id===cur.rootId;
      if(!isR&&n.start){const it=itemFor(r.id);body+=barSvg(it,c.y,BH)}
      else{const col=isR?'var(--ink)':colorOf(r.id);const maxw=gut-c.x-14;const t=trunc(label(n),Math.max(30,maxw-14),false);const w=Math.min(maxw,tw(t)*12/13+16);
        body+=`<g class="chip" data-id="${r.id}" style="cursor:pointer"><rect class="hit" x="${c.x}" y="${c.y}" width="${w}" height="${BH}" rx="11" style="fill:${isR?'var(--ink)':'var(--panel)'};stroke:${col}" stroke-width="${sel===r.id?2.5:1.4}" ${n.maybe?'stroke-dasharray="4 3"':''}/><text x="${c.x+8}" y="${c.y+15}" style="fill:${isR?'var(--bg)':'var(--ink)'};font-size:12px;font-weight:${isR?600:500}">${esc(t)}</text></g>`}});
    y+=rows.length*RH+16;
  }else{
    const items=Object.keys(cur.nodes).filter(dated).map(itemFor);const rows=Math.max(1,pack(items));items.forEach(it=>{body+=barSvg(it,y+4+it.row*RH,BH)});y+=rows*RH+10;
    Object.keys(cur.nodes).forEach(id=>{const n=N(id);if(id===cur.rootId||n.start)return;if(n.children.length)return;undated.push(id)});
  }
  const FB=fixedIds.length?34:6;const H=y+FB;
  let grid='';for(let d=lo;d<=hi;d++){const x=X(d),wd=new Date(d*DAY).getUTCDay();if(wd===6)grid+=`<rect x="${x}" y="${HEAD}" width="${dw*2}" height="${H-HEAD}" style="fill:var(--weekend)"/>`;if(wd===1)grid+=`<line x1="${x}" x2="${x}" y1="${HEAD-6}" y2="${H}" style="stroke:var(--line)"/><text x="${x+3}" y="${HEAD-8}" class="cal-t">${new Date(d*DAY).getUTCDate()}</text>`;const dt=new Date(d*DAY);if(dt.getUTCDate()===1||d===lo)grid+=`<text x="${x+3}" y="15" class="cal-m">${MON[dt.getUTCMonth()]}${dt.getUTCMonth()===0||d===lo?' '+dt.getUTCFullYear():''}</text>`}
  grid+=`<line x1="0" x2="${width}" y1="${HEAD}" y2="${HEAD}" style="stroke:var(--line)"/>`;
  if(todayN>=lo&&todayN<=hi)grid+=`<line x1="${X(todayN)}" x2="${X(todayN)}" y1="${HEAD}" y2="${H}" style="stroke:var(--accent)" stroke-dasharray="2 3"/><text x="${X(todayN)+3}" y="${HEAD+11}" style="fill:var(--accent);font-size:10px">today</text>`;
  let fx='';let lastX=[-1e9,-1e9];fixedIds.sort((a,b)=>toDay(N(a).start)-toDay(N(b).start)).forEach(id=>{const x=X(toDay(N(id).start));const t=trunc(label(N(id)),150);const lane=(x-lastX[0]>tw(t)+20)?0:1;lastX[lane]=x+0;if(lane===0)lastX[0]=x;
    fx+=`<g class="bar fixedline" data-id="${id}" data-x1="${x}" data-x2="${x}" data-point="1"><line x1="${x}" x2="${x}" y1="${HEAD}" y2="${H-FB+4}" style="stroke:var(--fixed)" stroke-width="${sel===id?3:2}"/><rect class="hit" x="${x-5}" y="${HEAD}" width="10" height="${H-HEAD}" fill="transparent"/><text x="${x+4}" y="${H-FB+17+lane*13}" style="fill:var(--fixed);font-size:11px;font-weight:600">${esc(t)}</text></g>`});
  calSvg.setAttribute('width',width);calSvg.setAttribute('height',H);calSvg.innerHTML=grid+body+fx;
  $('#calTitle').innerHTML=`<strong>${{a:'Timeline',b:'Map on dates',c:'Strip'}[mode]}</strong> · drag bars to move, drag their ends to change dates`;
  $('#calSpan').textContent=`${fmt(lo)} – ${fmt(hi)} ${new Date(hi*DAY).getUTCFullYear()}`;
  if(mode!=='b'&&undated.length){tray.hidden=false;tray.innerHTML='<span>No dates yet:</span>'+undated.map(id=>`<button type="button" data-id="${id}">${esc(trunc(label(N(id)),160))}</button>`).join('')}else{tray.hidden=true;tray.innerHTML=''}
  requestAnimationFrame(drawThreads);
}
calSvg.addEventListener('pointerdown',e=>{hideCtx();if(e.button!==0)return;const g=e.target.closest('.bar,.chip,.lane');if(!g)return;const id=g.dataset.id;if(editing)commitEdit();
  if(!g.classList.contains('bar')){select(id);return}
  const n=N(id);const edge=e.target.dataset.edge;const part=g.dataset.point==='1'?'body':(edge||'body');
  barDrag={id,part,sx:e.clientX,s0:toDay(n.start),e0:toDay(n.end),last:0,moved:false};calSvg.setPointerCapture(e.pointerId);if(sel!==id){sel=id;renderMap();renderInsp()}});
calSvg.addEventListener('pointermove',e=>{if(!barDrag){const g=e.target.closest('[data-id]');setHov(g?g.dataset.id:null);return}
  const dd=Math.round((e.clientX-barDrag.sx)/C.dw);if(dd===barDrag.last)return;
  if(!barDrag.moved){undo.push(snapState());redo=[];barDrag.moved=true;frozen=[C.lo,C.hi]}barDrag.last=dd;const b=barDrag,n=N(b.id);
  if(b.part==='body'){n.start=toIso(b.s0+dd);if(b.e0!=null)n.end=toIso(b.e0+dd)}
  else if(b.part==='l'){n.start=toIso(Math.min(b.s0+dd,b.e0-1))}
  else{n.end=toIso(Math.max(b.e0+dd,b.s0+1))}
  renderCal();renderMap();renderInsp()});
const endBar=()=>{if(!barDrag)return;const b=barDrag;barDrag=null;frozen=null;if(b.moved)changed();else renderAll()};
calSvg.addEventListener('pointerup',endBar);calSvg.addEventListener('pointercancel',endBar);
calSvg.addEventListener('pointerleave',()=>{if(!barDrag)setHov(null)});
calSvg.addEventListener('dblclick',e=>{const g=e.target.closest('[data-id]');if(!g)return;select(g.dataset.id);focusDates()});
calSvg.addEventListener('contextmenu',e=>{const g=e.target.closest('[data-id]');if(!g)return;e.preventDefault();select(g.dataset.id);showCtx(e.clientX,e.clientY)});
tray.addEventListener('click',e=>{const b=e.target.closest('button[data-id]');if(!b)return;select(b.dataset.id);focusDates()});
calScroll.addEventListener('scroll',()=>drawThreads(),{passive:true});
function openNotes(){if(!sel)select(cur.rootId);notesOpen=true;lsSet('mindmap.notes','1');renderInsp();const t=$('#nTxt');if(t){t.focus();t.setSelectionRange(t.value.length,t.value.length)}}
function focusDates(){if(!sel||sel===cur.rootId)return;renderInsp();const d=$('#dS');if(d){d.focus();try{d.showPicker&&d.showPicker()}catch(e){}}}

function drawThreads(){if(!cur||!cur.cal||cur.mode!=='c'){threads.innerHTML='';return}
  const sr=stage.getBoundingClientRect(),mr=mapPane.getBoundingClientRect(),cr=calScroll.getBoundingClientRect();let s='';
  calSvg.querySelectorAll('.bar').forEach(b=>{const id=b.dataset.id;const ng=vp.querySelector(`g.node[data-id="${id}"] .box`);if(!ng)return;const a=ng.getBoundingClientRect(),hit=b.querySelector('.hit');if(!hit)return;const r=hit.getBoundingClientRect();
    if(a.bottom<mr.top||a.top>mr.bottom||a.right<mr.left||a.left>mr.right)return;if(r.right<cr.left||r.left>cr.right||r.bottom<cr.top||r.top>cr.bottom)return;
    const x1=a.left+a.width/2-sr.left,y1=a.bottom-sr.top,x2=Math.max(cr.left,Math.min(cr.right,r.left+Math.min(r.width/2,18)))-sr.left,y2=Math.max(cr.top,r.top)-sr.top;
    const on=id===hov||id===sel;s+=`<path d="M${x1} ${y1} C${x1} ${(y1+y2)/2} ${x2} ${(y1+y2)/2} ${x2} ${y2}" fill="none" style="stroke:${colorOf(id)}" stroke-opacity="${on?.95:.28}" stroke-width="${on?2:1.2}" ${N(id).maybe?'stroke-dasharray="4 3"':''}/>`});
  threads.innerHTML=s}

/* ---------- context menu ---------- */
const ctxEl=$('#ctx');
function showCtx(x,y){const n=N(sel),isR=sel===cur.rootId;const items=[['child','Add child','Tab'],['sib','Add sibling','Shift+Enter'],...(isR||!TRIP()?[]:[['nextadd','Add next stop','Ctrl+Enter'],...(n.parent!==cur.rootId||n.next?[['nexttog',n.next?'Make a regular idea':'Make next stop','N']]:[])]),['edit','Rename','Enter'],['notes',n.notes?'Edit notes':'Add notes','Ctrl+E'],['color','Colour…','C'],...(isR||!TRIP()?[]:[['dates','Set dates','Ctrl+D'],['maybe',n.maybe?'Mark committed':'Mark maybe','M'],['fixed',n.fixed?'Not a fixed booking':'Fixed booking','F']]),...(n.children.length?[['fold',n.collapsed?'Expand':'Collapse','Space']]:[]),...(isR?[]:[['del','Delete branch','Shift+Del']])];
  ctxEl.innerHTML=items.map(i=>`<button type="button" data-act="${i[0]}">${i[1]}<kbd>${i[2]}</kbd></button>`).join('');ctxEl.hidden=false;const w=ctxEl.offsetWidth,h=ctxEl.offsetHeight;ctxEl.style.left=Math.min(x,innerWidth-w-8)+'px';ctxEl.style.top=Math.min(y,innerHeight-h-8)+'px'}
function hideCtx(){ctxEl.hidden=true}
ctxEl.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;hideCtx();act(b.dataset.act)});
$('#actsBar').addEventListener('click',e=>{const b=e.target.closest('button');if(b)act(b.dataset.act)});
on(document,'pointerdown',e=>{if(!ctxEl.hidden&&!ctxEl.contains(e.target))hideCtx()});
function act(a){if(!sel)return;const n=N(sel);switch(a){case'child':addChild(sel);break;case'nextadd':addNext(sel);break;case'nexttog':toggleNext(sel);break;case'sib':addSibling(sel);break;case'edit':startEdit(sel);break;case'notes':openNotes();break;case'color':colorPick=true;renderInsp();break;case'dates':if(TRIP())focusDates();break;case'del':delNode(sel);break;case'maybe':if(TRIP()&&sel!==cur.rootId)mutate(()=>{n.maybe=!n.maybe});break;case'fixed':if(TRIP()&&sel!==cur.rootId)mutate(()=>{n.fixed=!n.fixed;if(n.fixed)n.end=null});break;case'fold':if(n.children.length)mutate(()=>{n.collapsed=!n.collapsed});break;case'sort':if(n.children.length>1)mutate(()=>{const k=n.children.map((c,i)=>({c,i,s:toDay(N(c).start)}));k.sort((a,b)=>((a.s==null)-(b.s==null))||((a.s||0)-(b.s||0))||(a.i-b.i));n.children=k.map(x=>x.c);n.children.forEach(c=>{N(c).off=null})});break}}

/* ---------- keyboard ---------- */
function nav(dir){if(!sel){select(cur.rootId);return}const a=LAY[sel];if(!a)return;const n=N(sel);
  if(dir==='L'||dir==='R'){const isR=sel===cur.rootId;
    if(isR){const kids=n.collapsed?[]:n.children.filter(c=>sideOf(c)===dir);if(kids.length){select(kids[Math.floor((kids.length-1)/2)]);return}}
    else if(dir==='R'&&a.mode==='col'&&nextOf(sel)){select(nextOf(sel));return}
    else if(dir==='L'&&n.next){select(n.parent);return}
    else if(a.mode==='col'){}
    else{const out=a.side===dir;if(out){if(!n.collapsed&&n.children.length){select(n.children[Math.floor((n.children.length-1)/2)]);return}if(n.children.length){mutate(()=>{n.collapsed=false});return}}else{select(n.parent);return}}}
  const ac={x:a.x+a.w/2,y:a.y};let best=null,bs=Infinity;for(const id in LAY){if(id===sel)continue;const l=LAY[id],c={x:l.x+l.w/2,y:l.y},dx=c.x-ac.x,dy=c.y-ac.y;let p,s;
    if(dir==='U'){p=-dy;s=Math.abs(dx)}else if(dir==='D'){p=dy;s=Math.abs(dx)}else if(dir==='L'){p=-dx;s=Math.abs(dy)}else{p=dx;s=Math.abs(dy)}if(p<=4)continue;const sc=p+s*2.2;if(sc<bs){bs=sc;best=id}}
  if(best)select(best)}
const isField=t=>t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable);
on(root,'keydown',e=>{if(RO)return;
  if(routeFull&&e.key==='Escape'){e.preventDefault();setFull(false);return}
  if(!$('#help').hidden){if(e.key==='Escape'||e.key==='?'){e.preventDefault();$('#help').hidden=true}return}
  const k=e.key,mod=e.ctrlKey||e.metaKey,lk=k.toLowerCase();
  if(mod&&lk==='k'){e.preventDefault();if(TRIP())setCal(!cur.cal);return}
  if(isField(e.target)){if(e.key==='Escape'&&e.target.closest('#insp')){e.target.blur();mapPane.focus({preventScroll:true})}return}
  if(mod&&lk==='z'){e.preventDefault();e.shiftKey?doRedo():doUndo();return}
  if(mod&&lk==='y'){e.preventDefault();doRedo();return}
  if(mod&&lk==='e'){e.preventDefault();openNotes();return}
  if(mod&&lk==='d'){e.preventDefault();if(!TRIP())return;if(!sel)select(cur.rootId);focusDates();return}
  if(mod&&k==='Enter'){e.preventDefault();if(TRIP())addNext(sel||cur.rootId);return}
  if(mod)return;
  if(colorPick&&sel){if(k==='Shift'||k==='Alt')return;e.preventDefault();colorPick=false;const ci='12345678'.indexOf(k);if(k==='0')setColor(sel,null);else if(ci>=0&&k.length===1)setColor(sel,PAL[ci]);renderInsp();return}
  if(k==='?'){e.preventDefault();$('#help').hidden=false;return}
  if(!ctxEl.hidden&&k==='Escape'){hideCtx();return}
  if(TRIP()&&cur.cal&&!e.altKey&&(k==='1'||k==='2'||k==='3')){e.preventDefault();setMode({1:'a',2:'b',3:'c'}[k]);return}
  if(k==='Tab'){e.preventDefault();addChild(sel||cur.rootId);return}
  if(k==='Enter'){e.preventDefault();if(e.shiftKey)addSibling(sel||cur.rootId);else startEdit(sel||cur.rootId);return}
  if(k==='F2'){e.preventDefault();startEdit(sel||cur.rootId);return}
  if((k==='Delete'||k==='Backspace')&&e.shiftKey){e.preventDefault();delNode(sel);return}
  if(k==='Escape'){if(sel)select(null);return}
  if(k.startsWith('Arrow')){e.preventDefault();const d={ArrowLeft:'L',ArrowRight:'R',ArrowUp:'U',ArrowDown:'D'}[k];if(e.altKey&&(d==='U'||d==='D')){reorder(sel,d==='U'?-1:1);return}nav(d);return}
  if(k==='/'){e.preventDefault();setAgent(true);return}
  if(lk==='r'&&!e.altKey){e.preventDefault();if(TRIP())setRoute(!routeOpen);return}
  if(!sel)return;
  if(k===' '){e.preventDefault();act('fold');return}
  if(lk==='m'&&!e.altKey){e.preventDefault();if(TRIP())act('maybe');return}
  if(lk==='f'&&!e.altKey){e.preventDefault();if(TRIP())act('fixed');return}
  if(lk==='n'&&!e.altKey){e.preventDefault();if(TRIP())toggleNext(sel);return}
  if(lk==='c'&&!e.altKey){e.preventDefault();colorPick=true;renderInsp();return}
});
on(root,'keydown',e=>{if(e.defaultPrevented)e.stopPropagation()});
$('#helpBtn').onclick=()=>{$('#help').hidden=false};$('#helpX').onclick=()=>{$('#help').hidden=true};
$('#help').addEventListener('click',e=>{if(e.target.id==='help')$('#help').hidden=true});

/* ---------- toolbar ---------- */
function setCal(on){if(!TRIP())return;cur.cal=on;dirty();renderAll();requestAnimationFrame(fit)}
function setMode(m){cur.mode=m;dirty();renderAll()}
$('#calToggle').onchange=e=>setCal(e.target.checked);
root.querySelectorAll('#modes button').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
$('#title').addEventListener('change',e=>{const v=e.target.value.trim();if(v&&v!==titleText&&opts.onRename)opts.onRename(v);else e.target.value=titleText});
$('#title').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();e.target.blur();mapPane.focus({preventScroll:true})}});

/* ---------- storage: the host owns the file ---------- */
let saveT=null;
function dirty(){if(!cur||RO)return;if(AG.preview)return;cur.updatedAt=Date.now();opts.onChange&&opts.onChange(cur)}
function flushNow(){}
function renderList(){}

/* ---------- route map ---------- */
/* [name, lat, lon, ...aliases]; 3-letter capitals are airport codes (matched case-sensitively). */
function placeOf(id){return placeOfDoc(cur,id)}
$('#placeList').innerHTML=PLACE_NAMES.map(g=>`<option value="${esc(g)}">`).join('')+'<option value="None">';
/* Stays (date ranges) and fixed bookings with a place become stops; overlapping maybes are alternatives. */
function computeRoute(){return computeRouteDoc(cur)}

const routeEl=$('#route'),rSvg=$('#routeSvg'),rWrap=$('#routeMapWrap'),rLegs=$('#routeLegs');
let routeOpen=lsGet('mindmap.route')==='1'&&!RO,routeFull=false,routeRaf=0,pendingAnim=false,landGeo=null,lastSize='',routeT=null,animating=false;
const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function getLand(){if(landGeo)return landGeo;try{landGeo=topoFeature(landTopo,landTopo.objects.land)}catch(e){}return landGeo}
function scheduleRoute(){if(!routeOpen||animating||!TRIP())return;clearTimeout(routeT);routeT=setTimeout(()=>drawRoute(false),180)}
const PLANE='M11 0 L4 -1.6 L-1 -8 L-3.5 -8 L-0.6 -1.6 L-6 -1.6 L-8 -4 L-9.6 -4 L-8.2 0 L-9.6 4 L-8 4 L-6 1.6 L-0.6 1.6 L-3.5 8 L-1 8 L4 1.6 Z';
function drawRoute(animate){if(!routeOpen||!cur)return;cancelAnimationFrame(routeRaf);animating=false;
  const W=rWrap.clientWidth,H=rWrap.clientHeight;if(!W||!H){pendingAnim=pendingAnim||animate;return}lastSize=W+'x'+H;
  if(false){rSvg.innerHTML='';$('#routeMsg').hidden=false;$('#routeMsg').textContent="The map library didn't load. Check your connection, then close and reopen this panel.";return}
  const{stops,legs}=computeRoute();const places=[...new Map(stops.flatMap(s=>s.places.map(p=>[p.pl.name,p]))).values()];
  $('#routeMsg').hidden=!!places.length;$('#routeMsg').textContent='Give ideas dates and a place to see the route. Places are read from names like "Lisbon stay" or "Leave ZNZ", or set in the Place box.';
  const proj=d3.geoNaturalEarth1();
  if(places.length){let lo=places.map(p=>p.pl.lon),la=places.map(p=>p.pl.lat);let x0=Math.min(...lo),x1=Math.max(...lo),y0=Math.min(...la),y1=Math.max(...la);
    if(x1-x0<36){const c=(x0+x1)/2;x0=c-18;x1=c+18}if(y1-y0<24){const c=(y0+y1)/2;y0=c-12;y1=c+12}const px=(x1-x0)*.1,py=(y1-y0)*.14;
    proj.fitExtent([[18,routeFull?70:52],[W-18,H-18]],{type:'MultiPoint',coordinates:[[x0-px,y0-py],[x1+px,y1+py],[x0-px,y1+py],[x1+px,y0-py],[(x0+x1)/2,y1+py],[(x0+x1)/2,y0-py]]})}
  else proj.fitExtent([[10,10],[W-10,H-10]],{type:'Sphere'});
  const path=d3.geoPath(proj);const P=p=>proj([p.lon,p.lat]);
  let s=`<path class="r-sphere" d="${path({type:'Sphere'})}"/><path class="r-grat" d="${path(d3.geoGraticule10())}"/>`;const land=getLand();if(land)s+=`<path class="r-land" d="${path(land)}"/>`;
  const geo=legs.map((L,i)=>{const a=P(L.from),b=P(L.to);const dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy)||1;let nx=-dy/d,ny=dx/d;if(ny>0){nx=-nx;ny=-ny}const k=Math.min(d*.24,140);const c=[(a[0]+b[0])/2+nx*k,(a[1]+b[1])/2+ny*k];return{a,b,c,d:`M${a[0].toFixed(1)} ${a[1].toFixed(1)} Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`}});
  legs.forEach((L,i)=>{s+=`<path class="r-glow" d="${geo[i].d}" style="stroke:${colorOf(L.toId)}"/><path class="r-leg${L.dashed?' maybe':''}" data-i="${i}" d="${geo[i].d}" style="stroke:${colorOf(L.toId)}"/>`});
  const boxes=[];const pos=places.map(p=>P(p.pl));const cl=[];places.forEach((p,i)=>{const c=cl.find(c=>Math.hypot(pos[c.i][0]-pos[i][0],pos[c.i][1]-pos[i][1])<20);if(c)c.m.push(i);else cl.push({i,m:[i]})});const lead={};cl.forEach(c=>{lead[c.i]=c});
  places.forEach((p,pi)=>{const[x,y]=pos[pi];const cc=lead[pi];const its=cc?cc.m.flatMap(j=>places[j].items):p.items;const nm=cc?cc.m.map(j=>places[j].pl.name).join(' · '):p.pl.name;const allMaybe=cc?cc.m.every(j=>places[j].maybe):p.maybe;const lo=Math.min(...its.map(i=>i.s)),hi=Math.max(...its.map(i=>i.e));const col=colorOf(its[0].id);
    const sub=lo===hi?fmt(lo):fmt(lo)+' – '+fmt(hi);const w=Math.max(nm.length*7,sub.length*5.6)+6;
    const cand=[[9,-2,'start'],[9,12,'start'],[-9,-2,'end'],[-9,12,'end'],[9,-16,'start']];let pick=null;
    if(cc)for(const[ox,oy,an]of cand){const bx=an==='start'?x+ox:x+ox-w,by=y+oy-11;const r=[bx,by,bx+w,by+24];if(!boxes.some(q=>r[0]<q[2]&&r[2]>q[0]&&r[1]<q[3]&&r[3]>q[1])){pick=[ox,oy,an,r];break}}
    s+=`<g class="r-stop" data-name="${esc(p.pl.name)}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle class="r-pulse" r="6" style="fill:${col}"/><circle class="r-dot" r="4.6" style="fill:${col}"/>`;
    if(pick){boxes.push(pick[3]);s+=`<text class="r-name" x="${pick[0]}" y="${pick[1]}" text-anchor="${pick[2]}">${esc(nm)}</text><text class="r-sub" x="${pick[0]}" y="${pick[1]+12}" text-anchor="${pick[2]}">${esc(sub)}${allMaybe?' · maybe':''}</text>`}
    s+='</g>'});
  s+=`<g id="rPlane" opacity="0"><path d="${PLANE}" class="r-plane"/></g>`;
  const span=stops.length?fmt(stops[0].s)+' – '+fmt(stops[stops.length-1].e)+' '+new Date(stops[stops.length-1].e*DAY).getUTCFullYear():'';
  s+=`<text id="rTick" class="r-tick" x="18" y="${routeFull?40:30}">${esc(span)}</text>`;
  rSvg.setAttribute('viewBox',`0 0 ${W} ${H}`);rSvg.innerHTML=s;
  rLegs.innerHTML=legs.length?`<div class="r-sum">${legs.length} leg${legs.length===1?'':'s'} · ${esc(span)}</div>`+legs.map((L,i)=>`<button type="button" class="r-row" data-i="${i}"><span class="r-date">${fmtW(L.date)}</span><span class="r-mid"><span class="r-route"><span class="dot" style="background:${colorOf(L.toId)}"></span>${esc(L.from.name)} → ${esc(L.to.name)}</span><span class="r-fl">${esc(L.flight||'')}${L.dashed?`${L.flight?' · ':''}<em>maybe</em>`:''}</span></span></button>`).join(''):'<div class="r-sum">No legs yet.</div>';
  rLegs._legs=legs;
  const stopsEl=[...rSvg.querySelectorAll('.r-stop')],legEl=[...rSvg.querySelectorAll('.r-leg')],glowEl=[...rSvg.querySelectorAll('.r-glow')];
  if(!animate||reduced||!legs.length){stopsEl.forEach(e=>e.classList.add('on'));legEl.forEach(e=>e.classList.add('done'));glowEl.forEach(e=>e.classList.add('done'));return}
  /* animation: legs grouped by date fly together; the plane follows the first of each group */
  const lens=legEl.map(e=>e.getTotalLength());legEl.forEach((e,i)=>{e.style.strokeDasharray=lens[i];e.style.strokeDashoffset=lens[i]});
  const byName=n=>stopsEl.find(e=>e.dataset.name===n.name);
  const first=legs.filter(L=>L.date===legs[0].date).map(L=>L.from);first.forEach(p=>byName(p)?.classList.add('on'));
  const groups=[];legs.forEach((L,i)=>{const g=groups[groups.length-1];if(g&&g.date===L.date)g.idx.push(i);else groups.push({date:L.date,idx:[i]})});
  let t=500;groups.forEach(g=>{const len=Math.max(...g.idx.map(i=>lens[i]));g.t0=t;g.dur=650+Math.min(1300,len*2.4);t+=g.dur+380});
  const plane=$('#rPlane'),tick=$('#rTick');const ease=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;let start=null,gi=-1;animating=true;
  const frame=ts=>{if(start==null)start=ts;const el=ts-start;let active=null;
    groups.forEach((g,k)=>{const p=Math.max(0,Math.min(1,(el-g.t0)/g.dur));if(p>0&&p<1)active={g,p:ease(p),k};
      g.idx.forEach(i=>{legEl[i].style.strokeDashoffset=lens[i]*(1-ease(p));if(p>=1&&!legEl[i].classList.contains('done')){legEl[i].style.strokeDasharray='';legEl[i].style.strokeDashoffset='';legEl[i].classList.add('done');glowEl[i].classList.add('done');byName(legs[i].to)?.classList.add('on')}})});
    if(active){const i=active.g.idx[0],len=lens[i],pt=legEl[i].getPointAtLength(len*active.p),pv=legEl[i].getPointAtLength(Math.max(0,len*active.p-2));const ang=Math.atan2(pt.y-pv.y,pt.x-pv.x)*180/Math.PI;
      plane.setAttribute('transform',`translate(${pt.x} ${pt.y}) rotate(${active.p<.01?0:ang}) scale(1.15)`);plane.setAttribute('opacity','1');
      if(gi!==active.k){gi=active.k;const L=legs[i];const alts=active.g.idx.length>1?` (+${active.g.idx.length-1} option${active.g.idx.length>2?'s':''})`:'';tick.textContent=`${fmtW(L.date)} · ${L.from.name} → ${L.to.name}${alts}`;rLegs.querySelectorAll('.r-row').forEach(r=>r.classList.toggle('now',active.g.idx.includes(+r.dataset.i)))}}
    else plane.setAttribute('opacity',el>groups[groups.length-1].t0?'0':plane.getAttribute('opacity'));
    if(el<t){routeRaf=requestAnimationFrame(frame)}else{animating=false;plane.setAttribute('opacity','0');tick.textContent=span;stopsEl.forEach(e=>e.classList.add('on'));rLegs.querySelectorAll('.r-row.now').forEach(r=>r.classList.remove('now'))}};
  routeRaf=requestAnimationFrame(frame)}
function hiLeg(i){rSvg.querySelectorAll('.r-leg,.r-glow').forEach(e=>e.classList.toggle('hi',i!=null&&+(e.dataset.i??e.nextElementSibling?.dataset.i)===+i))}
rLegs.addEventListener('pointerover',e=>{const r=e.target.closest('.r-row');hiLeg(r?r.dataset.i:null)});
rLegs.addEventListener('pointerleave',()=>hiLeg(null));
rLegs.addEventListener('click',e=>{const r=e.target.closest('.r-row');if(!r)return;const L=rLegs._legs[+r.dataset.i];if(L&&N(L.toId)){select(L.toId)}});
function setRoute(open){routeOpen=open;lsSet('mindmap.route',open?'1':'0');routeEl.hidden=!open;$('#routeBtn').classList.toggle('on',open);$('#routeBtn').setAttribute('aria-pressed',open?'true':'false');if(!open&&routeFull)setFull(false);
  if(open){pendingAnim=true;lastSize=''}else{cancelAnimationFrame(routeRaf);animating=false}requestAnimationFrame(()=>{renderCal();applyView();if(open)drawRoute(true),pendingAnim=false})}
function setFull(on){routeFull=on;routeEl.classList.toggle('full',on);$('#routeFull').textContent=on?'Exit full screen':'Full screen';
  try{if(on&&routeEl.requestFullscreen&&!document.fullscreenElement)routeEl.requestFullscreen().catch(()=>{});if(!on&&document.fullscreenElement)document.exitFullscreen().catch(()=>{})}catch(e){}
  pendingAnim=true;lastSize='';setTimeout(()=>{if(pendingAnim){pendingAnim=false;drawRoute(true)}},120)}
on(document,'fullscreenchange',()=>{if(!document.fullscreenElement&&routeFull)setFull(false)});
$('#routeBtn').onclick=()=>setRoute(!routeOpen);$('#routeClose').onclick=()=>setRoute(false);$('#routeFull').onclick=()=>setFull(!routeFull);$('#routeReplay').onclick=()=>drawRoute(true);
new ResizeObserver(()=>{if(!routeOpen)return;const sz=rWrap.clientWidth+'x'+rWrap.clientHeight;if(sz===lastSize)return;clearTimeout(routeT);routeT=setTimeout(()=>{const a=pendingAnim;pendingAnim=false;drawRoute(a||animating)},120)}).observe(rWrap);

/* ---------- ask Claude ---------- */
const AG={sample:null,turns:[],preview:null,ctl:null,busy:false,mapId:null};
const agEl=$('#agent'),agLog=$('#agLog'),agIn=$('#agIn'),agProp=$('#agProposal'),agStatus=$('#agStatus');
(async()=>{AG.sample=opts.ai||null;
  if(!AG.sample){const b=$('#agentBtn');b.disabled=true;b.title='Ask Claude only works when this page is opened on claude.ai'}})();
function agRules(){return aiRules(cur,toIso(todayN))}
const okDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(toDay(v));
function agDesc(n){return describeNode(cur,n)}
function agApply(ops){const r=applyOps(cur,ops);return{touched:new Set(r.touched),lines:r.lines,skipped:r.skipped}}
function agMsg(kind,text){const d=document.createElement('div');d.className='ag-msg '+kind;d.textContent=text;agLog.appendChild(d);agLog.scrollTop=agLog.scrollHeight;return d}
function agChips(){if(agLog.children.length)return;const ideas=TRIP()?['Suggest 3 things to do at each stop','What should I do between my stops?','Find gaps or overlaps in my dates','Add packing and visa reminders as notes']:['Suggest 5 more ideas for each branch','Group these ideas into themes','What am I missing?','Turn the top branch into next steps'];
  const w=document.createElement('div');w.className='ag-chips';w.innerHTML=`<div class="ag-msg sys">Ask for ${TRIP()?'trip ':''}ideas or changes. The AI's edits show up highlighted on the map until you keep or revert them.</div>`+ideas.map(t=>`<button type="button">${esc(t)}</button>`).join('');
  w.addEventListener('click',e=>{const b=e.target.closest('button');if(b){agIn.value=b.textContent;agSend()}});agLog.appendChild(w)}
function agReset(){agDiscard();AG.turns=[];agLog.innerHTML='';AG.mapId=cur?cur.uid:null;if(!agEl.hidden)agChips()}
function setAgent(open){agEl.hidden=!open;$('#agentBtn').classList.toggle('on',open);if(open&&RO)return;if(open){if(AG.mapId!==(cur&&cur.uid))agReset();agChips();agIn.focus()}else{mapPane.focus({preventScroll:true})}}
const AGERR={not_granted:"Claude wasn't allowed for this page. Reload and allow it to use Ask Claude.",rate_limited:'Too many requests right now. Wait a moment, then send again.',invalid_json:"Claude's answer couldn't be read as map changes. Try asking again, a little more specifically.",prompt_too_large:'This map is too large to send in one go.',refused:'Claude declined that request.',cancelled:'Stopped.',session_expired:'Your claude.ai session expired. Reload the page.',sampling_disabled:'Asking Claude is turned off for this account.'};
async function agSend(){const msg=agIn.value.trim();if(!msg||AG.busy)return;if(!AG.sample){agMsg('sys','Add an OpenAI API key in Settings → Mindmap to use Ask AI.');return}
  if(AG.preview)agKeep();if(editing)commitEdit();agChipsClear();agMsg('me',msg);agIn.value='';AG.turns.push({role:'user',content:msg});
  AG.busy=true;AG.ctl=new AbortController();$('#agSend').disabled=true;$('#agStop').hidden=false;const t0=Date.now();const tick=setInterval(()=>{agStatus.textContent=`Thinking… ${Math.round((Date.now()-t0)/1000)}s`},500);agStatus.textContent='Thinking…';
  const mapAt=cur.uid;
  try{const res=await AG.sample.ask([{role:'system',content:agRules()},...AG.turns.slice(-12)],{signal:AG.ctl.signal});
    if(!cur||cur.uid!==mapAt)throw{code:'cancelled'};
    const reply=typeof res?.reply==='string'?res.reply:'';const ops=Array.isArray(res?.ops)?res.ops:[];
    agMsg('ai',reply||(ops.length?'Here are some changes.':'(no answer)'));
    if(ops.length){const snap=snapState();const r=agApply(ops);if(!r.lines.length){restoreSilently(snap);agMsg('sys',"The AI's changes didn't match this map, so nothing changed.");AG.turns.push({role:'assistant',content:reply+' [proposed changes could not be applied]'})}
      else{undo.push(snap);if(undo.length>200)undo.shift();redo=[];AG.preview={snap,touched:r.touched,lines:r.lines,skipped:r.skipped};normalize();renderAll();agShowProp();AG.turns.push({role:'assistant',content:reply+` [proposed ${r.lines.length} change${r.lines.length===1?'':'s'}]`})}}
    else AG.turns.push({role:'assistant',content:reply||'(no answer)'})}
  catch(e){AG.turns.pop();const m=e&&e.message;agMsg('sys',m==='Stopped'||(e&&e.code==='cancelled')?'Stopped.':(m||'Something went wrong reaching the AI. Try again.'))}
  finally{clearInterval(tick);AG.busy=false;AG.ctl=null;$('#agSend').disabled=false;$('#agStop').hidden=true;agStatus.textContent=''}}
function agChipsClear(){agLog.querySelectorAll('.ag-chips').forEach(x=>x.remove())}
function restoreSilently(s){const o=JSON.parse(s);cur.nodes=o.nodes;cur.rootId=o.rootId}
function agShowProp(){const p=AG.preview;agProp.hidden=false;agProp.innerHTML=`<div class="ag-ph">${p.lines.length} change${p.lines.length===1?'':'s'} on the map, highlighted${p.skipped?` · ${p.skipped} skipped`:''}</div><ul>${p.lines.map(([k,t])=>`<li data-k="${k}">${esc(t)}</li>`).join('')}</ul><div class="row"><button type="button" class="btn" id="agRevert">Revert</button><button type="button" class="btn primary" id="agKeep">Keep changes</button></div>`;
  $('#agRevert').onclick=agRevert;$('#agKeep').onclick=agKeep}
function agKeep(){if(!AG.preview)return;const n=AG.preview.lines.length;AG.preview=null;agProp.hidden=true;agMsg('sys',`Kept ${n} change${n===1?'':'s'}.`);AG.kept=true;const L=AG.turns[AG.turns.length-1];if(L&&L.role==='assistant')L.content+=' (the person kept them)';cur.updatedAt=Date.now();dirty();renderAll()}
function agRevert(){if(!AG.preview)return;const p=AG.preview;AG.preview=null;agProp.hidden=true;restoreSilently(p.snap);const i=undo.lastIndexOf(p.snap);if(i>=0)undo.splice(i,1);if(sel&&!cur.nodes[sel])sel=null;agMsg('sys','Reverted. The map is back to how it was.');const L=AG.turns[AG.turns.length-1];if(L&&L.role==='assistant')L.content+=' (the person reverted them)';renderAll()}
function agDiscard(){if(AG.preview)agRevert()}
$('#agentBtn').onclick=()=>setAgent(agEl.hidden);$('#agClose').onclick=()=>setAgent(false);
$('#agForm').addEventListener('submit',e=>{e.preventDefault();agSend()});
agIn.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();agSend()}else if(e.key==='Escape'){e.preventDefault();mapPane.focus({preventScroll:true})}});
$('#agStop').onclick=()=>AG.ctl&&AG.ctl.abort();

/* ---------- render all ---------- */
function renderAll(){if(!cur)return;normalize();root.classList.toggle('mm-general',!TRIP());root.classList.toggle('mm-ro',RO);const ti=$('#title');if(ti&&document.activeElement!==ti)ti.value=titleText;renderMap();renderInsp();renderCal();scheduleRoute()}
let rT=null;on(window,'resize',()=>{clearTimeout(rT);rT=setTimeout(()=>{renderCal();drawThreads()},80)});
const ro=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>{if(cur&&!barDrag){applyView()}}):null;if(ro){ro.observe(mapPane);cleanups.push(()=>ro.disconnect())}


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
