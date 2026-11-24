import React from 'react';
import { Plus, Minus, Pause, Play } from 'lucide-react';
import { zhCN as t } from '../../i18n/zh-CN';
import { definition } from '../../data/machines';
import { balance } from '../../data/balance';
import { canBuild, build, demolish, pause, cost, gridFits, sited } from '../../engine/build';
import { choices } from '../../data/recipes';
import { dusk } from '../../data/planets';
import { operatingRecipe, setRecipe, unlockedRecipe } from '../../engine/recipes';
import { MachineIcon, Amounts, percent, status, shown } from '../common/display';
export function Controls({ s, id, act, batch = 1 }) {
  const g = s.machines[id],
    paused = g.count > 0 && g.paused === g.count,
    label = t.machines[id];
  return (
    <div className="machine-actions nodrag nopan">
      <button
        className="build"
        disabled={!canBuild(s, id)}
        onClick={() => act((v) => build(v, id, batch))}
        aria-label={t.ui.build + label}
      >
        <Plus size={15} />
        {s.planetId === 'dusk' && id === 'coal_drill' && g.count >= dusk.coalLimit
          ? t.dusk.coalCap
          : !gridFits(s, id)
            ? t.ui.space
            : !sited(s, id)
              ? t.ui.noSite
              : t.ui.build}
      </button>
      <button
        disabled={!g.count}
        title={t.ui.demolish + label}
        aria-label={t.ui.demolish + label}
        onClick={() => act((v) => demolish(v, id))}
      >
        <Minus size={15} />
      </button>
      <button
        disabled={!g.count}
        title={paused ? t.ui.resume : t.ui.pause}
        aria-label={(paused ? t.ui.resume : t.ui.pause) + label}
        onClick={() => act((v) => pause(v, id, paused ? 0 : v.machines[id].count))}
      >
        {paused ? <Play size={14} /> : <Pause size={14} />}
      </button>
    </div>
  );
}
export function MachineInfo({ s, id, act, batch, focus, pressure }) {
  const d = operatingRecipe(s, id),
    g = s.machines[id],
    fraction = g.count ? g.utilization : 0;
  return (
    <>
      <div className="machine-title">
        <span className="machine-icon">
          <MachineIcon id={id} />
        </span>
        <strong>{t.machines[id]}</strong>
        <code>×{g.count}</code>
      </div>
      {s.planetId === 'dusk' && choices(id).some((r) => unlockedRecipe(s, id, r)) && (
        <select
          className="nodrag nopan"
          aria-label={t.dusk.recipe + ' · ' + t.machines[id]}
          value={g.recipe === 'machine_bed' ? id : g.recipe}
          onChange={(e) => act((v) => setRecipe(v, id, e.target.value))}
        >
          <option value={id}>
            {id === 'precision_shop' ? t.items.machine_bed : t.dusk.normal}
          </option>
          {choices(id)
            .filter((r) => r !== 'machine_bed' && unlockedRecipe(s, id, r))
            .map((r) => (
              <option key={r} value={r}>
                {t.dusk[r] ?? t.items[r]}
              </option>
            ))}
        </select>
      )}
      <div className="recipe">
        {Object.keys(d.input).length ? (
          <>
            <Amounts values={d.input} perTime /> →{' '}
          </>
        ) : null}
        <Amounts values={d.output} perTime />
        {s.planetId === 'dusk' && d.power !== 0 && (
          <small>
            {' '}
            {d.power < 0 ? t.dusk.generation : t.dusk.load} {Math.abs(d.power)}
          </small>
        )}
      </div>
      <div className="meter">
        <i style={{ width: percent(fraction) }} />
      </div>
      <div className="machine-status">
        <span>
          {g.shortage ? (
            <button className="text-btn nodrag" onClick={() => focus?.(g.shortage, id)}>
              {status(s, id)} ↗
            </button>
          ) : (
            status(s, id)
          )}{' '}
          {pressure && g.count > 0 && g.utilization >= 1 - balance.epsilon ? t.ui.upstream : ''}
        </span>
        <code>{percent(fraction)}</code>
      </div>
      <div className="cost">
        <span>{t.ui.cost}</span> <Amounts values={cost(s, id)} stock={s.stock} />
        {Object.keys(cost(s, id)).length === 0 && t.ui.free}
      </div>
      <Controls {...{ s, id, act, batch }} />
    </>
  );
}
export function MachineList({ s, act, batch, setBatch, focus, selected, shortages }) {
  const ids = shown(s);
  return (
    <div className="list-scroll">
      <div className="batch">
        {t.ui.batch}
        {[1, balance.largeBatch, Infinity].map((n) => (
          <button key={n} className={n === batch ? 'selected' : ''} onClick={() => setBatch(n)}>
            {Number.isFinite(n) ? '×' + n : t.ui.max}
          </button>
        ))}
      </div>
      {Object.entries(t.groups).map(([group, name]) => {
        const rows = ids.filter((id) => definition(id).group === group);
        return (
          rows.length > 0 && (
            <section key={group}>
              <h3>{name}</h3>
              {rows.map((id) => (
                <article
                  tabIndex={-1}
                  id={'row-' + id}
                  className={'machine-row ' + (selected === id ? 'highlight' : '')}
                  key={id}
                >
                  <MachineInfo
                    {...{ s, id, act, batch, focus }}
                    pressure={shortages.some((v) => v.producer === id && v.ratio < 1)}
                  />
                </article>
              ))}
            </section>
          )
        );
      })}
    </div>
  );
}
