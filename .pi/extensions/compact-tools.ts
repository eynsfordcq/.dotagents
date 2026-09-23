/**
 * compact-tools: one row per tool call, short view of thinking.
 *
 * The chat looks like this while running:
 *
 *   → grep -n "class .*Editor" ~/.pi/... 1.2s
 *   → read ~/src/app.ts <1s
 *
 * Thinking shows the last five rows while it streams. When it ends, it
 * becomes one line you can click to expand:
 *
 *   ✦ Thought for 3.4s.
 *
 * Nothing is hidden for good. Press ctrl+o to expand or collapse all tools.
 * Click one tool row to toggle just that tool. Click a finished-thinking
 * line to read the full text.
 *
 * How it works: three small patches on pi's own components:
 *   ToolExecutionComponent.render            -> one row while collapsed
 *   ToolExecutionComponent.handleMouse       -> click toggles one tool
 *   AssistantMessageComponent.updateContent -> rolling window or summary
 *
 * Each patch saves the original method on a symbol, so /reload does not
 * wrap it twice. Restarting pi is still the safest way to pick up edits.
 *
 * Note: this takes over the built-in ctrl+T thinking toggle. Thinking that
 * is still running stays visible in the small window. Finished thinking
 * collapses; click its line to read the full text.
 *
 * Install with ./sync-extensions.sh.
 */

import { basename } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	AssistantMessageComponent,
	ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import {
	Markdown,
	MouseRegion,
	Spacer,
	truncateToWidth,
} from "@earendil-works/pi-tui";

/** How many characters of one tool argument fit on the row. */
const ARG_MAX_CHARS = 90;
/** Long paths show only their file name, so the useful part stays visible. */
const PATH_MAX_CHARS = 48;
/** How many terminal rows of thinking stay visible while it streams. */
const THINKING_WINDOW_ROWS = 5;
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_MS = 100;

/** Icons. Change these to taste. */
const SYMBOL = {
	/** Tool finished without error. */
	toolDone: "→",
	/** Tool failed. */
	toolError: "✗",
	/** Shown when a tool has no result yet and SPINNER is empty. */
	toolPending: "⠋",
	/** Start of the collapsed thinking line. */
	// thinking: "✦",
	thinking: "⁂",
	/** Value is missing. */
	missing: "…",
	/** Text was cut short to fit. */
	elided: "…",
};

// State
let currentTheme: any;
const toolStartedAt = new Map<string, number>();
const toolEndedAt = new Map<string, number>();

interface ThinkingState {
	phase: "streaming" | "finished";
	startedAt?: number;
	endedAt?: number;
}

// Assistant messages have no id. We use their timestamp as the key instead.
// It stays the same across stream updates, so it links events to components.
const thinkingStates = new Map<number, ThinkingState>();
const assistantComponents = new Map<number, any>();

// Style helpers
function fg(color: string, text: string): string {
	return currentTheme?.fg?.(color, text) ?? text;
}

function bold(text: string): string {
	return currentTheme?.bold?.(text) ?? text;
}

function oneLine(value: unknown, max = ARG_MAX_CHARS): string {
	const text = String(value ?? "")
		.replace(/\s+/g, " ")
		.trim();
	return text.length > max ? `${text.slice(0, max - 1)}${SYMBOL.elided}` : text;
}

function compactPath(path: string): string {
	const home = process.env.HOME;
	const shortened =
		home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
	return shortened.length > PATH_MAX_CHARS
		? `.../${basename(path)}`
		: shortened;
}

function named(name: string, payload: string): string {
	return `${fg("toolTitle", bold(name))} ${fg("dim", payload)}`;
}

/** Pick the one argument that tells you what the tool is doing. */
function toolPayload(toolName: string, args: any): string {
	const a = args ?? {};
	switch (toolName) {
		case "bash":
			return named(toolName, oneLine(a.command));
		case "read":
		case "write":
		case "edit":
			return named(toolName, compactPath(String(a.path ?? SYMBOL.missing)));
		case "grep":
		case "find":
			return named(
				toolName,
				`${oneLine(a.pattern)} in ${compactPath(String(a.path ?? "."))}`,
			);
		case "ls":
			return named(toolName, compactPath(String(a.path ?? ".")));
		default: {
			if (a.path) return named(toolName, compactPath(String(a.path)));
			const fallback =
				a.query ?? a.description ?? a.name ?? a.url ?? SYMBOL.missing;
			return named(toolName, oneLine(fallback));
		}
	}
}

function toolStatus(self: any): "pending" | "success" | "error" {
	if (self.result?.isError) return "error";
	return self.result ? "success" : "pending";
}

/** Empty when the tool did not run in this session, e.g. a restored one. */
function toolDuration(self: any): string {
	const start = toolStartedAt.get(self.toolCallId);
	if (start === undefined) return "";
	const end = toolEndedAt.get(self.toolCallId) ?? Date.now();
	const ms = Math.max(0, end - start);
	return ms < 1000 ? "<1s" : `${(ms / 1000).toFixed(1)}s`;
}

// One collapsed tool call: icon + name + best argument + time.
function toolRow(self: any, width: number): string {
	const status = toolStatus(self);
	const pendingFrame =
		SPINNER.length > 0
			? SPINNER[Math.floor(Date.now() / SPINNER_MS) % SPINNER.length]!
			: SYMBOL.toolPending;
	let color = "success";
	let icon = SYMBOL.toolDone;
	if (status === "error") {
		color = "error";
		icon = SYMBOL.toolError;
	} else if (status === "pending") {
		color = "accent";
		icon = pendingFrame;
	}

	let line = `${fg(color, icon)} ${toolPayload(self.toolName, self.args)}`;
	const duration = toolDuration(self);
	if (duration) line += ` ${fg("muted", duration)}`;
	return truncateToWidth(line, Math.max(1, width), SYMBOL.elided);
}

// Thinking lifecycle
function assistantTimestamp(message: any): number | undefined {
	const timestamp = Number(message?.timestamp);
	return Number.isFinite(timestamp) ? timestamp : undefined;
}

function fullThinkingText(message: any): string {
	if (!Array.isArray(message?.content)) return "";
	return message.content
		.filter(
			(part: any) =>
				part?.type === "thinking" && String(part.thinking ?? "").trim(),
		)
		.map((part: any) => String(part.thinking).trim())
		.join("\n\n");
}

function formatThinkingDuration(state: ThinkingState): string | undefined {
	if (state.startedAt === undefined || state.endedAt === undefined) {
		return undefined;
	}
	const elapsedMs = Math.max(0, state.endedAt - state.startedAt);
	return elapsedMs < 1000 ? undefined : `${(elapsedMs / 1000).toFixed(1)}s`;
}

function finishedThinkingLabel(state: ThinkingState): string {
	const duration = formatThinkingDuration(state);
	return duration
		? `${SYMBOL.thinking} Thought for ${duration}.`
		: `${SYMBOL.thinking} Thought briefly.`;
}

class RollingThinkingWindow implements Component {
	readonly child: Component;

	constructor(child: Component) {
		this.child = child;
	}

	render(width: number): string[] {
		const rows = this.child.render(width);
		// slice(-n) keeps everything when there are fewer than n rows.
		return rows.slice(-THINKING_WINDOW_ROWS);
	}

	invalidate(): void {
		this.child.invalidate();
	}
}

function installRollingThinkingWindow(component: any): void {
	const children = component.contentContainer?.children;
	if (!Array.isArray(children)) return;

	// MouseRegion has no public child accessor. This extension already patches
	// pi's component internals, so keep the unsafe access at this boundary.
	type MouseRegionInternals = { child: Component };
	const getInternals = (region: MouseRegion): MouseRegionInternals =>
		region as unknown as MouseRegionInternals;

	// The thinking text sits inside a clickable area. Wrap it so only the
	// last few rows show while thinking is still streaming.
	const region = children.findLast(
		(child: any) =>
			child instanceof MouseRegion &&
			getInternals(child).child instanceof Markdown,
	) as MouseRegion | undefined;
	if (!region) return;

	const internals = getInternals(region);
	internals.child = new RollingThinkingWindow(internals.child);
}

// Text or thinking sits above the tool rows. Then we add one blank line,
// so the tools do not stick to the text.
function hasTextBeforeTools(message: any): boolean {
	const parts = message?.content;
	if (!Array.isArray(parts)) return false;
	const isVisible = (part: any): boolean =>
		Boolean(
			(part?.type === "text" && String(part.text ?? "").trim()) ||
				(part?.type === "thinking" && String(part.thinking ?? "").trim()),
		);
	const lastVisible = parts.findLastIndex(isVisible);
	const lastTool = parts.findLastIndex(
		(part: any): boolean => part?.type === "toolCall",
	);
	return lastVisible >= 0 && lastTool > lastVisible;
}

function updateThinkingLifecycle(message: any, streamEvent: any): void {
	const timestamp = assistantTimestamp(message);
	if (timestamp === undefined) return;

	const type = String(streamEvent?.type ?? "");
	if (!type.startsWith("thinking_") && type !== "done") return;

	if (type === "thinking_start") {
		thinkingStates.set(timestamp, {
			phase: "streaming",
			startedAt: Date.now(),
		});
	} else if (type === "thinking_end") {
		const state: ThinkingState = thinkingStates.get(timestamp) ?? {
			phase: "finished",
		};
		state.phase = "finished";
		state.endedAt = Date.now();
		thinkingStates.set(timestamp, state);
	}

	// Pi sometimes redraws the message before our handler runs. Redraw again
	// now that the state is fresh, so the message shows the right form.
	assistantComponents.get(timestamp)?.invalidate?.();
}

// Restored messages never stream, so they have no start/end events. When such
// a message already holds thinking text, treat it as finished.
function getThinkingState(
	message: any,
	isStreaming: boolean,
): ThinkingState | undefined {
	const timestamp = assistantTimestamp(message);
	if (timestamp === undefined) return undefined;

	let state = thinkingStates.get(timestamp);
	if (!state && !isStreaming && fullThinkingText(message)) {
		state = { phase: "finished" };
		thinkingStates.set(timestamp, state);
	}
	return state;
}

function isThinkingActive(
	state: ThinkingState | undefined,
	message: any,
	streaming: boolean,
): boolean {
	if (state) return state.phase === "streaming";
	return streaming && Boolean(fullThinkingText(message));
}

function showThinkingSummary(component: any, state: ThinkingState): void {
	component.hideThinkingBlock = true;
	component.hiddenThinkingLabel = finishedThinkingLabel(state);
}

function showLiveThinking(component: any): void {
	component.hideThinkingBlock = false;
	component.thinkingVisibilityOverrides.clear();
}

// Prototype patches
const TOOL_RENDER_ORIGINAL = Symbol.for("compact-tools.tool-render-original");
const TOOL_MOUSE_ORIGINAL = Symbol.for("compact-tools.tool-mouse-original");
const ASSISTANT_UPDATE_ORIGINAL = Symbol.for(
	"compact-tools.assistant-update-original",
);

// `any` below means "pi's own component shape". Pi types these internals
// loosely, so we use what is there and touch as little as possible.
function patchToolRender(): void {
	const toolProto = ToolExecutionComponent.prototype as any;
	const baseToolRender = toolProto[TOOL_RENDER_ORIGINAL] ?? toolProto.render;
	toolProto.render = function (this: any, width: number): string[] {
		if (this.expanded || this.hideComponent) {
			return baseToolRender.call(this, width);
		}
		return [toolRow(this, width)];
	};
	toolProto[TOOL_RENDER_ORIGINAL] = baseToolRender;
}

function patchToolClick(): void {
	const toolProto = ToolExecutionComponent.prototype as any;
	const baseToolHandleMouse =
		toolProto[TOOL_MOUSE_ORIGINAL] ?? toolProto.handleMouse;
	toolProto.handleMouse = function (this: any, event: any) {
		// A collapsed row is one plain line with no click area, so pi's own
		// click-to-expand never runs. Expand here instead. Shrinking a tool
		// back still goes through the original handler.
		if (!this.expanded && event?.type === "click" && event.button === "left") {
			this.setExpanded(true);
			return { handled: true };
		}
		return baseToolHandleMouse.call(this, event);
	};
	toolProto[TOOL_MOUSE_ORIGINAL] = baseToolHandleMouse;
}

function patchAssistantUpdate(): void {
	const assistantProto = AssistantMessageComponent.prototype as any;
	const baseUpdateContent =
		assistantProto[ASSISTANT_UPDATE_ORIGINAL] ?? assistantProto.updateContent;
	assistantProto.updateContent = function (
		this: any,
		message: any,
		isStreaming?: boolean,
	): void {
		const streaming = isStreaming ?? this.isStreaming ?? false;
		const timestamp = assistantTimestamp(message);
		if (timestamp !== undefined) assistantComponents.set(timestamp, this);

		const state = getThinkingState(message, streaming);
		const thinkingLive = isThinkingActive(state, message, streaming);
		if (state?.phase === "finished") {
			showThinkingSummary(this, state);
		} else if (thinkingLive) {
			showLiveThinking(this);
		}
		baseUpdateContent.call(this, message, isStreaming);
		if (thinkingLive) installRollingThinkingWindow(this);
		if (hasTextBeforeTools(message)) {
			this.contentContainer.addChild(new Spacer(1));
		}
	};
	assistantProto[ASSISTANT_UPDATE_ORIGINAL] = baseUpdateContent;
}

function installPatches(): void {
	patchToolRender();
	patchToolClick();
	patchAssistantUpdate();
}

// Extension
export default function (pi: ExtensionAPI) {
	installPatches();

	pi.on("session_start", (_event, ctx) => {
		currentTheme = ctx.ui.theme;
	});

	pi.on("message_update", (event) => {
		const message = event.message as any;
		if (message?.role !== "assistant") return;
		updateThinkingLifecycle(message, event.assistantMessageEvent);
	});

	pi.on("tool_execution_start", (event) => {
		toolStartedAt.set(event.toolCallId, Date.now());
	});

	pi.on("tool_execution_end", (event) => {
		toolEndedAt.set(event.toolCallId, Date.now());
	});
}
