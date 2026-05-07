/**
 * Game.js — Game state machine for 2-player Kingdomino.
 *
 * Layers on top of Board.js, Scoring.js, and Domino.js to manage
 * multi-player state, deck shuffling, and the drafting loop.
 *
 * All public functions are **pure** — they take a game state and
 * return a new game state, never mutating the original.
 *
 * @module Game
 */

import R from "./ramda.js";
import { build_deck } from "./Domino.js";
import {
    GRID_SIZE,
    create_board,
    validate_placement,
    place_domino
} from "./Board.js";
import { score_board } from "./Scoring.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const PHASES = Object.freeze({
    DRAFT_INITIAL: "DRAFT_INITIAL",
    RESOLVE_PLACE: "RESOLVE_PLACE",
    RESOLVE_DRAFT: "RESOLVE_DRAFT",
    GAME_OVER: "GAME_OVER"
});

const PLAYER_CONFIGS = Object.freeze([
    { id: "P1", color: "#E91E63", name: "Player 1" },
    { id: "P2", color: "#2196F3", name: "Player 2" }
]);

const TILES_PER_DEAL = 4;
const MEEPLES_PER_PLAYER = 2;

// ─── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Fisher-Yates shuffle. Returns a new array — does not mutate.
 * @param {Array} array
 * @returns {Array}
 */
const shuffle_array = (array) => {
    const out = [...array];
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
};

/**
 * Check whether a domino can be legally placed ANYWHERE on a board
 * (any cell, any rotation). Used for forced-discard detection.
 * @param {Array[]} board
 * @param {Object}  domino
 * @returns {boolean}
 */
const has_valid_placement = (board, domino) => {
    for (let r = 0; r < GRID_SIZE; r += 1) {
        for (let c = 0; c < GRID_SIZE; c += 1) {
            for (let rot = 0; rot < 4; rot += 1) {
                if (validate_placement(board, domino, r, c, rot).valid) {
                    return true;
                }
            }
        }
    }
    return false;
};

/** Look up a player object by id. */
const get_player = (state, pid) => state.players.find((p) => p.id === pid);

/** Return a new state with one player's board (and score) replaced. */
const update_player_board = (state, pid, new_board) => ({
    ...state,
    players: state.players.map((p) =>
        (p.id === pid
            ? { ...p, board: new_board, score: score_board(new_board) }
            : p)
    )
});

/** Deal 4 tiles from the deck, sorted by id. Returns { line, deck }. */
const deal_from_deck = (deck) => {
    if (deck.length < TILES_PER_DEAL) {
        return { line: [], deck };
    }
    const dealt = R.sortBy(R.prop("id"), deck.slice(0, TILES_PER_DEAL));
    const remaining = deck.slice(TILES_PER_DEAL);
    const line = dealt.map((d) => ({ domino: d, meeple: null }));
    return { line, deck: remaining };
};

// ─── State creation ─────────────────────────────────────────────────────────

/** Create a player with a fresh board. */
const create_player = (id, color, name) => ({
    id,
    color,
    name,
    board: create_board(),
    score: 0
});

/**
 * Create the initial game state for a 2-player game.
 * Shuffles the full 48-tile deck, takes 24, deals the first 4
 * to next_line, and randomises the initial meeple order.
 *
 * @param {number} [player_count=2]
 * @returns {Object} Initial game state.
 */
const create_game = function (player_count = 2) {
    const shuffled = shuffle_array(build_deck());
    const game_tiles = shuffled.slice(0, 12 * player_count);

    const players = R.times(
        (i) => create_player(
            PLAYER_CONFIGS[i].id,
            PLAYER_CONFIGS[i].color,
            PLAYER_CONFIGS[i].name
        ),
        player_count
    );

    // Deal first 4 to next_line
    const { line: next_line, deck } = deal_from_deck(game_tiles);

    // Randomise initial meeple order: [P1, P1, P2, P2] shuffled
    const meeple_order = shuffle_array(
        R.chain((p) => R.repeat(p.id, MEEPLES_PER_PLAYER), players)
    );

    return {
        players,
        deck,
        current_line: [],
        next_line,
        current_line_index: 0,
        phase: PHASES.DRAFT_INITIAL,
        active_player_id: meeple_order[0],
        round: 1,
        meeple_order,
        meeple_order_index: 0,
        message: `Round 1 draft: ${meeple_order[0]} picks a tile.`
    };
};

// ─── Phase transitions ──────────────────────────────────────────────────────

/**
 * Check if the active player has any valid placement for their tile.
 * If not, auto-discard and advance to the draft sub-phase (or next turn).
 */
const check_auto_discard = function (state) {
    if (state.phase !== PHASES.RESOLVE_PLACE) {
        return state;
    }
    const slot = state.current_line[state.current_line_index];
    const player = get_player(state, state.active_player_id);

    if (has_valid_placement(player.board, slot.domino)) {
        return state;
    }

    // No valid placement — forced discard
    const msg = `${player.id}: No valid placement for tile `
        + `#${slot.domino.id}. Discarded.`;

    // Final round (no next_line) → skip drafting entirely
    if (state.next_line.length === 0) {
        return advance_to_next_slot({ ...state, message: msg });
    }
    return { ...state, phase: PHASES.RESOLVE_DRAFT, message: msg };
};

/**
 * Transition from completed draft (initial or end-of-round) into the
 * resolve phase: next_line → current_line, deal new next_line, start
 * resolving from index 0.
 */
const start_resolve_phase = function (state) {
    const new_current = state.next_line;
    const { line: new_next, deck: new_deck } = deal_from_deck(state.deck);
    const first_pid = new_current[0].meeple;

    const base = {
        ...state,
        current_line: new_current,
        next_line: new_next,
        deck: new_deck,
        current_line_index: 0,
        phase: PHASES.RESOLVE_PLACE,
        active_player_id: first_pid,
        round: state.round + 1,
        message: `${first_pid}: Place tile #${new_current[0].domino.id}.`
    };
    return check_auto_discard(base);
};

/**
 * Advance to the next current_line slot after drafting (or after
 * placement in the final round). If all 4 are done, trigger
 * end-of-round or end-of-game.
 */
const advance_to_next_slot = function (state) {
    const next_idx = state.current_line_index + 1;

    // All 4 slots resolved?
    if (next_idx >= TILES_PER_DEAL) {
        // End of round
        if (state.next_line.length === 0 && state.deck.length === 0) {
            return {
                ...state,
                phase: PHASES.GAME_OVER,
                message: "Game over! Final scores tallied."
            };
        }
        // Start next resolve phase (next_line → current, deal new next)
        return start_resolve_phase(state);
    }

    // Move to next slot
    const next_slot = state.current_line[next_idx];
    const base = {
        ...state,
        current_line_index: next_idx,
        phase: PHASES.RESOLVE_PLACE,
        active_player_id: next_slot.meeple,
        message: `${next_slot.meeple}: Place tile #${next_slot.domino.id}.`
    };
    return check_auto_discard(base);
};

// ─── Player actions ─────────────────────────────────────────────────────────

/**
 * Place a meeple on a next_line slot.
 * Used in both DRAFT_INITIAL and RESOLVE_DRAFT phases.
 *
 * @param {Object} state       - Current game state.
 * @param {number} line_index  - Index into next_line (0–3).
 * @returns {Object} New game state.
 */
const place_meeple = function (state, line_index) {
    if (state.phase !== PHASES.DRAFT_INITIAL
        && state.phase !== PHASES.RESOLVE_DRAFT) {
        return { ...state, message: "Not in a drafting phase." };
    }
    if (line_index < 0 || line_index >= state.next_line.length) {
        return { ...state, message: "Invalid slot." };
    }
    if (state.next_line[line_index].meeple !== null) {
        return { ...state, message: "Slot already taken." };
    }

    const pid = state.active_player_id;
    const new_next = state.next_line.map((slot, i) =>
        (i === line_index ? { ...slot, meeple: pid } : slot)
    );
    const updated = { ...state, next_line: new_next };

    if (state.phase === PHASES.DRAFT_INITIAL) {
        // Advance to next meeple in the initial draft
        const next_mi = state.meeple_order_index + 1;
        if (next_mi >= state.meeple_order.length) {
            // All meeples placed — transition to resolve
            return start_resolve_phase(updated);
        }
        return {
            ...updated,
            meeple_order_index: next_mi,
            active_player_id: state.meeple_order[next_mi],
            message: `${state.meeple_order[next_mi]} picks a tile.`
        };
    }

    // RESOLVE_DRAFT — advance to next current_line slot
    return advance_to_next_slot(updated);
};

/**
 * Attempt to place the active tile on the active player's board.
 *
 * @param {Object} state
 * @param {number} row
 * @param {number} col
 * @param {number} rotation  - Rotation index (0–3).
 * @returns {Object} New game state.
 */
const attempt_placement = function (state, row, col, rotation) {
    if (state.phase !== PHASES.RESOLVE_PLACE) {
        return { ...state, message: "Not in placement phase." };
    }

    const slot = state.current_line[state.current_line_index];
    const pid = state.active_player_id;
    const player = get_player(state, pid);

    const result = validate_placement(player.board, slot.domino, row, col, rotation);
    if (!result.valid) {
        return { ...state, message: result.reason };
    }

    // Place the domino — get a new board
    const new_board = place_domino(player.board, slot.domino, row, col, rotation);
    let new_state = update_player_board(state, pid, new_board);

    const score = score_board(new_board);
    new_state.message = `${pid} placed tile #${slot.domino.id}. Score: ${score}.`;

    // Final round — no drafting, advance directly
    if (new_state.next_line.length === 0) {
        return advance_to_next_slot(new_state);
    }
    // Transition to draft sub-phase
    return { ...new_state, phase: PHASES.RESOLVE_DRAFT };
};

export {
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
