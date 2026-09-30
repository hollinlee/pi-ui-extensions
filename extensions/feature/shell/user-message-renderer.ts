/**
 * Custom user message renderer with ❯ prefix and no extra blank lines
 */

import { UserMessageComponent } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { PROMPT_PREFIX } from "./user-prompt.ts";

export function registerUserMessageRenderer(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    if (!ctx?.mode || ctx.mode !== "tui") return;

    // Patch UserMessageComponent to add ❯ prefix and remove blank lines
    const prototype = UserMessageComponent.prototype as any;
    const originalRender = prototype.render;

    prototype.render = function (this: any, width: number): string[] {
      const lines = originalRender.call(this, width);
      
      // Remove leading and trailing blank lines
      while (lines.length > 0 && lines[0].trim() === "") {
        lines.shift();
      }
      while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
        lines.pop();
      }

      // Add ❯ prefix to the first line
      if (lines.length > 0 && lines[0]) {
        lines[0] = PROMPT_PREFIX + lines[0];
      }

      return lines;
    };
  });
}
