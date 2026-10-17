import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  isWalked,
  pinItems,
  type GraceNameMode,
  type LayerId,
  type Language,
  type MapEdge,
  type MapNode,
  type MapView,
  type Point,
} from "../domain/types";
import {
  displayName,
  iconUrl,
  isItem,
  type GameData,
  type MapLayerInfo,
} from "./catalog";
import type { RouteLine } from "../routing/order";
import type { Draft } from "./drawing";
import { edgeRuns } from "./editing";
import { enableGestures } from "./gestures";
import { placeStep } from "./stepPlacement";
import { NODE_SYMBOL, pathStyle } from "./style";
import { isGameGrace } from "./graces";

export type Selection = { kind: "node" | "edge"; id: string } | null;

export type MapCanvasHandlers = {
  onMapClick(point: Point): void;
  onNodeClick(id: string): void;
  onNodeMove(id: string, point: Point): void;
  onEdgeClick(id: string): void;
  onViewChange(view: MapView): void;
};

type Props = MapCanvasHandlers & {
  layer: LayerId;
  info: MapLayerInfo;
  /** View to show when the layer is (re)opened. */
  view: MapView;
  nodes: MapNode[];
  edges: MapEdge[];
  selection: Selection;
  draft: Draft | null;
  editable: boolean;
  /** Draw path mode, including choosing the first pin. */
  drawing: boolean;
  hideUnusedGraces: boolean;
  graceNames: GraceNameMode;
  language: Language;
  data: GameData;
  /** Graces on the map not yet discovered in this playthrough. */
  undiscovered: Set<string>;
  /** The node the player is at, or null. */
  position: string | null;
  /** The planned route, drawn over the paths. */
  route: RouteLine[];
  /** Route stop numbers, by node. */
  stops: Map<string, number>;
  /** Every node traversed by the planned route, including fast travel. */
  routeNodes: Set<string>;
  /** A path to point out, for example while choosing where to move a path. */
  highlight: string | null;
};

const LABEL_ZOOM = 4;
const GRACE_LABEL_ZOOM = 6;
/** How far step numbers pinned to the screen edge stay from it, in pixels. */
const STEP_INSET = 24;

export function MapCanvas(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const overlay = useRef<L.LayerGroup | null>(null);
  const rubberBand = useRef<L.Polyline | null>(null);
  const graceMarkers = useRef<
    { id: string; marker: L.Marker; onPath: boolean }[]
  >([]);
  const labels = useRef<
    { marker: L.Marker; always: boolean; minZoom: number | null }[]
  >([]);
  /** Step numbers on the map, with the stretches of their path on this layer. */
  const steps = useRef<{ marker: L.Marker; runs: Point[][] }[]>([]);
  // Leaflet handlers are bound once; they read the latest props through this ref.
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  const syncGraceVisibility = () => {
    const group = overlay.current;
    if (!group) return;
    const { hideUnusedGraces, drawing, position, selection } = latest.current;
    for (const { id, marker, onPath } of graceMarkers.current) {
      const visible =
        !hideUnusedGraces ||
        drawing ||
        onPath ||
        position === id ||
        (selection?.kind === "node" && selection.id === id);
      // Keep retained markers and the rest of the overlay attached. Rebuilding
      // everything here restarts tooltip fades and makes the map flash.
      if (visible && !group.hasLayer(marker)) marker.addTo(group);
      else if (!visible && group.hasLayer(marker)) group.removeLayer(marker);
    }
  };
  useLayoutEffect(syncGraceVisibility, [props.hideUnusedGraces, props.drawing]);

  const toLatLng = ([x, y]: Point) =>
    map.current!.unproject([x, y], latest.current.info.maxZoom);
  const placeAllSteps = () =>
    map.current &&
    placeSteps(map.current, steps.current, latest.current.info.maxZoom);
  const updateLabels = () => {
    const zoom = map.current!.getZoom();
    for (const { marker, always, minZoom } of labels.current) {
      const tooltip = marker.getTooltip()!;
      const permanent = always || (minZoom !== null && zoom >= minZoom);
      if (tooltip.options.permanent !== permanent)
        marker.unbindTooltip().bindTooltip(tooltip.getContent()!, {
          ...tooltip.options,
          permanent,
        });
    }
  };
  const toPoint = (latLng: L.LatLng): Point => {
    const p = map.current!.project(latLng, latest.current.info.maxZoom);
    return [Math.round(p.x), Math.round(p.y)];
  };

  // Create the map once.
  useEffect(() => {
    const instance = L.map(container.current!, {
      crs: L.CRS.Simple,
      minZoom: 1,
      maxZoom: 8,
      // Fractional zoom, so pinch and wheel zoom glide instead of stepping.
      zoomSnap: 0,
      zoomDelta: 0.5,
      scrollWheelZoom: false,
      attributionControl: false,
      doubleClickZoom: false,
      keyboard: false,
    });
    map.current = instance;
    overlay.current = L.layerGroup().addTo(instance);
    rubberBand.current = L.polyline([], {
      color: "#eee9db",
      dashArray: "4 6",
      weight: 2,
      interactive: false,
    });
    instance.on("click", (event: L.LeafletMouseEvent) =>
      latest.current.onMapClick(toPoint(event.latlng)),
    );
    instance.on("mousemove", (event: L.LeafletMouseEvent) => {
      const { draft, nodes, layer } = latest.current;
      const from = draft && nodes.find((n) => n.id === draft.from);
      if (!from || from.layer !== layer) return;
      rubberBand.current!.setLatLngs([
        toLatLng([from.x, from.y]),
        event.latlng,
      ]);
    });
    const report = () => {
      const center = toPoint(instance.getCenter());
      latest.current.onViewChange({
        layer: latest.current.layer,
        x: center[0],
        y: center[1],
        zoom: instance.getZoom(),
      });
    };
    // Gestures move the map every frame; report the view once it settles.
    let reportTimer: ReturnType<typeof setTimeout> | undefined;
    instance.on("moveend zoomend", () => {
      clearTimeout(reportTimer);
      reportTimer = setTimeout(report, 150);
    });
    instance.on("move zoom resize", placeAllSteps);
    instance.on("zoomend", updateLabels);
    const disableGestures = enableGestures(instance);
    return () => {
      clearTimeout(reportTimer);
      disableGestures();
      instance.remove();
      map.current = null;
    };
  }, []);

  // Swap tiles when the layer changes.
  const { layer, info } = props;
  useEffect(() => {
    const instance = map.current!;
    const { view } = latest.current;
    const bounds = L.latLngBounds(
      toLatLng([0, info.size]),
      toLatLng([info.size, 0]),
    );
    const tiles = L.tileLayer(`/game-data/map/${layer}/{z}/{x}/{y}.jpg`, {
      tileSize: info.tileSize,
      maxNativeZoom: info.maxZoom,
      minNativeZoom: 0,
      noWrap: true,
      bounds,
    }).addTo(instance);
    instance.setMaxBounds(bounds.pad(0.25));
    instance.setView(toLatLng([view.x, view.y]), view.zoom, { animate: false });
    return () => {
      tiles.remove();
    };
  }, [layer, info]);

  // Redraw nodes, edges and the path being drawn.
  const {
    nodes,
    edges,
    selection,
    draft,
    editable,
    graceNames,
    language,
    data,
    undiscovered,
    position,
    route,
    stops,
    routeNodes,
    highlight,
  } = props;
  useEffect(() => {
    const group = overlay.current!;
    group.clearLayers();
    graceMarkers.current = [];
    steps.current = [];
    labels.current = [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    // A grace with a note is on its note path, so it shows like a pathed grace.
    const pathNodes = new Set(edges.flatMap((edge) => edge.nodes));
    const notes = new Map(
      edges.filter((e) => !isWalked(e)).map((e) => [e.nodes[0], e]),
    );
    const portalEnds = new Set<string>();

    for (const edge of edges) {
      // Note paths are drawn as notes beside their pins, below.
      if (!isWalked(edge)) continue;
      // Pins a path jumps between layers at are marked instead of drawn.
      edge.nodes.forEach((id, i) => {
        const [a, b] = [byId.get(edge.nodes[i - 1]), byId.get(id)];
        if (a && b && a.layer !== b.layer) {
          portalEnds.add(a.id);
          portalEnds.add(b.id);
        }
      });
      const runs = edgeRuns(edge, byId, layer);
      // A waygate may have only isolated endpoints on this layer. Its number
      // still belongs here, even though the jump itself has no drawn line.
      const stepRuns = runs.length
        ? runs
        : edge.nodes.flatMap((id): Point[][] => {
            const node = byId.get(id);
            return node?.layer === layer ? [[[node.x, node.y]]] : [];
          });
      if (!stepRuns.length) continue;
      const selected = selection?.kind === "edge" && selection.id === edge.id;
      const highlighted = highlight === edge.id;
      const style = pathStyle(edge);
      const select = (event: L.LeafletEvent) => {
        L.DomEvent.stop(event);
        latest.current.onEdgeClick(edge.id);
      };
      for (const points of runs) {
        const line = points.map(toLatLng);
        if (highlighted)
          L.polyline(line, {
            color: "#ffd84a",
            weight: style.weight + 10,
            opacity: 0.85,
            lineCap: "round",
            interactive: false,
          }).addTo(group);
        else if (selected)
          L.polyline(line, {
            color: "#fff",
            weight: style.weight + 6,
            opacity: 0.5,
            interactive: false,
          }).addTo(group);
        L.polyline(line, { ...style, opacity: 0.95 })
          .on("click", select)
          .addTo(group);
        if (edge.oneWay)
          addArrow(
            group,
            line[line.length - 2],
            line[line.length - 1],
            style.color,
          );
      }
      // One step number per path, placed by placeSteps. The note, when shown,
      // sits under it and moves with it.
      const note =
        edge.showNote && edge.note.trim()
          ? `<span class="step-note" style="border-color: ${style.color}">${escapeHtml(edge.note)}</span>`
          : "";
      const marker = L.marker(toLatLng(stepRuns[0][0]), {
        icon: L.divIcon({
          className: highlighted ? "path-step is-highlighted" : "path-step",
          html: `<span class="step-number">${edge.step}</span>${note}`,
          iconSize: [0, 0],
        }),
        keyboard: false,
        zIndexOffset: highlighted ? 1000 : 0,
      })
        .on("click", select)
        .addTo(group);
      steps.current.push({ marker, runs: stepRuns });
    }
    placeAllSteps();

    for (const line of route) {
      if (line.layer !== layer) continue;
      L.polyline(line.points.map(toLatLng), {
        color: "#7fd1ff",
        weight: 7,
        opacity: line.guess ? 0.6 : 0.75,
        dashArray: line.guess ? "2 10" : undefined,
        lineCap: "round",
        interactive: false,
      }).addTo(group);
    }

    if (draft && byId.get(draft.from)?.layer === layer)
      rubberBand.current!.addTo(group);
    else rubberBand.current!.setLatLngs([]);

    for (const node of nodes) {
      if (node.layer !== layer) continue;
      const selected = selection?.kind === "node" && selection.id === node.id;
      const items = pinItems(node);
      const itemNames = items.flatMap((id) => {
        const item = data.byId.get(id);
        return item ? [item.name[language]] : [];
      });
      const name =
        itemNames.length > 1
          ? [node.label, ...itemNames].filter(Boolean).join(" · ")
          : displayName(data, node, language);
      // A pin with items shows the first one's icon, and how many more it holds.
      const first = items.length ? data.byId.get(items[0]) : undefined;
      const image =
        (first && isItem(first) && first.icon
          ? `<img src="${iconUrl(first.icon)}" alt="">`
          : items.length
            ? NODE_SYMBOL.item
            : NODE_SYMBOL[node.kind]) +
        (items.length > 1
          ? `<span class="item-count">+${items.length - 1}</span>`
          : "");
      const classes = [
        "map-node",
        `map-node--${node.kind}`,
        items.length > 0 && "has-items",
        selected && "is-selected",
        portalEnds.has(node.id) && "has-portal",
        draft?.from === node.id && "is-draft-start",
        undiscovered.has(node.id) && "is-undiscovered",
        position === node.id && "is-position",
      ];
      const stop = stops.get(node.id);
      const marker = L.marker(toLatLng([node.x, node.y]), {
        icon: L.divIcon({
          className: classes.filter(Boolean).join(" "),
          html:
            stop === undefined
              ? image
              : `${image}<span class="stop-badge">${stop}</span>`,
          iconSize: undefined,
        }),
        draggable: editable && !isGameGrace(node.id),
        keyboard: false,
        riseOnHover: true,
      })
        .on("click", (event) => {
          L.DomEvent.stop(event);
          latest.current.onNodeClick(node.id);
        })
        .on("dragend", (event) =>
          latest.current.onNodeMove(
            node.id,
            toPoint((event.target as L.Marker).getLatLng()),
          ),
        );
      // The pin's note, when shown, sits just below it.
      const note = notes.get(node.id);
      if (note?.showNote && note.note.trim())
        L.marker(toLatLng([node.x, node.y]), {
          icon: L.divIcon({
            className: "pin-note",
            html: `<span>${escapeHtml(note.note)}</span>`,
            iconSize: [0, 0],
          }),
          keyboard: false,
        })
          .on("click", (event) => {
            L.DomEvent.stop(event);
            latest.current.onNodeClick(node.id);
          })
          .addTo(group);
      if (node.kind === "grace")
        graceMarkers.current.push({
          id: node.id,
          marker,
          onPath: pathNodes.has(node.id),
        });
      else marker.addTo(group);
      if (name) {
        const always =
          selected ||
          position === node.id ||
          stops.has(node.id) ||
          routeNodes.has(node.id);
        const minZoom =
          node.kind === "grace"
            ? graceNames === "hover"
              ? null
              : graceNames === "always"
                ? 0
                : GRACE_LABEL_ZOOM
            : node.kind === "junction"
              ? null
              : LABEL_ZOOM;
        marker.bindTooltip(escapeHtml(name), {
          permanent:
            always || (minZoom !== null && map.current!.getZoom() >= minZoom),
          direction: "right",
          offset: [10, 0],
          className: `node-label node-label--${node.kind}`,
        });
        labels.current.push({ marker, always, minZoom });
      }
    }
    syncGraceVisibility();
  }, [
    nodes,
    edges,
    selection,
    draft,
    editable,
    graceNames,
    language,
    data,
    layer,
    undiscovered,
    position,
    route,
    stops,
    routeNodes,
    highlight,
  ]);

  // Pan to a node selected elsewhere (for example the far end of a waygate).
  useEffect(() => {
    if (selection?.kind !== "node") return;
    const node = nodes.find((n) => n.id === selection.id);
    const instance = map.current!;
    if (
      node?.layer === layer &&
      !instance.getBounds().contains(toLatLng([node.x, node.y]))
    )
      instance.panTo(toLatLng([node.x, node.y]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, layer]);

  return <div ref={container} className="map-canvas" data-testid="map" />;
}

function addArrow(
  group: L.LayerGroup,
  from: L.LatLng,
  to: L.LatLng,
  color: string,
) {
  const mid = L.latLng((from.lat + to.lat) / 2, (from.lng + to.lng) / 2);
  const angle =
    (Math.atan2(-(to.lat - from.lat), to.lng - from.lng) * 180) / Math.PI;
  L.marker(mid, {
    interactive: false,
    icon: L.divIcon({
      className: "edge-arrow",
      html: `<span style="color:${color};transform:rotate(${angle}deg)">➤</span>`,
      iconSize: [16, 16],
    }),
  }).addTo(group);
}

/**
 * Keep each step number on the visible part of its path, or on the screen
 * edge nearest the path when all of it is off screen.
 */
function placeSteps(
  instance: L.Map,
  steps: { marker: L.Marker; runs: Point[][] }[],
  maxZoom: number,
) {
  const { x: width, y: height } = instance.getSize();
  const box = {
    left: STEP_INSET,
    top: STEP_INSET,
    right: width - STEP_INSET,
    bottom: height - STEP_INSET,
  };
  for (const { marker, runs } of steps) {
    const onScreen = runs.map((run) =>
      run.map((p): Point => {
        const { x, y } = instance.latLngToContainerPoint(
          instance.unproject(p, maxZoom),
        );
        return [x, y];
      }),
    );
    const { point, pinned } = placeStep(onScreen, box);
    // Put an isolated portal's number beside its pin so both remain clickable.
    const besidePortal = !pinned && onScreen.every((run) => run.length === 1);
    const labelPoint: Point = besidePortal
      ? [
          Math.min(point[0] + STEP_INSET, box.right),
          Math.max(point[1] - STEP_INSET, box.top),
        ]
      : point;
    marker.setLatLng(instance.containerPointToLatLng(labelPoint));
    marker.getElement()?.classList.toggle("is-pinned", pinned);
  }
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
