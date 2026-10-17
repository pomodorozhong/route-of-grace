import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  NODE_KINDS,
  PATH_COLORS,
  pinItems,
  PATH_LINES,
  type Language,
  type LayerId,
  type MapDocument,
  type MapEdge,
  type MapNode,
  type NodeKind,
  type WalkedPath,
} from "../domain/types";
import type { Translate } from "../i18n/translation";
import {
  displayName,
  iconUrl,
  isItem,
  refCandidates,
  searchCatalog,
  type CatalogItem,
  type CatalogName,
  type GameData,
} from "./catalog";
import {
  inStepOrder,
  newId,
  newPath,
  notePath,
  type EdgeChanges,
  type MapAction,
} from "./editing";
import { isGameGrace } from "./graces";
import type { Selection } from "./MapCanvas";
import { LAYER_NAMES, NODE_KIND_NAMES, PATH_COLOR_NAMES } from "./labels";
import { PATH_COLOR, pathStyle } from "./style";

type Props = {
  t: Translate;
  language: Language;
  data: GameData;
  doc: MapDocument;
  selection: Selection;
  layer: LayerId;
  edit(action: MapAction): void;
  select(selection: Selection): void;
  showNode(id: string): void;
  /** Point out a path on the map, or stop (null). */
  highlight(id: string | null): void;
  /** Go on drawing a path from its last pin. */
  extendPath(id: string): void;
  deleteSelection(): void;
  recovery?: string;
  /** Shown above the layer summary when nothing is selected. */
  profile: ReactNode;
  /** Playthrough controls for the selected node, such as its progress. */
  nodeControls(node: MapNode): ReactNode;
  /** Playthrough controls for an item at the selected node: its wishlist entry. */
  itemControls(node: MapNode, item: string): ReactNode;
};

export function Inspector(props: Props) {
  const { t, doc, selection, layer } = props;
  const node =
    selection?.kind === "node"
      ? doc.nodes.find((n) => n.id === selection.id)
      : undefined;
  const edge =
    selection?.kind === "edge"
      ? inStepOrder(doc.edges).find((e) => e.id === selection.id)
      : undefined;
  return (
    <aside className="flex max-h-[45vh] w-full flex-col gap-4 overflow-y-auto border-t border-line bg-panel p-4 md:max-h-none md:w-80 md:border-t-0 md:border-l">
      {props.recovery !== undefined && (
        <div className="rounded border border-danger/60 p-2 text-sm">
          <p>
            {t(
              "Saved data could not be loaded. Original data is preserved; changes stay in memory.",
            )}
          </p>
          <a
            className="text-gold underline"
            download="route-of-grace-original.json"
            href={`data:application/json;charset=utf-8,${encodeURIComponent(props.recovery)}`}
          >
            {t("Download original saved data")}
          </a>
        </div>
      )}
      {node ? (
        <NodePanel {...props} node={node} key={node.id} />
      ) : edge ? (
        <EdgePanel {...props} edgeId={edge.id} key={edge.id} />
      ) : (
        <>
          {props.profile}
          <Summary t={t} doc={doc} layer={layer} />
        </>
      )}
    </aside>
  );
}

function NodePanel({
  t,
  language,
  data,
  doc,
  node,
  edit,
  select,
  deleteSelection,
  nodeControls,
  itemControls,
}: Props & { node: MapNode }) {
  // Game graces are game data: they can be visited, joined by paths and given
  // a note, not edited.
  const fixed = isGameGrace(node.id);
  // Older maps' item pins read as junctions that hold their item.
  const kind: NodeKind = node.kind === "item" ? "junction" : node.kind;
  const items = pinItems(node);
  const entry = node.ref ? data.byId.get(node.ref) : undefined;
  const icon = [entry, ...items.map((id) => data.byId.get(id))].find(
    (e) => e && isItem(e) && e.icon,
  );
  const connected = inStepOrder(
    doc.edges.filter((e) => e.nodes.includes(node.id)),
  );
  const note = notePath(doc, node.id);
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  const update = (changes: Partial<MapNode>) =>
    edit({ type: "updateNode", id: node.id, changes });
  const setItems = (next: string[]) =>
    update(
      node.kind === "item"
        ? { kind: "junction", ref: null, items: next }
        : { items: next },
    );
  // The note lives on the pin's note path, made when needed and removed when empty.
  const setNote = (changes: { note?: string; showNote?: boolean }) => {
    const next = {
      note: note?.note ?? "",
      showNote: note?.showNote ?? false,
      ...changes,
    };
    if (!note)
      edit({
        type: "addEdge",
        edge: { ...newPath(newId("note"), [node.id]), ...next },
      });
    else if (!next.note && !next.showNote)
      edit({ type: "removeEdge", id: note.id });
    else edit({ type: "updateEdge", id: note.id, changes: next });
  };
  const other = language === "en" ? "zh-TW" : "en";

  return (
    <section className="space-y-4" aria-label={t("Selected node")}>
      <header className="flex items-start gap-3">
        {icon && isItem(icon) && (
          <img
            src={iconUrl(icon.icon!)}
            alt=""
            className="size-14 rounded bg-ink"
          />
        )}
        <div className="min-w-0">
          <h2 className="font-serif text-lg text-gold">
            {displayName(data, node, language) || t(NODE_KIND_NAMES[kind])}
          </h2>
          {entry && <p className="text-sm text-muted">{entry.name[other]}</p>}
        </div>
      </header>

      {!fixed && (
        <label className="block space-y-1">
          <span className="label">{t("Kind")}</span>
          <select
            className="field w-full"
            value={kind}
            onChange={(e) =>
              update({
                kind: e.target.value as NodeKind,
                ref: null,
                ...(node.kind === "item" && { items }),
              })
            }
          >
            {NODE_KINDS.filter((k) => k !== "grace" && k !== "item").map(
              (k) => (
                <option key={k} value={k}>
                  {t(NODE_KIND_NAMES[k])}
                </option>
              ),
            )}
          </select>
        </label>
      )}

      {!fixed && kind === "entrance" && (
        <div className="space-y-1">
          <span className="label">{t("Place name")}</span>
          {entry && (
            <p className="flex items-center justify-between gap-2 text-sm">
              <span>{entry.name[language]}</span>
              <button className="link" onClick={() => update({ ref: null })}>
                {t("Unlink")}
              </button>
            </p>
          )}
          <CatalogSearch
            t={t}
            language={language}
            label={t("Place name")}
            entries={refCandidates(data, "entrance")}
            autoFocus={!entry}
            pick={(id) => update({ ref: id })}
          />
        </div>
      )}

      {nodeControls(node)}

      {!fixed && (
        <div className="space-y-2">
          <h3 className="label">
            {t("Items ({count})", { count: items.length })}
          </h3>
          {items.map((id) => {
            const item = data.byId.get(id);
            return (
              <div key={id} className="space-y-1">
                <p className="flex items-center gap-2 text-sm">
                  {item && isItem(item) && item.icon && (
                    <img
                      src={iconUrl(item.icon)}
                      alt=""
                      className="size-8 rounded bg-ink"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {item?.name[language] ?? id}
                  </span>
                  <button
                    className="link"
                    onClick={() => setItems(items.filter((i) => i !== id))}
                  >
                    {t("Remove")}
                  </button>
                </p>
                {itemControls(node, id)}
              </div>
            );
          })}
          <CatalogSearch
            t={t}
            language={language}
            label={t("Add an item")}
            entries={refCandidates(data, "item").filter(
              (e) => !items.includes(e.id),
            )}
            pick={(id) => setItems([...items, id])}
          />
        </div>
      )}

      {!fixed && (
        <label className="block space-y-1">
          <span className="label">{t("Label")}</span>
          <input
            className="field w-full"
            value={node.label}
            placeholder={t("Shown when no name is linked")}
            onChange={(e) => update({ label: e.target.value })}
          />
        </label>
      )}

      <div className="space-y-1">
        <label className="block space-y-1">
          <span className="label">{t("Your note")}</span>
          <input
            className="field w-full"
            value={note?.note ?? ""}
            placeholder={t("For example what to do or remember here")}
            onChange={(e) => setNote({ note: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={note?.showNote ?? false}
            onChange={(e) => setNote({ showNote: e.target.checked })}
          />
          {t("Show note on the map")}
        </label>
      </div>

      <div className="space-y-1">
        <h3 className="label">
          {t("Paths ({count})", { count: connected.length })}
        </h3>
        <ul className="space-y-1 text-sm">
          {connected.map((e) => {
            // Where the path could be split here: a pin that isn't an end.
            const at = e.nodes.findIndex(
              (id, i) => id === node.id && i > 0 && i < e.nodes.length - 1,
            );
            return (
              <li key={e.id} className="flex items-center gap-2">
                <button
                  className="link min-w-0 flex-1 truncate text-left"
                  onClick={() => select({ kind: "edge", id: e.id })}
                >
                  <span
                    className="swatch"
                    style={{ background: PATH_COLOR[e.color] }}
                  />{" "}
                  {t("Step {step}", { step: e.step })} ·{" "}
                  {pathEnds(t, language, data, nodes, e)}
                </button>
                {at > 0 && (
                  <button
                    className="chip shrink-0 text-xs"
                    onClick={() =>
                      edit({
                        type: "splitEdge",
                        id: e.id,
                        at,
                        newId: newId("path"),
                      })
                    }
                  >
                    {t("Split here")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-xs text-muted">
        {t(LAYER_NAMES[node.layer])} · {node.x}, {node.y}
      </p>
      {!fixed && (
        <button className="chip chip--danger" onClick={deleteSelection}>
          {t("Delete node")}
        </button>
      )}
    </section>
  );
}

/** A search box over catalog entries, in either language. */
function CatalogSearch({
  t,
  language,
  label,
  entries,
  autoFocus,
  pick,
}: {
  t: Translate;
  language: Language;
  label: string;
  entries: (CatalogItem | CatalogName)[];
  autoFocus?: boolean;
  pick(id: string): void;
}) {
  const [query, setQuery] = useState("");
  const results = query ? searchCatalog(entries, query) : [];
  const other = language === "en" ? "zh-TW" : "en";
  return (
    <>
      <input
        className="field w-full"
        aria-label={label}
        autoFocus={autoFocus}
        placeholder={t("Search English or 中文")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.length > 0 && (
        <ul className="max-h-64 overflow-y-auto rounded border border-line">
          {results.map((result) => (
            <li key={result.id}>
              <button
                className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-ink"
                onClick={() => {
                  pick(result.id);
                  setQuery("");
                }}
              >
                {isItem(result) && result.icon && (
                  <img
                    src={iconUrl(result.icon)}
                    alt=""
                    className="size-8"
                    loading="lazy"
                  />
                )}
                <span className="min-w-0">
                  <span className="block truncate">
                    {result.name[language]}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {result.name[other]}
                    {result.dlc && ` · ${t("DLC")}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function EdgePanel(props: Props & { edgeId: string }) {
  const { t, language, data, doc, edgeId, edit, showNode, deleteSelection } =
    props;
  const [moving, setMoving] = useState(false);
  const walked = inStepOrder(doc.edges);
  const edge = walked.find((e) => e.id === edgeId)!;
  const pins = edge.nodes.map((id) => doc.nodes.find((n) => n.id === id)!);
  const ends = [pins[0], pins[pins.length - 1]];
  const crossesLayers = pins.some((n) => n.layer !== pins[0].layer);
  const update = (changes: EdgeChanges) =>
    edit({ type: "updateEdge", id: edge.id, changes });

  if (moving)
    return <MoveList {...props} edge={edge} close={() => setMoving(false)} />;
  return (
    <section className="space-y-4" aria-label={t("Selected path")}>
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg text-gold">
          {t("Step {step}", { step: edge.step })}
        </h2>
        {walked.length > 1 && (
          <button className="chip" onClick={() => setMoving(true)}>
            {t("Move…")}
          </button>
        )}
      </header>
      <ol className="space-y-1 text-sm">
        {ends.map((end, index) => (
          <li key={index}>
            <span className="text-muted">
              {index === 0 ? t("From") : t("To")}{" "}
            </span>
            <button className="link" onClick={() => showNode(end.id)}>
              {displayName(data, end, language) || t(NODE_KIND_NAMES[end.kind])}
            </button>
            {crossesLayers && (
              <span className="text-muted"> · {t(LAYER_NAMES[end.layer])}</span>
            )}
          </li>
        ))}
      </ol>
      <div className="space-y-1">
        <span className="label">{t("Look")}</span>
        <div className="flex flex-wrap gap-1.5">
          {PATH_COLORS.map((color) => (
            <button
              key={color}
              className="color-pick"
              style={{ background: PATH_COLOR[color] }}
              aria-label={t(PATH_COLOR_NAMES[color])}
              aria-pressed={edge.color === color}
              onClick={() => update({ color })}
            />
          ))}
        </div>
        <div className="flex gap-1">
          {PATH_LINES.map((line) => (
            <button
              key={line}
              className="chip flex items-center gap-2"
              aria-pressed={edge.line === line}
              onClick={() => update({ line })}
            >
              <svg width="24" height="8" aria-hidden="true">
                <line
                  x1="0"
                  y1="4"
                  x2="24"
                  y2="4"
                  stroke={PATH_COLOR[edge.color]}
                  strokeWidth="3"
                  strokeDasharray={pathStyle({ ...edge, line }).dashArray}
                />
              </svg>
              {line === "solid" ? t("Solid") : t("Dashed")}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={edge.oneWay}
            onChange={(e) => update({ oneWay: e.target.checked })}
          />
          {t("One way (in drawing order)")}
        </label>
      </div>
      <div className="space-y-1">
        <label className="block space-y-1">
          <span className="label">{t("Your note")}</span>
          <input
            className="field w-full"
            value={edge.note}
            placeholder={t("For example the key or boss this path needs")}
            onChange={(e) => update({ note: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={edge.showNote}
            onChange={(e) => update({ showNote: e.target.checked })}
          />
          {t("Show note on the map")}
        </label>
      </div>
      <p className="text-xs text-muted">
        {t("Through {count} pins", { count: pins.length })}
      </p>
      <div className="flex gap-2">
        <button className="chip" onClick={() => props.extendPath(edge.id)}>
          {t("Extend")}
        </button>
        <button className="chip chip--danger" onClick={deleteSelection}>
          {t("Delete path")}
        </button>
      </div>
    </section>
  );
}

/** A path by its first and last pins, such as "Stormhill → Junction". */
function pathEnds(
  t: Translate,
  language: Language,
  data: GameData,
  nodes: ReadonlyMap<string, MapNode>,
  edge: MapEdge,
) {
  const name = (id: string) => {
    const node = nodes.get(id);
    return node
      ? displayName(data, node, language) || t(NODE_KIND_NAMES[node.kind])
      : "";
  };
  return `${name(edge.nodes[0])} → ${name(edge.nodes[edge.nodes.length - 1])}`;
}

/** Choose a path's new step from the list of paths in walking order. */
function MoveList({
  t,
  language,
  data,
  doc,
  layer,
  edge,
  edit,
  highlight,
  close,
}: Props & { edge: WalkedPath; close(): void }) {
  const list = useRef<HTMLDivElement>(null);
  const ordered = inStepOrder(doc.edges);
  const at = ordered.findIndex((e) => e.id === edge.id);
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  useEffect(() => {
    list.current
      ?.querySelector("[aria-current]")
      ?.scrollIntoView({ block: "center" });
    return () => highlight(null);
  }, [highlight]);

  // Slot k sits before the k-th path. The two slots next to this path would leave it where it is.
  const slot = (k: number) =>
    k === at || k === at + 1 ? null : (
      <li key={`slot-${k}`}>
        <button
          className="move-slot"
          data-move-item
          onClick={() => {
            edit({ type: "moveEdge", id: edge.id, step: k <= at ? k + 1 : k });
            close();
          }}
        >
          {t("Put here")}
        </button>
      </li>
    );
  // Arrow keys step through the paths and slots; Esc closes without moving.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      return close();
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [
      ...list.current!.querySelectorAll<HTMLElement>("[data-move-item]"),
    ];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = index + (event.key === "ArrowDown" ? 1 : -1);
    items[Math.min(Math.max(next, 0), items.length - 1)]?.focus();
  };

  return (
    <section
      className="flex min-h-0 flex-col gap-3"
      aria-label={t("Move path")}
      onKeyDown={onKeyDown}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg text-gold">
          {t("Move step {step} to…", { step: edge.step })}
        </h2>
        <button className="chip" onClick={close}>
          {t("Done")}
        </button>
      </header>
      <div ref={list} className="min-h-0 overflow-y-auto">
        <ol
          className="space-y-0.5 text-sm"
          onMouseLeave={() => highlight(null)}
        >
          {ordered.map((e, k) => [
            slot(k),
            <li
              key={e.id}
              tabIndex={0}
              data-move-item
              aria-current={e.id === edge.id ? "true" : undefined}
              className={`move-row ${e.id === edge.id ? "is-moving" : ""}`}
              onMouseEnter={() => highlight(e.id)}
              onFocus={() => highlight(e.id)}
            >
              <span className="w-7 shrink-0 text-right text-muted">
                {e.step}
              </span>
              <span
                className="swatch shrink-0"
                style={{ background: PATH_COLOR[e.color] }}
              />
              <span className="min-w-0 flex-1 truncate">
                {pathEnds(t, language, data, nodes, e)}
              </span>
              {nodes.get(e.nodes[0])?.layer !== layer && (
                <span className="shrink-0 text-xs text-muted">
                  {t(LAYER_NAMES[nodes.get(e.nodes[0])!.layer])}
                </span>
              )}
            </li>,
          ])}
          {slot(ordered.length)}
        </ol>
      </div>
    </section>
  );
}

function Summary({
  t,
  doc,
  layer,
}: {
  t: Translate;
  doc: MapDocument;
  layer: LayerId;
}) {
  // The player's own nodes; game graces are on every map.
  const here = doc.nodes.filter((n) => n.layer === layer && !isGameGrace(n.id));
  const ids = new Set(here.map((n) => n.id));
  return (
    <section className="space-y-4 text-sm">
      <h2 className="font-serif text-lg text-gold">{t(LAYER_NAMES[layer])}</h2>
      <p className="text-muted">
        {t("{nodes} nodes and {edges} paths on this layer.", {
          nodes: here.length,
          edges: inStepOrder(doc.edges).filter((e) =>
            e.nodes.some((id) => ids.has(id)),
          ).length,
        })}
      </p>
    </section>
  );
}
