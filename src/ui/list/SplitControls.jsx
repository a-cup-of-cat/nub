import React from 'react';
import { machineIds } from '../../data/machines';
import { operatingRecipe } from '../../engine/recipes';
import { zhCN as t } from '../../i18n/zh-CN';
export function SplitControls({ s, act }) {
  if (s.planetId !== 'dusk') return null;
  const rows = s.seen
    .map((item) => ({
      item,
      consumers: machineIds.filter(
        (id) => s.machines[id].count && item in operatingRecipe(s, id).input,
      ),
    }))
    .filter((row) => row.consumers.length > 1);
  if (!rows.length) return null;
  function change(item, setting) {
    act((v) => ({ ...v, splits: { ...v.splits, [item]: setting } }));
  }
  return (
    <details className="panel blueprint-panel">
      <summary>{t.dusk.split}</summary>
      {rows.map(({ item, consumers }) => {
        const mode = s.splits[item]?.mode ?? 'default';
        return (
          <div className="split-row" key={item}>
            <label>
              {t.items[item]}{' '}
              <select
                value={mode}
                onChange={(e) => {
                  const mode = e.target.value;
                  change(
                    item,
                    mode === 'priority'
                      ? { mode, order: consumers }
                      : mode === 'manual'
                        ? {
                            mode,
                            shares: Object.fromEntries(
                              consumers.map((k) => [k, 1 / consumers.length]),
                            ),
                          }
                        : { mode },
                  );
                }}
              >
                {['default', 'manual', ...(s.valves.includes(item) ? ['priority'] : [])].map(
                  (m) => (
                    <option key={m} value={m}>
                      {t.dusk[m]}
                    </option>
                  ),
                )}
              </select>
            </label>
            {mode === 'manual' && (
              <form
                key={consumers.join(',')}
                onInput={(e) =>
                  e.currentTarget.elements.namedItem(consumers[0]).setCustomValidity('')
                }
                onSubmit={(e) => {
                  e.preventDefault();
                  const values = new FormData(e.currentTarget);
                  const weights = consumers.map((k) => Number(values.get(k))),
                    sum = weights.reduce((a, b) => a + b, 0);
                  if (!sum) {
                    const field = e.currentTarget.elements.namedItem(consumers[0]);
                    field.setCustomValidity(t.dusk.sumNeeded);
                    field.reportValidity();
                    return;
                  }
                  if (!Number.isFinite(sum) || weights.some((w) => !Number.isFinite(w) || w < 0))
                    return;
                  change(item, {
                    mode,
                    shares: Object.fromEntries(consumers.map((k, i) => [k, weights[i] / sum])),
                  });
                }}
              >
                <small>{t.dusk.shareNote}</small>
                {consumers.map((k) => (
                  <label key={k}>
                    {t.machines[k]}{' '}
                    <input
                      name={k}
                      type="number"
                      min="0"
                      step="any"
                      required
                      defaultValue={Math.round((s.splits[item]?.shares?.[k] ?? 0) * 100)}
                    />{' '}
                    <code>{Math.round((s.splits[item]?.shares?.[k] ?? 0) * 100)}%</code>
                  </label>
                ))}
                <button>{t.ui.saveSplit}</button>
              </form>
            )}
          </div>
        );
      })}
    </details>
  );
}
