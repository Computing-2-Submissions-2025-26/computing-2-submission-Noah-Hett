/**
 * main.js — UI controller for the 2-player Kingdomino game.
 *
 * Drag-only tile placement, meeple drag onto draft slots,
 * bonded domino visuals, horizontal draft rows.
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

// ─── State ──────────────────────────────────────────────────────────────────

const ROTATION_NAMES = ["Right", "Down", "Left", "Up"];

let state = create_game(2);
let rotation = 0;

// Tile drag state
let drag_active = false;
let hover_row = null;
let hover_col = null;
const CELL = 44; // keep in sync with --cell CSS variable

// Cursor anchor offsets per rotation [offsetX, offsetY]
// Anchors cursor to the centre of the PRIMARY half of the ghost
const GHOST_OFFSETS = [
    [CELL / 2, CELL / 2], // 0 right  — primary is left half
    [CELL / 2, CELL / 2], // 1 down   — primary is top half
    [CELL + CELL / 2, CELL / 2], // 2 left   — primary is right half
    [CELL / 2, CELL + CELL / 2], // 3 up     — primary is bottom half
];

let last_x = 0;
let last_y = 0;

// Meeple drag state
let meeple_drag_active = false;

// Placement log for bonded domino visuals (view-only, never enters Game.js)
const placement_log = { P1: [], P2: [] };

// ─── DOM refs ───────────────────────────────────────────────────────────────

const phase_el = document.getElementById("phase-label");
const msg_el = document.getElementById("message-bar");
// rotation-name element removed from layout; rotation shown on tile itself
const btn_rotate = document.getElementById("btn-rotate");
const current_line_el = document.getElementById("current-line");
const next_line_el = document.getElementById("next-line");
const turn_player_el = document.getElementById("turn-player");
const turn_action_el = document.getElementById("turn-action");

// ─── Helpers ────────────────────────────────────────────────────────────────

function render_crowns(count) {
    if (!count) {
        return "";
    }
    return `<span class="crowns">${Array.from({ length: count },
        () => "<span class=\"crown-dot\"></span>").join("")
        }</span>`;
}

function show_message(text, type) {
    msg_el.textContent = text;
    msg_el.className = type || "";
}

// ─── Bond map ───────────────────────────────────────────────────────────────

function build_bond_map(pid) {
    const map = new Map();
    const dirs = ["right", "down", "left", "up"];
    placement_log[pid].forEach((e) => {
        const dr = e.secondaryRow - e.primaryRow;
        const dc = e.secondaryCol - e.primaryCol;
        let di = -1;
        if (dr === 0 && dc === 1) { di = 0; }
        else if (dr === 1 && dc === 0) { di = 1; }
        else if (dr === 0 && dc === -1) { di = 2; }
        else if (dr === -1 && dc === 0) { di = 3; }
        if (di >= 0) {
            map.set(`${e.primaryRow},${e.primaryCol}`, dirs[di]);
            map.set(`${e.secondaryRow},${e.secondaryCol}`, dirs[(di + 2) % 4]);
        }
    });
    return map;
}

// ─── Board rendering ────────────────────────────────────────────────────────

function render_board(pid) {
    const el = document.getElementById(`board-${pid}`);
    const player = get_player(state, pid);
    const bonds = build_bond_map(pid);
    el.innerHTML = "";

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = get_cell(player.board, r, c);
            const div = document.createElement("div");
            div.className = "cell";
            div.dataset.row = r;
            div.dataset.col = c;
            div.id = `cell-${pid}-${r}-${c}`;

            if (cell) {
                div.dataset.terrain = cell.terrain;
                div.innerHTML = cell.terrain === "castle"
                    ? "🏰"
                    : render_crowns(cell.crowns)
                    + `<span class="terrain-label">${cell.terrain}</span>`;
                const bond = bonds.get(`${r},${c}`);
                if (bond) {
                    div.dataset.bondDir = bond;
                }
            }

            // Drag-drop target: mouseup places tile, mouseenter shows preview
            if (state.phase === PHASES.RESOLVE_PLACE
                && state.active_player_id === pid) {
                div.addEventListener("mouseenter", () => {
                    hover_row = r;
                    hover_col = c;
                    if (drag_active) {
                        show_preview(pid, r, c);
                    }
                });
                div.addEventListener("mouseleave", () => clear_preview(pid));
                div.addEventListener("mouseup", () => {
                    if (drag_active) {
                        confirm_placement(r, c);
                    }
                });
            }

            el.appendChild(div);
        }
    }
}

function render_boards() {
    render_board("P1");
    render_board("P2");

    const p1 = document.getElementById("player-P1");
    const p2 = document.getElementById("player-P2");
    p1.classList.remove("active", "inactive");
    p2.classList.remove("active", "inactive");

    if (state.phase === PHASES.RESOLVE_PLACE) {
        if (state.active_player_id === "P1") {
            p1.classList.add("active");
            p2.classList.add("inactive");
        } else {
            p2.classList.add("active");
            p1.classList.add("inactive");
        }
    }
}

// ─── Preview ────────────────────────────────────────────────────────────────

function show_preview(pid, row, col) {
    clear_preview(pid);
    const slot = state.current_line[state.current_line_index];
    const player = get_player(state, pid);
    const [dr, dc] = get_secondary_offset(rotation);
    const result = validate_placement(player.board, slot.domino, row, col, rotation);
    const cls = result.valid ? "preview-valid" : "preview-invalid";

    const pri = document.getElementById(`cell-${pid}-${row}-${col}`);
    const sec = document.getElementById(`cell-${pid}-${row + dr}-${col + dc}`);
    if (pri) { pri.classList.add(cls); }
    if (sec) { sec.classList.add(cls); }
}

function clear_preview(pid) {
    document.getElementById(`board-${pid}`)
        .querySelectorAll(".preview-valid,.preview-invalid")
        .forEach((el) => el.classList.remove("preview-valid", "preview-invalid"));
}

// ─── Draft tile rendering ───────────────────────────────────────────────────

function make_draft_tile(slot, index, line_type) {
    const el = document.createElement("div");
    el.className = "draft-tile";
    el.id = `${line_type}-tile-${index}`;

    const p = document.createElement("div");
    p.className = "draft-tile-half";
    p.dataset.terrain = slot.domino.primary.terrain;
    p.innerHTML = render_crowns(slot.domino.primary.crowns);

    const s = document.createElement("div");
    s.className = "draft-tile-half";
    s.dataset.terrain = slot.domino.secondary.terrain;
    s.innerHTML = render_crowns(slot.domino.secondary.crowns);

    el.appendChild(p);
    el.appendChild(s);

    // Meeple circle on the tile
    if (slot.meeple) {
        const m = document.createElement("div");
        m.className = "tile-meeple";
        m.dataset.player = slot.meeple;
        el.appendChild(m);
    }

    return el;
}

// Index of the tile currently being dragged (to leave a gap)
let dragging_index = -1;

function render_draft_lines() {
    // ── Current line: always 4 fixed slots ──
    current_line_el.innerHTML = "";
    state.current_line.forEach((slot, i) => {
        // Resolved/placed tiles → empty placeholder preserving position.
        // During RESOLVE_DRAFT, current_line_index still points at the
        // just-placed tile, so treat it as resolved too.
        const is_resolved = i < state.current_line_index
            || (i === state.current_line_index
                && state.phase === PHASES.RESOLVE_DRAFT);
        if (is_resolved) {
            const gap = document.createElement("div");
            gap.className = "draft-tile-slot empty";
            current_line_el.appendChild(gap);
            return;
        }

        // Tile being dragged → ghosted placeholder
        if (drag_active && i === dragging_index) {
            const gap = document.createElement("div");
            gap.className = "draft-tile-slot dragging-gap";
            current_line_el.appendChild(gap);
            return;
        }

        const el = make_draft_tile(slot, i, "current");

        if (i === state.current_line_index
            && state.phase === PHASES.RESOLVE_PLACE) {
            el.classList.add("highlight");
            el.dataset.rotation = rotation;
            el.addEventListener("mousedown", (e) => {
                e.preventDefault();
                dragging_index = i;
                start_tile_drag(e, slot.domino);
                // Re-render to show the gap
                render_draft_lines();
            });
        }

        current_line_el.appendChild(el);
    });

    // ── Next line: always 4 fixed slots ──
    next_line_el.innerHTML = "";
    const is_draft = state.phase === PHASES.DRAFT_INITIAL
        || state.phase === PHASES.RESOLVE_DRAFT;

    state.next_line.forEach((slot, i) => {
        const el = make_draft_tile(slot, i, "next");

        if (slot.meeple !== null) {
            el.classList.add("claimed");
        } else if (is_draft) {
            el.classList.add("available");
            el.addEventListener("click", () => handle_draft_click(i));
            el.addEventListener("mouseup", () => {
                if (meeple_drag_active) { handle_meeple_drop(i); }
            });
        }

        next_line_el.appendChild(el);
    });
}

// ─── Tile drag ──────────────────────────────────────────────────────────────

let ghost_el = null;

function start_tile_drag(e, domino) {
    drag_active = true;
    remove_ghost();

    ghost_el = document.createElement("div");
    ghost_el.id = "tile-ghost";
    ghost_el.dataset.rotation = rotation;

    const p = document.createElement("div");
    p.className = "ghost-half";
    p.dataset.terrain = domino.primary.terrain;
    p.innerHTML = render_crowns(domino.primary.crowns);

    const s = document.createElement("div");
    s.className = "ghost-half";
    s.dataset.terrain = domino.secondary.terrain;
    s.innerHTML = render_crowns(domino.secondary.crowns);

    ghost_el.appendChild(p);
    ghost_el.appendChild(s);
    document.body.appendChild(ghost_el);
    move_ghost(e.clientX, e.clientY);
}

function move_ghost(x, y) {
    if (!ghost_el) { return; }
    last_x = x;
    last_y = y;
    const [ox, oy] = GHOST_OFFSETS[rotation];
    ghost_el.style.left = `${x - ox}px`;
    ghost_el.style.top = `${y - oy}px`;
}

function remove_ghost() {
    if (ghost_el) { ghost_el.remove(); ghost_el = null; }
}

function cancel_drag() {
    drag_active = false;
    dragging_index = -1;
    remove_ghost();
    if (state.phase === PHASES.RESOLVE_PLACE) {
        clear_preview(state.active_player_id);
    }
    // Re-render to restore the tile in its slot
    render_draft_lines();
}

// ─── Meeple drag ────────────────────────────────────────────────────────────

let meeple_ghost = null;

function render_meeples() {
    const is_draft = state.phase === PHASES.DRAFT_INITIAL
        || state.phase === PHASES.RESOLVE_DRAFT;

    ["P1", "P2"].forEach((pid) => {
        const token = document.getElementById(`meeple-${pid}`);
        const fresh = token.cloneNode(true);
        fresh.classList.remove("active-meeple", "inactive-meeple");

        if (is_draft && state.active_player_id === pid) {
            fresh.classList.add("active-meeple");
            fresh.addEventListener("mousedown", (e) => {
                e.preventDefault();
                start_meeple_drag(e, pid);
            });
        } else {
            fresh.classList.add("inactive-meeple");
        }
        token.replaceWith(fresh);
    });
}

function start_meeple_drag(e, pid) {
    meeple_drag_active = true;
    meeple_ghost = document.createElement("div");
    meeple_ghost.id = "meeple-ghost";
    meeple_ghost.dataset.player = pid;
    document.body.appendChild(meeple_ghost);
    move_meeple_ghost(e.clientX, e.clientY);

    document.querySelectorAll(".draft-tile.available").forEach((el) => {
        el.classList.add("drop-target");
    });
}

function move_meeple_ghost(x, y) {
    if (!meeple_ghost) { return; }
    meeple_ghost.style.left = `${x - 14}px`;
    meeple_ghost.style.top = `${y - 14}px`;
}

function cancel_meeple_drag() {
    meeple_drag_active = false;
    if (meeple_ghost) { meeple_ghost.remove(); meeple_ghost = null; }
    document.querySelectorAll(".drop-target").forEach((el) => {
        el.classList.remove("drop-target");
    });
}

// ─── Actions ────────────────────────────────────────────────────────────────

function confirm_placement(row, col) {
    if (state.phase !== PHASES.RESOLVE_PLACE) { return; }
    const pid = state.active_player_id;
    const new_state = attempt_placement(state, row, col, rotation);

    if (new_state.phase === PHASES.RESOLVE_PLACE
        && new_state.current_line_index === state.current_line_index) {
        show_message(new_state.message, "error");
        return;
    }

    const [dr, dc] = get_secondary_offset(rotation);
    placement_log[pid].push({
        primaryRow: row, primaryCol: col,
        secondaryRow: row + dr, secondaryCol: col + dc
    });

    state = new_state;
    cancel_drag();
    show_message(state.message, "success");
    render_all();
}

function handle_draft_click(i) {
    if (state.phase !== PHASES.DRAFT_INITIAL
        && state.phase !== PHASES.RESOLVE_DRAFT) { return; }
    if (state.next_line[i].meeple !== null) { return; }
    state = place_meeple(state, i);
    render_all();
}

function handle_meeple_drop(i) {
    cancel_meeple_drag();
    if (state.phase !== PHASES.DRAFT_INITIAL
        && state.phase !== PHASES.RESOLVE_DRAFT) { return; }
    if (state.next_line[i].meeple !== null) { return; }
    state = place_meeple(state, i);
    render_all();
}

function rotate_tile() {
    rotation = (rotation + 1) % 4;

    // Update the in-strip tile to show the new rotation
    const active_tile_el = document.querySelector(".draft-tile.highlight");
    if (active_tile_el) { active_tile_el.dataset.rotation = rotation; }

    // Update ghost and re-anchor at the last known cursor position
    if (ghost_el) {
        ghost_el.dataset.rotation = rotation;
        move_ghost(last_x, last_y);
    }

    // Refresh board preview with new rotation
    if (drag_active && state.phase === PHASES.RESOLVE_PLACE && hover_row !== null) {
        show_preview(state.active_player_id, hover_row, hover_col);
    }
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function render_scores() {
    state.players.forEach((p) => {
        document.getElementById(`score-${p.id}`).textContent = p.score;
    });
}

function render_phase() {
    const names = {
        [PHASES.DRAFT_INITIAL]: "Initial Draft",
        [PHASES.RESOLVE_PLACE]: "Place Tile",
        [PHASES.RESOLVE_DRAFT]: "Draft Next Tile",
        [PHASES.GAME_OVER]: "Game Over"
    };
    phase_el.textContent = names[state.phase] || state.phase;
}

function render_turn() {
    const pid = state.active_player_id;
    const player = get_player(state, pid);
    const ind = document.getElementById("turn-indicator");

    if (state.phase === PHASES.GAME_OVER) { ind.style.display = "none"; return; }
    ind.style.display = "";
    turn_player_el.textContent = player.name;
    turn_player_el.style.color = player.color;

    const acts = {
        [PHASES.DRAFT_INITIAL]: "PICK A TILE",
        [PHASES.RESOLVE_PLACE]: "PLAY YOUR TILE",
        [PHASES.RESOLVE_DRAFT]: "PICK A TILE"
    };
    turn_action_el.textContent = acts[state.phase] || "";
}

function render_game_over() {
    if (state.phase !== PHASES.GAME_OVER) { return; }
    const strip = document.getElementById("draft-strip");
    if (strip.querySelector(".game-over-banner")) { return; }

    const p1 = get_player(state, "P1");
    const p2 = get_player(state, "P2");
    const winner = p1.score > p2.score ? "Player 1 wins!"
        : p2.score > p1.score ? "Player 2 wins!" : "It's a tie!";

    const b = document.createElement("div");
    b.className = "game-over-banner";
    b.innerHTML = `<h2>${winner}</h2><p>P1: ${p1.score} — P2: ${p2.score}</p>`;
    strip.appendChild(b);
}

function render_all() {
    render_boards();
    render_draft_lines();
    render_meeples();
    render_scores();
    render_phase();
    render_turn();
    show_message(state.message, "");
    render_game_over();
}

// ─── Global events ──────────────────────────────────────────────────────────

document.addEventListener("mousemove", (e) => {
    if (drag_active) {
        move_ghost(e.clientX, e.clientY);
        if (state.phase === PHASES.RESOLVE_PLACE) {
            const pid = state.active_player_id;
            const under = document.elementFromPoint(e.clientX, e.clientY);
            if (under && under.classList.contains("cell")
                && under.id.startsWith(`cell-${pid}`)) {
                const r = parseInt(under.dataset.row, 10);
                const c = parseInt(under.dataset.col, 10);
                if (r !== hover_row || c !== hover_col) {
                    clear_preview(pid);
                    hover_row = r;
                    hover_col = c;
                    show_preview(pid, r, c);
                }
            } else if (hover_row !== null) {
                clear_preview(pid);
                hover_row = null;
                hover_col = null;
            }
        }
    }
    if (meeple_drag_active) { move_meeple_ghost(e.clientX, e.clientY); }
});

document.addEventListener("mouseup", () => {
    if (drag_active) { cancel_drag(); }
    if (meeple_drag_active) { cancel_meeple_drag(); }
});

document.addEventListener("keydown", (e) => {
    if (e.key === "r" || e.key === "R") { rotate_tile(); }
    if (e.key === "Escape" && drag_active) { cancel_drag(); }
});

document.addEventListener("wheel", (e) => {
    if (drag_active && state.phase === PHASES.RESOLVE_PLACE) {
        e.preventDefault();
        rotate_tile();
    }
}, { passive: false });

btn_rotate.addEventListener("click", rotate_tile);

// ─── Boot ───────────────────────────────────────────────────────────────────

render_all();
