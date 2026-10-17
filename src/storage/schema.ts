import {
  GRACE_NAME_MODES,
  LANGUAGES,
  LAYERS,
  NODE_KINDS,
  PATH_COLORS,
  PATH_LINES,
  STEP_SIZES,
  WISHLIST_STATUSES,
  type DocumentKey,
  type DocumentName,
  type Documents,
  type MapDocument,
  type PlayerDocument,
  type Progress,
  type RouteRules,
  type SaveLink,
  type WishlistItem,
} from "../domain/types.ts";

function hasExactKeys(
  value: unknown,
  required: string[],
  optional: string[] = [],
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

const isCoordinate = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value);
const includes = <T>(list: readonly T[], value: unknown) =>
  list.includes(value as T);

/** A game grace's catalog id, which paths use to end at it. */
const GRACE_ID = /^grace\/\d+$/;

function checkMap(value: unknown): value is MapDocument {
  if (!hasExactKeys(value, ["schemaVersion", "nodes", "edges"])) return false;
  const v = value as MapDocument;
  if (
    v.schemaVersion !== MAP_VERSION ||
    !Array.isArray(v.nodes) ||
    !Array.isArray(v.edges)
  )
    return false;
  const nodeIds = new Set<string>();
  for (const n of v.nodes) {
    if (
      !hasExactKeys(
        n,
        ["id", "layer", "x", "y", "kind", "label", "ref"],
        ["items"],
      ) ||
      typeof n.id !== "string" ||
      GRACE_ID.test(n.id) ||
      // Graces are game data, shown on every map; a map stores none.
      n.kind === "grace" ||
      nodeIds.has(n.id) ||
      !includes(LAYERS, n.layer) ||
      !isCoordinate(n.x) ||
      !isCoordinate(n.y) ||
      !includes(NODE_KINDS, n.kind) ||
      typeof n.label !== "string" ||
      !(n.ref === null || typeof n.ref === "string") ||
      !(
        n.items === undefined ||
        (Array.isArray(n.items) &&
          n.items.every(
            (item, i) =>
              typeof item === "string" && n.items!.indexOf(item) === i,
          ))
      )
    )
      return false;
    nodeIds.add(n.id);
  }
  const edgeIds = new Set<string>();
  const steps = new Set<number>();
  const noted = new Set<unknown>();
  const walked = v.edges.filter(
    (e) => e && typeof e === "object" && e.step !== null,
  ).length;
  const end = (id: unknown) =>
    typeof id === "string" && (nodeIds.has(id) || GRACE_ID.test(id));
  return v.edges.every((e) => {
    // A note path: one pin, no step, at most one per pin.
    const note =
      e.step === null &&
      Array.isArray(e.nodes) &&
      e.nodes.length === 1 &&
      !noted.has(e.nodes[0]);
    const ok =
      hasExactKeys(e, [
        "id",
        "nodes",
        "color",
        "line",
        "oneWay",
        "note",
        "showNote",
        "step",
      ]) &&
      typeof e.id === "string" &&
      !edgeIds.has(e.id) &&
      Array.isArray(e.nodes) &&
      (note || e.nodes.length >= 2) &&
      e.nodes.every((id, i) => end(id) && id !== e.nodes[i - 1]) &&
      includes(PATH_COLORS, e.color) &&
      includes(PATH_LINES, e.line) &&
      typeof e.oneWay === "boolean" &&
      typeof e.showNote === "boolean" &&
      typeof e.note === "string" &&
      // Walked paths' steps run 1..N with no gaps or repeats.
      (note ||
        (Number.isInteger(e.step) &&
          e.step! >= 1 &&
          e.step! <= walked &&
          !steps.has(e.step!)));
    edgeIds.add(e.id);
    if (note) noted.add(e.nodes[0]);
    else steps.add(e.step!);
    return ok;
  });
}

function checkWishlist(value: unknown): value is WishlistItem[] {
  if (!Array.isArray(value)) return false;
  const items = new Set<string>();
  return value.every((w) => {
    const ok =
      hasExactKeys(w, ["item", "status", "note"]) &&
      typeof w.item === "string" &&
      !items.has(w.item) &&
      includes(WISHLIST_STATUSES, w.status) &&
      typeof w.note === "string";
    items.add(w.item);
    return ok;
  });
}

function checkProgress(value: unknown): value is Progress {
  if (!hasExactKeys(value, ["flags", "position"])) return false;
  const v = value as Progress;
  return (
    Array.isArray(v.flags) &&
    v.flags.every(
      (flag, i) =>
        Number.isSafeInteger(flag) &&
        flag >= 0 &&
        (i === 0 || flag > v.flags[i - 1]),
    ) &&
    (v.position === null || typeof v.position === "string")
  );
}

function checkRules(value: unknown): value is RouteRules {
  if (!hasExactKeys(value, ["dlc"])) return false;
  return typeof (value as RouteRules).dlc === "boolean";
}

function checkSaveLink(value: unknown): value is SaveLink | null {
  if (value === null) return true;
  if (!hasExactKeys(value, ["steamId", "slot", "name"])) return false;
  const v = value as SaveLink;
  return (
    typeof v.steamId === "string" &&
    /^\d{1,20}$/.test(v.steamId) &&
    Number.isInteger(v.slot) &&
    v.slot >= 0 &&
    v.slot < 10 &&
    typeof v.name === "string"
  );
}

function checkPlayer(value: unknown): value is PlayerDocument {
  if (
    !hasExactKeys(value, [
      "schemaVersion",
      "language",
      "view",
      "stepSize",
      "hideUnusedGraces",
      "graceNames",
      "activeProfile",
      "profiles",
    ])
  )
    return false;
  const v = value as PlayerDocument;
  const ids = new Set<string>();
  return (
    v.schemaVersion === PLAYER_VERSION &&
    includes(LANGUAGES, v.language) &&
    includes(STEP_SIZES, v.stepSize) &&
    typeof v.hideUnusedGraces === "boolean" &&
    includes(GRACE_NAME_MODES, v.graceNames) &&
    hasExactKeys(v.view, ["layer", "x", "y", "zoom"]) &&
    includes(LAYERS, v.view.layer) &&
    [v.view.x, v.view.y, v.view.zoom].every(isCoordinate) &&
    Array.isArray(v.profiles) &&
    v.profiles.length > 0 &&
    v.profiles.every((p) => {
      const ok =
        hasExactKeys(p, [
          "id",
          "name",
          "goal",
          "constraints",
          "rules",
          "wishlist",
          "progress",
          "save",
        ]) &&
        typeof p.id === "string" &&
        PROFILE_ID.test(p.id) &&
        !ids.has(p.id) &&
        [p.name, p.goal, p.constraints].every((t) => typeof t === "string") &&
        checkRules(p.rules) &&
        checkWishlist(p.wishlist) &&
        checkProgress(p.progress) &&
        checkSaveLink(p.save);
      ids.add(p.id);
      return ok;
    }) &&
    ids.has(v.activeProfile)
  );
}

export const FIRST_PROFILE_ID = "profile-1";
const PLAYER_VERSION = 10;
const MAP_VERSION = 4;
const DEFAULT_STEP_SIZE = "medium";
const PROFILE_ID = /^[a-z0-9-]{1,64}$/;

export const mapKey = (profile: string): DocumentKey => `maps/${profile}`;

/** Which document a storage key holds, or null for anything else. */
export function documentNameOf(key: string): DocumentName | null {
  if (key === "player") return "player";
  const match = /^maps\/(.+)$/.exec(key);
  return match && PROFILE_ID.test(match[1]) ? "map" : null;
}
const firstProfile = () => ({
  id: FIRST_PROFILE_ID,
  name: "",
  goal: "",
  constraints: "",
  rules: { dlc: true },
  wishlist: [],
  progress: { flags: [], position: null },
  save: null,
});

/**
 * Bring a document saved by an older version up to the current schema.
 * Anything unrecognised is returned unchanged, so validation rejects it.
 */
export function upgradeDocument(name: DocumentName, value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (name === "map") return upgradeMap(value);
  let v = value as {
    schemaVersion: unknown;
    profiles?: unknown;
    stepSize?: unknown;
    hideUnusedGraces?: unknown;
    graceNames?: unknown;
  };
  if (
    v.schemaVersion === 1 &&
    hasExactKeys(v, ["schemaVersion", "language", "view"])
  )
    // Version 1 had no profiles: everything so far becomes the first playthrough.
    return {
      ...v,
      schemaVersion: PLAYER_VERSION,
      stepSize: DEFAULT_STEP_SIZE,
      hideUnusedGraces: false,
      graceNames: "auto",
      activeProfile: FIRST_PROFILE_ID,
      profiles: [firstProfile()],
    };
  if (
    typeof v.schemaVersion === "number" &&
    v.schemaVersion >= 2 &&
    v.schemaVersion < PLAYER_VERSION &&
    Array.isArray(v.profiles)
  ) {
    // Later versions added the wishlist (3), progress (4), save link (5),
    // routing rules (6), step number size (7), grace filter (8) and names (9).
    // Version 10 dropped the path types routing avoided, since paths have none.
    const added = firstProfile();
    v = {
      ...v,
      schemaVersion: PLAYER_VERSION,
      stepSize: "stepSize" in v ? v.stepSize : DEFAULT_STEP_SIZE,
      hideUnusedGraces: "hideUnusedGraces" in v ? v.hideUnusedGraces : false,
      graceNames: "graceNames" in v ? v.graceNames : "auto",
      profiles: v.profiles.map((p: unknown) =>
        p && typeof p === "object"
          ? {
              ...p,
              rules: "rules" in p ? withoutAvoid(p.rules) : added.rules,
              wishlist: "wishlist" in p ? p.wishlist : added.wishlist,
              progress: "progress" in p ? p.progress : added.progress,
              save: "save" in p ? p.save : added.save,
            }
          : p,
      ),
    };
  }
  return v;
}

function withoutAvoid(rules: unknown) {
  if (!rules || typeof rules !== "object" || !("avoid" in rules)) return rules;
  const rest: Record<string, unknown> = { ...rules };
  delete rest.avoid;
  return rest;
}

type MapV1 = {
  schemaVersion: 1;
  nodes: { id: string; layer: string }[];
  edges: {
    id: string;
    from: string;
    to: string;
    type: string;
    points: [number, number][];
    note: string;
  }[];
};

function upgradeMap(value: object): unknown {
  const v = value as { schemaVersion: unknown };
  if (v.schemaVersion === 1)
    return upgradeMapV3(upgradeMapV2(upgradeMapV1(v as MapV1)));
  if (v.schemaVersion === 2) return upgradeMapV3(upgradeMapV2(v));
  if (v.schemaVersion === 3) return upgradeMapV3(v);
  return v;
}

function upgradeMapV1(v: MapV1): unknown {
  if (!Array.isArray(v.nodes) || !Array.isArray(v.edges)) return v;
  // Version 2 made a path one numbered line through pins. A version 1 path
  // ran between two nodes, possibly with bends; its bends become junctions,
  // and paths are numbered in file order.
  const layerOf = new Map(v.nodes.map((n) => [n?.id, n?.layer]));
  const bends: unknown[] = [];
  const edges = v.edges.map((e, i) => {
    if (!e || typeof e !== "object" || !Array.isArray(e.points)) return e;
    const { from, to, points, ...rest } = e;
    // A bend between two game graces has no known layer, so it is dropped.
    const layer = layerOf.get(from) ?? layerOf.get(to);
    const ids = layer
      ? points.map(([x, y], k) => {
          const id = `${e.id}-bend-${k + 1}`;
          bends.push({
            id,
            layer,
            x,
            y,
            kind: "junction",
            label: "",
            ref: null,
          });
          return id;
        })
      : [];
    return { ...rest, nodes: [from, ...ids, to], step: i + 1 };
  });
  return {
    ...v,
    schemaVersion: 2,
    nodes: [...v.nodes, ...bends],
    edges,
  };
}

type MapV2 = { schemaVersion: 2; nodes: unknown; edges: unknown };

/** How each version 2 path type looked; later versions keep the look. */
const TYPE_LOOK: Record<string, { color: string; line: string }> = {
  road: { color: "gold", line: "solid" },
  torrent: { color: "green", line: "solid" },
  foot: { color: "white", line: "dashed" },
  "one-way-drop": { color: "red", line: "dashed" },
  lift: { color: "blue", line: "solid" },
  waygate: { color: "purple", line: "dashed" },
  spiritspring: { color: "teal", line: "solid" },
  "requires-key": { color: "gold", line: "dashed" },
  "requires-flag": { color: "pink", line: "dashed" },
};

function upgradeMapV2(value: unknown): unknown {
  const v = value as MapV2;
  if (!v || v.schemaVersion !== 2 || !Array.isArray(v.edges)) return v;
  // Version 3 dropped path types: a path keeps its look, and the types that
  // changed routing became options (one way, teleport).
  const edges = v.edges.map((e: unknown) => {
    if (!e || typeof e !== "object" || !("type" in e)) return e;
    const { type, ...rest } = e as { type: unknown };
    const look = typeof type === "string" ? TYPE_LOOK[type] : undefined;
    if (!look) return e;
    return {
      ...rest,
      ...look,
      oneWay: type === "one-way-drop",
      teleport: type === "waygate",
      showNote: false,
    };
  });
  return { ...v, schemaVersion: 3, edges };
}

function upgradeMapV3(value: unknown): unknown {
  const v = value as { schemaVersion: unknown; edges: unknown };
  if (!v || v.schemaVersion !== 3 || !Array.isArray(v.edges)) return v;
  // Version 4 dropped the teleport option: a hop between layers is a jump,
  // and a waygate within one layer is an ordinary path.
  const edges = v.edges.map((e: unknown) => {
    if (!e || typeof e !== "object" || !("teleport" in e)) return e;
    const rest: Record<string, unknown> = { ...e };
    delete rest.teleport;
    return rest;
  });
  return { ...v, schemaVersion: MAP_VERSION, edges };
}

const checks: {
  [N in DocumentName]: (value: unknown) => value is Documents[N];
} = {
  map: checkMap,
  player: checkPlayer,
};

export function validDocument<N extends DocumentName>(
  name: N,
  value: unknown,
): value is Documents[N] {
  try {
    return checks[name](value);
  } catch {
    return false;
  }
}

export const initialDocuments = (): Documents => ({
  map: { schemaVersion: MAP_VERSION, nodes: [], edges: [] },
  player: {
    schemaVersion: PLAYER_VERSION,
    language: "en",
    view: { layer: "overworld", x: 5248, y: 5248, zoom: 3 },
    stepSize: DEFAULT_STEP_SIZE,
    hideUnusedGraces: false,
    graceNames: "auto",
    activeProfile: FIRST_PROFILE_ID,
    profiles: [firstProfile()],
  },
});
