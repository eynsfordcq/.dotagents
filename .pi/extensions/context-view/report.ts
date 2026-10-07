import {
	estimateTokens,
	SettingsManager,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type SourceInfo,
} from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

function tokens(text: string): number {
	return Math.ceil(text.length / 4);
}

function formatTokens(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
	if (value < 1000) return String(value);
	return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

function cell(value: string): string {
	return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function table(headers: string[], rows: string[][]): string {
	const content = [headers, ...rows].map((row) => row.map(cell));
	const widths = headers.map((_header, column) =>
		Math.max(3, ...content.map((row) => visibleWidth(row[column]))));
	const separator = widths.map((width) => "-".repeat(width));
	const aligned = content.map((row) => row.map((value, column) =>
		value + " ".repeat(widths[column] - visibleWidth(value))));
	return [aligned[0], separator, ...aligned.slice(1)]
		.map((row) => `| ${row.join(" | ")} |`)
		.join("\n");
}

function source(info: SourceInfo): string {
	if (info.path.startsWith("builtin:")) return "Built-in";
	if (info.origin === "package") return `Package (${info.source})`;
	if (info.scope === "user") return "User";
	if (info.scope === "project") return "Project";
	return "Temporary";
}

// Pi wraps these sections in XML. Count only sections present in the effective prompt.
function section(prompt: string, name: string): string {
	const start = prompt.indexOf(`<${name}>\n`);
	if (start < 0) return "";
	const closing = `\n</${name}>`;
	const end = prompt.indexOf(closing, start);
	return end < 0 ? "" : prompt.slice(start, end + closing.length);
}

/** Build a report without changing the session or requesting model inference. */
export function buildReport(
	pi: Pick<ExtensionAPI, "getAllTools" | "getActiveTools" | "getSettings">,
	ctx: Pick<ExtensionCommandContext,
		"mode" | "model" | "getContextUsage" | "getSystemPrompt" | "getSystemPromptOptions" | "sessionManager">,
	all: boolean,
): string {
	const plainText = ctx.mode === "rpc";
	const prompt = ctx.getSystemPrompt();
	const options = ctx.getSystemPromptOptions();
	const skillsSection = section(prompt, "skills");
	const memorySection = section(prompt, "project_context");
	const basePrompt = prompt.replace(skillsSection, "").replace(memorySection, "");
	const active = new Set(pi.getActiveTools());
	const tools = pi.getAllTools();
	const toolRows = tools.map((tool) => ({
		tool,
		active: active.has(tool.name),
		tokens: tokens(JSON.stringify({
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters,
		})),
	}));
	const toolTokens = toolRows.reduce((sum, row) => sum + (row.active ? row.tokens : 0), 0);
	const messages = ctx.sessionManager.buildSessionProjection().messages;
	const messageTokens = messages.reduce((sum, message) =>
		sum + (message.role === "system" ? 0 : estimateTokens(message)), 0);
	const categories: Array<{ name: string; tokens: number }> = [
		{ name: "System prompt", tokens: tokens(basePrompt) },
		{ name: "System tools", tokens: toolTokens },
		{ name: "System tools (deferred)", tokens: 0 },
		{ name: "Memory files", tokens: tokens(memorySection) },
		{ name: "Skills", tokens: tokens(skillsSection) },
		{ name: "Messages", tokens: messageTokens },
	];
	const estimatedTotal = categories.reduce((sum, category) => sum + category.tokens, 0);
	const usage = ctx.getContextUsage();
	const window = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
	// An empty session reports zero before Pi records its initial system message.
	const used = usage?.tokens != null && usage.tokens > 0 ? usage.tokens : estimatedTotal;
	const estimated = usage?.tokens == null || usage.tokens === 0;
	const percentage = (value: number) => window > 0 ? `${(value / window * 100).toFixed(1)}%` : "Unknown";
	let reserve: number | undefined;
	try {
		const settings = SettingsManager.inMemory(pi.getSettings());
		reserve = settings.getCompactionEnabled() ? settings.getCompactionReserveTokens(ctx.model) : 0;
	} catch {
		// The report shows Unknown when Pi cannot resolve the buffer.
	}
	const rows = categories.map((category) => [category.name, `~${formatTokens(category.tokens)}`, percentage(category.tokens)]);
	rows.push([
		"Free space",
		window > 0 && reserve !== undefined ? formatTokens(Math.max(0, window - used - reserve)) : "Unknown",
		window > 0 && reserve !== undefined ? percentage(Math.max(0, window - used - reserve)) : "Unknown",
	]);
	rows.push(["Autocompact buffer", reserve === undefined ? "Unknown" : formatTokens(reserve), reserve === undefined ? "Unknown" : percentage(reserve)]);
	const total = `${estimated ? "~" : ""}${formatTokens(used)} / ${window > 0 ? formatTokens(window) : "Unknown"} (${percentage(used)})`;
	const parts = [
		plainText ? "Context Usage" : "## Context Usage",
		`Model: ${ctx.model?.id ?? "Unknown"}\nTokens: ${total}`,
		plainText ? "Estimated usage by category" : "### Estimated usage by category",
		plainText
			? rows.map(([name, count, percent]) => `${name}: ${count} (${percent})`).join("\n")
			: table(["Category", "Tokens", "Percentage"], rows),
	];
	if (all) {
		const skills = (options.skills ?? []).filter((skill) => !skill.disableModelInvocation);
		const skillRows: string[][] = [];
		for (const match of skillsSection.matchAll(/<skill>\n[\s\S]*?\n\s*<\/skill>/g)) {
			const entry = match[0];
			const name = entry.match(/<name>(.*?)<\/name>/)?.[1] ?? "Unknown";
			const location = entry.match(/<location>(.*?)<\/location>/)?.[1];
			const skill = skills.find((candidate) => candidate.filePath === location || candidate.name === name);
			skillRows.push([name, skill ? source(skill.sourceInfo) : "Unknown", `~${formatTokens(tokens(entry))}`]);
		}
		const toolDetails = toolRows.map((row) => [
			row.tool.name,
			source(row.tool.sourceInfo),
			row.active ? "Active" : row.tool.exposure === "hidden" ? "Hidden" : `Inactive (${row.tool.exposure})`,
			`~${formatTokens(row.tokens)}`,
		]);
		const skillDetails = plainText
			? skillRows.map(([name, origin, count]) => `${name}: ${count}; Source: ${origin}`).join("\n")
			: table(["Skill", "Source", "Tokens"], skillRows);
		const toolContent = plainText
			? toolDetails.map(([name, origin, state, count]) => `${name}: ${count}; Source: ${origin}; State: ${state}`).join("\n")
			: table(["Tool", "Source", "State", "Tokens"], toolDetails);
		parts.push(plainText ? "Skills" : "### Skills", skillRows.length > 0
			? skillDetails
			: "Pi advertises no skills in the current system prompt.");
		parts.push(plainText ? "Tools" : "### Tools", tools.length > 0
			? toolContent
			: "Pi registers no tools.");
	}
	return parts.join("\n\n");
}
