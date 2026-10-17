import { describe, expect, it } from "vitest";
import type {
  LayerId,
  MapDocument,
  MapEdge,
  MapNode,
} from "../src/domain/types";
import { drawn } from "./paths";
import { applyMapAction } from "../src/map/editing";
import { withGameGraces } from "../src/map/graces";
import { importMap } from "../src/profiles/importMap";

const node = (id: string, changes: Partial<MapNode> = {}): MapNode => ({
  id,
  layer: "overworld",
  x: 1,
  y: 2,
  kind: "junction",
  label: "",
  ref: null,
  ...changes,
});
const edge = (id: string, from: string, to: string): MapEdge => ({
  ...drawn(id, [from, to]),
  step: 0,
});
const doc = (nodes: MapNode[], edges: MapEdge[] = []): MapDocument => ({
  schemaVersion: 4,
  nodes,
  // Paths are walked in the order given.
  edges: edges.map((e, i) => ({ ...e, step: i + 1 })),
});
// What every profile's map shows: a game grace, by its grace id.
const elleh = node("grace/1", { kind: "grace", ref: "grace/1" });
const shown = (map: MapDocument) => withGameGraces(map, [elleh]);
const fixed = new Map([[elleh.id, elleh]]);
const copy = (target: MapDocument, source: MapDocument, layer?: LayerId) =>
  applyMapAction(target, importMap(shown(target), source, layer).action, fixed);

describe("import from another profile", () => {
  const source = doc(
    [node("j"), node("cave", { layer: "underground", kind: "entrance" })],
    [edge("road", "grace/1", "j"), edge("down", "j", "cave")],
  );

  it("copies nodes and paths, with paths ending at game graces", () => {
    const target = doc([]);
    expect(importMap(shown(target), source)).toMatchObject({
      nodes: 2,
      edges: 2,
    });
    const result = copy(target, source);
    expect(result.nodes.map((n) => n.id)).toEqual(["j", "cave"]);
    expect(result.edges.map((e) => e.nodes)).toEqual([
      ["grace/1", "j"],
      ["j", "cave"],
    ]);
    // Importing again brings nothing new.
    expect(importMap(shown(result), source)).toMatchObject({
      nodes: 0,
      edges: 0,
    });
  });

  it("copies one layer, keeping waygates to nodes already on the map", () => {
    const overworld = copy(doc([]), source, "overworld");
    expect(overworld.nodes.map((n) => n.id)).toEqual(["j"]);
    expect(overworld.edges.map((e) => e.id)).toEqual(["road"]);
    const both = copy(overworld, source, "underground");
    expect(both.edges.map((e) => e.id)).toEqual(["road", "down"]);
  });

  it("numbers copied paths in their order, after the target's last path", () => {
    const target = doc([node("k")], [edge("mine", "k", "grace/1")]);
    const reversed = {
      ...source,
      edges: source.edges.map((e) => ({ ...e, step: 3 - e.step! })),
    };
    const result = copy(target, reversed);
    expect(result.edges.map((e) => [e.id, e.step])).toEqual([
      ["mine", 1],
      ["down", 2],
      ["road", 3],
    ]);
  });

  it("skips a path already drawn between the same nodes", () => {
    const target = doc([node("j")], [edge("other", "j", "grace/1")]);
    expect(importMap(shown(target), source, "overworld")).toMatchObject({
      nodes: 0,
      edges: 0,
    });
  });
});

describe("importing notes", () => {
  const note = (pin: string, text: string): MapEdge => ({
    ...drawn(`note-${pin}`, [pin]),
    note: text,
    step: null,
  });

  it("brings pin and grace notes along, unless the pin already has one", () => {
    const source: MapDocument = {
      ...doc([node("j")], [edge("road", "grace/1", "j")]),
    };
    source.edges.push(note("j", "chest"), note("grace/1", "rest"));
    const result = copy(doc([]), source);
    expect(result.edges.map((e) => [e.id, e.step])).toEqual([
      ["road", 1],
      ["note-j", null],
      ["note-grace/1", null],
    ]);
    const noted = {
      ...doc([]),
      edges: [{ ...note("grace/1", "mine"), id: "own" }],
    };
    expect(
      copy(noted, source).edges.filter(
        (e) => e.nodes[0] === "grace/1" && e.step === null,
      ),
    ).toEqual([{ ...note("grace/1", "mine"), id: "own" }]);
  });
});
