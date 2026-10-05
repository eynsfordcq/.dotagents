import { randomUUID } from "node:crypto";
import {
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	SessionManager,
	SettingsManager,
	type AgentSession,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

export interface RunProgress {
	toolUses: number;
	currentTool?: string;
	currentSummary?: string;
	recentTools: string[];
	trace: TraceStep[];
	traceOmitted: number;
	turnCount: number;
	responseChars: number;
	startedAt: number;
}

export interface RunStats {
	text: string;
	toolUses: number;
	inputTokens: number;
	outputTokens: number;
	turns: number;
	durationMs: number;
	aborted: boolean;
	trace: TraceStep[];
	traceOmitted: number;
	error?: string;
}

const GRACE_TURNS = 5;
const MAX_RECENT_TOOLS = 10;
const MAX_TRACE_STEPS = 100;

/** One recorded tool call. Human-only: lives in result `details`, never in model context. */
export interface TraceStep {
	n: number;
	tool: string;
	summary: string;
	durationMs?: number;
	isError?: boolean;
}

export function newAgentId(): string {
	return randomUUID();
}

export function shortId(id: string): string {
	return id.slice(0, 8);
}

function buildSystemPrompt(parentPrompt: string | undefined, cwd: string): string {
	const identity =
		parentPrompt ||
		`# Role
You are a general-purpose coding agent for complex, multi-step tasks.
You have full access to read, write, edit files, and execute commands.
Do what has been asked; nothing more, nothing less.`;

	const bridge = `<sub_agent_context>
You are operating as a sub-agent invoked to handle a specific task.
- Use the read tool instead of cat/head/tail
- Use the edit tool instead of sed/awk
- Use the write tool instead of echo/heredoc
- Use the find tool instead of bash find/ls for file search
- Use the grep tool instead of bash grep/rg for content search
- Make independent tool calls in parallel
- Use absolute file paths
- Do not use emojis
- Be concise but complete
</sub_agent_context>`;

	const envBlock = `# Environment
Working directory: ${cwd}
Platform: ${process.platform}`;

	return `${identity}\n\n${bridge}\n\n<active_agent name="general-purpose"/>\n\n${envBlock}`;
}

/** Best-effort copy of the parent conversation, capped in size. */
function buildParentContext(ctx: ExtensionContext, maxChars = 6000): string {
	const parts: string[] = [];
	try {
		for (const entry of ctx.sessionManager.getBranch()) {
			const message = (entry as { message?: unknown }).message as
				| { role?: string; content?: unknown }
				| undefined;
			if (!message || typeof message.role !== "string") continue;
			if (message.role !== "user" && message.role !== "assistant") continue;
			const content = message.content;
			let text = "";
			if (typeof content === "string") text = content;
			else if (Array.isArray(content)) {
				text = content
					.filter((c) => (c as { type?: string }).type === "text")
					.map((c) => (c as { text?: string }).text ?? "")
					.join("\n");
			}
			text = text.trim();
			if (text) parts.push(`[${message.role}]: ${text}`);
		}
	} catch {
		return "";
	}
	let joined = parts.join("\n\n");
	if (joined.length > maxChars) joined = `... (truncated) ...\n${joined.slice(-maxChars)}`;
	if (!joined) return "";
	return `<parent_context>\nThe following is a copy of the parent conversation for background. The actual task follows it.\n\n${joined}\n</parent_context>\n\n`;
}

function forwardAbortSignal(
	session: Pick<AgentSession, "abort">,
	signal: AbortSignal | undefined,
): () => void {
	if (!signal) return () => {};
	if (signal.aborted) {
		void session.abort();
		return () => {};
	}
	const onAbort = () => {
		void session.abort();
	};
	signal.addEventListener("abort", onAbort, { once: true });
	return () => signal.removeEventListener("abort", onAbort);
}

/** One-line digest of tool args for the human trace. Capped in length. */
function digestArgs(toolName: string, args: unknown): string {
	const a = normalizeArgs(args);
	const str = (v: unknown) => String(v ?? "");
	const path = str(a.file_path ?? a.path ?? "");
	let out: string;
	switch (toolName) {
		case "bash":
			out = `$ ${str(a.command).split("\n")[0]}`;
			break;
		case "read":
			out = path;
			if (a.offset != null || a.limit != null) out += `:${str(a.offset ?? 1)}${a.limit != null ? `-${Number(a.offset ?? 1) + Number(a.limit) - 1}` : ""}`;
			break;
		case "edit":
		case "write":
			out = path;
			break;
		case "grep":
			out = `"${str(a.pattern)}" in ${path || "."}`;
			break;
		case "find":
			out = `${str(a.pattern) || "*"} in ${path || "."}`;
			break;
		case "ls":
			out = path || ".";
			break;
		default: {
			const first = Object.values(a).find((v) => typeof v === "string") as string | undefined;
			out = first ?? Object.keys(a).join(", ");
			break;
		}
	}
	out = out.trim() || "(no args)";
	return out.length > 80 ? `${out.slice(0, 77)}...` : out;
}

/** Event args arrive as an object, but be liberal: accept a string form too. */
function normalizeArgs(args: unknown): Record<string, unknown> {
	if (args && typeof args === "object") return args as Record<string, unknown>;
	if (typeof args === "string" && args) {
		try {
			const parsed: unknown = JSON.parse(args);
			if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
		} catch {
		/* not JSON — fall through to key=value scan */
		}
		const out: Record<string, unknown> = {};
		for (const key of ["path", "file_path", "command", "pattern"]) {
			const m = args.match(new RegExp(`['"]${key}['"]\\s*[:=]\\s*['"]([^'"]+)['"]`));
			if (m) out[key] = m[1];
		}
		if (Object.keys(out).length > 0) return out;
		return { _raw: args.length > 80 ? `${args.slice(0, 77)}...` : args };
	}
	return {};
}

/** Tiny outcome note from a tool result. Defensive: shapes vary per tool. */
function digestResult(toolName: string, result: unknown): string | undefined {
	const r = result as { exit_code?: unknown; details?: { exit_code?: unknown } } | null;
	const code = r?.exit_code ?? r?.details?.exit_code;
	if (toolName === "bash" && typeof code === "number") return `exit ${code}`;
	return undefined;
}

function assistantTextFrom(session: AgentSession, startLen: number): string {
	const parts: string[] = [];
	for (const msg of session.messages.slice(startLen)) {
		if (msg.role !== "assistant") continue;
		for (const c of msg.content) {
			if (c.type === "text" && c.text) parts.push(c.text);
		}
	}
	return parts.join("\n").trim();
}

interface DriveOptions {
	session: AgentSession;
	prompt: string;
	maxTurns?: number;
	signal?: AbortSignal;
	onProgress?: (p: RunProgress) => void;
}

/** Shared run loop for fresh spawns and resumes. */
async function driveSession(opts: DriveOptions): Promise<RunStats> {
	const { session, prompt, maxTurns, signal, onProgress } = opts;
	const startedAt = Date.now();
	let turnCount = 0;
	let toolUses = 0;
	let inputTokens = 0;
	let outputTokens = 0;
	let currentTool: string | undefined;
	let currentSummary: string | undefined;
	const recentTools: string[] = [];
	const trace: TraceStep[] = [];
	let traceOmitted = 0;
	const toolCalls = new Map<string, { summary: string; started: number }>();
	let responseChars = 0;
	let softLimitReached = false;
	let aborted = false;

	const emit = () =>
		onProgress?.({
			toolUses,
			currentTool,
			currentSummary,
			recentTools: [...recentTools],
			trace: [...trace],
			traceOmitted,
			turnCount,
			responseChars,
			startedAt,
		});
	emit();

	const unsubscribe = session.subscribe((event) => {
		if (event.type === "turn_end") {
			turnCount++;
			if (maxTurns != null && maxTurns > 0) {
				if (!softLimitReached && turnCount >= maxTurns) {
					softLimitReached = true;
					void session.steer(
						"You have reached your turn limit. Wrap up immediately — provide your final answer now.",
					);
				} else if (softLimitReached && turnCount >= maxTurns + GRACE_TURNS) {
					aborted = true;
					void session.abort();
				}
			}
			emit();
		} else if (event.type === "message_update") {
			const delta = event.assistantMessageEvent;
			if (delta.type === "text_delta") {
				responseChars += delta.delta.length;
				emit();
			}
		} else if (event.type === "tool_execution_start") {
			currentTool = event.toolName;
			currentSummary = digestArgs(event.toolName, event.args);
			toolCalls.set(event.toolCallId, { summary: currentSummary, started: Date.now() });
			emit();
		} else if (event.type === "tool_execution_end") {
			toolUses++;
			const call = toolCalls.get(event.toolCallId);
			toolCalls.delete(event.toolCallId);
			const outcome = digestResult(event.toolName, event.result);
			const summary = call?.summary ?? digestArgs(event.toolName, undefined);
			if (trace.length < MAX_TRACE_STEPS) {
				trace.push({
					n: toolUses,
					tool: event.toolName,
					summary: outcome ? `${summary} (${outcome})` : summary,
					durationMs: call ? Date.now() - call.started : undefined,
					isError: event.isError === true,
				});
			} else {
				traceOmitted++;
			}
			currentTool = undefined;
			currentSummary = undefined;
			recentTools.push(event.toolName);
			if (recentTools.length > MAX_RECENT_TOOLS) recentTools.shift();
			emit();
		} else if (event.type === "message_end" && event.message.role === "assistant") {
			const usage = (event.message as { usage?: { input?: number; output?: number } })
				.usage;
			if (usage) {
				inputTokens += usage.input ?? 0;
				outputTokens += usage.output ?? 0;
			}
		}
	});
	const cleanupAbort = forwardAbortSignal(session, signal);
	const startLen = session.messages.length;

	try {
		await session.prompt(prompt);
	} catch (err) {
		return {
			text: assistantTextFrom(session, startLen),
			toolUses,
			inputTokens,
			outputTokens,
			turns: turnCount,
			durationMs: Date.now() - startedAt,
			aborted: signal?.aborted === true,
			trace: [...trace],
			traceOmitted,
			error: err instanceof Error ? err.message : String(err),
		};
	} finally {
		unsubscribe();
		cleanupAbort();
	}

	return {
		text: assistantTextFrom(session, startLen),
		toolUses,
		inputTokens,
		outputTokens,
		turns: turnCount,
		durationMs: Date.now() - startedAt,
		aborted: signal?.aborted === true || aborted,
		trace: [...trace],
		traceOmitted,
	};
}

export interface SpawnOptions {
	ctx: ExtensionContext;
	task: string;
	model: unknown;
	thinkingLevel?: string;
	maxTurns?: number;
	isolated?: boolean;
	inheritContext?: boolean;
	agentShortName: string;
	signal?: AbortSignal;
	onProgress?: (p: RunProgress) => void;
}

export async function spawnGeneralAgent(
	opts: SpawnOptions,
): Promise<{ session: AgentSession; stats: RunStats }> {
	const { ctx } = opts;
	const cwd = ctx.cwd;
	const agentDir = getAgentDir();

	let parentPrompt: string | undefined;
	try {
		parentPrompt = ctx.getSystemPrompt();
	} catch {
		parentPrompt = undefined;
	}

	const loader = new DefaultResourceLoader({
		cwd,
		agentDir,
		...(opts.isolated ? { noExtensions: true, noSkills: true } : {}),
		noPromptTemplates: true,
		noThemes: true,
		noContextFiles: true,
		systemPromptOverride: () => buildSystemPrompt(parentPrompt, cwd),
		appendSystemPromptOverride: () => [],
	});
	await loader.reload();

	const settingsManager = SettingsManager.create(cwd, agentDir);
	const parentFile = ctx.sessionManager.getSessionFile?.();
	const sessionManager = SessionManager.create(cwd, undefined, {
		parentSession: parentFile ?? undefined,
	});

	// pi replaced the modelRegistry session option with modelRuntime, but
	// ExtensionContext still exposes only the registry facade. Pass both so
	// the child keeps the parent's providers and auth.
	const parentModelRuntime = (
		ctx.modelRegistry as unknown as { runtime?: unknown }
	).runtime;
	const sessionOpts: Parameters<typeof createAgentSession>[0] & {
		modelRegistry: ExtensionContext["modelRegistry"];
		modelRuntime?: unknown;
	} = {
		cwd,
		agentDir,
		sessionManager,
		settingsManager,
		modelRegistry: ctx.modelRegistry,
		...(parentModelRuntime !== undefined && {
			modelRuntime: parentModelRuntime as never,
		}),
		model: opts.model as never,
		// "subagent" is this tool: the child must not be able to spawn its own
		// children, so it is denied at the registry gate. No nested agents.
		excludeTools: ["subagent"],
		resourceLoader: loader,
	};
	if (opts.thinkingLevel) sessionOpts.thinkingLevel = opts.thinkingLevel as never;

	const { session } = await createAgentSession(sessionOpts);
	session.setSessionName(`general-purpose#${opts.agentShortName}`);
	await session.bindExtensions({});

	const task = opts.inheritContext ? buildParentContext(ctx) + opts.task : opts.task;
	const stats = await driveSession({
		session,
		prompt: task,
		maxTurns: opts.maxTurns,
		signal: opts.signal,
		onProgress: opts.onProgress,
	});
	return { session, stats };
}

export async function resumeGeneralAgent(
	session: AgentSession,
	prompt: string,
	opts: {
		maxTurns?: number;
		signal?: AbortSignal;
		onProgress?: (p: RunProgress) => void;
	} = {},
): Promise<RunStats> {
	// Resume runs on the reopened session: the original model and thinking
	// level stay, overrides are ignored.
	return driveSession({ session, prompt, ...opts });
}
