/**
 * Kingdomino.test.js — Mocha test suite for the Kingdomino game logic.
 *
 * Covers the three backend modules:
 *   - Domino.js  (deck factory, rotation offsets)
 *   - Board.js   (grid creation, placement validation, domino placement)
 *   - Scoring.js (zone detection, scoring)
 */

import { strict as assert } from "node:assert";
import {
    TERRAIN_TYPES,
    ROTATION_OFFSETS,
    create_domino,
    build_deck,
    get_secondary_offset
} from "../Domino.js";
import {
    GRID_SIZE,
    CASTLE_POS,
    create_board,
    get_cell,
    get_occupied_coords,
    validate_placement,
    place_domino
} from "../Board.js";
import {
    find_zones,
    score_zones,
    score_board
} from "../Scoring.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a simple test domino (not from the real deck). */
const test_domino = (
    id,
    p_terrain,
    p_crowns,
    s_terrain,
    s_crowns
) => create_domino(id, p_terrain, p_crowns, s_terrain, s_crowns);

// ═══════════════════════════════════════════════════════════════════════════
//  DOMINO MODULE
// ═══════════════════════════════════════════════════════════════════════════

describe("Domino module", function () {
    describe("TERRAIN_TYPES", function () {
        it("contains all six game terrains plus castle", function () {
            const expected = [
                "wheat", "forest", "water",
                "grassland", "swamp", "mine", "castle"
            ];
            expected.forEach((t) => {
                assert.ok(
                    t in TERRAIN_TYPES,
                    `Missing terrain type: ${t}`
                );
            });
        });

        it("is frozen (immutable)", function () {
            assert.ok(Object.isFrozen(TERRAIN_TYPES));
        });
    });

    describe("ROTATION_OFFSETS", function () {
        it("has exactly 4 entries", function () {
            assert.equal(ROTATION_OFFSETS.length, 4);
        });

        it("maps 0=Right, 1=Down, 2=Left, 3=Up", function () {
            assert.deepEqual(ROTATION_OFFSETS[0], [0, 1]);   // Right
            assert.deepEqual(ROTATION_OFFSETS[1], [1, 0]);   // Down
            assert.deepEqual(ROTATION_OFFSETS[2], [0, -1]);  // Left
            assert.deepEqual(ROTATION_OFFSETS[3], [-1, 0]);  // Up
        });
    });

    describe("create_domino", function () {
        it("returns a frozen object with correct properties", function () {
            const d = create_domino(1, "wheat", 0, "forest", 1);
            assert.equal(d.id, 1);
            assert.equal(d.primary.terrain, "wheat");
            assert.equal(d.primary.crowns, 0);
            assert.equal(d.secondary.terrain, "forest");
            assert.equal(d.secondary.crowns, 1);
            assert.ok(Object.isFrozen(d));
            assert.ok(Object.isFrozen(d.primary));
            assert.ok(Object.isFrozen(d.secondary));
        });
    });

    describe("build_deck", function () {
        const deck = build_deck();

        it("returns exactly 48 dominoes", function () {
            assert.equal(deck.length, 48);
        });

        it("assigns IDs 1 through 48", function () {
            deck.forEach((d, i) => {
                assert.equal(d.id, i + 1);
            });
        });

        it("every domino has a valid terrain on both halves", function () {
            const valid_terrains = [
                "wheat", "forest", "water",
                "grassland", "swamp", "mine"
            ];
            deck.forEach((d) => {
                assert.ok(
                    valid_terrains.includes(d.primary.terrain),
                    `Tile ${d.id} primary terrain "${d.primary.terrain}" invalid`
                );
                assert.ok(
                    valid_terrains.includes(d.secondary.terrain),
                    `Tile ${d.id} secondary terrain "${d.secondary.terrain}" invalid`
                );
            });
        });

        it("crown counts are non-negative integers", function () {
            deck.forEach((d) => {
                assert.ok(d.primary.crowns >= 0);
                assert.ok(d.secondary.crowns >= 0);
                assert.ok(Number.isInteger(d.primary.crowns));
                assert.ok(Number.isInteger(d.secondary.crowns));
            });
        });
    });

    describe("get_secondary_offset", function () {
        it("returns the correct offset for each rotation", function () {
            assert.deepEqual(get_secondary_offset(0), [0, 1]);
            assert.deepEqual(get_secondary_offset(1), [1, 0]);
            assert.deepEqual(get_secondary_offset(2), [0, -1]);
            assert.deepEqual(get_secondary_offset(3), [-1, 0]);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  BOARD MODULE
// ═══════════════════════════════════════════════════════════════════════════

describe("Board module", function () {
    describe("create_board", function () {
        const board = create_board();

        it("creates a 9×9 grid", function () {
            assert.equal(board.length, GRID_SIZE);
            board.forEach((row) => {
                assert.equal(row.length, GRID_SIZE);
            });
        });

        it("has castle at [4][4]", function () {
            const castle = board[CASTLE_POS[0]][CASTLE_POS[1]];
            assert.notEqual(castle, null);
            assert.equal(castle.terrain, "castle");
            assert.equal(castle.crowns, 0);
        });

        it("all other cells are null", function () {
            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    if (r === CASTLE_POS[0] && c === CASTLE_POS[1]) {
                        continue;
                    }
                    assert.equal(
                        board[r][c], null,
                        `Cell [${r}][${c}] should be null`
                    );
                }
            }
        });
    });

    describe("get_cell", function () {
        const board = create_board();

        it("returns the castle for [4][4]", function () {
            const cell = get_cell(board, 4, 4);
            assert.equal(cell.terrain, "castle");
        });

        it("returns null for empty cells", function () {
            assert.equal(get_cell(board, 0, 0), null);
        });

        it("returns null for out-of-bounds coordinates", function () {
            assert.equal(get_cell(board, -1, 0), null);
            assert.equal(get_cell(board, 0, 9), null);
            assert.equal(get_cell(board, 99, 99), null);
        });
    });

    describe("get_occupied_coords", function () {
        it("returns only the castle position on a fresh board", function () {
            const board = create_board();
            const coords = get_occupied_coords(board);
            assert.equal(coords.length, 1);
            assert.deepEqual(coords[0], [4, 4]);
        });
    });

    describe("validate_placement", function () {
        // Helper domino: wheat|wheat, no crowns
        const wheat_wheat = test_domino(99, "wheat", 0, "wheat", 0);
        // Helper domino: forest|wheat
        const forest_wheat = test_domino(98, "forest", 0, "wheat", 0);

        it("accepts a valid placement adjacent to castle", function () {
            const board = create_board();
            // Place to the right of castle [4][4], rotation 0 (Right)
            // Primary at [4][5], secondary at [4][6]
            const result = validate_placement(board, wheat_wheat, 4, 5, 0);
            assert.ok(result.valid, result.reason);
        });

        it("accepts placement above castle", function () {
            const board = create_board();
            // Primary at [3][4], rotation 3 (Up) → secondary at [2][4]
            const result = validate_placement(board, wheat_wheat, 3, 4, 3);
            assert.ok(result.valid, result.reason);
        });

        it("rejects placement on the castle cell (collision)", function () {
            const board = create_board();
            const result = validate_placement(board, wheat_wheat, 4, 4, 0);
            assert.ok(!result.valid);
            assert.ok(result.reason.includes("occupied"));
        });

        it("rejects out-of-bounds placement", function () {
            const board = create_board();
            // Primary at [0][0], rotation 3 (Up) → secondary at [-1][0]
            const result = validate_placement(board, wheat_wheat, 0, 0, 3);
            assert.ok(!result.valid);
            assert.ok(result.reason.includes("out of bounds"));
        });

        it("rejects placement with no matching adjacency", function () {
            const board = create_board();
            // Place far from castle — forest domino at [0][0]
            const result = validate_placement(board, forest_wheat, 0, 0, 0);
            // Even if it were in-bounds, there's nothing adjacent
            assert.ok(!result.valid);
        });

        it("rejects placement exceeding 5×5 bounding box", function () {
            // Build a board with tiles spread out, then try to extend past 5
            let board = create_board();
            // Place tiles to span rows 2–6 (5 high)
            const w = test_domino(99, "wheat", 0, "wheat", 0);
            // [3][4] + [2][4]  (above castle)
            board = place_domino(board, w, 3, 4, 3);
            // [5][4] + [6][4]  (below castle)
            board = place_domino(board, w, 5, 4, 1);

            // Now the occupied rows span 2–6 (height = 5).
            // Placing at [1][4] would make height = 6 → should be rejected.
            const result = validate_placement(board, w, 1, 4, 3);
            assert.ok(!result.valid);
            assert.ok(result.reason.includes("5×5"));
        });

        it("allows placement that stays within 5×5", function () {
            let board = create_board();
            const w = test_domino(99, "wheat", 0, "wheat", 0);
            // Place above castle: primary [3][4], secondary [2][4]
            board = place_domino(board, w, 3, 4, 3);
            // Place below castle: primary [5][4], secondary [6][4]
            board = place_domino(board, w, 5, 4, 1);
            // Occupied rows: 2,3,4,5,6 → height exactly 5
            // Place to the right of castle: [4][5] + [4][6]
            const result = validate_placement(board, w, 4, 5, 0);
            assert.ok(result.valid, result.reason);
        });

        it("adjacency: accepts when one half matches terrain", function () {
            let board = create_board();
            // Place wheat|wheat right of castle
            const ww = test_domino(99, "wheat", 0, "wheat", 0);
            board = place_domino(board, ww, 4, 5, 0);
            // Now place forest|wheat next to the wheat at [4][6]
            // Primary forest at [4][7], secondary wheat at [4][8]
            // The wheat secondary at [4][8] has no match, but the forest
            // primary at [4][7] is next to wheat at [4][6] — that's NOT a
            // match (forest ≠ wheat). However, we need at least one edge match.
            // Actually forest at [4][7] neighbours wheat at [4][6] — no match.
            // Let's use wheat|forest instead:
            const wf = test_domino(98, "wheat", 0, "forest", 0);
            // wheat primary at [4][7] neighbours wheat at [4][6] → match!
            const result = validate_placement(board, wf, 4, 7, 0);
            assert.ok(result.valid, result.reason);
        });

        it("adjacency: rejects when no edge has matching terrain", function () {
            let board = create_board();
            // Place wheat|wheat right of castle
            const ww = test_domino(99, "wheat", 0, "wheat", 0);
            board = place_domino(board, ww, 4, 5, 0);
            // Try to place forest|swamp next to wheat — neither terrain matches
            const fs = test_domino(97, "forest", 0, "swamp", 0);
            // Primary forest at [4][7], secondary swamp at [4][8]
            // forest neighbours wheat at [4][6] → no match
            // swamp neighbours nothing else
            const result = validate_placement(board, fs, 4, 7, 0);
            assert.ok(!result.valid);
            assert.ok(result.reason.includes("matching"));
        });
    });

    describe("place_domino", function () {
        it("returns a new board with the domino placed", function () {
            const board = create_board();
            const d = test_domino(1, "forest", 1, "wheat", 0);
            const new_board = place_domino(board, d, 4, 5, 0);

            // Original board unchanged
            assert.equal(board[4][5], null);
            assert.equal(board[4][6], null);

            // New board has the tiles
            assert.equal(new_board[4][5].terrain, "forest");
            assert.equal(new_board[4][5].crowns, 1);
            assert.equal(new_board[4][6].terrain, "wheat");
            assert.equal(new_board[4][6].crowns, 0);
        });

        it("throws on invalid placement", function () {
            const board = create_board();
            const d = test_domino(1, "forest", 0, "wheat", 0);
            assert.throws(
                () => place_domino(board, d, 0, 0, 0),
                /Invalid placement/
            );
        });

        it("supports all 4 rotations", function () {
            const board = create_board();
            const d = test_domino(1, "wheat", 0, "forest", 0);

            // Rotation 0 (Right): primary [4][5], secondary [4][6]
            let b = place_domino(board, d, 4, 5, 0);
            assert.equal(b[4][5].terrain, "wheat");
            assert.equal(b[4][6].terrain, "forest");

            // Rotation 1 (Down): primary [5][4], secondary [6][4]
            b = place_domino(board, d, 5, 4, 1);
            assert.equal(b[5][4].terrain, "wheat");
            assert.equal(b[6][4].terrain, "forest");

            // Rotation 2 (Left): primary [4][3], secondary [4][2]
            b = place_domino(board, d, 4, 3, 2);
            assert.equal(b[4][3].terrain, "wheat");
            assert.equal(b[4][2].terrain, "forest");

            // Rotation 3 (Up): primary [3][4], secondary [2][4]
            b = place_domino(board, d, 3, 4, 3);
            assert.equal(b[3][4].terrain, "wheat");
            assert.equal(b[2][4].terrain, "forest");
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  SCORING MODULE
// ═══════════════════════════════════════════════════════════════════════════

describe("Scoring module", function () {
    describe("find_zones", function () {
        it("finds no zones on an empty board (castle only)", function () {
            const board = create_board();
            const zones = find_zones(board);
            assert.equal(zones.length, 0);
        });

        it("finds a single zone from one domino", function () {
            let board = create_board();
            const d = test_domino(1, "wheat", 1, "wheat", 0);
            board = place_domino(board, d, 4, 5, 0);
            const zones = find_zones(board);
            // Both halves are wheat → one zone of size 2
            assert.equal(zones.length, 1);
            assert.equal(zones[0].terrain, "wheat");
            assert.equal(zones[0].tileCount, 2);
            assert.equal(zones[0].crownCount, 1);
        });

        it("finds two separate zones from a mixed-terrain domino", function () {
            let board = create_board();
            const d = test_domino(1, "forest", 1, "water", 2);
            board = place_domino(board, d, 4, 5, 0);
            const zones = find_zones(board);
            assert.equal(zones.length, 2);

            const forest_zone = zones.find((z) => z.terrain === "forest");
            const water_zone = zones.find((z) => z.terrain === "water");
            assert.equal(forest_zone.tileCount, 1);
            assert.equal(forest_zone.crownCount, 1);
            assert.equal(water_zone.tileCount, 1);
            assert.equal(water_zone.crownCount, 2);
        });

        it("merges connected tiles of the same terrain into one zone", function () {
            let board = create_board();
            // Place two wheat|wheat dominoes in a line
            const w = test_domino(1, "wheat", 1, "wheat", 0);
            board = place_domino(board, w, 4, 5, 0);
            // Second domino: wheat at [4][7], wheat at [4][8]
            const w2 = test_domino(2, "wheat", 0, "wheat", 1);
            board = place_domino(board, w2, 4, 7, 0);

            const zones = find_zones(board);
            const wheat_zones = zones.filter((z) => z.terrain === "wheat");
            assert.equal(wheat_zones.length, 1);
            assert.equal(wheat_zones[0].tileCount, 4);
            assert.equal(wheat_zones[0].crownCount, 2);
        });
    });

    describe("score_zones", function () {
        it("scores an empty zone list as 0", function () {
            assert.equal(score_zones([]), 0);
        });

        it("scores tileCount × crownCount", function () {
            const zones = [
                { terrain: "wheat", tileCount: 3, crownCount: 2, cells: [] }
            ];
            assert.equal(score_zones(zones), 6);
        });

        it("a zone with 0 crowns scores 0", function () {
            const zones = [
                { terrain: "forest", tileCount: 5, crownCount: 0, cells: [] }
            ];
            assert.equal(score_zones(zones), 0);
        });

        it("sums multiple zones", function () {
            const zones = [
                { terrain: "wheat", tileCount: 3, crownCount: 2, cells: [] },
                { terrain: "forest", tileCount: 4, crownCount: 1, cells: [] },
                { terrain: "water", tileCount: 2, crownCount: 0, cells: [] }
            ];
            // 3×2 + 4×1 + 2×0 = 6 + 4 + 0 = 10
            assert.equal(score_zones(zones), 10);
        });
    });

    describe("score_board", function () {
        it("empty board scores 0", function () {
            assert.equal(score_board(create_board()), 0);
        });

        it("single domino: wheat(1 crown)|wheat(0) = 2 tiles × 1 crown = 2", function () {
            let board = create_board();
            board = place_domino(
                board,
                test_domino(1, "wheat", 1, "wheat", 0),
                4, 5, 0
            );
            assert.equal(score_board(board), 2);
        });

        it("connected zone of 3 tiles with 2 total crowns = 6", function () {
            let board = create_board();
            // Place wheat(1)|wheat(0) to the right of castle
            board = place_domino(
                board,
                test_domino(1, "wheat", 1, "wheat", 0),
                4, 5, 0
            );
            // Place wheat(1)|forest(0) below [4][5]
            // Primary wheat at [5][5] (matches wheat above), secondary forest at [5][6]
            board = place_domino(
                board,
                test_domino(2, "wheat", 1, "forest", 0),
                5, 5, 0
            );
            // Wheat zone: [4][5], [4][6], [5][5] → 3 tiles, 2 crowns → 6
            // Forest zone: [5][6] → 1 tile, 0 crowns → 0
            assert.equal(score_board(board), 6);
        });

        it("disconnected zones score independently", function () {
            let board = create_board();
            // Wheat domino right of castle
            board = place_domino(
                board,
                test_domino(1, "wheat", 1, "wheat", 0),
                4, 5, 0
            );
            // Forest domino left of castle
            board = place_domino(
                board,
                test_domino(2, "forest", 1, "forest", 1),
                4, 3, 2
            );
            // Wheat zone: 2 tiles × 1 crown = 2
            // Forest zone: 2 tiles × 2 crowns = 4
            assert.equal(score_board(board), 6);
        });
    });
});
