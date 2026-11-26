import type { Command } from "commander";

export interface ConflictRule {
  /** The two long flags that cannot be used together, e.g. ["--all", "--completed"]. */
  options: [string, string];
  /** Extra line printed after commander's conflict error, telling the user what to use instead. */
  hint: string;
}

function mentionsFlag(message: string, flag: string): boolean {
  // commander quotes the flag spec, e.g. "option '--to <date>'" or "option '--today'".
  return message.includes(`'${flag}'`) || message.includes(`'${flag} `);
}

/**
 * Declare pairs of options that must not be combined.
 *
 * Uses commander's `conflicts` so the combination fails at parse time with a
 * non-zero exit code, and appends the rule's hint to that error message.
 */
export function addConflictRules(cmd: Command, rules: ConflictRule[]): void {
  const findOpt = (long: string) => {
    const opt = cmd.options.find((o) => o.long === long);
    if (!opt) throw new Error(`addConflictRules: unknown option ${long} on ${cmd.name()}`);
    return opt;
  };
  for (const { options } of rules) {
    const [a, b] = options.map(findOpt) as [ReturnType<typeof findOpt>, ReturnType<typeof findOpt>];
    a.conflicts([b.attributeName()]);
    b.conflicts([a.attributeName()]);
  }
  cmd.configureOutput({
    outputError: (str, write) => {
      write(str);
      for (const { options, hint } of rules) {
        if (mentionsFlag(str, options[0]) && mentionsFlag(str, options[1])) {
          write(hint.endsWith("\n") ? hint : `${hint}\n`);
        }
      }
    },
  });
}
