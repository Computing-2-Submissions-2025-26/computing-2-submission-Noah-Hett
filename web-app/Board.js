/**
 * Board.js — Grid management and placement validation for Kingdomino.
 *
 * A board is a 9×9 2D array. Each cell is either `null` (empty) or an
 * object `{ terrain, crowns }`. The castle sits permanently at [4][4].
 *
 * All public functions are **pure** — they take a board and return a
 * new board or a validation result, never mutating the original.
 *
 * @module Board
 */

import R from "./ramda.js";
import { get_secondary_offset } from "./Domino.js";

const GRID_SIZE = 9;
const CASTLE_POS = Object.freeze([4, 4]);

// Cardinal neighbour offsets: [row, col]
const NEIGHBOUR_OFFSETS = Object.freeze([
    [-1, 0], [1, 0], [0, -1], [0, 1]
]);

// ─── Board creation ─────────────────────────────────────────────────────────

/**
 * Create a fresh 9×9 board with the castle placed at the centre.
 * @returns {Array[]} 9×9 2D array.
 */
const create_board = function () {
    const board = R.times(
        () => R.times(() => null, GRID_SIZE),
        GRID_SIZE
    );
    // Place the castle — the only mutation, done once at creation.
    board[CASTLE_POS[0]][CASTLE_POS[1]] = Object.freeze({
        terrain: "castle",
        crowns: 0
    });
    return board;
};

// ─── Cell access ────────────────────────────────────────────────────────────

/**
 * Safe cell accessor — returns `null` for out-of-bounds coordinates.
 * @param {Array[]} board
 * @param {number}  row
 * @param {number}  col
 * @returns {Object|null}
 */
const get_cell = (board, row, col) => (
    row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE
        ? board[row][col]
        : null
);

/**
 * Return an array of [row, col] for every occupied cell on the board.
 * @param {Array[]} board
 * @returns {number[][]}
 */
const get_occupied_coords = (board) => R.chain(
    (r) => R.chain(
        (c) => (board[r][c] !== null ? [[r, c]] : []),
        R.range(0, GRID_SIZE)
    ),
    R.range(0, GRID_SIZE)
);

// ─── Placement validation ───────────────────────────────────────────────────

/**
 * Get the 4 cardinal neighbours of a cell that are non-null.
 * Returns array of { terrain, crowns, row, col } for each occupied neighbour.
 */
const get_neighbours = (board, row, col) => R.pipe(
    R.map(([dr, dc]) => {
        const nr = row + dr;
        const nc = col + dc;
        const cell = get_cell(board, nr, nc);
        return cell ? { ...cell, row: nr, col: nc } : null;
    }),
    R.reject(R.isNil)
)(NEIGHBOUR_OFFSETS);

/**
 * Validate a domino placement against the three rules:
 *   1. Collision  — both target cells must be empty
 *   2. Adjacency  — at least one half must touch a matching terrain or castle
 *   3. Bounding   — all occupied cells must fit in a 5×5 rectangle
 *
 * The adjacency check is per-edge: a half's terrain must match the
 * neighbour it is touching (e.g. forest–forest), OR the neighbour is
 * the castle. At least one such valid connection across both halves
 * is required.
 *
 * @param {Array[]} board
 * @param {Object}  domino    - Domino object from Domino.js
 * @param {number}  row       - Row for the primary half
 * @param {number}  col       - Column for the primary half
 * @param {number}  rotation  - Rotation index (0–3)
 * @returns {{ valid: boolean, reason: string }}
 */
const validate_placement = function (board, domino, row, col, rotation) {
    const [dr, dc] = get_secondary_offset(rotation);
    const sec_row = row + dr;
    const sec_col = col + dc;

    // ── 1. Collision check ──
    // Both cells must be in-bounds and empty.
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) {
        return { valid: false, reason: "Primary half is out of bounds." };
    }
    if (sec_row < 0 || sec_row >= GRID_SIZE
        || sec_col < 0 || sec_col >= GRID_SIZE) {
        return { valid: false, reason: "Secondary half is out of bounds." };
    }
    if (board[row][col] !== null) {
        return { valid: false, reason: "Primary cell is already occupied." };
    }
    if (board[sec_row][sec_col] !== null) {
        return { valid: false, reason: "Secondary cell is already occupied." };
    }

    // ── 2. Adjacency check ──
    // For each half, check its neighbours. A valid connection means:
    //   neighbour.terrain === half.terrain  OR  neighbour.terrain === "castle"
    // At least ONE such connection must exist across both halves.
    const primary_neighbours = get_neighbours(board, row, col);
    const secondary_neighbours = get_neighbours(board, sec_row, sec_col);

    const primary_has_match = R.any(
        (n) => n.terrain === domino.primary.terrain || n.terrain === "castle",
        primary_neighbours
    );
    const secondary_has_match = R.any(
        (n) => n.terrain === domino.secondary.terrain || n.terrain === "castle",
        secondary_neighbours
    );

    if (!primary_has_match && !secondary_has_match) {
        return {
            valid: false,
            reason: "No matching adjacent terrain or castle connection."
        };
    }

    // ── 3. 5×5 Bounding box check ──
    // Combine all currently occupied coords with the two new ones,
    // then check the bounding rectangle fits within 5×5.
    const occupied = get_occupied_coords(board);
    const all_coords = [...occupied, [row, col], [sec_row, sec_col]];

    const rows = R.map(R.head, all_coords);
    const cols = R.map(R.last, all_coords);

    const min_row = Math.min(...rows);
    const max_row = Math.max(...rows);
    const min_col = Math.min(...cols);
    const max_col = Math.max(...cols);

    const width = max_col - min_col + 1;
    const height = max_row - min_row + 1;

    if (width > 5 || height > 5) {
        return {
            valid: false,
            reason: `Placement exceeds 5×5 limit (${width}×${height}).`
        };
    }

    return { valid: true, reason: "Valid placement." };
};

// ─── Domino placement ───────────────────────────────────────────────────────

/**
 * Deep-clone a board (9×9 of small objects / nulls — fast enough).
 * @param {Array[]} board
 * @returns {Array[]}
 */
const clone_board = (board) => R.map(
    (row) => R.map(
        (cell) => (cell !== null ? { ...cell } : null),
        row
    ),
    board
);

/**
 * Place a domino on the board.
 * Validates first; throws if the placement is invalid.
 * Returns a **new** board — the original is not mutated.
 *
 * @param {Array[]} board
 * @param {Object}  domino
 * @param {number}  row       - Row for primary half
 * @param {number}  col       - Column for primary half
 * @param {number}  rotation  - Rotation index (0–3)
 * @returns {Array[]} New board with the domino placed.
 * @throws {Error} If the placement is invalid.
 */
const place_domino = function (board, domino, row, col, rotation) {
    const result = validate_placement(board, domino, row, col, rotation);
    if (!result.valid) {
        throw new Error(`Invalid placement: ${result.reason}`);
    }

    const [dr, dc] = get_secondary_offset(rotation);
    const new_board = clone_board(board);

    new_board[row][col] = Object.freeze({
        terrain: domino.primary.terrain,
        crowns: domino.primary.crowns
    });
    new_board[row + dr][col + dc] = Object.freeze({
        terrain: domino.secondary.terrain,
        crowns: domino.secondary.crowns
    });

    return new_board;
};

export {
    GRID_SIZE,
    CASTLE_POS,
    NEIGHBOUR_OFFSETS,
    create_board,
    get_cell,
    get_occupied_coords,
    get_neighbours,
    validate_placement,
    clone_board,
    place_domino
};
