import { transport as cfg } from '../../data/transport';
import { balance as b } from '../../data/balance';
import { autoLay, network } from '../belts';
import { rates } from '../rates';
import type { GameState } from '../state';

// Give every built supply link enough independent lanes for its full demand, as a careful player
// would. Belt pieces are granted for free so production tests stay independent of belt crafting.
export function connectAll(s: GameState): GameState {
  let n: GameState = { ...s, stock: { ...s.stock, belt: Math.max(s.stock.belt, 100000) } };
  for (const pair of network(n).active) {
    const demand = rates(n, pair.target).input[pair.item] ?? 0,
      wanted = Math.max(1, Math.ceil(demand / cfg.capacityPerMinute - b.epsilon));
    while ((n.belts[pair.key] ?? []).length < wanted) {
      const next = autoLay(n, pair);
      if (next === n) throw Error('no belt route for ' + pair.key);
      n = next;
    }
  }
  return n;
}
