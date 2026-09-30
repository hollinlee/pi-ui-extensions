import {
	UserMessageComponent,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { PROMPT_PREFIX } from "./user-prompt.ts";

const PATCHED = Symbol.for("pi-ui-extensions.user-message-width-safe.v1");
type Render = ((width: number) => string[]) & { [PATCHED]?: boolean };

export function registerUserMessageRenderer(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		const prototype = UserMessageComponent.prototype;
		const originalRender = prototype.render as Render;
		if (originalRender[PATCHED]) return;

		const render: Render = function (
			this: UserMessageComponent,
			width: number,
		): string[] {
			const safeWidth = Math.max(0, Math.floor(width));
			const prefix = truncateToWidth(PROMPT_PREFIX, safeWidth, "");
			const padding = " ".repeat(visibleWidth(prefix));
			// Reserve prefix columns before wrapping; do not mutate the renderer's cache.
			const lines = [
				...originalRender.call(
					this,
					Math.max(1, safeWidth - visibleWidth(prefix)),
				),
			];
			while (lines.length && lines[0].trim() === "") lines.shift();
			while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
			return lines.map((line, index) => {
				const decorated = (index === 0 ? prefix : padding) + line;
				return visibleWidth(decorated) <= safeWidth
					? decorated
					: truncateToWidth(decorated, safeWidth, "");
			});
		};
		render[PATCHED] = true;
		prototype.render = render;
	});
}
