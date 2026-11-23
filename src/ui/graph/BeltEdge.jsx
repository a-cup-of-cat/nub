import React from 'react';
import { EdgeLabelRenderer } from '@xyflow/react';
import { transport as cfg } from '../../data/transport';
import { zhCN as t } from '../../i18n/zh-CN';
import { rateText } from '../common/resourceReadout';
export function BeltEdge({ data }) {
  const { belt, flow, draft, selected, edit } = data,
    cells = belt.cells;
  if (!cells?.length) return null;
  const points = cells.map((p) => ({ x: p.x * cfg.cell, y: p.y * cfg.cell }));
  const a = points[0],
    z = points.at(-1);
  const path = [{ x: a.x - cfg.cell, y: a.y }, ...points, { x: z.x + cfg.cell, y: z.y }];
  const d = 'M' + path.map((p) => p.x + ' ' + p.y).join(' L');
  const middle = points[Math.floor(points.length / 2)];
  return (
    <g
      className={
        'physical-belt ' +
        (draft ? 'draft ' : '') +
        (selected ? 'selected ' : '') +
        (flow > 0 ? 'moving' : '')
      }
    >
      <path className="belt-rim" d={d} />
      <path className="belt-deck" d={d} />
      <path className="belt-ribs" d={d} />
      {points.map((p, i) => {
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
      })}
      {draft &&
        belt.via.map((p, i) => (
          <g
            key={i}
            className="belt-pin"
            transform={`translate(${p.x * cfg.cell} ${p.y * cfg.cell})`}
          >
            <circle r="10" />
            <text y="4" textAnchor="middle">
              {i + 1}
            </text>
          </g>
        ))}
      {!draft && (
        <path
          className="belt-hit"
          d={d}
          onClick={(e) => {
            e.stopPropagation();
            edit();
          }}
        />
      )}
      {(!draft || selected) && (
        <EdgeLabelRenderer>
          <button
            className={'belt-label nodrag nopan ' + (draft ? 'draft-label' : '')}
            style={{ transform: `translate(-50%,-50%) translate(${middle.x}px,${middle.y}px)` }}
            title={draft ? t.belts.preview : t.belts.edit}
            onClick={edit}
            tabIndex={draft ? -1 : 0}
          >
            {draft ? t.belts.preview : t.items[belt.pair.item] + ' · ' + rateText(flow)}
          </button>
        </EdgeLabelRenderer>
      )}
    </g>
  );
}
