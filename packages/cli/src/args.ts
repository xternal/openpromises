/** Command-line arguments: positional words, `--flag value`, `--flag=value` and boolean `--flag`. */
export interface Args {
  positional: string[];
  flags: Record<string, string | true>;
}

export class UsageError extends Error {
  override name = "UsageError";
}

/**
 * Parse arguments. `booleans` names the flags that take no value; every other
 * flag needs one. A flag given twice keeps its last value.
 */
export function parseArgs(argv: readonly string[], booleans: readonly string[] = []): Args {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (!a.startsWith("--") || a === "--") {
      positional.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    const name = a.slice(2, eq > 0 ? eq : undefined);
    if (!name) throw new UsageError(`"${a}" is not a flag`);
    if (eq > 0) flags[name] = a.slice(eq + 1);
    else if (booleans.includes(name)) flags[name] = true;
    else {
      const value = argv[i + 1];
      if (value === undefined || (value.startsWith("--") && value.length > 2)) throw new UsageError(`--${name} needs a value`);
      flags[name] = value;
      i++;
    }
  }
  return { positional, flags };
}

/** A flag's text value, or undefined. A boolean flag where text is expected is a usage error. */
export function text(args: Args, name: string): string | undefined {
  const v = args.flags[name];
  if (v === true) throw new UsageError(`--${name} needs a value`);
  return v;
}

/** Refuse flags a command does not know, so a misspelt flag is never silently ignored. */
export function onlyFlags(args: Args, allowed: readonly string[], command: string): void {
  for (const name of Object.keys(args.flags)) {
    const ok = allowed.includes(name) || allowed.some((a) => a.endsWith(".*") && name.startsWith(a.slice(0, -1)));
    if (!ok) throw new UsageError(`${command} has no --${name} option (see: openpromises help ${command})`);
  }
}
