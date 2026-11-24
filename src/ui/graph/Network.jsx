import React, { useEffect, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  ViewportPortal,
  useReactFlow,
} from '@xyflow/react';
import {
  Maximize,
  Plus,
  Minus,
  RotateCcw,
  Route,
  Expand,
  Minimize,
  Hammer,
  Undo2,
  X,
  Trash2,
} from 'lucide-react';
import '@xyflow/react/dist/style.css';
import {
  network,
  pairs,
  portDock,
  trace,
  quoteBelts,
  setBelts,
  craftBelts,
  planSite,
  siteClear,
  snap,
  toCell,
} from '../../engine/belts';
import { craftableBatches } from '../../engine/crafting';
import { transport as cfg } from '../../data/transport';
import { balance as b } from '../../data/balance';
import { BeltEdge, beltPoints, pathOf } from './BeltEdge';
import { FactoryNode } from './FactoryNode';
import { SpriteLibrary } from './FactoryArt';
import { progress } from '../../engine/merchant';
import { zhCN as t } from '../../i18n/zh-CN';
import { MachineInfo } from '../list/Machines';
import { shown } from '../common/display';
import { rateText } from '../common/resourceReadout';

const nodeTypes = { machine: FactoryNode };
const edgeTypes = { belt: BeltEdge };
const same = (a, b) => a.x === b.x && a.y === b.y;
// A free stroke snaps to the dominant axis, so every drawn piece is a straight line.
const straight = (from, to) =>
  Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
function push(points, p) {
  return same(points.at(-1), p) ? points : [...points, p];
}

function View({ s, act, focus, selected, shortages, focusToken, requestedLink, setRequestedLink }) {
  const plan = network(s),
    flow = useReactFlow(),
    allIds = shown(s);
  const [build, setBuild] = useState(false),
    [helpOpen, setHelpOpen] = useState(() => {
      try { return sessionStorage.getItem('crashstar.beltHelp') !== 'hidden'; } catch { return true; }
    }),
    [wide, setWide] = useState(false),
    [notice, setNotice] = useState(''),
    [stroke, setStroke] = useState(null),
    [hover, setHover] = useState(null),
    [hoverPort, setHoverPort] = useState(null),
    [pick, setPick] = useState(null),
    [inspect, setInspect] = useState(null),
    [hint, setHint] = useState(null),
    [catalog, setCatalog] = useState(''),
    [drag, setDrag] = useState({});
  const built = allIds.filter((id) => s.machines[id].count);
  // Build mode shows unbuilt machines as dashed frames so the player can plan their sites.
  const ids = build
    ? allIds
    : built.length
      ? allIds.filter((id) => s.machines[id].count || [catalog, selected, inspect].includes(id))
      : allIds;
  const signature = ids.join(','),
    available = allIds.filter((id) => !s.machines[id].count);

  const dockOf = (port) => portDock(plan.positions, port.id, port.item, port.side === 'out');
  function showHelp(open) {
    setHelpOpen(open);
    try { sessionStorage.setItem('crashstar.beltHelp', open ? 'open' : 'hidden'); } catch { /* Session storage is optional. */ }
  }
  function reset(message = '') {
    setStroke(null);
    setHoverPort(null);
    setNotice(message);
  }
  // Complete a stroke at `port`: the free end snaps with at most one extra corner (an L-turn).
  function completion(port) {
    if (!stroke || port.item !== stroke.item) return { error: t.belts.mismatch };
    if (port.side === stroke.side || port.id === stroke.id) return { error: t.belts.sameSide };
    const source = stroke.side === 'out' ? stroke.id : port.id,
      target = stroke.side === 'out' ? port.id : stroke.id;
    const pair = pairs.find((p) => p.source === source && p.target === target && p.item === port.item);
    if (!pair) return { error: t.belts.noPair };
    if (!s.machines[source].count || !s.machines[target].count) return { error: t.belts.unbuilt };
    const end = dockOf(port),
      last = stroke.points.at(-1);
    const tries =
      last.x === end.x || last.y === end.y
        ? [push(stroke.points, end)]
        : [
            push(push(stroke.points, { x: last.x, y: end.y }), end),
            push(push(stroke.points, { x: end.x, y: last.y }), end),
          ];
    const route = tries.find((points) => trace(points, plan.blocked)) ?? tries[0];
    const ordered = stroke.side === 'out' ? route : [...route].reverse();
    const via = ordered.slice(1, -1),
      lanes = [...(s.belts[pair.key] ?? []), via];
    if (lanes.length > cfg.maxBeltsPerPair) return { error: t.belts.laneFull, route };
    const quote = quoteBelts(s, pair, lanes);
    if (!quote) return { error: t.belts.blocked, route };
    return { pair, lanes, route, delta: quote.delta };
  }
  function onPort(port) {
    if (!build) return;
    setPick(null);
    if (!stroke) {
      setStroke({ ...port, points: [dockOf(port)] });
      setNotice('');
      return;
    }
    if (stroke.id === port.id && stroke.item === port.item && stroke.side === port.side) {
      reset();
      return;
    }
    const done = completion(port);
    if (done.error) {
      setNotice(done.error);
      return;
    }
    if (done.delta > Math.floor(s.stock.belt + b.epsilon)) {
      setNotice(
        t.belts.shortNeed + ' ' + done.delta + ' ' + t.belts.shortHave + ' ' + Math.floor(s.stock.belt + b.epsilon) + ' ' + t.belts.pieces + '。' + t.belts.craftMore,
      );
      return;
    }
    act((v) => setBelts(v, done.pair, done.lanes));
    setHint(null);
    reset(t.belts.saved);
  }
  function addCorner(cell) {
    if (!stroke) return;
    const next = push(stroke.points, straight(stroke.points.at(-1), cell));
    if (next.length - 1 > cfg.maxWaypoints) {
      setNotice(t.belts.invalid);
      return;
    }
    setStroke({ ...stroke, points: next });
  }
  const cellAt = (e) => toCell(flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));

  // Live preview of the stroke, red when it would cross a machine or double back.
  let preview = null;
  if (build && stroke) {
    const done = hoverPort && completion(hoverPort);
    const points =
      done && done.route
        ? done.route
        : hover
          ? push(stroke.points, straight(stroke.points.at(-1), hover))
          : stroke.points;
    const cells = trace(points, plan.blocked);
    preview = {
      points: points.map((p) => ({ x: p.x * cfg.cell, y: p.y * cfg.cell })),
      ok: !!cells && !(done && done.error),
      length: cells ? cells.length - 1 : null,
      delta: done && !done.error ? done.delta : null,
    };
  }
  const pickedBelt = plan.belts.find((x) => x.id === pick);
  function removePicked() {
    if (!pickedBelt) return;
    const lanes = (s.belts[pickedBelt.pair.key] ?? []).filter((_, i) => i !== pickedBelt.index);
    act((v) => setBelts(v, pickedBelt.pair, lanes));
    setPick(null);
    setNotice(t.belts.removed);
  }

  useEffect(() => {
    if (!build) return;
    const keys = (e) => {
      if (e.target.closest?.('input,select,textarea')) return;
      if (e.key === 'Escape') {
        if (!stroke && !pickedBelt && !notice && helpOpen) showHelp(false);
        reset();
        setPick(null);
      } else if (e.key === 'Backspace' && stroke && stroke.points.length > 1) {
        e.preventDefault();
        setStroke({ ...stroke, points: stroke.points.slice(0, -1) });
      } else if (e.key === 'Delete' && pickedBelt) removePicked();
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  });
  useEffect(() => {
    if (!wide) return;
    const close = (e) => {
      if (e.key === 'Escape' && !stroke) setWide(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [wide, stroke]);
  // "Jump to" from a belt-limited machine: open build mode on that link and light both ports.
  useEffect(() => {
    if (!requestedLink) return;
    const link = plan.active.find((p) => p.key === requestedLink);
    if (link) {
      setBuild(true);
      const laid = plan.belts.find((x) => x.pair.key === link.key && x.cells);
      setPick(laid?.id ?? null);
      setHint({ item: link.item, out: link.source, in: link.target });
      setNotice(
        laid
          ? ''
          : t.belts.missing + ' · ' + t.machines[link.source] + ' → ' + t.machines[link.target] + '。' + t.belts.missingHint,
      );
      requestAnimationFrame(() =>
        flow.fitView({ nodes: [{ id: link.source }, { id: link.target }], padding: 0.25, maxZoom: 1 }),
      );
    }
    setRequestedLink(null);
  }, [requestedLink]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => flow.fitView({ padding: 0.15, maxZoom: 1 }));
    return () => cancelAnimationFrame(frame);
  }, [signature, flow]);
  useEffect(() => {
    if (!selected) return;
    if (!build) setInspect(selected);
    const node = flow.getNode(selected);
    if (node) flow.fitView({ nodes: [node], maxZoom: 1, padding: 0.3 });
  }, [selected, focusToken, flow]);

  const repaired = s.planetId==='dusk'||progress(s) >= 1;
  const nodes = ids.map((id) => {
    const issue = shortages.find((v) => v.producer === id);
    return {
      id,
      type: 'machine',
      position: drag[id] ?? plan.positions[id],
      draggable: build && !s.machines[id].count,
      selectable: false,
      data: {
        s,
        id,
        build,
        stroke,
        hint,
        onPort,
        onPortHover: setHoverPort,
        border:
          (selected === id || inspect === id ? 'highlight ' : '') +
          (repaired && s.machines[id].count
            ? issue
              ? issue.ratio < 1
                ? 'border-short'
                : 'border-tight'
              : 'border-ok'
            : ''),
      },
      ariaLabel: t.machines[id],
    };
  });
  const edges = plan.belts
    .filter((x) => x.cells)
    .map((belt) => ({
      id: belt.id,
      source: belt.pair.source,
      target: belt.pair.target,
      type: 'belt',
      selectable: false,
      focusable: false,
      data: {
        belt,
        flow: s.beltFlow[belt.id] ?? 0,
        build,
        selected: pick === belt.id,
        onSelect: () => {
          if (!build || stroke) return;
          setPick(belt.id);
          setNotice('');
        },
      },
    }));
  function changed(changes) {
    const moved = changes.getByType('position').filter((c) => c.position);
    if (moved.length)
      setDrag((prev) => ({ ...prev, ...Object.fromEntries(moved.map((c) => [c.id, c.position])) }));
  }
  function dropped(_, node) {
    const p = snap(node.position);
    setDrag({});
    if (s.machines[node.id].count) return;
    if (siteClear(s, node.id, p)) act((v) => planSite(v, node.id, p));
    else setNotice(t.belts.badSite);
  }
  const short = preview && preview.length !== null && (preview.delta ?? preview.length + 2) > Math.floor(s.stock.belt + b.epsilon);
  const craftable = (n) => craftableBatches(s, 'belt') >= n;

  return (
    <div className={'belt-workspace ' + (wide ? 'expanded' : '')}>
      <SpriteLibrary />
      <div className="belt-toolbar">
        <button
          className={build ? 'on' : ''}
          aria-pressed={build}
          onClick={() => {
            setBuild(!build);
            reset();
            setPick(null);
            setHint(null);
            setInspect(null);
          }}
        >
          <Route size={16} />
          {build ? t.belts.leave : t.belts.mode}
        </button>
        {build && <button aria-expanded={helpOpen} aria-controls="belt-help" onClick={() => showHelp(!helpOpen)}>{t.belts.instructions}</button>}
        <span className={'belt-stock ' + (short ? 'low' : '')}>
          {t.belts.stock} <b>{Math.floor(s.stock.belt + b.epsilon)}</b> {t.belts.pieces}
        </span>
        {[1, b.largeBatch].map((n) => (
          <button
            key={n}
            disabled={!craftable(n)}
            onClick={() => act((v) => craftBelts(v, n))}
            title={n * cfg.craftStone + ' ' + t.belts.craftCost + ' → ' + n * cfg.craftYield + ' ' + t.belts.pieces}
          >
            <Hammer size={14} />
            {t.belts.craft} +{n * cfg.craftYield}
          </button>
        ))}
        {!build && built.length > 0 && available.length > 0 && (
          <select
            aria-label={t.ui.addMachine}
            value={available.includes(catalog) ? catalog : ''}
            onChange={(e) => {
              setCatalog(e.target.value);
              setInspect(e.target.value || null);
            }}
          >
            <option value="">{t.ui.addMachine}</option>
            {available.map((id) => (
              <option value={id} key={id}>
                {t.machines[id]}
              </option>
            ))}
          </select>
        )}
        <button
          title={t.ui.expandMap}
          aria-label={t.ui.expandMap}
          aria-pressed={wide}
          onClick={() => setWide(!wide)}
        >
          {wide ? <Minimize size={16} /> : <Expand size={16} />}
        </button>
      </div>
      {build && helpOpen && <aside className="belt-help" id="belt-help">
        <div><p>{t.belts.drawHelp}</p><p>{t.belts.siteHelp}</p></div>
        <button aria-label={t.belts.hideInstructions} onClick={() => showHelp(false)}><X size={16} /></button>
      </aside>}
      <div
        className={'graph ' + (build ? 'build-mode' : 'view-mode') + (stroke ? ' drawing' : '')}
        onMouseMove={(e) => {
          if (!stroke) return;
          const c = cellAt(e);
          if (!hover || !same(hover, c)) setHover(c);
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={(e, node) => {
            if (build) {
              if (stroke) addCorner(cellAt(e));
              return;
            }
            if (e.target.closest('button,select,input')) return;
            setInspect(node.id);
          }}
          onPaneClick={(e) => {
            if (build && stroke) addCorner(cellAt(e));
            else {
              setPick(null);
              if (!build) setInspect(null);
            }
          }}
          onPaneContextMenu={(e) => {
            if (!stroke) return;
            e.preventDefault();
            reset();
          }}
          snapToGrid
          snapGrid={[cfg.cell, cfg.cell]}
          onNodesChange={changed}
          onNodeDragStop={dropped}
          nodesConnectable={false}
          edgesReconnectable={false}
          elementsSelectable={false}
          deleteKeyCode={null}
          minZoom={0.12}
          maxZoom={2}
          fitView
          fitViewOptions={{ maxZoom: 1 }}
          proOptions={{ hideAttribution: true }}
        >
          {build ? (
            <Background variant={BackgroundVariant.Lines} color="var(--grid-line)" gap={cfg.cell} size={1} />
          ) : (
            <Background variant={BackgroundVariant.Dots} color="var(--ground-dot)" gap={cfg.cell * 2} size={2} />
          )}
          {preview && (
            <ViewportPortal>
              <svg className="stroke-preview" width="1" height="1" aria-hidden>
                <path className={preview.ok ? 'ok' : 'bad'} d={pathOf(preview.points)} />
                {preview.points.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={i ? 4 : 6} />
                ))}
              </svg>
            </ViewportPortal>
          )}
          {build && pickedBelt?.cells && (
            <ViewportPortal>
              <svg className="stroke-preview picked" width="1" height="1" aria-hidden>
                <path d={pathOf(beltPoints(pickedBelt.cells))} />
              </svg>
            </ViewportPortal>
          )}
        </ReactFlow>
        {build && (stroke || pickedBelt || notice) && (
          <section className="build-hud" aria-live="polite">
            {stroke ? (
              <>
                <p>
                  <b>{t.belts.drawing}</b> · {t.items[stroke.item]} · {t.machines[stroke.id]} (
                  {stroke.side === 'out' ? t.belts.portOut : t.belts.portIn})
                </p>
                <p className={short ? 'low' : ''}>
                  {t.belts.drawn} <b>{preview?.length ?? '—'}</b> {t.belts.pieces} · {t.belts.have}{' '}
                  <b>{Math.floor(s.stock.belt + b.epsilon)}</b> {t.belts.pieces}
                  {short && ' · ' + t.belts.short}
                </p>
                <div className="hud-actions">
                  <button
                    disabled={stroke.points.length < 2}
                    onClick={() => setStroke({ ...stroke, points: stroke.points.slice(0, -1) })}
                  >
                    <Undo2 size={14} />
                    {t.belts.undo}
                  </button>
                  <button onClick={() => reset()}>
                    <X size={14} />
                    {t.belts.cancel}
                  </button>
                </div>
              </>
            ) : pickedBelt ? (
              <>
                <p>
                  <b>{t.belts.picked}</b> · {t.items[pickedBelt.pair.item]} ·{' '}
                  {t.machines[pickedBelt.pair.source]} → {t.machines[pickedBelt.pair.target]}
                </p>
                <p>
                  {t.belts.length} <b>{pickedBelt.cells ? pickedBelt.cells.length - 1 : '—'}</b>{' '}
                  {t.belts.pieces} · {t.belts.flow}{' '}
                  <b>{rateText(s.beltFlow[pickedBelt.id] ?? 0)}</b> · {t.belts.limit}{' '}
                  <b>{rateText(cfg.capacityPerMinute)}</b> · {t.belts.lanes}{' '}
                  <b>{(s.belts[pickedBelt.pair.key] ?? []).length}</b>
                </p>
                <div className="hud-actions">
                  <button onClick={removePicked}>
                    <Trash2 size={14} />
                    {t.belts.remove}
                  </button>
                  <button onClick={() => setPick(null)}>
                    <X size={14} />
                    {t.ui.close}
                  </button>
                </div>
              </>
            ) : null}
            {notice && (
              <p role="status" className="hud-notice">
                {notice} <button aria-label={t.ui.close} onClick={() => setNotice('')}><X size={14} /></button>
              </p>
            )}
          </section>
        )}
        {!build && inspect && s.machines[inspect] && (
          <section className="node-inspector graph-card">
            <button className="inspector-close" aria-label={t.ui.close} onClick={() => setInspect(null)}>
              <X size={14} />
            </button>
            <MachineInfo
              {...{ s, act, focus }}
              id={inspect}
              pressure={shortages.some((v) => v.producer === inspect && v.ratio < 1)}
            />
          </section>
        )}
        <div className="graph-tools">
          {[
            [Plus, t.ui.zoomIn, () => flow.zoomIn()],
            [Minus, t.ui.zoomOut, () => flow.zoomOut()],
            [Maximize, t.ui.fit, () => flow.fitView({ padding: 0.15, maxZoom: 1 })],
            [
              RotateCcw,
              t.ui.resetGhosts,
              () => {
                setDrag({});
                // Built machines keep their sites; only planned (unbuilt) sites are cleared.
                act((v) => ({
                  ...v,
                  ui: {
                    nodePositions: Object.fromEntries(
                      Object.entries(v.ui.nodePositions).filter(([id]) => v.machines[id].count),
                    ),
                  },
                }));
              },
            ],
          ].map(([Icon, label, fn]) => (
            <button key={label} title={label} aria-label={label} onClick={fn}>
              <Icon size={15} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
export function Network(props) {
  return (
    <ReactFlowProvider>
      <View {...props} />
    </ReactFlowProvider>
  );
}
