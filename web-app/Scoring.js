/**
 * Scoring.js — Flood-fill scoring engine for Kingdomino.
 *
 * Finds contiguous zones of matching terrain using depth-first search,
 * then scores each zone as `tileCount × crownCount`.  Castle cells are
 * excluded from zones (they contribute no points).
 *
 * @module Scoring
 */

import R from "./ramda.js";
import {GRID_SIZE, get_cell, NEIGHBOUR_OFFSETS} from "./Board.js";

// ─── Type definitions ───────────────────────────────────────────────────────

/**
 * A contiguous group of same-terrain tiles found by the flood-fill.
 * @typedef  {Object} Zone
 * @property {string}          terrain    - The terrain type of this zone.
 * @property {number}          tileCount  - Number of tiles in the zone.
 * @property {number}          crownCount - Total crowns across all tiles.
 * @property {Array.<number[]>} cells     - `[row, col]` of every tile.
 */

// ─── Zone detection (Depth-First Search / Flood Fill) ───────────────────────

/**
 * Find every contiguous terrain zone on the board.
 *
 * Algorithm:
 *   1. Create a 9×9 `visited` matrix, initialised to `false`.
 *   2. Scan each cell.  Skip empty, castle, and already-visited cells.
 *   3. For each unvisited terrain cell, run a DFS that accumulates
 *      `tileCount`, `crownCount`, and cell coordinates.
 *   4. Adjacent cells with the same terrain are recursively included.
 *
 * @param {import("./Board.js").Board} board - 9×9 game board.
 * @returns {Zone[]} Array of zone objects.
 *
 * @example
 * const zones = find_zones(board);
 * zones[0].terrain;    // e.g. "wheat"
 * zones[0].tileCount;  // e.g. 4
 * zones[0].crownCount; // e.g. 2
 */
const find_zones = function (board) {
    const visited = R.times(
        () => R.times(() => false, GRID_SIZE),
        GRID_SIZE
    );

    const zones = [];

    /**
     * Recursive DFS from a single cell.
     * @param {number} row
     * @param {number} col
     * @param {string} terrain - The terrain type being traced.
     * @param {Object} zone    - Mutable accumulator.
     */
    const dfs = function (row, col, terrain, zone) {
        if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) {
            return;
        }
        if (visited[row][col]) {
            return;
        }

        const cell = get_cell(board, row, col);

        if (cell === null || cell.terrain !== terrain) {
            return;
        }

        visited[row][col] = true;
        zone.tileCount += 1;
        zone.crownCount += cell.crowns;
        zone.cells.push([row, col]);

        R.forEach(
            function ([dr, dc]) {
                dfs(row + dr, col + dc, terrain, zone);
            },
            NEIGHBOUR_OFFSETS
        );
    };

    R.forEach(
        (r) => R.forEach(
            function (c) {
                const cell = board[r][c];

                if (
                    cell === null
                    || cell.terrain === "castle"
                    || visited[r][c]
                ) {
                    return;
                }

                const zone = {
                    terrain: cell.terrain,
                    tileCount: 0,
                    crownCount: 0,
                    cells: []
                };

                dfs(r, c, cell.terrain, zone);
                zones.push(zone);
            },
            R.range(0, GRID_SIZE)
        ),
        R.range(0, GRID_SIZE)
    );

    return zones;
};

// ─── Score calculation ──────────────────────────────────────────────────────

/**
 * Calculate the total score from an array of zones.
 *
 * Each zone scores `tileCount × crownCount`.  A zone with zero crowns
 * contributes nothing.
 *
 * @param {Zone[]} zones
 * @returns {number} Total score.
 *
 * @example
 * score_zones([
 *     { terrain: "wheat", tileCount: 3, crownCount: 2, cells: [] }
 * ]); // 6
 */
const score_zones = (zones) => R.reduce(
    (total, zone) => total + zone.tileCount * zone.crownCount,
    0,
    zones
);

/**
 * Convenience wrapper: find all zones on a board and return the
 * total score.
 *
 * @param {import("./Board.js").Board} board
 * @returns {number} Total score for the board.
 *
 * @example
 * score_board(create_board()); // 0  (castle-only board)
 */
const score_board = (board) => score_zones(find_zones(board));

export {find_zones, score_zones, score_board};
