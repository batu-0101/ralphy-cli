import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as baseModule from "./base.ts";
import { GrokEngine, parseGrokOutput } from "./grok.ts";

describe("parseGrokOutput", () => {
	it("parses a final result and token usage", () => {
		const output = [
			'{"type":"assistant","message":{"content":[{"type":"text","text":"Working"}]}}',
			'{"type":"result","result":"Done","usage":{"input_tokens":42,"output_tokens":7}}',
		].join("\n");

		expect(parseGrokOutput(output)).toEqual({
			response: "Done",
			inputTokens: 42,
			outputTokens: 7,
		});
	});

	it("joins streaming text deltas and ignores diagnostics", () => {
		const output = [
			"debug: connecting",
			'{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}',
			'{"type":"content_block_delta","delta":{"type":"text_delta","text":"world"}}',
		].join("\n");

		expect(parseGrokOutput(output).response).toBe("Hello world");
	});

	it("parses Grok Build 0.2.93 text events without exposing thought deltas", () => {
		const output = [
			'{"type":"thought","data":"Internal reasoning"}',
			'{"type":"text","data":"GROK_"}',
			'{"type":"text","data":"SCHEMA_OK"}',
			'{"type":"end","stopReason":"EndTurn"}',
		].join("\n");

		expect(parseGrokOutput(output).response).toBe("GROK_SCHEMA_OK");
	});
});

describe("GrokEngine", () => {
	let engine: GrokEngine;
	const testWorkDir = join(tmpdir(), "ralphy-grok-test");

	beforeEach(() => {
		engine = new GrokEngine();
		mkdirSync(testWorkDir, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(testWorkDir)) rmSync(testWorkDir, { recursive: true, force: true });
	});

	it("uses Grok 0.2.93 headless flags and a UTF-8 prompt file", async () => {
		let capturedCommand = "";
		let capturedArgs: string[] = [];
		let capturedPromptPath = "";
		let capturedPrompt = "";
		let capturedPromptMode = 0;
		const spy = spyOn(baseModule, "execCommand").mockImplementation(
			async (command: string, args: string[]) => {
				capturedCommand = command;
				capturedArgs = args;
				const promptIndex = args.indexOf("--prompt-file");
				capturedPromptPath = args[promptIndex + 1];
				capturedPrompt = readFileSync(capturedPromptPath, "utf-8");
				capturedPromptMode = statSync(capturedPromptPath).mode & 0o777;
				return {
					stdout: '{"type":"result","result":"Done"}\n',
					stderr: "",
					exitCode: 0,
				};
			},
		);

		const result = await engine.execute("Fix café ☕", testWorkDir);
		spy.mockRestore();

		expect(capturedCommand).toBe("grok");
		for (const value of [
			"--output-format",
			"streaming-json",
			"--permission-mode",
			"bypassPermissions",
			"--prompt-file",
		]) {
			expect(capturedArgs).toContain(value);
		}
		expect(capturedPrompt).toBe("Fix café ☕");
		expect(existsSync(capturedPromptPath)).toBe(false);
		expect(existsSync(dirname(capturedPromptPath))).toBe(false);
		if (process.platform !== "win32") expect(capturedPromptMode).toBe(0o600);
		expect(result.success).toBe(true);
	});

	it("removes the private prompt directory when execution throws", async () => {
		let capturedPromptPath = "";
		const spy = spyOn(baseModule, "execCommand").mockImplementation(
			async (_command: string, args: string[]) => {
				capturedPromptPath = args[args.indexOf("--prompt-file") + 1];
				throw new Error("spawn failed");
			},
		);

		await expect(engine.execute("secret prompt", testWorkDir)).rejects.toThrow("spawn failed");
		spy.mockRestore();
		expect(existsSync(dirname(capturedPromptPath))).toBe(false);
	});

	it("passes model overrides and engine-specific arguments", async () => {
		let capturedArgs: string[] = [];
		const spy = spyOn(baseModule, "execCommand").mockImplementation(
			async (_command: string, args: string[]) => {
				capturedArgs = args;
				return {
					stdout: '{"type":"result","result":"Done"}\n',
					stderr: "",
					exitCode: 0,
				};
			},
		);

		await engine.execute("test", testWorkDir, {
			modelOverride: "grok-code-fast-1",
			engineArgs: ["--check", "--no-plan"],
		});
		spy.mockRestore();

		for (const value of ["--model", "grok-code-fast-1", "--check", "--no-plan"]) {
			expect(capturedArgs).toContain(value);
		}
	});

	it("reports JSON and process failures", async () => {
		const jsonErrorSpy = spyOn(baseModule, "execCommand").mockResolvedValue({
			stdout: '{"type":"error","error":{"message":"Authentication required"}}\n',
			stderr: "",
			exitCode: 1,
		});
		const jsonError = await engine.execute("test", testWorkDir);
		jsonErrorSpy.mockRestore();

		expect(jsonError.success).toBe(false);
		expect(jsonError.error).toBe("Authentication required");

		const processErrorSpy = spyOn(baseModule, "execCommand").mockResolvedValue({
			stdout: "",
			stderr: "connection failed",
			exitCode: 2,
		});
		const processError = await engine.execute("test", testWorkDir);
		processErrorSpy.mockRestore();

		expect(processError.success).toBe(false);
		expect(processError.error).toContain("exit code 2");
		expect(processError.error).toContain("connection failed");
	});

	it("streams progress and returns the final result", async () => {
		const spy = spyOn(baseModule, "execCommandStreaming").mockImplementation(
			async (
				_command: string,
				_args: string[],
				_workDir: string,
				onLine: (line: string) => void,
			) => {
				onLine('{"type":"tool","name":"write","path":"src/app.ts"}');
				onLine('{"type":"result","result":"Implemented"}');
				return { exitCode: 0 };
			},
		);
		const steps: string[] = [];

		const result = await engine.executeStreaming("test", testWorkDir, (step) => steps.push(step));
		spy.mockRestore();

		expect(steps).toContain("Implementing");
		expect(result.success).toBe(true);
		expect(result.response).toBe("Implemented");
	});
});
