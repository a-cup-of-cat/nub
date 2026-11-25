import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  Orbit,
  Radio,
  HardDrive,
  Pickaxe,
  Hammer,
  LayoutGrid,
  Timer,
  Ticket,
  Network as NetworkIcon,
  List,
  ArrowUpRight,
  ChevronDown,
  Check,
  Boxes,
  GitBranch,
  Terminal,
  Factory,
  Target,
  Ship,
} from 'lucide-react';
import { title, zhCN as t } from '../../i18n/zh-CN';
import { useGame } from '../../store/game';
import { balance as b } from '../../data/balance';
import { rawItems, quantities } from '../../data/items';
import { machineIds, definition } from '../../data/machines';
import { cards } from '../../data/cards';
import { usedGrid, mine } from '../../engine/build';
import { pairs, sockets } from '../../engine/belts';
import { analysis } from '../../engine/rates';
import { serialize } from '../../engine/save';
import { trading } from '../../engine/merchant';
import { destination, redsand, frost } from '../../data/planets';
import { landNext, carryLimit } from '../../engine/travel';
import { daylight, untilChange } from '../../engine/power';
import { Blueprints } from './Blueprints';
import { SplitControls } from '../list/SplitControls';
import { Workbench } from './Workbench';
import { Inventory } from './Inventory';
import { fmt, time } from '../common/display';
const Network = lazy(() => import('../graph/Network').then((m) => ({ default: m.Network })));
import { ValveControls } from '../list/ValveControls';
import { MachineList } from '../list/Machines';
import { Echo, lesson } from '../echo/Echo';
import { Trade, Sales } from '../merchant/Trade';
import { Objectives } from './Objectives';
const navItems = [
  ['goal', Target, t.ui.tabGoal],
  ['factory', Factory, t.ui.tabFactory],
  ['echo', Radio, t.ui.tabEcho],
];
export function App() {
  const { game: s, act, notice, offline, importSave } = useGame(),
    [view, setView] = useState('graph'),
    [tab, setTab] = useState('factory'),
    [workbench, setWorkbench] = useState(false),
    [trade, setTrade] = useState(false),
    [backup, setBackup] = useState(false),
    [raw, setRaw] = useState(''),
    [selection, setSelection] = useState('stone'),
    [batch, setBatch] = useState(1),
    [selected, setSelected] = useState(null),
    [focusToken, setFocusToken] = useState(0),
    [requestedLink, setRequestedLink] = useState(null);
  const dusk = s.planetId === 'dusk';
  const chapter = dusk ? t.dusk : t.planets[s.planetId];
  const next = destination[s.planetId];
  const transfer = useRef(null),
    ending = useRef(null),
    stage = s.merchant.stage;
  const flows = analysis(s),
    built = machineIds.reduce((n, id) => n + s.machines[id].count, 0),
    active = machineIds.reduce((n, id) => n + s.machines[id].count - s.machines[id].paused, 0),
    grid = usedGrid(s);
  const currentLesson = lesson(s),
    master = s.cards.includes('pick_master'),
    canTrade = trading(s);
  const focus = (id) => {
    setTab('factory');
    setSelected(id);
    setFocusToken((n) => n + 1);
    if (view === 'list') requestAnimationFrame(() => document.getElementById('row-' + id)?.focus());
  };
  const focusItem = (item, target) => {
    const link = pairs.find((p) => p.item === item && p.target === target);
    if (link && s.machines[target].beltLimited && s.machines[link.source].count) {
      setTab('factory');
      setView('graph');
      setRequestedLink(link.key);
      return;
    }
    const producer = machineIds.find((m) => item in sockets(m).output);
    if (producer) focus(producer);
  };
  useEffect(() => {
    if (stage === 'finished') ending.current?.scrollIntoView({ block: 'nearest' });
  }, [stage]);
  const transferUI = () => {
    setBackup(!backup);
    if (!backup) requestAnimationFrame(() => transfer.current?.focus());
  };
  return (
    <div
      className={
        'app mobile-' +
        tab +
        (' ' + s.planetId + (dusk ? ' ' + (daylight(s.timeSec) ? 'day' : 'night') : ''))
      }
    >
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <Orbit size={28} />
          </span>
          <strong>{title}</strong>
          <i />
          <small>{t.ui.brandSub}</small>
        </div>
        <div className="top-right">
          <span className="online">
            <i />
            {t.ui.operation}
          </span>
          <button onClick={transferUI} aria-expanded={backup}>
            <HardDrive size={16} />
            {t.ui.store}
            <ChevronDown size={13} />
          </button>
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span /> {chapter.sector ?? t.ui.sector} <i>/</i> {t.ui.region}
            </div>
            <h1>{t.planets[s.planetId].name}</h1>
            <p>{t.planets[s.planetId].brief}</p>
            <div className="mine-line">
              {master && (
                <select
                  aria-label={t.ui.selectItem}
                  value={selection}
                  onChange={(e) => setSelection(e.target.value)}
                >
                  {rawItems
                    .filter((k) => s.seen.includes(k))
                    .map((k) => (
                      <option key={k} value={k}>
                        {t.items[k]}
                      </option>
                    ))}
                </select>
              )}
              <button
                className="primary"
                onClick={() => act((v) => mine(v, master ? selection : 'stone'))}
              >
                <Pickaxe size={18} />
                {t.ui.mine}
                <span>+{master ? cards.pick_master.effect : b.mineAmount}</span>
              </button>
              <button
                aria-expanded={workbench}
                aria-controls="workbench"
                onClick={() => setWorkbench(!workbench)}
              >
                <Hammer size={16} /> {t.workbench.title}
              </button>
            </div>
          </div>
          <div className="map-mark">{chapter.map ?? t.ui.map}</div>
        </section>
        {s.planetId !== 'grit' && (
          <section
            className={'power-strip ' + (s.powerFactor < 1 ? 'short' : '')}
            aria-label={t.dusk.power}
          >
            {dusk && (
              <b>
                {daylight(s.timeSec) ? t.dusk.day : t.dusk.night}{' '}
                <code>{time(Math.ceil(untilChange(s.timeSec)))}</code>
              </b>
            )}
            {s.planetId === 'redsand' && (
              <b>
                {t.waterSites} {s.machines.water_pump.count} / {redsand.waterLimit}
              </b>
            )}
            {s.planetId === 'frost' && (
              <b>
                {t.cold} ×{frost.loadFactor}
              </b>
            )}
            <span>
              {t.dusk.supply} <b>{fmt(s.supply)}</b> / {t.dusk.demand} <b>{fmt(s.demand)}</b>
            </span>
            <strong>
              {t.dusk.factor} ×{s.powerFactor.toFixed(2)}
            </strong>
            {s.cards.includes('battery_bank') && (
              <span>
                {t.dusk.charge} {fmt(s.storedPower)}
              </span>
            )}
            <button
              onClick={() => {
                setView('list');
                setTab('factory');
                setSelected('coal_plant');
                requestAnimationFrame(() => document.getElementById('row-coal_plant')?.focus());
              }}
            >
              {t.dusk.jump}
            </button>
          </section>
        )}
        <div className="resources">
          <div className="stat">
            <LayoutGrid />
            <div>
              <small>{t.ui.grid}</small>
              <code>
                {grid}
                <i> / {s.gridCapacity}</i>
              </code>
            </div>
          </div>
          <div className="stat">
            <Ticket />
            <div>
              <small>{t.ui.credits}</small>
              <code>{fmt(s.credits)}</code>
            </div>
          </div>
          <div className="stat">
            <Timer />
            <div>
              <small>{t.ui.clock}</small>
              <code>{time(s.timeSec)}</code>
            </div>
          </div>
        </div>
        {workbench && <Workbench {...{ s, act }} onClose={() => setWorkbench(false)} />}
        <Inventory />
        {backup && (
          <section className="panel transfer">
            <div className="panel-heading">
              <HardDrive size={17} />
              <h2>{t.ui.transfer}</h2>
              <button onClick={() => setBackup(false)}>{t.ui.close}</button>
            </div>
            <p>{t.ui.copyHint}</p>
            <textarea
              ref={transfer}
              aria-label={t.ui.store}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
            <button
              onClick={() => {
                setRaw(serialize(s, Date.now()));
                requestAnimationFrame(() => transfer.current?.select());
              }}
            >
              {t.ui.export}
            </button>{' '}
            <button
              disabled={!raw.trim()}
              onClick={() => {
                if (importSave(raw)) {
                  setRaw('');
                  setTrade(false);
                  setSelected(null);
                }
              }}
            >
              {t.ui.import}
            </button>
          </section>
        )}
        {notice && (
          <div className="banner" role="status">
            {t.ui[notice]}{' '}
            <button onClick={() => useGame.setState({ notice: '' })}>{t.ui.close}</button>
          </div>
        )}
        {offline?.seconds > 0 && (
          <div className="banner" role="status">
            <div>
              <b>
                {t.ui.offline} · {time(offline.seconds)}
              </b>
              <span>
                {quantities(offline.gains)
                  .filter(([, n]) => Math.abs(n) > b.epsilon)
                  .map(([id, n]) => t.items[id] + ' ' + (n > 0 ? '+' : '') + fmt(n))
                  .join(' · ') || t.ui.noGain}
              </span>
            </div>
            <button onClick={() => useGame.setState({ offline: null })}>{t.ui.close}</button>
          </div>
        )}
        {canTrade && (
          <button className="dock-banner" onClick={() => setTrade(true)}>
            <Ship size={18} />
            {stage === 'farewell' ? t.ui.farewell : t.rusty.arrive}
            <span>{t.ui.open} ↗</span>
          </button>
        )}
        {stage === 'finished' && (
          <section ref={ending} className="ending">
            <Orbit />
            <div>
              <h2>{chapter.done ?? t.ui.ending}</h2>
              <p>
                {chapter.end ?? t.echo.end} {s.planetId === 'grit' ? t.echo.ack : ''}
                {next && (
                  <small>
                    {' '}
                    {t.dusk.carry} {fmt(Math.min(carryLimit(s), s.credits))} / {fmt(carryLimit(s))}
                  </small>
                )}
              </p>
            </div>
            {next && (
              <button
                className="primary"
                onClick={() => {
                  act(landNext);
                  setSelected(null);
                  setRequestedLink(null);
                  setView('graph');
                  setTab('factory');
                  window.scrollTo(0, 0);
                }}
              >
                {next === 'dusk' ? t.dusk.land : t.planets[next].land}
              </button>
            )}
            <Check />
          </section>
        )}
        {currentLesson < t.tutorial.length && (
          <button className="mobile-guide" onClick={() => setTab('echo')}>
            <Terminal size={15} />
            {t.ui.doc} · {t.tutorial[currentLesson][0]} <ArrowUpRight size={14} />
          </button>
        )}
        <div className="workspace">
          <aside className="left">
            <Objectives {...{ s, act }} onTrade={() => setTrade(true)} />
          </aside>
          <section className="center">
            <div className="panel production">
              <div className="panel-heading main-heading">
                <span className="accent-icon">
                  <GitBranch size={18} />
                </span>
                <h2>{t.ui.factory}</h2>
                <span className="live-mark" />
              </div>
              <div className="view-tabs">
                {[
                  [NetworkIcon, 'graph', t.ui.graph],
                  [List, 'list', t.ui.list],
                ].map(([Icon, id, name]) => (
                  <button
                    key={id}
                    className={view === id ? 'on' : ''}
                    aria-pressed={view === id}
                    onClick={() => setView(id)}
                  >
                    <Icon size={15} />
                    {name}
                  </button>
                ))}
              </div>
              {view === 'graph' ? (
                <Suspense fallback={<div className="graph" />}>
                  <Network
                    key={s.planetId}
                    {...{ s, act, selected, focusToken, requestedLink, setRequestedLink }}
                    focus={focusItem}
                    shortages={flows.shortages}
                  />
                </Suspense>
              ) : (
                <MachineList
                  {...{ s, act, batch, setBatch, selected }}
                  focus={focusItem}
                  shortages={flows.shortages}
                />
              )}
              <div className="network-footer">
                <span>
                  <Boxes size={14} />
                  {t.ui.count} <b>{built}</b>
                </span>
                <span>
                  <i />
                  {t.ui.active} <b>{active}</b>
                </span>
              </div>
            </div>
            <Blueprints key={s.planetId} {...{ s, act }} />
            <SplitControls {...{ s, act }} />
            <ValveControls {...{ s, act }} />
            {s.cards.includes('black_market') && (
              <div className="panel">
                <Sales {...{ s, act }} black />
              </div>
            )}
          </section>
          <aside className="right">
            <Echo {...{ s, flows, focus }} />
          </aside>
        </div>
      </main>
      <nav className="mobile-nav">
        {navItems.map(([id, Icon, label]) => (
          <button
            className={tab === id ? 'on' : ''}
            aria-pressed={tab === id}
            key={id}
            onClick={() => setTab(id)}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>
      {trade && canTrade && <Trade key={stage} {...{ s, act }} onClose={() => setTrade(false)} />}
    </div>
  );
}
