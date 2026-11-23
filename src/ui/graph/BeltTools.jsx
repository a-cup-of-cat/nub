import React, { useState } from 'react';
import { Route, Undo2, Trash2, Check, Plus, Focus } from 'lucide-react';
import { transport as cfg } from '../../data/transport';
import { zhCN as t } from '../../i18n/zh-CN';
import { rateText } from '../common/resourceReadout';
export function BeltTools({
  plan,
  pair,
  draft,
  select,
  patch,
  addPoint,
  existing,
  save,
  remove,
  reset,
  focus,
  notice,
  preview,
  s,
}) {
  const [coords, setCoords] = useState({ x: '', y: '' });
  if (!pair) return <p className="belt-tools empty-tools">{t.belts.empty}</p>;
  const options = s.belts[pair.key] ?? [[]],
    isNew = draft.index >= options.length;
  return (
    <section className="belt-tools">
      <p>{t.belts.help}</p>
      <div className="belt-pickers">
        <label>
          {t.belts.route}
          <select
            value={pair.key}
            onChange={(e) =>
              select(
                plan.active.find((p) => p.key === e.target.value),
                0,
              )
            }
          >
            {plan.active.map((p) => (
              <option value={p.key} key={p.key}>
                {t.machines[p.source]} → {t.machines[p.target]} · {t.items[p.item]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.belts.lane}
          <select value={draft.index} onChange={(e) => select(pair, Number(e.target.value))}>
            {options.map((_, i) => (
              <option value={i} key={i}>
                {t.belts.title} {i + 1}
              </option>
            ))}
            {options.length < cfg.maxBeltsPerPair && (
              <option value={options.length}>{t.belts.parallel}</option>
            )}
          </select>
        </label>
        <button onClick={focus} aria-label={t.belts.route + ' · ' + t.ui.fit} title={t.ui.fit}>
          <Focus size={16} />
        </button>
      </div>
      <div className="belt-status">
        <span>
          {t.belts.limit} <b>{rateText(cfg.capacityPerMinute)}</b>
        </span>
        {!isNew && (
          <span>
            {t.belts.flow} <b>{rateText(s.beltFlow[existing?.id] ?? 0)}</b>
          </span>
        )}
        <span>
          {t.belts.via} <b>{draft.via.length}</b>
        </span>
      </div>
      <details>
        <summary>{t.belts.append}</summary>
        <div className="waypoint-input">
          {['x', 'y'].map((k) => (
            <label key={k}>
              {t.belts[k]}
              <input
                type="number"
                step="1"
                min={-cfg.coordinateLimit}
                max={cfg.coordinateLimit}
                value={coords[k]}
                onChange={(e) => setCoords({ ...coords, [k]: e.target.value })}
              />
            </label>
          ))}
          <button
            disabled={coords.x === '' || coords.y === ''}
            onClick={() => addPoint({ x: Number(coords.x), y: Number(coords.y) })}
          >
            <Plus size={14} />
            {t.belts.append}
          </button>
        </div>
      </details>
      {draft.via.length > 0 && (
        <div className="route-points">
          {draft.via.map((p, i) => (
            <button
              key={i}
              aria-label={t.belts.removePoint + ' ' + (i + 1)}
              onClick={() => patch(draft.via.filter((_, k) => k !== i))}
            >
              {p.x}, {p.y} ×
            </button>
          ))}
        </div>
      )}
      <div className="belt-actions">
        <button className="primary" disabled={!preview} onClick={save}>
          <Check size={15} />
          {t.belts.apply}
        </button>
        <button disabled={!draft.via.length} onClick={() => patch(draft.via.slice(0, -1))}>
          <Undo2 size={15} />
          {t.belts.undo}
        </button>
        <button disabled={isNew} onClick={remove}>
          <Trash2 size={15} />
          {t.belts.remove}
        </button>
        {Object.hasOwn(s.belts, pair.key) && <button onClick={reset}>{t.belts.auto}</button>}
      </div>
      <p role="status" className={!preview ? 'low' : ''}>
        {!preview ? t.belts.blocked : notice || t.belts.parallelHint}
      </p>
    </section>
  );
}
