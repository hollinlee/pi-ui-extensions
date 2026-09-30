import {
	DynamicBorder,
	InteractiveMode,
	UserMessageComponent,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import {
	Spacer,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import { PROMPT_PADDING_X, PROMPT_PREFIX } from "./user-prompt.ts";

const PATCHED = Symbol.for("pi-ui-extensions.user-message-transcript.v1");
type Render = ((width: number) => string[]) & { [PATCHED]?: boolean };
type AddMessage = (this: any, message: any, options?: any) => void;
const OSC = /\x1b\][^\x07]*(?:\x07|\x1b\\)/g;
const CSI = /\x1b\[[0-?]*[ -/]*[@-~]/g;

function stripBackground(line: string): string {
	return line.replace(/\x1b\[([0-9;]*)m/g, (sequence, raw: string) => {
		const codes = raw.split(";").map(Number);
		for (let i = 0; i < codes.length; i++) {
			if (codes[i] === 48) {
				if (codes[i + 1] === 5) i++;
				else if (codes[i + 1] === 2) i += 3;
				codes.splice(i, 1);
			}
		}
		const kept = codes.filter((code) => code !== 49);
		return kept.length ? `\x1b[${kept.join(";")}m` : "";
	});
}

function isBlank(line: string): boolean {
	return line.replace(OSC, "").replace(CSI, "").trim().length === 0;
}

function removeLeftPadding(line: string): string {
	let index = 0;
	while (index < line.length) {
		const rest = line.slice(index);
		const control = rest.match(/^(?:\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\))/);
		if (control) index += control[0].length;
		else if (line[index] === " ") return line.slice(0, index) + line.slice(index + 1);
		else return line;
	}
	return line;
}

function renderBorder(width: number): string {
	return new DynamicBorder().render(width)[0] ?? "";
}

function renderTranscriptLine(line: string, index: number, width: number): string {
	const content = stripBackground(index === 0 ? line : removeLeftPadding(line));
	const prefix = index === 0 ? PROMPT_PREFIX : " ".repeat(PROMPT_PADDING_X);
	const decorated = prefix + content;
	return visibleWidth(decorated) <= width
		? decorated
		: truncateToWidth(decorated, width, "");
}

export function registerUserMessageRenderer(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		const prototype = UserMessageComponent.prototype;
		const originalRender = prototype.render as Render;
		if (!originalRender[PATCHED]) {
			const render: Render = function (
				this: UserMessageComponent,
				width: number,
			): string[] {
				const safeWidth = Math.max(0, Math.floor(width));
				if (safeWidth === 0) return [];
				const prefixWidth = Math.min(PROMPT_PADDING_X, safeWidth);
				const lines = [...originalRender.call(this, Math.max(1, safeWidth - prefixWidth))];
				while (lines.length && isBlank(lines[0])) lines.shift();
				while (lines.length && isBlank(lines.at(-1) ?? "")) lines.pop();
				const content = lines.map((line, index) => renderTranscriptLine(line, index, safeWidth));
				return [renderBorder(safeWidth), ...content, renderBorder(safeWidth)];
			};
			render[PATCHED] = true;
			prototype.render = render;
		}

		const addMessage = (InteractiveMode.prototype as any).addMessageToChat as AddMessage & { [PATCHED]?: boolean };
		if (addMessage[PATCHED]) return;
		const wrapped = function (this: InteractiveMode, message: Parameters<AddMessage>[0], options?: Parameters<AddMessage>[1]) {
			if (message.role !== "user") return addMessage.call(this, message, options);
			const container = (this as any).chatContainer;
			const originalAdd = container.addChild as (child: any) => any;
			let pendingSpacer: Spacer | undefined;
			container.addChild = function (child: any) {
				if (child instanceof Spacer) {
					if (pendingSpacer) originalAdd.call(this, pendingSpacer);
					pendingSpacer = child;
					return this;
				}
				if (child instanceof UserMessageComponent) pendingSpacer = undefined;
				else if (pendingSpacer) {
					originalAdd.call(this, pendingSpacer);
					pendingSpacer = undefined;
				}
				return originalAdd.call(this, child);
			};
			try {
				addMessage.call(this, message, options);
			} finally {
				container.addChild = originalAdd;
				if (pendingSpacer) originalAdd.call(container, pendingSpacer);
			}
		};
		wrapped[PATCHED] = true;
		(InteractiveMode.prototype as any).addMessageToChat = wrapped;
	});
}
