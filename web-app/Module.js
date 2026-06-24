/**
 * Module.js — Public API facade for the Kingdomino game engine.
 *
 * Re-exports every public function and constant from the four game
 * modules so that the entire API is accessible from a single import.
 * This is the entry-point used by `main.js` to expose the game in
 * the browser console as `window.Kingdomino`.
 *
 * @module Kingdomino
 * @see module:Domino
 * @see module:Board
 * @see module:Scoring
 * @see module:Game
 */

import {
    TERRAIN_TYPES,
    ROTATION_OFFSETS,
    TILE_DATA,
    create_domino,
    build_deck,
    get_secondary_offset
} from "./Domino.js";

import {
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
} from "./Board.js";

import {
    find_zones,
    score_zones,
    score_board
} from "./Scoring.js";

import {
    PHASES,
    PLAYER_CONFIGS,
    TILES_PER_DEAL,
    shuffle_array,
    has_valid_placement,
    get_player,
    create_player,
    create_game,
    deal_from_deck,
    place_meeple,
    attempt_placement,
    check_auto_discard,
    advance_to_next_slot
} from "./Game.js";

export {
    TERRAIN_TYPES,
    ROTATION_OFFSETS,
    TILE_DATA,
    create_domino,
    build_deck,
    get_secondary_offset,
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
    place_domino,
    find_zones,
    score_zones,
    score_board,
    PHASES,
    PLAYER_CONFIGS,
    TILES_PER_DEAL,
    shuffle_array,
    has_valid_placement,
    get_player,
    create_player,
    create_game,
    deal_from_deck,
    place_meeple,
    attempt_placement,
    check_auto_discard,
    advance_to_next_slot
};
