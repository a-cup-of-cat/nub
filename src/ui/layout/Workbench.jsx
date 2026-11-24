import React, { useState } from 'react';
import { craftIds, recipes } from '../../data/crafting';
import { balance } from '../../data/balance';
import { craft, craftableBatches } from '../../engine/crafting';
import { quantities } from '../../data/items';
import { zhCN as t } from '../../i18n/zh-CN';
import { Resource, Amounts, fmt } from '../common/display';

export function Workbench({ s, act, onClose }) {
  const [batch, setBatch] = useState(1);
  const [message, setMessage] = useState('');
  return (
    <section id="workbench" className="panel workbench" aria-label={t.workbench.title}>
      <header className="panel-heading">
        <h2>{t.workbench.title}</h2>
        <div className="batch">
          {t.workbench.scale}
          {[1, balance.largeBatch].map((n) => (
            <button
              key={n}
              aria-pressed={batch === n}
              className={n === batch ? 'selected' : ''}
              onClick={() => setBatch(n)}
            >
              ×{n}
            </button>
          ))}
        </div>
        <button className="inventory-toggle" onClick={onClose}>
          {t.ui.close}
        </button>
      </header>
      <div className="craft-grid">
        {craftIds.map((id) => {
          const recipe = recipes[id];
          const inputs = quantities(recipe.input).map(([item, n]) => [item, n * batch]);
          const missing = inputs.filter(([item, n]) => s.stock[item] + balance.epsilon < n);
          const output = recipe.yield * batch;
          return (
            <article key={id} className="craft-card">
              <h3>
                <Resource id={id} />
                {t.items[id]} <code>×{output}</code>
              </h3>
              <div>
                {t.workbench.materials}{' '}
                <Amounts values={Object.fromEntries(inputs)} stock={s.stock} />
              </div>
              <button
                disabled={craftableBatches(s, id) < batch}
                aria-label={t.workbench.craft + t.items[id]}
                onClick={() => {
                  act((v) => craft(v, id, batch));
                  setMessage(t.workbench.made + ' ' + t.items[id] + ' ×' + output);
                }}
              >
                {t.workbench.craft}
              </button>
              {missing.length > 0 && (
                <small className="low">
                  {t.workbench.missing}{' '}
                  {missing
                    .map(
                      ([item, n]) =>
                        t.items[item] + ' ×' + fmt(Math.ceil(n - s.stock[item] - balance.epsilon)),
                    )
                    .join('、')}
                </small>
              )}
            </article>
          );
        })}
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
