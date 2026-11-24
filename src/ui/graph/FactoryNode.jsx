import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { ports, footprint } from '../../engine/belts';
import { transport as cfg } from '../../data/transport';
import { zhCN as t } from '../../i18n/zh-CN';
import { operatingRecipe } from '../../engine/recipes';
import { percent, status } from '../common/display';
import { MachineArt, Cargo } from './FactoryArt';

// One node per machine group. Box size follows the footprint (small / medium / large) in grid cells.
// Build mode: a plain frame with clickable material ports. View mode: the cartoon sprite.
export function FactoryNode({ data }) {
  const { s, id, build, border, onPort, onPortHover, stroke, hint } = data;
  const g = s.machines[id],
    { w, h } = footprint(id),
    working = g.count > g.paused && g.utilization > 0;
  const ghost = !g.count;
  return (
    <article
      className={
        'factory-node ' +
        (build ? 'schematic ' : 'illustrated ') +
        (ghost ? 'ghost ' : '') +
        (working ? 'working ' : '') +
        (border ?? '')
      }
      style={{ width: w * cfg.cell, height: h * cfg.cell }}
      aria-label={t.machines[id]}
    >
      <Handle type="target" position={Position.Left} className="hidden-handle" />
      <Handle type="source" position={Position.Right} className="hidden-handle" />
      {!build && <MachineArt id={id} working={working} />}
      <div className="machine-plate">
        <b>{t.machines[id]}</b>
        <span>×{g.count}</span>
        {!build && g.count > 0 && <code>{percent(g.utilization)}</code>}
      </div>
      {!build && g.count > 0 && (
        <div className="node-meter" aria-hidden>
          <i style={{ width: percent(g.utilization) }} />
        </div>
      )}
      {!build && g.shortage && <small className="node-alert">{status(s, id)}</small>}
      {build && (
        <small className="schematic-size">
          {w} × {h}
        </small>
      )}
      {ports(id,operatingRecipe(s,id)).map((p) => {
        const side = p.output ? 'out' : 'in',
          label = (p.output ? t.belts.portOut : t.belts.portIn) + ' · ' + t.items[p.item];
        const port = { id, item: p.item, side };
        // While drawing, ports that could finish the stroke light up.
        const fits =
          stroke && stroke.item === p.item && stroke.side !== side && stroke.id !== id;
        const hinted = hint && hint.item === p.item && hint[side] === id;
        const style = { top: p.y * cfg.cell };
        if (!build)
          return (
            <span key={side + p.item} className={'port-hatch ' + side} style={style} aria-hidden>
              <svg viewBox="0 0 24 24">
                <Cargo item={p.item} width="24" height="24" />
              </svg>
            </span>
          );
        return (
          <React.Fragment key={side + p.item}>
            <button
              type="button"
              className={
                'material-port nodrag nopan ' +
                side +
                (fits ? ' fits' : '') +
                (hinted ? ' hinted' : '') +
                (stroke && stroke.id === id && stroke.item === p.item && stroke.side === side
                  ? ' origin'
                  : '')
              }
              style={style}
              aria-label={t.machines[id] + ' ' + label}
              title={label}
              onClick={(e) => {
                e.stopPropagation();
                onPort(port);
              }}
              onMouseEnter={() => onPortHover(port)}
              onMouseLeave={() => onPortHover(null)}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <Cargo item={p.item} width="24" height="24" />
              </svg>
            </button>
            <small className={'port-label ' + side} style={style}>
              {t.items[p.item]}
            </small>
          </React.Fragment>
        );
      })}
    </article>
  );
}
