import { describe, expect, it, spyOn } from "bun:test";
import * as baseModule from "./base.ts";
import { CursorEngine, isGrokAgentVersion } from "./cursor.ts";

describe("CursorEngine availability", () => {
	it("recognizes Grok's agent.exe version output", () => {
		expect(isGrokAgentVersion("grok 0.2.93 (f00f96316d) [stable]")).toBe(true);
		expect(isGrokAgentVersion("Grok Build 0.2.93")).toBe(true);
		expect(isGrokAgentVersion("Cursor Agent 2026.07")).toBe(false);
	});

	it("does not mistake Grok's agent.exe for Cursor Agent", async () => {
		const commandSpy = spyOn(baseModule, "commandExists").mockResolvedValue(true);
		const versionSpy = spyOn(baseModule, "execCommand").mockResolvedValue({
			stdout: "grok 0.2.93 (f00f96316d) [stable]\n",
			stderr: "",
			exitCode: 0,
		});

		const available = await new CursorEngine().isAvailable();
		commandSpy.mockRestore();
		versionSpy.mockRestore();

		expect(available).toBe(false);
	});

	it("accepts Cursor and preserves compatibility when version probing fails", async () => {
		const commandSpy = spyOn(baseModule, "commandExists").mockResolvedValue(true);
		const cursorVersionSpy = spyOn(baseModule, "execCommand").mockResolvedValue({
			stdout: "Cursor Agent 2026.07\n",
			stderr: "",
			exitCode: 0,
		});
		expect(await new CursorEngine().isAvailable()).toBe(true);
		cursorVersionSpy.mockRestore();

		const failedVersionSpy = spyOn(baseModule, "execCommand").mockResolvedValue({
			stdout: "",
			stderr: "unknown option",
			exitCode: 1,
		});
		expect(await new CursorEngine().isAvailable()).toBe(true);
		failedVersionSpy.mockRestore();
		commandSpy.mockRestore();
	});
});
