/**
 * todo — task list tool with a live overlay widget above the editor.
 *
 * Tune via the constants below. Do not rename TOOL_NAME: session history
 * replays todos by filtering on the tool name.
 */
import type {
	ExtensionAPI,
	ExtensionUIContext,
	Theme,
} from "@earendil-works/pi-coding-agent";
import { Text, type TUI, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const PROMPT_SNIPPET = "Manage a task list to track multi-step progress";

const PROMPT_GUIDELINES: string[] = [
	"Use `todo` for complex work with 3+ steps, when the user gives you a list of tasks, or immediately after receiving new instructions to capture requirements. Skip it for single trivial tasks and purely conversational requests.",
	"Batch independent work in one call: create a whole list with one `create` call using `tasks`, change several tasks with one `update` call using `updates`, and read or remove several tasks with one call using `ids`. Never send one call per task.",
	"When starting a task from the todo list, mark it in_progress BEFORE beginning work. Mark it completed IMMEDIATELY when done — never batch completions. Exactly one task in_progress at a time.",
	"Never mark a task completed if tests are failing, the implementation is partial, or you hit unresolved errors — keep it in_progress and create a new task for the blocker instead.",
	"Task status is a 4-state machine: pending → in_progress → completed, plus deleted as a tombstone. Pass activeForm (present-continuous label, e.g. 'writing tests') when marking in_progress.",
	'To change a task\'s status, call update with the task id and the target status, e.g. {"action":"update","id":3,"status":"completed"} or {"action":"update","id":3,"status":"in_progress","activeForm":"writing tests"}. status is the field that changes the task; an update without a mutable field (status or another) is rejected.',
	"Use blockedBy to express dependencies (A is blocked by B). On create, pass blockedBy as the initial set. On update, use addBlockedBy / removeBlockedBy (additive merge — do not resend the full array). Cycles are rejected.",
	"list hides tombstoned (deleted) tasks by default; pass includeDeleted:true to see them. Pass status to filter by a single status.",
	"Subject must be short and imperative (e.g. 'Research existing tool'); description is for long-form detail. activeForm is a present-continuous label shown while in_progress.",
];

const TOOL_DESCRIPTION =
	"Manage a task list for tracking multi-step progress. Actions: create (one task via subject, or many via tasks[]), update (one task via id plus fields, or many via updates[]), list (all tasks, optionally filtered by status), get (one task via id, or many via ids[]), delete (one task via id, or many via ids[]), clear (reset all). Status: pending → in_progress → completed, plus deleted tombstone. Use this to plan and track multi-step work like research, design, and implementation.";

const MAX_WIDGET_LINES = 12;

const TOOL_NAME = "todo";
const TOOL_LABEL = "Todo";
const WIDGET_KEY = "todos";

type TaskStatus = "pending" | "in_progress" | "completed" | "deleted";
type TaskAction = "create" | "update" | "list" | "get" | "delete" | "clear";

interface Task {
	id: number;
	subject: string;
	description?: string;
	activeForm?: string;
	status: TaskStatus;
	blockedBy?: number[];
	owner?: string;
	metadata?: Record<string, unknown>;
}

// Shape pinned by replay: every tool result persists this in `details`,
// and replayFromBranch rebuilds state from the latest one.
interface TaskDetails {
	action: TaskAction;
	params: Record<string, unknown>;
	tasks: Task[];
	nextId: number;
	error?: string;
}

interface TaskInput {
	subject: string;
	description?: string;
	activeForm?: string;
	blockedBy?: number[];
	owner?: string;
	metadata?: Record<string, unknown>;
}

interface TaskUpdateInput {
	id: number;
	subject?: string;
	description?: string;
	activeForm?: string;
	status?: TaskStatus;
	owner?: string;
	metadata?: Record<string, unknown>;
	addBlockedBy?: number[];
	removeBlockedBy?: number[];
}

interface TaskMutationParams {
	[key: string]: unknown;
	subject?: string;
	description?: string;
	activeForm?: string;
	status?: TaskStatus;
	blockedBy?: number[];
	addBlockedBy?: number[];
	removeBlockedBy?: number[];
	owner?: string;
	metadata?: Record<string, unknown>;
	id?: number;
	includeDeleted?: boolean;
	tasks?: TaskInput[];
	updates?: TaskUpdateInput[];
	ids?: number[];
}

interface TaskState {
	tasks: Task[];
	nextId: number;
}

const EMPTY_STATE: TaskState = { tasks: [], nextId: 1 };

const TaskInputSchema = Type.Object({
	subject: Type.String({ description: "Task subject line" }),
	description: Type.Optional(
		Type.String({ description: "Long-form task description" }),
	),
	activeForm: Type.Optional(
		Type.String({
			description:
				"Present-continuous spinner label shown while status is in_progress (e.g. 'writing tests')",
		}),
	),
	blockedBy: Type.Optional(
		Type.Array(Type.Number(), {
			description: "Initial blockedBy ids (create only)",
		}),
	),
	owner: Type.Optional(
		Type.String({ description: "Agent/owner assigned to this task" }),
	),
	metadata: Type.Optional(
		Type.Record(Type.String(), Type.Unknown(), {
			description: "Arbitrary metadata",
		}),
	),
});

const TaskUpdateInputSchema = Type.Object({
	id: Type.Number({ description: "Task id" }),
	subject: Type.Optional(
		Type.String({ description: "Task subject line" }),
	),
	description: Type.Optional(
		Type.String({ description: "Long-form task description" }),
	),
	activeForm: Type.Optional(
		Type.String({
			description:
				"Present-continuous spinner label shown while status is in_progress (e.g. 'writing tests')",
		}),
	),
	status: Type.Optional(
		Type.Union(
			[
				Type.Literal("pending"),
				Type.Literal("in_progress"),
				Type.Literal("completed"),
				Type.Literal("deleted"),
			],
			{ description: "Set this task's status" },
		),
	),
	owner: Type.Optional(
		Type.String({ description: "Agent/owner assigned to this task" }),
	),
	metadata: Type.Optional(
		Type.Record(Type.String(), Type.Unknown(), {
			description:
				"Arbitrary metadata; pass null value for a key to delete that key on update",
		}),
	),
	addBlockedBy: Type.Optional(
		Type.Array(Type.Number(), {
			description: "Task ids to add to blockedBy (additive merge)",
		}),
	),
	removeBlockedBy: Type.Optional(
		Type.Array(Type.Number(), {
			description: "Task ids to remove from blockedBy (additive merge)",
		}),
	),
});

const TodoParamsSchema = Type.Object({
	action: Type.Union(
		[
			Type.Literal("create"),
			Type.Literal("update"),
			Type.Literal("list"),
			Type.Literal("get"),
			Type.Literal("delete"),
			Type.Literal("clear"),
		],
		{ description: "Action: create, update, list, get, delete, or clear" },
	),
	subject: Type.Optional(
		Type.String({ description: "Task subject line (required for create)" }),
	),
	description: Type.Optional(
		Type.String({ description: "Long-form task description" }),
	),
	activeForm: Type.Optional(
		Type.String({
			description:
				"Present-continuous spinner label shown while status is in_progress (e.g. 'writing tests')",
		}),
	),
	status: Type.Optional(
		Type.Union(
			[
				Type.Literal("pending"),
				Type.Literal("in_progress"),
				Type.Literal("completed"),
				Type.Literal("deleted"),
			],
			{
				description:
					"Set this task's status (update): one of pending, in_progress, completed, deleted. When action is list, filters returned tasks by this status.",
			},
		),
	),
	blockedBy: Type.Optional(
		Type.Array(Type.Number(), {
			description: "Initial blockedBy ids (create only)",
		}),
	),
	addBlockedBy: Type.Optional(
		Type.Array(Type.Number(), {
			description: "Task ids to add to blockedBy (update only, additive merge)",
		}),
	),
	removeBlockedBy: Type.Optional(
		Type.Array(Type.Number(), {
			description:
				"Task ids to remove from blockedBy (update only, additive merge)",
		}),
	),
	owner: Type.Optional(
		Type.String({ description: "Agent/owner assigned to this task" }),
	),
	metadata: Type.Optional(
		Type.Record(Type.String(), Type.Unknown(), {
			description:
				"Arbitrary metadata; pass null value for a key to delete that key on update",
		}),
	),
	id: Type.Optional(
		Type.Number({ description: "Task id (required for update, get, delete)" }),
	),
	includeDeleted: Type.Optional(
		Type.Boolean({
			description:
				"If true, list action returns deleted (tombstoned) tasks as well. Default: false.",
		}),
	),
	tasks: Type.Optional(
		Type.Array(TaskInputSchema, {
			description:
				"Tasks to create in one call (create only; use instead of subject)",
			minItems: 1,
		}),
	),
	updates: Type.Optional(
		Type.Array(TaskUpdateInputSchema, {
			description:
				"Tasks to update in one call (update only; use instead of id and shared fields)",
			minItems: 1,
		}),
	),
	ids: Type.Optional(
		Type.Array(Type.Number(), {
			description:
				"Task ids for one call on many tasks (delete and get only; use instead of id)",
			minItems: 1,
		}),
	),
});

function sanitizeTerminalText(value: string): string {
	return value
		.replace(/(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g, "")
		.replace(
			/(?:\u001b\]|\u009d)[^\u0007\u009c\u001b]*(?:\u0007|\u009c|\u001b\\)?/g,
			"",
		)
		.replace(/\u001b./g, "")
		.replace(/[\u2028\u2029]/g, " ")
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, (character) =>
			character === "\n" || character === "\r" || character === "\t" ? " " : "",
		)
		.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
}

const STATUS_LABEL: Record<TaskStatus, string> = {
	pending: "pending",
	in_progress: "in progress",
	completed: "completed",
	deleted: "deleted",
};

const VALID_TRANSITIONS: Record<TaskStatus, ReadonlySet<TaskStatus>> = {
	pending: new Set(["in_progress", "completed", "deleted"]),
	in_progress: new Set(["pending", "completed", "deleted"]),
	completed: new Set(["deleted"]),
	deleted: new Set(),
};

function isTransitionValid(from: TaskStatus, to: TaskStatus): boolean {
	if (from === to) return true;
	return VALID_TRANSITIONS[from].has(to);
}

function detectCycle(
	taskList: readonly Task[],
	taskId: number,
	newBlockedBy: readonly number[],
): boolean {
	const edges = new Map<number, number[]>();
	for (const t of taskList) {
		if (t.id === taskId) {
			edges.set(t.id, [...new Set([...(t.blockedBy ?? []), ...newBlockedBy])]);
		} else {
			edges.set(t.id, t.blockedBy ? [...t.blockedBy] : []);
		}
	}
	const visiting = new Set<number>();
	const visited = new Set<number>();
	const hasCycleFrom = (node: number): boolean => {
		if (visiting.has(node)) return true;
		if (visited.has(node)) return false;
		visiting.add(node);
		for (const next of edges.get(node) ?? []) {
			if (hasCycleFrom(next)) return true;
		}
		visiting.delete(node);
		visited.add(node);
		return false;
	};
	for (const node of edges.keys()) {
		if (hasCycleFrom(node)) return true;
	}
	return false;
}

function deriveBlocks(taskList: readonly Task[]): Map<number, number[]> {
	const blocks = new Map<number, number[]>();
	for (const t of taskList) {
		for (const dep of t.blockedBy ?? []) {
			const arr = blocks.get(dep) ?? [];
			arr.push(t.id);
			blocks.set(dep, arr);
		}
	}
	return blocks;
}

type Op =
	| { kind: "create"; taskId: number }
	| {
			kind: "update";
			id: number;
			fromStatus: TaskStatus;
			toStatus: TaskStatus;
			changed: boolean;
	  }
	| { kind: "delete"; id: number; subject: string }
	| { kind: "list"; statusFilter?: TaskStatus; includeDeleted: boolean }
	| { kind: "get"; task: Task }
	| { kind: "clear"; count: number }
	| { kind: "createMany"; ids: number[]; errors: string[] }
	| { kind: "updateMany"; ids: number[]; errors: string[] }
	| { kind: "deleteMany"; ids: number[]; errors: string[] }
	| { kind: "getMany"; found: Task[]; missing: number[] }
	| { kind: "error"; message: string };

interface ApplyResult {
	state: TaskState;
	op: Op;
}

function errorResult(state: TaskState, message: string): ApplyResult {
	return { state, op: { kind: "error", message } };
}

function sameNumberList(
	a: number[] | undefined,
	b: number[] | undefined,
): boolean {
	const x = a ?? [];
	const y = b ?? [];
	return x.length === y.length && x.every((v, i) => v === y[i]);
}

function sameRecord(
	a: Record<string, unknown> | undefined,
	b: Record<string, unknown> | undefined,
): boolean {
	return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function taskChanged(before: Task, after: Task): boolean {
	return (
		before.subject !== after.subject ||
		before.status !== after.status ||
		before.description !== after.description ||
		before.activeForm !== after.activeForm ||
		before.owner !== after.owner ||
		!sameNumberList(before.blockedBy, after.blockedBy) ||
		!sameRecord(before.metadata, after.metadata)
	);
}

function createSingleTask(state: TaskState, input: TaskInput): ApplyResult {
	if (typeof input.subject !== "string" || !input.subject.trim())
		return errorResult(state, "subject required for create");
	if (input.blockedBy?.length) {
		for (const dep of input.blockedBy) {
			const depTask = state.tasks.find((t) => t.id === dep);
			if (!depTask)
				return errorResult(state, `blockedBy: #${dep} not found`);
			if (depTask.status === "deleted")
				return errorResult(state, `blockedBy: #${dep} is deleted`);
		}
	}
	const newTask: Task = {
		id: state.nextId,
		subject: input.subject,
		status: "pending",
	};
	if (input.description) newTask.description = input.description;
	if (input.activeForm) newTask.activeForm = input.activeForm;
	if (input.blockedBy?.length) newTask.blockedBy = [...input.blockedBy];
	if (input.owner) newTask.owner = input.owner;
	if (input.metadata) newTask.metadata = { ...input.metadata };
	return {
		state: { tasks: [...state.tasks, newTask], nextId: state.nextId + 1 },
		op: { kind: "create", taskId: newTask.id },
	};
}

function updateSingleTask(
	state: TaskState,
	id: number,
	fields: Omit<TaskUpdateInput, "id">,
): ApplyResult {
	const idx = state.tasks.findIndex((t) => t.id === id);
	if (idx === -1) return errorResult(state, `#${id} not found`);
	const current = state.tasks[idx];
	const hasMutation =
		fields.subject !== undefined ||
		fields.description !== undefined ||
		fields.activeForm !== undefined ||
		fields.status !== undefined ||
		fields.owner !== undefined ||
		fields.metadata !== undefined ||
		(fields.addBlockedBy && fields.addBlockedBy.length > 0) ||
		(fields.removeBlockedBy && fields.removeBlockedBy.length > 0);
	if (!hasMutation) {
		return errorResult(
			state,
			"update requires at least one mutable field: subject, description, activeForm, status, owner, metadata, addBlockedBy, or removeBlockedBy",
		);
	}
	let newStatus = current.status;
	if (fields.status !== undefined) {
		if (!isTransitionValid(current.status, fields.status)) {
			return errorResult(
				state,
				`illegal transition ${current.status} → ${fields.status}`,
			);
		}
		newStatus = fields.status;
	}
	let newBlockedBy = current.blockedBy ? [...current.blockedBy] : [];
	if (fields.removeBlockedBy?.length) {
		const toRemove = new Set(fields.removeBlockedBy);
		newBlockedBy = newBlockedBy.filter((dep) => !toRemove.has(dep));
	}
	if (fields.addBlockedBy?.length) {
		for (const dep of fields.addBlockedBy) {
			if (dep === current.id)
				return errorResult(state, `cannot block #${current.id} on itself`);
			const depTask = state.tasks.find((t) => t.id === dep);
			if (!depTask)
				return errorResult(state, `addBlockedBy: #${dep} not found`);
			if (depTask.status === "deleted")
				return errorResult(state, `addBlockedBy: #${dep} is deleted`);
			if (!newBlockedBy.includes(dep)) newBlockedBy.push(dep);
		}
		if (detectCycle(state.tasks, current.id, newBlockedBy)) {
			return errorResult(
				state,
				"addBlockedBy would create a cycle in the blockedBy graph",
			);
		}
	}
	let newMetadata = current.metadata;
	if (fields.metadata !== undefined) {
		const merged: Record<string, unknown> = { ...(current.metadata ?? {}) };
		for (const [k, v] of Object.entries(fields.metadata)) {
			if (v === null) delete merged[k];
			else merged[k] = v;
		}
		newMetadata = Object.keys(merged).length ? merged : undefined;
	}
	const updated: Task = { ...current, status: newStatus };
	if (fields.subject !== undefined) updated.subject = fields.subject;
	if (fields.description !== undefined)
		updated.description = fields.description;
	if (fields.activeForm !== undefined)
		updated.activeForm = fields.activeForm;
	if (fields.owner !== undefined) updated.owner = fields.owner;
	if (newBlockedBy.length) updated.blockedBy = newBlockedBy;
	else delete updated.blockedBy;
	if (newMetadata === undefined) delete updated.metadata;
	else updated.metadata = newMetadata;
	const newTasks = [...state.tasks];
	newTasks[idx] = updated;
	return {
		state: { tasks: newTasks, nextId: state.nextId },
		op: {
			kind: "update",
			id: updated.id,
			fromStatus: current.status,
			toStatus: newStatus,
			changed: taskChanged(current, updated),
		},
	};
}

function deleteSingleTask(state: TaskState, id: number): ApplyResult {
	const idx = state.tasks.findIndex((t) => t.id === id);
	if (idx === -1) return errorResult(state, `#${id} not found`);
	const current = state.tasks[idx];
	if (current.status === "deleted")
		return errorResult(state, `#${current.id} is already deleted`);
	const updated: Task = { ...current, status: "deleted" };
	const newTasks = [...state.tasks];
	newTasks[idx] = updated;
	return {
		state: { tasks: newTasks, nextId: state.nextId },
		op: { kind: "delete", id: updated.id, subject: updated.subject },
	};
}

function hasSingleCreateFields(params: TaskMutationParams): boolean {
	return (
		params.subject !== undefined ||
		params.description !== undefined ||
		params.activeForm !== undefined ||
		params.blockedBy !== undefined ||
		params.owner !== undefined ||
		params.metadata !== undefined
	);
}

function hasSingleUpdateFields(params: TaskMutationParams): boolean {
	return (
		params.id !== undefined ||
		params.subject !== undefined ||
		params.description !== undefined ||
		params.activeForm !== undefined ||
		params.status !== undefined ||
		params.owner !== undefined ||
		params.metadata !== undefined ||
		params.addBlockedBy !== undefined ||
		params.removeBlockedBy !== undefined
	);
}

function applyTaskMutation(
	state: TaskState,
	action: TaskAction,
	params: TaskMutationParams,
): ApplyResult {
	switch (action) {
		case "create": {
			if (params.tasks !== undefined) {
				if (hasSingleCreateFields(params))
					return errorResult(
						state,
						"create accepts either subject or tasks, not both",
					);
				if (params.updates !== undefined || params.ids !== undefined)
					return errorResult(
						state,
						"create accepts only subject or tasks",
					);
				if (params.tasks.length === 0)
					return errorResult(state, "tasks must not be empty");
				let next = state;
				const ids: number[] = [];
				const errors: string[] = [];
				params.tasks.forEach((item, index) => {
					const result = createSingleTask(next, item);
					next = result.state;
					if (result.op.kind === "error")
						errors.push(`item ${index + 1}: ${result.op.message}`);
					else if (result.op.kind === "create") ids.push(result.op.taskId);
				});
				return { state: next, op: { kind: "createMany", ids, errors } };
			}
			if (!params.subject?.trim())
				return errorResult(state, "subject required for create");
			return createSingleTask(state, {
				subject: params.subject,
				description: params.description,
				activeForm: params.activeForm,
				blockedBy: params.blockedBy,
				owner: params.owner,
				metadata: params.metadata,
			});
		}
		case "update": {
			if (params.updates !== undefined) {
				if (hasSingleUpdateFields(params))
					return errorResult(
						state,
						"update accepts either id or updates, not both",
					);
				if (params.tasks !== undefined || params.ids !== undefined)
					return errorResult(
						state,
						"update accepts only id or updates",
					);
				if (params.updates.length === 0)
					return errorResult(state, "updates must not be empty");
				let next = state;
				const ids: number[] = [];
				const errors: string[] = [];
				for (const item of params.updates) {
					const { id: itemId, ...fields } = item;
					const result = updateSingleTask(next, itemId, fields);
					next = result.state;
					if (result.op.kind === "error")
						errors.push(`#${itemId}: ${result.op.message}`);
					else if (result.op.kind === "update") ids.push(result.op.id);
				}
				return { state: next, op: { kind: "updateMany", ids, errors } };
			}
			if (params.tasks !== undefined || params.ids !== undefined)
				return errorResult(state, "update accepts only id or updates");
			if (params.id === undefined)
				return errorResult(state, "id required for update");
			return updateSingleTask(state, params.id, {
				subject: params.subject,
				description: params.description,
				activeForm: params.activeForm,
				status: params.status,
				owner: params.owner,
				metadata: params.metadata,
				addBlockedBy: params.addBlockedBy,
				removeBlockedBy: params.removeBlockedBy,
			});
		}
		case "list": {
			return {
				state,
				op: {
					kind: "list",
					includeDeleted: params.includeDeleted === true,
					...(params.status !== undefined
						? { statusFilter: params.status }
						: {}),
				},
			};
		}
		case "get": {
			if (params.ids !== undefined) {
				if (params.id !== undefined)
					return errorResult(
						state,
						"get accepts either id or ids, not both",
					);
				if (params.ids.length === 0)
					return errorResult(state, "ids must not be empty");
				const found: Task[] = [];
				const missing: number[] = [];
				for (const itemId of new Set(params.ids)) {
					const task = state.tasks.find((t) => t.id === itemId);
					if (!task) missing.push(itemId);
					else found.push(task);
				}
				return { state, op: { kind: "getMany", found, missing } };
			}
			if (params.id === undefined)
				return errorResult(state, "id required for get");
			const task = state.tasks.find((t) => t.id === params.id);
			if (!task) return errorResult(state, `#${params.id} not found`);
			return { state, op: { kind: "get", task } };
		}
		case "delete": {
			if (params.ids !== undefined) {
				if (params.id !== undefined)
					return errorResult(
						state,
						"delete accepts either id or ids, not both",
					);
				if (params.ids.length === 0)
					return errorResult(state, "ids must not be empty");
				let next = state;
				const ids: number[] = [];
				const errors: string[] = [];
				for (const itemId of new Set(params.ids)) {
					const result = deleteSingleTask(next, itemId);
					next = result.state;
					if (result.op.kind === "error")
						errors.push(`#${itemId}: ${result.op.message}`);
					else if (result.op.kind === "delete") ids.push(result.op.id);
				}
				return { state: next, op: { kind: "deleteMany", ids, errors } };
			}
			if (params.id === undefined)
				return errorResult(state, "id required for delete");
			return deleteSingleTask(state, params.id);
		}
		case "clear": {
			return {
				state: { tasks: [], nextId: 1 },
				op: { kind: "clear", count: state.tasks.length },
			};
		}
	}
}

function selectVisibleTasks(state: TaskState): readonly Task[] {
	return state.tasks.filter((t) => t.status !== "deleted");
}

interface TodoCounts {
	total: number;
	pending: number;
	inProgress: number;
	completed: number;
}

function selectTodoCounts(state: TaskState): TodoCounts {
	const counts: TodoCounts = {
		total: 0,
		pending: 0,
		inProgress: 0,
		completed: 0,
	};
	for (const t of selectVisibleTasks(state)) {
		counts.total++;
		if (t.status === "pending") counts.pending++;
		else if (t.status === "in_progress") counts.inProgress++;
		else counts.completed++;
	}
	return counts;
}

function selectShowTaskIds(state: TaskState): boolean {
	return selectVisibleTasks(state).some(
		(t) => t.blockedBy && t.blockedBy.length > 0,
	);
}

function selectTaskSubjectById(
	state: TaskState,
	id: number,
): string | undefined {
	return state.tasks.find((t) => t.id === id)?.subject;
}

interface OverlayLayout {
	visible: readonly Task[];
	hiddenCompleted: number;
	truncatedTail: number;
}

// Overflow drops completed tasks first, then truncates the remaining tail.
function selectOverlayLayout(state: TaskState, budget: number): OverlayLayout {
	const all = selectVisibleTasks(state);
	if (all.length <= budget)
		return { visible: all, hiddenCompleted: 0, truncatedTail: 0 };
	const innerBudget = budget - 1;
	const nonCompleted = all.filter((t) => t.status !== "completed");
	const totalCompleted = all.length - nonCompleted.length;
	if (nonCompleted.length <= innerBudget) {
		const kept = new Set<Task>(nonCompleted);
		for (const t of all) {
			if (kept.size >= innerBudget) break;
			if (t.status === "completed") kept.add(t);
		}
		const visible = all.filter((t) => kept.has(t));
		const shownCompleted = visible.filter(
			(t) => t.status === "completed",
		).length;
		return {
			visible,
			hiddenCompleted: totalCompleted - shownCompleted,
			truncatedTail: 0,
		};
	}
	return {
		visible: nonCompleted.slice(0, innerBudget),
		hiddenCompleted: totalCompleted,
		truncatedTail: nonCompleted.length - innerBudget,
	};
}

function selectHasActive(state: TaskState): boolean {
	return selectVisibleTasks(state).some(
		(t) => t.status === "in_progress" || t.status === "pending",
	);
}

function formatListLine(t: Task): string {
	const block = t.blockedBy?.length
		? ` ⛓ ${t.blockedBy.map((id) => `#${id}`).join(",")}`
		: "";
	const form =
		t.status === "in_progress" && t.activeForm
			? ` (${sanitizeTerminalText(t.activeForm)})`
			: "";
	return `[${t.status}] #${t.id} ${sanitizeTerminalText(t.subject)}${form}${block}`;
}

function formatGetLines(task: Task, state: TaskState): string {
	const blocks = deriveBlocks(state.tasks).get(task.id) ?? [];
	const lines = [
		`#${task.id} [${task.status}] ${sanitizeTerminalText(task.subject)}`,
	];
	if (task.description)
		lines.push(`  description: ${sanitizeTerminalText(task.description)}`);
	if (task.activeForm)
		lines.push(`  activeForm: ${sanitizeTerminalText(task.activeForm)}`);
	if (task.blockedBy?.length)
		lines.push(
			`  blockedBy: ${task.blockedBy.map((id) => `#${id}`).join(", ")}`,
		);
	if (blocks.length)
		lines.push(`  blocks: ${blocks.map((id) => `#${id}`).join(", ")}`);
	if (task.owner) lines.push(`  owner: ${sanitizeTerminalText(task.owner)}`);
	return lines.join("\n");
}

function formatContent(op: Op, state: TaskState): string {
	switch (op.kind) {
		case "create": {
			const t = state.tasks.find((x) => x.id === op.taskId);
			if (!t) return `Created #${op.taskId}`;
			return `Created #${t.id}: ${sanitizeTerminalText(t.subject)} (pending)`;
		}
		case "update": {
			if (!op.changed)
				return `No change: #${op.id} already matches the requested values (status: ${op.toStatus})`;
			const transition =
				op.fromStatus !== op.toStatus
					? ` (${op.fromStatus} → ${op.toStatus})`
					: "";
			return `Updated #${op.id}${transition}`;
		}
		case "delete":
			return `Deleted #${op.id}: ${sanitizeTerminalText(op.subject)}`;
		case "clear":
			return `Cleared ${op.count} tasks`;
		case "list": {
			let view = state.tasks;
			if (!op.includeDeleted) view = view.filter((t) => t.status !== "deleted");
			if (op.statusFilter)
				view = view.filter((t) => t.status === op.statusFilter);
			return view.length === 0
				? "No tasks"
				: view.map(formatListLine).join("\n");
		}
		case "get":
			return formatGetLines(op.task, state);
		case "createMany": {
			const created: Task[] = [];
			for (const id of op.ids) {
				const task = state.tasks.find((t) => t.id === id);
				if (task) created.push(task);
			}
			const head =
				created.length === 0
					? "Created 0 tasks"
					: `Created ${created.length} task${created.length === 1 ? "" : "s"}: ${created
							.map((t) => `#${t.id} ${sanitizeTerminalText(t.subject)}`)
							.join(", ")}`;
			return [head, ...op.errors.map((e) => `Error: ${e}`)].join("\n");
		}
		case "updateMany": {
			const head =
				op.ids.length === 0
					? "Updated 0 tasks"
					: `Updated ${op.ids.length} task${op.ids.length === 1 ? "" : "s"}: ${op.ids.map((id) => `#${id}`).join(", ")}`;
			return [head, ...op.errors.map((e) => `Error: ${e}`)].join("\n");
		}
		case "deleteMany": {
			const head =
				op.ids.length === 0
					? "Deleted 0 tasks"
					: `Deleted ${op.ids.length} task${op.ids.length === 1 ? "" : "s"}: ${op.ids.map((id) => `#${id}`).join(", ")}`;
			return [head, ...op.errors.map((e) => `Error: ${e}`)].join("\n");
		}
		case "getMany": {
			const lines = op.found.map((t) => formatGetLines(t, state));
			for (const id of op.missing) lines.push(`Error: #${id} not found`);
			return lines.length === 0 ? "No tasks" : lines.join("\n\n");
		}
		case "error":
			return `Error: ${op.message}`;
	}
}

function buildToolResult(
	action: TaskAction,
	params: TaskMutationParams,
	state: TaskState,
	op: Op,
): { content: Array<{ type: "text"; text: string }>; details: TaskDetails } {
	return {
		content: [{ type: "text", text: formatContent(op, state) }],
		details: {
			action,
			params: params as Record<string, unknown>,
			tasks: state.tasks,
			nextId: state.nextId,
			...(op.kind === "error" ? { error: op.message } : {}),
		},
	};
}

const sessions = new Map<string, TaskState>();
let activeRenderSession = "";

interface SessionCtx {
	sessionManager: { getSessionId(): string; getBranch(): Iterable<unknown> };
}

function sid(ctx: SessionCtx): string {
	return ctx.sessionManager.getSessionId() ?? "";
}

function slotFor(sessionId: string): TaskState {
	return (
		sessions.get(sessionId) ?? {
			tasks: [...EMPTY_STATE.tasks],
			nextId: EMPTY_STATE.nextId,
		}
	);
}

function replaceState(sessionId: string, next: TaskState): void {
	sessions.set(sessionId, next);
}

function commitState(sessionId: string, next: TaskState): void {
	sessions.set(sessionId, next);
}

function evictSession(sessionId: string): void {
	sessions.delete(sessionId);
}

function getRenderState(): TaskState {
	return slotFor(activeRenderSession);
}

function setActiveRenderSession(sessionId: string): void {
	activeRenderSession = sessionId;
}

function getActiveRenderSession(): string {
	return activeRenderSession;
}

function clearActiveRenderSession(): void {
	activeRenderSession = "";
}

function isTaskDetails(value: unknown): value is TaskDetails {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return Array.isArray(v.tasks) && typeof v.nextId === "number";
}

// Last `todo` result in the branch wins; anything else means an empty list.
function replayFromBranch(ctx: SessionCtx): TaskState {
	let result: TaskState = {
		tasks: [...EMPTY_STATE.tasks],
		nextId: EMPTY_STATE.nextId,
	};
	for (const entry of ctx.sessionManager.getBranch()) {
		const e = entry as {
			type?: string;
			message?: { role?: string; toolName?: string; details?: unknown };
		};
		if (e.type !== "message") continue;
		const msg = e.message;
		if (msg?.role !== "toolResult" || msg.toolName !== TOOL_NAME) continue;
		if (!isTaskDetails(msg.details)) continue;
		result = {
			tasks: msg.details.tasks.map((t) => ({ ...t })),
			nextId: msg.details.nextId,
		};
	}
	return result;
}

const STATUS_GLYPH: Record<TaskStatus, string> = {
	pending: "○",
	in_progress: "◐",
	completed: "●",
	deleted: "⊘",
};

const STATUS_COLOR: Record<
	TaskStatus,
	"dim" | "warning" | "success" | "muted"
> = {
	pending: "dim",
	in_progress: "warning",
	completed: "success",
	deleted: "muted",
};

const ACTION_GLYPH: Record<TaskAction, string> = {
	create: "+",
	update: "→",
	delete: "×",
	get: "›",
	list: "☰",
	clear: "∅",
};

function overlayStatusGlyph(status: TaskStatus, theme: Theme): string {
	switch (status) {
		case "pending":
			return theme.fg("dim", "○");
		case "in_progress":
			return theme.fg("warning", "◐");
		case "completed":
			return theme.fg("success", "✓");
		case "deleted":
			return theme.fg("error", "✗");
	}
}

function formatOverlayTaskLine(t: Task, theme: Theme, showId: boolean): string {
	const glyph = overlayStatusGlyph(t.status, theme);
	const subjectColor =
		t.status === "in_progress"
			? "accent"
			: t.status === "completed" || t.status === "deleted"
				? "muted"
				: "text";
	let subject = theme.fg(subjectColor, sanitizeTerminalText(t.subject));
	if (t.status === "completed" || t.status === "deleted")
		subject = theme.strikethrough(subject);
	let line = `${glyph}`;
	if (showId) line += ` ${theme.fg("dim", `#${t.id}`)}`;
	line += ` ${subject}`;
	if (t.status === "in_progress" && t.activeForm) {
		line += ` ${theme.fg("muted", `(${sanitizeTerminalText(t.activeForm)})`)}`;
	}
	if (t.blockedBy && t.blockedBy.length > 0) {
		line += ` ${theme.fg("muted", `⛓ ${t.blockedBy.map((id) => `#${id}`).join(",")}`)}`;
	}
	return line;
}

function renderTodoCall(
	args: TaskMutationParams & { action: TaskAction },
	theme: Theme,
	state: TaskState,
): Text {
	const glyph = ACTION_GLYPH[args.action] ?? args.action;
	let text =
		theme.fg("toolTitle", theme.bold("todo ")) + theme.fg("muted", glyph);
	if (args.action === "create" && args.tasks) {
		text += ` ${theme.fg("dim", `+${args.tasks.length} tasks`)}`;
	} else if (args.action === "update" && args.updates) {
		text += ` ${theme.fg("muted", `→ ${args.updates.length} tasks`)}`;
	} else if (
		(args.action === "delete" || args.action === "get") &&
		args.ids
	) {
		text += ` ${theme.fg("accent", args.ids.map((id) => `#${id}`).join(", "))}`;
	} else if (args.action === "create" && args.subject) {
		text += ` ${theme.fg("dim", sanitizeTerminalText(args.subject))}`;
	} else if (
		(args.action === "update" ||
			args.action === "get" ||
			args.action === "delete") &&
		args.id !== undefined
	) {
		const subject = selectTaskSubjectById(state, args.id);
		text += ` ${theme.fg("accent", subject ? sanitizeTerminalText(subject) : `#${args.id}`)}`;
	} else if (args.action === "list" && args.status) {
		text += ` ${theme.fg("muted", STATUS_LABEL[args.status])}`;
	}
	return new Text(text, 0, 0);
}

function renderTodoResult(result: { details?: unknown }, theme: Theme): Text {
	const details = result.details as TaskDetails | undefined;
	const batchCount = ((): number | undefined => {
		if (!details) return undefined;
		const params = details.params as TaskMutationParams;
		if (details.action === "create" && Array.isArray(params.tasks))
			return params.tasks.length;
		if (details.action === "update" && Array.isArray(params.updates))
			return params.updates.length;
		if (
			(details.action === "delete" || details.action === "get") &&
			Array.isArray(params.ids)
		)
			return params.ids.length;
		return undefined;
	})();
	if (batchCount !== undefined) {
		return new Text(
			theme.fg(
				"success",
				`✓ ${batchCount} task${batchCount === 1 ? "" : "s"}`,
			),
			0,
			0,
		);
	}
	let status: TaskStatus | undefined;
	if (details) {
		const params = details.params as TaskMutationParams;
		switch (details.action) {
			case "create":
				status = details.tasks[details.tasks.length - 1]?.status;
				break;
			case "update":
				status =
					params.status ??
					details.tasks.find((t) => t.id === params.id)?.status;
				break;
			case "delete":
				status = details.tasks.find((t) => t.id === params.id)?.status;
				break;
			case "list":
			case "get":
			case "clear":
				break;
		}
	}
	if (status) {
		return new Text(
			theme.fg(
				STATUS_COLOR[status],
				`${STATUS_GLYPH[status]} ${STATUS_LABEL[status]}`,
			),
			0,
			0,
		);
	}
	return new Text(theme.fg("success", "✓"), 0, 0);
}

interface Snapshot {
	tasks: Task[];
	nextId: number;
}

class TodoOverlay {
	private uiCtx: ExtensionUIContext | undefined;
	private widgetRegistered = false;
	private tui: TUI | undefined;
	private completedTaskIdsPendingHide = new Set<number>();
	private hiddenCompletedTaskIds = new Set<number>();
	private lastNextId: number | undefined;

	setUICtx(ctx: ExtensionUIContext): void {
		if (ctx !== this.uiCtx) {
			this.uiCtx = ctx;
			this.widgetRegistered = false;
			this.tui = undefined;
		}
	}

	update(): void {
		if (!this.uiCtx) return;
		const visible = this.selectOverlayTasks(this.getSnapshot());
		if (visible.length === 0) {
			if (this.widgetRegistered) {
				this.uiCtx.setWidget(WIDGET_KEY, undefined);
				this.widgetRegistered = false;
				this.tui = undefined;
			}
			return;
		}
		if (!this.widgetRegistered) {
			this.uiCtx.setWidget(
				WIDGET_KEY,
				(tui, factoryTheme) => {
					this.tui = tui;
					return {
						render: (width: number) =>
							this.renderWidget(this.uiCtx?.theme ?? factoryTheme, width),
						invalidate: () => {},
					};
				},
				{ placement: "aboveEditor" },
			);
			this.widgetRegistered = true;
		} else {
			this.tui?.requestRender();
		}
	}

	resetCompletedDisplayState(): void {
		this.completedTaskIdsPendingHide.clear();
		this.hiddenCompletedTaskIds.clear();
		this.lastNextId = undefined;
	}

	hideCompletedTasksFromPreviousTurn(): void {
		if (this.completedTaskIdsPendingHide.size === 0) return;
		for (const taskId of this.completedTaskIdsPendingHide)
			this.hiddenCompletedTaskIds.add(taskId);
		this.completedTaskIdsPendingHide.clear();
		this.tui?.requestRender();
	}

	private getSnapshot(): Snapshot {
		const state = getRenderState();
		if (this.lastNextId !== undefined && state.nextId < this.lastNextId)
			this.resetCompletedDisplayState();
		this.lastNextId = state.nextId;
		const completedIds = new Set(
			state.tasks.filter((t) => t.status === "completed").map((t) => t.id),
		);
		for (const id of this.completedTaskIdsPendingHide) {
			if (!completedIds.has(id)) this.completedTaskIdsPendingHide.delete(id);
		}
		for (const id of this.hiddenCompletedTaskIds) {
			if (!completedIds.has(id)) this.hiddenCompletedTaskIds.delete(id);
		}
		return { tasks: [...state.tasks], nextId: state.nextId };
	}

	private selectOverlayTasks(snapshot: Snapshot): Task[] {
		return snapshot.tasks.filter(
			(t) => t.status !== "deleted" && !this.shouldHideCompletedTask(t),
		);
	}

	private shouldHideCompletedTask(task: Task): boolean {
		return (
			task.status === "completed" && this.hiddenCompletedTaskIds.has(task.id)
		);
	}

	private renderWidget(theme: Theme, width: number): string[] {
		const snapshot = this.getSnapshot();
		const overlayTasks = this.selectOverlayTasks(snapshot);
		if (overlayTasks.length === 0) return [];
		const overlayState: TaskState = {
			tasks: overlayTasks,
			nextId: snapshot.nextId,
		};
		const truncate = (line: string): string =>
			truncateToWidth(line, width, "…");
		const counts = selectTodoCounts(overlayState);
		const hasActive = selectHasActive(overlayState);
		const showIds = selectShowTaskIds(overlayState);
		const headingColor = hasActive ? "accent" : "dim";
		const headingIcon = hasActive ? "●" : "○";
		const heading = truncate(
			`${theme.fg(headingColor, headingIcon)} ${theme.fg(headingColor, `Todos (${counts.completed}/${counts.total})`)}`,
		);
		const lines: string[] = [heading];
		const bodyBudget =
			this.uiCtx?.getToolsExpanded?.() === true
				? overlayTasks.length
				: Math.max(MAX_WIDGET_LINES, 3) - 1;
		const layout = selectOverlayLayout(overlayState, bodyBudget);
		for (const task of layout.visible) {
			lines.push(
				truncate(
					`${theme.fg("dim", "├─")} ${formatOverlayTaskLine(task, theme, showIds)}`,
				),
			);
		}
		for (const task of overlayTasks) {
			if (
				task.status === "completed" &&
				!this.completedTaskIdsPendingHide.has(task.id) &&
				!this.hiddenCompletedTaskIds.has(task.id)
			) {
				this.completedTaskIdsPendingHide.add(task.id);
			}
		}
		if (layout.hiddenCompleted === 0 && layout.truncatedTail === 0) {
			const last = lines.length - 1;
			lines[last] = lines[last].replace("├─", "└─");
			return this.withTrailingSpacer(lines);
		}
		const totalHidden = layout.hiddenCompleted + layout.truncatedTail;
		const overflowParts: string[] = [];
		if (layout.hiddenCompleted > 0)
			overflowParts.push(`${layout.hiddenCompleted} ${STATUS_LABEL.completed}`);
		if (layout.truncatedTail > 0)
			overflowParts.push(`${layout.truncatedTail} ${STATUS_LABEL.pending}`);
		const summary =
			overflowParts.length > 0
				? `+${totalHidden} more (${overflowParts.join(", ")})`
				: `+${totalHidden} more`;
		lines.push(
			truncate(`${theme.fg("dim", "└─")} ${theme.fg("dim", summary)}`),
		);
		return this.withTrailingSpacer(lines);
	}

	private withTrailingSpacer(lines: string[]): string[] {
		if (lines.length === 0) return lines;
		lines.push("");
		return lines;
	}

	dispose(): void {
		if (this.uiCtx) this.uiCtx.setWidget(WIDGET_KEY, undefined);
		this.widgetRegistered = false;
		this.tui = undefined;
		this.uiCtx = undefined;
		this.resetCompletedDisplayState();
	}
}

function isStaleCtxError(e: unknown): boolean {
	return /stale after session replacement/.test(String(e));
}

export default function (pi: ExtensionAPI) {
	let todoOverlay: TodoOverlay | undefined;
	let uiCtx: ExtensionUIContext | undefined;
	let lifecycleGeneration = 0;

	function updateTodoOverlay(
		resetCompletedDisplayState = false,
		generation = lifecycleGeneration,
	): void {
		const hasVisibleTasks = getRenderState().tasks.some(
			(t) => t.status !== "deleted",
		);
		if (!uiCtx || (!todoOverlay && !hasVisibleTasks)) return;
		if (generation !== lifecycleGeneration || !uiCtx) return;
		todoOverlay ??= new TodoOverlay();
		todoOverlay.setUICtx(uiCtx);
		if (resetCompletedDisplayState) todoOverlay.resetCompletedDisplayState();
		todoOverlay.update();
	}

	pi.registerTool({
		name: TOOL_NAME,
		label: TOOL_LABEL,
		description: TOOL_DESCRIPTION,
		promptSnippet: PROMPT_SNIPPET,
		promptGuidelines: PROMPT_GUIDELINES,
		parameters: TodoParamsSchema,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const typed = params as TaskMutationParams & { action: TaskAction };
			const result = applyTaskMutation(slotFor(sid(ctx)), typed.action, typed);
			commitState(sid(ctx), result.state);
			return buildToolResult(typed.action, typed, result.state, result.op);
		},
		renderCall(args, theme, _context) {
			return renderTodoCall(args as never, theme, getRenderState());
		},
		renderResult(result, _opts, theme, _context) {
			return renderTodoResult(result, theme);
		},
	});

	const replayAndRefresh = async (ctx: SessionCtx): Promise<void> => {
		let isForeground = false;
		try {
			const id = sid(ctx);
			replaceState(id, replayFromBranch(ctx));
			isForeground = id === getActiveRenderSession();
		} catch (e) {
			if (!isStaleCtxError(e)) throw e;
		}
		if (isForeground) updateTodoOverlay(true);
	};

	pi.on("session_start", async (_event, ctx) => {
		let id: string;
		try {
			id = sid(ctx);
			replaceState(id, replayFromBranch(ctx));
		} catch (e) {
			if (!isStaleCtxError(e)) throw e;
			return;
		}
		if (!ctx.hasUI) return;
		if (getActiveRenderSession() === "") setActiveRenderSession(id);
		if (id !== getActiveRenderSession()) return;
		const generation = ++lifecycleGeneration;
		uiCtx = ctx.ui;
		updateTodoOverlay(true, generation);
	});

	pi.on("session_compact", async (_event, ctx) => {
		await replayAndRefresh(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		await replayAndRefresh(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		let s: string;
		try {
			s = sid(ctx);
		} catch (e) {
			if (!isStaleCtxError(e)) throw e;
			s = "";
		}
		evictSession(s);
		if (s === "" || s === getActiveRenderSession()) {
			lifecycleGeneration++;
			uiCtx = undefined;
			try {
				todoOverlay?.dispose();
			} finally {
				todoOverlay = undefined;
				clearActiveRenderSession();
			}
		}
	});

	pi.on("tool_execution_end", async (event) => {
		if (event.toolName !== TOOL_NAME || event.isError) return;
		updateTodoOverlay();
	});

	pi.on("agent_start", async () => {
		todoOverlay?.hideCompletedTasksFromPreviousTurn();
	});
}
