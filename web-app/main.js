/**
 * main.js — UI controller for the 2-player Kingdomino game.
 *
 * Thin view layer that wires DOM events to Game.js state transitions.
 * Renders two boards, the drafting lines, and the turn/phase indicators.
 *
 * @module main
 */

import { get_secondary_offset } from "./Domino.js";
import { GRID_SIZE, get_cell, validate_placement } from "./Board.js";
import { score_board } from "./Scoring.js";
import {
    PHASES,
    create_game,
    get_player,
    place_meeple,
    attempt_placement
} from "./Game.js";

// ─── Application state ─────────────────────────────────────────────────────

const ROTATION_NAMES = ["Right", "Down", "Left", "Up"];

let state = create_game(2);
let rotation = 0;

// ─── DOM references ─────────────────────────────────────────────────────────

const phase_el = document.getElementById("phase-label");
const msg_el = document.getElementById("message-bar");
const rot_name_el = document.getElementById("rotation-name");
const btn_rotate = document.getElementById("btn-rotate");
const current_line_el = document.getElementById("current-line");
const next_line_el = document.getElementById("next-line");
const turn_player_el = document.getElementById("turn-player");
const turn_action_el = document.getElementById("turn-action");

// ─── Rendering helpers ──────────────────────────────────────────────────────

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

function show_message(text, type) {
    msg_el.textContent = text;
    msg_el.className = type || "";
}

// ─── Board rendering ────────────────────────────────────────────────────────

function render_board(player_id) {
    const board_el = document.getElementById(`board-${player_id}`);
    const player = get_player(state, player_id);
    board_el.innerHTML = "";

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = get_cell(player.board, r, c);
            const div = document.createElement("div");
            div.className = "cell";
            div.dataset.row = r;
            div.dataset.col = c;
            div.id = `cell-${player_id}-${r}-${c}`;

            if (cell !== null) {
                div.dataset.terrain = cell.terrain;
                if (cell.terrain === "castle") {
                    div.innerHTML = "🏰";
                } else {
                    div.innerHTML =
                        render_crowns(cell.crowns)
                        + `<span class="terrain-label">${cell.terrain}</span>`;
                }
            }

            // Board interaction only during RESOLVE_PLACE for active player
            if (state.phase === PHASES.RESOLVE_PLACE
                && state.active_player_id === player_id) {
                div.addEventListener("mouseenter", () =>
                    handle_board_hover(player_id, r, c));
                div.addEventListener("mouseleave", () =>
                    clear_preview(player_id));
                div.addEventListener("click", () =>
                    handle_board_click(r, c));
            }

            board_el.appendChild(div);
        }
    }
}

function render_boards() {
    render_board("P1");
    render_board("P2");

    // Highlight active/inactive player sections
    const p1_section = document.getElementById("player-P1");
    const p2_section = document.getElementById("player-P2");

    p1_section.classList.remove("active", "inactive");
    p2_section.classList.remove("active", "inactive");

    if (state.phase === PHASES.RESOLVE_PLACE) {
        if (state.active_player_id === "P1") {
            p1_section.classList.add("active");
            p2_section.classList.add("inactive");
        } else {
            p2_section.classList.add("active");
            p1_section.classList.add("inactive");
        }
    } else if (state.phase !== PHASES.GAME_OVER) {
        // During drafting, both boards visible but neither active
        p1_section.classList.remove("inactive");
        p2_section.classList.remove("inactive");
    }
}

// ─── Draft line rendering ───────────────────────────────────────────────────

function render_draft_slot(slot, index, line_type) {
    const el = document.createElement("div");
    el.className = "draft-slot";
    el.id = `${line_type}-slot-${index}`;

    // Primary half
    const p = document.createElement("div");
    p.className = "draft-slot-half";
    p.dataset.terrain = slot.domino.primary.terrain;
    p.innerHTML = render_crowns(slot.domino.primary.crowns);

    // Secondary half
    const s = document.createElement("div");
    s.className = "draft-slot-half";
    s.dataset.terrain = slot.domino.secondary.terrain;
    s.innerHTML = render_crowns(slot.domino.secondary.crowns);

    el.appendChild(p);
    el.appendChild(s);

    // Meeple tag
    if (slot.meeple) {
        const tag = document.createElement("span");
        tag.className = `meeple-tag ${slot.meeple}`;
        tag.textContent = slot.meeple;
        el.appendChild(tag);
    }

    return el;
}

function render_draft_lines() {
    // ── Current line: hide resolved tiles, highlight active ──
    current_line_el.innerHTML = "";
    state.current_line.forEach((slot, i) => {
        // Skip already-resolved tiles
        if (i < state.current_line_index) {
            return;
        }
        const el = render_draft_slot(slot, i, "current");
        if (i === state.current_line_index
            && (state.phase === PHASES.RESOLVE_PLACE
                || state.phase === PHASES.RESOLVE_DRAFT)) {
            el.classList.add("highlight");
        }
        current_line_el.appendChild(el);
    });

    // ── Next line: available vs claimed ──
    next_line_el.innerHTML = "";
    const is_draft_phase = state.phase === PHASES.DRAFT_INITIAL
        || state.phase === PHASES.RESOLVE_DRAFT;

    state.next_line.forEach((slot, i) => {
        const el = render_draft_slot(slot, i, "next");

        if (slot.meeple !== null) {
            // Already claimed — dim it
            el.classList.add("claimed");
        } else if (is_draft_phase) {
            // Available for picking
            el.classList.add("available");
            el.addEventListener("click", () => handle_draft_click(i));
        }

        next_line_el.appendChild(el);
    });
}

// ─── Score & phase rendering ────────────────────────────────────────────────

function render_scores() {
    state.players.forEach((p) => {
        document.getElementById(`score-${p.id}`).textContent = p.score;
    });
}

function render_phase() {
    const phase_names = {
        [PHASES.DRAFT_INITIAL]: "Initial Draft",
        [PHASES.RESOLVE_PLACE]: "Place Tile",
        [PHASES.RESOLVE_DRAFT]: "Draft Next Tile",
        [PHASES.GAME_OVER]: "Game Over"
    };
    phase_el.textContent = phase_names[state.phase] || state.phase;
}

function render_turn_indicator() {
    const pid = state.active_player_id;
    const player = get_player(state, pid);
    const indicator = document.getElementById("turn-indicator");

    if (state.phase === PHASES.GAME_OVER) {
        indicator.style.display = "none";
        return;
    }
    indicator.style.display = "";

    // Set player name + colour
    turn_player_el.textContent = player.name;
    turn_player_el.style.color = player.color;

    // Set action text
    const actions = {
        [PHASES.DRAFT_INITIAL]: "Pick a tile from the Next line",
        [PHASES.RESOLVE_PLACE]: "Place your tile on your board",
        [PHASES.RESOLVE_DRAFT]: "Pick your next tile"
    };
    turn_action_el.textContent = actions[state.phase] || "";
}

function render_rotation() {
    rot_name_el.textContent = ROTATION_NAMES[rotation];
}

function render_game_over() {
    if (state.phase !== PHASES.GAME_OVER) {
        return;
    }
    const draft_section = document.getElementById("draft-section");
    const banner = document.createElement("div");
    banner.className = "game-over-banner";

    const p1 = get_player(state, "P1");
    const p2 = get_player(state, "P2");
    let result_text;
    if (p1.score > p2.score) {
        result_text = "Player 1 wins!";
    } else if (p2.score > p1.score) {
        result_text = "Player 2 wins!";
    } else {
        result_text = "It's a tie!";
    }

    banner.innerHTML = `<h2>${result_text}</h2>`
        + `<p>P1: ${p1.score} — P2: ${p2.score}</p>`;
    draft_section.appendChild(banner);
}

function render_all() {
    render_boards();
    render_draft_lines();
    render_scores();
    render_phase();
    render_turn_indicator();
    render_rotation();
    show_message(state.message, "");
    render_game_over();
}

// ─── Interaction handlers ───────────────────────────────────────────────────

function handle_board_hover(player_id, row, col) {
    if (state.phase !== PHASES.RESOLVE_PLACE) {
        return;
    }
    const slot = state.current_line[state.current_line_index];
    const player = get_player(state, player_id);
    const [dr, dc] = get_secondary_offset(rotation);

    const result = validate_placement(
        player.board, slot.domino, row, col, rotation
    );
    const cls = result.valid ? "preview-valid" : "preview-invalid";

    const pri = document.getElementById(
        `cell-${player_id}-${row}-${col}`
    );
    const sec = document.getElementById(
        `cell-${player_id}-${row + dr}-${col + dc}`
    );
    if (pri) {
        pri.classList.add(cls);
    }
    if (sec) {
        sec.classList.add(cls);
    }
}

function clear_preview(player_id) {
    const board_el = document.getElementById(`board-${player_id}`);
    board_el.querySelectorAll(".preview-valid, .preview-invalid")
        .forEach((el) => {
            el.classList.remove("preview-valid", "preview-invalid");
        });
}

function handle_board_click(row, col) {
    if (state.phase !== PHASES.RESOLVE_PLACE) {
        return;
    }
    const new_state = attempt_placement(state, row, col, rotation);
    // If phase didn't change, the placement was rejected
    if (new_state.phase === PHASES.RESOLVE_PLACE
        && new_state.current_line_index === state.current_line_index) {
        show_message(new_state.message, "error");
        return;
    }
    state = new_state;
    show_message(state.message, "success");
    render_all();
}

function handle_draft_click(line_index) {
    if (state.phase !== PHASES.DRAFT_INITIAL
        && state.phase !== PHASES.RESOLVE_DRAFT) {
        return;
    }
    // Only available (meeple === null) slots are rendered clickable,
    // so we can safely accept the result without fragile rejection
    // detection. The old check false-positived when consecutive
    // meeples belonged to the same player.
    if (state.next_line[line_index].meeple !== null) {
        return; // Safety guard — slot already taken
    }
    state = place_meeple(state, line_index);
    render_all();
}

function rotate_tile() {
    rotation = (rotation + 1) % 4;
    render_rotation();
    // Re-render active board to update hover previews
    if (state.phase === PHASES.RESOLVE_PLACE) {
        render_board(state.active_player_id);
    }
}

// ─── Keyboard shortcuts ─────────────────────────────────────────────────────

document.addEventListener("keydown", function (e) {
    if (e.key === "r" || e.key === "R") {
        rotate_tile();
    }
});

// ─── Button bindings ────────────────────────────────────────────────────────

btn_rotate.addEventListener("click", rotate_tile);

// ─── Initial render ─────────────────────────────────────────────────────────

render_all();
