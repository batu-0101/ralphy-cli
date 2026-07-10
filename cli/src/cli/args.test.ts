import { describe, expect, it } from "bun:test";
import { parseArgs } from "./args.ts";

describe("parseArgs", () => {
	it("selects Grok Build with --grok", () => {
		const parsed = parseArgs(["bun", "ralphy", "--grok", "fix the bug"]);

		expect(parsed.options.aiEngine).toBe("grok");
		expect(parsed.task).toBe("fix the bug");
	});
});
