/**
 * Response stats status line.
 *
 * Adds one line to the footer showing the speed of the last assistant
 * message, e.g. "42.7 tok/s · TTFT 1.8s · TOT 6.4s".
 *
 * The tok/s clock starts at the first streamed token, so time to first
 * token is not counted in the rate. TOT is the full wall time from
 * message start.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const KEY = "response-stats";
// The footer collapses repeated ASCII spaces, so values are padded with
// NBSP (U+00A0), which renders as a blank cell and survives sanitizing.
const PAD = "\u00A0";

function fixed(n: number, width: number, digits = 1): string {
	return n.toFixed(digits).padStart(width, PAD);
}

export default function (pi: ExtensionAPI) {
	let messageStartedAt: number | undefined;
	let firstTokenAt: number | undefined;

	pi.on("message_start", (event) => {
		if (event.message.role !== "assistant") return;
		messageStartedAt = Date.now();
		firstTokenAt = undefined;
	});

	pi.on("message_update", (event) => {
		if (firstTokenAt !== undefined) return;
		const type = event.assistantMessageEvent.type;
		if (
			type === "text_delta" ||
			type === "thinking_delta" ||
			type === "toolcall_delta"
		) {
			firstTokenAt = Date.now();
		}
	});

	pi.on("message_end", (event, ctx) => {
		if (event.message.role !== "assistant") return;

		const now = Date.now();
		const output = event.message.usage.output;
		if (messageStartedAt === undefined || output <= 0) {
			ctx.ui.setStatus(KEY, undefined);
			return;
		}

		const generationStart = firstTokenAt ?? messageStartedAt;
		const seconds = (now - generationStart) / 1000;
		if (seconds <= 0) {
			ctx.ui.setStatus(KEY, undefined);
			return;
		}

		const tps = output / seconds;
		const tpsStr = tps >= 100 ? fixed(tps, 5, 0) : fixed(tps, 5, 1);
		const parts = [`${tpsStr} tok/s`];
		if (firstTokenAt !== undefined) {
			parts.push(`TTFT ${fixed((firstTokenAt - messageStartedAt) / 1000, 4)}s`);
		}
		parts.push(`TOT ${fixed((now - messageStartedAt) / 1000, 4)}s`);
		ctx.ui.setStatus(KEY, parts.join(" · "));
	});
}
