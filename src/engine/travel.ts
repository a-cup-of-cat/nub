import { dusk } from '../data/planets';
import { cards } from '../data/cards';
import { drawings } from '../data/recipes';
import { shop } from '../data/shop';
import { newGame, random, type GameState } from './state';
import { install } from './build';

export const carryLimit = (s: GameState) => dusk.carryBase + s.meta.pods * shop.supply_pod.amount;
export function landOnDusk(s: GameState): GameState {
  if (s.planetId !== 'grit' || s.merchant.stage !== 'finished') return s;
  const n = newGame(s.rngSeed);
  n.planetId = 'dusk';
  n.gridCapacity = dusk.grid;
  n.meta = structuredClone(s.meta);
  n.lastSavedAt = s.lastSavedAt;
  n.credits = Math.min(s.credits, carryLimit(s));
  const factor = s.cards.includes('airdrop') ? cards.airdrop.effect : 1;
  n.stock.stone = dusk.landingStone * factor;
  for (let i = 0; i < dusk.landingCrushers * factor; i++) install(n, 'crusher', {});
  if (n.meta.archive) n.drawings.push(drawings[Math.floor(random(n) * drawings.length)]);
  return n;
}
