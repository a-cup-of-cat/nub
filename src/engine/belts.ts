import { variants } from '../data/recipes';
import { balance } from '../data/balance';
import {craft} from './crafting';
import { transport as cfg } from '../data/transport';
import { definition, machineIds, type MachineId } from '../data/machines';
import { quantities, type ItemId } from '../data/items';
import type { GameState } from './state';

export type Point = { x: number; y: number };
export type BeltOverrides = Record<string, Point[][]>;
export type Requests = Partial<Record<ItemId, Partial<Record<MachineId, number>>>>;
export const cellKey = (p: Point) => p.x + ',' + p.y;
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
export const snap = (p: Point): Point => ({
  x: Math.round(p.x / cfg.cell) * cfg.cell,
  y: Math.round(p.y / cfg.cell) * cfg.cell,
});
export const toCell = (p: Point): Point => ({
  x: Math.round(p.x / cfg.cell),
  y: Math.round(p.y / cfg.cell),
});
// The graph includes all possible inputs and outputs so installed routes survive recipe changes.
export function sockets(id: MachineId) {
  const d = definition(id);
  if (id === 'circuit_fab') return { ...d, input: { ...d.input, plastic:variants.plastic_circuit.input.plastic } };
  if (id === 'space_assembly') {
    return { ...d, input: { ...d.input, ...variants.probe.input }, output: { ...d.output, ...variants.probe.output } };
  }
  if (id === 'precision_shop') {
    return { ...d, input: { ...d.input, ...variants.servo.input, ...variants.cnc.input }, output: { ...d.output, ...variants.servo.output, ...variants.cnc.output } };
  }
  return d;
}
// SPEC-GAP: Fluids use the same typed sockets and player-laid routes as solid cargo.
export const pairs = machineIds.flatMap((target) =>
  quantities(sockets(target).input).map(([item]) => {
    const source = machineIds.find((id) => item in sockets(id).output)!;
    return { source, target, item, key: source + '>' + target + ':' + item };
  }),
);
export type Pair = (typeof pairs)[number];
function defaultLayout(colStep:number,rowStep:number) {
  const depth = new Map<MachineId, number>(),
    rows = new Map<number, number>();
  function level(id: MachineId): number {
    const found = depth.get(id);
    if (found !== undefined) return found;
    const parents = pairs.filter((p) => p.target === id);
    const n = parents.length ? 1 + Math.max(...parents.map((p) => level(p.source))) : 0;
    depth.set(id, n);
    return n;
  }
  return Object.fromEntries(
    machineIds.map((id) => {
      const col = level(id),
        row = rows.get(col) ?? 0;
      rows.set(col, row + 1);
      return [id, { x: col * colStep, y: row * rowStep }];
    }),
  ) as Record<MachineId, Point>;
}
export const defaultPositions = defaultLayout(cfg.columnSpacing,cfg.rowSpacing);
export function layoutFor(s: GameState) {
  return Object.fromEntries(
    machineIds.map((id) => [id, snap(s.ui.nodePositions[id] ?? defaultPositions[id])]),
  ) as Record<MachineId, Point>;
}
export function footprint(id:MachineId){const fp=definition(id).fp;
 if(id==='precision_shop')return {...cfg.sizes.large,h:Math.max(cfg.sizes.large.h,Object.keys(sockets(id).input).length+1)};
 return fp>=4?cfg.sizes.large:fp>=2?cfg.sizes.medium:cfg.sizes.small;
}
function physicalPorts(id:MachineId){
 const d = id === 'circuit_fab' ? definition(id) : sockets(id), {w,h}=footprint(id);
 function side(items:ItemId[],output:boolean){return items.map((item,i)=>({item,output,x:output?w:0,y:Math.round((i+1)*h/(items.length+1))}));}
 return [...side(quantities(d.input).map(([k])=>k),false),...side(quantities(d.output).map(([k])=>k),true)];
}
export function ports(id:MachineId,recipe:{input:Partial<Record<ItemId,number>>;output:Partial<Record<ItemId,number>>}=definition(id)){
 const physical=physicalPorts(id);
 if(id==='circuit_fab' && 'plastic' in recipe.input){
   const socket=physical.find(p=>p.item==='part')!;
   physical.push({...socket,item:'plastic'});
 }
 return physical.filter(p=>p.item in (p.output?recipe.output:recipe.input));
}
// The belt cell just outside a port: one cell right of an output, one cell left of an input.
export function portDock(pos: Record<MachineId, Point>, id: MachineId, item: ItemId, output: boolean) {
  const physicalItem=id==='circuit_fab' && item==='plastic'?'part':item;
  const p = physicalPorts(id).find((q) => q.output === output && q.item === physicalItem)!,
    origin = toCell(pos[id]);
  return { x: origin.x + p.x + (output ? 1 : -1), y: origin.y + p.y };
}
export function docks(pos: Record<MachineId, Point>, pair: Pair) {
  return {
    start: portDock(pos, pair.source, pair.item, true),
    end: portDock(pos, pair.target, pair.item, false),
  };
}
function obstacles(pos: Record<MachineId, Point>, installed: MachineId[]) {
  const result = new Set<string>();
  for (const id of installed) {
    const p = toCell(pos[id]);
    for (let dx = 0; dx <= footprint(id).w; dx++)
      for (let dy = 0; dy <= footprint(id).h; dy++)
        result.add(cellKey({ x: p.x + dx, y: p.y + dy }));
  }
  return result;
}
const cardinal = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];
// Breadth-first grid search. `forbidden` lists belt segments that must not be reused (edge-disjoint routing).
function walk(
  start: Point,
  end: Point,
  blocked: Set<string>,
  forbidden: Set<string> = new Set(),
): Point[] | null {
  if (blocked.has(cellKey(start)) || blocked.has(cellKey(end))) return null;
  const left = Math.min(start.x, end.x) - cfg.searchMargin,
    right = Math.max(start.x, end.x) + cfg.searchMargin;
  const top = Math.min(start.y, end.y) - cfg.searchMargin,
    bottom = Math.max(start.y, end.y) + cfg.searchMargin;
  const queue = [start],
    parent = [-1],
    visited = new Set([cellKey(start)]);
  for (let i = 0; i < queue.length && i < cfg.maxSearchCells; i++) {
    const p = queue[i];
    if (same(p, end)) {
      const path: Point[] = [];
      for (let j = i; j >= 0; j = parent[j]) path.push(queue[j]);
      return path.reverse();
    }
    for (const d of cardinal) {
      const q = { x: p.x + d.x, y: p.y + d.y },
        key = cellKey(q);
      if (
        q.x < left ||
        q.x > right ||
        q.y < top ||
        q.y > bottom ||
        blocked.has(key) ||
        visited.has(key) ||
        forbidden.has(segment(p, q))
      )
        continue;
      visited.add(key);
      queue.push(q);
      parent.push(i);
    }
  }
  return null;
}
export function routeCells(
  positions: Record<MachineId, Point>,
  pair: Pair,
  via: Point[],
  blocked: Set<string>,
): Point[] | null {
  const { start, end } = docks(positions, pair);
  if (blocked.has(cellKey(start)) || blocked.has(cellKey(end))) return null;
  const path = [start],
    used = new Set(blocked);
  for (const goal of [...via, end]) {
    const last = path[path.length - 1];
    if (same(last, goal)) continue;
    const part = walk(last, goal, used);
    if (!part) return null;
    for (const p of part.slice(0, -1)) used.add(cellKey(p));
    path.push(...part.slice(1));
  }
  return path;
}
export function validOverrides(raw: unknown): raw is BeltOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  return Object.entries(raw).every(
    ([key, lanes]) =>
      pairs.some((p) => p.key === key) &&
      Array.isArray(lanes) &&
      lanes.length <= cfg.maxBeltsPerPair &&
      lanes.every(
        (via: unknown) =>
          Array.isArray(via) &&
          via.length <= cfg.maxWaypoints &&
          via.every(
            (p: Point) =>
              p &&
              Number.isInteger(p.x) &&
              Number.isInteger(p.y) &&
              Math.abs(p.x) <= cfg.coordinateLimit &&
              Math.abs(p.y) <= cfg.coordinateLimit,
          ),
      ),
  );
}
// Expand exactly the player's straight strokes; a blocked or diagonal stroke never takes a detour.
export function trace(points:Point[],blocked:Set<string>):Point[]|null{
 if(!points.length)return [];
 const result=[points[0]],visited=new Set([cellKey(points[0])]);if(blocked.has(cellKey(points[0])))return null;
 for(const end of points.slice(1)){const a=result[result.length-1],dx=Math.sign(end.x-a.x),dy=Math.sign(end.y-a.y);
 if(dx&&dy)return null;
 const distance=Math.abs(end.x-a.x)+Math.abs(end.y-a.y);
 if(!Number.isSafeInteger(distance)||distance>cfg.coordinateLimit*2)return null;
 for(let i=1;i<=distance;i++){const p={x:a.x+i*dx,y:a.y+i*dy},k=cellKey(p);
 if(blocked.has(k)||visited.has(k))return null;visited.add(k);result.push(p);}
 }return result;
}
export function bends(cells:Point[]){return cells.slice(1,-1).filter((p,i)=>cells[i].x!==cells[i+2].x&&cells[i].y!==cells[i+2].y);}
export function craftBelts(s:GameState,batches=1){return craft(s,'belt',batches);}
export function quoteBelts(s:GameState,pair:Pair,lanes:Point[][]){
 if(!s.machines[pair.source].count||!s.machines[pair.target].count||!validOverrides({[pair.key]:lanes}))return null;
 const before=network(s),next={...s,belts:{...s.belts,[pair.key]:lanes}},after=makeNetwork(next);
 if(after.belts.some(b=>b.pair.key===pair.key&&!b.cells))return null;
 return {next,delta:after.pieces.size-before.pieces.size};
}
export function setBelts(s:GameState,pair:Pair,lanes:Point[][]):GameState{
 const quote = quoteBelts(s, pair, lanes);
 if (!quote || quote.delta > Math.floor(s.stock.belt + balance.epsilon)) return s;
 return {
   ...quote.next,
   stock: { ...s.stock, belt: Math.max(0, s.stock.belt - quote.delta) },
   seen: quote.delta < 0 && !s.seen.includes('belt') ? [...s.seen, 'belt'] : s.seen,
 };
}
export interface Belt {
  id: string;
  pair: Pair;
  index: number;
  via: Point[];
  cells: Point[] | null;
  segments: string[];
}
function segment(a: Point, b: Point) {
  const x = cellKey(a),
    y = cellKey(b);
  return x < y ? x + '/' + y : y + '/' + x;
}
// A site is clear when the machine body avoids laid belts and keeps one free column on each side,
// so its own port docks and those of its neighbours never fall inside a machine.
function clearAt(id: MachineId, p: Point, blocked: Set<string>, tracks: Set<string>) {
  const { w, h } = footprint(id);
  if (![p.x, p.y].every((n) => Number.isSafeInteger(n) && Math.abs(n) <= cfg.coordinateLimit))
    return false;
  for (let dx = -1; dx <= w + 1; dx++)
    for (let dy = 0; dy <= h; dy++) {
      const k = cellKey({ x: p.x + dx, y: p.y + dy });
      if (blocked.has(k) || (dx >= 0 && dx <= w && tracks.has(k))) return false;
    }
  return true;
}
// SPEC-GAP: an unbuilt machine whose planned site is occupied moves to the nearest clear site
// (square rings, deterministic order) instead of becoming unbuildable.
function nearestSite(id: MachineId, p: Point, blocked: Set<string>, tracks: Set<string>) {
  for (let r = 0; r <= cfg.siteSearch; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const q = { x: p.x + dx, y: p.y + dy };
        if (clearAt(id, q, blocked, tracks)) return q;
      }
  return null;
}
function makeNetwork(s: GameState) {
  const positions = layoutFor(s),
    blocked = obstacles(
      positions,
      machineIds.filter((id) => s.machines[id].count > 0),
    );
  const active = pairs.filter((p) => s.machines[p.source].count && s.machines[p.target].count);
  const belts: Belt[] = active.flatMap((pair) =>
    (s.belts[pair.key] ?? []).map((via, index) => {
      const {start,end}=docks(positions,pair);
      const cells=trace([start,...via,end],blocked);
      return {
        id: pair.key + '#' + index,
        pair,
        index,
        via,
        cells,
        segments: cells?.slice(1).map((v, i) => segment(cells[i], v)) ?? [],
      };
    }),
  );
  const pieces=new Set<string>();const trackCells=new Set<string>();
 for(const b of belts){if(!b.cells)continue;for(const p of b.cells)trackCells.add(cellKey(p));
 for(const k of b.segments)pieces.add(k);
 const first=b.cells[0],last=b.cells[b.cells.length-1];
 pieces.add(segment({x:first.x-1,y:first.y},first));pieces.add(segment(last,{x:last.x+1,y:last.y}));
 }
  // Built machines never move. Unbuilt ones resolve to a clear site; `sited` is false if none is near.
  const sited: Partial<Record<MachineId, boolean>> = {};
  for (const id of machineIds) {
    if (s.machines[id].count) continue;
    const site = nearestSite(id, toCell(positions[id]), blocked, trackCells);
    sited[id] = !!site;
    if (site) positions[id] = { x: site.x * cfg.cell, y: site.y * cfg.cell };
  }
  return { active, belts, positions, blocked, pieces, trackCells, sited };
}
// Reuse tile searches across ticks. Changes to positions, enabled machines or belts invalidate the plan.
const cache = new WeakMap<
  GameState['ui']['nodePositions'],
  { mask: string; overrides: BeltOverrides; plan: ReturnType<typeof makeNetwork> }
>();
export function network(s: GameState) {
  const geometry = s.ui.nodePositions,
    mask = machineIds.map((id) => (s.machines[id].count ? '1' : '0')).join('');
  const hit = cache.get(geometry);
  if (hit?.mask === mask && hit.overrides === s.belts) return hit.plan;
  const plan = makeNetwork(s);
  cache.set(geometry, { mask, overrides: s.belts, plan });
  return plan;
}
export function carry(s: GameState, requests: Requests, minutes: number) {
  const { belts } = network(s),
    perLane: Record<string, number> = {},
    load = new Map<string, number>(),
    counts: Record<string, number> = {};
  const allowed: Requests = Object.fromEntries(
    Object.entries(requests).map(([k, v]) => [k, Object.fromEntries(Object.keys(v).map(target=>[target,0]))]),
  );
  for (const belt of belts)
    if (belt.cells) counts[belt.pair.key] = (counts[belt.pair.key] ?? 0) + 1;
  for (const belt of belts) {
    if (!belt.cells) continue;
    const p = belt.pair,
      wanted = (requests[p.item]?.[p.target] ?? 0) / counts[p.key];
    const offer = Math.min(wanted, cfg.capacityPerMinute * minutes);
    perLane[belt.id] = offer;
    for (const k of belt.segments) load.set(k, (load.get(k) ?? 0) + offer);
  }
  for (const belt of belts) {
    const p = belt.pair;
    if (!perLane[belt.id]) continue;
    let share = 1;
    for (const k of belt.segments)
      share = Math.min(share, (cfg.capacityPerMinute * minutes) / load.get(k)!);
    perLane[belt.id] *= share;
    allowed[p.item]![p.target]! += perLane[belt.id];
  }
  return { allowed, perLane, belts };
}

// `position` is in canvas pixels, like ui.nodePositions.
export function siteClear(s: GameState, id: MachineId, position: Point) {
  const net = network(s);
  return clearAt(id, toCell(position), net.blocked, net.trackCells);
}
// Only unbuilt machines can be planned; a built machine stays put until it is demolished.
export function planSite(s: GameState, id: MachineId, p: Point): GameState {
  if (s.machines[id].count || !siteClear(s, id, p)) return s;
  return { ...s, ui: { ...s.ui, nodePositions: { ...s.ui.nodePositions, [id]: snap(p) } } };
}
// Shortest lane that shares no segment with any laid belt (crossings allowed). Players draw their own
// strokes; this serves the pacing bot, tests and save migration.
export function autoLane(s: GameState, pair: Pair): Point[] | null {
  const plan = network(s);
  if (!plan.active.some((p) => p.key === pair.key)) return null;
  const { start, end } = docks(plan.positions, pair),
    used = new Set(plan.belts.flatMap((b) => b.segments));
  const path = walk(start, end, plan.blocked, used);
  return path ? bends(path) : null;
}
export function autoLay(s: GameState, pair: Pair): GameState {
  const via = autoLane(s, pair);
  return via ? setBelts(s, pair, [...(s.belts[pair.key] ?? []), via]) : s;
}
export function migrateInstalledBelts(s:GameState):GameState{
 const oldPos=defaultLayout(cfg.legacyColumnSpacing,cfg.legacyRowSpacing);
 const positions={...s.ui.nodePositions};for(const id of machineIds)if(s.machines[id].count&&!positions[id])positions[id]=oldPos[id];
 const next:GameState={...s,ui:{...s.ui,nodePositions:positions},belts:{},beltFlow:{}};
 const plan=network(next);
 for(const pair of plan.active){next.belts[pair.key]=(s.belts[pair.key]??[[]]).flatMap(via=>{
 const path=routeCells(plan.positions,pair,via,plan.blocked)??routeCells(plan.positions,pair,[],plan.blocked);
 return path?[bends(path)]:[];});}
 return {...next,belts:{...next.belts}};
}
