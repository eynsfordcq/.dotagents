/**
 * Pretty startup banner.
 *
 * Replaces Pi's raw startup header with a small ASCII logo, the Pi version,
 * one-line hints, and clean bullet lists for Context / Skills / Prompts /
 * Extensions. Data comes from Pi's own rendered resource panel, so this
 * needs no discovery logic and always matches what Pi loaded.
 *
 * Theme colors are used throughout (`accent` for the logo, `mdHeading` for
 * section titles, `dim` for items). If the theme has no usable accent, the
 * logo falls back to a hard-coded purple.
 */

import {
	type ExtensionAPI,
	type Theme,
	VERSION,
} from "@earendil-works/pi-coding-agent";
import {
	type Component,
	stripTerminalSequences,
	type TUI,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";

// Geometric P+i mark, padded to equal width.
const LOGO: readonly string[] = [
	"██████████    ",
	"████  ████    ",
	"████  ████    ",
	"████████  ████",
	"████      ████",
	"████      ████",
];

// Hard-coded purple fallback (xterm 141) when the theme accent is unusable.
const FALLBACK_PURPLE_OPEN = "\u001b[38;5;141m";
const FALLBACK_RESET = "\u001b[39m";

const SECTION_ORDER = ["Context", "Skills", "Prompts", "Extensions"];

const RETRY_DELAYS_MS = [0, 60, 200, 500];
const MIN_TWO_COLUMN_WIDTH = 76;
const COLUMN_GAP = 4;
const BOX_HORIZONTAL_PADDING = 1;

function padToWidth(text: string, width: number): string {
	const clipped = truncateToWidth(text, width, "…");
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function clipLinesToWidth(lines: string[], width: number): string[] {
	return lines.map((line) => (line ? truncateToWidth(line, width, "") : ""));
}

function accent(theme: Theme, text: string): string {
	try {
		return theme.fg("accent", text);
	} catch {
		return `${FALLBACK_PURPLE_OPEN}${text}${FALLBACK_RESET}`;
	}
}

interface Panel {
	children: Component[];
	addChild(component: Component): void;
	removeChild(component: Component): void;
}

function isPanel(value: unknown): value is Panel {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<Panel>;
	return (
		Array.isArray(candidate.children) &&
		typeof candidate.addChild === "function" &&
		typeof candidate.removeChild === "function"
	);
}

interface Collapsible {
	getCollapsedText?: () => string;
}

interface TextBuilder {
	/** Pi 1.0 `ThemedText` keeps its text in this closure. `ExpandableText`
	 * passes `() => (expanded ? expandedText : collapsedText)`, so at
	 * startup capture time this returns the collapsed `[Section]` block. */
	build?: () => string;
}

function isSpacer(child: Component): boolean {
	return typeof (child as { setLines?: unknown }).setLines === "function";
}

/** Read one `[Section]` row, or return undefined when absent. */
function readSection(
	child: Component,
): { name: string; items: string[] } | undefined {
	const legacy = (child as Collapsible).getCollapsedText;
	if (typeof legacy === "function") return parseSection(legacy.call(child));
	const build = (child as TextBuilder).build;
	if (typeof build !== "function") return undefined;
	try {
		return parseSection(build.call(child));
	} catch {
		return undefined;
	}
}

/** Parse one `[Section]` block into its name and items.
 * Collapsed bodies are one comma-joined line; expanded bodies are one item
 * per line. Split each line on commas so both shapes work. */
export function parseSection(
	text: string,
): { name: string; items: string[] } | undefined {
	const plain = stripTerminalSequences(text);
	const firstLine = plain.split("\n", 1)[0] ?? "";
	const heading = /^ *\[([^\]]+)\] *$/.exec(firstLine);
	if (!heading?.[1]) return undefined;
	const bodyLines = plain.split("\n").slice(1);
	const items = bodyLines
		.flatMap((line) => line.split(","))
		.map((item) => item.trim())
		.filter(Boolean);
	return { name: heading[1], items: [...new Set(items)] };
}

interface SectionTarget {
	child: Component;
	index: number;
}

interface RemovedChild {
	panel: Panel;
	child: Component;
	index: number;
}

/** Layout: [headerContainer, loadedResourcesContainer, chatContainer]. */
function findResourcePanel(tui: TUI): Panel | undefined {
	const document = tui.children[0];
	if (!isPanel(document) || document.children.length < 2) return undefined;
	const panel = document.children[1];
	if (!isPanel(panel)) return undefined;
	return panel;
}

function collectSectionTargets(
	children: Component[],
	sections: Map<string, string[]>,
): SectionTarget[] {
	const targets: SectionTarget[] = [];
	for (let index = 0; index < children.length; index += 1) {
		const child = children[index] as Component;
		const section = readSection(child);
		if (!section) continue;
		sections.set(section.name, section.items);
		targets.push({ child, index });
	}
	return targets;
}

function isAdjacentToSection(
	children: Component[],
	index: number,
	sectionChildren: Set<Component>,
): boolean {
	const prev = children[index - 1];
	const next = children[index + 1];
	return (
		(prev !== undefined && sectionChildren.has(prev)) ||
		(next !== undefined && sectionChildren.has(next))
	);
}

/** Pi puts a blank spacer around each section; hide those too. */
function collectAdjacentSpacers(
	children: Component[],
	targets: SectionTarget[],
): SectionTarget[] {
	const sectionChildren = new Set(targets.map((target) => target.child));
	const spacers: SectionTarget[] = [];
	for (let index = 0; index < children.length; index += 1) {
		const child = children[index] as Component;
		if (sectionChildren.has(child) || !isSpacer(child)) continue;
		if (isAdjacentToSection(children, index, sectionChildren)) {
			spacers.push({ child, index });
		}
	}
	return spacers;
}

function renderLogoHeader(theme: Theme): string[] {
	return [
		"",
		...LOGO.map((row) => accent(theme, row)),
		`${accent(theme, "pi")} ${theme.fg("dim", `v${VERSION}`)}`,
		theme.fg(
			"dim",
			"esc interrupt · ctrl+c clear · / commands · ! bash · ctrl+o more",
		),
		"",
	];
}

function mergeColumns(
	left: string[],
	right: string[],
	leftWidth: number,
	rightWidth: number,
): string[] {
	const rowCount = Math.max(left.length, right.length);
	const rows: string[] = [];
	for (let row = 0; row < rowCount; row += 1) {
		const leftCell = padToWidth(left[row] ?? "", leftWidth);
		const rightCell = truncateToWidth(right[row] ?? "", rightWidth, "…");
		rows.push(`${leftCell}${" ".repeat(COLUMN_GAP)}${rightCell}`.trimEnd());
	}
	return rows;
}

function frameLines(lines: string[], width: number, theme: Theme): string[] {
	const contentWidth = width - BOX_HORIZONTAL_PADDING * 2 - 2;
	const border = (text: string) => theme.fg("border", text);
	const horizontal = "─".repeat(width - 2);
	return [
		border(`╭${horizontal}╮`),
		...lines.map((line) => {
			const content = padToWidth(line, contentWidth);
			return `${border("│")} ${content} ${border("│")}`;
		}),
		border(`╰${horizontal}╯`),
	];
}

class Banner implements Component {
	private sections = new Map<string, string[]>();
	private captured = false;
	private disposed = false;
	private timers: ReturnType<typeof setTimeout>[] = [];
	private removed: RemovedChild[] = [];

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
	) {
		for (const delay of RETRY_DELAYS_MS) {
			this.timers.push(setTimeout(() => this.captureOnce(), delay));
		}
	}

	/** Find Pi's resource panel, copy its sections, and hide the native rows. */
	private captureOnce(): boolean {
		if (this.captured || this.disposed) return this.captured;
		try {
			const panel = findResourcePanel(this.tui);
			if (!panel) return false;

			const original = [...panel.children];
			const sectionTargets = collectSectionTargets(original, this.sections);
			if (sectionTargets.length === 0) return false;

			// Indices are recorded up front so dispose() restores exact order.
			const spacerTargets = collectAdjacentSpacers(original, sectionTargets);
			const targets = [...sectionTargets, ...spacerTargets].sort(
				(left, right) => left.index - right.index,
			);
			for (const { child, index } of targets) {
				panel.removeChild(child);
				this.removed.push({ panel, child, index });
			}

			this.captured = true;
			this.tui.requestRender(true);
			return true;
		} catch {
			return false;
		}
	}

	private ensureCaptured(): void {
		if (this.captured) return;
		try {
			this.captureOnce();
		} catch {
			// Never break startup rendering. The raw header stays visible.
		}
	}

	private splitColumns(): {
		leftNames: string[];
		rightNames: string[];
		orderedNames: string[];
	} {
		const knownNames = SECTION_ORDER.filter((name) => this.sections.has(name));
		const extraNames = [...this.sections.keys()].filter(
			(name) => !SECTION_ORDER.includes(name),
		);
		const leftNames = knownNames.filter((name) => name !== "Extensions");
		const rightNames = [
			...knownNames.filter((name) => name === "Extensions"),
			...extraNames,
		];
		return {
			leftNames,
			rightNames,
			orderedNames: [...knownNames, ...extraNames],
		};
	}

	private shouldUseTwoColumns(
		width: number,
		leftNames: string[],
		rightNames: string[],
	): boolean {
		return (
			width >= MIN_TWO_COLUMN_WIDTH &&
			leftNames.length > 0 &&
			rightNames.length > 0
		);
	}

	private renderBody(width: number): string[] {
		const { leftNames, rightNames, orderedNames } = this.splitColumns();
		if (this.shouldUseTwoColumns(width, leftNames, rightNames)) {
			const leftWidth = Math.floor((width - COLUMN_GAP) / 2);
			const rightWidth = width - COLUMN_GAP - leftWidth;
			const left = this.renderSections(leftNames);
			const right = this.renderSections(rightNames);
			return mergeColumns(left, right, leftWidth, rightWidth);
		}
		return this.renderSections(orderedNames);
	}

	private renderSections(names: string[]): string[] {
		const lines: string[] = [];
		for (const name of names) {
			if (lines.length > 0) lines.push("");
			const items = this.sections.get(name) ?? [];
			lines.push(
				`${this.theme.fg("mdHeading", `[${name}]`)} ${this.theme.fg("dim", `(${items.length})`)}`,
			);
			for (const item of items) {
				lines.push(this.theme.fg("dim", `  • ${item}`));
			}
		}
		return lines;
	}

	render(width: number): string[] {
		if (width <= 0) return [];
		this.ensureCaptured();
		if (width < 4) {
			const lines = [
				...renderLogoHeader(this.theme),
				...this.renderBody(width),
			];
			return clipLinesToWidth(lines, width);
		}

		const contentWidth = width - BOX_HORIZONTAL_PADDING * 2 - 2;
		const lines = [
			...renderLogoHeader(this.theme),
			...this.renderBody(contentWidth),
			"",
		];
		return frameLines(lines, width, this.theme);
	}

	// Required by Component; the banner re-renders via requestRender instead.
	invalidate(): void {}

	dispose(): void {
		this.disposed = true;
		for (const timer of this.timers) clearTimeout(timer);
		this.timers = [];
		this.restoreRemovedChildren();
	}

	/** Restore the native panel on teardown. */
	private restoreRemovedChildren(): void {
		for (const { panel, child, index } of this.removed) {
			if (panel.children.includes(child)) continue;
			panel.children.splice(Math.min(index, panel.children.length), 0, child);
		}
		this.removed = [];
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		ctx.ui.setHeader((tui, theme) => new Banner(tui, theme));
	});
}
