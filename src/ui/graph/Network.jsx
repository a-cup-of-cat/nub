import React, { useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  Background,
  useReactFlow,
} from '@xyflow/react';
import { Maximize, Plus, Minus, RotateCcw } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { definition, machineIds } from '../../data/machines';
import { quantities } from '../../data/items';
import { rates } from '../../engine/rates';
import { progress } from '../../engine/merchant';
import { zhCN as t } from '../../i18n/zh-CN';
import { MachineInfo } from '../list/Machines';
import { shown, fmt } from '../common/display';
function NodeCard({ data: { s, id, act, focus, shortages } }) {
  const issue = shortages.find((v) => v.producer === id);
  return (
    <article className={'graph-card ' + (issue && issue.ratio < 1 ? 'constrained' : '')}>
      <Handle type="target" position={Position.Left} />
      <MachineInfo {...{ s, id, act, focus }} pressure={issue && issue.ratio < 1} />
      <Handle type="source" position={Position.Right} />
    </article>
  );
}
const nodeTypes = { machine: NodeCard };
function positions(ids) {
  const depth = {},
    rows = {};
  function level(id) {
    if (id in depth) return depth[id];
    const inputs = Object.keys(definition(id).input);
    const parents = machineIds.filter((p) => inputs.some((k) => k in definition(p).output));
    return (depth[id] = parents.length ? 1 + Math.max(...parents.map(level)) : 0);
  }
  return Object.fromEntries(
    ids.map((id) => {
      const col = level(id),
        row = rows[col] ?? 0;
      rows[col] = row + 1;
      return [id, { x: col * 330, y: row * 265 }];
    }),
  );
}
function View({ s, act, focus, selected, shortages, focusToken }) {
  const ids = shown(s),
    signature = ids.join(','),
    layout = useMemo(() => positions(signature.split(',')), [signature]);
  const flow = useReactFlow(),
    [drag, setDrag] = useState({});
  const repaired = progress(s) >= 1;
  const nodes = ids.map((id) => {
    const issue = shortages.find((v) => v.producer === id);
    return {
      id,
      type: 'machine',
      position: drag[id] ?? s.ui.nodePositions[id] ?? layout[id],
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
  const edges = [];
  for (const id of ids) {
    if (!s.machines[id].count) continue;
    for (const [item] of quantities(definition(id).input)) {
      const producer = ids.find((other) => item in definition(other).output);
      if (!producer || !s.machines[producer].count) continue;
      const amount = (rates(s, id).input[item] ?? 0) * s.machines[id].utilization;
      edges.push({
        id: producer + '-' + id + '-' + item,
        source: producer,
        target: id,
        label: t.items[item] + ' ' + fmt(amount) + t.ui.minute,
        style: { strokeWidth: 1 + Math.log1p(amount) / 2 },
      });
    }
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
          ui: { nodePositions: { ...v.ui.nodePositions, [c.id]: c.position } },
        }));
  }
  return (
    <div className="graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={changed}
        onNodeDragStop={(_, node) => {
          act((v) => ({
            ...v,
            ui: { nodePositions: { ...v.ui.nodePositions, [node.id]: node.position } },
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
        <Background color="var(--dots)" gap={18} size={1.2} />
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
  );
}
export function Network(props) {
  return (
    <ReactFlowProvider>
      <View {...props} />
    </ReactFlowProvider>
  );
}
