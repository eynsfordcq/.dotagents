import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export interface ModelLike {
	provider: string;
	id: string;
	name?: string;
}

export interface RegistryLike {
	getAll(): ModelLike[];
	getAvailable?(): ModelLike[];
	find(provider: string, modelId: string): unknown;
}

function availableModels(registry: RegistryLike): ModelLike[] {
	return registry.getAvailable?.() ?? registry.getAll();
}

function modelKey(model: ModelLike): string {
	return `${model.provider}/${model.id}`.toLowerCase();
}

/**
 * Resolve a user-facing model string to a registry model.
 * Exact "provider/modelId" first, then fuzzy match on id / name.
 * Returns { error } with a model list when nothing matches.
 */
export function resolveModelInput(
	input: string,
	registry: RegistryLike,
): { model?: unknown; error?: string } {
	const all = availableModels(registry);
	const availableSet = new Set(all.map(modelKey));
	const trimmed = input.trim();

	const slashIdx = trimmed.indexOf("/");
	if (slashIdx !== -1) {
		const provider = trimmed.slice(0, slashIdx);
		const modelId = trimmed.slice(slashIdx + 1);
		if (availableSet.has(trimmed.toLowerCase())) {
			const found = registry.find(provider, modelId);
			if (found) return { model: found };
		}
	}

	const normalize = (s: string) => s.toLowerCase().replace(/\./g, "-");
	const query = normalize(trimmed);
	let best: ModelLike | undefined;
	let bestScore = 0;
	for (const m of all) {
		const id = normalize(m.id);
		const name = normalize(m.name ?? "");
		const full = normalize(`${m.provider}/${m.id}`);
		let score = 0;
		if (id === query || full === query) score = 100;
		else if (id.includes(query) || full.includes(query)) score = 60;
		else if (name.includes(query)) score = 40;
		if (score > bestScore) {
			bestScore = score;
			best = m;
		}
	}
	if (best && bestScore >= 40) {
		const found = registry.find(best.provider, best.id);
		if (found) return { model: found };
	}

	const list = all
		.map((m) => `  ${m.provider}/${m.id}`)
		.sort()
		.join("\n");
	return { error: `Model not found: "${input}".\n\nAvailable models:\n${list}` };
}

/** Read pi's `enabledModels` scope: project settings override global settings. */
export function readEnabledModels(cwd: string): string[] | undefined {
	const readField = (path: string): string[] | undefined => {
		if (!existsSync(path)) return undefined;
		try {
			const raw = JSON.parse(readFileSync(path, "utf-8"));
			if (Array.isArray(raw?.enabledModels)) return raw.enabledModels as string[];
		} catch {
			/* corrupt file — treat as absent */
		}
		return undefined;
	};
	return (
		readField(join(cwd, ".pi", "settings.json")) ??
		readField(join(getAgentDir(), "settings.json"))
	);
}

/**
 * Validate a caller-supplied model against the `enabledModels` scope.
 * No scope configured (or nothing matches exactly) means no restriction.
 */
export function checkModelScope(
	model: ModelLike,
	cwd: string,
	registry: RegistryLike,
	modelInput: string,
): { ok: true } | { ok: false; message: string } {
	const patterns = readEnabledModels(cwd);
	if (!patterns || patterns.length === 0) return { ok: true };

	const available = availableModels(registry);
	const allowed = new Set<string>();
	for (const pattern of patterns) {
		const slash = pattern.trim().indexOf("/");
		if (slash === -1) continue;
		const provider = pattern.trim().slice(0, slash).toLowerCase();
		const id = pattern.trim().slice(slash + 1).toLowerCase();
		const exact = available.find(
			(m) => m.provider.toLowerCase() === provider && m.id.toLowerCase() === id,
		);
		if (exact) allowed.add(modelKey(exact));
	}
	if (allowed.size === 0) return { ok: true };
	if (allowed.has(modelKey(model))) return { ok: true };

	const list = [...allowed].sort().map((m) => `  ${m}`).join("\n");
	return {
		ok: false,
		message: `Model not in scope: "${modelInput}".\n\nAllowed models (from enabledModels):\n${list}`,
	};
}
