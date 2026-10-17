# Route of Grace: architecture

How the app works and why. What is being built, and in which order, lives in [GitHub milestones](https://github.com/pomodorozhong/route-of-grace/milestones) and issues. Milestones 1–4 (extraction, map editor, graces, profiles with wishlist and routing) are done.

## Goal

A map-based route planner for Elden Ring (base game and Shadow of the Erdtree). The player plans and tracks several playthroughs. Each playthrough (a **profile**) has its own goal, constraints, wishlist, progress and path annotations; the app works out the actual path on that profile's map and updates it whenever the wishlist or progress changes.

**Main pain point:** planning a route to collect items, then changing it as new items worth getting are found. The old app failed because every item needed hand-curated data; anything this app needs should come from the game files or from a few clicks by the player.

## Decisions

| Topic           | Decision                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Route meaning   | A real path drawn on the map, not an ordered list of places.                                                                                                             |
| Playthroughs    | One profile is one whole route: its own goal, constraints, wishlist, progress, position, linked save slot and map annotations. Switching profiles switches all of these. |
| Map per profile | Each profile has its own nodes and paths. "Import from another profile" copies annotations across, so a new playthrough doesn't start from a blank map.                  |
| Path data       | The player draws paths in the editor. No automatic navmesh.                                                                                                              |
| Places          | Graces come from the game data. Item pins come from the game data once item locations are extracted (milestone 6); until then the player places them.                    |
| Names           | Official in-game English and zh-TW names win over any other source. Player-written text is kept as written.                                                              |
| Language        | English and Traditional Chinese (zh-TW) for all interface text.                                                                                                          |
| Spoilers        | Fine. Show missable and quest-lock warnings freely.                                                                                                                      |
| Viewer mode     | Required: a read-only URL used as an OBS browser source, mirroring the operator's screen.                                                                                |
| DLC             | In scope (separate map layers).                                                                                                                                          |
| Platform        | Mac, game running in CrossOver. Everything runs natively on macOS.                                                                                                       |
| Live position   | No. The player sets their position by hand (for example "at grace X").                                                                                                   |
| Progress import | A manual "Import progress from save" button, not automatic file watching.                                                                                                |
| Game assets     | Generated locally by the extractor, never committed. Only the script is in git.                                                                                          |

## What the extraction taught us

Everything below comes from the player's own install, read natively on macOS in about 100 seconds (see `scripts/extract/README.md`).

**Extracted (`game-data/`):**

- **Catalog:** 3,714 items (weapons, armor, talismans, goods, Ashes of War), 674 of them DLC, plus 419 graces, 1,007 places and 483 NPCs. Every entry has official English and zh-TW names.
  - All 46 seed wishlist items are found. 5 of the seed's zh-TW names were community translations and are replaced by the official ones.
  - Place names repeat under several IDs (region name vs. area name), so search shows each name once.
  - Goods carry a `goodsType`, which can separate spells, spirit ashes, key items and consumables later.
- **Icons:** 2,650 item icons (256 px WebP).
- **Map tiles:** fully revealed Leaflet tile pyramids for 4 layers: `overworld` (M00), `underground` (M01), `dlc` (M10), `dlc-underground` (M11). The full-resolution layers are 10,496 px square (8,704 px for `dlc-underground`), zoom 0–6.
- **Graces:** 419 of the 422 `BonfireWarpParam` rows, with official names, "discovered" event flags and map pixel positions (3 rows are unnamed or unreachable). Graces at boss arenas are named after the boss.
- **Event-flag block table:** `eventflag_bst.txt`, downloaded by `npm run extract` from ER-Save-Lib at a pinned commit (unlicensed, so not committed). It can't be derived from the game files.

**World-to-map transform (exact, no calibration needed):** one transform fits every layer: map pixel = (world x − 7040, 16512 − world z), one pixel per meter. World x/z come from area 60 or 61 grid cells (`grid × 256 + position`). Graces inside legacy dungeons, caves and catacombs are moved into area 60/61 by following `WorldMapLegacyConvParam` rows, which work in both directions and sometimes chain (Deeproot → Leyndell sewers → Leyndell → overworld). Checked by eye on churches, forts and castles in the overworld, the underground and the DLC.

**Available in the game data but not yet used:**

- **`WorldMapPointParam`:** the game's own map markers, with positions and names.
- **`ItemLotParam`:** what each pickup gives and its "picked up" event flag, but no position.
- **Map layout files (`map/mapstudio/*.msb`):** readable for overworld cells (`m60_*`), DLC cells (`m61_*`) and legacy dungeons (`m10_*` etc.). Treasure entries there link item lots to world positions, so item locations can probably be extracted (milestone 6).

**Gotchas:**

- Event flags (grace discovered, item picked up, boss beaten) tie these sources together. They are the natural keys for each profile's progress and for prerequisites.
- **Patches can change formats:** `regulation.bin` switched from Kraken to ZSTD compression in a recent patch. Param field offsets come from Paramdex and are checked against row size, so a layout change fails loudly. After a game patch, rerun `npm run extract`.
- **`dlc-underground` has no graces:** every DLC grace has display mask 0, so the surface/underground bit doesn't apply there.
- **Known gaps:** about 120 tiny archive files use an Oodle codec we don't decode, and 3 icons referenced by items don't exist. Neither affects the app.
- JavaScript's `&` is signed; use `>>> 0` for handle masks. Filenames that differ only in case clash on macOS.

## Data

Three kinds, kept separate:

1. **Game data (generated):** `game-data/catalog.json`, `icons/`, `map/`. Never edited by hand, never committed.
2. **Player-authored map data, one file per profile:** `maps/<profile id>.json` in the app data folder. Nodes (junction or entrance, optionally with `items`, the catalog items picked up there) in native map pixels of their layer, and paths (`edges`: each one line through an ordered list of nodes, with its look, options and `step` in the player's walk; a hop between two layers is a waygate jump). A path can run through a game grace by its grace ID (`grace/<row>`). A path through one node with `step: null` is that node's note path: it holds the node's note, so graces can have notes without being stored. Older maps' `item` nodes (an item pin, its item in `ref`) still load as they are and read as a pin holding that item; new fields are optional, so these changes need no upgrade.
   - **Upgrade:** a version 1 map file (paths between two nodes, with bends) becomes version 2: each bend becomes a junction, and paths are numbered in file order. A bend on a path between two game graces is dropped, since its layer isn't known without the game data. The player accepted this loss for the upgrade because the tool has not been put into use yet.
   - **Upgrade:** the single `map.json` of earlier versions becomes the first profile's map (`profile-1`) the first time it is read.
   - **Profile IDs** are lowercase letters, digits and dashes, since they name files.
   - **Deleting a profile** moves its map file into a `deleted/` folder instead of removing it, since it's player data.
3. **Player state:** `player.json` in the app data folder: app settings (language, map view, path number size, grace filter, grace-name mode) plus the playthrough profiles and which one is active.
   - **Each profile:** ID, name, goal, constraints (structured fields plus a free-text note), wishlist (item, status needed / acquired / skipped, note), progress (discovered graces, picked-up items, beaten bosses, as event flags), current position, and the linked save slot (Steam ID, slot index, character name).
   - **Upgrades:** older files upgrade on read; a version 1 file (no profiles) becomes one untitled profile.

`ROUTE_OF_GRACE_DATA_DIR` overrides the app data folder (used for tests). Saves are atomic, revision-checked across windows, and served to localhost only.

**Game graces are not stored.** Like the map tiles, they're game data: every profile's map shows them from `catalog.json`, with the grace ID as node ID, so paths, positions and fast travel refer to them directly and a game patch reaches every profile. They can't be moved, edited or deleted. (Milestone 3 stored them as nodes so they could be nudged; the transform turned out exact, so that wasn't needed.)

The route itself is never stored: it is worked out from the active profile's map, wishlist, progress, position and constraints.

## Design

### Map

Leaflet with `CRS.Simple` over the extracted tiles; one layer per map. The editor places pins, draws paths, attaches catalog items (with icons) to pins, and has undo/redo per profile. Legacy dungeons stay single entrance nodes with step-by-step notes. The overworld map doesn't help inside them, though `WorldMapLegacyConvParam` can place their graces on the overworld.

**Graces:** every game grace shows on its layer; of graces sharing a name and spot (Leyndell and its ashen twin) only the first shows. There's no tool to place a grace by hand, and a stored map holds no graces.

**Grace filter:** "Hide graces without paths" beside the Details button at the map's upper-right edge is one app setting, shared across playthroughs and off by default. It hides graces no path on the active profile's map runs through, including graces between a path's endpoints. A grace stays visible at the player's position and when selected. Draw path mode shows every grace, including before choosing the first pin. This only changes the display; routing and fast travel still use every discovered grace. Older player files gain the setting, off, on read.

Changing the grace filter only attaches or detaches the affected grace markers. Paths, step numbers and retained graces stay attached, so the toggle does not rebuild the whole overlay or restart their tooltip fades.

**Names:** the Details button on the map edge opens grace-name options: Automatic (the default), On hover and Always. Automatic opens ordinary grace names only at zoom 6 or closer, the map tiles' native resolution; all zooms still support hover. The choice is one app setting shared across playthroughs, and older player files gain Automatic on read. Item and entrance names stay open from zoom 4, while junction names stay on hover. The player's position, selected pin and planned-route pins keep their names open at any zoom, including graces reached by fast travel. Zoom 4 still crowded normal map use; the player requested a much closer threshold plus detail options.

### Path graph

- **Nodes:** graces, and the player's pins, placed with one Pin tool. A new pin is a junction; its details make it a dungeon entrance (linked to its place) and attach any number of items, which the wishlist and route find it by. A pin with items shows the first item's icon and how many more it holds.
- **Notes on pins:** any node, a game grace too, can have a note, shown below it on the map when asked. The note is stored on the node's note path (a path through only that node, with no step), which the pin's details make when a note is written and remove when it is cleared. Note paths aren't drawn as lines, walked or numbered. A pin note is about the place; a path note is about the walk, so a pin on a path can have both. A grace with a note counts as on a path and stays visible when unused graces are hidden.
- **Paths:** lines through nodes, all one kind: the player doesn't pick a type. Each path has a look (one of eight colors, solid or dashed; a new path takes the next color by its step, so neighbouring steps differ), a note that can be shown on the map under the path's step number, and **one way** (travelled only in drawing order, such as a drop), the one option that changes routing. A hop between pins on two layers is a waygate jump: it isn't drawn, and its pins are marked instead. Waygates within one layer are drawn as ordinary paths until they can come from game data (#48). Routing treats each pair of neighbouring nodes on a path as one hop.
- **Drawing:** a path is the whole line drawn in one go. In Draw path mode each click on the map drops a junction on the path, and a click on a node takes the path through it; Esc ends the path. Undo and Redo end drawing before changing the map history. Junctions double as bends. A click on a node on another layer is a waygate jump on the same path. Afterwards a path can be extended from its last node, or split in two at an inner node.
- **Steps:** paths are numbered in the order the player will walk them, like a guide's steps, with one number per path, shown halfway along the part of it on screen; when the whole path is off screen, its number is held on the nearest screen edge. A waygate with no drawn line on a layer shows its number beside a local endpoint, or on the screen edge when the endpoints are off screen. The number size (small, medium, large) is an app setting. Steps run 1..N across the walked paths (note paths have none) with no gaps or repeats: a new path goes last, removing one closes the gap, and imported paths follow the last step in their own order. "Move…" on a selected path lists every path in order to put it anywhere. Steps are the player's own order, separate from the planned route's stop numbers.
- **Unexplored areas:** fall back to a straight line between points, shown as "path is a guess" until the player draws a real one. Guesses only bridge unconnected pieces, so they never undercut drawn paths.

### Profiles

Create, rename, switch (header) and delete. A new profile starts with no nodes of its own; the game graces are already there. **"Import from another profile"** copies another profile's nodes and paths (optionally one layer) into the active profile as one undo step; nodes already present (same ID, game graces included) are reused, so copied paths attach to them. The seed wishlist (`seed/wishlist.json`, the "Great Stars Guard Counter" build) can start a profile, with official names replacing the seed's.

### Progress from the save

"Import progress from save" reads the character's event flags and marks discovered graces in the active profile (items and bosses follow once their flags are extracted).

- **Where:** `drive_c/users/crossover/AppData/Roaming/EldenRing/<Steam ID>/ER0000.sl2` in the CrossOver bottle: an unencrypted BND4 with 10 character slots, each behind an MD5 checksum.
- **Safety:** the app never writes the save; it copies the file, checks each slot's MD5, and parses the copy.
- **Finding the flags:** the event-flag block sits after variable-length sections in each slot (`server/save.ts`, following er-save-manager's documentation). A flag's byte comes from the community's block table (see extraction above).
- **Slot linking:** the first import asks for the character slot and links it to the profile; later imports reuse the link. If the slot now holds a character with a different name, it asks instead of importing. The changes are shown before they are applied.

### Routing

Everything here runs for the active profile.

- **Constraints:** DLC in or out, which leaves the DLC layers off the graph. The free-text note stays alongside the structured fields, which grow as routing needs them. There's no avoiding paths by kind: the player just doesn't draw paths they won't take.
- **Travel cost:** distance, since paths say nothing about speed. Shortest path (Dijkstra) over the graph: a drawn hop costs its length in metres (one map pixel), a hop between layers and fast travel to any grace this profile has discovered cost a short fixed distance; the numbers live in `src/routing/route.ts`. Fast travel will be blocked where the game blocks it (inside legacy dungeons before their grace). The app shows no time estimates: distance alone can't tell how long a stretch takes.
- **Visit order:** an ordering problem with prerequisites. Nearest neighbor plus 2-opt is enough for a few dozen targets.
- **Rerouting:** when an item is added to the profile's wishlist, fit it into the current route at the cheapest point and say where ("best after the Liurnia grace") before committing.
- **Views:** "Next stops" (the active route, drawn on the map) and "Blocked by X" ("beating Radahn unlocks 4 of your wishlist items", including items a quest step can make missable).

### OBS viewer

A read-only page that mirrors the operator's screen: the same layout, open modals, scroll position and map view. There are no separate viewer layouts; what the operator sees is what the stream shows. With `?mode=viewer` in the URL the page ignores all input and never sends updates back, so state only flows one way (operator → viewers).

- **Base:** the old project's read-only viewer (WebSocket relay; the operator app publishes state snapshots, viewers follow live).

### Agent tools

A local MCP server for Claude Code and Claude Desktop, mainly for managing the wishlist from a chat. Every tool works on the active profile's wishlist only; it never touches the map or other profiles. The app updates live.

| Tool              | Does                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `search_items`    | Finds catalog items by English or zh-TW name, so the right item ID is added.                                                                     |
| `add_to_wishlist` | Adds an item, optionally with a note. Suggests its region and requirements and asks the player to confirm (the pin itself is placed in the app). |
| `get_wishlist`    | Lists the wishlist with each item's acquisition state (needed / acquired / skipped) and note.                                                    |
| `set_item_note`   | Adds or replaces the note on a wishlist item.                                                                                                    |

Tool definitions stay separate from transport, so a WebMCP adapter can come later.

## Risks

- **MSB parsing (milestone 6):** not yet attempted. The ER format is documented by the modding community (SoulsFormats). Coverage is limited to world pickups; shops, enemy drops and quest rewards have no treasure position, so manual pins and notes stay necessary.
- **Keeping profile maps in sync:** each profile has its own map, so a path fixed in one profile isn't fixed in the others. "Import from another profile" covers starting a playthrough.
- **Hand-drawn paths are ongoing work:** the editor has to stay fast (click to drop junctions, choose the type, undo).
- **Game patches:** rerun the extractor; formats have already changed once.
