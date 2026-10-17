import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { Map as LeafletMap } from "leaflet";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LayerId, MapNode } from "../src/domain/types";
import { drawn } from "./paths";
import type { GameData } from "../src/map/catalog";
import { MapCanvas } from "../src/map/MapCanvas";

const leaflet = vi.hoisted(() => ({ current: null as LeafletMap | null }));
vi.mock("../src/map/gestures", () => ({
  enableGestures: (map: LeafletMap) => {
    leaflet.current = map;
    return () => {};
  },
}));

afterEach(cleanup);

const nodes: MapNode[] = [
  {
    id: "surface",
    layer: "overworld",
    x: 100,
    y: 100,
    kind: "junction",
    label: "",
    ref: null,
  },
  {
    id: "below",
    layer: "underground",
    x: 100,
    y: 100,
    kind: "junction",
    label: "",
    ref: null,
  },
];
const info = { mapId: "test", tileSize: 256, maxZoom: 0, size: 1000 };
const data: GameData = {
  catalog: { items: [], graces: [], places: [], npcs: [] },
  layers: {
    overworld: info,
    underground: info,
    dlc: info,
    "dlc-underground": info,
  },
  byId: new Map(),
  uniquePlaces: [],
  graceFlags: new Map(),
};

describe("cross-layer waygate numbers", () => {
  it.each<LayerId>(["overworld", "underground"])(
    "shows one clickable number at the local endpoint on %s",
    (layer) => {
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(
        600,
      );
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(
        400,
      );
      const onEdgeClick = vi.fn();
      const { container } = render(
        <MapCanvas
          layer={layer}
          info={info}
          view={{ layer, x: 100, y: 100, zoom: 1 }}
          nodes={nodes}
          edges={[{ ...drawn("gate", ["surface", "below"]), step: 1 }]}
          selection={null}
          draft={null}
          editable={false}
          drawing={false}
          hideUnusedGraces={false}
          graceNames="auto"
          language="en"
          data={data}
          undiscovered={new Set()}
          position={null}
          route={[]}
          stops={new Map()}
          routeNodes={new Set()}
          highlight={null}
          onMapClick={vi.fn()}
          onNodeClick={vi.fn()}
          onNodeMove={vi.fn()}
          onEdgeClick={onEdgeClick}
          onViewChange={vi.fn()}
        />,
      );
      const numbers = container.querySelectorAll(".path-step");
      expect(numbers).toHaveLength(1);
      expect(numbers[0]).toHaveTextContent("1");
      expect(numbers[0]).not.toHaveClass("is-pinned");
      fireEvent.click(numbers[0]);
      expect(onEdgeClick).toHaveBeenCalledWith("gate");
      expect(container.querySelectorAll(".map-node.has-portal")).toHaveLength(
        1,
      );
    },
  );
});

const graceNodes: MapNode[] = ["start", "middle", "end", "unused"].map(
  (id, i) => ({
    id: `grace/${i + 1}`,
    layer: "overworld",
    x: 100 + i * 20,
    y: 100,
    kind: "grace",
    label: id,
    ref: null,
  }),
);
const canvasProps = (): ComponentProps<typeof MapCanvas> => ({
  layer: "overworld",
  info,
  view: { layer: "overworld", x: 100, y: 100, zoom: 3 },
  nodes: [...graceNodes, ...nodes],
  edges: [],
  selection: null,
  draft: null,
  editable: true,
  drawing: false,
  hideUnusedGraces: false,
  graceNames: "auto",
  language: "en",
  data,
  undiscovered: new Set(),
  position: null,
  route: [],
  stops: new Map(),
  routeNodes: new Set(),
  highlight: null,
  onMapClick: vi.fn(),
  onNodeClick: vi.fn(),
  onNodeMove: vi.fn(),
  onEdgeClick: vi.fn(),
  onViewChange: vi.fn(),
});

describe("path options", () => {
  it("shows a path's note under its step number only when asked, as plain text", () => {
    const path = {
      ...drawn("walk", ["grace/1", "grace/2"]),
      note: "<b>Needs</b> the key",
      step: 1,
    };
    const { container, rerender } = render(
      <MapCanvas {...canvasProps()} edges={[path]} />,
    );
    expect(container.querySelector(".step-note")).toBeNull();
    rerender(
      <MapCanvas {...canvasProps()} edges={[{ ...path, showNote: true }]} />,
    );
    const note = container.querySelector(".path-step .step-note")!;
    expect(note).toHaveTextContent("<b>Needs</b> the key");
    expect(note.previousElementSibling).toHaveTextContent("1");
    expect(note.querySelector("b")).toBeNull();
  });
});

describe("grace visibility", () => {
  it("preserves paths, step numbers and retained grace markers when the filter changes", () => {
    const props = {
      ...canvasProps(),
      view: { layer: "overworld" as const, x: 100, y: 100, zoom: 6 },
      edges: [{ ...drawn("walk", ["grace/1", "grace/2", "grace/3"]), step: 1 }],
    };
    const { container, rerender } = render(<MapCanvas {...props} />);
    const step = container.querySelector(".path-step")!;
    const grace = container.querySelector(".map-node--grace")!;
    const label = [...container.querySelectorAll(".node-label--grace")].find(
      (element) => element.textContent === "start",
    )!;
    const path = container.querySelector(".leaflet-overlay-pane path")!;
    expect(step).not.toBeNull();
    expect(path).not.toBeNull();
    expect(label).not.toBeUndefined();
    rerender(<MapCanvas {...props} hideUnusedGraces />);
    expect(container.querySelectorAll(".map-node--grace")).toHaveLength(3);
    expect(container.querySelector(".path-step")).toBe(step);
    expect(container.querySelector(".map-node--grace")).toBe(grace);
    expect(label.isConnected).toBe(true);
    expect(container.querySelector(".leaflet-overlay-pane path")).toBe(path);
    rerender(<MapCanvas {...props} />);
    expect(container.querySelectorAll(".map-node--grace")).toHaveLength(4);
    expect(container.querySelector(".path-step")).toBe(step);
    expect(container.querySelector(".map-node--grace")).toBe(grace);
    expect(label.isConnected).toBe(true);
  });

  it("keeps every pin on a drawn path, including an inner grace, and updates with the map", () => {
    const props = canvasProps();
    const { container, rerender } = render(<MapCanvas {...props} />);
    const visible = () => container.querySelectorAll(".map-node--grace");
    expect(visible()).toHaveLength(4);
    const filtered = {
      ...props,
      hideUnusedGraces: true,
      edges: [{ ...drawn("walk", ["grace/1", "grace/2", "grace/3"]), step: 1 }],
    };
    rerender(<MapCanvas {...filtered} />);
    expect(visible()).toHaveLength(3);
    // A profile with no paths hides every grace, but keeps its junction.
    rerender(<MapCanvas {...filtered} edges={[]} />);
    expect(visible()).toHaveLength(0);
    expect(container.querySelectorAll(".map-node--junction")).toHaveLength(1);
    // Restoring a path (Undo or switching back) restores its markers.
    rerender(<MapCanvas {...filtered} />);
    expect(visible()).toHaveLength(3);
  });

  it("keeps position and selection visible, and reveals clickable graces before drawing starts", () => {
    const props = { ...canvasProps(), hideUnusedGraces: true };
    const { container, rerender } = render(
      <MapCanvas
        {...props}
        position="grace/1"
        selection={{ kind: "node", id: "grace/2" }}
      />,
    );
    expect(container.querySelectorAll(".map-node--grace")).toHaveLength(2);
    rerender(<MapCanvas {...props} drawing />);
    const graces = container.querySelectorAll(".map-node--grace");
    expect(graces).toHaveLength(4);
    fireEvent.click(graces[3]);
    expect(props.onNodeClick).toHaveBeenCalledWith("grace/4");
    rerender(<MapCanvas {...props} />);
    expect(container.querySelectorAll(".map-node--grace")).toHaveLength(0);
  });
});

describe("grace names", () => {
  it("shows ordinary grace names only at very close zoom and important names at every zoom", () => {
    const props = canvasProps();
    const { container, rerender } = render(
      <MapCanvas
        {...props}
        position="grace/1"
        routeNodes={new Set(["grace/2"])}
        selection={{ kind: "node", id: "grace/3" }}
      />,
    );
    const labels = () =>
      [...container.querySelectorAll(".node-label--grace")].map(
        (element) => element.textContent,
      );
    expect(labels()).toEqual(["start", "middle", "end"]);
    const unused = container.querySelectorAll(".map-node--grace")[3];
    fireEvent.mouseOver(unused);
    expect(labels()).toContain("unused");
    fireEvent.mouseOut(unused);
    expect(labels()).not.toContain("unused");
    act(() => leaflet.current!.setZoom(4, { animate: false }));
    expect(labels()).toEqual(["start", "middle", "end"]);
    fireEvent.mouseOver(unused);
    expect(labels()).toContain("unused");
    fireEvent.mouseOut(unused);
    act(() => leaflet.current!.setZoom(5, { animate: false }));
    expect(labels()).toEqual(["start", "middle", "end"]);
    act(() => leaflet.current!.setZoom(6, { animate: false }));
    expect(labels()).toHaveLength(4);
    rerender(<MapCanvas {...props} />);
    expect(labels()).toHaveLength(4);
    act(() => leaflet.current!.setZoom(3, { animate: false }));
    expect(labels()).toEqual([]);
  });

  it("applies the detail choice immediately while preserving important names", () => {
    const props = { ...canvasProps(), position: "grace/1" };
    const { container, rerender } = render(<MapCanvas {...props} />);
    const labels = () =>
      [...container.querySelectorAll(".node-label--grace")].map(
        (element) => element.textContent,
      );
    expect(labels()).toEqual(["start"]);
    rerender(<MapCanvas {...props} graceNames="always" />);
    expect(labels()).toHaveLength(4);
    act(() => leaflet.current!.setZoom(8, { animate: false }));
    rerender(<MapCanvas {...props} graceNames="hover" />);
    expect(labels()).toEqual(["start"]);
    fireEvent.mouseOver(container.querySelectorAll(".map-node--grace")[3]);
    expect(labels()).toContain("unused");
    rerender(<MapCanvas {...props} />);
    expect(labels()).toHaveLength(4);
  });
});

describe("pin notes and items", () => {
  const notePath = (pin: string, showNote: boolean) => ({
    ...drawn(`note-${pin}`, [pin]),
    note: "<i>Chest</i> here",
    showNote,
    step: null,
  });

  it("shows a pin's note below it only when asked, as plain text, with no step number", () => {
    const { container, rerender } = render(
      <MapCanvas {...canvasProps()} edges={[notePath("surface", false)]} />,
    );
    expect(container.querySelector(".pin-note")).toBeNull();
    expect(container.querySelector(".path-step")).toBeNull();
    rerender(
      <MapCanvas {...canvasProps()} edges={[notePath("surface", true)]} />,
    );
    const note = container.querySelector(".pin-note")!;
    expect(note).toHaveTextContent("<i>Chest</i> here");
    expect(note.querySelector("i")).toBeNull();
    expect(container.querySelector(".path-step")).toBeNull();
  });

  it("keeps a grace with a note visible when unused graces are hidden", () => {
    const { container } = render(
      <MapCanvas
        {...canvasProps()}
        hideUnusedGraces
        edges={[notePath("grace/2", true)]}
      />,
    );
    expect(container.querySelectorAll(".map-node--grace")).toHaveLength(1);
    expect(container.querySelector(".pin-note")).toHaveTextContent("Chest");
  });

  it("marks a pin holding items with how many more it holds", () => {
    const [surface] = nodes;
    const { container } = render(
      <MapCanvas
        {...canvasProps()}
        nodes={[{ ...surface, items: ["weapon/1", "weapon/2", "weapon/3"] }]}
      />,
    );
    const pin = container.querySelector(".map-node.has-items")!;
    expect(pin).toHaveTextContent("+2");
  });
});
