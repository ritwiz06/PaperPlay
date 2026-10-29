/**
 * The browser tests wait for a quiet machine (ADR-0059): a world's first frame has a fixed time, and
 * another app's work on this machine can take it, as three lands found on 2026-10-25. Before they
 * run, the gate waits while the load is above twice the core count, saying what is heavy and how
 * long it has waited, up to a limit, and then runs them anyway. Their timeouts never change.
 */
import { spawnSync } from "node:child_process";
import { cpus, loadavg } from "node:os";

/** How long the gate waits at most, and how often it looks again. */
export const QUIET_WAIT = Object.freeze({ limitMs: 20 * 60_000, intervalMs: 30_000 });

export interface MachineProbe {
  /** The one-minute load average. */
  load(): number;
  cores(): number;
  /** The heaviest processes, each "percent command". */
  heavy(): string[];
  sleep(ms: number): Promise<void>;
  say(line: string): void;
}

export const machineProbe: MachineProbe = {
  load: () => loadavg()[0] ?? 0,
  cores: () => cpus().length,
  heavy: () =>
    spawnSync("ps", ["-Ao", "pcpu=,command=", "-r"], { encoding: "utf8" })
      .stdout.split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3)
      .map((line) => {
        const [percent = "", ...command] = line.split(/\s+/);
        return `${percent}% ${command.join(" ").slice(0, 90)}`;
      }),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  say: (line) => console.log(line),
};

/** Waits while the machine is busy; returns how long it waited and whether it was quiet at the end. */
export async function waitForQuietMachine(what: string, probe: MachineProbe = machineProbe, wait: { readonly limitMs: number; readonly intervalMs: number } = QUIET_WAIT): Promise<{ readonly waitedMs: number; readonly quiet: boolean }> {
  const threshold = 2 * probe.cores();
  let waitedMs = 0;
  for (;;) {
    const load = probe.load();
    if (load <= threshold) {
      if (waitedMs > 0) probe.say(`check:gate: the load is ${load.toFixed(1)}, at most ${threshold}; ${what} run after waiting ${Math.round(waitedMs / 1000)} s.`);
      return { waitedMs, quiet: true };
    }
    if (waitedMs >= wait.limitMs) {
      probe.say(`check:gate: the load is still ${load.toFixed(1)} after ${Math.round(waitedMs / 60_000)} min, the most it waits; ${what} run now, their timeouts unchanged.`);
      return { waitedMs, quiet: false };
    }
    probe.say(`check:gate: the machine's load is ${load.toFixed(1)}, above ${threshold} (twice its ${probe.cores()} cores); ${what} wait, ${Math.round(waitedMs / 1000)} s so far of at most ${Math.round(wait.limitMs / 60_000)} min. Heaviest: ${probe.heavy().join("; ")}`);
    await probe.sleep(wait.intervalMs);
    waitedMs += wait.intervalMs;
  }
}
