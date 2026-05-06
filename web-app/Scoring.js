/**
 * Scoring.js — Flood-fill scoring engine for Kingdomino.
 *
 * Finds contiguous zones of matching terrain using DFS, then scores
 * each zone as  tileCount × crownCount.  Castle cells are skipped.
 *
 * @module Scoring
 */

import R from "./ramda.js";
import { GRID_SIZE, get_cell, NEIGHBOUR_OFFSETS } from "./Board.js";

// ─── Zone detection (Depth-First Search / Flood Fill) ───────────────────────

/**
 * Find all contiguous terrain zones on the board.
 *
 * Algorithm:
 *   1. Create a 9×9 `visited` matrix, all false.
 *   2. For each unvisited, non-null, non-castle cell, start a DFS.
 *   3. The DFS accumulates tileCount, crownCount, and cell coordinates.
 *   4. Adjacent cells with the same terrain are recursively included.
 *
 * @param {Array[]} board - 9×9 game board.
 * @returns {Object[]} Array of zone objects:
 *   { terrain, tileCount, crownCount, cells: [[row, col], ...] }
 */
const find_zones = function (board) {
    // Initialise visited tracker
    const visited = R.times(
        () => R.times(() => false, GRID_SIZE),
        GRID_SIZE
    );

    const zones = [];

    /**
     * Recursive DFS from a single cell, accumulating into the zone object.
     * @param {number} row
     * @param {number} col
     * @param {string} terrain - The terrain type of the current zone.
     * @param {Object} zone    - Mutable accumulator { tileCount, crownCount, cells }.
     */
    const dfs = function (row, col, terrain, zone) {
        // Bounds check
        if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) {
            return;
        }
        // Already visited
        if (visited[row][col]) {
            return;
        }

        const cell = get_cell(board, row, col);

        // Empty cell or terrain mismatch
        if (cell === null || cell.terrain !== terrain) {
            return;
        }

        // Mark visited and accumulate
        visited[row][col] = true;
        zone.tileCount += 1;
        zone.crownCount += cell.crowns;
        zone.cells.push([row, col]);

        // Recurse into cardinal neighbours
        R.forEach(
            ([dr, dc]) => dfs(row + dr, col + dc, terrain, zone),
            NEIGHBOUR_OFFSETS
        );
    };

    // Scan every cell on the board
    R.forEach(
        (r) => R.forEach(
            (c) => {
                const cell = board[r][c];

                // Skip empty cells, castle, and already-visited cells
                if (cell === null || cell.terrain === "castle" || visited[r][c]) {
                    return;
                }

                // Start a new zone
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
 * Each zone scores:  tileCount × crownCount
 * (A zone with 0 crowns scores 0, regardless of size.)
 *
 * @param {Object[]} zones - Array of zone objects from find_zones.
 * @returns {number} Total score.
 */
const score_zones = (zones) => R.reduce(
    (total, zone) => total + zone.tileCount * zone.crownCount,
    0,
    zones
);

/**
 * Convenience: find all zones on a board and return the total score.
 * @param {Array[]} board
 * @returns {number}
 */
const score_board = (board) => score_zones(find_zones(board));

export { find_zones, score_zones, score_board };
