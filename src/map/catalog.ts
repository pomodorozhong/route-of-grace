import type { LayerId, Language, Localized, NodeKind } from "../domain/types";

export type CatalogItem = {
  id: string;
  type: "weapon" | "armor" | "talisman" | "goods" | "ash_of_war";
  paramId: number;
  name: Localized;
  dlc: boolean;
  icon: number | null;
  goodsType?: number;
};
export type CatalogName = { id: string; name: Localized; dlc: boolean };
/** A Site of Grace, positioned in native map pixels of its layer. */
export type CatalogGrace = CatalogName & {
  layer: LayerId;
  x: number;
  y: number;
  /** Event flag set once the grace is discovered. */
  flag: number;
  /** Inside a legacy dungeon, cave or catacomb, projected onto the open-world map. */
  legacy: boolean;
};
export type Catalog = {
  items: CatalogItem[];
  graces: CatalogGrace[];
  places: CatalogName[];
  npcs: CatalogName[];
};
export type MapLayerInfo = {
  mapId: string;
  tileSize: number;
  maxZoom: number;
  size: number;
};
export type GameData = {
  catalog: Catalog;
  layers: Record<LayerId, MapLayerInfo>;
  byId: Map<string, CatalogItem | CatalogName>;
  /** Places with the same English name appear under several ids; search shows each name once. */
  uniquePlaces: CatalogName[];
  /** The "discovered" event flag of each grace, by catalog id. */
  graceFlags: Map<string, number>;
};

export async function loadGameData(
  request: typeof fetch = fetch,
): Promise<GameData> {
  const [catalog, layers] = await Promise.all(
    ["/game-data/catalog.json", "/game-data/map/index.json"].map(
      async (url) => {
        const response = await request(url);
        if (!response.ok) throw new Error(`${url}: ${response.status}`);
        return response.json();
      },
    ),
  );
  const byId = new Map<string, CatalogItem | CatalogName>();
  for (const entry of [
    ...catalog.items,
    ...catalog.graces,
    ...catalog.places,
    ...catalog.npcs,
  ])
    byId.set(entry.id, entry);
  const seen = new Set<string>();
  const uniquePlaces = (catalog as Catalog).places.filter(
    (p) => !seen.has(p.name.en) && seen.add(p.name.en),
  );
  const graceFlags = new Map(
    (catalog as Catalog).graces.map((g) => [g.id, g.flag]),
  );
  return { catalog, layers, byId, uniquePlaces, graceFlags };
}

export const iconUrl = (icon: number) => `/game-data/icons/${icon}.webp`;
export const isItem = (
  entry: CatalogItem | CatalogName,
): entry is CatalogItem => "type" in entry;

/** Catalog entries a node of this kind can refer to. */
export function refCandidates(
  data: GameData,
  kind: NodeKind,
): (CatalogItem | CatalogName)[] {
  if (kind === "item") return data.catalog.items;
  if (kind === "entrance") return data.uniquePlaces;
  return [];
}

const fold = (text: string) => text.normalize("NFKC").toLowerCase();

/** Match either language; English matches at a word start rank first. */
export function searchCatalog<T extends { name: Localized }>(
  entries: T[],
  query: string,
  limit = 30,
): T[] {
  const q = fold(query.trim());
  if (!q) return [];
  const scored: [number, T][] = [];
  for (const entry of entries) {
    const en = fold(entry.name.en);
    const zh = fold(entry.name["zh-TW"]);
    let score = -1;
    if (en === q || zh === q) score = 0;
    else if (en.startsWith(q) || zh.startsWith(q)) score = 1;
    else if (en.includes(` ${q}`)) score = 2;
    else if (en.includes(q) || zh.includes(q)) score = 3;
    if (score >= 0) scored.push([score, entry]);
  }
  return scored
    .sort((a, b) => a[0] - b[0] || a[1].name.en.length - b[1].name.en.length)
    .slice(0, limit)
    .map(([, entry]) => entry);
}

/** A node's name: its linked place or first item, else the player's label. */
export function displayName(
  data: GameData | null,
  node: { ref: string | null; label: string; kind: NodeKind; items?: string[] },
  language: Language,
): string {
  const id = node.ref ?? node.items?.[0];
  const entry = id ? data?.byId.get(id) : undefined;
  return entry?.name[language] || node.label;
}
