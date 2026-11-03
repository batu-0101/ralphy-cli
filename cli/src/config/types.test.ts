import { expect, test } from "bun:test";
import { RalphyConfigSchema } from "./types.ts";

test("missing sections retain complete nested defaults after the Zod upgrade", () => {
	expect(RalphyConfigSchema.parse({})).toEqual({
		project: { name: "", language: "", framework: "", description: "" },
		commands: { test: "", lint: "", build: "" },
		rules: [],
		boundaries: { never_touch: [] },
		notifications: { discord_webhook: "", slack_webhook: "", custom_webhook: "" },
	});
});

test("partial sections and null lists retain configured values and defaults", () => {
	const config = RalphyConfigSchema.parse({
		project: { name: "example" },
		commands: { test: "bun test" },
		rules: null,
		boundaries: { never_touch: null },
	});
	expect(config.project).toEqual({ name: "example", language: "", framework: "", description: "" });
	expect(config.commands).toEqual({ test: "bun test", lint: "", build: "" });
	expect(config.rules).toEqual([]);
	expect(config.boundaries.never_touch).toEqual([]);
});
