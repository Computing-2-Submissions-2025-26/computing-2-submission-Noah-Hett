/**
 * Domino.js — Domino data structures and deck factory for Kingdomino.
 *
 * A domino is an immutable tile made of two halves, each with a terrain
 * type and a crown count.  The full 48-tile Kingdomino base-game deck
 * is built from the compact {@link TILE_DATA} table.
 *
 * Rotation is NOT stored on the domino — it is supplied at placement
 * time and resolved by {@link get_secondary_offset}.
 *
 * @module Domino
 */

import R from "./ramda.js";

// ─── Type definitions ───────────────────────────────────────────────────────

/**
 * One half of a domino tile.
 * @typedef  {Object} TileHalf
 * @property {string} terrain - Terrain type (e.g. "wheat", "forest").
 * @property {number} crowns  - Number of crowns on this half (0–3).
 */

/**
 * An immutable domino tile consisting of two halves.
 * @typedef  {Object} Domino
 * @property {number}   id        - Unique tile number (1–48).
 * @property {TileHalf} primary   - The first (anchor) half.
 * @property {TileHalf} secondary - The second half, placed via rotation.
 */

// ─── Terrain types ──────────────────────────────────────────────────────────

/**
 * Map of terrain names to their display hex colours.
 * The six playable terrains plus the special "castle" type.
 * @type {Object.<string, string>}
 */
const TERRAIN_TYPES = Object.freeze({
    wheat: "#E8B84B",
    forest: "#2D6A2E",
    water: "#3B82C8",
    grassland: "#7EC850",
    swamp: "#6B5B3A",
    mine: "#4A4A4A",
    castle: "#F5F5F5"
});

// ─── Rotation offsets ───────────────────────────────────────────────────────

/**
 * Rotation index → `[rowOffset, colOffset]` for the secondary half
 * relative to the primary half.
 *
 * | Index | Direction | Offset    |
 * |-------|-----------|-----------|
 * | 0     | Right     | [0,  1]   |
 * | 1     | Down      | [1,  0]   |
 * | 2     | Left      | [0, −1]   |
 * | 3     | Up        | [−1, 0]   |
 *
 * @type {Array.<number[]>}
 */
const ROTATION_OFFSETS = Object.freeze([
    Object.freeze([0, 1]),
    Object.freeze([1, 0]),
    Object.freeze([0, -1]),
    Object.freeze([-1, 0])
]);

// ─── Compact tile data ──────────────────────────────────────────────────────

/**
 * Compact representation of all 48 Kingdomino base-game tiles.
 *
 * Each entry is `[primaryTerrain, primaryCrowns, secondaryTerrain,
 * secondaryCrowns]`.  Array index + 1 gives the tile number used for
 * draft-priority sorting.
 *
 * @type {Array.<Array>}
 */
const TILE_DATA = Object.freeze([
    // ── Same-terrain pairs, no crowns (tiles 1–12) ──
    ["wheat", 0, "wheat", 0],
    ["wheat", 0, "wheat", 0],
    ["forest", 0, "forest", 0],
    ["forest", 0, "forest", 0],
    ["forest", 0, "forest", 0],
    ["forest", 0, "forest", 0],
    ["water", 0, "water", 0],
    ["water", 0, "water", 0],
    ["water", 0, "water", 0],
    ["grassland", 0, "grassland", 0],
    ["grassland", 0, "grassland", 0],
    ["swamp", 0, "swamp", 0],

    // ── Mixed terrains, no crowns (tiles 13–18) ──
    ["wheat", 0, "forest", 0],
    ["wheat", 0, "water", 0],
    ["wheat", 0, "grassland", 0],
    ["wheat", 0, "swamp", 0],
    ["forest", 0, "water", 0],
    ["forest", 0, "grassland", 0],

    // ── 1 crown, wheat primary (tiles 19–23) ──
    ["wheat", 1, "forest", 0],
    ["wheat", 1, "water", 0],
    ["wheat", 1, "grassland", 0],
    ["wheat", 1, "swamp", 0],
    ["wheat", 1, "mine", 0],

    // ── 1 crown, forest primary (tiles 24–29) ──
    ["forest", 1, "wheat", 0],
    ["forest", 1, "wheat", 0],
    ["forest", 1, "wheat", 0],
    ["forest", 1, "wheat", 0],
    ["forest", 1, "water", 0],
    ["forest", 1, "grassland", 0],

    // ── 1 crown, water/grass/swamp/mine primary (tiles 30–40) ──
    ["water", 1, "wheat", 0],
    ["water", 1, "wheat", 0],
    ["water", 1, "forest", 0],
    ["water", 1, "forest", 0],
    ["water", 1, "forest", 0],
    ["water", 1, "forest", 0],

    ["grassland", 1, "wheat", 0],
    ["grassland", 1, "water", 0],
    ["swamp", 1, "wheat", 0],
    ["swamp", 1, "grassland", 0],
    ["mine", 1, "wheat", 0],

    // ── 2 crowns (tiles 41–47) ──
    ["wheat", 0, "grassland", 2],
    ["water", 0, "grassland", 2],
    ["wheat", 0, "swamp", 2],
    ["grassland", 0, "swamp", 2],
    ["mine", 2, "wheat", 0],
    ["mine", 2, "swamp", 0],
    ["mine", 2, "swamp", 0],

    // ── 3 crowns (tile 48) ──
    ["mine", 3, "wheat", 0]
]);

// ─── Factory functions ──────────────────────────────────────────────────────

/**
 * Create a single frozen {@link Domino} object.
 *
 * @param {number} id        - Tile number (1–48).
 * @param {string} p_terrain - Primary terrain type.
 * @param {number} p_crowns  - Crown count on the primary half.
 * @param {string} s_terrain - Secondary terrain type.
 * @param {number} s_crowns  - Crown count on the secondary half.
 * @returns {Domino} A frozen domino value object.
 *
 * @example
 * const tile = create_domino(19, "wheat", 1, "forest", 0);
 * tile.primary.terrain;  // "wheat"
 * tile.secondary.crowns; // 0
 */
const create_domino = (
    id,
    p_terrain,
    p_crowns,
    s_terrain,
    s_crowns
) => Object.freeze({
    id,
    primary: Object.freeze({
        terrain: p_terrain,
        crowns: p_crowns
    }),
    secondary: Object.freeze({
        terrain: s_terrain,
        crowns: s_crowns
    })
});

/**
 * Build the full 48-domino deck from {@link TILE_DATA}.
 *
 * @returns {Domino[]} Array of 48 frozen domino objects, IDs 1–48.
 *
 * @example
 * const deck = build_deck();
 * deck.length; // 48
 * deck[0].id;  // 1
 */
const build_deck = () => R.addIndex(R.map)(
    (tile, i) => create_domino(i + 1, tile[0], tile[1], tile[2], tile[3]),
    TILE_DATA
);

/**
 * Get the row/column offset of the secondary half relative to the
 * primary half for a given rotation.
 *
 * @param {number} rotation_index - 0: Right, 1: Down, 2: Left, 3: Up.
 * @returns {number[]} `[rowOffset, colOffset]`
 *
 * @example
 * get_secondary_offset(0); // [0,  1]  — secondary is to the right
 * get_secondary_offset(3); // [-1, 0]  — secondary is above
 */
const get_secondary_offset = (rotation_index) => (
    ROTATION_OFFSETS[rotation_index]
);

export {
    TERRAIN_TYPES,
    ROTATION_OFFSETS,
    TILE_DATA,
    create_domino,
    build_deck,
    get_secondary_offset
};
