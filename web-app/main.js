/**
 * main.js — UI controller for the Kingdomino test interface.
 *
 * This is a thin view layer that wires DOM events to the game-logic
 * modules (Domino, Board, Scoring). All state mutations go through
 * the pure backend functions.
 *
 * @module main
 */

import { build_deck, get_secondary_offset, TERRAIN_TYPES } from "./Domino.js";
import {
    GRID_SIZE,
    create_board,
    get_cell,
    validate_placement,
    place_domino
} from "./Board.js";
import { score_board } from "./Scoring.js";

// ─── Application state ─────────────────────────────────────────────────────

const ROTATION_NAMES = ["Right", "Down", "Left", "Up"];

let state = {
    board: create_board(),
    deck: build_deck(),
    used_ids: new Set(),
    history: [],           // stack of previous boards for undo
    selected_tile: null,   // domino object or null
    rotation: 0            // 0–3
};

// ─── DOM references ─────────────────────────────────────────────────────────

const board_el = document.getElementById("game-board");
const deck_el = document.getElementById("deck-grid");
const score_el = document.getElementById("score-value");
const msg_el = document.getElementById("message-bar");
const rot_name_el = document.getElementById("rotation-name");
const btn_rotate = document.getElementById("btn-rotate");
const btn_undo = document.getElementById("btn-undo");

// ─── Rendering ──────────────────────────────────────────────────────────────

/** Create the crown dot indicators for a cell. */
function render_crowns(count) {
    if (count === 0) {
        return "";
    }
    const dots = Array.from(
        { length: count },
        () => "<span class=\"crown-dot\"></span>"
    ).join("");
    return `<span class="crowns">${dots}</span>`;
}

/** Render the 9×9 game board into the DOM. */
function render_board() {
    board_el.innerHTML = "";
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = get_cell(state.board, r, c);
            const div = document.createElement("div");
            div.className = "cell";
            div.dataset.row = r;
            div.dataset.col = c;
            div.id = `cell-${r}-${c}`;

            if (cell !== null) {
                div.dataset.terrain = cell.terrain;
                if (cell.terrain === "castle") {
                    div.innerHTML = "🏰";
                } else {
                    div.innerHTML =
                        render_crowns(cell.crowns) +
                        `<span class="terrain-label">${cell.terrain}</span>`;
                }
            }

            // Hover preview (only for empty cells when a tile is selected)
            div.addEventListener("mouseenter", () => handle_hover(r, c));
            div.addEventListener("mouseleave", () => clear_preview());
            div.addEventListener("click", () => handle_cell_click(r, c));

            board_el.appendChild(div);
        }
    }
}

/** Render the tile deck in the sidebar. */
function render_deck() {
    deck_el.innerHTML = "";
    state.deck.forEach((domino) => {
        const tile_el = document.createElement("div");
        tile_el.className = "deck-tile";
        tile_el.id = `tile-${domino.id}`;

        if (state.used_ids.has(domino.id)) {
            tile_el.classList.add("used");
        }
        if (state.selected_tile && state.selected_tile.id === domino.id) {
            tile_el.classList.add("selected");
        }

        // Primary half
        const p = document.createElement("div");
        p.className = "deck-tile-half";
        p.dataset.terrain = domino.primary.terrain;
        p.innerHTML = render_crowns(domino.primary.crowns);

        // Secondary half
        const s = document.createElement("div");
        s.className = "deck-tile-half";
        s.dataset.terrain = domino.secondary.terrain;
        s.innerHTML = render_crowns(domino.secondary.crowns);

        // Tile number
        const id_el = document.createElement("span");
        id_el.className = "deck-tile-id";
        id_el.textContent = `#${domino.id}`;

        tile_el.appendChild(p);
        tile_el.appendChild(s);
        tile_el.appendChild(id_el);

        tile_el.addEventListener("click", () => select_tile(domino));
        deck_el.appendChild(tile_el);
    });
}

/** Update the score display. */
function render_score() {
    score_el.textContent = score_board(state.board);
}

/** Update the rotation indicator. */
function render_rotation() {
    rot_name_el.textContent = ROTATION_NAMES[state.rotation];
}

/** Show a message in the message bar. */
function show_message(text, type) {
    msg_el.textContent = text;
    msg_el.className = type || "";
}

/** Full UI refresh. */
function render_all() {
    render_board();
    render_deck();
    render_score();
    render_rotation();
}

// ─── Interaction handlers ───────────────────────────────────────────────────

/** Select a domino from the deck. */
function select_tile(domino) {
    if (state.used_ids.has(domino.id)) {
        return;
    }
    state.selected_tile = domino;
    show_message(
        `Selected tile #${domino.id}: ${domino.primary.terrain} | ${domino.secondary.terrain}`,
        ""
    );
    render_deck();
    // Re-render board to clear any stale previews
    render_board();
}

/** Handle hovering over a board cell — show placement preview. */
function handle_hover(row, col) {
    if (!state.selected_tile) {
        return;
    }
    const [dr, dc] = get_secondary_offset(state.rotation);
    const sr = row + dr;
    const sc = col + dc;

    const result = validate_placement(
        state.board, state.selected_tile, row, col, state.rotation
    );
    const cls = result.valid ? "preview-valid" : "preview-invalid";

    const primary_cell = document.getElementById(`cell-${row}-${col}`);
    const secondary_cell = document.getElementById(`cell-${sr}-${sc}`);

    if (primary_cell) {
        primary_cell.classList.add(cls);
    }
    if (secondary_cell) {
        secondary_cell.classList.add(cls);
    }
}

/** Clear all preview highlights. */
function clear_preview() {
    document.querySelectorAll(".cell.preview-valid, .cell.preview-invalid")
        .forEach((el) => {
            el.classList.remove("preview-valid", "preview-invalid");
        });
}

/** Handle clicking a board cell — attempt placement. */
function handle_cell_click(row, col) {
    if (!state.selected_tile) {
        show_message("Select a tile from the deck first.", "error");
        return;
    }

    const result = validate_placement(
        state.board, state.selected_tile, row, col, state.rotation
    );

    if (!result.valid) {
        show_message(result.reason, "error");
        return;
    }

    // Save current board for undo
    state.history.push(state.board);

    // Place the domino (returns a new board)
    state.board = place_domino(
        state.board, state.selected_tile, row, col, state.rotation
    );

    // Mark tile as used
    state.used_ids.add(state.selected_tile.id);
    const placed_id = state.selected_tile.id;
    state.selected_tile = null;

    show_message(
        `Placed tile #${placed_id}. Score: ${score_board(state.board)}`,
        "success"
    );
    render_all();
}

/** Rotate the current domino. */
function rotate() {
    state.rotation = (state.rotation + 1) % 4;
    render_rotation();
    // Re-render board to update any hover preview
    render_board();
}

/** Undo the last placement. */
function undo() {
    if (state.history.length === 0) {
        show_message("Nothing to undo.", "error");
        return;
    }
    state.board = state.history.pop();

    // Remove the last used tile ID (most recently added)
    const ids = Array.from(state.used_ids);
    const last_id = ids[ids.length - 1];
    state.used_ids.delete(last_id);

    show_message(`Undid tile #${last_id}.`, "");
    render_all();
}

// ─── Keyboard shortcuts ─────────────────────────────────────────────────────

document.addEventListener("keydown", function (e) {
    if (e.key === "r" || e.key === "R") {
        rotate();
    }
    if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undo();
    }
});

// ─── Button bindings ────────────────────────────────────────────────────────

btn_rotate.addEventListener("click", rotate);
btn_undo.addEventListener("click", undo);

// ─── Initial render ─────────────────────────────────────────────────────────

show_message("Select a tile from the deck, then click on the board to place it.", "");
render_all();
