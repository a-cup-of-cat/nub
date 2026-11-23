import React from 'react';
import { AudioLines, Radio, ArrowUpRight } from 'lucide-react';
import { zhCN as t } from '../../i18n/zh-CN';
import { balance as b } from '../../data/balance';
import { grit } from '../../data/planets';
import { quantities } from '../../data/items';
import { definition } from '../../data/machines';
import { rateText } from '../common/resourceReadout';
import { fmt, time } from '../common/display';
export function lesson(s) {
  if (quantities(grit.goal).every(([id, n]) => (s.goalDelivered[id] ?? 0) >= n))
    return t.tutorial.length;
  if (s.mined < definition('crusher').cost.stone && !s.machines.crusher.built) return 0;
  if (!s.machines.crusher.built && s.seen.length === 1) return 1;
  if (!s.seen.includes('iron_ingot')) return 2;
  if (!s.goalDelivered.part) return 3;
  return 4;
}
export function Echo({ s, flows, focus }) {
  const step = lesson(s),
    fixed = step === t.tutorial.length,
    hints = flows.shortages.slice(0, fixed ? b.hintCount : 1);
  // SPEC-GAP: 开场三段随首次采集与首台碎石机推进，五步教学按产线成果推进。
  const opening = s.machines.crusher.built
    ? t.echo.opening[2]
    : s.mined
      ? t.echo.opening[1]
      : t.echo.opening[0];
  return (
    <>
      <section className="panel echo">
        <div className="panel-heading">
          <Radio size={18} />
          <h2>{t.echo.name}</h2>
          <span className={'signal ' + (fixed ? 'live' : '')}>
            {fixed ? t.echo.online : t.echo.weak}
          </span>
        </div>
        <div className="echo-screen">
          <div className="echo-device">
            <AudioLines size={30} />
          </div>
          <svg className="wave" viewBox="0 0 160 40" aria-hidden>
            <path d="M0 21h15l3-3 3 5 4-2h8l3-7 3 12 4-5h7l3-4 3 8 4-17 4 26 4-19 4 6h10l3-3 3 5 5-2h7l3-7 3 12 4-7 5 2h12l4-4 3 7 4-3h12" />
          </svg>
        </div>
        <blockquote key={fixed ? t.echo.fixed : opening}>
          {fixed ? t.echo.fixed : opening}
        </blockquote>
        {hints.map((h) => (
          <div className="hint" key={h.item}>
            <small>{t.echo.hints}</small>
            <p>
              {fixed ? t.items[h.item] : t.items[h.item].replace(/.$/, '▯')} ·{' '}
              {h.extra ? t.echo.need + ' ' + h.extra + ' ' + t.ui.unit : t.echo.tight}
            </p>
            <button onClick={() => focus(h.producer)}>
              {t.echo.jump}
              {t.machines[h.producer]} <ArrowUpRight size={14} />
            </button>
          </div>
        ))}
        {fixed && (
          <details>
            <summary>{t.echo.analysis}</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      t.ui.resource,
                      t.ui.production,
                      t.ui.consumption,
                      t.ui.net,
                      t.ui.measured,
                      t.ui.status,
                    ].map((x) => (
                      <th key={x}>{x}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.seen.map((id) => {
                    const a = flows.supply[id] ?? 0,
                      c = flows.demand[id] ?? 0;
                    return (
                      <tr key={id}>
                        <td>{t.items[id]}</td>
                        <td>{rateText(a)}</td>
                        <td>{rateText(c)}</td>
                        <td>{rateText(a - c)}</td>
                        <td>{rateText(s.net[id] ?? 0)}</td>
                        <td>
                          {a < c
                            ? t.ui.short
                            : a < c * b.bottleneckThreshold
                              ? t.echo.tight
                              : t.ui.full}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>
      <section className="panel guide">
        <div className="panel-heading">
          <h2>{t.ui.doc}</h2>
          <code>
            {Math.min(step + 1, t.tutorial.length)} / {t.tutorial.length}
          </code>
        </div>
        <ol>
          {t.tutorial.map(([name, body], i) => (
            <li className={i < step ? 'complete' : i === step ? 'current' : ''} key={name}>
              <span className="step-dot">{i < step ? '✓' : String(i + 1).padStart(2, '0')}</span>
              <div>
                <b>{name}</b>
                {i === step && <p>{body}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>
      {s.messages.length > 0 && (
        <section className="panel">
          <h2>{t.echo.logs}</h2>
          <ul className="logs">
            {s.messages
              .slice()
              .reverse()
              .map((m, i) => (
                <li key={i}>
                  <code>{time(m.time)}</code> {t.echo[m.key]}{' '}
                  {m.amount === undefined ? '' : fmt(m.amount)}
                </li>
              ))}
          </ul>
        </section>
      )}
    </>
  );
}
