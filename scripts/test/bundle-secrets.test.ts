import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findSecrets, RULES, secretValues } from "../bundle/secrets.ts";

// The bundle secret check (ADR-0030): planted secrets are found, a clean bundle passes, and a
// finding never repeats the text it matched. Every planted value here is made up.

const root = join(import.meta.dirname, "..", "..");
const PLANTED = `sk_${"Zq7".repeat(9)}x`;

describe("[R09] the bundle secret check", () => {
  it("finds a key in the gateway's format, another vendor's key, a key variable's name and the gateway's host", () => {
    const files = [
      { name: "assets/a.js", text: `const k="${PLANTED}";` },
      { name: "assets/b.js", text: `fetch("x",{headers:{a:"sk-ant-${"q".repeat(30)}"}})` },
      { name: "assets/c.js", text: "process.env.VOYAGER_API_KEY" },
      { name: "assets/d.js", text: 'fetch("https://openai.rc.asu.edu/v1/chat/completions")' },
    ];
    expect(findSecrets(files).map((finding) => [finding.file, RULES.findIndex((rule) => rule.rule === finding.rule)])).toEqual([
      ["assets/a.js", 0],
      ["assets/b.js", 1],
      ["assets/c.js", 2],
      ["assets/d.js", 3],
    ]);
  });

  it("finds a value from apps/api/.env however it is written, and names the variable, never the value", () => {
    const values = secretValues(`# a comment\nVOYAGER_API_KEY=${PLANTED}\nexport OTHER_TOKEN="a-long-enough-token"\nPORT=8787\nSHORT_KEY=abc\nPAPERPLAY_CONTACT_EMAIL=o@x.io\n`);
    expect(values.map((entry) => entry.name)).toEqual(["VOYAGER_API_KEY", "OTHER_TOKEN", "PAPERPLAY_CONTACT_EMAIL"]);
    expect(findSecrets([{ name: "app.js", text: "mailto:o@x.io" }], values)).toEqual([{ file: "app.js", rule: "the value of PAPERPLAY_CONTACT_EMAIL from apps/api/.env" }]);
    const findings = findSecrets([{ name: "index.html", text: `<p>a-long-enough-token</p>` }], values);
    expect(findings).toEqual([{ file: "index.html", rule: "the value of OTHER_TOKEN from apps/api/.env" }]);
    for (const finding of findings) expect(JSON.stringify(finding)).not.toContain("a-long-enough-token");
  });

  it("passes code that merely mentions the letters sk_ or a short sk- word", () => {
    expect(findSecrets([{ name: "a.js", text: 'const task_list="sk_x"; const desk="sk-1"; const risk_level=2;' }])).toEqual([]);
  });

  it("fails the build step on a planted key, naming the file and rule but not the key", () => {
    const dist = mkdtempSync(join(tmpdir(), "paperplay-check-bundle-"));
    try {
      mkdirSync(join(dist, "assets"));
      writeFileSync(join(dist, "assets", "index-abc.js"), `export const k = "${PLANTED}";`);
      let output = "";
      let status = 0;
      try {
        execFileSync(process.execPath, [join(root, "scripts", "check-bundle.ts"), dist], { encoding: "utf8", stdio: "pipe" });
      } catch (error) {
        const failed = error as { status: number; stderr: string; stdout: string };
        status = failed.status;
        output = failed.stderr + failed.stdout;
      }
      expect(status).toBe(1);
      expect(output).toContain("assets/index-abc.js: a key in the Voyager gateway's format");
      expect(output).not.toContain(PLANTED);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});
