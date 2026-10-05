/**
 * subagents — slim foreground-only general-purpose subagent runner.
 *
 * One tool ("subagent"), one agent type ("general-purpose"), no background runs,
 * no nesting, no workflows, no scheduling, no transcript files, no widgets.
 * Progress streams through onUpdate so the TUI renders a live tool block
 * (collapsed by default, expandable). Only the final text reaches the model.
 */
import type { AgentSession, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { checkModelScope, resolveModelInput, type ModelLike } from "./models.js";
import {
	newAgentId,
	resumeGeneralAgent,
	shortId,
	spawnGeneralAgent,
	type RunProgress,
	type RunStats,
	type TraceStep,
} from "./runner.js";

const TOOL_NAME = "subagent";
const TOOL_LABEL = "subagent";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

/** Finished foreground agents, kept so a later call can `resume` them. */
interface AgentRecord {
	session: AgentSession;
	modelName: string;
	modelId: string;
}
const agents = new Map<string, AgentRecord>();

function resolveResumeRef(ref: string): { id: string; record: AgentRecord } | undefined {
	if (agents.has(ref)) return { id: ref, record: agents.get(ref)! };
	for (const [id, record] of agents) {
		if (id.startsWith(ref)) return { id, record };
	}
	return undefined;
}

function remember(id: string, record: AgentRecord): void {
	agents.set(id, record);
	// Bound memory: every entry is finished (foreground only), so dropping
	// the oldest is safe — its session file stays on disk under the tree.
	while (agents.size > 30) {
		const oldest = agents.keys().next();
		if (oldest.done) break;
		agents.delete(oldest.value);
	}
}

interface RunDetails {
	status: "running" | "completed" | "error";
	agentId: string;
	modelName: string;
	modelId: string;
	toolUses: number;
	tokens: string;
	turns: number;
	durationMs: number;
	currentTool?: string;
	currentSummary?: string;
	trace: TraceStep[];
	traceOmitted: number;
}

function formatTokens(input: number, output: number): string {
	const total = input + output;
	if (total < 1000) return `${total} tokens`;
	if (total < 1_000_000) return `${(total / 1000).toFixed(1)}k tokens`;
	return `${(total / 1_000_000).toFixed(1)}M tokens`;
}

function formatMs(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

function statsLine(stats: Pick<RunStats, "toolUses" | "inputTokens" | "outputTokens">): string {
	return `${stats.toolUses} tool uses · ${formatTokens(stats.inputTokens, stats.outputTokens)}`;
}

function describeModelInfo(model: unknown): { modelName: string; modelId: string } {
	const m = model as { provider?: unknown; id?: unknown; name?: unknown } | undefined;
	const provider = typeof m?.provider === "string" ? m.provider : "";
	const id = typeof m?.id === "string" ? m.id : "";
	const name = typeof m?.name === "string" && m.name ? m.name : id;
	return {
		modelName: name || "unknown",
		modelId: provider && id ? `${provider}/${id}` : id || "unknown",
	};
}

const agentTool = defineTool({
	name: TOOL_NAME,
	label: TOOL_LABEL,
	description:
		"Launch a general-purpose subagent for complex, multi-step tasks (research, code search, implementation). The run blocks until the agent finishes and returns its final answer — use it to protect the main context window from exploratory work. Pass `resume` with a previous agent ID to continue that agent with new work.",
	promptSnippet: "Launch a general-purpose subagent for complex work",
	promptGuidelines: [
		"Use subagent for broad exploration or multi-step tasks whose intermediate output would pollute the main context; use direct tools (read, grep, find) when the target is already known.",
		"The subagent call blocks until the agent finishes — do not poll or sleep, just use the returned answer. Never fabricate the result.",
		"Trust but verify: the agent's summary describes intent, not outcome. Check file changes before reporting work as done.",
	],
	parameters: Type.Object({
		prompt: Type.String({
			description: "The task for the agent to perform.",
		}),
		description: Type.String({
			description: "A short (3-5 word) description of the task (shown in UI).",
		}),
		model: Type.Optional(
			Type.String({
				description:
					'Optional model override, e.g. "provider/modelId" or fuzzy name ("haiku"). Omit to use the current session model. Must be in pi scoped models when scope is configured. Ignored on resume.',
			}),
		),
		thinking: Type.Optional(
			Type.String({
				description: `Thinking level: ${THINKING_LEVELS.join(", ")}. Omit to inherit. Ignored on resume.`,
			}),
		),
		max_turns: Type.Optional(
			Type.Number({
				description:
					"Maximum agentic turns before the agent must wrap up. Omit for unlimited.",
				minimum: 1,
			}),
		),
		resume: Type.Optional(
			Type.String({
				description:
					"Agent ID from a previous subagent call to continue with new work. Omit for a fresh agent.",
			}),
		),
		isolated: Type.Optional(
			Type.Boolean({
				description: "If true, the agent gets no extension/MCP tools — built-ins only.",
			}),
		),
		inherit_context: Type.Optional(
			Type.Boolean({
				description:
					"If true, prepend a copy of the parent conversation to the agent prompt. Default: false (fresh context).",
			}),
		),
	}),

	renderCall(args, theme) {
		const desc = (args as { description?: string }).description ?? "";
		return new Text(
			`${theme.fg("toolTitle", "▸ subagent")}${desc ? theme.fg("muted", `  ${desc}`) : ""}`,
			0,
			0,
		);
	},

	renderResult(result, { expanded, isPartial }, theme) {
		const details = result.details as RunDetails | undefined;
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		if (!details) return new Text(text, 0, 0);

		const head =
			details.status === "running"
				? `${theme.fg("warning", "◌ subagent")}  ${theme.fg("dim", `${details.toolUses} tool uses${details.currentTool ? ` · ${details.currentTool}${details.currentSummary ? ` ${details.currentSummary}` : ""}` : ""}…`)}`
				: details.status === "error"
					? `${theme.fg("error", "✘ subagent")}  ${theme.fg("dim", details.tokens)}`
					: `${theme.fg("success", "✔ subagent")}  ${theme.fg("dim", `${details.toolUses} tool uses · ${details.tokens}${details.modelName ? ` · ${details.modelName}` : ""}`)}`;

		if (!expanded) {
			if (isPartial || details.status === "running") return new Text(head, 0, 0);
			const firstLine = text.split("\n")[0]?.slice(0, 120) ?? "";
			return new Text(firstLine ? `${head}\n${theme.fg("muted", `  ${firstLine}`)}` : head, 0, 0);
		}

		// Expanded: header + numbered step trace + full final answer.
		// The trace lives in `details`, so it never reaches the parent model.
		const lines = [
			head,
			theme.fg("dim", `${details.turns} turns · ${formatMs(details.durationMs)}${details.modelId ? ` · ${details.modelId}` : ""}`),
		];
		if (details.traceOmitted > 0) {
			lines.push(theme.fg("dim", `… ${details.traceOmitted} earlier steps omitted`));
		}
		for (const step of details.trace) {
			const dur = step.durationMs != null ? ` ${formatMs(step.durationMs)}` : "";
			const mark = step.isError ? theme.fg("error", "!") : " ";
			lines.push(`${mark} ${theme.fg("accent", step.tool)}  ${step.summary}${theme.fg("dim", dur)}`);
		}
		if (details.status !== "running") lines.push(text);
		return new Text(lines.join("\n"), 0, 0);
	},

	execute: async (toolCallId, params, signal, onUpdate, ctx) => {
		const textResult = (text: string, details: RunDetails) => ({
			content: [{ type: "text" as const, text }],
			details: details as never,
		});

		const fail = (
			text: string,
			agentId = "",
			model: { modelName: string; modelId: string } = { modelName: "", modelId: "" },
		) =>
			textResult(text, {
				status: "error",
				agentId,
				modelName: model.modelName,
				modelId: model.modelId,
				toolUses: 0,
				tokens: "",
				turns: 0,
				durationMs: 0,
				trace: [],
				traceOmitted: 0,
			});

		const thinking =
			params.thinking && THINKING_LEVELS.includes(params.thinking)
				? params.thinking
				: undefined;
		if (params.thinking && !thinking) {
			return fail(`Invalid thinking level: "${params.thinking}". Valid: ${THINKING_LEVELS.join(", ")}.`);
		}
		const maxTurns =
			params.max_turns != null && params.max_turns >= 1 ? params.max_turns : undefined;

		const pushProgress = (
			agentId: string,
			startedAt: number,
			model: { modelName: string; modelId: string },
			p: RunProgress,
		) =>
			onUpdate?.({
				content: [
					{
						type: "text" as const,
						text: `${p.toolUses} tool uses${p.currentTool ? ` · ${p.currentTool}` : ""}…`,
					},
				],
				details: {
					status: "running",
					agentId,
					modelName: model.modelName,
					modelId: model.modelId,
					toolUses: p.toolUses,
					tokens: "",
					turns: p.turnCount,
					durationMs: Date.now() - startedAt,
					currentTool: p.currentTool,
					currentSummary: p.currentSummary,
					trace: p.trace,
					traceOmitted: p.traceOmitted,
				} as never,
			});

		const finish = (
			agentId: string,
			model: { modelName: string; modelId: string },
			stats: RunStats,
			resumed: boolean,
		) => {
			const tokens = formatTokens(stats.inputTokens, stats.outputTokens);
			const details: RunDetails = {
				status: stats.error ? "error" : "completed",
				agentId,
				modelName: model.modelName,
				modelId: model.modelId,
				toolUses: stats.toolUses,
				tokens,
				turns: stats.turns,
				durationMs: stats.durationMs,
				trace: stats.trace,
				traceOmitted: stats.traceOmitted,
			};
			if (stats.error) {
				const partial = stats.text ? `\n\nPartial output:\n${stats.text}` : "";
				return textResult(`Agent failed: ${stats.error}${partial}`, details);
			}
			const body = stats.text.trim() || "No output.";
			// The agent ID is what makes follow-up possible: pass it as
			// `resume` to continue this agent. Only the final text (not the
			// trace) enters the parent context.
			return textResult(
				`${resumed ? "Subagent continued" : "Subagent completed"} in ${formatMs(stats.durationMs)} (${statsLine(stats)} · ${model.modelId}).\nSubagent ID: ${agentId} (pass as \`resume\` to continue this agent)\n\n${body}`,
				details,
			);
		};

		// ---- Resume: continue a finished agent ----
		if (params.resume) {
			const found = resolveResumeRef(params.resume);
			if (!found) return fail(`Agent ${params.resume} not found.`, params.resume);
			const startedAt = Date.now();
			const model = { modelName: found.record.modelName, modelId: found.record.modelId };
			const stats = await resumeGeneralAgent(found.record.session, params.prompt, {
				maxTurns,
				signal,
				onProgress: (p) => pushProgress(found.id, startedAt, model, p),
			});
			return finish(found.id, model, stats, true);
		}

		// ---- Fresh spawn: resolve model (default follows pi default) ----
		let model: unknown = ctx.model;
		if (params.model) {
			const resolved = resolveModelInput(params.model, ctx.modelRegistry);
			if (resolved.error || !resolved.model) {
				return fail(resolved.error ?? "Model not found.");
			}
			const scope = checkModelScope(
				resolved.model as ModelLike,
				ctx.cwd,
				ctx.modelRegistry,
				params.model,
			);
			if (!scope.ok) {
				return fail(scope.message);
			}
			model = resolved.model;
		}
		if (!model) {
			return fail("No model available: set a default model or pass one.");
		}

		const id = newAgentId();
		const startedAt = Date.now();
		const modelInfo = describeModelInfo(model);
		const { session, stats } = await spawnGeneralAgent({
			ctx,
			task: params.prompt,
			model,
			thinkingLevel: thinking,
			maxTurns,
			isolated: params.isolated,
			inheritContext: params.inherit_context,
			agentShortName: shortId(id),
			signal,
			onProgress: (p) => pushProgress(id, startedAt, modelInfo, p),
		});
		remember(id, { session, modelName: modelInfo.modelName, modelId: modelInfo.modelId });
		return finish(id, modelInfo, stats, false);
	},
});

export default function (pi: ExtensionAPI) {
	pi.registerTool(agentTool);
}
