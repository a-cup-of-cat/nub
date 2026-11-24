import React from 'react';
import { ArrowUp } from 'lucide-react';
import { operatingRecipe } from '../../engine/recipes';
import { machineIds } from '../../data/machines';
import { zhCN as t } from '../../i18n/zh-CN';
export function ValveControls({ s, act }) {
  return s.valves
    .filter((item) => s.splits[item]?.mode === 'priority')
    .map((item) => {
      const consumers = machineIds.filter(
        (id) => s.machines[id].count && item in operatingRecipe(s, id).input,
      );
      const saved = s.splits[item]?.order ?? [];
      const order = [...new Set([...saved.filter((id) => consumers.includes(id)), ...consumers])];
      function promote(index) {
        const next = [...order];
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
        act((v) => ({ ...v, splits: { ...v.splits, [item]: { mode: 'priority', order: next } } }));
      }
      return (
        <section className="panel" key={item}>
          <div className="panel-heading">
            <h2>
              {t.items[item]} · {t.ui.priority}
            </h2>
          </div>
          {order.length ? (
            order.map((id, i) => (
              <div key={id} className="product">
                <label>
                  {i + 1}. {t.machines[id]}
                </label>
                <button
                  aria-label={t.ui.next + t.machines[id]}
                  disabled={!i}
                  onClick={() => promote(i)}
                >
                  <ArrowUp size={14} />
                  {t.ui.next}
                </button>
              </div>
            ))
          ) : (
            <p>{t.ui.empty}</p>
          )}
        </section>
      );
    });
}
