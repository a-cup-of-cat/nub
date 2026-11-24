import React from 'react';
import {
  Boxes,
  Cpu,
  CircuitBoard,
  Layers3,
  Mountain,
  Factory,
  Drill,
  Flame,
  Anvil,
  Pickaxe,
  Cog,
  Microchip,
  Waypoints,
  CassetteTape,
} from 'lucide-react';
import { rateText } from './resourceReadout';
import { items, quantities } from '../../data/items';
import { definition, machineIds } from '../../data/machines';
import { available } from '../../engine/build';
import { zhCN as t } from '../../i18n/zh-CN';
import { balance } from '../../data/balance';
export const fmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format;
export const fmtPrice = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 }).format;
export const time = (n) =>
  [Math.floor(n / balance.minute), Math.floor(n % balance.minute)]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
export const percent = (n) => Math.round(n * 100) + '%';
const shapes = {
  ore: Mountain,
  ingot: Layers3,
  part: Cog,
  electronic: CircuitBoard,
  component: CassetteTape,
};
export function Resource({ id, size = 15 }) {
  const Icon = shapes[items[id].shape] ?? Boxes;
  return <Icon className={'res r-' + id} size={size} aria-hidden />;
}
const glyphs = {
  crusher: Pickaxe,
  belt_assembler: CassetteTape,
  iron_drill: Drill,
  copper_drill: Drill,
  coal_drill: Drill,
  quartz_drill: Drill,
  furnace_iron: Flame,
  furnace_copper: Flame,
  assembler: Anvil,
  wire_drawer: Waypoints,
  wafer_fab: Microchip,
  circuit_fab: CircuitBoard,
  chip_fab: Cpu,
};
export function MachineIcon({ id, size = 18 }) {
  const Icon = glyphs[id] ?? Factory;
  return <Icon size={size} aria-hidden />;
}
export function shown(s) {
  return machineIds.filter(
    (id) =>
      id === 'crusher' ||
      s.machines[id].count ||
      ((s.seen.length > 1 ||
        s.machines.crusher.count ||
        s.stock.stone >= definition('iron_drill').cost.stone) &&
        available(s, id)),
  );
}
export function Amounts({ values, stock, perTime = false }) {
  return (
    <span className="amounts">
      {quantities(values).map(([id, n]) => (
        <span key={id} className={stock && stock[id] + balance.epsilon < n ? 'low' : ''}>
          <Resource id={id} />
          {t.items[id]} <b>{perTime ? rateText(n) : fmt(n)}</b>
        </span>
      ))}
    </span>
  );
}
export function status(s, id) {
  const g = s.machines[id];
  if(s.planetId==='dusk' && g.count>g.paused && !g.shortage){
    if(id==='solar_station' && !g.utilization)return t.dusk.noCharge;
    if(definition(id).power>0 && s.powerFactor<1)return t.dusk.powerOff;
  }
  return !g.count
    ? t.ui.idle
    : g.paused === g.count
      ? t.ui.stopped
      : g.shortage
        ? (g.beltLimited
            ? (g.utilization ? t.belts.capacity : t.belts.disconnected) + ' · '
            : t.ui.short) +
          t.items[g.shortage] +
          ' ' +
          percent(1 - g.utilization)
        : t.ui.full;
}
