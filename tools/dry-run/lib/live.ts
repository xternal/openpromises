import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Read-only GET requests to the live site, the way any reader's browser
 * makes them: four at a time, named in the user agent, retried politely on
 * 429 and 5xx. Every answer is kept on disk, so DRY_RUN_OFFLINE=1 repeats a
 * run against exactly what was fetched last time.
 */

export interface Fetched {
  url: string;
  status: number;
  type: string;
  body: string;
  /** When it was fetched, ISO 8601. */
  at: string;
}

export const USER_AGENT = "OpenPromises dry run (read-only, https://github.com/xternal/openpromises/tree/main/tools/dry-run)";

export class Live {
  private running = 0;
  private waiting: (() => void)[] = [];
  private seen = new Map<string, Promise<Fetched>>();

  constructor(
    readonly base: string,
    private readonly cacheDir: string,
    private readonly offline: boolean,
  ) {
    mkdirSync(cacheDir, { recursive: true });
  }

  url(path: string): string {
    return new URL(path, this.base).href;
  }

  /** The page at a path on the site (or a full URL on it). */
  get(path: string): Promise<Fetched> {
    const url = this.url(path);
    if (!url.startsWith(new URL(this.base).origin + "/")) throw new Error(`${url} is not on ${this.base}; the dry run only reads the site it checks`);
    let p = this.seen.get(url);
    if (!p) {
      p = this.load(url);
      this.seen.set(url, p);
    }
    return p;
  }

  /** How many pages this run asked for. */
  get count(): number {
    return this.seen.size;
  }

  private async load(url: string): Promise<Fetched> {
    const file = join(this.cacheDir, `${createHash("sha256").update(url).digest("hex").slice(0, 40)}.json`);
    if (this.offline) {
      if (!existsSync(file)) throw new Error(`${url} was not fetched by an earlier run; run once without DRY_RUN_OFFLINE`);
      return JSON.parse(readFileSync(file, "utf8")) as Fetched;
    }
    const got = await this.limited(() => fetchPolitely(url));
    writeFileSync(file, JSON.stringify(got));
    return got;
  }

  private async limited<T>(job: () => Promise<T>): Promise<T> {
    if (this.running >= 4) await new Promise<void>((go) => this.waiting.push(go));
    this.running++;
    try {
      return await job();
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }
}

async function fetchPolitely(url: string): Promise<Fetched> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "*/*" }, redirect: "follow" });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const wait = Number(res.headers.get("retry-after")) || 2 ** attempt * 2;
      await new Promise((r) => setTimeout(r, Math.min(wait, 30) * 1000));
      continue;
    }
    return { url, status: res.status, type: res.headers.get("content-type") ?? "", body: await res.text(), at: new Date().toISOString() };
  }
}
