import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import {
	type Component,
	type Focusable,
	Input,
	Key,
	Markdown,
	type MarkdownTheme,
	matchesKey,
	type TUI,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";

// Tuning
const MAX_QUESTIONS = 4;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;
const MAX_HEADER_LENGTH = 16;
const MAX_LABEL_LENGTH = 60;
const MAX_PREVIEW_LINES = 24;
const PREVIEW_SIDE_BY_SIDE_MIN_WIDTH = 100;
const PREVIEW_LEFT_PANE_PERCENT = 45;

const CUSTOM_ANSWER_LABEL = "Type something.";
const CUSTOM_ANSWER_PROMPT = "Type something:";
const NEXT_LABEL = "Next";
const RECOMMENDED_SUFFIX = "(Recommended)";
const RESERVED_LABELS = new Set(["Other", CUSTOM_ANSWER_LABEL, NEXT_LABEL]);

const TOOL_DESCRIPTION = `Ask the user one or more structured questions in an interactive terminal.

Use this tool when requirements are ambiguous or the user must choose between concrete approaches. Group related questions into one call.

Every question must provide 2-4 clear options. If one option is genuinely preferable, place it first and end its label with "${RECOMMENDED_SUFFIX}". Do not mark an option as recommended when the choice depends entirely on user preference.

Users can always choose "${CUSTOM_ANSWER_LABEL}" and write their own answer. Markdown previews are useful for code snippets, UI mockups, diagrams, and configuration examples. Use previews only when seeing the artifact helps the user decide.`;

const PROMPT_GUIDELINES = [
	`Use ask_user_question when you cannot proceed without a concrete user decision. Group related questions into one call.`,
	`Give every question ${MIN_OPTIONS}-${MAX_OPTIONS} concise options with useful descriptions.`,
	`When one choice is genuinely best, put it first and suffix its label with "${RECOMMENDED_SUFFIX}".`,
	`Use option previews for code, mockups, diagrams, or configuration that the user should inspect before deciding.`,
];

// Tool contract
const OptionSchema = Type.Object({
	label: Type.String({
		maxLength: MAX_LABEL_LENGTH,
		description: `Concise option label, at most ${MAX_LABEL_LENGTH} characters. Add "${RECOMMENDED_SUFFIX}" when this is the recommended choice.`,
	}),
	description: Type.String({
		description: "Explain what this choice means and its important trade-offs.",
	}),
	preview: Type.Optional(
		Type.String({
			description:
				"Optional Markdown artifact that helps the user compare this choice, such as a code snippet or UI mockup.",
		}),
	),
});

const QuestionSchema = Type.Object({
	question: Type.String({ description: "The complete question to ask." }),
	header: Type.String({
		maxLength: MAX_HEADER_LENGTH,
		description: `Short tab label, at most ${MAX_HEADER_LENGTH} characters.`,
	}),
	options: Type.Array(OptionSchema, {
		minItems: MIN_OPTIONS,
		maxItems: MAX_OPTIONS,
		description: `The ${MIN_OPTIONS}-${MAX_OPTIONS} choices available to the user.`,
	}),
	multiSelect: Type.Optional(
		Type.Boolean({
			default: false,
			description: "Allow the user to choose more than one authored option.",
		}),
	),
});

const AskUserQuestionSchema = Type.Object({
	questions: Type.Array(QuestionSchema, {
		minItems: 1,
		maxItems: MAX_QUESTIONS,
		description: `The 1-${MAX_QUESTIONS} questions to ask together.`,
	}),
});

type AskUserQuestionParams = Static<typeof AskUserQuestionSchema>;
type Question = AskUserQuestionParams["questions"][number];

interface Answer {
	questionIndex: number;
	question: string;
	kind: "option" | "multi" | "custom";
	value: string | string[];
	preview?: string;
}

interface QuestionnaireResult {
	answers: Answer[];
	cancelled: boolean;
}

type Row =
	| { kind: "option"; optionIndex: number }
	| { kind: "custom" }
	| { kind: "next" };

export function validateQuestions(
	params: AskUserQuestionParams,
): string | undefined {
	const questions = new Set<string>();
	for (const question of params.questions) {
		if (questions.has(question.question))
			return "Question text must be unique.";
		questions.add(question.question);

		const labels = new Set<string>();
		for (const option of question.options) {
			if (RESERVED_LABELS.has(option.label)) {
				return `Option label "${option.label}" is reserved.`;
			}
			if (labels.has(option.label)) {
				return `Option labels must be unique within "${question.header}".`;
			}
			if (question.multiSelect && option.preview) {
				return `Markdown previews are only supported for single-select questions ("${question.header}").`;
			}
			labels.add(option.label);
		}
	}
	return undefined;
}

function rowsFor(question: Question): Row[] {
	const rows: Row[] = question.options.map((_option, optionIndex) => ({
		kind: "option",
		optionIndex,
	}));
	rows.push({ kind: "custom" });
	if (question.multiSelect) rows.push({ kind: "next" });
	return rows;
}

function answerText(answer: Answer): string {
	return Array.isArray(answer.value) ? answer.value.join(", ") : answer.value;
}

export function buildToolText(result: QuestionnaireResult): string {
	if (result.cancelled) return "User declined to answer the questions.";

	const lines = result.answers.map((answer) => {
		let line = `- ${answer.question}: ${answerText(answer)}`;
		if (answer.preview) line += `\n  Selected preview:\n${answer.preview}`;
		return line;
	});
	return `User answered the questions:\n${lines.join("\n")}\nContinue using these decisions.`;
}

// Terminal questionnaire
class Questionnaire implements Component, Focusable {
	private currentTab = 0;
	private readonly tui: TUI;
	private readonly theme: Theme;
	private readonly params: AskUserQuestionParams;
	private readonly done: (result: QuestionnaireResult) => void;
	private readonly markdownTheme: MarkdownTheme;
	private readonly cursors: number[];
	private readonly selections: Array<Set<number>>;
	private readonly customInputs: Input[];
	private readonly answers = new Map<number, Answer>();
	private status = "";
	private _focused = false;

	constructor(
		tui: TUI,
		theme: Theme,
		params: AskUserQuestionParams,
		done: (result: QuestionnaireResult) => void,
	) {
		this.tui = tui;
		this.theme = theme;
		this.params = params;
		this.done = done;
		this.markdownTheme = {
			heading: (text) => theme.fg("mdHeading", text),
			link: (text) => theme.fg("mdLink", text),
			linkUrl: (text) => theme.fg("mdLinkUrl", text),
			code: (text) => theme.fg("mdCode", text),
			codeBlock: (text) => theme.fg("mdCodeBlock", text),
			codeBlockBorder: (text) => theme.fg("mdCodeBlockBorder", text),
			quote: (text) => theme.fg("mdQuote", text),
			quoteBorder: (text) => theme.fg("mdQuoteBorder", text),
			hr: (text) => theme.fg("mdHr", text),
			listBullet: (text) => theme.fg("mdListBullet", text),
			bold: (text) => theme.bold(text),
			italic: (text) => theme.italic(text),
			underline: (text) => theme.underline(text),
			strikethrough: (text) => theme.strikethrough(text),
		};
		this.cursors = params.questions.map(() => 0);
		this.selections = params.questions.map(() => new Set<number>());
		this.customInputs = params.questions.map((_question, questionIndex) => {
			const input = new Input({
				prompt: "",
				placeholder: "type here",
				placeholderStyle: (text) => theme.fg("dim", text),
			});
			input.onSubmit = (text) => {
				if (params.questions[questionIndex].multiSelect)
					this.commitMultiSelect(questionIndex);
				else this.submitCustomAnswer(questionIndex, text);
			};
			return input;
		});
	}

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.updateInputFocus();
	}

	invalidate(): void {
		for (const input of this.customInputs) input.invalidate();
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape)) {
			this.done({ answers: this.orderedAnswers(), cancelled: true });
			return;
		}

		const hasSubmitTab = this.params.questions.length > 1;
		const customFocused = this.isCustomInputFocused();
		if (
			hasSubmitTab &&
			(matchesKey(data, Key.tab) ||
				(!customFocused && matchesKey(data, Key.right)))
		) {
			this.currentTab =
				(this.currentTab + 1) % (this.params.questions.length + 1);
			this.status = "";
			this.updateInputFocus();
			this.refresh();
			return;
		}
		if (
			hasSubmitTab &&
			(matchesKey(data, Key.shift("tab")) ||
				(!customFocused && matchesKey(data, Key.left)))
		) {
			this.currentTab =
				(this.currentTab - 1 + this.params.questions.length + 1) %
				(this.params.questions.length + 1);
			this.status = "";
			this.updateInputFocus();
			this.refresh();
			return;
		}

		if (this.currentTab === this.params.questions.length) {
			if (matchesKey(data, Key.enter)) this.submitQuestionnaire();
			return;
		}

		const question = this.params.questions[this.currentTab];
		const rows = rowsFor(question);
		if (matchesKey(data, Key.up)) {
			this.cursors[this.currentTab] =
				(this.cursors[this.currentTab] - 1 + rows.length) % rows.length;
			this.status = "";
			this.updateInputFocus();
			this.refresh();
			return;
		}
		if (matchesKey(data, Key.down)) {
			this.cursors[this.currentTab] =
				(this.cursors[this.currentTab] + 1) % rows.length;
			this.status = "";
			this.updateInputFocus();
			this.refresh();
			return;
		}

		const row = rows[this.cursors[this.currentTab]];
		if (row.kind === "custom") {
			this.customInputs[this.currentTab].handleInput(data);
			this.refresh();
			return;
		}
		if (
			matchesKey(data, Key.space) &&
			question.multiSelect &&
			row.kind === "option"
		) {
			this.toggleOption(row.optionIndex);
			return;
		}
		if (!matchesKey(data, Key.enter)) return;

		if (row.kind === "next") {
			this.commitMultiSelect();
		} else if (question.multiSelect) {
			this.toggleOption(row.optionIndex);
		} else {
			this.commitOption(row.optionIndex);
		}
	}

	render(width: number): string[] {
		const safeWidth = Math.max(1, width);
		const lines: string[] = [this.theme.fg("accent", "─".repeat(safeWidth))];
		if (this.params.questions.length > 1) {
			lines.push(truncateToWidth(this.renderTabs(), safeWidth, "…"), "");
		}

		if (this.currentTab === this.params.questions.length) {
			this.renderReview(lines, safeWidth);
		} else {
			this.renderQuestion(lines, safeWidth);
		}

		if (this.status) {
			lines.push(
				"",
				...wrapTextWithAnsi(this.theme.fg("warning", this.status), safeWidth),
			);
		}
		lines.push("", truncateToWidth(this.renderHint(), safeWidth, "…"));
		lines.push(this.theme.fg("accent", "─".repeat(safeWidth)));
		return lines;
	}

	private renderTabs(): string {
		const tabs = this.params.questions.map((question, index) => {
			const marker = this.answers.has(index) ? "●" : "○";
			const text = ` ${marker} ${question.header} `;
			return index === this.currentTab
				? this.theme.bg("selectedBg", this.theme.fg("text", text))
				: this.theme.fg(this.answers.has(index) ? "success" : "muted", text);
		});
		const submit = " ✓ Submit ";
		tabs.push(
			this.currentTab === this.params.questions.length
				? this.theme.bg("selectedBg", this.theme.fg("text", submit))
				: this.theme.fg(this.allAnswered() ? "success" : "dim", submit),
		);
		return ` ${tabs.join(" ")}`;
	}

	private renderQuestion(lines: string[], width: number): void {
		const question = this.params.questions[this.currentTab];
		lines.push(
			...wrapTextWithAnsi(this.theme.bold(question.question), width),
			"",
		);

		const preview = this.focusedPreview();
		if (preview && width >= PREVIEW_SIDE_BY_SIDE_MIN_WIDTH) {
			const gap = 2;
			const leftWidth = Math.floor((width * PREVIEW_LEFT_PANE_PERCENT) / 100);
			const rightWidth = width - leftWidth - gap;
			const optionLines: string[] = [];
			this.renderOptionList(optionLines, leftWidth);
			const previewLines = this.renderPreviewBox(preview, rightWidth);
			this.appendColumns(lines, optionLines, leftWidth, previewLines, gap);
			return;
		}

		this.renderOptionList(lines, width);
		if (preview) {
			lines.push("", ...this.renderPreviewBox(preview, width));
		}
	}

	private renderOptionList(lines: string[], width: number): void {
		const question = this.params.questions[this.currentTab];
		const rows = rowsFor(question);
		const selected = this.selections[this.currentTab];
		for (let index = 0; index < rows.length; index++) {
			const row = rows[index];
			const focused = index === this.cursors[this.currentTab];
			const prefix = focused ? this.theme.fg("accent", "> ") : "  ";

			if (row.kind === "option") {
				const option = question.options[row.optionIndex];
				const checked = question.multiSelect
					? selected.has(row.optionIndex)
						? "[x] "
						: "[ ] "
					: "";
				const number = `${row.optionIndex + 1}. `;
				const recommended = option.label.endsWith(RECOMMENDED_SUFFIX);
				let label = recommended
					? this.theme.fg("success", this.theme.bold(option.label))
					: option.label;
				if (focused) label = this.theme.fg("accent", label);
				this.pushWrapped(lines, prefix, `${checked}${number}${label}`, width);
				this.pushWrapped(
					lines,
					"     ",
					this.theme.fg("muted", option.description),
					width,
				);
				continue;
			}

			if (row.kind === "custom") {
				this.pushInlineInput(
					lines,
					prefix,
					question.options.length + 1,
					focused,
					width,
				);
				continue;
			}

			const number = `${question.options.length + 2}. `;
			const label = focused ? this.theme.fg("accent", NEXT_LABEL) : NEXT_LABEL;
			this.pushWrapped(lines, prefix, `${number}${label}`, width);
		}
	}

	private pushInlineInput(
		lines: string[],
		prefix: string,
		number: number,
		focused: boolean,
		width: number,
	): void {
		const plainLabel = `${number}. ${CUSTOM_ANSWER_PROMPT} `;
		const label = focused ? this.theme.fg("accent", plainLabel) : plainLabel;
		const used = visibleWidth(prefix) + visibleWidth(label);
		if (used >= width) {
			this.pushWrapped(lines, prefix, label, width);
			return;
		}
		const input =
			this.customInputs[this.currentTab].render(width - used)[0] ?? "";
		lines.push(`${prefix}${label}${input}`);
	}

	private renderPreviewBox(preview: string, width: number): string[] {
		if (width < 4)
			return new Markdown(preview, 0, 0, this.markdownTheme).render(width);

		const innerWidth = width - 4;
		const rendered = new Markdown(preview, 0, 0, this.markdownTheme).render(
			innerWidth,
		);
		const visible = rendered.slice(0, MAX_PREVIEW_LINES);
		if (rendered.length > MAX_PREVIEW_LINES) {
			visible.push(
				this.theme.fg(
					"dim",
					`… ${rendered.length - MAX_PREVIEW_LINES} more lines`,
				),
			);
		}

		const title = " Preview ";
		const top = `┌${title}${"─".repeat(Math.max(0, width - title.length - 2))}┐`;
		const body = visible.map(
			(line) => `│ ${this.padToWidth(line, innerWidth)} │`,
		);
		return [
			this.theme.fg("muted", top),
			...body,
			this.theme.fg("muted", `└${"─".repeat(width - 2)}┘`),
		];
	}

	private appendColumns(
		lines: string[],
		left: string[],
		leftWidth: number,
		right: string[],
		gap: number,
	): void {
		const height = Math.max(left.length, right.length);
		for (let index = 0; index < height; index++) {
			const leftLine = this.padToWidth(left[index] ?? "", leftWidth);
			lines.push(`${leftLine}${" ".repeat(gap)}${right[index] ?? ""}`);
		}
	}

	private padToWidth(text: string, width: number): string {
		const clipped = truncateToWidth(text, width, "…");
		return `${clipped}${" ".repeat(Math.max(0, width - visibleWidth(clipped)))}`;
	}

	private renderReview(lines: string[], width: number): void {
		lines.push(this.theme.bold("Review your answers"), "");
		for (let index = 0; index < this.params.questions.length; index++) {
			const question = this.params.questions[index];
			const answer = this.answers.get(index);
			const value = answer
				? answerText(answer)
				: this.theme.fg("warning", "Not answered");
			this.pushWrapped(
				lines,
				"",
				`${this.theme.fg("muted", `${question.header}:`)} ${value}`,
				width,
			);
		}
		lines.push(
			"",
			this.theme.fg(
				this.allAnswered() ? "success" : "warning",
				this.allAnswered()
					? "Press Enter to submit."
					: "Answer every question before submitting.",
			),
		);
	}

	private renderHint(): string {
		if (this.currentTab === this.params.questions.length)
			return "Enter submit • Tab/←→ questions • Esc cancel";
		const question = this.params.questions[this.currentTab];
		const select = this.isCustomInputFocused()
			? "Type your answer • Enter submit"
			: question.multiSelect
				? "Space/Enter toggle • Enter on Next continue"
				: "Enter select";
		const tabs = this.params.questions.length > 1 ? " • Tab/←→ tabs" : "";
		return `↑↓ move • ${select}${tabs} • Esc cancel`;
	}

	private focusedPreview(): string | undefined {
		const question = this.params.questions[this.currentTab];
		if (question.multiSelect) return undefined;
		const row = rowsFor(question)[this.cursors[this.currentTab]];
		return row.kind === "option"
			? question.options[row.optionIndex].preview
			: undefined;
	}

	private pushWrapped(
		lines: string[],
		prefix: string,
		text: string,
		width: number,
	): void {
		const prefixWidth = visibleWidth(prefix);
		if (prefixWidth >= width) {
			lines.push(...wrapTextWithAnsi(`${prefix}${text}`, width));
			return;
		}
		const wrapped = wrapTextWithAnsi(text, width - prefixWidth);
		for (let index = 0; index < wrapped.length; index++) {
			lines.push(
				`${index === 0 ? prefix : " ".repeat(prefixWidth)}${wrapped[index]}`,
			);
		}
	}

	private isCustomInputFocused(): boolean {
		if (this.currentTab >= this.params.questions.length) return false;
		const question = this.params.questions[this.currentTab];
		return rowsFor(question)[this.cursors[this.currentTab]].kind === "custom";
	}

	private updateInputFocus(): void {
		for (let index = 0; index < this.customInputs.length; index++) {
			this.customInputs[index].focused =
				this._focused &&
				index === this.currentTab &&
				this.isCustomInputFocused();
		}
	}

	private submitCustomAnswer(questionIndex: number, text: string): void {
		const value = text.trim();
		if (!value) {
			this.status = "Write an answer before submitting.";
			this.refresh();
			return;
		}
		const question = this.params.questions[questionIndex];
		this.selections[questionIndex].clear();
		this.answers.set(questionIndex, {
			questionIndex,
			question: question.question,
			kind: "custom",
			value,
		});
		this.advanceAfterAnswer();
	}

	private commitOption(optionIndex: number): void {
		const question = this.params.questions[this.currentTab];
		const option = question.options[optionIndex];
		this.answers.set(this.currentTab, {
			questionIndex: this.currentTab,
			question: question.question,
			kind: "option",
			value: option.label,
			...(option.preview ? { preview: option.preview } : {}),
		});
		this.advanceAfterAnswer();
	}

	private toggleOption(optionIndex: number): void {
		const selected = this.selections[this.currentTab];
		if (selected.has(optionIndex)) selected.delete(optionIndex);
		else selected.add(optionIndex);
		this.answers.delete(this.currentTab);
		this.status = "";
		this.refresh();
	}

	private commitMultiSelect(questionIndex = this.currentTab): void {
		const selected = [...this.selections[questionIndex]].sort((a, b) => a - b);
		const customAnswer = this.customInputs[questionIndex].getValue().trim();
		if (selected.length === 0 && !customAnswer) {
			this.status = "Select at least one option or type a custom answer.";
			this.refresh();
			return;
		}
		const question = this.params.questions[questionIndex];
		const values = selected.map((index) => question.options[index].label);
		if (customAnswer) values.push(customAnswer);
		this.answers.set(questionIndex, {
			questionIndex,
			question: question.question,
			kind: "multi",
			value: values,
		});
		this.advanceAfterAnswer();
	}

	private advanceAfterAnswer(): void {
		this.status = "";
		if (this.params.questions.length === 1) {
			this.done({ answers: this.orderedAnswers(), cancelled: false });
			return;
		}
		this.currentTab = Math.min(
			this.currentTab + 1,
			this.params.questions.length,
		);
		this.updateInputFocus();
		this.refresh();
	}

	private submitQuestionnaire(): void {
		if (!this.allAnswered()) {
			this.status = "Answer every question before submitting.";
			this.refresh();
			return;
		}
		this.done({ answers: this.orderedAnswers(), cancelled: false });
	}

	private allAnswered(): boolean {
		return this.answers.size === this.params.questions.length;
	}

	private orderedAnswers(): Answer[] {
		return [...this.answers.values()].sort(
			(a, b) => a.questionIndex - b.questionIndex,
		);
	}

	private refresh(): void {
		this.tui.requestRender();
	}
}

// Extension
export default function askUserQuestionExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "ask_user_question",
		label: "Ask User Question",
		description: TOOL_DESCRIPTION,
		promptSnippet: `Ask up to ${MAX_QUESTIONS} structured questions and show optional Markdown previews`,
		promptGuidelines: PROMPT_GUIDELINES,
		parameters: AskUserQuestionSchema,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (ctx.mode !== "tui") {
				return {
					content: [
						{
							type: "text" as const,
							text: "Error: ask_user_question requires Pi's interactive terminal.",
						},
					],
					details: {
						answers: [],
						cancelled: true,
					} satisfies QuestionnaireResult,
				};
			}

			const validationError = validateQuestions(params);
			if (validationError) {
				return {
					content: [
						{ type: "text" as const, text: `Error: ${validationError}` },
					],
					details: {
						answers: [],
						cancelled: true,
					} satisfies QuestionnaireResult,
				};
			}

			const result = await ctx.ui.custom<QuestionnaireResult>(
				(tui, theme, _keybindings, done) =>
					new Questionnaire(tui, theme, params, done),
				{
					overlay: true,
					overlayOptions: {
						anchor: "bottom-center",
						width: "100%",
						maxHeight: "100%",
						margin: { left: 0, right: 0, bottom: 0 },
					},
				},
			);

			const resolved = result ?? { answers: [], cancelled: true };
			return {
				content: [{ type: "text" as const, text: buildToolText(resolved) }],
				details: resolved,
			};
		},
	});
}
