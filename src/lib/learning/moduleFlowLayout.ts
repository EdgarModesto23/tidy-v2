import { Graph, layout as dagreLayout } from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/svelte";
import type { LearningModuleRow, LearningSessionRow } from "$lib/learning/types";

/** Match `ModuleFlowNode.svelte`: ~300px wide, vertical stack (title, optional lines, actions). */
const MODULE_NODE_WIDTH = 300;
const MODULE_NODE_HEIGHT = 188;

/** Pre-order walk from root(s) for editor lists. */
export function modulesInTreeOrder(modules: LearningModuleRow[]): LearningModuleRow[] {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const children = new Map<string, LearningModuleRow[]>();
  for (const m of modules) {
    const p = m.parent_module_id;
    if (!p) continue;
    if (!children.has(p)) children.set(p, []);
    children.get(p)!.push(m);
  }
  for (const [, arr] of children) {
    arr.sort((a, b) => a.sort_order - b.sort_order);
  }
  const roots = modules
    .filter((m) => !m.parent_module_id)
    .sort((a, b) => a.sort_order - b.sort_order);
  const out: LearningModuleRow[] = [];
  const seen = new Set<string>();
  function walk(id: string) {
    const m = byId.get(id);
    if (!m || seen.has(id)) return;
    seen.add(id);
    out.push(m);
    for (const c of children.get(id) ?? []) walk(c.id);
  }
  for (const r of roots) walk(r.id);
  for (const m of modules) {
    if (!seen.has(m.id)) out.push(m);
  }
  return out;
}

/**
 * Hierarchical top-down tree layout via [dagre](https://github.com/dagrejs/dagre/wiki).
 * Dagre returns node centers; xyflow expects top-left positions.
 */
export function layoutModuleNodesForFlow(
  modules: LearningModuleRow[],
  extra: {
    programId: string;
    userId: string;
    sessionsByModule: Record<string, LearningSessionRow[]>;
  },
): { nodes: Node[]; edges: Edge[] } {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const children = new Map<string, LearningModuleRow[]>();
  for (const m of modules) {
    const p = m.parent_module_id;
    if (!p) continue;
    if (!children.has(p)) children.set(p, []);
    children.get(p)!.push(m);
  }
  for (const [, arr] of children) {
    arr.sort((a, b) => a.sort_order - b.sort_order);
  }

  const edges: Edge[] = [];
  for (const m of modules) {
    const p = m.parent_module_id;
    if (p && byId.has(p)) {
      edges.push({
        id: `e-${p}-${m.id}`,
        source: p,
        target: m.id,
        animated: true,
      });
    }
  }

  if (modules.length === 0) {
    return { nodes: [], edges };
  }

  const g = new Graph({ multigraph: false, compound: false });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    ranker: "tight-tree",
    nodesep: 40,
    ranksep: 72,
    marginx: 20,
    marginy: 20,
  });

  for (const mod of modules) {
    g.setNode(mod.id, { width: MODULE_NODE_WIDTH, height: MODULE_NODE_HEIGHT });
  }
  for (const m of modules) {
    const p = m.parent_module_id;
    if (p && byId.has(p)) g.setEdge(p, m.id);
  }

  const constraints: { left: string; right: string }[] = [];
  for (const [, siblings] of children) {
    for (let i = 0; i < siblings.length - 1; i++) {
      constraints.push({ left: siblings[i].id, right: siblings[i + 1].id });
    }
  }

  dagreLayout(g, { constraints });

  const nodes: Node[] = modules.map((mod) => {
    const laid = g.node(mod.id);
    const cx = laid?.x ?? MODULE_NODE_WIDTH / 2;
    const cy = laid?.y ?? MODULE_NODE_HEIGHT / 2;
    return {
      id: mod.id,
      type: "module",
      position: {
        x: cx - MODULE_NODE_WIDTH / 2,
        y: cy - MODULE_NODE_HEIGHT / 2,
      },
      data: {
        module: mod,
        programId: extra.programId,
        userId: extra.userId,
        sessions: extra.sessionsByModule[mod.id] ?? [],
      },
    };
  });

  return { nodes, edges };
}
