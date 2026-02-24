import { createInterface } from "node:readline/promises";
import type { PromptFn } from "./auth.ts";

export function createReadlinePrompt(): PromptFn {
  return async (message: string): Promise<string> => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    try {
      return await rl.question(message);
    } finally {
      rl.close();
    }
  };
}
