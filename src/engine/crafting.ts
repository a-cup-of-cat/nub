import { recipes, type CraftId } from '../data/crafting';
import { balance } from '../data/balance';
import { quantities } from '../data/items';
import type { GameState } from './state';

export function craftableBatches(s: GameState, id: CraftId) {
  return Math.min(
    ...quantities(recipes[id].input).map(([item, n]) =>
      Math.floor((s.stock[item] + balance.epsilon) / n),
    ),
  );
}

export function craft(s: GameState, id: CraftId, batches = 1): GameState {
  if (!Number.isSafeInteger(batches) || batches < 1 || batches > craftableBatches(s, id)) return s;
  const recipe = recipes[id],
    stock = { ...s.stock };
  for (const [item, n] of quantities(recipe.input))
    stock[item] = Math.max(0, stock[item] - n * batches);
  stock[id] += recipe.yield * batches;
  return { ...s, stock, seen: s.seen.includes(id) ? s.seen : [...s.seen, id] };
}
