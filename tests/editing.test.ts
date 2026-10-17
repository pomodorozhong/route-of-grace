import { describe, expect, it } from "vitest";
import type { MapDocument, MapNode } from "../src/domain/types";
import { applyMapAction, historyReducer, newPath } from "../src/map/editing";
import { drawn } from "./paths";
import {
  initialDocuments,
  upgradeDocument,
  validDocument,
} from "../src/storage/schema";

const node = (id: string, layer: MapNode["layer"] = "overworld"): MapNode => ({
  id,
  layer,
  x: 1,
  y: 2,
  kind: "junction",
  label: "",
  ref: null,
});
const doc = (...nodes: MapNode[]): MapDocument => ({
  schemaVersion: 4,
  nodes,
  edges: [],
});
const edge = drawn;

describe("map editing", () => {
  it("lets a path jump between layers", () => {
    const start = doc(node("a"), node("b", "underground"));
    const linked = applyMapAction(start, {
      type: "addEdge",
      edge: edge("e", ["a", "b"]),
    });
    expect(linked.edges).toEqual([{ ...edge("e", ["a", "b"]), step: 1 }]);
    expect(validDocument("map", linked)).toBe(true);
  });

  it("colors new paths by step, unless they bring a color", () => {
    const start = doc(node("a"), node("b"));
    const added = ["p", "q", "r"].reduce(
      (next, id) =>
        applyMapAction(next, {
          type: "addEdge",
          edge: newPath(id, ["a", "b"]),
        }),
      start,
    );
    expect(added.edges.map((e) => e.color)).toEqual(["gold", "blue", "white"]);
    const kept = applyMapAction(added, {
      type: "addEdge",
      edge: { ...newPath("s", ["a", "b"]), color: "pink" },
    });
    expect(kept.edges[3].color).toBe("pink");
  });

  it("removes a node's paths with it", () => {
    const linked = applyMapAction(doc(node("a"), node("b")), {
      type: "addEdge",
      edge: edge("e", ["a", "b"]),
    });
    expect(applyMapAction(linked, { type: "removeNode", id: "a" })).toEqual(
      doc(node("b")),
    );
  });

  it("undoes and redoes, and ignores edits that change nothing", () => {
    let history = historyReducer(
      { past: [], present: doc(), future: [] },
      { type: "addNode", node: node("a") },
    );
    history = historyReducer(history, {
      type: "updateNode",
      id: "a",
      changes: { x: 9 },
    });
    expect(historyReducer(history, { type: "removeEdge", id: "missing" })).toBe(
      history,
    );
    history = historyReducer(history, { type: "undo" });
    expect(history.present.nodes[0].x).toBe(1);
    history = historyReducer(history, { type: "redo" });
    expect(history.present.nodes[0].x).toBe(9);
    history = historyReducer(historyReducer(history, { type: "undo" }), {
      type: "addNode",
      node: node("b"),
    });
    expect(history.future).toEqual([]);
  });
});

describe("paths through pins", () => {
  const pins = doc(node("a"), node("b"), node("c"), node("d"));
  const line = applyMapAction(pins, {
    type: "addEdge",
    edge: edge("p", ["a", "b", "c"]),
  });

  it("extends a path from its last pin", () => {
    const longer = applyMapAction(line, {
      type: "extendEdge",
      id: "p",
      node: "d",
    });
    expect(longer.edges[0].nodes).toEqual(["a", "b", "c", "d"]);
    // Not to the pin it's already at, nor to a missing one.
    expect(
      applyMapAction(line, { type: "extendEdge", id: "p", node: "c" }),
    ).toBe(line);
    expect(
      applyMapAction(line, { type: "extendEdge", id: "p", node: "x" }),
    ).toBe(line);
  });

  it("closes up around a removed pin, and drops a path left with one", () => {
    const closed = applyMapAction(line, { type: "removeNode", id: "b" });
    expect(closed.edges[0].nodes).toEqual(["a", "c"]);
    expect(
      applyMapAction(closed, { type: "removeNode", id: "a" }).edges,
    ).toEqual([]);
  });

  it("splits a path at an inner pin into two steps in a row", () => {
    const two = applyMapAction(
      applyMapAction(line, { type: "addEdge", edge: edge("q", ["c", "d"]) }),
      { type: "splitEdge", id: "p", at: 1, newId: "p2" },
    );
    expect(two.edges.map((e) => [e.id, e.nodes, e.step])).toEqual([
      ["p", ["a", "b"], 1],
      ["p2", ["b", "c"], 2],
      ["q", ["c", "d"], 3],
    ]);
    expect(validDocument("map", two)).toBe(true);
    // Not at an end.
    expect(
      applyMapAction(line, { type: "splitEdge", id: "p", at: 0, newId: "n" }),
    ).toBe(line);
  });
});

describe("path steps", () => {
  const add = (start: MapDocument, ...ids: string[]) =>
    ids.reduce(
      (next, id) =>
        applyMapAction(next, {
          type: "addEdge",
          edge: edge(id, ["a", id === "c" ? "c" : "b"]),
        }),
      start,
    );
  const order = (map: MapDocument) =>
    [...map.edges].sort((x, y) => x.step! - y.step!).map((e) => e.id);
  const steps = (map: MapDocument) =>
    Object.fromEntries(map.edges.map((e) => [e.id, e.step]));
  const four = add(doc(node("a"), node("b"), node("c")), "p", "q", "r", "s");

  it("numbers new paths after the last one", () => {
    expect(steps(four)).toEqual({ p: 1, q: 2, r: 3, s: 4 });
    expect(validDocument("map", four)).toBe(true);
  });

  it("moves a path to any step and shifts the ones between", () => {
    const move = (id: string, step: number) =>
      applyMapAction(four, { type: "moveEdge", id, step });
    expect(order(move("s", 2))).toEqual(["p", "s", "q", "r"]);
    expect(order(move("p", 3))).toEqual(["q", "r", "p", "s"]);
    expect(order(move("r", 1))).toEqual(["r", "p", "q", "s"]);
    expect(order(move("q", 99))).toEqual(["p", "r", "s", "q"]);
    expect(validDocument("map", move("s", 2))).toBe(true);
    expect(move("q", 2)).toBe(four);
    expect(move("missing", 1)).toBe(four);
  });

  it("closes the gap when a path or its node is removed", () => {
    const moved = applyMapAction(four, { type: "moveEdge", id: "s", step: 1 });
    expect(
      steps(applyMapAction(moved, { type: "removeEdge", id: "p" })),
    ).toEqual({ s: 1, q: 2, r: 3 });
    // c's path is step 2 here; removing c renumbers the rest.
    const withC = add(doc(node("a"), node("b"), node("c")), "p", "c", "q");
    expect(
      steps(applyMapAction(withC, { type: "removeNode", id: "c" })),
    ).toEqual({ p: 1, q: 2 });
  });

  it("rejects gaps and repeats", () => {
    const at = (...s: number[]) => ({
      ...four,
      edges: four.edges.map((e, i) => ({ ...e, step: s[i] })),
    });
    expect(validDocument("map", at(4, 3, 2, 1))).toBe(true);
    expect(validDocument("map", at(1, 2, 2, 3))).toBe(false);
    expect(validDocument("map", at(1, 2, 3, 5))).toBe(false);
    expect(validDocument("map", at(0, 1, 2, 3))).toBe(false);
  });
});

describe("upgrading a version 1 map", () => {
  it("numbers paths in file order and turns bends into junctions", () => {
    const v1 = {
      schemaVersion: 1,
      nodes: [node("a"), node("b")],
      edges: [
        {
          id: "e",
          from: "a",
          to: "b",
          type: "road",
          points: [[5, 6]],
          note: "n",
        },
        {
          id: "f",
          from: "b",
          to: "grace/1",
          type: "foot",
          points: [],
          note: "",
        },
      ],
    };
    const upgraded = upgradeDocument("map", v1);
    expect(upgraded).toEqual({
      schemaVersion: 4,
      nodes: [node("a"), node("b"), { ...node("e-bend-1"), x: 5, y: 6 }],
      edges: [
        {
          ...edge("e", ["a", "e-bend-1", "b"]),
          note: "n",
          step: 1,
        },
        {
          ...edge("f", ["b", "grace/1"]),
          color: "white",
          line: "dashed",
          step: 2,
        },
      ],
    });
    expect(validDocument("map", upgraded)).toBe(true);
  });
});

describe("upgrading a version 2 map", () => {
  it("keeps each path's look and turns one-way drops into an option", () => {
    const v2 = {
      schemaVersion: 2,
      nodes: [node("a"), node("b"), node("c", "underground")],
      edges: [
        { id: "r", nodes: ["a", "b"], type: "road", note: "n", step: 1 },
        { id: "d", nodes: ["b", "a"], type: "one-way-drop", note: "", step: 2 },
        { id: "w", nodes: ["b", "c"], type: "waygate", note: "", step: 3 },
      ],
    };
    const upgraded = upgradeDocument("map", v2);
    expect(upgraded).toEqual({
      schemaVersion: 4,
      nodes: v2.nodes,
      edges: [
        { ...edge("r", ["a", "b"]), note: "n", step: 1 },
        {
          ...edge("d", ["b", "a"]),
          color: "red",
          line: "dashed",
          oneWay: true,
          step: 2,
        },
        { ...edge("w", ["b", "c"]), color: "purple", line: "dashed", step: 3 },
      ],
    });
    expect(validDocument("map", upgraded)).toBe(true);
  });
});

describe("upgrading a version 3 map", () => {
  it("drops the teleport option, keeping everything else", () => {
    const v3 = {
      schemaVersion: 3,
      nodes: [node("a"), node("b")],
      edges: [
        {
          ...edge("e", ["a", "b"]),
          note: "n",
          showNote: true,
          teleport: false,
          step: 1,
        },
      ],
    };
    const upgraded = upgradeDocument("map", v3);
    expect(upgraded).toEqual({
      schemaVersion: 4,
      nodes: v3.nodes,
      edges: [{ ...edge("e", ["a", "b"]), note: "n", showNote: true, step: 1 }],
    });
    expect(validDocument("map", upgraded)).toBe(true);
  });
});

describe("document validation", () => {
  it("rejects dangling, duplicate and malformed entries", () => {
    const base = doc(node("a"), node("b"));
    expect(
      validDocument("map", {
        ...base,
        edges: [{ ...edge("e", ["a", "missing"]), step: 1 }],
      }),
    ).toBe(false);
    expect(validDocument("map", doc(node("a"), node("a")))).toBe(false);
    expect(
      validDocument("map", {
        ...base,
        edges: [
          { ...edge("e", ["a", "b"]), step: 1 },
          { ...edge("e", ["b", "a"]), step: 2 },
        ],
      }),
    ).toBe(false);
    expect(validDocument("map", doc({ ...node("a"), x: Number.NaN }))).toBe(
      false,
    );
    expect(validDocument("map", { ...base, extra: true })).toBe(false);
    const player = initialDocuments().player;
    expect(validDocument("player", { ...player, language: "zh-TW" })).toBe(
      true,
    );
    expect(validDocument("player", { ...player, language: "fr" })).toBe(false);
    expect(
      validDocument("player", { ...player, activeProfile: "missing" }),
    ).toBe(false);
    expect(validDocument("player", { ...player, profiles: [] })).toBe(false);
  });
});
