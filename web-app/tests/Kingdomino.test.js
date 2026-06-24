/**
 * Kingdomino.test.js — Mocha test suite for the Kingdomino game logic.
 *
 * Covers the four backend modules:
 *   - Domino.js  (deck factory, rotation offsets)
 *   - Board.js   (grid creation, placement validation, domino placement)
 *   - Scoring.js (zone detection, scoring)
 *   - Game.js    (multi-player state, drafting, turn flow)
 *
 * The validate_placement section is the deepest — it specifies the
 * three core placement rules (collision, adjacency, bounding) with
 * tests designed to fail meaningfully if any rule is broken.
 */

import {strict as assert} from "node:assert";
import R from "../ramda.js";
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
import {
    PHASES,
    create_player,
    create_game,
    shuffle_array,
    has_valid_placement,
    get_player,
    deal_from_deck,
    place_meeple,
    attempt_placement
} from "../Game.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a simple test domino (not from the real deck). */
const test_domino = (id, p_terrain, p_crowns, s_terrain, s_crowns) => (
    create_domino(id, p_terrain, p_crowns, s_terrain, s_crowns)
);

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
            assert.deepEqual(ROTATION_OFFSETS[0], [0, 1]);
            assert.deepEqual(ROTATION_OFFSETS[1], [1, 0]);
            assert.deepEqual(ROTATION_OFFSETS[2], [0, -1]);
            assert.deepEqual(ROTATION_OFFSETS[3], [-1, 0]);
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
                    `Tile ${d.id} primary "${d.primary.terrain}" invalid`
                );
                assert.ok(
                    valid_terrains.includes(d.secondary.terrain),
                    `Tile ${d.id} secondary "${d.secondary.terrain}" invalid`
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

        it("creates a 9x9 grid", function () {
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
            board.forEach((row, r) => {
                row.forEach((cell, c) => {
                    if (r === CASTLE_POS[0] && c === CASTLE_POS[1]) {
                        return;
                    }
                    assert.equal(
                        cell, null,
                        `Cell [${r}][${c}] should be null`
                    );
                });
            });
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
        it("returns only the castle on a fresh board", function () {
            const board = create_board();
            const coords = get_occupied_coords(board);
            assert.equal(coords.length, 1);
            assert.deepEqual(coords[0], [4, 4]);
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    //  VALIDATE PLACEMENT — the core placement-rule specification.
    //
    //  Every test here is designed so that:
    //    1. It describes a specific game rule in its title.
    //    2. It fails with a useful message if the rule is broken.
    //    3. There is a plausible buggy implementation that would make
    //       ONLY this test fail (the "reachable failure" criterion).
    // ─────────────────────────────────────────────────────────────────────

    describe("validate_placement", function () {
        const wheat = test_domino(99, "wheat", 0, "wheat", 0);
        const forest = test_domino(98, "forest", 0, "forest", 0);
        const forest_wheat = test_domino(97, "forest", 0, "wheat", 0);
        const wheat_forest = test_domino(96, "wheat", 0, "forest", 0);

        // ── Return value structure ──────────────────────────────────────

        describe("always returns { valid, reason }", function () {
            it("valid placement has valid=true and a non-empty reason",
                function () {
                    const board = create_board();
                    const r = validate_placement(board, wheat, 4, 5, 0);
                    assert.equal(r.valid, true,
                        "Expected valid=true for legal placement");
                    assert.ok(r.reason.length > 0,
                        "Reason should not be empty even on success");
                }
            );

            it("invalid placement has valid=false and a non-empty reason",
                function () {
                    const board = create_board();
                    const r = validate_placement(board, wheat, 0, 0, 0);
                    assert.equal(r.valid, false,
                        "Expected valid=false for isolated placement");
                    assert.ok(r.reason.length > 0,
                        "Reason should describe why placement failed");
                }
            );
        });

        // ── Rule 1: Collision ───────────────────────────────────────────

        describe("Game Rules: Collision (Tiles cannot overlap)", function () {
            it("Rule: You cannot place a tile directly on top of your "
                + "central Castle", function () {
                const board = create_board();
                const r = validate_placement(board, wheat, 4, 4, 0);
                assert.equal(r.valid, false,
                    "Should not place on the castle cell");
                assert.ok(r.reason.toLowerCase().includes("occupied"),
                    "Reason should mention 'occupied'");
            });

            it("Rule: A domino cannot overlap an existing tile already "
                + "in your kingdom",
                function () {
                    const board = place_domino(
                        create_board(), wheat, 4, 5, 0
                    );
                    // [4][5] is now wheat — try to place there again
                    const r = validate_placement(board, wheat, 4, 5, 0);
                    assert.equal(r.valid, false,
                        "Primary cell [4][5] is already occupied");
                }
            );

            it("Rule: Both halves of the domino must be placed on empty "
                + "squares",
                function () {
                    const board = place_domino(
                        create_board(), wheat, 4, 5, 0
                    );
                    // [4][6] is now wheat. Place rotation-0 at [4][5]
                    // would put secondary at [4][6] — but primary is
                    // also taken. Use rotation-2 (Left): primary [4][7],
                    // secondary [4][6].
                    const r = validate_placement(board, wheat, 4, 7, 2);
                    assert.equal(r.valid, false,
                        "Secondary cell [4][6] is already occupied");
                }
            );
        });

        // ── Rule 1b: Boundary ───────────────────────────────────────────

        describe("Game Rules: Boundaries (Tiles must stay on the table)",
            function () {
            it("Rule: You cannot place a tile outside the boundaries "
                + "of the play area",
                function () {
                    const board = create_board();
                    const r = validate_placement(board, wheat, -1, 4, 0);
                    assert.equal(r.valid, false,
                        "Row -1 is out of bounds");
                    assert.ok(
                        r.reason.toLowerCase().includes("out of bounds"),
                        "Reason should mention out of bounds"
                    );
                }
            );

            it("Rule: Rotating a tile cannot cause it to hang off the edge",
                function () {
                    // Primary at [0][4], rotation 3 (Up) → secondary
                    // at [-1][4]
                    const board = create_board();
                    const r = validate_placement(board, wheat, 0, 4, 3);
                    assert.equal(r.valid, false,
                        "Secondary at row -1 is off the grid");
                }
            );

            it("Rule: Dominoes cannot hang off the far edge of the play area",
                function () {
                    const board = create_board();
                    // Primary [4][8], rotation 0 (Right) → secondary
                    // [4][9]
                    const r = validate_placement(board, wheat, 4, 8, 0);
                    assert.equal(r.valid, false,
                        "Secondary at col 9 is off the grid");
                }
            );
        });

        // ── Rule 2: Adjacency ───────────────────────────────────────────

        describe("Game Rules: Adjacency (Connecting terrain)", function () {
            it("Rule: The Castle is a wild card — any terrain can be "
                + "placed next to it",
                function () {
                    const board = create_board();
                    // Forest next to castle — castle counts as universal
                    const r = validate_placement(board, forest, 4, 5, 0);
                    assert.ok(r.valid,
                        "Any terrain should connect via the castle");
                }
            );

            it("Rule: A domino is valid if at least its first half connects "
                + "to a matching terrain",
                function () {
                    // Place wheat|wheat right of castle
                    const board = place_domino(
                        create_board(), wheat, 4, 5, 0
                    );
                    // Now place wheat|forest at [4][7], rotation 0.
                    // Primary wheat at [4][7] neighbours wheat at [4][6]
                    // → match. Secondary forest at [4][8] has no match.
                    const r = validate_placement(
                        board, wheat_forest, 4, 7, 0
                    );
                    assert.ok(r.valid,
                        "Primary-only match should be sufficient");
                }
            );

            it("Rule: A domino is valid if at least its second half connects "
                + "to a matching terrain",
                function () {
                    // Place wheat|wheat right of castle
                    const board = place_domino(
                        create_board(), wheat, 4, 5, 0
                    );
                    // Place forest|wheat at [4][7], rotation 0.
                    // Primary forest at [4][7] neighbours wheat at [4][6]
                    // → no match.  Secondary wheat at [4][8] has no
                    // neighbour.  This fails.
                    // Instead: rotation 2 (Left): primary forest [3][6],
                    // secondary wheat [3][5].  wheat at [3][5] neighbours
                    // wheat at [4][5] → match. forest at [3][6] neighbours
                    // wheat at [4][6] → no match.
                    const r = validate_placement(
                        board, forest_wheat, 3, 6, 2
                    );
                    assert.ok(r.valid,
                        "Secondary-only match should be sufficient");
                }
            );

            it("Rule: You cannot place a domino next to tiles with different "
                + "terrain (e.g., Forest cannot touch Wheat unless matching)",
                function () {
                    // Place wheat|wheat right of castle
                    const board = place_domino(
                        create_board(), wheat, 4, 5, 0
                    );
                    // Place forest|forest at [3][5], rotation 0.
                    // Primary forest at [3][5] neighbours wheat [4][5]
                    // and wheat [4][6] — forest≠wheat for both.
                    // Secondary forest at [3][6] neighbours wheat [4][6]
                    // — forest≠wheat.  No castle connection either.
                    const r = validate_placement(
                        board, forest, 3, 5, 0
                    );
                    assert.equal(r.valid, false,
                        "forest≠wheat — no matching terrain edge");
                }
            );

            it("Rule: A domino cannot be placed in isolation — it must "
                + "touch your existing Kingdom",
                function () {
                    const board = create_board();
                    // [0][0] rotation 0 → [0][0] and [0][1]
                    // No neighbours at all.
                    const r = validate_placement(board, wheat, 0, 0, 0);
                    assert.equal(r.valid, false,
                        "Domino at [0][0] has no neighbours");
                }
            );
        });

        // ── Rule 3: 5×5 Bounding box ────────────────────────────────────

        describe("Game Rules: 5x5 Kingdom Limit", function () {
            /** Build a board spanning exactly rows 2–6 (height = 5). */
            function build_tall_board() {
                const w = test_domino(99, "wheat", 0, "wheat", 0);
                let board = create_board();
                // [3][4]+[2][4] — above castle
                board = place_domino(board, w, 3, 4, 3);
                // [5][4]+[6][4] — below castle
                board = place_domino(board, w, 5, 4, 1);
                return board;
            }

            it("Rule: Your Kingdom can never be taller than 5 squares "
                + "total", function () {
                const board = build_tall_board();
                // Rows 2–6 (height 5). Placing at [1][4] rot 3 →
                // secondary at [0][4] → height would be 7.
                const w = test_domino(99, "wheat", 0, "wheat", 0);
                const r = validate_placement(board, w, 1, 4, 3);
                assert.equal(r.valid, false,
                    "Height would become 7 (rows 0–6)");
                assert.ok(r.reason.includes("5x5"),
                    "Reason should mention the 5x5 limit");
            });

            it("Rule: Your Kingdom can never be wider than 5 squares "
                + "total", function () {
                const w = test_domino(99, "wheat", 0, "wheat", 0);
                let board = create_board();
                // Span cols 2–6 (width = 5)
                board = place_domino(board, w, 4, 3, 2); // [4][3]+[4][2]
                board = place_domino(board, w, 4, 5, 0); // [4][5]+[4][6]
                // Now try extending to col 7+8 → width would be 7
                const r = validate_placement(board, w, 4, 7, 0);
                assert.equal(r.valid, false,
                    "Width would become 7 (cols 2–8)");
            });

            it("Rule: A Kingdom exactly 5 squares wide and 5 squares tall "
                + "is perfectly legal", function () {
                const board = build_tall_board();
                // Board spans rows 2–6. Place at [4][5]+[4][6] (Right)
                // Height stays 5, width becomes 3. Should be fine.
                const w = test_domino(99, "wheat", 0, "wheat", 0);
                const r = validate_placement(board, w, 4, 5, 0);
                assert.ok(r.valid,
                    "Exactly 5 high and 3 wide should be legal");
            });

            it("Rule: A new domino is invalid if placing it pushes the "
                + "boundaries beyond 5x5",
                function () {
                    // This ensures the implementation doesn't only check
                    // existing tiles — the two new cells must also count.
                    const w = test_domino(99, "wheat", 0, "wheat", 0);
                    let board = create_board();
                    // Place to span rows 2–6
                    board = place_domino(board, w, 3, 4, 3);
                    board = place_domino(board, w, 5, 4, 1);
                    // Occupied rows: 2,3,4,5,6 (5).
                    // Place at [7][4] rot 1 → secondary at [8][4]
                    // If code only checked existing tiles, it would miss
                    // that the NEW cells push height to 7.
                    const r = validate_placement(board, w, 7, 4, 1);
                    assert.equal(r.valid, false,
                        "New cells must be included in bounding check");
                }
            );
        });
    });

    // ── place_domino ────────────────────────────────────────────────────

    describe("place_domino", function () {
        it("returns a new board with the domino placed", function () {
            const board = create_board();
            const d = test_domino(1, "forest", 1, "wheat", 0);
            const new_board = place_domino(board, d, 4, 5, 0);

            // Original board unchanged (purity)
            assert.equal(board[4][5], null,
                "Original board should not be mutated");
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

        it("does not mutate the board when placement fails",
            function () {
                const board = create_board();
                const d = test_domino(1, "forest", 0, "wheat", 0);
                try {
                    place_domino(board, d, 0, 0, 0);
                } catch (ignore) {
                    // expected
                }
                assert.equal(board[0][0], null,
                    "Board cell [0][0] should still be null after"
                    + " a failed placement");
            }
        );

        it("supports all 4 rotations", function () {
            const board = create_board();
            const d = test_domino(1, "wheat", 0, "forest", 0);

            // Rotation 0 (Right): primary [4][5], secondary [4][6]
            const b0 = place_domino(board, d, 4, 5, 0);
            assert.equal(b0[4][5].terrain, "wheat");
            assert.equal(b0[4][6].terrain, "forest");

            // Rotation 1 (Down): primary [5][4], secondary [6][4]
            const b1 = place_domino(board, d, 5, 4, 1);
            assert.equal(b1[5][4].terrain, "wheat");
            assert.equal(b1[6][4].terrain, "forest");

            // Rotation 2 (Left): primary [4][3], secondary [4][2]
            const b2 = place_domino(board, d, 4, 3, 2);
            assert.equal(b2[4][3].terrain, "wheat");
            assert.equal(b2[4][2].terrain, "forest");

            // Rotation 3 (Up): primary [3][4], secondary [2][4]
            const b3 = place_domino(board, d, 3, 4, 3);
            assert.equal(b3[3][4].terrain, "wheat");
            assert.equal(b3[2][4].terrain, "forest");
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  SCORING MODULE
// ═══════════════════════════════════════════════════════════════════════════

describe("Scoring module", function () {
    describe("find_zones", function () {
        it("finds no zones on a castle-only board", function () {
            const board = create_board();
            const zones = find_zones(board);
            assert.equal(zones.length, 0,
                "Castle is excluded from zones");
        });

        it("finds a single zone from a same-terrain domino",
            function () {
                const board = place_domino(
                    create_board(),
                    test_domino(1, "wheat", 1, "wheat", 0),
                    4, 5, 0
                );
                const zones = find_zones(board);
                assert.equal(zones.length, 1);
                assert.equal(zones[0].terrain, "wheat");
                assert.equal(zones[0].tileCount, 2);
                assert.equal(zones[0].crownCount, 1);
            }
        );

        it("finds two zones from a mixed-terrain domino",
            function () {
                const board = place_domino(
                    create_board(),
                    test_domino(1, "forest", 1, "water", 2),
                    4, 5, 0
                );
                const zones = find_zones(board);
                assert.equal(zones.length, 2);

                const fz = zones.find((z) => z.terrain === "forest");
                const wz = zones.find((z) => z.terrain === "water");
                assert.equal(fz.tileCount, 1);
                assert.equal(fz.crownCount, 1);
                assert.equal(wz.tileCount, 1);
                assert.equal(wz.crownCount, 2);
            }
        );

        it("merges connected same-terrain tiles into one zone",
            function () {
                let board = create_board();
                board = place_domino(board,
                    test_domino(1, "wheat", 1, "wheat", 0), 4, 5, 0);
                board = place_domino(board,
                    test_domino(2, "wheat", 0, "wheat", 1), 4, 7, 0);

                const zones = find_zones(board);
                const wz = zones.filter((z) => z.terrain === "wheat");
                assert.equal(wz.length, 1,
                    "Connected wheat tiles should form one zone");
                assert.equal(wz[0].tileCount, 4);
                assert.equal(wz[0].crownCount, 2);
            }
        );
    });

    describe("score_zones", function () {
        it("scores an empty zone list as 0", function () {
            assert.equal(score_zones([]), 0);
        });

        it("scores tileCount * crownCount", function () {
            const zones = [
                {terrain: "wheat", tileCount: 3, crownCount: 2, cells: []}
            ];
            assert.equal(score_zones(zones), 6);
        });

        it("a zone with 0 crowns scores 0", function () {
            const zones = [
                {terrain: "forest", tileCount: 5, crownCount: 0, cells: []}
            ];
            assert.equal(score_zones(zones), 0);
        });

        it("sums multiple zones", function () {
            const zones = [
                {terrain: "wheat", tileCount: 3, crownCount: 2, cells: []},
                {terrain: "forest", tileCount: 4, crownCount: 1, cells: []},
                {terrain: "water", tileCount: 2, crownCount: 0, cells: []}
            ];
            // 3*2 + 4*1 + 2*0 = 6 + 4 + 0 = 10
            assert.equal(score_zones(zones), 10);
        });
    });

    describe("score_board", function () {
        it("empty board scores 0", function () {
            assert.equal(score_board(create_board()), 0);
        });

        it("single domino: wheat(1c)|wheat(0c) = 2 tiles * 1 crown = 2",
            function () {
                const board = place_domino(
                    create_board(),
                    test_domino(1, "wheat", 1, "wheat", 0),
                    4, 5, 0
                );
                assert.equal(score_board(board), 2);
            }
        );

        it("connected zone of 3 tiles with 2 crowns = 6",
            function () {
                let board = create_board();
                board = place_domino(board,
                    test_domino(1, "wheat", 1, "wheat", 0), 4, 5, 0);
                board = place_domino(board,
                    test_domino(2, "wheat", 1, "forest", 0), 5, 5, 0);
                // Wheat: [4][5], [4][6], [5][5] → 3 tiles, 2 crowns → 6
                // Forest: [5][6] → 1 tile, 0 crowns → 0
                assert.equal(score_board(board), 6);
            }
        );

        it("disconnected zones score independently",
            function () {
                let board = create_board();
                board = place_domino(board,
                    test_domino(1, "wheat", 1, "wheat", 0), 4, 5, 0);
                board = place_domino(board,
                    test_domino(2, "forest", 1, "forest", 1), 4, 3, 2);
                // Wheat: 2 tiles * 1 crown = 2
                // Forest: 2 tiles * 2 crowns = 4
                assert.equal(score_board(board), 6);
            }
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  GAME MODULE
// ═══════════════════════════════════════════════════════════════════════════

describe("Game module", function () {
    describe("shuffle_array", function () {
        it("returns a new array of the same length", function () {
            const arr = [1, 2, 3, 4, 5];
            const shuffled = shuffle_array(arr);
            assert.equal(shuffled.length, arr.length);
            assert.deepEqual(arr, [1, 2, 3, 4, 5]);
        });

        it("contains the same elements", function () {
            const arr = [10, 20, 30, 40];
            const shuffled = shuffle_array(arr);
            assert.deepEqual(
                shuffled.slice().sort((a, b) => a - b),
                arr.slice().sort((a, b) => a - b)
            );
        });
    });

    describe("create_player", function () {
        it("creates a player with a fresh board and score 0",
            function () {
                const p = create_player("P1", "#E91E63", "Player 1");
                assert.equal(p.id, "P1");
                assert.equal(p.color, "#E91E63");
                assert.equal(p.score, 0);
                assert.equal(p.board.length, GRID_SIZE);
                assert.equal(p.board[4][4].terrain, "castle");
            }
        );
    });

    describe("deal_from_deck", function () {
        const deck = build_deck().slice(0, 10);

        it("deals 4 tiles sorted by id", function () {
            const {line, deck: remaining} = deal_from_deck(deck);
            assert.equal(line.length, 4);
            assert.equal(remaining.length, 6);
            R.range(1, line.length).forEach((i) => {
                assert.ok(line[i].domino.id >= line[i - 1].domino.id,
                    "Dealt tiles should be sorted by id");
            });
            line.forEach((slot) => assert.equal(slot.meeple, null));
        });

        it("returns empty line if deck has fewer than 4 tiles",
            function () {
                const small = [build_deck()[0], build_deck()[1]];
                const {line} = deal_from_deck(small);
                assert.equal(line.length, 0);
            }
        );
    });

    describe("create_game", function () {
        const game = create_game(2);

        it("creates 2 players with independent boards", function () {
            assert.equal(game.players.length, 2);
            assert.equal(game.players[0].id, "P1");
            assert.equal(game.players[1].id, "P2");
            assert.notStrictEqual(
                game.players[0].board, game.players[1].board
            );
        });

        it("has a 20-tile deck (24 total - 4 dealt)", function () {
            assert.equal(game.deck.length, 20);
        });

        it("has 4 tiles in next_line sorted by id", function () {
            assert.equal(game.next_line.length, 4);
            R.range(1, game.next_line.length).forEach((i) => {
                assert.ok(
                    game.next_line[i].domino.id
                    >= game.next_line[i - 1].domino.id
                );
            });
        });

        it("starts in DRAFT_INITIAL phase", function () {
            assert.equal(game.phase, PHASES.DRAFT_INITIAL);
        });

        it("has a meeple order of 4 (2 per player)", function () {
            assert.equal(game.meeple_order.length, 4);
            const p1 = game.meeple_order.filter(
                (m) => m === "P1"
            ).length;
            const p2 = game.meeple_order.filter(
                (m) => m === "P2"
            ).length;
            assert.equal(p1, 2);
            assert.equal(p2, 2);
        });

        it("current_line is empty at start", function () {
            assert.equal(game.current_line.length, 0);
        });
    });

    describe("place_meeple (initial draft)", function () {
        it("places a meeple on a next_line slot", function () {
            const game = create_game(2);
            const s1 = place_meeple(game, 0);
            assert.equal(
                s1.next_line[0].meeple,
                game.active_player_id
            );
        });

        it("rejects already-taken slots", function () {
            const game = create_game(2);
            const s1 = place_meeple(game, 0);
            const s2 = place_meeple(s1, 0);
            assert.ok(s2.message.includes("already taken"),
                "Should reject claiming an occupied slot");
        });

        it("advances to next meeple after each pick", function () {
            const game = create_game(2);
            const s1 = place_meeple(game, 0);
            assert.equal(s1.active_player_id, game.meeple_order[1]);
        });

        it("transitions to RESOLVE_PLACE after all 4 meeples placed",
            function () {
                let s = create_game(2);
                s = place_meeple(s, 0);
                s = place_meeple(s, 1);
                s = place_meeple(s, 2);
                s = place_meeple(s, 3);
                assert.equal(s.phase, PHASES.RESOLVE_PLACE);
                assert.equal(s.current_line.length, 4);
                assert.equal(s.round, 2);
            }
        );
    });

    describe("attempt_placement", function () {
        /** Get a game state in RESOLVE_PLACE phase. */
        function get_resolve_state() {
            let s = create_game(2);
            s = place_meeple(s, 0);
            s = place_meeple(s, 1);
            s = place_meeple(s, 2);
            s = place_meeple(s, 3);
            return s;
        }

        it("places tile on the active player's board", function () {
            const s = get_resolve_state();
            const pid = s.active_player_id;
            const s2 = attempt_placement(s, 4, 5, 0);
            const player = get_player(s2, pid);
            assert.notEqual(player.board[4][5], null);
            assert.notEqual(player.board[4][6], null);
        });

        it("updates the player's score after placement", function () {
            const s = get_resolve_state();
            const pid = s.active_player_id;
            const s2 = attempt_placement(s, 4, 5, 0);
            const player = get_player(s2, pid);
            assert.equal(player.score, score_board(player.board),
                "Score should be recalculated from the new board");
        });

        it("transitions to RESOLVE_DRAFT after valid placement",
            function () {
                const s = get_resolve_state();
                const s2 = attempt_placement(s, 4, 5, 0);
                assert.equal(s2.phase, PHASES.RESOLVE_DRAFT);
            }
        );

        it("rejects invalid placement without changing board",
            function () {
                const s = get_resolve_state();
                const s2 = attempt_placement(s, 0, 0, 0);
                assert.equal(s2.phase, PHASES.RESOLVE_PLACE);
                const player = get_player(s2, s.active_player_id);
                assert.equal(player.board[0][0], null,
                    "Board should be unchanged after failed placement");
            }
        );

        it("does not modify the other player's board", function () {
            const s = get_resolve_state();
            const pid = s.active_player_id;
            const other_pid = (pid === "P1"
                ? "P2"
                : "P1");
            const s2 = attempt_placement(s, 4, 5, 0);
            const other = get_player(s2, other_pid);
            assert.equal(get_occupied_coords(other.board).length, 1,
                "Other player's board should only have the castle");
        });
    });

    describe("has_valid_placement", function () {
        it("returns true for a fresh board (any tile fits near castle)",
            function () {
                const board = create_board();
                const d = test_domino(1, "wheat", 0, "wheat", 0);
                assert.ok(has_valid_placement(board, d));
            }
        );
    });

    describe("full round cycle", function () {
        it("completes initial draft and first placement round",
            function () {
                let s = create_game(2);
                s = place_meeple(s, 0);
                s = place_meeple(s, 1);
                s = place_meeple(s, 2);
                s = place_meeple(s, 3);
                assert.equal(s.phase, PHASES.RESOLVE_PLACE);

                s = attempt_placement(s, 4, 5, 0);
                assert.equal(s.phase, PHASES.RESOLVE_DRAFT);
                s = place_meeple(s, 0);

                assert.equal(s.phase, PHASES.RESOLVE_PLACE);
                assert.equal(s.current_line_index, 1);
            }
        );
    });
});
