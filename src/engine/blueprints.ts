import { dusk } from '../data/planets';
import { machineIds, definition } from '../data/machines';
import { build, canBuild } from './build';
import { setRecipe, unlockedRecipe } from './recipes';
import type { GameState, Blueprint, QueueEntry } from './state';
export function recordBlueprint(s: GameState, name: string): GameState {
  if (!s.meta.recorder || s.meta.blueprints.length >= s.meta.slots || !name.trim()) return s;
  const machines: Blueprint['machines'] = {};
  for (const id of machineIds) {
    const { count, recipe } = s.machines[id];
    if (count) machines[id] = { count, recipe };
  }
  if (!Object.keys(machines).length) return s;
  const bp = { name: name.trim(), machines, splits: structuredClone(s.splits) };
  return { ...s, meta: { ...s.meta, blueprints: [...s.meta.blueprints, bp] } };
}
export function prepareBlueprint(s: GameState, bp: Blueprint) {
  const queue: QueueEntry[] = [],
    skipped = [];
  for (const id of machineIds) {
    const entry = bp.machines[id];
    if (!entry) continue;
    if ((definition(id).dusk && s.planetId !== 'dusk') || !unlockedRecipe(s, id, entry.recipe)) {
      skipped.push(id);
      continue;
    }
    const room =
      id === 'coal_drill' && s.planetId === 'dusk'
        ? Math.max(0, dusk.coalLimit - s.machines[id].count)
        : entry.count;
    const count = Math.min(entry.count, room);
    if (count < entry.count) skipped.push(id);
    if (count) queue.push({ id, ...entry, count });
  }
  return { queue, skipped };
}
export function applyBlueprint(s: GameState, index: number): GameState {
  const bp = s.meta.blueprints[index];
  if (!bp || s.queue.length) return s;
  const splits = { ...s.splits };
  for (const [key, split] of Object.entries(bp.splits)) {
    const item = key as keyof typeof splits;
    if (split && (split.mode !== 'priority' || s.valves.includes(item)))
      splits[item] = structuredClone(split);
  }
  return { ...s, queue: prepareBlueprint(s, bp).queue, splits };
}
export function advanceQueue(s: GameState): GameState {
  const entry = s.queue[0];
  if (!entry || !canBuild(s, entry.id)) return s;
  const next = setRecipe(build(s, entry.id), entry.id, entry.recipe);
  return {
    ...next,
    queue:
      entry.count === 1
        ? s.queue.slice(1)
        : [{ ...entry, count: entry.count - 1 }, ...s.queue.slice(1)],
  };
}
