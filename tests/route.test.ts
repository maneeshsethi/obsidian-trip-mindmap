import { describe, expect, test } from 'vitest';
import { newMap } from '../src/model/schema';
import { addChild, setDates } from '../src/model/ops';
import { detectPlace, findPlace, placeOf, computeRoute } from '../src/trip/route';

const trip = () => { const d = newMap('trip', 'Trip'); return { d, R: d.rootId }; };

describe('places', () => {
  test('detects a place by name inside text', () => { expect(detectPlace('Hanoi beach week')?.name).toBe('Hanoi'); });
  test('detects by IATA code', () => { expect(detectPlace('Fly HAN tonight')?.name).toBe('Hanoi'); });
  test('IATA codes only match upper-case words', () => { expect(detectPlace('han')).toBeNull(); });
  test('findPlace by alias, case-insensitive', () => { expect(findPlace('jro')?.name).toBe('Kilimanjaro'); expect(findPlace('nowhere')).toBeNull(); });
  test('placeOf inherits from an ancestor', () => {
    const { d, R } = trip(); const z = addChild(d, R, 'Hanoi'); const k = addChild(d, z, 'Snorkel day');
    expect(placeOf(d, k)?.name).toBe('Hanoi');
  });
  test('place "-" stops inheritance', () => {
    const { d, R } = trip(); const z = addChild(d, R, 'Hanoi'); const k = addChild(d, z, 'Snorkel'); d.nodes[k].place = '-';
    expect(placeOf(d, k)).toBeNull();
  });
});

describe('computeRoute', () => {
  test('two consecutive stays make one leg', () => {
    const { d, R } = trip();
    const a = addChild(d, R, 'Bangkok'); setDates(d, a, '2030-11-01', '2030-11-27');
    const b = addChild(d, R, 'Hanoi'); setDates(d, b, '2030-11-27', '2030-12-15');
    const r = computeRoute(d);
    expect(r.stops.length).toBe(2); expect(r.legs.length).toBe(1);
    expect([r.legs[0].from.name, r.legs[0].to.name]).toEqual(['Bangkok', 'Hanoi']); expect(r.legs[0].dashed).toBe(false);
  });
  test('overlapping maybes become alternatives in one stop', () => {
    const { d, R } = trip();
    const a = addChild(d, R, 'Hanoi'); setDates(d, a, '2030-12-08', '2030-12-22');
    const b = addChild(d, R, 'Sydney'); setDates(d, b, '2030-12-22', '2031-01-10'); d.nodes[b].maybe = true;
    const c = addChild(d, R, 'Bali'); setDates(d, c, '2030-12-23', '2031-01-08'); d.nodes[c].maybe = true;
    const r = computeRoute(d);
    expect(r.stops.length).toBe(2); expect(r.stops[1].places.length).toBe(2);
    expect(r.legs.length).toBe(2); expect(r.legs.every(l => l.dashed)).toBe(true);
  });
  test('undated point without fixed is ignored; fixed booking counts', () => {
    const { d, R } = trip();
    const a = addChild(d, R, 'Bangkok'); setDates(d, a, '2030-11-01', null);
    expect(computeRoute(d).stops.length).toBe(0);
    d.nodes[a].fixed = true; expect(computeRoute(d).stops.length).toBe(1);
  });
  test('end before start and unknown places are ignored without throwing', () => {
    const { d, R } = trip();
    const a = addChild(d, R, 'Bangkok'); d.nodes[a].start = '2030-12-10'; d.nodes[a].end = '2030-12-01';
    const b = addChild(d, R, 'Somewhere odd'); setDates(d, b, '2030-12-01', '2030-12-05');
    const c = addChild(d, R, 'Lima'); d.nodes[c].start = 'garbage'; d.nodes[c].end = '2030-12-09';
    expect(() => computeRoute(d)).not.toThrow(); expect(computeRoute(d).stops.length).toBe(0);
  });
});
