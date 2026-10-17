import {
  isWalked,
  type LayerId,
  type MapDocument,
  type MapEdge,
  type MapNode,
  type PathColor,
  type Point,
  type WalkedPath,
} from "../domain/types";

export const newId = (prefix: string) =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

/**
 * A path to add: through two or more pins it becomes the last step, and
 * without a color takes its step's color. Through one pin it is that pin's
 * note path, with no step.
 */
export type NewEdge = Omit<MapEdge, "step" | "color"> &
  Partial<Pick<MapEdge, "color">>;

/** A new path through `nodes` (one pin for a note path), drawn the default way. */
export const newPath = (id: string, nodes: string[]): NewEdge => ({
  id,
  nodes,
  line: "solid",
  oneWay: false,
  note: "",
  showNote: false,
});

/**
 * The colors in the order new paths take them. Each color is far from the
 * next one in hue or lightness, also for red-green color blindness, so
 * neighbouring steps (and the last and first) are easy to tell apart.
 */
const STEP_COLORS: readonly PathColor[] = [
  "gold",
  "blue",
  "white",
  "red",
  "teal",
  "pink",
  "green",
  "purple",
];

/** A new path's color: the step colors in turn, so neighbouring steps differ. */
export const stepColor = (step: number) =>
  STEP_COLORS[(step - 1) % STEP_COLORS.length];

/** What the path editor can change. */
export type EdgeChanges = Partial<
  Pick<MapEdge, "color" | "line" | "oneWay" | "note" | "showNote">
>;

export type MapAction =
  | { type: "addNode"; node: MapNode }
  | { type: "updateNode"; id: string; changes: Partial<Omit<MapNode, "id">> }
  | { type: "removeNode"; id: string }
  | { type: "addEdge"; edge: NewEdge }
  /** Continue a path from its last pin to another. */
  | { type: "extendEdge"; id: string; node: string }
  | {
      type: "updateEdge";
      id: string;
      changes: EdgeChanges;
    }
  | { type: "removeEdge"; id: string }
  /** Give a path another step; the paths in between shift by one. */
  | { type: "moveEdge"; id: string; step: number }
  /**
   * Split a path in two at its pin `at` (an index, neither end). The second
   * part is a new path with the next step.
   */
  | { type: "splitEdge"; id: string; at: number; newId: string }
  /** Several edits as one undo step. */
  | { type: "batch"; actions: MapAction[] };

/** Nodes a path can end at without being stored in the document: the game graces. */
export type FixedNodes = ReadonlyMap<string, MapNode>;
const NO_FIXED_NODES: FixedNodes = new Map();

/**
 * Apply one edit. Returns the same document when the edit would make it invalid.
 * Fixed nodes can be on paths, but can't be moved or removed.
 */
export function applyMapAction(
  doc: MapDocument,
  action: MapAction,
  fixed: FixedNodes = NO_FIXED_NODES,
): MapDocument {
  const find = (id: string) =>
    doc.nodes.find((n) => n.id === id) ?? fixed.get(id);
  const fits = (pins: string[], walked = true) =>
    pins.length >= (walked ? 2 : 1) &&
    (walked || pins.length === 1) &&
    pins.every((id, i) => find(id) && id !== pins[i - 1]);
  const walked = inStepOrder(doc.edges);
  const notes = doc.edges.filter((e) => !isWalked(e));
  /** The document with these walked paths, numbered in order, and `keep` notes. */
  const withPaths = (paths: WalkedPath[], keep = notes) => ({
    ...doc,
    edges: [...renumber(paths), ...keep],
  });
  const replace = (edge: MapEdge) => ({
    ...doc,
    edges: doc.edges.map((e) => (e.id === edge.id ? edge : e)),
  });
  switch (action.type) {
    case "addNode":
      return { ...doc, nodes: [...doc.nodes, action.node] };
    case "updateNode": {
      const node = doc.nodes.find((n) => n.id === action.id);
      if (!node) return doc;
      const updated = { ...node, ...action.changes };
      return {
        ...doc,
        nodes: doc.nodes.map((n) => (n.id === action.id ? updated : n)),
      };
    }
    case "removeNode": {
      if (!doc.nodes.some((n) => n.id === action.id)) return doc;
      // Paths through the node close up around it; a path left with one pin
      // goes, and so does the node's note path.
      const paths = walked.flatMap((e) => {
        if (!e.nodes.includes(action.id)) return [e];
        const nodes = e.nodes
          .filter((id) => id !== action.id)
          .filter((id, i, kept) => id !== kept[i - 1]);
        return nodes.length >= 2 ? [{ ...e, nodes }] : [];
      });
      return {
        ...withPaths(
          paths,
          notes.filter((e) => e.nodes[0] !== action.id),
        ),
        nodes: doc.nodes.filter((n) => n.id !== action.id),
      };
    }
    case "addEdge": {
      const { edge } = action;
      if (doc.edges.some((e) => e.id === edge.id)) return doc;
      if (edge.nodes.length === 1) {
        const pin = edge.nodes[0];
        if (!fits(edge.nodes, false) || notePath(doc, pin)) return doc;
        return {
          ...doc,
          edges: [...doc.edges, { color: "gold", ...edge, step: null }],
        };
      }
      if (!fits(edge.nodes)) return doc;
      const step = walked.length + 1;
      return {
        ...doc,
        edges: [...doc.edges, { color: stepColor(step), ...edge, step }],
      };
    }
    case "extendEdge": {
      const edge = walked.find((e) => e.id === action.id);
      if (!edge) return doc;
      const nodes = [...edge.nodes, action.node];
      return fits(nodes) ? replace({ ...edge, nodes }) : doc;
    }
    case "updateEdge": {
      const edge = doc.edges.find((e) => e.id === action.id);
      if (!edge) return doc;
      const updated = { ...edge, ...action.changes };
      return fits(updated.nodes, isWalked(edge)) ? replace(updated) : doc;
    }
    case "removeEdge":
      if (!doc.edges.some((e) => e.id === action.id)) return doc;
      return withPaths(
        walked.filter((e) => e.id !== action.id),
        notes.filter((e) => e.id !== action.id),
      );
    case "moveEdge": {
      const edge = walked.find((e) => e.id === action.id);
      const step = Math.min(Math.max(1, action.step), walked.length);
      if (!edge || !Number.isInteger(step) || step === edge.step) return doc;
      const others = walked.filter((e) => e.id !== edge.id);
      others.splice(step - 1, 0, edge);
      return withPaths(others);
    }
    case "splitEdge": {
      const edge = walked.find((e) => e.id === action.id);
      const { at } = action;
      if (
        !edge ||
        !(at > 0 && at < edge.nodes.length - 1) ||
        doc.edges.some((e) => e.id === action.newId)
      )
        return doc;
      const ordered = [...walked];
      ordered.splice(
        ordered.indexOf(edge),
        1,
        { ...edge, nodes: edge.nodes.slice(0, at + 1) },
        { ...edge, id: action.newId, nodes: edge.nodes.slice(at) },
      );
      return withPaths(ordered);
    }
    case "batch":
      return action.actions.reduce(
        (next, each) => applyMapAction(next, each, fixed),
        doc,
      );
  }
}

/** The walked paths in walking order, leaving out note paths. */
export const inStepOrder = (edges: MapEdge[]): WalkedPath[] =>
  edges.filter(isWalked).sort((a, b) => a.step - b.step);

/** The note path of pin `id`: the path through only that pin, if any. */
export const notePath = (doc: Pick<MapDocument, "edges">, id: string) =>
  doc.edges.find((e) => !isWalked(e) && e.nodes[0] === id);

/** Number paths 1..N in the order given. */
const renumber = (edges: WalkedPath[]) =>
  edges.map((e, i) => (e.step === i + 1 ? e : { ...e, step: i + 1 }));

export type History = {
  past: MapDocument[];
  present: MapDocument;
  future: MapDocument[];
};
export type HistoryAction =
  | MapAction
  | { type: "undo" }
  | { type: "redo" }
  /** Open a saved map, optionally with the undo history it had before. */
  | { type: "load"; doc: MapDocument; history?: History };
const HISTORY_LIMIT = 200;

export function historyReducer(
  history: History,
  action: HistoryAction,
  fixed?: FixedNodes,
): History {
  switch (action.type) {
    case "load":
      return action.history ?? { past: [], present: action.doc, future: [] };
    case "undo":
      if (!history.past.length) return history;
      return {
        past: history.past.slice(0, -1),
        present: history.past[history.past.length - 1],
        future: [history.present, ...history.future],
      };
    case "redo":
      if (!history.future.length) return history;
      return {
        past: [...history.past, history.present],
        present: history.future[0],
        future: history.future.slice(1),
      };
    default: {
      const next = applyMapAction(history.present, action, fixed);
      if (next === history.present) return history;
      return {
        past: [...history.past, history.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
      };
    }
  }
}

/**
 * The stretches of a path to draw on `layer`, as lines of map points. Jumps
 * between layers aren't drawn.
 */
export function edgeRuns(
  edge: MapEdge,
  nodes: ReadonlyMap<string, MapNode>,
  layer: LayerId,
): Point[][] {
  const runs: Point[][] = [];
  let run: Point[] = [];
  for (const id of edge.nodes) {
    const node = nodes.get(id);
    if (node?.layer === layer) run.push([node.x, node.y]);
    else {
      if (run.length > 1) runs.push(run);
      run = [];
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}
