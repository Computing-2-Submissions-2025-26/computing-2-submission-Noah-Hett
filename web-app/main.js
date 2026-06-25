/**
 * main.js — UI controller for the 2-player Kingdomino game.
 *
 * Handles rendering, drag-and-drop, and user interaction.
 * All game logic is delegated to the game modules via
 * {@link module:Kingdomino}.
 *
 * @module main
 */

import {get_secondary_offset} from "./Domino.js";
import {
    GRID_SIZE,
    get_cell,
    validate_placement,
    get_valid_bounds
} from "./Board.js";
import {
    PHASES,
    create_game,
    get_player,
    place_meeple,
    attempt_placement,
    score_board
} from "./Module.js";

// ─── State ──────────────────────────────────────────────────────────────────

let state = create_game(2);
let rotation = 0;
let visual_rotation_deg = 0;

// Tile drag state
let drag_active = false;
let hover_row = null;
let hover_col = null;
let last_x = 0;
let last_y = 0;

// Meeple drag state
let meeple_drag_active = false;

// Keyboard placement state
let keyboard_placement_active = false;

// Forward declarations to resolve JSLint out-of-scope cyclical dependencies
let clear_preview;
let confirm_placement;
let handle_draft_click;
let handle_meeple_drop;
let move_ghost;
let move_meeple_ghost;
let remove_ghost;
let render_all;
let start_keyboard_placement;
let start_meeple_drag;
let start_tile_drag;

// ─── DOM refs ───────────────────────────────────────────────────────────────

const phase_el = document.getElementById("phase-label");
const msg_el = document.getElementById("message-bar");
const btn_rotate = document.getElementById("btn-rotate");
const current_line_el = document.getElementById("current-line");
const next_line_el = document.getElementById("next-line");
const turn_player_el = document.getElementById("turn-player");
const turn_action_el = document.getElementById("turn-action");

// ─── Helpers ────────────────────────────────────────────────────────────────
function show_message(text, type) {
    msg_el.textContent = text;
    msg_el.className = type || "";
}



// ─── Board rendering ────────────────────────────────────────────────────────

function render_board(pid) {
    const el = document.getElementById(`board-${pid}`);
    const player = get_player(state, pid);
    const bounds = get_valid_bounds(player.board);
    el.innerHTML = "";

    // Always keep the internal grid statically 9x9
    el.style.gridTemplateColumns = `repeat(${GRID_SIZE}, var(--cell))`;
    el.style.gridTemplateRows = `repeat(${GRID_SIZE}, var(--cell))`;
    el.style.width = (
        `calc(${GRID_SIZE} * var(--cell) ` +
        `+ (${GRID_SIZE} - 1) * var(--gap))`
    );
    el.style.height = (
        `calc(${GRID_SIZE} * var(--cell) ` +
        `+ (${GRID_SIZE} - 1) * var(--gap))`
    );

    // align the bounds with the top-left corner
    el.style.transform = `translate(
        calc(${bounds.minCol} * (var(--cell) + var(--gap)) * -1),
        calc(${bounds.minRow} * (var(--cell) + var(--gap)) * -1)
    )`;

    // size the frame and offset it with margins to keep tiles stationary
    const frame = el.parentElement;
    if (frame) {
        const rowCount = bounds.maxRow - bounds.minRow + 1;
        const colCount = bounds.maxCol - bounds.minCol + 1;

        frame.style.width = `calc(${colCount} * var(--cell)
            + (${colCount} - 1) * var(--gap)
            + var(--board-pad) * 2 + 4px)`;
        frame.style.height = `calc(${rowCount} * var(--cell)
            + (${rowCount} - 1) * var(--gap)
            + var(--board-pad) * 2 + 4px)`;

        frame.style.marginLeft = `calc(${bounds.minCol}
            * (var(--cell) + var(--gap)))`;
        frame.style.marginRight = `calc(${GRID_SIZE - 1 - bounds.maxCol}
            * (var(--cell) + var(--gap)))`;
        frame.style.marginTop = `calc(${bounds.minRow}
            * (var(--cell) + var(--gap)))`;
        frame.style.marginBottom = `calc(${GRID_SIZE - 1 - bounds.maxRow}
            * (var(--cell) + var(--gap)))`;
    }

    Array.from({length: GRID_SIZE}).forEach(function (ignore_r, r) {
        if (ignore_r !== undefined) {
            return;
        }
        Array.from({length: GRID_SIZE}).forEach(function (ignore_c, c) {
            if (ignore_c !== undefined) {
                return;
            }
            const cell = get_cell(player.board, r, c);
            const div = document.createElement("div");
            div.className = "cell";
            div.dataset.row = r;
            div.dataset.col = c;
            div.id = `cell-${pid}-${r}-${c}`;

            if (cell) {
                div.dataset.terrain = cell.terrain;
                div.dataset.crowns = cell.crowns;

                // Terrain merging: check 4 neighbours for same terrain
                const terrain = cell.terrain;
                const up = get_cell(player.board, r - 1, c);
                const down = get_cell(player.board, r + 1, c);
                const left = get_cell(player.board, r, c - 1);
                const right = get_cell(player.board, r, c + 1);
                if (up && up.terrain === terrain) {
                    div.dataset.mergeUp = "";
                }
                if (down && down.terrain === terrain) {
                    div.dataset.mergeDown = "";
                }
                if (left && left.terrain === terrain) {
                    div.dataset.mergeLeft = "";
                }
                if (right && right.terrain === terrain) {
                    div.dataset.mergeRight = "";
                }
            }

            // Drag-drop target: mouseup places tile, mouseenter shows preview
            if (
                state.phase === PHASES.RESOLVE_PLACE &&
                state.active_player_id === pid
            ) {
                div.addEventListener("mouseenter", function () {
                    hover_row = r;
                    hover_col = c;
                    // Preview is driven entirely by mousemove so the
                    // primary-cell offset calculation is always applied.
                });
                div.addEventListener("mouseleave", function () {
                    clear_preview(pid);
                });
                div.addEventListener("mouseup", function () {
                    // Use the mousemove-tracked hover position (the computed
                    // primary cell) rather than whichever cell caught mouseup.
                    if (drag_active && hover_row !== null) {
                        confirm_placement(hover_row, hover_col);
                    }
                });
            }

            el.appendChild(div);
        });
    });
}

function render_boards() {
    render_board("P1");
    render_board("P2");

    const p1 = document.getElementById("player-P1");
    const p2 = document.getElementById("player-P2");
    const p1_name_el = p1.querySelector(".player-name");
    if (p1_name_el) {
        p1_name_el.textContent = get_player(state, "P1").name;
    }
    const p2_name_el = p2.querySelector(".player-name");
    if (p2_name_el) {
        p2_name_el.textContent = get_player(state, "P2").name;
    }

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
    } else if (
        state.phase === PHASES.DRAFT_INITIAL ||
        state.phase === PHASES.RESOLVE_DRAFT
    ) {
        if (state.active_player_id === "P1") {
            p2.classList.add("inactive");
        } else {
            p1.classList.add("inactive");
        }
    }
}

// ─── Preview ────────────────────────────────────────────────────────────────

clear_preview = function (pid) {
    document.getElementById(`board-${pid}`).querySelectorAll(
        ".preview-valid,.preview-invalid"
    ).forEach(function (el) {
        el.classList.remove("preview-valid", "preview-invalid");
        delete el.dataset.previewConnect;
    });
};

function show_preview(pid, row, col) {
    clear_preview(pid);
    const slot = state.current_line[state.current_line_index];
    const player = get_player(state, pid);
    const [dr, dc] = get_secondary_offset(rotation);
    const result = validate_placement(
        player.board,
        slot.domino,
        row,
        col,
        rotation
    );
    const cls = (
        result.valid
        ? "preview-valid"
        : "preview-invalid"
    );

    // Direction that primary connects toward secondary, and vice-versa.
    // Used by CSS to remove the shared inner border so both
    // cells read as one tile.
    const primary_dirs = ["right", "down", "left", "up"];
    const secondary_dirs = ["left", "up", "right", "down"];

    const connect_pri = primary_dirs[rotation % 4];
    const connect_sec = secondary_dirs[rotation % 4];

    const pri = document.getElementById(`cell-${pid}-${row}-${col}`);
    const sec = document.getElementById(`cell-${pid}-${row + dr}-${col + dc}`);
    if (pri) {
        pri.classList.add(cls);
        pri.dataset.previewConnect = connect_pri;
    }
    if (sec) {
        sec.classList.add(cls);
        sec.dataset.previewConnect = connect_sec;
    }
}

// ─── Draft tile rendering ───────────────────────────────────────────────────

function make_draft_tile(slot, index, line_type) {
    const el = document.createElement("div");
    el.className = "draft-tile";
    el.id = `${line_type}-tile-${index}`;
    el.setAttribute("role", "button");
    el.setAttribute(
        "aria-label",
        `Draft tile: ${slot.domino.primary.terrain} with ` +
        `${slot.domino.primary.crowns} crowns, ` +
        `${slot.domino.secondary.terrain} with ` +
        `${slot.domino.secondary.crowns} crowns`
    );

    const inner = document.createElement("div");
    inner.className = "tile-inner";

    const front = document.createElement("div");
    front.className = "tile-front";

    const back = document.createElement("div");
    back.className = "tile-back";
    back.textContent = slot.domino.id;

    const p = document.createElement("div");
    p.className = "draft-tile-half";
    p.dataset.terrain = slot.domino.primary.terrain;
    p.dataset.crowns = slot.domino.primary.crowns;

    const s = document.createElement("div");
    s.className = "draft-tile-half";
    s.dataset.terrain = slot.domino.secondary.terrain;
    s.dataset.crowns = slot.domino.secondary.crowns;

    front.appendChild(p);
    front.appendChild(s);

    // Claim flag on the tile
    if (slot.meeple) {
        const m = document.createElement("div");
        m.className = "tile-meeple";
        m.dataset.player = slot.meeple;

        // Pseudo-randomly pick the left (25%) or right (75%) half of the tile
        const base_x = (
            (slot.domino.id % 2 === 0)
            ? 25
            : 75
        );

        // Pseudo-random offset (-10% to +10%) so flags look tossed naturally
        const jx = (slot.domino.id * 17) % 21 - 10;
        const jy = (slot.domino.id * 23) % 21 - 10;

        m.style.setProperty("--flag-x", `${base_x + jx}%`);
        m.style.setProperty("--flag-y", `${50 + jy}%`);

        front.appendChild(m);
    }

    inner.appendChild(front);
    inner.appendChild(back);
    el.appendChild(inner);

    return el;
}

// Index of the tile currently being dragged (to leave a gap)
let dragging_index = -1;
let last_rendered_round = 0;
let is_booting = true;

function render_draft_lines(opts = {}) {
    const animate = opts.animate_new_round || false;

    // Dim inactive tile groups to reduce confusion
    const current_group = document.getElementById("current-group");
    const next_group = document.getElementById("next-group");

    const is_draft_phase = (
        state.phase === PHASES.DRAFT_INITIAL
        || state.phase === PHASES.RESOLVE_DRAFT
    );

    const is_draft = (
        state.phase === PHASES.DRAFT_INITIAL
        || state.phase === PHASES.RESOLVE_DRAFT
    );

    if (current_group) {
        current_group.classList.toggle("dimmed", is_draft_phase);
    }
    if (next_group) {
        next_group.classList.toggle(
            "dimmed",
            !is_draft_phase && state.phase !== PHASES.GAME_OVER
        );
    }

    // Compute dynamic slide distance for animation
    if (animate) {
        const c_rect = current_group.getBoundingClientRect();
        const n_rect = next_group.getBoundingClientRect();
        const dist = n_rect.left - c_rect.left;
        document.documentElement.style.setProperty("--slide-dist", `${dist}px`);
    }

    // ── Current line: always 4 fixed slots ──
    current_line_el.innerHTML = "";
    Array.from({length: 4}).forEach(function (ignore, i) {
        const slot_container = document.createElement("div");
        slot_container.className = "draft-tile-slot";

        const slot = state.current_line[i];
        if (!slot) {
            slot_container.classList.add("empty");
            current_line_el.appendChild(slot_container);
            return;
        }

        // Resolved/placed tiles → empty placeholder preserving position.
        const is_resolved = (
            i < state.current_line_index
            || (
                i === state.current_line_index
                && state.phase === PHASES.RESOLVE_DRAFT
            )
        );
        if (is_resolved) {
            slot_container.classList.add("empty");
            current_line_el.appendChild(slot_container);
            return;
        }

        // Tile being dragged → ghosted placeholder
        if (drag_active && i === dragging_index) {
            slot_container.classList.add("dragging-gap");
            current_line_el.appendChild(slot_container);
            return;
        }

        const el = make_draft_tile(slot, i, "current");

        if (is_booting) {
            el.classList.add("face-down");
        } else if (animate && state.round === 1) {
            // First round: slide in and flip over
            el.classList.add("sliding", "face-down");
            setTimeout(function () {
                el.classList.remove("sliding");
            }, 550);
            setTimeout(function () {
                el.classList.remove("face-down");
            }, 600 + (i * 350));
        } else if (animate) {
            // Subsequent rounds: just slide in
            el.classList.add("sliding");
            setTimeout(function () {
                el.classList.remove("sliding");
            }, 550);
        }

        if (
            i === state.current_line_index &&
            state.phase === PHASES.RESOLVE_PLACE
        ) {
            el.classList.add("highlight");
            slot_container.classList.add("highlight-slot");
            el.dataset.rotation = rotation;
            el.style.transform = `rotate(${visual_rotation_deg}deg)`;
            el.style.setProperty("--rotation-deg", `${visual_rotation_deg}deg`);
            el.setAttribute("tabindex", "0");
            el.addEventListener("mousedown", function (e) {
                e.preventDefault();
                dragging_index = i;
                start_tile_drag(e, slot.domino);
                // Re-render to show the gap
                render_draft_lines();
            });
            el.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    start_keyboard_placement(i);
                }
            });
        }

        slot_container.appendChild(el);
        current_line_el.appendChild(slot_container);
    });

    // ── Next line: always 4 fixed slots ──
    next_line_el.innerHTML = "";
    state.next_line = state.next_line || [];
    Array.from({length: 4}).forEach(function (ignore, i) {
        const slot_container = document.createElement("div");
        slot_container.className = "draft-tile-slot";

        const slot = state.next_line[i];
        if (!slot) {
            slot_container.classList.add("empty");
            next_line_el.appendChild(slot_container);
            return;
        }

        const el = make_draft_tile(slot, i, "next");

        if (is_booting) {
            el.classList.add("face-down");
        } else if (animate) {
            el.classList.add("face-down");
            setTimeout(function () {
                el.classList.remove("face-down");
            }, 600 + (i * 350)); // Wait for slide to finish, then flip
        }

        if (slot.meeple !== null) {
            el.classList.add("claimed");
        } else if (is_draft) {
            el.classList.add("available");
            el.setAttribute("tabindex", "0");
            el.addEventListener("click", function () {
                handle_draft_click(i);
            });
            el.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handle_draft_click(i);
                }
            });
            el.addEventListener("mouseup", function () {
                if (meeple_drag_active) {
                    handle_meeple_drop(i);
                }
            });
        }

        slot_container.appendChild(el);
        next_line_el.appendChild(slot_container);
    });
}

// ─── Tile drag ──────────────────────────────────────────────────────────────

let ghost_el = null;

start_tile_drag = function (e, domino) {
    drag_active = true;
    remove_ghost();

    ghost_el = document.createElement("div");
    ghost_el.id = "tile-ghost";
    ghost_el.dataset.rotation = rotation;
    ghost_el.style.transform = `rotate(${visual_rotation_deg}deg)`;
    ghost_el.style.setProperty("--rotation-deg", `${visual_rotation_deg}deg`);

    const p = document.createElement("div");
    p.className = "ghost-half";
    p.dataset.terrain = domino.primary.terrain;
    p.dataset.crowns = domino.primary.crowns;

    const s = document.createElement("div");
    s.className = "ghost-half";
    s.dataset.terrain = domino.secondary.terrain;
    s.dataset.crowns = domino.secondary.crowns;

    ghost_el.appendChild(p);
    ghost_el.appendChild(s);
    document.body.appendChild(ghost_el);
    move_ghost(e.clientX, e.clientY);
};

move_ghost = function (x, y) {
    if (!ghost_el) {
        return;
    }
    last_x = x;
    last_y = y;
    const ox = ghost_el.offsetWidth / 2;
    const oy = ghost_el.offsetHeight / 2;
    ghost_el.style.left = `${x - ox}px`;
    ghost_el.style.top = `${y - oy}px`;
};

remove_ghost = function () {
    if (ghost_el) {
        ghost_el.remove();
        ghost_el = null;
    }
};

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

/**
 * Starts keyboard placement mode, moving focus to the board
 * @param {number} index The index of the tile in the current line
 */
start_keyboard_placement = function (index) {
    keyboard_placement_active = true;
    dragging_index = index;

    // Set initial hover to center of board
    hover_row = 4;
    hover_col = 4;

    const pid = state.active_player_id;
    show_preview(pid, hover_row, hover_col);

    // Focus the board frame to visually indicate keyboard mode
    const board_frame = document.getElementById(`board-${pid}`)?.parentElement;
    if (board_frame) {
        board_frame.setAttribute("tabindex", "0");
        board_frame.focus();
    }

    show_message(
        "Keyboard mode. Arrows to move, R to rotate, " +
        "Enter to place, Esc to cancel.",
        "info"
    );
    render_draft_lines();
};

/**
 * Cancels keyboard placement mode
 */
function cancel_keyboard_placement() {
    keyboard_placement_active = false;
    dragging_index = -1;
    if (state.phase === PHASES.RESOLVE_PLACE) {
        clear_preview(state.active_player_id);
    }
    const pid = state.active_player_id;
    const board_frame = document.getElementById(`board-${pid}`)?.parentElement;
    if (board_frame) {
        board_frame.removeAttribute("tabindex");
    }
    render_draft_lines();
    show_message(state.message, "");
}

// ─── Meeple drag ────────────────────────────────────────────────────────────

let meeple_ghost = null;

function render_meeples() {
    const is_draft = (
        state.phase === PHASES.DRAFT_INITIAL
        || state.phase === PHASES.RESOLVE_DRAFT
    );

    ["P1", "P2"].forEach(function (pid) {
        const token = document.getElementById(`meeple-${pid}`);
        if (!token) {
            return;
        }
        const fresh = token.cloneNode(true);
        fresh.classList.remove("active-meeple", "inactive-meeple");

        if (is_draft && state.active_player_id === pid) {
            fresh.classList.add("active-meeple");
            fresh.addEventListener("mousedown", function (e) {
                e.preventDefault();
                start_meeple_drag(e, pid);
            });
        } else {
            fresh.classList.add("inactive-meeple");
        }
        token.replaceWith(fresh);
    });
}

start_meeple_drag = function (e, pid) {
    meeple_drag_active = true;
    meeple_ghost = document.createElement("div");
    meeple_ghost.id = "meeple-ghost";
    meeple_ghost.dataset.player = pid;
    document.body.appendChild(meeple_ghost);
    move_meeple_ghost(e.clientX, e.clientY);

    document.querySelectorAll(".draft-tile.available").forEach(function (el) {
        el.classList.add("drop-target");
    });
};

move_meeple_ghost = function (x, y) {
    if (!meeple_ghost) {
        return;
    }
    meeple_ghost.style.left = `${x - 14}px`;
    meeple_ghost.style.top = `${y - 14}px`;
};

function cancel_meeple_drag() {
    meeple_drag_active = false;
    if (meeple_ghost) {
        meeple_ghost.remove();
        meeple_ghost = null;
    }
    document.querySelectorAll(".drop-target").forEach(function (el) {
        el.classList.remove("drop-target");
    });
}

// ─── Actions ────────────────────────────────────────────────────────────────

confirm_placement = function (row, col) {
    if (state.phase !== PHASES.RESOLVE_PLACE) {
        return;
    }
    const new_state = attempt_placement(state, row, col, rotation);

    if (
        new_state.phase === PHASES.RESOLVE_PLACE &&
        new_state.current_line_index === state.current_line_index
    ) {
        show_message(new_state.message, "error");
        return;
    }

    state = new_state;
    rotation = 0;
    visual_rotation_deg = 0;
    cancel_drag();
    cancel_keyboard_placement();
    show_message(state.message, "success");
    render_all();
};

handle_draft_click = function (i) {
    if (
        state.phase !== PHASES.DRAFT_INITIAL &&
        state.phase !== PHASES.RESOLVE_DRAFT
    ) {
        return;
    }
    if (state.next_line[i].meeple !== null) {
        return;
    }
    state = place_meeple(state, i);
    render_all();
};

handle_meeple_drop = function (i) {
    cancel_meeple_drag();
    if (
        state.phase !== PHASES.DRAFT_INITIAL &&
        state.phase !== PHASES.RESOLVE_DRAFT
    ) {
        return;
    }
    if (state.next_line[i].meeple !== null) {
        return;
    }
    state = place_meeple(state, i);
    render_all();
};

function rotate_tile() {
    rotation = (rotation + 1) % 4;
    visual_rotation_deg += 90;

    // Update the in-strip tile to show the new rotation
    const active_tile_el = document.querySelector(".draft-tile.highlight");
    if (active_tile_el) {
        active_tile_el.dataset.rotation = rotation;
        active_tile_el.style.setProperty(
            "--rotation-deg",
            `${visual_rotation_deg}deg`
        );
        active_tile_el.style.transform = `rotate(${visual_rotation_deg}deg)`;
    }

    // Update ghost and re-anchor at the last known cursor position
    if (ghost_el) {
        ghost_el.dataset.rotation = rotation;
        ghost_el.style.setProperty(
            "--rotation-deg",
            `${visual_rotation_deg}deg`
        );
        ghost_el.style.transform = `rotate(${visual_rotation_deg}deg)`;
        move_ghost(last_x, last_y);
    }

    // Refresh board preview with new rotation
    if (
        drag_active && state.phase === PHASES.RESOLVE_PLACE &&
        hover_row !== null
    ) {
        show_preview(state.active_player_id, hover_row, hover_col);
    }
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function render_scores() {
    state.players.forEach(function (p) {
        const el = document.getElementById(`score-${p.id}`);
        if (el) {
            el.textContent = p.score;
        }
    });
}

function render_phase() {
    const names = {};
    names[PHASES.DRAFT_INITIAL] = "Initial Draft";
    names[PHASES.RESOLVE_PLACE] = "Place Tile";
    names[PHASES.RESOLVE_DRAFT] = "Draft Next Tile";
    names[PHASES.GAME_OVER] = "Game Over";

    if (phase_el) {
        phase_el.textContent = names[state.phase] || state.phase;
    }
}

function render_turn() {
    const pid = state.active_player_id;
    const player = get_player(state, pid);
    const ind = document.getElementById("turn-indicator");

    if (state.phase === PHASES.GAME_OVER) {
        ind.style.display = "none";
        return;
    }
    ind.style.display = "";
    turn_player_el.textContent = player.name;
    turn_player_el.style.color = player.color;

    const acts = {};
    acts[PHASES.DRAFT_INITIAL] = "PICK A TILE";
    acts[PHASES.RESOLVE_PLACE] = "PLAY YOUR TILE";
    acts[PHASES.RESOLVE_DRAFT] = "PICK A TILE";
    turn_action_el.textContent = acts[state.phase] || "";
}

function render_game_over() {
    if (state.phase !== PHASES.GAME_OVER) {
        return;
    }
    if (document.querySelector(".game-over-modal")) {
        return;
    }

    const p1 = get_player(state, "P1");
    const p2 = get_player(state, "P2");
    const winner = (
        p1.score > p2.score
        ? `${p1.name} wins!`
        : p2.score > p1.score
        ? `${p2.name} wins!`
        : "It's a tie!"
    );

    const modal = document.createElement("dialog");
    modal.className = "game-over-modal";

    modal.innerHTML = `
        <h2>${winner}</h2>
        <p>${p1.name}: ${p1.score} &nbsp;—&nbsp; ${p2.name}: ${p2.score}</p>
        <button class="play-again-btn">Play Again</button>
    `;

    document.body.appendChild(modal);
    modal.showModal();

    const play_btn = modal.querySelector(".play-again-btn");
    play_btn.addEventListener("click", function () {
        modal.close();
        modal.remove();

        state = create_game(2);
        rotation = 0;
        visual_rotation_deg = 0;
        last_rendered_round = 0;

        render_all();
    });
}

render_all = function () {
    const is_new_round = state.round > last_rendered_round;
    const animate = is_new_round && !is_booting;
    last_rendered_round = state.round;

    render_boards();
    render_draft_lines({animate_new_round: animate});
    render_meeples();
    render_scores();
    render_phase();
    render_turn();
    show_message(state.message, "");
    render_game_over();
};

// ─── Global events ──────────────────────────────────────────────────────────

document.addEventListener("mousemove", function (e) {
    if (drag_active) {
        move_ghost(e.clientX, e.clientY);
        if (state.phase === PHASES.RESOLVE_PLACE) {
            const pid = state.active_player_id;

            // The ghost is centered on the cursor (midpoint of both cells).
            // To consistently identify the PRIMARY cell we look up a point
            // that is offset half-a-cell away from the cursor in the direction
            // of the primary (i.e., opposite to where the secondary extends).
            // rot 0: secondary is right → primary is left  → look left
            // rot 1: secondary is down  → primary is up    → look up
            // rot 2: secondary is left  → primary is right → look right
            // rot 3: secondary is up    → primary is down  → look down
            let look_x = e.clientX;
            let look_y = e.clientY;
            if (ghost_el) {
                // min(width, height) of the rotated ghost ≈ one cell in px
                const rect = ghost_el.getBoundingClientRect();
                const half_cell = Math.min(rect.width, rect.height) / 2;

                const offsetsX = [-half_cell, 0, half_cell, 0];
                const offsetsY = [0, -half_cell, 0, half_cell];

                const dx = offsetsX[rotation % 4];
                const dy = offsetsY[rotation % 4];
                look_x += dx;
                look_y += dy;
            }

            const under = document.elementFromPoint(look_x, look_y);
            if (
                under && under.classList.contains("cell")
                && under.id.startsWith(`cell-${pid}`)
            ) {
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
    if (meeple_drag_active) {
        move_meeple_ghost(e.clientX, e.clientY);
    }
});

document.addEventListener("mouseup", function () {
    if (drag_active) {
        cancel_drag();
    }
    if (meeple_drag_active) {
        cancel_meeple_drag();
    }
});

document.addEventListener("keydown", function (e) {
    if (e.key === "r" || e.key === "R") {
        rotate_tile();
    }
    if (e.key === "Escape") {
        if (drag_active) {
            cancel_drag();
        }
        if (keyboard_placement_active) {
            cancel_keyboard_placement();
        }
    }

    if (state.phase === PHASES.RESOLVE_PLACE) {
        if (
            e.key === "ArrowUp" || e.key === "ArrowDown" ||
            e.key === "ArrowLeft" || e.key === "ArrowRight"
        ) {
            e.preventDefault();
            if (!keyboard_placement_active) {
                start_keyboard_placement(state.current_line_index);
            }
            const pid = state.active_player_id;
            clear_preview(pid);
            if (e.key === "ArrowUp") {
                hover_row -= 1;
            }
            if (e.key === "ArrowDown") {
                hover_row += 1;
            }
            if (e.key === "ArrowLeft") {
                hover_col -= 1;
            }
            if (e.key === "ArrowRight") {
                hover_col += 1;
            }
            show_preview(pid, hover_row, hover_col);
        } else if (e.key === "Enter" || e.key === " ") {
            if (
                keyboard_placement_active &&
                hover_row !== null &&
                hover_col !== null
            ) {
                e.preventDefault();
                confirm_placement(hover_row, hover_col);
            }
        }
    }
});

document.addEventListener("wheel", function (e) {
    if (drag_active && state.phase === PHASES.RESOLVE_PLACE) {
        e.preventDefault();
        rotate_tile();
    }
}, {passive: false});

btn_rotate.addEventListener("click", rotate_tile);

// ─── Console playability ────────────────────────────────────────────────────
// Expose the full game API on window so the game can be tested from the
// browser console, as the assessment brief requires.

const Kingdomino = {
    PHASES,
    create_game,
    get_player,
    place_meeple,
    attempt_placement,
    score_board
};

window.Kingdomino = Kingdomino;

/** Get the live game state (read-only snapshot). */
window.getState = function () {
    return JSON.parse(JSON.stringify(state));
};

/** Replace the live game state and re-render. */
window.setState = function (new_state) {
    state = new_state;
    render_all();
};

// ─── Boot ───────────────────────────────────────────────────────────────────

render_all();

function show_welcome_modal() {
    const modal = document.createElement("dialog");
    modal.className = "game-over-modal welcome-modal";

    modal.innerHTML = `
        <div class="modal-scroll-header">
            <div class="scroll-edge left"></div>
            <div class="scroll-body">
                <h2>Welcome to
                <span
                style="font-family: 'Jacquard 12', serif; font-size: 1.5em"
                >
                    Kingdomino
                </span></h2>
            </div>
            <div class="scroll-edge right"></div>
        </div>
        <div class="modal-content-box">
            <div class="name-inputs">
                <input type="text" id="p1-name"
                    placeholder="Player 1 Name" value="" />
                <input type="text" id="p2-name"
                    placeholder="Player 2 Name" value="" />
            </div>
            <button class="play-again-btn" id="start-game-btn">
                Start Game
            </button>
        </div>
    `;

    document.body.appendChild(modal);
    modal.showModal();

    const start_btn = modal.querySelector("#start-game-btn");
    start_btn.addEventListener("click", function () {
        const p1_val = modal.querySelector("#p1-name").value.trim();
        const p2_val = modal.querySelector("#p2-name").value.trim();
        const p1_name = p1_val || "Player 1";
        const p2_name = p2_val || "Player 2";

        state = Object.assign({}, state, {
            players: state.players.map(function (p) {
                if (p.id === "P1") {
                    return Object.assign({}, p, {name: p1_name});
                }
                if (p.id === "P2") {
                    return Object.assign({}, p, {name: p2_name});
                }
                return p;
            })
        });

        modal.close();
        modal.remove();
        is_booting = false;
        last_rendered_round = 0;
        render_all();
    });
}

show_welcome_modal();
render_all();

/* eslint-disable no-console */
console.log(
    "%c Kingdomino - Console API ",
    "color:#FFD700; font-size:16px; font-weight:bold;"
);
console.log(
    "The full game API is available as %cwindow.Kingdomino%c.\n" +
    "  Kingdomino.create_game(2)    — new game state\n" +
    "  Kingdomino.place_meeple(s,i) — draft a tile\n" +
    "  Kingdomino.attempt_placement(s, row, col, rot)\n" +
    "  Kingdomino.score_board(board)\n\n" +
    "Inspect live state:  %cgetState()%c\n" +
    "Replace live state:  %csetState(newState)%c",
    "color:#3B82C8",
    "",
    "color:#3B82C8",
    "",
    "color:#3B82C8",
    ""
);
/* eslint-enable no-console */
