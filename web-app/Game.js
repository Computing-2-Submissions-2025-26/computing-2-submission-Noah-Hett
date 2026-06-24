/**
 * Game.js — Game state machine for 2-player Kingdomino.
 *
 * Layers on top of {@link module:Board}, {@link module:Scoring}, and
 * {@link module:Domino} to manage multi-player state, deck shuffling,
 * and the draft-then-place loop.
 *
 * All public functions are **pure** — they accept a game state and
 * return a new game state, never mutating the original.
 *
 * @module Game
 */

import R from "./ramda.js";
import {build_deck} from "./Domino.js";
import {
    GRID_SIZE,
    create_board,
    validate_placement,
    place_domino
} from "./Board.js";
import {score_board} from "./Scoring.js";

// ─── Type definitions ───────────────────────────────────────────────────────

/**
 * The four phases of a Kingdomino game.
 * @typedef {"DRAFT_INITIAL"|"RESOLVE_PLACE"|"RESOLVE_DRAFT"|"GAME_OVER"} Phase
 */

/**
 * A slot in the draft line pairing a domino with a meeple claim.
 * @typedef  {Object} DraftSlot
 * @property {import("./Domino.js").Domino} domino - The tile.
 * @property {string|null} meeple - Player id who claimed this slot,
 *   or `null` if unclaimed.
 */

/**
 * A player's state within the game.
 * @typedef  {Object} Player
 * @property {string} id    - e.g. "P1".
 * @property {string} color - CSS hex colour.
 * @property {string} name  - Display name.
 * @property {import("./Board.js").Board} board - The player's kingdom.
 * @property {number} score - Current score.
 */

/**
 * Complete snapshot of a Kingdomino game.
 * @typedef  {Object} GameState
 * @property {Player[]}    players
 * @property {import("./Domino.js").Domino[]} deck
 * @property {DraftSlot[]} current_line
 * @property {DraftSlot[]} next_line
 * @property {number}      current_line_index
 * @property {Phase}       phase
 * @property {string}      active_player_id
 * @property {number}      round
 * @property {string[]}    meeple_order
 * @property {number}      meeple_order_index
 * @property {string}      message
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Enum of game phases.
 * @type {Object.<string, Phase>}
 */
const PHASES = Object.freeze({
    DRAFT_INITIAL: "DRAFT_INITIAL",
    RESOLVE_PLACE: "RESOLVE_PLACE",
    RESOLVE_DRAFT: "RESOLVE_DRAFT",
    GAME_OVER: "GAME_OVER"
});

/**
 * Default player configurations.
 * @type {Array.<{id: string, color: string, name: string}>}
 */
const PLAYER_CONFIGS = Object.freeze([
    {id: "P1", color: "#E91E63", name: "Player 1"},
    {id: "P2", color: "#2196F3", name: "Player 2"}
]);

/** Number of tiles dealt per round. @constant {number} */
const TILES_PER_DEAL = 4;

/** Meeples each player contributes to the draft. @constant {number} */
const MEEPLES_PER_PLAYER = 2;

// ─── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Fisher–Yates shuffle.  Returns a **new** array — the original is
 * not mutated.
 *
 * @param {Array} array - The array to shuffle.
 * @returns {Array} A shuffled shallow copy.
 */
const shuffle_array = function (array) {
    const out = array.slice();
    R.forEach(
        function (i) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = out[i];
            out[i] = out[j];
            out[j] = tmp;
        },
        R.reverse(R.range(1, out.length))
    );
    return out;
};

/**
 * Check whether a domino can be legally placed **anywhere** on a
 * board (any cell, any rotation).  Used for forced-discard detection.
 *
 * @param {import("./Board.js").Board} board
 * @param {import("./Domino.js").Domino} domino
 * @returns {boolean} `true` if at least one legal placement exists.
 */
const has_valid_placement = (board, domino) => R.any(
    (r) => R.any(
        (c) => R.any(
            (rot) => validate_placement(board, domino, r, c, rot).valid,
            R.range(0, 4)
        ),
        R.range(0, GRID_SIZE)
    ),
    R.range(0, GRID_SIZE)
);

/**
 * Look up a {@link Player} by id.
 *
 * @param {GameState} state
 * @param {string}    pid
 * @returns {Player}
 */
const get_player = (state, pid) => state.players.find(
    (p) => p.id === pid
);

/**
 * Return a new state with one player's board (and score) replaced.
 *
 * @param {GameState} state
 * @param {string}    pid
 * @param {import("./Board.js").Board} new_board
 * @returns {GameState}
 */
const update_player = function (state, pid, new_board) {
    return Object.assign({}, state, {
        players: state.players.map((p) => (
            p.id === pid
            ? Object.assign({}, p, {
                board: new_board,
                score: score_board(new_board)
            })
            : p
        ))
    });
};

/**
 * Deal 4 tiles from the deck, sorted by tile id.
 *
 * @param {import("./Domino.js").Domino[]} deck
 * @returns {{ line: DraftSlot[], deck: import("./Domino.js").Domino[] }}
 */
const deal_from_deck = function (deck) {
    if (deck.length < TILES_PER_DEAL) {
        return {line: [], deck};
    }
    const dealt = R.sortBy(R.prop("id"), deck.slice(0, TILES_PER_DEAL));
    const remaining = deck.slice(TILES_PER_DEAL);
    const line = dealt.map((d) => ({domino: d, meeple: null}));
    return {line, deck: remaining};
};

// ─── State creation ─────────────────────────────────────────────────────────

/**
 * Create a player with a fresh board.
 *
 * @param {string} id    - Player identifier.
 * @param {string} color - CSS hex colour.
 * @param {string} name  - Display name.
 * @returns {Player}
 */
const create_player = (id, color, name) => ({
    id,
    color,
    name,
    board: create_board(),
    score: 0
});

/**
 * Create the initial game state for a 2-player game.
 *
 * Shuffles the full 48-tile deck, keeps 24 (12 × player_count),
 * deals the first 4 to `next_line`, and randomises the initial
 * meeple order.
 *
 * @param {number} [player_count=2] - Number of players.
 * @returns {GameState} The opening game state.
 *
 * @example
 * const game = create_game(2);
 * game.phase;              // "DRAFT_INITIAL"
 * game.next_line.length;   // 4
 * game.players.length;     // 2
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

    const deal_result = deal_from_deck(game_tiles);
    const next_line = deal_result.line;
    const deck = deal_result.deck;

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
 * If the active player has no valid placement for their tile,
 * auto-discard and advance to the draft sub-phase (or next turn).
 *
 * @param {GameState} state
 * @returns {GameState}
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

    const msg = `${player.id}: No valid placement for tile #${slot.domino.id}.`;

    if (state.next_line.length === 0) {
        return advance_to_next_slot(Object.assign({}, state, {message: msg}));
    }
    return Object.assign({}, state, {
        phase: PHASES.RESOLVE_DRAFT,
        message: msg
    });
};

/**
 * Transition from a completed draft into the resolve phase.
 *
 * Moves `next_line` → `current_line`, deals a fresh `next_line`
 * from the deck, and begins resolving from index 0.
 *
 * @param {GameState} state
 * @returns {GameState}
 */
const start_resolve_phase = function (state) {
    const new_current = state.next_line;
    const deal_result = deal_from_deck(state.deck);
    const new_next = deal_result.line;
    const new_deck = deal_result.deck;
    const first_pid = new_current[0].meeple;

    const base = Object.assign({}, state, {
        current_line: new_current,
        next_line: new_next,
        deck: new_deck,
        current_line_index: 0,
        phase: PHASES.RESOLVE_PLACE,
        active_player_id: first_pid,
        round: state.round + 1,
        message: `${first_pid}: Place tile #${new_current[0].domino.id}.`
    });
    return check_auto_discard(base);
};

/**
 * Advance to the next `current_line` slot after a placement or
 * draft.  If all 4 are done, trigger end-of-round or end-of-game.
 *
 * @param {GameState} state
 * @returns {GameState}
 */
const advance_to_next_slot = function (state) {
    const next_idx = state.current_line_index + 1;

    if (next_idx >= TILES_PER_DEAL) {
        if (state.next_line.length === 0 && state.deck.length === 0) {
            return Object.assign({}, state, {
                phase: PHASES.GAME_OVER,
                message: "Game over! Final scores tallied."
            });
        }
        return start_resolve_phase(state);
    }

    const next_slot = state.current_line[next_idx];
    const base = Object.assign({}, state, {
        current_line_index: next_idx,
        phase: PHASES.RESOLVE_PLACE,
        active_player_id: next_slot.meeple,
        message: `${next_slot.meeple}: Place tile #${next_slot.domino.id}.`
    });
    return check_auto_discard(base);
};

// ─── Player actions ─────────────────────────────────────────────────────────

/**
 * Claim a `next_line` slot by placing a meeple on it.
 *
 * Used in both the initial draft and the post-placement draft.
 *
 * @param {GameState} state      - Current game state.
 * @param {number}    line_index - Index into `next_line` (0–3).
 * @returns {GameState} Updated game state.
 *
 * @example
 * let game = create_game(2);
 * game = place_meeple(game, 0);  // first player claims slot 0
 * game.next_line[0].meeple;      // "P1" or "P2"
 */
const place_meeple = function (state, line_index) {
    if (
        state.phase !== PHASES.DRAFT_INITIAL
        && state.phase !== PHASES.RESOLVE_DRAFT
    ) {
        return Object.assign({}, state, {message: "Not in a drafting phase."});
    }
    if (line_index < 0 || line_index >= state.next_line.length) {
        return Object.assign({}, state, {message: "Invalid slot."});
    }
    if (state.next_line[line_index].meeple !== null) {
        return Object.assign({}, state, {message: "Slot already taken."});
    }

    const pid = state.active_player_id;
    const new_next = state.next_line.map((slot, i) => (
        i === line_index
        ? Object.assign({}, slot, {meeple: pid})
        : slot
    ));
    const updated = Object.assign({}, state, {next_line: new_next});

    if (state.phase === PHASES.DRAFT_INITIAL) {
        const next_mi = state.meeple_order_index + 1;
        if (next_mi >= state.meeple_order.length) {
            return start_resolve_phase(updated);
        }
        return Object.assign({}, updated, {
            meeple_order_index: next_mi,
            active_player_id: state.meeple_order[next_mi],
            message: `${state.meeple_order[next_mi]} picks a tile.`
        });
    }

    return advance_to_next_slot(updated);
};

/**
 * Attempt to place the active tile on the active player's board.
 *
 * If the placement is invalid the state is returned unchanged
 * (with an error message).  On success the player's board and score
 * are updated and the phase advances.
 *
 * @param {GameState} state
 * @param {number}    row
 * @param {number}    col
 * @param {number}    rotation - Rotation index (0–3).
 * @returns {GameState} Updated game state.
 *
 * @example
 * // Assuming `state` is in RESOLVE_PLACE phase:
 * const next = attempt_placement(state, 4, 5, 0);
 * next.phase; // "RESOLVE_DRAFT" (on success)
 */
const attempt_placement = function (state, row, col, rotation) {
    if (state.phase !== PHASES.RESOLVE_PLACE) {
        return Object.assign({}, state, {message: "Not in placement phase."});
    }

    const slot = state.current_line[state.current_line_index];
    const pid = state.active_player_id;
    const player = get_player(state, pid);

    const result = validate_placement(
        player.board,
        slot.domino,
        row,
        col,
        rotation
    );
    if (!result.valid) {
        return Object.assign({}, state, {message: result.reason});
    }

    const new_board = place_domino(
        player.board,
        slot.domino,
        row,
        col,
        rotation
    );
    const new_state = update_player(state, pid, new_board);

    const score = score_board(new_board);
    const msg = `${pid} placed tile #${slot.domino.id}. Score: ${score}.`;

    if (new_state.next_line.length === 0) {
        return advance_to_next_slot(
            Object.assign({}, new_state, {message: msg})
        );
    }
    return Object.assign({}, new_state, {
        phase: PHASES.RESOLVE_DRAFT,
        message: msg
    });
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
