import React, { useState } from 'react';
import { zhCN as t } from '../../i18n/zh-CN';
import { recordBlueprint, applyBlueprint, prepareBlueprint } from '../../engine/blueprints';
export function Blueprints({ s, act }) {
  const [name, setName] = useState(''),
    [skip, setSkip] = useState([]);
  if (!s.meta.recorder) return null;
  return (
    <details className="panel blueprint-panel">
      <summary>
        {t.dusk.book} · {s.meta.blueprints.length}/{s.meta.slots}
      </summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act((v) => recordBlueprint(v, name));
          setName('');
        }}
      >
        <input
          aria-label={t.dusk.name}
          value={name}
          placeholder={t.dusk.name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          disabled={
            !name.trim() ||
            s.meta.blueprints.length >= s.meta.slots ||
            !Object.values(s.machines).some((g) => g.count)
          }
        >
          {t.dusk.record}
        </button>
      </form>
      {s.meta.blueprints.map((bp, i) => (
        <div className="blueprint-row" key={i}>
          <b>{bp.name}</b>
          <small>
            {Object.entries(bp.machines)
              .map(([id, g]) => t.machines[id] + ' ×' + g.count)
              .join(' · ')}
          </small>
          <button
            disabled={!!s.queue.length}
            onClick={() => {
              setSkip(prepareBlueprint(s, bp).skipped);
              act((v) => applyBlueprint(v, i));
            }}
          >
            {t.dusk.apply}
          </button>
          <button
            onClick={() =>
              act((v) => ({
                ...v,
                meta: { ...v.meta, blueprints: v.meta.blueprints.filter((_, idx) => idx !== i) },
              }))
            }
          >
            {t.dusk.remove}
          </button>
        </div>
      ))}
      {skip.length > 0 && (
        <p role="status">
          {t.dusk.skip} · {skip.map((k) => t.machines[k]).join('、')}
        </p>
      )}
      {s.queue.length > 0 && (
        <div className="blueprint-row">
          <b>
            {t.dusk.waiting} · {t.machines[s.queue[0].id]} ×{s.queue[0].count}
          </b>
          <button onClick={() => act((v) => ({ ...v, queue: [] }))}>{t.dusk.cancel}</button>
        </div>
      )}
    </details>
  );
}
