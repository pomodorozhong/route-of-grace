# Handoff

## In progress

### feat/pins-and-notes

- Task: #40 One pin tool, items on any pin, and #39 notes on any pin (one PR closing both; plan approved by the player, items only on the player's own pins for now)
- PR: none yet
- Code checkpoint: ed63ede (pushed)
- State: built. One Pin tool (new pins are junctions; Kind offers Junction or Entrance), optional `items` on pins (old `item` pins read as a pin holding their `ref`, rewritten only when their items are edited), pin and grace notes stored as one-node note paths with `step: null`. Maps stay at schema v4 with no upgrade; all new fields are optional. The pin's old "Your note" field is now "Label".
- Verification: lint, typecheck, test (101), build pass; browser check at 1400px on a copy of the player's data (old item pin loads with its item, adding a second item shows "+1", notes on a pin and a grace show below them, steps unchanged, saved copy passes `validDocument`, no console errors). The player's dev server on port 5173 runs this checkout on real data and hot-reloads edits.
- Checks not run: zh-TW strings not viewed in the browser.
- Known: a shown pin note can sit under a neighbouring pin marker (map clutter, see #37).
- Next action: player reviews the PR closing #40 and #39; address review comments

## Ranked work

1. #40 + #39 One pin tool with items on any pin, and notes on any pin (in progress on feat/pins-and-notes; reshapes nodes before #10)
2. #41 Edit a selected path (insert a node between two others)
3. #45 Make the wishlist easy to find and search
4. #46 Rework the full-size layout (#42 and #45 are parts of it)
5. #42 Simpler playthrough panel
6. #43 Choose where the save file is (blocks trying the save import)
7. #37 Grace icons cover path numbers and lines
8. #44 Show which way a path goes
9. #33 Step numbers pinned to the screen edge can overlap (small)
10. #36 Layer summary misses paths drawn only through graces (small)
11. #48 Spike: waygate locations and destinations from game data
12. #19 Bring over chosen paths from another map, with a preview
13. #22 Note what feels awkward (all ten flows tried; keep adding notes)
14. #6 Save import review shows "Apply" when nothing changed (small)
15. #27 Ashen Capital graces read as undiscovered (small; affects fast travel after Leyndell burns)
16. #8 Spike: item locations from map layout files or community sources (no UI, so it can run before M5)
17. #3 Add end-to-end browser tests
18. #7 Check English and zh-TW together

## Pending

None.