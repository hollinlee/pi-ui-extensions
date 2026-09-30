import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import {
	UserMessageComponent,
	initTheme,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { registerUserMessageRenderer } from "../../extensions/feature/shell/user-message-renderer.ts";

initTheme();

function start(mode = "tui") {
	let handler: ((event: unknown, ctx: unknown) => unknown) | undefined;
	registerUserMessageRenderer({
		on(event: string, fn: typeof handler) {
			assert.equal(event, "session_start");
			handler = fn;
		},
	} as unknown as ExtensionAPI);
	assert.ok(handler);
	handler({}, { mode });
}

function withRender(
	render: ((width: number) => string[]) | null,
	run: () => void,
) {
	const saved = UserMessageComponent.prototype.render;
	try {
		if (render) UserMessageComponent.prototype.render = render;
		start();
		run();
	} finally {
		UserMessageComponent.prototype.render = saved;
	}
}

test("reserves prompt columns and does not mutate cached ANSI/OSC lines", () => {
	let cache: string[] = [];
	let passedWidth = 0;
	withRender(
		function (width) {
			passedWidth = width;
			cache = [
				"\x1b]133;A\x07\x1b[48;2;33;59;73m" + " ".repeat(width) + "\x1b[49m",
				"x".repeat(width),
			];
			return cache;
		},
		() => {
			for (const width of [117, 141]) {
				const lines = UserMessageComponent.prototype.render.call({}, width);
				assert.equal(passedWidth, width - 3);
				assert.deepEqual(lines.map(visibleWidth), [width, width, width]);
				assert.ok(lines[0].includes("─"));
				assert.ok(lines[1].startsWith(" ❯ "));
				assert.ok(cache[0].startsWith("\x1b]133;A\x07"));
				assert.ok(!lines[0].includes("\x1b]133;A\x07"));
			}
			const patched = UserMessageComponent.prototype.render;
			start();
			start();
			assert.equal(UserMessageComponent.prototype.render, patched);
		},
	);
});

test("fits oversized wide text even at zero and narrow widths", () => {
	withRender(
		() => ["\x1b[31m中文中文中文\x1b[0m", "overflow"],
		() => {
			for (let width = 0; width <= 20; width++) {
				const lines = UserMessageComponent.prototype.render.call({}, width);
				assert.ok(
					lines.every((line) => visibleWidth(line) <= width),
					`width=${width}`,
				);
			}
		},
	);
});

test("real user messages preserve content across resize and repeated renders", () => {
	withRender(null, () => {
		for (const text of [
			"abcdefghijklmnopqrstuvwxyz".repeat(12),
			"这个问题能解决吗？".repeat(24),
			"first line\n\nlast line",
		]) {
			const component = new UserMessageComponent(text);
			for (const width of [117, 141, 40, 20, 117]) {
				const lines = component.render(width);
				assert.ok(
					lines.every((line) => visibleWidth(line) <= width),
					`width=${width}`,
				);
				const normalized = lines
					.slice(1, -1)
					.map(stripVTControlCharacters)
					.join("")
					.replace(/\s|❯/g, "");
				assert.ok(lines[0].includes("─"));
				assert.ok(lines.at(-1)?.includes("─"));
				assert.ok(lines.slice(1, -1).every((line, index) => index === 0 ? line.includes(" ❯ ") : !line.includes("❯")));
				assert.ok(lines.slice(1, -1).every((line) => !line.includes("\x1b[48;")));
				assert.equal(normalized, text.replace(/\s/g, ""));
				assert.deepEqual(component.render(width), lines);
			}
		}
	});
});

test("non-TUI sessions leave the renderer unchanged", () => {
	const saved = UserMessageComponent.prototype.render;
	start("print");
	start("rpc");
	assert.equal(UserMessageComponent.prototype.render, saved);
});
