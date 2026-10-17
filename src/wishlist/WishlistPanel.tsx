import { useState } from "react";
import {
  WISHLIST_STATUSES,
  pinItems,
  type Language,
  type MapDocument,
  type PlayerDocument,
  type WishlistStatus,
} from "../domain/types";
import type { Translate } from "../i18n/translation";
import { iconUrl, isItem, searchCatalog, type GameData } from "../map/catalog";
import { activeProfile } from "../profiles/profiles";
import {
  addToWishlist,
  countByStatus,
  removeFromWishlist,
  updateWishlistItem,
} from "./wishlist";

export const STATUS_NAMES: Record<WishlistStatus, string> = {
  needed: "Needed",
  acquired: "Acquired",
  skipped: "Skipped",
};

type Props = {
  t: Translate;
  language: Language;
  data: GameData;
  player: PlayerDocument;
  setPlayer(player: PlayerDocument): void;
};

/** The active playthrough's wishlist: add items, set their status and notes. */
export function WishlistPanel({
  t,
  language,
  data,
  player,
  setPlayer,
  doc,
  showNode,
}: Props & { doc: MapDocument; showNode(id: string): void }) {
  const profile = activeProfile(player);
  const [query, setQuery] = useState("");
  const listed = new Set(profile.wishlist.map((w) => w.item));
  const results = searchCatalog(data.catalog.items, query, 10).filter(
    (item) => !listed.has(item.id),
  );
  const counts = countByStatus(profile.wishlist);
  const other = language === "en" ? "zh-TW" : "en";

  return (
    <section className="space-y-2" aria-label={t("Wishlist")}>
      <h3 className="label">{t("Wishlist")}</h3>
      {profile.wishlist.length > 0 && (
        <p className="text-xs text-muted">
          {t("{needed} needed · {acquired} acquired · {skipped} skipped", {
            ...counts,
          })}
        </p>
      )}
      <input
        className="field w-full"
        aria-label={t("Add to wishlist")}
        placeholder={t("Add an item: search English or 中文")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.length > 0 && (
        <ul className="max-h-64 overflow-y-auto rounded border border-line">
          {results.map((item) => (
            <li key={item.id}>
              <button
                className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-ink"
                onClick={() => {
                  setPlayer(addToWishlist(player, profile.id, item.id));
                  setQuery("");
                }}
              >
                {item.icon && (
                  <img
                    src={iconUrl(item.icon)}
                    alt=""
                    className="size-8"
                    loading="lazy"
                  />
                )}
                <span className="min-w-0">
                  <span className="block truncate">{item.name[language]}</span>
                  <span className="block truncate text-xs text-muted">
                    {item.name[other]}
                    {item.dlc && ` · ${t("DLC")}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ul className="space-y-3">
        {profile.wishlist.map((entry) => {
          const item = data.byId.get(entry.item);
          const pin = doc.nodes.find((n) => pinItems(n).includes(entry.item));
          return (
            <li
              key={entry.item}
              className={`space-y-1 ${entry.status === "needed" ? "" : "opacity-70"}`}
            >
              <div className="flex items-center gap-2">
                {item && isItem(item) && item.icon && (
                  <img
                    src={iconUrl(item.icon)}
                    alt=""
                    className="size-8 rounded bg-ink"
                    loading="lazy"
                  />
                )}
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${entry.status === "acquired" ? "line-through" : ""}`}
                >
                  {item?.name[language] ?? entry.item}
                </span>
                <select
                  aria-label={t("Status")}
                  className="field"
                  value={entry.status}
                  onChange={(e) =>
                    setPlayer(
                      updateWishlistItem(player, profile.id, entry.item, {
                        status: e.target.value as WishlistStatus,
                      }),
                    )
                  }
                >
                  {WISHLIST_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {t(STATUS_NAMES[status])}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                className="field w-full text-sm"
                rows={2}
                aria-label={t("Your note")}
                placeholder={t("Your note")}
                value={entry.note}
                onChange={(e) =>
                  setPlayer(
                    updateWishlistItem(player, profile.id, entry.item, {
                      note: e.target.value,
                    }),
                  )
                }
              />
              <div className="flex gap-3 text-xs">
                {pin ? (
                  <button className="link" onClick={() => showNode(pin.id)}>
                    {t("Show on map")}
                  </button>
                ) : (
                  <span className="text-muted">
                    {t("Not on the map yet: place an item pin and link it.")}
                  </span>
                )}
                <button
                  className="link ml-auto"
                  onClick={() =>
                    setPlayer(
                      removeFromWishlist(player, profile.id, entry.item),
                    )
                  }
                >
                  {t("Remove")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Wishlist status of the item an item pin is linked to. */
export function PinWishlist({
  t,
  player,
  setPlayer,
  item,
  estimate,
}: Omit<Props, "data" | "language"> & {
  item: string;
  /** What adding this pin would cost the route, already worded. */
  estimate: string;
}) {
  const profile = activeProfile(player);
  const entry = profile.wishlist.find((w) => w.item === item);
  if (!entry)
    return (
      <div className="space-y-1">
        <button
          className="chip"
          onClick={() => setPlayer(addToWishlist(player, profile.id, item))}
        >
          {t("Add to wishlist")}
        </button>
        <p className="text-xs text-muted">{estimate}</p>
      </div>
    );
  return (
    <label className="block space-y-1">
      <span className="label">{t("Wishlist")}</span>
      <select
        className="field w-full"
        value={entry.status}
        onChange={(e) =>
          setPlayer(
            updateWishlistItem(player, profile.id, item, {
              status: e.target.value as WishlistStatus,
            }),
          )
        }
      >
        {WISHLIST_STATUSES.map((status) => (
          <option key={status} value={status}>
            {t(STATUS_NAMES[status])}
          </option>
        ))}
      </select>
    </label>
  );
}
