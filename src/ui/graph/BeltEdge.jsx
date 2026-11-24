import React from 'react';
import { transport as cfg } from '../../data/transport';
import { zhCN as t } from '../../i18n/zh-CN';
import { rateText } from '../common/resourceReadout';
import { Cargo } from './FactoryArt';

const reducedMotion =
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Canvas pixels of a belt, including the short stubs from each dock cell into its machine edge.
export function beltPoints(cells, stubs = true) {
  const points = cells.map((p) => ({ x: p.x * cfg.cell, y: p.y * cfg.cell }));
  if (!stubs || !points.length) return points;
  const a = points[0],
    z = points.at(-1);
  return [{ x: a.x - cfg.cell, y: a.y }, ...points, { x: z.x + cfg.cell, y: z.y }];
}
export const pathOf = (points) => 'M' + points.map((p) => p.x + ' ' + p.y).join(' L');
function lengthOf(points) {
  let n = 0;
  for (let i = 1; i < points.length; i++)
    n += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
  return n;
}
function pointAt(points, distance) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      step = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (distance <= step && step > 0) {
      const f = distance / step;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    distance -= step;
  }
  return points.at(-1);
}
function Arrows({ points }) {
  return points.map((p, i) => {
    if (!i || i % 2 !== 1) return null;
    const prev = points[i - 1],
      angle = (Math.atan2(p.y - prev.y, p.x - prev.x) * 180) / Math.PI;
    return (
      <path
        key={i}
        className="belt-arrow"
        transform={`translate(${(p.x + prev.x) / 2} ${(p.y + prev.y) / 2}) rotate(${angle})`}
        d="M-4 -4L1 0L-4 4"
      />
    );
  });
}
// Cargo density is proportional to measured flow: at belt capacity one item passes every
// (visualSpeed * 60 / capacity) px. A display aid only; the engine never reads it.
function CargoStream({ points, item, flow }) {
  const length = lengthOf(points);
  if (flow <= 0 || length <= 0) return null;
  const spacing = (cfg.visualSpeed * 60) / flow,
    count = Math.max(1, Math.min(cfg.maxCargo, Math.round(length / spacing))),
    duration = length / cfg.visualSpeed,
    d = pathOf(points);
  return (
    <g className="belt-cargo">
      {Array.from({ length: count }, (_, i) => {
        if (reducedMotion) {
          const p = pointAt(points, ((i + 0.5) * length) / count);
          return <Cargo key={i} item={item} x={p.x - 9} y={p.y - 9} width="18" height="18" />;
        }
        return (
          <g key={i}>
            <Cargo item={item} x="-9" y="-9" width="18" height="18" />
            <animateMotion
              dur={duration.toFixed(2) + 's'}
              begin={(-(i * duration) / count).toFixed(2) + 's'}
              repeatCount="indefinite"
              path={d}
            />
          </g>
        );
      })}
    </g>
  );
}
export function BeltEdge({ data }) {
  const { belt, flow, build, selected, onSelect } = data,
    cells = belt.cells;
  if (!cells?.length) return null;
  const points = beltPoints(cells),
    d = pathOf(points),
    title = t.items[belt.pair.item] + ' · ' + (flow > 0 ? rateText(flow) : t.belts.idle);
  const hit = (
    <path
      className="belt-hit"
      d={d}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
    >
      <title>{title}</title>
    </path>
  );
  if (build)
    return (
      <g className={'schematic-belt ' + (selected ? 'selected' : '')}>
        <path className="belt-line" d={d} />
        <Arrows points={points} />
        {hit}
      </g>
    );
  // Ribs scroll at the same surface speed as the cargo, so the belt reads as one moving surface.
  const ribPeriod = 8;
  return (
    <g className={'physical-belt ' + (flow > 0 ? 'moving' : '')}>
      <path className="belt-shadow" d={d} />
      <path className="belt-rim" d={d} />
      <path className="belt-deck" d={d} />
      <path
        className="belt-ribs"
        d={d}
        style={{ animationDuration: (ribPeriod / cfg.visualSpeed).toFixed(3) + 's' }}
      />
      <path className="belt-shine" d={d} />
      <CargoStream points={points} item={belt.pair.item} flow={flow} />
      {hit}
    </g>
  );
}
