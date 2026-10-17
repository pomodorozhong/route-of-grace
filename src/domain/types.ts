export type Language = "en" | "zh-TW";
export const LANGUAGES: Language[] = ["en", "zh-TW"];
export type Localized = Record<Language, string>;

export const LAYERS = [
  "overworld",
  "underground",
  "dlc",
  "dlc-underground",
] as const;
export type LayerId = (typeof LAYERS)[number];

export const NODE_KINDS = ["grace", "junction", "item", "entrance"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const PATH_COLORS = [
  "gold",
  "green",
  "white",
  "red",
  "blue",
  "purple",
  "teal",
  "pink",
] as const;
export type PathColor = (typeof PATH_COLORS)[number];
export const PATH_LINES = ["solid", "dashed"] as const;
export type PathLine = (typeof PATH_LINES)[number];

export type Point = [x: number, y: number];

/** A place on the map, in native map pixels of its layer. */
export type MapNode = {
  id: string;
  layer: LayerId;
  x: number;
  y: number;
  kind: NodeKind;
  /** Player-written label, kept as written. */
  label: string;
  /** Catalog id (for example "place/76100" or "weapon/1000000"), or null. */
  ref: string | null;
  /**
   * Catalog ids of the items picked up here, in the order added. Missing means
   * none. Older maps mark an item's place with the "item" kind and its `ref`
   * instead; `pinItems` reads both.
   */
  items?: string[];
};

/** The items picked up at a pin, from its item list or an older map's item pin. */
export const pinItems = (node: MapNode): string[] =>
  node.items ?? (node.kind === "item" && node.ref !== null ? [node.ref] : []);

/**
 * A path the player drew: one line through pins, in drawing order, with one
 * step number. A path through a single pin, with no step, is that pin's note
 * path: it holds the pin's note, isn't drawn as a line or walked, and each pin
 * has at most one. A pin can be a game grace by its catalog id ("grace/<row>"),
 * which the map shows without storing. A hop between pins on two layers is a
 * jump, such as a waygate: it isn't drawn, and the route planner costs it as
 * a short fixed distance.
 */
export type MapEdge = {
  id: string;
  /** The pins the line runs through, in order: at least two, none twice in a row. */
  nodes: string[];
  color: PathColor;
  line: PathLine;
  /** Travelled only in drawing order, such as a drop off a cliff. */
  oneWay: boolean;
  /** Player-written note, such as the key or boss a requirement needs. */
  note: string;
  /** Show the note on the map beside the path. */
  showNote: boolean;
  /**
   * The path's place in the player's walk, shown on the map. Steps run 1..N
   * across the walked paths, with no gaps or repeats. Null on a note path.
   */
  step: number | null;
};

/** A path the player walks: two or more pins and a step. */
export type WalkedPath = MapEdge & { step: number };

export const isWalked = (edge: MapEdge): edge is WalkedPath =>
  edge.step !== null;

/** A profile's own nodes and paths. Game graces are not stored here. */
export type MapDocument = {
  schemaVersion: 4;
  nodes: MapNode[];
  edges: MapEdge[];
};

export type MapView = { layer: LayerId; x: number; y: number; zoom: number };
export const STEP_SIZES = ["small", "medium", "large"] as const;
/** How big path step numbers show on the map. */
export type StepSize = (typeof STEP_SIZES)[number];
export const GRACE_NAME_MODES = ["auto", "hover", "always"] as const;
export type GraceNameMode = (typeof GRACE_NAME_MODES)[number];
export const WISHLIST_STATUSES = ["needed", "acquired", "skipped"] as const;
export type WishlistStatus = (typeof WISHLIST_STATUSES)[number];

/** An item the player wants in this playthrough. */
export type WishlistItem = {
  /** Catalog id of the item, such as "weapon/1000000". Unique within a wishlist. */
  item: string;
  status: WishlistStatus;
  /** Player-written, kept as written. */
  note: string;
};

/** How far the player has got in this playthrough. */
export type Progress = {
  /**
   * Game event flags known to be set: graces discovered (each catalog grace
   * has its flag), and later items picked up and bosses beaten. Sorted.
   */
  flags: number[];
  /** The node on this profile's map where the player is, or null. */
  position: string | null;
};

/** Constraints routing follows. The free-text constraints stay as a note beside them. */
export type RouteRules = {
  /** Whether Shadow of the Erdtree is part of this playthrough. */
  dlc: boolean;
};

/** The game save character a playthrough imports its progress from. */
export type SaveLink = {
  steamId: string;
  /** 0–9. */
  slot: number;
  /** The character's name when linked, to notice a slot reused by another character. */
  name: string;
};

/**
 * One whole route: a playthrough with its own goal, constraints, wishlist,
 * progress and linked save slot. Its map (nodes and paths) is a separate
 * document, `maps/<id>`.
 */
export type Profile = {
  /** Lowercase letters, digits and dashes, since it names the profile's map file. */
  id: string;
  /** Player-written, kept as written. Empty shows as "Untitled playthrough". */
  name: string;
  goal: string;
  constraints: string;
  rules: RouteRules;
  wishlist: WishlistItem[];
  progress: Progress;
  save: SaveLink | null;
};

export type PlayerDocument = {
  schemaVersion: 10;
  language: Language;
  view: MapView;
  stepSize: StepSize;
  /** Hide graces no path on the active profile's map runs through. */
  hideUnusedGraces: boolean;
  graceNames: GraceNameMode;
  activeProfile: string;
  profiles: Profile[];
};

export type Documents = { map: MapDocument; player: PlayerDocument };
export type DocumentName = keyof Documents;
/** Where a document is saved: `player`, or `maps/<profile id>` for a profile's map. */
export type DocumentKey = "player" | `maps/${string}`;
