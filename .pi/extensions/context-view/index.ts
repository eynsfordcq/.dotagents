import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildReport } from "./report.js";

function display(ctx: ExtensionContext, content: string, error = false): void {
	if (ctx.hasUI) {
		ctx.ui.notify(content, error ? "error" : "info");
	}
}

/** Register a context report that works without terminal components or model inference. */
export default function contextView(pi: ExtensionAPI): void {
	pi.registerCommand("context", {
		description: "Show context usage; /context all also lists skills and tools",
		getArgumentCompletions: (prefix) => "all".startsWith(prefix)
			? [{ value: "all", label: "all" }]
			: null,
		handler: async (args, ctx) => {
			if (!ctx.hasUI) return;
			const argument = args.trim();
			if (argument !== "" && argument !== "all") {
				display(ctx, "Use /context or /context all.", true);
				return;
			}
			display(ctx, buildReport(pi, ctx, argument === "all"));
		},
	});
}
