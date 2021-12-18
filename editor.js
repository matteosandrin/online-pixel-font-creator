import {to_utf16, from_utf16, unicode_data, unicode_blocks, keys_pressed, new_glyph} from "./main.js";
import {draw, PREVIEW_MULT} from "./draw.js";
import * as preview from "./preview.js";

export const editor_canvas = document.getElementById("editor-canvas");
export const editor_ctx = editor_canvas.getContext("2d");
export const editor_info = document.getElementById("editor-info");

const button_xor = document.getElementById("button-xor");
const button_one = document.getElementById("button-one");
const button_zero = document.getElementById("button-zero");

const button_draw = document.getElementById("button-draw");
const button_move = document.getElementById("button-move");
const button_select = document.getElementById("button-select");
const button_deselect = document.getElementById("button-deselect");
const button_deselect_all = document.getElementById("button-deselect-all");
const button_drag = document.getElementById("button-drag");

const jump_glyph = document.getElementById("jump-glyph");

const ZOOM_STRENGTH = 0.001;

export const MODE_NONE = 0;
export const MODE_DRAW = 1;
export const MODE_MOVE = 2;
export const MODE_DRAG = 3;

export const OP_XOR = 0;
export const OP_ONE = 1;
export const OP_ZERO = 2;
export const OP_SELECT = 3;
export const OP_DESELECT = 4;

export const HOTKEYS = new Map();
HOTKEYS.set("1", () => editor_status.operation = OP_XOR);
HOTKEYS.set("2", () => editor_status.operation = OP_ONE);
HOTKEYS.set("3", () => editor_status.operation = OP_ZERO);
HOTKEYS.set("4", () => editor_status.operation = OP_SELECT);
HOTKEYS.set("5", () => editor_status.operation = OP_DESELECT);
HOTKEYS.set("d", () => editor_status.persistent_mode = MODE_DRAW);
HOTKEYS.set("D", () => {
    editor_status.pixels_selected = new Set()
    button_deselect_all.className = "active";
    setTimeout(() => {
        button_deselect_all.className = "";
    }, 200);
});
HOTKEYS.set("t", () => editor_status.persistent_mode = MODE_MOVE);
HOTKEYS.set("g", () => editor_status.persistent_mode = MODE_DRAG);


export const editor_status = {
    current_glyph: 65,
    get pixel_size() {
        return Math.pow(2, this.zoom);
    },
    cx: 0,
    cy: 0,
    old_cx: 0,
    old_cy: 0,
    zoom: 5,
    hovered: false,

    _tmp_mode: null,
    set tmp_mode(value) {
        this._tmp_mode = value;
        update_buttons();
    },
    get tmp_mode() {
        return this._tmp_mode;
    },
    _persistent_mode: MODE_DRAW,
    set persistent_mode(value) {
        this._persistent_mode = value;
        update_buttons();
    },
    get persistent_mode() {
        return this._persistent_mode;
    },
    get mode() {
        return this.tmp_mode ?? this.persistent_mode;
    },

    _operation: OP_XOR,
    set operation(value) {
        this._operation = value;
        update_buttons();
    },
    get operation() {
        return this._operation;
    },
    pixels_covered: new Set(),
    _pixels_selected: new Set(),
    get pixels_selected() {
        return this.pixels_selected_tmp ?? this._pixels_selected;
    },
    set pixels_selected(value) {
        this._pixels_selected = value;
    },
    pixels_selected_tmp: null,
};
window.editor_status = editor_status;


function editor_get_pixel(x, y) {
    return [
        Math.floor(
            (x - editor_status.cx - (editor_canvas.width - font_data.width * editor_status.pixel_size) / 2)
            / editor_status.pixel_size
        ),
        Math.floor(
            (y - editor_status.cy - (editor_canvas.height - font_data.height * editor_status.pixel_size) / 2)
            / editor_status.pixel_size
        ),
    ];
}

function editor_pixel_inside(px, py) {
    return px >= 0 && py >= 0 && px < font_data.width && py < font_data.height;
}

function editor_place_pixel(x, y) {
    let [px, py] = editor_get_pixel(x, y);

    if (editor_pixel_inside(px, py) && !editor_status.pixels_covered.has(`${px},${py}`)) {
        editor_status.pixels_covered.add(`${px},${py}`);
        let current_glyph = font_data.glyphs.get(editor_status.current_glyph);
        if (!current_glyph) {
            current_glyph = new_glyph();
            font_data.glyphs.set(editor_status.current_glyph, current_glyph);
        }
        let previous = current_glyph[py][px];

        if (editor_status.operation === OP_XOR) {
            current_glyph[py][px] = !current_glyph[py][px];
        } else if (editor_status.operation === OP_ONE) {
            current_glyph[py][px] = true;
        } else if (editor_status.operation === OP_ZERO) {
            current_glyph[py][px] = false;
        } else if (editor_status.operation === OP_SELECT) {
            editor_status.pixels_selected.add(`${px},${py}`);
            return true; // Not efficient but eh
        } else if (editor_status.operation === OP_DESELECT) {
            editor_status.pixels_selected.delete(`${px},${py}`);
            return true;
        }

        return previous !== current_glyph[py][px];
    }

    return false;
}

function editor_apply_drag(x, y) {
    editor_status.pixels_selected_tmp = null;
    let dx = Math.floor((x - editor_status.mouse_down_x) / editor_status.pixel_size);
    let dy = Math.floor((y - editor_status.mouse_down_y) / editor_status.pixel_size);
    let current_glyph = font_data.glyphs.get(editor_status.current_glyph);

    let new_glyph = current_glyph.map(row => [...row]);
    let new_selection = new Set();

    for (let pixel of editor_status._pixels_selected) {
        let [px, py] = pixel.split(",").map(x => +x);
        new_glyph[py][px] = false;
    }

    for (let pixel of editor_status._pixels_selected) {
        let [px, py] = pixel.split(",").map(x => +x);

        if (editor_pixel_inside(px + dx, py + dy)) {
            new_selection.add(`${px + dx},${py + dy}`);
            new_glyph[py + dy][px + dx] = current_glyph[py][px];
        }
    }

    font_data.glyphs.set(editor_status.current_glyph, new_glyph);
    editor_status.pixels_selected = new_selection;

    preview.draw();
    draw();
}

function editor_click(x, y) {
    if (editor_status.mode === MODE_DRAW) {
        editor_status.pixels_covered = new Set();
        if (editor_place_pixel(x, y)) {
            preview.draw();
            draw();
        }
    }
}

function editor_drag(x, y) {
    if (editor_status.mode === MODE_MOVE) {
        editor_status.cx = editor_status.old_cx + x - editor_status.mouse_down_x;
        editor_status.cy = editor_status.old_cy + y - editor_status.mouse_down_y;
        draw();
    } else if (editor_status.mode === MODE_DRAW) {
        if (editor_place_pixel(x, y)) {
            preview.draw();
            draw();
        }
    } else if (editor_status.mode === MODE_DRAG) {
        editor_status.pixels_selected_tmp = new Set();
        let dx = Math.floor((x - editor_status.mouse_down_x) / editor_status.pixel_size);
        let dy = Math.floor((y - editor_status.mouse_down_y) / editor_status.pixel_size);
        for (let pixel of editor_status._pixels_selected) {
            let [px, py] = pixel.split(",").map(x => +x);
            editor_status.pixels_selected_tmp.add(`${px + dx},${py + dy}`);
        }
        draw();
    }
}

function editor_commit_history() {
    // Check if the current glyph is different from the previous glyph in the history
    let current_glyph = font_data.glyphs.get(editor_status.current_glyph);
    function should_commit() {
        let last_glyph = font_data.history.findLastIndex(entry => entry.id === editor_status.current_glyph);
        if (current_glyph && last_glyph !== -1) {
            last_glyph = font_data.history[last_glyph];
            for (let y = 0; y < font_data.height; y++) {
                for (let x = 0; x < font_data.width; x++) {
                    if (last_glyph.data[y][x] != current_glyph[y][x]) {
                        return true;
                    }
                }
            }
        } else if (current_glyph) return true;

        return false;
    }

    if (should_commit()) {
        font_data.history.push({
            id: editor_status.current_glyph,
            data: current_glyph.map(row => [...row]),
        });
    }
}

export function editor_undo() {
    let last_glyph = font_data.history.findLastIndex(entry => entry.id === editor_status.current_glyph);
    let second_last_glyph = font_data.history.findSecondLastIndex(entry => entry.id === editor_status.current_glyph);
    if (second_last_glyph !== -1) {
        font_data.glyphs.set(editor_status.current_glyph, font_data.history[second_last_glyph].data);
        font_data.history.splice(last_glyph, 1);
        preview.draw();
        draw();
    } else if (last_glyph !== -1) {
        font_data.glyphs.set(editor_status.current_glyph, new_glyph());
        font_data.history.splice(last_glyph, 1);
        preview.draw();
        draw();
    }
}

export function update_info() {
    function pad(str, length) {
        if (str.length < length) return '0'.repeat(length - str.length) + str;
        else return str;
    }

    let info_text = `U+${pad(editor_status.current_glyph.toString(16), 4)}`;
    info_text += ` (${editor_status.current_glyph}): `;
    info_text += `"${to_utf16(editor_status.current_glyph)}" `;
    info_text += unicode_data.get(editor_status.current_glyph); // Returns undefined for the CJK characters
    let block = (unicode_blocks ?? []).find(block => block[0] <= editor_status.current_glyph && block[1] >= editor_status.current_glyph);
    if (block) {
        info_text += `; Block: ${block[2]}`;
    }

    editor_info.innerText = info_text;
}

// TODO: use arrays or smth
export function update_buttons() {
    button_xor.className = editor_status.operation === OP_XOR ? "active" : "";
    button_one.className = editor_status.operation === OP_ONE ? "active" : "";
    button_zero.className = editor_status.operation === OP_ZERO ? "active" : "";
    button_select.className = editor_status.operation === OP_SELECT ? "active" : "";
    button_deselect.className = editor_status.operation === OP_DESELECT ? "active" : "";

    button_draw.className = editor_status.mode === MODE_DRAW ? "active" : "";
    button_move.className = editor_status.mode === MODE_MOVE ? "active" : "";
    button_drag.className = editor_status.mode === MODE_DRAG ? "active" : "";
}

editor_canvas.addEventListener("mousedown", (event) => {
    editor_status.mouse_down = true;
    editor_status.mouse_down_x = event.clientX;
    editor_status.mouse_down_y = event.clientY;

    if (event.button === 2) {
        editor_status.tmp_mode = MODE_NONE;
    } else if (event.clientY >= editor_canvas.height - (font_data.height + 2) * PREVIEW_MULT) {
        editor_status.tmp_mode = MODE_NONE;
        let n_chars = Math.floor(editor_canvas.width / (font_data.width + 2) / PREVIEW_MULT);
        let offset = Math.floor(event.clientX / (font_data.width + 2) / PREVIEW_MULT) - Math.round(n_chars / 2);
        if (offset !== 0 && editor_status.current_glyph + offset >= 0 && editor_status.current_glyph + offset <= 0x1FFFF) {
            editor_status.current_glyph += offset;
            update_info();
            draw();
        }
    } else if (keys_pressed.get(" ") || event.button === 1) {
        editor_status.tmp_mode = MODE_MOVE;
        editor_canvas.classList.add("drag");
    }

    editor_click(event.clientX, event.clientY, event);
});

editor_canvas.addEventListener("mouseup", (event) => {
    editor_status.mouse_down = false;

    if (editor_status.mode === MODE_DRAG) {
        editor_apply_drag(event.clientX, event.clientY, event);
        editor_commit_history();
    } else if (editor_status.mode === MODE_DRAW) {
        editor_commit_history();
    }

    editor_status.old_cx = editor_status.cx;
    editor_status.old_cy = editor_status.cy;

    if (editor_status.tmp_mode === MODE_MOVE) {
        editor_canvas.classList.remove("drag");
    }
    editor_status.tmp_mode = null;
});

editor_canvas.addEventListener("mouseenter", (event) => {
    editor_status.hovered = true;
});

editor_canvas.addEventListener("mouseleave", (event) => {
    editor_status.mouse_down = false;
    editor_status.hovered = false;
});

editor_canvas.addEventListener("mousemove", (event) => {
    editor_status.hovered = true;
    if (editor_status.mouse_down) {
        editor_drag(event.clientX, event.clientY, event);
    }
});

editor_canvas.addEventListener("wheel", (event) => {
    editor_status.cx /= Math.pow(2, event.deltaY * ZOOM_STRENGTH);
    editor_status.old_cx = editor_status.cx;
    editor_status.cy /= Math.pow(2, event.deltaY * ZOOM_STRENGTH);
    editor_status.old_cy = editor_status.cy;
    editor_status.zoom -= event.deltaY * ZOOM_STRENGTH;
    draw();
});

jump_glyph.addEventListener("change", (event) => {
    let match = /^(?:U\+)?([0-9A-F]{4,6})$/i.exec(jump_glyph.value);
    if (match) {
        editor_status.current_glyph = Number.parseInt(match[1], 16);
        draw();
        update_info();
        jump_glyph.value = "";
    } else if (jump_glyph.value) {
        editor_status.current_glyph = from_utf16(jump_glyph.value);
        if (editor_status.current_glyph < 0 || editor_status.current_glyph > 0x1FFFF) {
            editor_status.current_glyph = jump_glyph.value.charCodeAt(0);
        }
        draw();
        update_info();
        jump_glyph.value = "";
    }
});
