import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionUIContext,
	getMarkdownTheme,
	parseSkillBlock,
	SkillInvocationMessageComponent,
	stripFrontmatter,
	UserMessageComponent,
} from "@earendil-works/pi-coding-agent";
import {
	type AutocompleteItem,
	type AutocompleteProvider,
	type AutocompleteSuggestions,
	Container,
	type EditorComponent,
	fuzzyFilter,
	Spacer,
} from "@earendil-works/pi-tui";

/**
 * multi-skills: type `/skill:name` anywhere in your message.
 *
 * Pi only suggests slash commands at the very start of the message.
 * This extension adds two things on top of that.
 *
 * 1. A picker that works mid-message. Type `/` after a space or on a new
 *    line and you get the skill list. Keep typing to narrow it down.
 *    Both `/go` and `/skill:go` match. A small hook re-opens the picker
 *    as you type, so you do not need to press Tab first.
 *
 * 2. Multi-skill submit. When you send the message, every `/skill:name`
 *    that sits on its own line, or at the end of a line after some text,
 *    is collected into one message. The model then sees all skills plus
 *    your text in a single turn. Each skill still shows as its own
 *    collapsible chip, just like a normal core invocation.
 *
 *    Anything this extension does not handle is left for core: a lone
 *    `/skill:name` on a single-line message, extra words on the same line
 *    as the reference, unknown skill names, references in the middle of
 *    a line, and messages with images.
 */

const SKILL_COMMAND_PREFIX = "skill:";
const MAX_SUGGESTIONS = 20;

/**
 * Matches a `/...` token right before the cursor.
 *
 * This covers `/skill:go` and the short form `/go`.
 * A lone `/` also matches. It then shows the full list.
 *
 * The `/` must start a fresh token. It must sit at the start of the
 * line, after a space, or after `(`. This keeps paths like `a/b`
 * and words like `and/or` from opening the picker.
 */
const SKILL_TRIGGER_PATTERN =
	/(?:^|[\s(])(\/[A-Za-z0-9-]*(?::[A-Za-z0-9-]*)?)$/;

/** Matches a line that holds nothing but one skill reference. */
const SKILL_LINE_PATTERN = /^\/skill:([a-z0-9][a-z0-9-]*)$/;

/**
 * Matches a skill reference at the end of a line.
 *
 * This covers a whole line (`/skill:go`) and text plus a reference
 * (`please help /skill:go`). Only the end of the line counts.
 */
const SKILL_TOKEN_AT_EOL_PATTERN = /(?:^|[\s(])\/skill:([a-z0-9][a-z0-9-]*)$/;

interface LoadedSkill {
	name: string;
	filePath: string;
	baseDir: string;
}

/** Data stored on the combined message. Blocks hold raw `<skill>` text. */
interface MultiSkillDetails {
	blocks: string[];
	body?: string;
}

/** Skill references found in a message, plus the leftover text. */
interface SkillRefs {
	names: string[];
	bodyLines: string[];
}

/** One bundled submit: the skills to load and the leftover text. */
interface InvocationPlan {
	skills: LoadedSkill[];
	body: string;
}

/** Factory that builds the composer editor. Other extensions can replace it. */
type EditorFactory = NonNullable<
	ReturnType<ExtensionUIContext["getEditorComponent"]>
>;

/** Smallest part of the UI we need: read and replace the editor factory. */
type EditorHostUI = Pick<
	ExtensionUIContext,
	"getEditorComponent" | "setEditorComponent"
>;

/**
 * List every skill pi knows about, by name.
 *
 * Reads pi's command list and keeps entries from skills.
 * When two entries share a name, the first one wins.
 * This copies how core resolves `/skill:name`.
 */
function resolveSkills(api: ExtensionAPI): Map<string, LoadedSkill> {
	const skills = new Map<string, LoadedSkill>();

	for (const command of api.getCommands()) {
		const isSkill = command.source === "skill";
		const hasPrefix = command.name.startsWith(SKILL_COMMAND_PREFIX);
		if (!isSkill || !hasPrefix) {
			continue;
		}

		const name = command.name.slice(SKILL_COMMAND_PREFIX.length);
		if (skills.has(name)) {
			continue;
		}

		skills.set(name, {
			name,
			filePath: command.sourceInfo.path,
			// Core resolves relative paths from the skill's own folder
			// (the parent of SKILL.md). Copy that here.
			baseDir: dirname(command.sourceInfo.path),
		});
	}

	return skills;
}

/**
 * Build the `<skill>` block for one skill.
 *
 * Uses the same shape as core's `/skill:name` expansion.
 * The chat renderer can then parse it with the normal core parser.
 */
function buildSkillBlock(skill: LoadedSkill): string {
	const body = stripFrontmatter(readFileSync(skill.filePath, "utf-8")).trim();
	return `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
}

/**
 * Pull skill references out of each line.
 *
 * Handles whole lines (`/skill:go`) and text with a reference at the
 * end (`please help /skill:go`). A line can hold several references
 * at its end. They come back in the order they were written.
 *
 * Unknown names are skipped, but the scan keeps looking left.
 * A typo at the end of a line still lets earlier names through.
 * When a line yields no known skill, the original line is kept as is.
 *
 * References in the middle of a line stay untouched.
 * Words after the reference on the same line also stay untouched.
 */
export function extractSkillRefs(
	lines: string[],
	isKnown: (name: string) => boolean,
): SkillRefs {
	const names: string[] = [];
	const bodyLines: string[] = [];

	for (const line of lines) {
		let prose = line.trim();
		const found: string[] = [];

		while (true) {
			const match = SKILL_TOKEN_AT_EOL_PATTERN.exec(prose);
			if (!match) {
				break;
			}

			const refName = match[1];

			if (!isKnown(refName)) {
				// Drop this unknown token from the scan, but keep the
				// text before it. The full original line is kept later
				// as body text when nothing known is found.
				// match[0] holds the separator plus the token, so work
				// out where the separator ends and cut there.
				const separatorLength = match[0].length - match[0].trimStart().length;
				const cutAt = match.index + separatorLength;
				prose = prose.slice(0, cutAt).trim();
				if (!prose) {
					break;
				}
				continue;
			}

			found.push(refName);
			prose = prose.slice(0, match.index).trim();
		}

		if (found.length === 0) {
			bodyLines.push(line);
			continue;
		}

		// The loop strips tokens from the end backwards,
		// so flip them back into reading order.
		found.reverse();
		for (const refName of found) {
			names.push(refName);
		}

		if (prose) {
			bodyLines.push(prose);
		}
	}

	return { names, bodyLines };
}

/**
 * Decide what to do with a submitted message.
 *
 * Returns the skills plus leftover text. Returns null when this
 * extension should stay out of the way and core should handle it.
 *
 * A message that is only `/skill:name` stays with core.
 * That is core's normal single-skill shape.
 *
 * This also fixes a core gap. Core splits the command from its text
 * at the first space. A skill line plus more lines below would
 * quietly arrive as plain text. Here it becomes a real invocation.
 */
function planInvocation(
	text: string,
	api: ExtensionAPI,
): InvocationPlan | null {
	const lines = text.trim().split("\n");

	const isSingleSkillLine =
		lines.length === 1 && SKILL_LINE_PATTERN.test(lines[0].trim());
	if (isSingleSkillLine) {
		return null;
	}

	const available = resolveSkills(api);

	function isKnownSkill(name: string): boolean {
		return available.has(name);
	}

	const { names, bodyLines } = extractSkillRefs(lines, isKnownSkill);

	// The same skill twice still loads once. Loading it twice would
	// double the context for no gain and show two chips.
	const uniqueNames = [...new Set(names)];
	if (uniqueNames.length === 0) {
		return null;
	}

	const skills: LoadedSkill[] = [];
	for (const name of uniqueNames) {
		const skill = available.get(name);
		if (!skill) {
			// Cannot happen: each name passed the isKnownSkill check.
			// Guard anyway instead of asserting.
			return null;
		}
		skills.push(skill);
	}

	return {
		skills,
		body: bodyLines.join("\n").trim(),
	};
}

/**
 * Read the `/...` token right before the cursor, if there is one.
 * Returns the token text (for example `/sk`) or undefined.
 */
function skillTailBeforeCursor(
	lines: string[],
	line: number,
	col: number,
): string | undefined {
	const lineText = lines[line] ?? "";
	const beforeCursor = lineText.slice(0, col);
	const match = SKILL_TRIGGER_PATTERN.exec(beforeCursor);
	if (!match) {
		return undefined;
	}
	return match[1];
}

/**
 * Check if the token lives mid-message rather than at the very start.
 *
 * Core owns a `/...` at the start of the first line. This extension
 * only steps in when real text sits before the token, or when the
 * token is on a later line. This keeps the two pickers from fighting.
 */
function hasProseBeforeToken(
	lines: string[],
	line: number,
	col: number,
	tail: string,
): boolean {
	const lineText = lines[line] ?? "";
	const tokenStart = col - tail.length;
	const beforeToken = lineText.slice(0, tokenStart).trim();
	if (beforeToken !== "") {
		return true;
	}
	return line > 0;
}

/**
 * Turn what the user typed into a plain search string.
 * `/skill:go` gives `go`. `/go` gives `go`. `/` gives ``.
 */
function tailToQuery(tail: string): string {
	const rest = tail.slice(1);
	if (rest.startsWith(SKILL_COMMAND_PREFIX)) {
		return rest.slice(SKILL_COMMAND_PREFIX.length);
	}
	return rest;
}

/** Read the picker label off an item. Kept separate so call sites stay flat. */
function getItemLabel(item: AutocompleteItem): string {
	return item.label;
}

/**
 * Collect every skill as a picker row.
 * Rows start as `/skill:name` values with `skill:name` labels.
 */
function buildSkillItems(api: ExtensionAPI): AutocompleteItem[] {
	const skills = resolveSkills(api);
	const items: AutocompleteItem[] = [];
	for (const skill of skills.values()) {
		items.push({
			value: `/skill:${skill.name}`,
			label: `skill:${skill.name}`,
		});
	}
	return items;
}

/**
 * Fill in each row's grey hint text from pi's command list.
 * Rows without a known hint keep no hint.
 */
function attachSkillDescriptions(
	items: AutocompleteItem[],
	api: ExtensionAPI,
): void {
	const descriptions = new Map<string, string | undefined>();
	for (const command of api.getCommands()) {
		if (command.source !== "skill") {
			continue;
		}
		descriptions.set(command.name, command.description);
	}

	for (const item of items) {
		const description = descriptions.get(item.label);
		if (description) {
			item.description = description;
		}
	}
}

/**
 * Narrow rows down to the search string.
 *
 * Fuzzy match first, then keep only names that start with the query.
 * Without a query, return the first rows unchanged.
 */
function filterSkillItems(
	items: AutocompleteItem[],
	query: string,
): AutocompleteItem[] {
	if (!query) {
		return items.slice(0, MAX_SUGGESTIONS);
	}

	const fuzzyItems = fuzzyFilter(items, query, getItemLabel);

	const prefixItems: AutocompleteItem[] = [];
	for (const item of fuzzyItems) {
		const shortName = item.label
			.slice(SKILL_COMMAND_PREFIX.length)
			.toLowerCase();
		if (shortName.startsWith(query)) {
			prefixItems.push(item);
		}
	}

	return prefixItems.slice(0, MAX_SUGGESTIONS);
}

/**
 * Picker wrapper. Shows skills mid-message, defers to core otherwise.
 *
 * When the cursor sits in a mid-message `/...` token, show skills.
 * In every other spot, hand the request back to the built-in picker.
 */
function createMultiSkillsProvider(
	api: ExtensionAPI,
	current: AutocompleteProvider,
): AutocompleteProvider {
	return {
		triggerCharacters: [...(current.triggerCharacters ?? []), "/"],

		async getSuggestions(
			lines: string[],
			cursorLine: number,
			cursorCol: number,
			options: { signal: AbortSignal; force?: boolean },
		): Promise<AutocompleteSuggestions | null> {
			const tail = skillTailBeforeCursor(lines, cursorLine, cursorCol);
			if (tail === undefined) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}
			const isMidline = hasProseBeforeToken(lines, cursorLine, cursorCol, tail);
			if (!isMidline) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			const query = tailToQuery(tail).toLowerCase();

			const items = buildSkillItems(api);
			attachSkillDescriptions(items, api);
			const filtered = filterSkillItems(items, query);
			if (filtered.length === 0) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			// The prefix drops the leading `/`. With a leading `/` the
			// editor would send the whole message on Enter. That is right
			// for commands at the start, but wrong in the middle of text.
			return { items: filtered, prefix: tail.slice(1) };
		},

		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			const line = lines[cursorLine] ?? "";
			const tail = skillTailBeforeCursor(lines, cursorLine, cursorCol);
			const isSkillItem = item.value.startsWith("/skill:");
			const isMidline =
				tail !== undefined &&
				hasProseBeforeToken(lines, cursorLine, cursorCol, tail);
			if (tail === undefined || !isSkillItem || !isMidline) {
				return current.applyCompletion(
					lines,
					cursorLine,
					cursorCol,
					item,
					prefix,
				);
			}

			// Swap only the `/...` token for the picked skill.
			// Keep the text around it. Then move the rest of the line
			// onto its own next line. One skill per line is the shape
			// the submit step looks for. The cursor lands right after
			// the skill so another `/...` can follow at once.
			const token = tail;
			const before = line.slice(0, cursorCol - token.length);
			const after = line.slice(cursorCol).replace(/^\s+/, "");

			const next = [...lines];
			next[cursorLine] = `${before}${item.value}`;
			if (after) {
				next.splice(cursorLine + 1, 0, after);
			} else {
				next.splice(cursorLine + 1, 0, "");
			}

			return {
				lines: next,
				cursorLine,
				cursorCol: before.length + item.value.length,
			};
		},

		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			// Tab should accept a mid-message skill, not a file path.
			// A `/...` at the very start keeps the normal core behavior.
			const tail = skillTailBeforeCursor(lines, cursorLine, cursorCol);
			const isMidline =
				tail !== undefined &&
				hasProseBeforeToken(lines, cursorLine, cursorCol, tail);
			if (isMidline) {
				return true;
			}
			return (
				current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ??
				true
			);
		},
	};
}

/**
 * Find the real core editor hidden behind wrapper layers.
 *
 * Some setups (for example Zentui) wrap the core editor. The wrapper
 * only shows `getLines` and `getCursor`. The auto-open hook needs the
 * core's private `tryTriggerAutocomplete`. This walks down through
 * `.base` links and prototypes until it finds the owner.
 */
function findAutocompleteTarget(
	editor: unknown,
): { tryTrigger: () => void } | undefined {
	let current: unknown = editor;

	for (
		let depth = 0;
		depth < 10 && current !== null && typeof current === "object";
		depth++
	) {
		const candidate = current as { tryTriggerAutocomplete?: unknown };
		if (typeof candidate.tryTriggerAutocomplete === "function") {
			const trigger = candidate.tryTriggerAutocomplete as () => void;
			const owner = current;
			return {
				tryTrigger: function triggerAutocomplete(): void {
					trigger.call(owner);
				},
			};
		}

		const record = current as Record<string | symbol, unknown>;
		const hasBase =
			"base" in record &&
			record.base !== null &&
			typeof record.base === "object";
		if (hasBase) {
			// Zentui's WrappedPolishedEditor keeps the core editor here.
			current = record.base;
			continue;
		}

		const proto = Object.getPrototypeOf(current) as {
			tryTriggerAutocomplete?: unknown;
		} | null;
		const protoHasTrigger =
			proto !== null &&
			typeof proto === "object" &&
			typeof proto.tryTriggerAutocomplete === "function";
		if (protoHasTrigger) {
			const trigger = proto.tryTriggerAutocomplete as () => void;
			const owner = current;
			return {
				tryTrigger: function triggerAutocomplete(): void {
					trigger.call(owner);
				},
			};
		}

		return undefined;
	}

	return undefined;
}

/** True for normal typing keys: letters, digits, `:`, `-`, `.`, `/`. */
function isPlainTypingChar(data: string): boolean {
	if (data.length !== 1) {
		return false;
	}
	return /^[A-Za-z0-9_:\-./]$/.test(data);
}

/**
 * Open the picker when the user types a mid-message `/...` token.
 *
 * Skips when the picker is already open. Skips at the very start
 * of the message (core owns that spot). Otherwise asks the core
 * editor to open the picker. When the core editor cannot be found
 * (pi renamed it), nothing happens and Tab still works.
 */
function tryAutoOpenMidlinePicker(editor: EditorComponent): void {
	const inner = editor as unknown as {
		isShowingAutocomplete?: () => boolean;
		getCursor?: () => { line: number; col: number };
		getLines?: () => string[];
	};
	if (
		typeof inner.isShowingAutocomplete !== "function" ||
		typeof inner.getCursor !== "function" ||
		typeof inner.getLines !== "function"
	) {
		return;
	}
	if (inner.isShowingAutocomplete()) {
		return;
	}

	const cursor = inner.getCursor();
	const lines = inner.getLines();
	const lineText = lines[cursor.line] ?? "";
	const beforeCursor = lineText.slice(0, cursor.col);
	const match = SKILL_TRIGGER_PATTERN.exec(beforeCursor);
	if (!match) {
		return;
	}
	const tail = match[1];

	const isMidline = hasProseBeforeToken(lines, cursor.line, cursor.col, tail);
	if (!isMidline) {
		return;
	}

	const target = findAutocompleteTarget(editor);
	if (target) {
		target.tryTrigger();
	}
}

/**
 * Add the auto-open hook to the editor.
 *
 * The normal editor only opens the `/` picker at the start of the
 * message. After plain typing it also re-opens inside `@` and `#`
 * tokens, but never for a mid-message `/...`. This hook watches
 * keystrokes and opens the picker for that missing case.
 *
 * It wraps the current factory instead of replacing it. Other editor
 * extensions (for example Zentui) keep working underneath.
 */
function wrapEditorFactory(base: EditorFactory): EditorFactory {
	const buildEditor: EditorFactory = (tui, theme, keybindings) => {
		const editor = base(tui, theme, keybindings);

		// Hook the instance, not the prototype. Some editors set
		// handleInput directly on the instance.
		const originalHandleInput = editor.handleInput.bind(editor);

		editor.handleInput = function handleInputWithSkillHook(data: string): void {
			originalHandleInput(data);
			if (!isPlainTypingChar(data)) {
				return;
			}
			tryAutoOpenMidlinePicker(editor);
		};

		return editor;
	};

	return buildEditor;
}

const WRAPPED_FLAG = "__multiSkillsWrapped";

/** True once our keystroke hook is already on this factory. */
function isEditorWrapped(factory: EditorFactory): boolean {
	const flags = factory as unknown as Record<string, unknown>;
	return Boolean(flags[WRAPPED_FLAG]);
}

/** Mark a factory so a second pass skips it. */
function markEditorWrapped(factory: EditorFactory): void {
	const flags = factory as unknown as Record<string, unknown>;
	flags[WRAPPED_FLAG] = true;
}

/**
 * Read the active editor factory from the UI, if the host has one.
 * Some hosts (tests, older pi builds) have no editor to wrap.
 */
function readEditorFactory(ui: EditorHostUI): EditorFactory | undefined {
	const getter = (ui as unknown as { getEditorComponent?: unknown })
		.getEditorComponent;
	if (typeof getter !== "function") {
		return undefined;
	}
	const factory = (getter as () => EditorFactory | undefined).call(ui);
	return factory;
}

/**
 * Put our keystroke hook onto the active editor factory.
 *
 * Returns true when the hook is on, or when there is nothing to wrap.
 * Returns false when the factory is not ready yet (call again later).
 */
function wrapActiveEditor(ui: EditorHostUI): boolean {
	const base = readEditorFactory(ui);
	if (base === undefined) {
		// No getEditorComponent means nothing to wrap.
		// The picker still works through Tab.
		// No factory yet means another extension has not installed
		// its editor. The retry timer tries again.
		const hasGetter =
			typeof (ui as unknown as { getEditorComponent?: unknown })
				.getEditorComponent === "function";
		return !hasGetter;
	}
	if (isEditorWrapped(base)) {
		return true;
	}
	markEditorWrapped(base);
	ui.setEditorComponent(wrapEditorFactory(base));
	return true;
}

export default function multiSkillsExtension(api: ExtensionAPI): void {
	api.registerMessageRenderer<MultiSkillDetails>(
		"multi-skill",
		(message, options) => {
			const details = message.details;
			if (!details || details.blocks.length === 0) {
				return undefined;
			}
			const markdownTheme = getMarkdownTheme();
			const container = new Container();
			for (const block of details.blocks) {
				const parsed = parseSkillBlock(block);
				if (!parsed) {
					continue;
				}
				const chip = new SkillInvocationMessageComponent(parsed, markdownTheme);
				chip.setExpanded(options.expanded);
				container.addChild(chip);
			}
			if (details.body) {
				container.addChild(new Spacer(1));
				container.addChild(
					new UserMessageComponent(details.body, markdownTheme),
				);
			}
			return container;
		},
	);

	api.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") {
			return;
		}
		ctx.ui.addAutocompleteProvider(function provideSkillAnywhere(current) {
			return createMultiSkillsProvider(api, current);
		});
		wrapActiveEditor(ctx.ui);

		// Wrap instead of replace: whoever is installed now stays as the
		// base, and our keystroke hook rides on top. Retry on a timer
		// because other extensions (for example Zentui) may install their
		// editor after session_start. Each pass skips marked factories.
		// The timer stops once the hook is on, or after 10 seconds.
		const timer = setInterval(() => {
			if (wrapActiveEditor(ctx.ui)) {
				clearInterval(timer);
			}
		}, 500);
		setTimeout(() => clearInterval(timer), 10_000);
	});

	api.on("input", (event) => {
		// Images stay with core. They are not folded into our message.
		if (event.images?.length) {
			return { action: "continue" };
		}

		let plan: InvocationPlan | null = null;
		let blocks: string[] = [];
		try {
			plan = planInvocation(event.text, api);
			if (plan) {
				// Load every skill file before taking over the submit.
				// A missing file then stays with core instead of leaving
				// a half-sent message in the chat.
				const loaded: string[] = [];
				for (const skill of plan.skills) {
					loaded.push(buildSkillBlock(skill));
				}
				blocks = loaded;
			}
		} catch {
			return { action: "continue" };
		}
		if (!plan) {
			return { action: "continue" };
		}

		let llmText: string;
		if (plan.body) {
			llmText = [...blocks, plan.body].join("\n\n");
		} else {
			llmText = blocks.join("\n\n");
		}

		// One message carries every skill plus the text. The model sees
		// it all in a single turn, with no extra "skill loaded" rounds.
		// While streaming, sendMessage queues on its own.
		api.sendMessage(
			{
				customType: "multi-skill",
				content: [{ type: "text", text: llmText }],
				display: true,
				details: { blocks, body: plan.body || undefined },
			},
			{ triggerTurn: true },
		);
		return { action: "handled" };
	});
}
