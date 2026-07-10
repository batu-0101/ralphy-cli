import { describe, expect, it } from "bun:test";
import type { AIEngine } from "../engines/types.ts";
import type { Task, TaskSource } from "../tasks/types.ts";
import { runSequential } from "./sequential.ts";

describe("runSequential dry run", () => {
	it("previews every task once without executing or mutating the source", async () => {
		const tasks: Task[] = [
			{ id: "one", title: "First", completed: false },
			{ id: "two", title: "Second", completed: false },
		];
		let executeCalls = 0;
		let markCompleteCalls = 0;
		const engine: AIEngine = {
			name: "test",
			cliCommand: "test",
			async isAvailable() {
				return true;
			},
			async execute() {
				executeCalls++;
				return { success: true, response: "", inputTokens: 0, outputTokens: 0 };
			},
		};
		const taskSource: TaskSource = {
			type: "markdown",
			async getAllTasks() {
				return tasks;
			},
			async getNextTask() {
				return tasks[0];
			},
			async markComplete() {
				markCompleteCalls++;
			},
			async countRemaining() {
				return tasks.length;
			},
			async countCompleted() {
				return 0;
			},
		};

		const result = await runSequential({
			engine,
			taskSource,
			workDir: process.cwd(),
			skipTests: false,
			skipLint: false,
			dryRun: true,
			maxIterations: 0,
			maxRetries: 0,
			retryDelay: 0,
			branchPerTask: true,
			baseBranch: "main",
			createPr: false,
			draftPr: false,
			autoCommit: false,
			browserEnabled: "false",
		});

		expect(executeCalls).toBe(0);
		expect(markCompleteCalls).toBe(0);
		expect(result.tasksCompleted).toBe(0);
		expect(result.tasksFailed).toBe(0);
	});
});
