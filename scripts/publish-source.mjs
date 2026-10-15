// Portable fallback because the Sites workflow helper is not mounted here.
// Credentials arrive through hidden stdin and remain only in process memory.
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
process.stdout.write(
  "Ready for repository credential JSON on stdin (input is hidden).\n",
);
const rl = createInterface({ input: process.stdin, terminal: false });
rl.once("line", (line) => {
  rl.close();
  let token = "";
  try {
    const c = JSON.parse(line);
    token = c.token;
    const run = (args, extra = {}) => {
      const r = spawnSync("git", args, {
        encoding: "utf8",
        env: { ...process.env, ...extra },
      });
      if (r.status !== 0)
        throw new Error((r.stderr || r.stdout).replaceAll(token, "[redacted]"));
      return r.stdout.trim();
    };
    const remotes = run(["remote"]).split("\n");
    run([
      "remote",
      remotes.includes("sites") ? "set-url" : "add",
      "sites",
      c.remote_url,
    ]);
    run(["add", "--all"]);
    if (run(["status", "--porcelain"]))
      run([
        "-c",
        "user.name=Codex",
        "-c",
        "user.email=codex@openai.com",
        "commit",
        "-m",
        "Build Pasuruan AI News TV newsroom and virtual broadcast studio",
      ]);
    const sha = run(["rev-parse", "HEAD"]);
    let auth;
    if (c.auth_mode.includes("bearer") || c.auth_mode === "http_extra_header")
      auth = "Bearer " + c.token;
    else
      auth =
        "Basic " + Buffer.from("x-access-token:" + c.token).toString("base64");
    const authEnv = {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0:
        "http." + new URL(c.remote_url).origin + "/.extraheader",
      GIT_CONFIG_VALUE_0: "Authorization: " + auth,
      GIT_TERMINAL_PROMPT: "0",
    };
    run(["push", "sites", "HEAD:refs/heads/" + c.branch], authEnv);
    console.log(
      JSON.stringify({ commit_sha: sha, branch: c.branch, pushed: true }),
    );
  } catch (e) {
    console.error(
      String(e.message).replaceAll(token || "\u0000", "[redacted]"),
    );
    process.exitCode = 1;
  }
});
