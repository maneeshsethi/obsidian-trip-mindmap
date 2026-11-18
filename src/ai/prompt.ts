// Prompt construction for the Ask AI panel (ported from reference agOutline/agRules).
import type { MapDoc } from '../model/schema';
import { placeOf } from '../trip/route';

export type Turn = { role: 'user' | 'assistant'; content: string };
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export function outline(d: MapDoc): string {
  const trip = d.kind === 'trip'; const lines: string[] = [];
  const w = (id: string, depth: number) => {
    const n = d.nodes[id]; const f: string[] = [];
    if (trip) {
      if (n.start) f.push(n.end ? `${n.start}→${n.end}` : n.start);
      if (n.maybe) f.push('maybe'); if (n.fixed) f.push('fixed booking');
    }
    if (n.color) f.push('colour ' + n.color);
    if (trip) {
      if (n.next) f.push('NEXT STOP of parent');
      const pl = id === d.rootId ? null : placeOf(d, id); if (pl) f.push('place: ' + pl.name);
    }
    let l = `${'  '.repeat(depth)}- [${id}] ${n.text || 'Untitled'}${f.length ? ' (' + f.join('; ') + ')' : ''}`;
    if (n.notes) l += ` notes: "${n.notes.replace(/\s+/g, ' ').slice(0, 240)}"`;
    lines.push(l); n.children.forEach(c => w(c, depth + 1));
  };
  w(d.rootId, 0); return lines.join('\n');
}

const COLOURS = 'red, orange, yellow, green, teal, blue, purple, pink';

function tripRules(d: MapDoc, today: string) {
  return `You are the planning assistant inside a travel mind-map app. Today is ${today}.
How the map works: one root idea; every idea can have sub-ideas. A sub-idea marked "NEXT STOP of parent" continues the journey (drawn as an arrow; each idea has at most one). Other sub-ideas are things inside that stop (activities, tasks, options). Dates are ISO (YYYY-MM-DD); an idea with start and end is a stay or activity, a single date with "fixed booking" is a booked flight or reservation. "maybe" marks a tentative option. Places come from names (city or airport code) or a "place" field and drive a route map.

Current map "${d.title || 'Untitled'}" (ids in brackets):
${outline(d)}

When the person asks for ideas or changes, propose edits as operations. If they only ask a question, return an empty ops list.
- Keep existing ids. Give each added idea a "ref" like "new1" so later operations can use it as a parent.
- New suggestions the person hasn't decided on should be "maybe": true. Put practical detail (why, rough cost, how to get there, timing) in "notes", briefly.
- Never delete or rename existing ideas unless asked. Use real places and realistic dates that fit the existing plan.
Operation shapes:
{"op":"add","ref":"new1","parent":"<id or ref>","text":"short name","start":"YYYY-MM-DD","end":"YYYY-MM-DD","maybe":true,"fixed":false,"notes":"...","place":"City","next":false}
{"op":"update","id":"<id>", any of "text","start","end","maybe","fixed","notes","place","color" (null clears a field)}
{"op":"move","id":"<id>","parent":"<id or ref>","next":false}
{"op":"delete","id":"<id>"}
"color" is one of ${COLOURS}; sub-ideas inherit it. Only set colours when asked.
Only "op" and the ids/text are required; leave out fields you don't set.
Reply with only JSON: {"reply":"a short, plain answer (under 120 words) that says what you changed and why","ops":[...]}`;
}

function generalRules(d: MapDoc, today: string) {
  return `You are the assistant inside a mind-map app. Today is ${today}.
How the map works: one root idea; every idea can have sub-ideas, nested to any depth. Ideas can carry short notes and a colour that their sub-ideas inherit.

Current map "${d.title || 'Untitled'}" (ids in brackets):
${outline(d)}

When the person asks for ideas or changes, propose edits as operations. If they only ask a question, return an empty ops list.
- Keep existing ids. Give each added idea a "ref" like "new1" so later operations can use it as a parent.
- Keep idea names short (a few words); put detail in "notes", briefly.
- Never delete or rename existing ideas unless asked.
Operation shapes:
{"op":"add","ref":"new1","parent":"<id or ref>","text":"short name","notes":"..."}
{"op":"update","id":"<id>", any of "text","notes","color" (null clears a field)}
{"op":"move","id":"<id>","parent":"<id or ref>"}
{"op":"delete","id":"<id>"}
"color" is one of ${COLOURS}; sub-ideas inherit it. Only set colours when asked.
Only "op" and the ids/text are required; leave out fields you don't set.
Reply with only JSON: {"reply":"a short, plain answer (under 120 words) that says what you changed and why","ops":[...]}`;
}

export function rules(d: MapDoc, today: string): string {
  return d.kind === 'trip' ? tripRules(d, today) : generalRules(d, today);
}

export function buildMessages(d: MapDoc, turns: Turn[], today: string): ChatMessage[] {
  return [{ role: 'system', content: rules(d, today) }, ...turns.slice(-12)];
}
