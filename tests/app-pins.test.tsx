import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MapCanvasHandlers } from "../src/map/MapCanvas";
import type { MapEdge, MapNode } from "../src/domain/types";
import { initialDocuments } from "../src/storage/schema";
import App from "../src/App";

// The real app and pin details; the Leaflet surface is replaced by buttons
// that send the same clicks.
vi.mock("../src/map/MapCanvas", () => ({
  MapCanvas: (
    props: MapCanvasHandlers & { nodes: MapNode[]; edges: MapEdge[] },
  ) => (
    <div>
      <button onClick={() => props.onMapClick([50, 60])}>map</button>
      {props.nodes.map((node) => (
        <button key={node.id} onClick={() => props.onNodeClick(node.id)}>
          {node.id}
        </button>
      ))}
      <output data-testid="nodes">{JSON.stringify(props.nodes)}</output>
      <output data-testid="paths">{JSON.stringify(props.edges)}</output>
    </div>
  ),
}));

afterEach(cleanup);

const sword = {
  id: "weapon/1",
  type: "weapon",
  paramId: 1,
  name: { en: "Longsword", "zh-TW": "長劍" },
  dlc: false,
  icon: null,
};
const shield = {
  ...sword,
  id: "weapon/2",
  name: { en: "Buckler", "zh-TW": "圓盾" },
};

async function open(nodes: MapNode[]) {
  const documents = initialDocuments();
  documents.map.nodes = nodes;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body =
        url === "/game-data/catalog.json"
          ? { items: [sword, shield], graces: [], places: [], npcs: [] }
          : url === "/game-data/map/index.json"
            ? Object.fromEntries(
                ["overworld", "underground", "dlc", "dlc-underground"].map(
                  (id) => [
                    id,
                    { mapId: id, tileSize: 256, maxZoom: 6, size: 10496 },
                  ],
                ),
              )
            : {
                revision: "test",
                state:
                  url === "/api/state/player"
                    ? documents.player
                    : documents.map,
              };
      return new Response(JSON.stringify(body));
    }),
  );
  render(<App />);
  await screen.findByRole("button", { name: "map" });
}

const mapNodes = (): MapNode[] =>
  JSON.parse(screen.getByTestId("nodes").textContent!);
const paths = (): MapEdge[] =>
  JSON.parse(screen.getByTestId("paths").textContent!);
const pick = (label: string, query: string, result: string) => {
  fireEvent.change(screen.getByRole("textbox", { name: label }), {
    target: { value: query },
  });
  fireEvent.click(screen.getByRole("button", { name: new RegExp(result) }));
};

describe("the pin tool", () => {
  it("places a junction that can become an entrance and hold items", async () => {
    await open([]);
    expect(screen.queryByRole("button", { name: /Junction/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pin N" }));
    fireEvent.click(screen.getByRole("button", { name: "map" }));
    expect(mapNodes()).toMatchObject([
      { kind: "junction", x: 50, y: 60, ref: null },
    ]);
    const kind = screen.getByRole("combobox", { name: "Kind" });
    expect(
      [...kind.querySelectorAll("option")].map((o) => o.textContent),
    ).toEqual(["Junction", "Entrance"]);

    pick("Add an item", "long", "Longsword");
    pick("Add an item", "buck", "Buckler");
    expect(mapNodes()[0].items).toEqual(["weapon/1", "weapon/2"]);
    expect(screen.getByText("Items (2)")).toBeInTheDocument();
    fireEvent.change(kind, { target: { value: "entrance" } });
    expect(mapNodes()[0]).toMatchObject({
      kind: "entrance",
      items: ["weapon/1", "weapon/2"],
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(mapNodes()[0].items).toEqual(["weapon/2"]);
  });

  it("turns an older map's item pin into a junction holding its item when edited", async () => {
    await open([
      {
        id: "old",
        layer: "overworld",
        x: 0,
        y: 0,
        kind: "item",
        label: "",
        ref: "weapon/1",
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "old" }));
    expect(screen.getByText("Items (1)")).toBeInTheDocument();
    pick("Add an item", "buck", "Buckler");
    expect(mapNodes()[0]).toMatchObject({
      kind: "junction",
      ref: null,
      items: ["weapon/1", "weapon/2"],
    });
  });
});

describe("pin notes", () => {
  it("keeps a pin's note on its own note path, removed when cleared", async () => {
    await open([
      {
        id: "j",
        layer: "overworld",
        x: 0,
        y: 0,
        kind: "junction",
        label: "",
        ref: null,
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "j" }));
    const note = screen.getByRole("textbox", { name: "Your note" });
    fireEvent.change(note, { target: { value: "Chest behind the wall" } });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Show note on the map" }),
    );
    expect(paths()).toMatchObject([
      {
        nodes: ["j"],
        note: "Chest behind the wall",
        showNote: true,
        step: null,
      },
    ]);
    expect(screen.getByText("Paths (0)")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Show note on the map" }),
    );
    fireEvent.change(note, { target: { value: "" } });
    expect(paths()).toEqual([]);
  });
});
