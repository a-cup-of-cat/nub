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
export const pairs = machineIds.flatMap((target) =>
  quantities(definition(target).input).map(([item]) => {
    const source = machineIds.find((id) => item in definition(id).output)!;
    return { source, target, item, key: source + '>' + target + ':' + item };
  }),
);
export type Pair = (typeof pairs)[number];
function defaultLayout() {
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
      return [id, { x: col * cfg.columnSpacing, y: row * cfg.rowSpacing }];
    }),
  ) as Record<MachineId, Point>;
}
export const defaultPositions = defaultLayout();
export function layoutFor(s: GameState) {
  return Object.fromEntries(
    machineIds.map((id) => [id, snap(s.ui.nodePositions[id] ?? defaultPositions[id])]),
  ) as Record<MachineId, Point>;
}
export function docks(pos: Record<MachineId, Point>, pair: Pair) {
  const a = pos[pair.source],
    z = pos[pair.target];
  return {
    start: toCell({ x: a.x + cfg.machineWidth + cfg.cell, y: a.y + cfg.machineHeight / 2 }),
    end: toCell({ x: z.x - cfg.cell, y: z.y + cfg.machineHeight / 2 }),
  };
}
function obstacles(pos: Record<MachineId, Point>, installed: MachineId[]) {
  const result = new Set<string>();
  for (const id of installed) {
    const p = toCell(pos[id]);
    for (let dx = 0; dx <= cfg.machineWidth / cfg.cell; dx++)
      for (let dy = 0; dy <= cfg.machineHeight / cfg.cell; dy++)
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
function walk(start: Point, end: Point, blocked: Set<string>): Point[] | null {
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
        visited.has(key)
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
export function setBelts(s: GameState, pair: Pair, lanes: Point[][]): GameState {
  if (
    !s.machines[pair.source].count ||
    !s.machines[pair.target].count ||
    !validOverrides({ [pair.key]: lanes })
  )
    return s;
  const { positions, blocked } = network(s);
  if (
    lanes.some(
      (via) =>
        !(s.belts[pair.key] ?? []).includes(via) && !routeCells(positions, pair, via, blocked),
    )
  )
    return s;
  return {
    ...s,
    belts: { ...s.belts, [pair.key]: lanes.map((via) => via.map((p) => ({ ...p }))) },
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
function makeNetwork(s: GameState) {
  const positions = layoutFor(s),
    blocked = obstacles(
      positions,
      machineIds.filter((id) => s.machines[id].count > 0),
    );
  const active = pairs.filter((p) => s.machines[p.source].count && s.machines[p.target].count);
  const belts: Belt[] = active.flatMap((pair) =>
    (s.belts[pair.key] ?? [[]]).map((via, index) => {
      const cells = routeCells(positions, pair, via, blocked);
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
  return { active, belts, positions, blocked };
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
    Object.entries(requests).map(([k, v]) => [k, { ...v }]),
  );
  for (const p of pairs) {
    if (allowed[p.item]?.[p.target] !== undefined) allowed[p.item]![p.target] = 0;
  }
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
