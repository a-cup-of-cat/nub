import React, { useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  Background,
  BackgroundVariant,
  useReactFlow,
} from '@xyflow/react';
import { Maximize, Plus, Minus, RotateCcw, Route, Expand, Minimize } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { network, routeCells, setBelts, snap, toCell } from '../../engine/belts';
import { transport as cfg } from '../../data/transport';
import { BeltEdge } from './BeltEdge';
import { BeltTools } from './BeltTools';
import { progress } from '../../engine/merchant';
import { zhCN as t } from '../../i18n/zh-CN';
import { MachineInfo } from '../list/Machines';
import { shown } from '../common/display';
function NodeCard({ data: { s, id, act, focus, shortages } }) {
  const issue = shortages.find((v) => v.producer === id);
  return (
    <article
      style={{ width: cfg.machineWidth, height: cfg.machineHeight }}
      className={'graph-card ' + (issue && issue.ratio < 1 ? 'constrained' : '')}
    >
      <Handle type="target" position={Position.Left} />
      <MachineInfo {...{ s, id, act, focus }} pressure={issue && issue.ratio < 1} />
      <Handle type="source" position={Position.Right} />
    </article>
  );
}
const nodeTypes = { machine: NodeCard };
const edgeTypes = { belt: BeltEdge };
const defaultLane = [[]];
function View({ s, act, focus, selected, shortages, focusToken, requestedLink, setRequestedLink }) {
  const allIds = shown(s),
    plan = network(s),
    flow = useReactFlow();
  const [drag, setDrag] = useState({}),
    [editing, setEditing] = useState(false),
    [wide, setWide] = useState(false),
    [notice, setNotice] = useState(''),
    [choice, setChoice] = useState(null);
  const [catalog, setCatalog] = useState('');
  const ids = plan.active.length
      ? allIds.filter(
          (id) => s.machines[id].count || (!editing && (id === catalog || id === selected)),
        )
      : allIds,
    signature = ids.join(',');
  const available = allIds.filter((id) => !s.machines[id].count);
  const [from, setFrom] = useState(null);
  function pickNode(e, node) {
    if (!editing || e.target.closest('button,select,input')) return;
    const link = plan.active.find((p) => p.source === from && p.target === node.id);
    if (link) {
      select(link, 0);
      setFrom(null);
      return;
    }
    if (plan.active.some((p) => p.source === node.id)) {
      setFrom(node.id);
      setNotice(t.belts.source + ' · ' + t.machines[node.id] + ' → ' + t.belts.target);
    }
  }
  const pair = plan.active.find((p) => p.key === choice?.key) ?? plan.active[0];
  const lanes = pair ? (s.belts[pair.key] ?? defaultLane) : [];
  const draft =
    choice?.key === pair?.key && choice
      ? choice
      : { key: pair?.key, index: 0, via: lanes[0] ?? [] };
  const existing = plan.belts.find((b) => b.pair.key === pair?.key && b.index === draft.index);
  const preview = useMemo(
    () => (editing && pair ? routeCells(plan.positions, pair, draft.via, plan.blocked) : null),
    [editing, plan, pair, draft.via],
  );
  const select = (p, index) => {
    if (!p) return;
    setChoice({ key: p.key, index, via: (s.belts[p.key] ?? [[]])[index] ?? [] });
    setNotice('');
  };
  useEffect(() => {
    if (!requestedLink) return;
    const link = plan.active.find((p) => p.key === requestedLink);
    if (link) {
      select(link, 0);
      setEditing(true);
      requestAnimationFrame(() =>
        flow.fitView({
          nodes: [{ id: link.source }, { id: link.target }],
          padding: 0.18,
          maxZoom: 1,
        }),
      );
    }
    setRequestedLink(null);
  }, [requestedLink]);
  const patch = (via) => {
    setChoice({ ...draft, via });
    setNotice('');
  };
  function addPoint(p) {
    if (
      !pair ||
      draft.via.length >= cfg.maxWaypoints ||
      ![p.x, p.y].every((v) => Number.isInteger(v) && Math.abs(v) <= cfg.coordinateLimit)
    ) {
      setNotice(t.belts.invalid);
      return;
    }
    patch([...draft.via, p]);
  }
  function change(kind) {
    if (!pair) return;
    if (kind === 'reset') {
      act((v) => {
        const belts = { ...v.belts };
        delete belts[pair.key];
        return { ...v, belts };
      });
      setChoice({ key: pair.key, index: 0, via: [] });
      setNotice(t.belts.restored);
      return;
    }
    const next = [...lanes];
    if (kind === 'remove') next.splice(draft.index, 1);
    else next[draft.index] = draft.via;
    act((v) => setBelts(v, pair, next));
    setChoice(kind === 'remove' ? { key: pair.key, index: 0, via: next[0] ?? [] } : { ...draft });
    setNotice(kind === 'remove' ? t.belts.removed : t.belts.saved);
  }
  function focusPair() {
    if (pair)
      flow.fitView({
        nodes: [{ id: pair.source }, { id: pair.target }],
        padding: 0.18,
        maxZoom: 1,
      });
  }
  useEffect(() => {
    if (!wide) return;
    const close = (e) => {
      if (e.key === 'Escape') setWide(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [wide]);
  const repaired = progress(s) >= 1;
  const nodes = ids.map((id) => {
    const issue = shortages.find((v) => v.producer === id);
    return {
      id,
      type: 'machine',
      position: drag[id] ?? plan.positions[id],
      data: { s, id, act, focus, shortages },
      className:
        (selected === id ? 'highlight ' : '') +
        (repaired
          ? issue
            ? issue.ratio < 1
              ? 'border-short'
              : 'border-tight'
            : 'border-ok'
          : ''),
      ariaLabel: t.machines[id],
    };
  });
  const edges = plan.belts
    .filter((b) => b.cells)
    .map((belt) => ({
      id: belt.id,
      source: belt.pair.source,
      target: belt.pair.target,
      type: 'belt',
      selectable: false,
      data: {
        belt,
        flow: s.beltFlow[belt.id] ?? 0,
        selected: editing && existing?.id === belt.id,
        edit: () => {
          select(belt.pair, belt.index);
          setEditing(true);
        },
      },
    }));
  const changedRoute =
    !existing ||
    existing.via.length !== draft.via.length ||
    existing.via.some((point, i) => point.x !== draft.via[i].x || point.y !== draft.via[i].y);
  if (editing && pair && changedRoute && preview) {
    edges.push({
      id: 'draft',
      source: pair.source,
      target: pair.target,
      type: 'belt',
      selectable: false,
      data: {
        belt: { pair, cells: preview, via: draft.via },
        flow: 0,
        selected: true,
        draft: true,
        edit: () => {},
      },
    });
  }
  useEffect(() => {
    const frame = requestAnimationFrame(() => flow.fitView({ padding: 0.15, maxZoom: 1 }));
    return () => cancelAnimationFrame(frame);
  }, [signature, flow]);
  useEffect(() => {
    if (!selected) return;
    const node = flow.getNode(selected);
    if (node) flow.fitView({ nodes: [node], maxZoom: 1, padding: 0.3 });
  }, [selected, focusToken, flow]);
  function changed(changes) {
    const moved = changes.getByType('position').filter((c) => c.position);
    if (!moved.length) return;
    setDrag((prev) => ({ ...prev, ...Object.fromEntries(moved.map((c) => [c.id, c.position])) }));
    for (const c of moved)
      if (c.dragging === false)
        act((v) => ({
          ...v,
          ui: { nodePositions: { ...v.ui.nodePositions, [c.id]: snap(c.position) } },
        }));
  }
  return (
    <div className={'belt-workspace ' + (wide ? 'expanded' : '')}>
      <div className="belt-toolbar">
        <button
          className={editing ? 'on' : ''}
          aria-pressed={editing}
          onClick={() => {
            setEditing(!editing);
            setNotice('');
          }}
        >
          <Route size={16} />
          {editing ? t.belts.done : t.belts.lay}
        </button>
        {!editing && plan.active.length > 0 && available.length > 0 && (
          <select
            aria-label={t.ui.addMachine}
            value={available.includes(catalog) ? catalog : ''}
            onChange={(e) => setCatalog(e.target.value)}
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
      {editing && (
        <BeltTools
          {...{ plan, pair, draft, select, patch, addPoint, existing, preview, notice, s }}
          save={() => change('save')}
          remove={() => change('remove')}
          reset={() => change('reset')}
          focus={focusPair}
        />
      )}
      <div className={'graph ' + (editing ? 'placing' : '')}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={pickNode}
          snapToGrid
          snapGrid={[cfg.cell, cfg.cell]}
          nodesDraggable={!editing}
          onPaneClick={(e) => {
            if (editing && pair)
              addPoint(toCell(flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })));
          }}
          onNodesChange={changed}
          onNodeDragStop={(_, node) => {
            act((v) => ({
              ...v,
              ui: { nodePositions: { ...v.ui.nodePositions, [node.id]: snap(node.position) } },
            }));
            setDrag({});
          }}
          nodesConnectable={false}
          edgesReconnectable={false}
          deleteKeyCode={null}
          minZoom={0.12}
          maxZoom={2}
          fitView
          fitViewOptions={{ maxZoom: 1 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Lines}
            color="var(--dots)"
            gap={cfg.cell}
            size={1}
          />
        </ReactFlow>
        <div className="graph-tools">
          {[
            [Plus, t.ui.zoomIn, () => flow.zoomIn()],
            [Minus, t.ui.zoomOut, () => flow.zoomOut()],
            [Maximize, t.ui.fit, () => flow.fitView({ padding: 0.15, maxZoom: 1 })],
            [
              RotateCcw,
              t.ui.resetView,
              () => {
                setDrag({});
                act((v) => ({ ...v, ui: { nodePositions: {} } }));
                requestAnimationFrame(() => flow.fitView({ padding: 0.15, maxZoom: 1 }));
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
