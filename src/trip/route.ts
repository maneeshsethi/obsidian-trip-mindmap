// Place detection and route computation for trip maps (ported from the reference).
import type { MapDoc, MMNode } from '../model/schema';
import { toDay } from '../model/dates';
import { GAZ } from './gazetteer';

export interface Place { name: string; lat: number; lon: number }
interface Alias { a: string; p: Place; code: boolean; re: RegExp }

const PL: Record<string, Place> = {};
const ALIAS: Alias[] = [];
GAZ.forEach(([name, lat, lon, ...al]) => {
  const p = { name, lat, lon }; PL[name.toLowerCase()] = p;
  [name, ...al].forEach(a => ALIAS.push({ a, p, code: /^[A-Z]{3}$/.test(a), re: /$^/ }));
});
ALIAS.sort((x, y) => y.a.length - x.a.length);
ALIAS.forEach(x => {
  const e = x.a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  x.re = x.code ? new RegExp('(^|[^A-Za-z])' + e + '($|[^A-Za-z])') : new RegExp('(^|[^\\p{L}])' + e + '($|[^\\p{L}])', 'iu');
});
export const PLACE_NAMES = GAZ.map(g => g[0]);

export function detectPlace(t: string | null | undefined): Place | null {
  if (!t) return null;
  for (const x of ALIAS) if (x.re.test(t)) return x.p;
  return null;
}
export function findPlace(v: string | null | undefined): Place | null {
  const s = (v || '').trim().toLowerCase(); if (!s) return null;
  if (PL[s]) return PL[s];
  const x = ALIAS.find(x => x.a.toLowerCase() === s); return x ? x.p : null;
}
export function placeOf(d: MapDoc, id: string): Place | null {
  const n = d.nodes[id]; if (!n || n.place === '-') return null;
  if (n.place) { const p = findPlace(n.place); if (p) return p; }
  const dp = detectPlace(n.text); if (dp) return dp;
  let a = n.parent ? d.nodes[n.parent] : null;
  while (a && a.id !== d.rootId) {
    if (a.place === '-') return null;
    const p = a.place ? findPlace(a.place) : detectPlace(a.text); if (p) return p;
    a = a.parent ? d.nodes[a.parent] : null;
  }
  return null;
}

export interface RouteItem { id: string; n: MMNode; s: number; e: number; pl: Place; maybe: boolean; fixed: boolean }
export interface StopPlace { pl: Place; items: RouteItem[]; maybe: boolean }
export interface Stop { items: RouteItem[]; s: number; e: number; places: StopPlace[] }
export interface Leg { from: Place; to: Place; date: number; dashed: boolean; flight: string; toId: string; fromId: string }

/** Stays (date ranges) and fixed bookings with a place become stops; overlapping maybes are alternatives. */
export function computeRoute(d: MapDoc): { stops: Stop[]; legs: Leg[] } {
  const its: RouteItem[] = [];
  for (const id in d.nodes) {
    if (id === d.rootId) continue;
    const n = d.nodes[id]; if (!n.start) continue;
    const point = !n.end; if (point && !n.fixed) continue;
    const s = toDay(n.start), e = point ? s : toDay(n.end);
    if (s == null || e == null || e < s) continue;
    const pl = placeOf(d, id); if (!pl) continue;
    its.push({ id, n, s, e, pl, maybe: !!n.maybe, fixed: !!n.fixed });
  }
  its.sort((a, b) => a.s - b.s || a.e - b.e);
  const slots: Stop[] = [];
  its.forEach(it => { const L = slots[slots.length - 1]; if (L && it.s < L.e) { L.items.push(it); L.e = Math.max(L.e, it.e); } else slots.push({ items: [it], s: it.s, e: it.e, places: [] }); });
  slots.forEach(sl => {
    const m = new Map<string, StopPlace>();
    sl.items.forEach(it => { const k = it.pl.name; if (!m.has(k)) m.set(k, { pl: it.pl, items: [], maybe: true }); const o = m.get(k)!; o.items.push(it); if (!it.maybe) o.maybe = false; });
    sl.places = [...m.values()];
  });
  const stops: Stop[] = [];
  slots.forEach(sl => {
    const L = stops[stops.length - 1];
    if (L && L.places.length === 1 && sl.places.length === 1 && L.places[0].pl === sl.places[0].pl) {
      L.e = Math.max(L.e, sl.e); L.places[0].items.push(...sl.places[0].items); if (!sl.places[0].maybe) L.places[0].maybe = false;
    } else stops.push(sl);
  });
  const legs: Leg[] = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const A = stops[i], B = stops[i + 1]; const alt = A.places.length > 1 || B.places.length > 1;
    const bI = B.places.flatMap(p => p.items), aI = A.places.flatMap(p => p.items);
    const f = bI.find(it => it.fixed && it.s === B.s) || aI.filter(it => it.fixed && it.s === A.e && it.s > A.s).sort((x, y) => y.s - x.s)[0];
    for (const a of A.places) for (const b of B.places) {
      if (a.pl === b.pl) continue;
      legs.push({ from: a.pl, to: b.pl, date: B.s, dashed: alt || a.maybe || b.maybe, flight: f ? f.n.text : '', toId: b.items[0].id, fromId: a.items[0].id });
    }
  }
  return { stops, legs };
}
