import { dusk } from '../data/planets';
import { cards } from '../data/cards';
import { balance } from '../data/balance';
import { shop } from '../data/shop';
import { machineIds, type MachineId } from '../data/machines';
import { furnace, operatingRecipe } from './recipes';
import type { GameState } from './state';

const cycle = dusk.day + dusk.night;
export const daylight = (seconds: number) => seconds % cycle < dusk.day;
export const untilChange = (seconds: number) =>
  (daylight(seconds) ? dusk.day : cycle) - (seconds % cycle);
const sunTime = (seconds: number) =>
  Math.floor(seconds / cycle) * dusk.day + Math.min(seconds % cycle, dusk.day);
export function settlePower(
  s: GameState,
  next: GameState,
  dt: number,
  generation: Partial<Record<MachineId, number>>,
) {
  if (s.planetId !== 'dusk') return;
  const sun = (sunTime(s.timeSec + dt) - sunTime(s.timeSec)) / dt;
  let supply = (shop.emergency_battery.power * Math.min(s.batterySeconds, dt)) / dt,
    demand = 0;
  for (const id of machineIds) {
    const group = next.machines[id],
      active = group.count - group.paused;
    if (!active) continue;
    const rated = operatingRecipe(s, id).power,
      utilization = group.utilization;
    if (rated > 0) demand += rated * active;
    if (rated < 0) {
      const light = id === 'solar_station' ? sun : 1;
      supply += (generation[id] ?? 0) * utilization * light;
      if (id === 'solar_station') next.machines[id] = { ...group, utilization: light };
    }
    if (furnace(id) && s.cards.includes('heat_recovery'))
      supply += cards.heat_recovery.power * active * utilization;
  }
  next.batterySeconds = Math.max(0, s.batterySeconds - dt);
  next.supply = supply;
  next.demand = demand;
  if (s.cards.includes('battery_bank')) {
    const minutes = dt / balance.minute;
    const change = Math.min(
      cards.battery_bank.capacity - s.storedPower,
      Math.max(-s.storedPower, (supply - demand) * minutes),
    );
    next.storedPower = s.storedPower + change;
    if (change < 0) supply -= change / minutes;
  }
  next.powerFactor = demand ? Math.min(1, supply / demand) : 1;
}
