import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const EVERY = 3;
const REMINDER = "> reminder: respond in ASD-STE100";

// Append REMINDER to every Nth user message.
// The text goes at the end of the user message only.
// The system prompt and earlier messages stay the same.
// The prompt cache still matches.
export default function (pi: ExtensionAPI) {
	// The count starts again when the module reloads.
	let typed = 0;

	pi.on("input", async event => {
		// Skip messages from other extensions.
		if (event.source === "extension") return { action: "continue" } as const;
		// Skip slash commands. They need the exact text.
		if (event.text.startsWith("/")) return { action: "continue" } as const;
		// Skip empty input.
		if (!event.text.trim()) return { action: "continue" } as const;

		typed += 1;
		if (typed % EVERY !== 0) return { action: "continue" } as const;

		return {
			action: "transform",
			text: `${event.text}\n\n${REMINDER}`,
			images: event.images,
		} as const;
	});
}
