/**
 * compact-tools: compact tool calls and completed model thinking.
 *
 * The chat renders like this while streaming:
 *
 *   → grep -n "class .*Editor" ~/.pi/... 1.2s
 *   → read ~/src/app.ts <1s
 *
 * Thinking streams through a five-row rolling window. When it ends, the
 * extension replaces it with an expandable summary:
 *
 *   ✦ Thought for 3.4s.
 *
 * The full output is still reachable. Press ctrl+o to expand or collapse all
 * tools, or click a single tool row to toggle just that one. Clicking a
 * finished-thinking summary shows its full text.
 *
 * Three prototype patches carry the whole extension:
 *   ToolExecutionComponent.render             -> one row while collapsed
 *   ToolExecutionComponent.handleMouse        -> click to toggle one tool
 *   AssistantMessageComponent.updateContent  -> rolling thinking or final summary
 *
 * Both patches reuse the original method stored on a symbol, so /reload does
 * not wrap them twice. Restarting pi is still the safe way to pick up edits.
 *
 * Note: this intentionally overrides the built-in ctrl+T thinking toggle.
 * Active thinking stays visible in the rolling window. Finished thinking
 * collapses; click its summary to read the full text.
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

// =============================================================================
// Tuning
// =============================================================================
/** Max characters of one tool argument shown on the row. */
const ARG_MAX_CHARS = 90;
/** Long paths keep only their filename so the useful part stays visible. */
const PATH_MAX_CHARS = 48;
/** Maximum rendered terminal rows shown while thinking streams. */
const THINKING_WINDOW_ROWS = 5;
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_MS = 100;

// =============================================================================
// State
// =============================================================================
let currentTheme: any;
const toolStartedAt = new Map<string, number>();
const toolEndedAt = new Map<string, number>();

interface ThinkingState {
	phase: "streaming" | "finished";
	startedAt?: number;
	endedAt?: number;
}

// Assistant messages have no id. Their creation timestamp is stable across
// stream updates and is enough to associate lifecycle events with components.
const thinkingStates = new Map<number, ThinkingState>();
const assistantComponents = new Map<number, any>();

// =============================================================================
// Style helpers
// =============================================================================
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
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function compactPath(path: string): string {
	const home = process.env.HOME;
	const shortened =
		home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
	return shortened.length > PATH_MAX_CHARS ? `.../${basename(path)}` : shortened;
}

function named(name: string, payload: string): string {
	return `${fg("toolTitle", bold(name))} ${fg("dim", payload)}`;
}

/** The styled tool name and its most useful argument. */
function toolPayload(toolName: string, args: any): string {
	const a = args ?? {};
	switch (toolName) {
		case "bash":
			return named(toolName, oneLine(a.command));
		case "read":
		case "write":
		case "edit":
			return named(toolName, compactPath(String(a.path ?? "…")));
		case "grep":
		case "find":
			return named(
				toolName,
				`${oneLine(a.pattern)} in ${compactPath(String(a.path ?? "."))}`,
			);
		case "ls":
			return named(toolName, compactPath(String(a.path ?? ".")));
		default: {
			const fallback = a.path ?? a.query ?? a.description ?? a.name ?? a.url;
			const payload = a.path
				? compactPath(String(a.path))
				: oneLine(fallback ?? "…");
			return named(toolName, payload);
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
	const end = self.result
		? (toolEndedAt.get(self.toolCallId) ?? Date.now())
		: Date.now();
	const ms = Math.max(0, end - start);
	return ms < 1000 ? "<1s" : `${(ms / 1000).toFixed(1)}s`;
}

/** The single collapsed row for one tool call. */
function toolRow(self: any, width: number): string {
	const status = toolStatus(self);
	const color =
		status === "pending" ? "accent" : status === "error" ? "error" : "success";
	const icon =
		status === "pending"
			? SPINNER[Math.floor(Date.now() / SPINNER_MS) % SPINNER.length]!
			: status === "error"
				? "✗"
				: "→";

	let line = `${fg(color, icon)} ${toolPayload(self.toolName, self.args)}`;
	const duration = toolDuration(self);
	if (duration) line += ` ${fg("muted", duration)}`;
	return truncateToWidth(line, Math.max(1, width), "…");
}

// =============================================================================
// Thinking lifecycle
// =============================================================================
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
	return duration ? `✦ Thought for ${duration}.` : "✦ Thought briefly.";
}

class RollingThinkingWindow implements Component {
	readonly child: Component;

	constructor(child: Component) {
		this.child = child;
	}

	render(width: number): string[] {
		const rows = this.child.render(width);
		if (rows.length <= THINKING_WINDOW_ROWS) return rows;

		return rows.slice(-THINKING_WINDOW_ROWS);
	}

	invalidate(): void {
		this.child.invalidate();
	}
}

function installRollingThinkingWindow(component: any): void {
	const children = component.contentContainer?.children;
	if (!Array.isArray(children)) return;

	const region = children.findLast(
		(child: any) => child instanceof MouseRegion && child.child instanceof Markdown,
	);
	if (region) region.child = new RollingThinkingWindow(region.child);
}

function visibleContentPrecedesToolRows(message: any): boolean {
	if (!Array.isArray(message?.content)) return false;

	let lastVisibleIndex = -1;
	let lastToolIndex = -1;
	for (let index = 0; index < message.content.length; index++) {
		const part = message.content[index];
		if (part?.type === "toolCall") lastToolIndex = index;
		if (
			(part?.type === "text" && String(part.text ?? "").trim()) ||
			(part?.type === "thinking" && String(part.thinking ?? "").trim())
		) {
			lastVisibleIndex = index;
		}
	}
	return lastVisibleIndex >= 0 && lastToolIndex > lastVisibleIndex;
}

function createThinkingState(
	phase: ThinkingState["phase"],
	startedAt?: number,
): ThinkingState {
	return { phase, startedAt };
}

function updateThinkingLifecycle(message: any, streamEvent: any): void {
	const timestamp = assistantTimestamp(message);
	if (timestamp === undefined) return;

	const type = String(streamEvent?.type ?? "");
	if (!type.startsWith("thinking_") && type !== "done") return;

	let state = thinkingStates.get(timestamp);
	if (type === "thinking_start") {
		state = createThinkingState("streaming", Date.now());
		thinkingStates.set(timestamp, state);
	} else if (state && type === "thinking_end") {
		state.phase = "finished";
		state.endedAt = Date.now();
	} else if (type === "thinking_end") {
		state = createThinkingState("finished");
		state.endedAt = Date.now();
		thinkingStates.set(timestamp, state);
	}

	// Interactive mode may update the component before extension handlers run.
	// Rebuild it after the lifecycle state changes so this event still redraws
	// with the correct visible-or-summary form.
	assistantComponents.get(timestamp)?.invalidate?.();
}

function thinkingStateFor(
	message: any,
	isStreaming: boolean,
): ThinkingState | undefined {
	const timestamp = assistantTimestamp(message);
	if (timestamp === undefined) return undefined;

	let state = thinkingStates.get(timestamp);
	if (!state && !isStreaming && fullThinkingText(message)) {
		state = createThinkingState("finished");
		thinkingStates.set(timestamp, state);
	}
	return state;
}

// =============================================================================
// Prototype patches
// =============================================================================
const TOOL_RENDER_ORIGINAL = Symbol.for("compact-tools.tool-render-original");
const TOOL_MOUSE_ORIGINAL = Symbol.for("compact-tools.tool-mouse-original");
const ASSISTANT_UPDATE_ORIGINAL = Symbol.for(
	"compact-tools.assistant-update-original",
);

function installPatches(): void {
	const toolProto = ToolExecutionComponent.prototype as any;
	const baseToolRender = toolProto[TOOL_RENDER_ORIGINAL] ?? toolProto.render;
	toolProto.render = function (this: any, width: number): string[] {
		if (this.expanded || this.hideComponent) {
			return baseToolRender.call(this, width);
		}
		return [toolRow(this, width)];
	};
	toolProto[TOOL_RENDER_ORIGINAL] = baseToolRender;

	const baseToolHandleMouse =
		toolProto[TOOL_MOUSE_ORIGINAL] ?? toolProto.handleMouse;
	toolProto.handleMouse = function (this: any, event: any) {
		// A collapsed row renders one line and registers no click region, so
		// the built-in expand-on-click never fires. Expand here instead.
		// Collapsing an expanded tool still goes through the original.
		if (!this.expanded && event?.type === "click" && event.button === "left") {
			this.setExpanded(true);
			return { handled: true };
		}
		return baseToolHandleMouse.call(this, event);
	};
	toolProto[TOOL_MOUSE_ORIGINAL] = baseToolHandleMouse;

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

		const state = thinkingStateFor(message, streaming);
		const activeThinking =
			state?.phase === "streaming" ||
			(!state && streaming && Boolean(fullThinkingText(message)));
		if (state?.phase === "finished") {
			this.hideThinkingBlock = true;
			this.hiddenThinkingLabel = finishedThinkingLabel(state);
		} else if (activeThinking) {
			this.hideThinkingBlock = false;
			this.thinkingVisibilityOverrides.clear();
		}
		baseUpdateContent.call(this, message, isStreaming);
		if (activeThinking) installRollingThinkingWindow(this);
		if (visibleContentPrecedesToolRows(message)) {
			this.contentContainer.addChild(new Spacer(1));
		}
	};
	assistantProto[ASSISTANT_UPDATE_ORIGINAL] = baseUpdateContent;
}

// =============================================================================
// Extension
// =============================================================================
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
