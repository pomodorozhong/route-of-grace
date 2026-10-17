import {
  WISHLIST_STATUSES,
  isWalked,
  pinItems,
  type MapDocument,
  type PlayerDocument,
  type WishlistItem,
  type WishlistStatus,
} from "../domain/types";

function changeWishlist(
  player: PlayerDocument,
  profileId: string,
  change: (wishlist: WishlistItem[]) => WishlistItem[],
): PlayerDocument {
  return {
    ...player,
    profiles: player.profiles.map((p) =>
      p.id === profileId ? { ...p, wishlist: change(p.wishlist) } : p,
    ),
  };
}

/** Add an item as needed. An item already on the wishlist is left as it is. */
export const addToWishlist = (
  player: PlayerDocument,
  profileId: string,
  item: string,
): PlayerDocument =>
  changeWishlist(player, profileId, (wishlist) =>
    wishlist.some((w) => w.item === item)
      ? wishlist
      : [...wishlist, { item, status: "needed", note: "" }],
  );

export const updateWishlistItem = (
  player: PlayerDocument,
  profileId: string,
  item: string,
  changes: Partial<Omit<WishlistItem, "item">>,
): PlayerDocument =>
  changeWishlist(player, profileId, (wishlist) =>
    wishlist.map((w) => (w.item === item ? { ...w, ...changes } : w)),
  );

export const removeFromWishlist = (
  player: PlayerDocument,
  profileId: string,
  item: string,
): PlayerDocument =>
  changeWishlist(player, profileId, (wishlist) =>
    wishlist.filter((w) => w.item !== item),
  );

export const countByStatus = (wishlist: WishlistItem[]) =>
  Object.fromEntries(
    WISHLIST_STATUSES.map((status) => [
      status,
      wishlist.filter((w) => w.status === status).length,
    ]),
  ) as Record<WishlistStatus, number>;

/** A wishlist entry with the item pin the walk reaches it at, and that path's step. */
export type WalkEntry = { entry: WishlistItem; pin: string; step: number };

/**
 * The wishlist in walking order: each item by the lowest step of a path
 * through one of its pins. Items with no pin, or a pin on no path, come after
 * in wishlist order.
 */
export function walkOrder(map: MapDocument, wishlist: WishlistItem[]) {
  const steps = new Map<string, number>();
  for (const edge of map.edges.filter(isWalked))
    for (const node of edge.nodes)
      steps.set(node, Math.min(steps.get(node) ?? Infinity, edge.step));
  const onRoute: WalkEntry[] = [];
  const offRoute: { entry: WishlistItem; pin: string | null }[] = [];
  for (const entry of wishlist) {
    const pins = map.nodes.filter((n) => pinItems(n).includes(entry.item));
    const reached = pins
      .filter((n) => steps.has(n.id))
      .map((n) => ({ entry, pin: n.id, step: steps.get(n.id)! }))
      .sort((a, b) => a.step - b.step)[0];
    if (reached) onRoute.push(reached);
    else offRoute.push({ entry, pin: pins[0]?.id ?? null });
  }
  onRoute.sort((a, b) => a.step - b.step);
  return { onRoute, offRoute };
}
