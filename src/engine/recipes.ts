import { frost } from '../data/planets';
import { cards } from '../data/cards';
import { baseRecipe, isDrawing, recipeFits, type RecipeId } from '../data/recipes';
import type { MachineId } from '../data/machines';
import type { GameState } from './state';

export const furnace = (id: MachineId) =>
  id === 'furnace_iron' || id === 'furnace_copper' || id === 'steel_furnace';
export function unlockedRecipe(s: GameState, id: MachineId, recipe: RecipeId) {
  return recipeFits(id, recipe) && (!isDrawing(recipe) || s.drawings.includes(recipe));
}
export function setRecipe(s: GameState, id: MachineId, recipe: RecipeId): GameState {
  if (!unlockedRecipe(s, id, recipe) || recipe === s.machines[id].recipe) return s;
  return {
    ...s,
    machines: {
      ...s.machines,
      [id]: { ...s.machines[id], recipe, utilization: 0, shortage: null },
    },
  };
}
export function operatingRecipe(s: GameState, id: MachineId) {
  const base = baseRecipe(id, s.machines[id].recipe);
  const load = s.planetId === 'frost' ? frost.loadFactor : 1;
  if (!furnace(id) || !s.cards.includes('arc_furnace'))
    return base.power > 0 && load !== 1 ? { ...base, power: base.power * load } : base;
  const input = { ...base.input };
  delete input.coal;
  return { ...base, input, power: cards.arc_furnace.power * load };
}
