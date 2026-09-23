/**
 * paste-expand — Claude Code-style paste handling for the pi input editor.
 *
 * Large pastes collapse to a `[paste #N +X lines]` marker. Pasting the same
 * text again expands that marker in place instead of inserting a duplicate.
 * A widget above the editor shows the "paste again to expand" hint.
 *
 * Shape: `PasteExpandEditor extends CustomEditor`, installed once via
 * `ctx.ui.setEditorComponent`. Bracketed-paste bytes never reach the base
 * class; small pastes are re-wrapped and delegated so their behavior stays
 * byte-identical to base. Collapse entries live in the base paste map so
 * submit-time expansion (`getExpandedText`) works unchanged.
 *
 * Private reach-through (pi-tui 0.85.1): `pastes`, `pasteCounter`,
 * `lastAction`, `state`, `pushUndoSnapshot`, `setCursorCol`,
 * `cancelAutocomplete`, `exitHistoryBrowsing`. All access goes through
 * `internals()`, which validates the shape at runtime and returns undefined
 * on mismatch — every call site degrades to base behavior instead of
 * throwing, so a pi-tui upgrade can only disable the expand feature, never
 * break typing.
 */
import {
	CustomEditor,
	type ExtensionAPI,
	type ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";

// Mirrors the base collapse threshold: >10 lines or >1000 chars.
const COLLAPSE_MIN_LINES = 10;
const COLLAPSE_MIN_CHARS = 1000;

// Bracketed-paste framing written by the terminal.
const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

// Upper bound on tracked collapses. Re-paste lookup is a linear scan.
const MAX_PENDING = 10;

const WIDGET_KEY = "paste-expand";

// Matches `[paste #3]`, `[paste #3 +42 lines]`, `[paste #3 1234 chars]`.
// Same shape as the base marker regex.
const PASTE_MARKER_PATTERN =
	"\\[paste #(\\d+)( (\\+\\d+ lines|\\d+ chars))?\\]";

function markerPatternFor(id: number): RegExp {
	return new RegExp(`\\[paste #${id}( (\\+\\d+ lines|\\d+ chars))?\\]`);
}

interface CollapsedPaste {
	id: number;
	content: string;
	label: string;
}

/**
 * Base-class internals this extension relies on. Validated at runtime by
 * `PasteExpandEditor.internals()`; do not access these fields directly.
 */
interface EditorInternals {
	pastes: Map<number, string>;
	pasteCounter: number;
	lastAction: string | null;
	state: { lines: string[]; cursorLine: number; cursorCol: number };
	pushUndoSnapshot(): void;
	setCursorCol(col: number): void;
	cancelAutocomplete(): void;
	exitHistoryBrowsing(): void;
}

/**
 * Base paste cleanup, shared by collapse and small-paste paths: decode
 * terminal control-byte escapes, normalize line endings/tabs, strip
 * non-printables, keep the path-space heuristic. Mirrors
 * `Editor.handlePaste` so small pastes behave identically to base.
 */
function cleanPastedText(
	raw: string,
	lines: string[],
	cursor: { line: number; col: number },
): string {
	// Some terminals (e.g. tmux popups) re-encode control bytes inside
	// bracketed paste as CSI-u sequences. Decode them back first.
	// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional match of the ESC byte in terminal CSI-u sequences.
	const decoded = raw.replace(/\x1b\[(\d+);5u/g, (match, code: string) => {
		const cp = Number(code);
		if (cp >= 97 && cp <= 122) return String.fromCharCode(cp - 96);
		if (cp >= 65 && cp <= 90) return String.fromCharCode(cp - 64);
		return match;
	});
	const clean = decoded
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n")
		.replace(/\t/g, "    ");
	const filtered = clean
		.split("")
		.filter((char) => char === "\n" || char.charCodeAt(0) >= 32)
		.join("");
	// Pasting a path right after a word character: prepend a space.
	if (/^[/~.]/.test(filtered)) {
		const currentLine = lines[cursor.line] ?? "";
		const before = cursor.col > 0 ? currentLine[cursor.col - 1] : "";
		if (before && /\w/.test(before)) return ` ${filtered}`;
	}
	return filtered;
}

class PasteExpandEditor extends CustomEditor {
	private pendingPasteBuffer = "";
	private inPendingPaste = false;
	private pending: CollapsedPaste[] = [];
	private ui: ExtensionUIContext | undefined;
	private hintVisible = false;
	private hintLabel = "";

	/** Attach (or detach) the UI used for the expand hint widget. */
	setUI(ui: ExtensionUIContext | undefined): void {
		if (this.ui && this.ui !== ui) this.hideHint();
		this.ui = ui;
		this.reconcileHint();
	}

	override handleInput(data: string): void {
		// Own the bracketed-paste buffering (mirrors base) so paste bytes
		// are routed before any app-shortcut handling.
		if (this.inPendingPaste || data.includes(PASTE_START)) {
			if (data.includes(PASTE_START)) {
				this.inPendingPaste = true;
				this.pendingPasteBuffer = "";
				data = data.replace(PASTE_START, "");
			}
			this.pendingPasteBuffer += data;
			const end = this.pendingPasteBuffer.indexOf(PASTE_END);
			if (end === -1) return;
			const content = this.pendingPasteBuffer.substring(0, end);
			const rest = this.pendingPasteBuffer.substring(end + PASTE_END.length);
			this.inPendingPaste = false;
			this.pendingPasteBuffer = "";
			if (content.length > 0) this.handlePasteContent(content);
			if (rest.length > 0) this.handleInput(rest);
			return;
		}
		super.handleInput(data);
		// Covers submit (text cleared) and marker deletion: drop the hint
		// when no tracked marker survives.
		this.reconcileHint();
	}

	override setText(text: string): void {
		super.setText(text);
		this.pending = [];
		this.hideHint();
	}

	private handlePasteContent(raw: string): void {
		const cleaned = cleanPastedText(raw, this.getLines(), this.getCursor());
		const lines = cleaned.split("\n");
		const large =
			lines.length > COLLAPSE_MIN_LINES || cleaned.length > COLLAPSE_MIN_CHARS;
		if (!large) {
			// Re-wrap and let base run its exact pipeline.
			super.handleInput(`${PASTE_START}${raw}${PASTE_END}`);
			this.reconcileHint();
			return;
		}
		const known = this.pending.find((entry) => entry.content === cleaned);
		if (known) {
			this.pending = this.pending.filter((entry) => entry !== known);
			if (this.markerPresent(known.id)) {
				try {
					if (this.expandPaste(known)) {
						this.reconcileHint();
						return;
					}
				} catch {
					// Surgery failed (e.g. version drift): fall through and
					// collapse fresh rather than losing the pasted text.
				}
			}
		}
		this.collapseFresh(cleaned, lines);
	}

	private collapseFresh(content: string, lines: string[]): void {
		const internal = this.internals();
		if (!internal) {
			// Degraded: let base collapse natively (marker works, no expand).
			super.handleInput(`${PASTE_START}${content}${PASTE_END}`);
			return;
		}
		if (this.pending.length >= MAX_PENDING) this.pending.shift();
		const id = internal.pasteCounter + 1;
		internal.pasteCounter = id;
		internal.pastes.set(id, content);
		const marker =
			lines.length > COLLAPSE_MIN_LINES
				? `[paste #${id} +${lines.length} lines]`
				: `[paste #${id} ${content.length} chars]`;
		// Public insert: one undo unit, cancels autocomplete, fires onChange.
		this.insertTextAtCursor(marker);
		this.pending.push({ id, content, label: marker });
		this.showHint(marker);
	}

	/**
	 * Replace the marker for a re-pasted collapse with its full content,
	 * in place. Returns false when the marker or map entry is gone (caller
	 * then collapses fresh). Single undo unit restores the marker.
	 */
	private expandPaste(known: CollapsedPaste): boolean {
		const internal = this.internals();
		if (!internal) return false;
		if (internal.pastes.get(known.id) !== known.content) return false;
		const pattern = markerPatternFor(known.id);
		const lines = internal.state.lines;
		let lineIdx = -1;
		let colIdx = -1;
		let matchLen = 0;
		for (let i = 0; i < lines.length; i++) {
			const match = pattern.exec(lines[i]);
			if (match) {
				lineIdx = i;
				colIdx = match.index;
				matchLen = match[0].length;
				break;
			}
		}
		if (lineIdx === -1) return false;
		internal.cancelAutocomplete();
		internal.exitHistoryBrowsing();
		internal.lastAction = null;
		internal.pushUndoSnapshot();
		const contentLines = known.content.split("\n");
		const line = lines[lineIdx] ?? "";
		const before = line.slice(0, colIdx);
		const after = line.slice(colIdx + matchLen);
		if (contentLines.length === 1) {
			lines[lineIdx] = before + known.content + after;
			internal.state.cursorLine = lineIdx;
			internal.setCursorCol(colIdx + known.content.length);
		} else {
			const first = contentLines[0] ?? "";
			const last = contentLines[contentLines.length - 1] ?? "";
			lines.splice(
				lineIdx,
				1,
				before + first,
				...contentLines.slice(1, -1),
				last + after,
			);
			internal.state.cursorLine = lineIdx + contentLines.length - 1;
			internal.setCursorCol(last.length);
		}
		// Remove the entry and renumber higher ids (mirrors base backspace).
		internal.pastes.delete(known.id);
		internal.pasteCounter -= 1;
		const higher = [...internal.pastes.keys()]
			.filter((key) => key > known.id)
			.sort((a, b) => a - b);
		for (const hid of higher) {
			const value = internal.pastes.get(hid);
			if (value === undefined) continue;
			internal.pastes.set(hid - 1, value);
			internal.pastes.delete(hid);
		}
		for (const entry of this.pending) {
			if (entry.id > known.id) entry.id -= 1;
		}
		const renumber = new RegExp(PASTE_MARKER_PATTERN, "g");
		for (let i = 0; i < lines.length; i++) {
			lines[i] = lines[i].replace(
				renumber,
				(full, idGroup: string, suffix: string | undefined) => {
					const num = Number(idGroup);
					return num > known.id ? `[paste #${num - 1}${suffix ?? ""}]` : full;
				},
			);
		}
		this.onChange?.(this.getText());
		return true;
	}

	private markerPresent(id: number): boolean {
		return markerPatternFor(id).test(this.getText());
	}

	/** Drop stale entries; show the hint for the latest live collapse. */
	private reconcileHint(): void {
		if (this.pending.length === 0) {
			this.hideHint();
			return;
		}
		const text = this.getText();
		let latest: CollapsedPaste | undefined;
		this.pending = this.pending.filter((entry) => {
			const live = markerPatternFor(entry.id).test(text);
			if (live) latest = entry;
			return live;
		});
		if (latest) this.showHint(latest.label);
		else this.hideHint();
	}

	private showHint(label: string): void {
		if (this.hintVisible && this.hintLabel === label) return;
		this.hintLabel = label;
		this.hintVisible = true;
		this.ui?.setWidget(WIDGET_KEY, [`${label} — paste again to expand`]);
	}

	private hideHint(): void {
		this.hintLabel = "";
		if (!this.hintVisible) return;
		this.hintVisible = false;
		this.ui?.setWidget(WIDGET_KEY, undefined);
	}

	/**
	 * Validated view of base-class internals. Returns undefined when the
	 * shape does not match (e.g. after a pi-tui upgrade); callers degrade
	 * to base behavior in that case.
	 */
	private internals(): EditorInternals | undefined {
		const self = this as unknown as Record<string, unknown>;
		const pastes = self.pastes;
		const state = self.state as
			| { lines: unknown; cursorLine: unknown; cursorCol: unknown }
			| undefined;
		const pushUndoSnapshot = self.pushUndoSnapshot;
		const setCursorCol = self.setCursorCol;
		const cancelAutocomplete = self.cancelAutocomplete;
		const exitHistoryBrowsing = self.exitHistoryBrowsing;
		if (
			!(pastes instanceof Map) ||
			typeof self.pasteCounter !== "number" ||
			!state ||
			!Array.isArray(state.lines) ||
			typeof state.cursorLine !== "number" ||
			typeof state.cursorCol !== "number" ||
			typeof pushUndoSnapshot !== "function" ||
			typeof setCursorCol !== "function" ||
			typeof cancelAutocomplete !== "function" ||
			typeof exitHistoryBrowsing !== "function"
		) {
			return undefined;
		}
		return self as unknown as EditorInternals;
	}
}

export default function (pi: ExtensionAPI): void {
	let editor: PasteExpandEditor | undefined;
	let installed = false;
	let ui: ExtensionUIContext | undefined;

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		// Install once per extension instance: reinstalling would copy raw
		// marker text through setText and orphan the base paste map.
		if (!installed) {
			ctx.ui.setEditorComponent((tui, theme, keybindings) => {
				editor = new PasteExpandEditor(tui, theme, keybindings);
				editor.setUI(ui);
				return editor;
			});
			installed = true;
		}
		ui = ctx.ui;
		editor?.setUI(ui);
	});

	pi.on("session_shutdown", () => {
		ui = undefined;
		editor?.setUI(undefined);
	});
}
