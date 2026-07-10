import { randomUUID } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	BaseAIEngine,
	checkForErrors,
	detectStepFromOutput,
	execCommand,
	execCommandStreaming,
	formatCommandError,
} from "./base.ts";
import type { AIResult, EngineOptions, ProgressCallback } from "./types.ts";

const TEMP_PREFIX = join(tmpdir(), "ralphy-grok-");

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function extractText(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(extractText).join("");

	const record = asRecord(value);
	if (!record) return "";

	for (const key of ["text", "output_text", "content", "message"]) {
		const text = extractText(record[key]);
		if (text) return text;
	}

	return "";
}

function readUsage(parsed: Record<string, unknown>): {
	inputTokens?: number;
	outputTokens?: number;
} {
	const usage = asRecord(parsed.usage) ?? asRecord(asRecord(parsed.metrics)?.usage);
	if (!usage) return {};

	const inputTokens = usage.input_tokens ?? usage.inputTokens;
	const outputTokens = usage.output_tokens ?? usage.outputTokens;

	return {
		inputTokens: typeof inputTokens === "number" ? inputTokens : undefined,
		outputTokens: typeof outputTokens === "number" ? outputTokens : undefined,
	};
}

/** Parse Grok Build's newline-delimited `streaming-json` output. */
export function parseGrokOutput(output: string): {
	response: string;
	inputTokens: number;
	outputTokens: number;
} {
	const responseParts: string[] = [];
	let finalResponse = "";
	let inputTokens = 0;
	let outputTokens = 0;

	for (const line of output.split("\n")) {
		if (!line.trim()) continue;

		try {
			const parsed = asRecord(JSON.parse(line));
			if (!parsed) continue;

			const usage = readUsage(parsed);
			if (usage.inputTokens !== undefined) inputTokens = usage.inputTokens;
			if (usage.outputTokens !== undefined) outputTokens = usage.outputTokens;

			const type = typeof parsed.type === "string" ? parsed.type : "";
			// Grok Build 0.2.93 emits response deltas as
			// {"type":"text","data":"..."}, followed by an "end" event.
			// Thought deltas use the same data field and must not leak into the
			// user-visible result.
			if (type === "text") {
				const text = extractText(parsed.data);
				if (text) responseParts.push(text);
				continue;
			}
			if (type === "result" || type === "final" || parsed.done === true) {
				finalResponse =
					extractText(parsed.result) ||
					extractText(parsed.response) ||
					extractText(parsed.message) ||
					extractText(parsed.content) ||
					finalResponse;
				continue;
			}

			if (
				type === "assistant" ||
				type === "message" ||
				type === "assistant_message" ||
				type === "content_block_delta" ||
				type === "message_delta"
			) {
				const text =
					extractText(parsed.message) ||
					extractText(parsed.content) ||
					extractText(parsed.delta) ||
					extractText(parsed.text);
				if (text) responseParts.push(text);
			}
		} catch {
			// Ignore non-JSON diagnostic lines.
		}
	}

	return {
		response: finalResponse.trim() || responseParts.join("").trim() || "Task completed",
		inputTokens,
		outputTokens,
	};
}

/** Grok Build AI engine (tested against Grok 0.2.93). */
export class GrokEngine extends BaseAIEngine {
	name = "Grok Build";
	cliCommand = "grok";

	private createPromptFile(prompt: string): string {
		const dir = mkdtempSync(TEMP_PREFIX);
		try {
			chmodSync(dir, 0o700);
			const path = join(dir, `prompt-${randomUUID()}.md`);
			writeFileSync(path, prompt, { encoding: "utf-8", mode: 0o600 });
			return path;
		} catch (error) {
			try {
				rmSync(dir, { recursive: true, force: true });
			} catch {
				// Preserve the prompt-creation error even if cleanup also fails.
			}
			throw error;
		}
	}

	private cleanupPromptFile(path: string): void {
		try {
			rmSync(dirname(path), { recursive: true, force: true });
		} catch {
			// A failed best-effort cleanup must not hide the engine result.
		}
	}

	private buildArgs(promptFile: string, options?: EngineOptions): string[] {
		const args = ["--output-format", "streaming-json", "--permission-mode", "bypassPermissions"];

		if (options?.modelOverride) args.push("--model", options.modelOverride);
		if (options?.engineArgs?.length) args.push(...options.engineArgs);
		args.push("--prompt-file", promptFile);
		return args;
	}

	async execute(prompt: string, workDir: string, options?: EngineOptions): Promise<AIResult> {
		const promptFile = this.createPromptFile(prompt);

		try {
			const { stdout, stderr, exitCode } = await execCommand(
				this.cliCommand,
				this.buildArgs(promptFile, options),
				workDir,
			);
			const output = stdout + stderr;
			const parsed = parseGrokOutput(output);
			const error = checkForErrors(output);

			if (error) {
				return { success: false, ...parsed, error };
			}

			if (exitCode !== 0) {
				return {
					success: false,
					...parsed,
					error: formatCommandError(exitCode, output),
				};
			}

			return { success: true, ...parsed };
		} finally {
			this.cleanupPromptFile(promptFile);
		}
	}

	async executeStreaming(
		prompt: string,
		workDir: string,
		onProgress: ProgressCallback,
		options?: EngineOptions,
	): Promise<AIResult> {
		const promptFile = this.createPromptFile(prompt);
		const outputLines: string[] = [];

		try {
			const { exitCode } = await execCommandStreaming(
				this.cliCommand,
				this.buildArgs(promptFile, options),
				workDir,
				(line) => {
					outputLines.push(line);
					const step = detectStepFromOutput(line);
					if (step) onProgress(step);
				},
			);

			const output = outputLines.join("\n");
			const parsed = parseGrokOutput(output);
			const error = checkForErrors(output);

			if (error) {
				return { success: false, ...parsed, error };
			}

			if (exitCode !== 0) {
				return {
					success: false,
					...parsed,
					error: formatCommandError(exitCode, output),
				};
			}

			return { success: true, ...parsed };
		} finally {
			this.cleanupPromptFile(promptFile);
		}
	}
}
