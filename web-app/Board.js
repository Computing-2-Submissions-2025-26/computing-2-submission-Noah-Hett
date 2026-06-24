/**
 * Board.js — Grid management and placement validation for Kingdomino.
 *
 * A board is a 9×9 2-D array of {@link Cell} values.  Each cell is
 * either `null` (empty) or an object with terrain and crown data.
 * The castle occupies the centre at row 4, column 4.
 *
 * All public functions are **pure** — they accept a board and return
 * a new board or validation result, never mutating the original.
 *
 * @module Board
 */

import R from "./ramda.js";
import {get_secondary_offset} from "./Domino.js";

// ─── Type definitions ───────────────────────────────────────────────────────

/**
 * A single cell on the board.
 * @typedef  {Object} Cell
 * @property {string} terrain - Terrain type (e.g. "wheat", "castle").
 * @property {number} crowns  - Number of crowns (0–3).
 */

/**
 * A 9×9 two-dimensional array.  Each element is either a {@link Cell}
 * or `null` (empty).
 * @typedef {Array.<Array.<(Cell|null)>>} Board
 */

/**
 * Result returned by {@link validate_placement}.
 * @typedef  {Object} ValidationResult
 * @property {boolean} valid  - `true` when the placement is legal.
 * @property {string}  reason - Human-readable explanation.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/** Width and height of the board grid. @constant {number} */
const GRID_SIZE = 9;

/** `[row, col]` of the castle. @constant {number[]} */
const CASTLE_POS = Object.freeze([4, 4]);

/**
 * Cardinal-neighbour offsets: up, down, left, right.
 * @constant {Array.<number[]>}
 */
const NEIGHBOUR_OFFSETS = Object.freeze([
    [-1, 0], [1, 0], [0, -1], [0, 1]
]);

// ─── Board creation ─────────────────────────────────────────────────────────

/**
 * Create a fresh 9×9 board with the castle placed at the centre.
 *
 * @returns {Board} A new board with only the castle cell occupied.
 *
 * @example
 * const board = create_board();
 * board[4][4].terrain; // "castle"
 * board[0][0];         // null
 */
const create_board = function () {
    return R.times(
        (r) => R.times(
            (c) => (
                (r === CASTLE_POS[0] && c === CASTLE_POS[1])
                ? Object.freeze({terrain: "castle", crowns: 0})
                : null
            ),
            GRID_SIZE
        ),
        GRID_SIZE
    );
};

// ─── Cell access ────────────────────────────────────────────────────────────

/**
 * Safe cell accessor — returns `null` for out-of-bounds coordinates.
 *
 * @param {Board}  board
 * @param {number} row
 * @param {number} col
 * @returns {Cell|null}
 */
const get_cell = (board, row, col) => (
    (row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE)
    ? board[row][col]
    : null
);

/**
 * Return every `[row, col]` pair that is occupied (non-null).
 *
 * @param {Board} board
 * @returns {Array.<number[]>}
 */
const get_occupied_coords = (board) => R.chain(
    (r) => R.chain(
        (c) => (
            board[r][c] !== null
            ? [[r, c]]
            : []
        ),
        R.range(0, GRID_SIZE)
    ),
    R.range(0, GRID_SIZE)
);

// ─── Placement validation ───────────────────────────────────────────────────

/**
 * Get the cardinal neighbours of a cell that are occupied.
 *
 * @param {Board}  board
 * @param {number} row
 * @param {number} col
 * @returns {Array.<Object>} Each entry has `{ terrain, crowns, row, col }`.
 */
const get_neighbours = function (board, row, col) {
    return R.pipe(
        R.map(function (offset) {
            const dr = offset[0];
            const dc = offset[1];
            const nr = row + dr;
            const nc = col + dc;
            const cell = get_cell(board, nr, nc);
            return (
                cell
                ? Object.assign({}, cell, {row: nr, col: nc})
                : null
            );
        }),
        R.reject(R.isNil)
    )(NEIGHBOUR_OFFSETS);
};

/**
 * Validate a domino placement against three rules:
 *
 * 1. **Collision** — both target cells must be empty and in-bounds.
 * 2. **Adjacency** — at least one half must touch a matching terrain
 *    or the castle.
 * 3. **Bounding** — all occupied cells (including the new ones) must
 *    fit inside a 5×5 rectangle.
 *
 * @param {Board}  board    - Current board state.
 * @param {import("./Domino.js").Domino} domino - Domino to place.
 * @param {number} row      - Row for the primary half.
 * @param {number} col      - Column for the primary half.
 * @param {number} rotation - Rotation index (0–3).
 * @returns {ValidationResult}
 *
 * @example
 * const board  = create_board();
 * const domino = { id: 1,
 *     primary:   { terrain: "wheat", crowns: 0 },
 *     secondary: { terrain: "wheat", crowns: 0 } };
 * validate_placement(board, domino, 4, 5, 0);
 * // { valid: true, reason: "Valid placement." }
 */
const validate_placement = function (board, domino, row, col, rotation) {
    const [dr, dc] = get_secondary_offset(rotation);
    const sec_row = row + dr;
    const sec_col = col + dc;

    // ── 1. Collision check ──
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) {
        return {valid: false, reason: "Primary half is out of bounds."};
    }
    if (
        sec_row < 0 ||
        sec_row >= GRID_SIZE ||
        sec_col < 0 ||
        sec_col >= GRID_SIZE
    ) {
        return {valid: false, reason: "Secondary half is out of bounds."};
    }
    if (board[row][col] !== null) {
        return {valid: false, reason: "Primary cell is already occupied."};
    }
    if (board[sec_row][sec_col] !== null) {
        return {valid: false, reason: "Secondary cell is already occupied."};
    }

    // ── 2. Adjacency check ──
    const primary_neighbours = get_neighbours(board, row, col);
    const secondary_neighbours = get_neighbours(board, sec_row, sec_col);

    const primary_has_match = R.any(
        (n) => n.terrain === domino.primary.terrain
        || n.terrain === "castle",
        primary_neighbours
    );
    const secondary_has_match = R.any(
        (n) => n.terrain === domino.secondary.terrain
        || n.terrain === "castle",
        secondary_neighbours
    );

    if (!primary_has_match && !secondary_has_match) {
        return {
            valid: false,
            reason: "No matching adjacent terrain or castle connection."
        };
    }

    // ── 3. 5×5 Bounding-box check ──
    const occupied = get_occupied_coords(board);
    const all_coords = occupied.concat([[row, col], [sec_row, sec_col]]);

    const rows = R.map(R.head, all_coords);
    const cols = R.map(R.last, all_coords);

    const min_row = Math.min.apply(null, rows);
    const max_row = Math.max.apply(null, rows);
    const min_col = Math.min.apply(null, cols);
    const max_col = Math.max.apply(null, cols);

    const width = max_col - min_col + 1;
    const height = max_row - min_row + 1;

    if (width > 5 || height > 5) {
        return {
            valid: false,
            reason: `Placement exceeds 5x5 limit (${width}x${height}).`
        };
    }

    return {valid: true, reason: "Valid placement."};
};

// ─── Visible bounds ─────────────────────────────────────────────────────────

/**
 * Compute the row/column range that could still participate in a
 * legal placement, given the 5×5 bounding constraint.
 *
 * @param {Board} board
 * @returns {{ minRow: number, maxRow: number,
 *             minCol: number, maxCol: number }}
 */
const get_valid_bounds = function (board) {
    const occupied = get_occupied_coords(board);
    if (occupied.length === 0) {
        return {
            minRow: 0,
            maxRow: GRID_SIZE - 1,
            minCol: 0,
            maxCol: GRID_SIZE - 1
        };
    }
    const rows = R.map(R.head, occupied);
    const cols = R.map(R.last, occupied);
    const occ_min_r = Math.min.apply(null, rows);
    const occ_max_r = Math.max.apply(null, rows);
    const occ_min_c = Math.min.apply(null, cols);
    const occ_max_c = Math.max.apply(null, cols);

    return {
        minRow: Math.max(0, occ_max_r - 4),
        maxRow: Math.min(GRID_SIZE - 1, occ_min_r + 4),
        minCol: Math.max(0, occ_max_c - 4),
        maxCol: Math.min(GRID_SIZE - 1, occ_min_c + 4)
    };
};

// ─── Domino placement ───────────────────────────────────────────────────────

/**
 * Deep-clone a board (9×9 of small objects / nulls).
 *
 * @param {Board} board
 * @returns {Board}
 */
const clone_board = (board) => R.map(
    (row) => R.map(
        (cell) => (
            cell !== null
            ? Object.assign({}, cell)
            : null
        ),
        row
    ),
    board
);

/**
 * Place a domino on the board.  Validates first and throws if the
 * placement is illegal.  Returns a **new** board — the original is
 * never mutated.
 *
 * @param {Board}  board
 * @param {import("./Domino.js").Domino} domino
 * @param {number} row      - Row for the primary half.
 * @param {number} col      - Column for the primary half.
 * @param {number} rotation - Rotation index (0–3).
 * @returns {Board} New board with the domino placed.
 * @throws {Error} If the placement is invalid.
 *
 * @example
 * let board = create_board();
 * board = place_domino(board, domino, 4, 5, 0);
 * board[4][5].terrain; // domino.primary.terrain
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
    get_valid_bounds,
    clone_board,
    place_domino
};
