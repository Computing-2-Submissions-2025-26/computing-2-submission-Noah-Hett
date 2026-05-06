/**
 * Domino.js — Domino data structures and deck factory for Kingdomino.
 *
 * Dominoes are immutable value objects. Rotation is NOT stored on the
 * domino itself — it is tracked by the board when a domino is placed.
 *
 * @module Domino
 */

import R from "./ramda.js";

// ─── Terrain types ──────────────────────────────────────────────────────────
// Display colours are used by the test UI; the scoring engine uses the keys.
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
// Index → [rowOffset, colOffset] for the secondary tile relative to primary.
//   0 = Right   1 = Down   2 = Left   3 = Up
const ROTATION_OFFSETS = Object.freeze([
    Object.freeze([0, 1]),
    Object.freeze([1, 0]),
    Object.freeze([0, -1]),
    Object.freeze([-1, 0])
]);

// ─── Compact tile data ──────────────────────────────────────────────────────
// Each entry: [primaryTerrain, primaryCrowns, secondaryTerrain, secondaryCrowns]
// Ordered by tile number (index + 1 = draft priority / back-of-tile number).
//
// The 48 tiles match the official Kingdomino base-game distribution:
//   Wheat: 26 squares, 5 crowns | Forest: 22 sq, 6 cr | Water: 18 sq, 6 cr
//   Grassland: 14 sq, 6 cr     | Swamp: 10 sq, 6 cr  | Mine: 6 sq, 7 cr
const TILE_DATA = Object.freeze([
    // ── Same-terrain pairs, no crowns (tiles 1–12) ──
    ["wheat", 0, "wheat", 0],           // 1
    ["wheat", 0, "wheat", 0],           // 2
    ["forest", 0, "forest", 0],         // 3
    ["forest", 0, "forest", 0],         // 4
    ["forest", 0, "forest", 0],         // 5
    ["forest", 0, "forest", 0],         // 6
    ["water", 0, "water", 0],           // 7
    ["water", 0, "water", 0],           // 8
    ["water", 0, "water", 0],           // 9
    ["grassland", 0, "grassland", 0],   // 10
    ["grassland", 0, "grassland", 0],   // 11
    ["swamp", 0, "swamp", 0],           // 12

    // ── Mixed terrains, no crowns (tiles 13–19) ──
    ["wheat", 0, "forest", 0],          // 13
    ["wheat", 0, "water", 0],           // 14
    ["wheat", 0, "grassland", 0],       // 15
    ["wheat", 0, "swamp", 0],           // 16
    ["wheat", 0, "mine", 0],            // 17
    ["forest", 0, "water", 0],          // 18
    ["forest", 0, "grassland", 0],      // 19

    // ── 1 crown, wheat primary (tiles 20–24) ──
    ["wheat", 1, "forest", 0],          // 20
    ["wheat", 1, "water", 0],           // 21
    ["wheat", 1, "grassland", 0],       // 22
    ["wheat", 1, "swamp", 0],           // 23
    ["wheat", 1, "mine", 0],            // 24

    // ── 1 crown, forest primary (tiles 25–30) ──
    ["forest", 1, "wheat", 0],          // 25
    ["forest", 1, "wheat", 0],          // 26
    ["forest", 1, "forest", 0],         // 27
    ["forest", 1, "forest", 0],         // 28
    ["forest", 1, "forest", 0],         // 29
    ["forest", 1, "forest", 0],         // 30

    // ── 1 crown, water/grass/swamp/mine primary (tiles 31–40) ──
    ["water", 1, "wheat", 0],           // 31
    ["water", 1, "wheat", 0],           // 32
    ["water", 1, "forest", 0],          // 33
    ["water", 1, "forest", 0],          // 34
    ["water", 1, "forest", 0],          // 35
    ["water", 1, "grassland", 0],       // 36
    ["grassland", 1, "wheat", 0],       // 37
    ["grassland", 1, "water", 0],       // 38
    ["swamp", 1, "grassland", 0],       // 39
    ["mine", 1, "wheat", 0],            // 40

    // ── 2 crowns (tiles 41–46) ──
    ["wheat", 0, "grassland", 2],       // 41
    ["wheat", 0, "water", 2],           // 42
    ["wheat", 0, "mine", 2],            // 43
    ["wheat", 0, "swamp", 2],           // 44
    ["mine", 2, "grassland", 0],        // 45
    ["swamp", 2, "grassland", 0],       // 46

    // ── 3 crowns (tiles 47–48) ──
    ["mine", 2, "swamp", 0],            // 47
    ["mine", 3, "wheat", 0]             // 48
]);

// ─── Factory functions ──────────────────────────────────────────────────────

/**
 * Create a single frozen domino object.
 * @param {number} id        - Tile number (1–48).
 * @param {string} p_terrain - Primary terrain type.
 * @param {number} p_crowns  - Crown count on primary half.
 * @param {string} s_terrain - Secondary terrain type.
 * @param {number} s_crowns  - Crown count on secondary half.
 * @returns {Object} Frozen domino: { id, primary: {terrain, crowns}, secondary: {terrain, crowns} }
 */
const create_domino = (id, p_terrain, p_crowns, s_terrain, s_crowns) =>
    Object.freeze({
        id,
        primary: Object.freeze({ terrain: p_terrain, crowns: p_crowns }),
        secondary: Object.freeze({ terrain: s_terrain, crowns: s_crowns })
    });

/**
 * Build the full 48-domino deck from the compressed tile data.
 * @returns {Object[]} Array of 48 frozen domino objects, ordered by tile number.
 */
const build_deck = () => R.addIndex(R.map)(
    (tile, i) => create_domino(i + 1, tile[0], tile[1], tile[2], tile[3]),
    TILE_DATA
);

/**
 * Get the [rowOffset, colOffset] of the secondary tile relative to the
 * primary tile for a given rotation index (0–3).
 * @param {number} rotation_index - 0: Right, 1: Down, 2: Left, 3: Up.
 * @returns {number[]} [rowOffset, colOffset]
 */
const get_secondary_offset = (rotation_index) => ROTATION_OFFSETS[rotation_index];

export {
    TERRAIN_TYPES,
    ROTATION_OFFSETS,
    TILE_DATA,
    create_domino,
    build_deck,
    get_secondary_offset
};
