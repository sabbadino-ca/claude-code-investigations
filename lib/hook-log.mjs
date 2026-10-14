// Command hook for the `claude -p` experiment: appends the hook input, stamped with the wall clock, to the file
// given as argv[2]. It prints nothing and exits 0, so it never changes what Claude Code does.
import { appendFileSync } from "node:fs";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  const t_epoch = Date.now();
  try {
    appendFileSync(process.argv[2], JSON.stringify({ t_epoch, ...JSON.parse(raw) }) + "\n");
  } catch {}
  process.exit(0);
});
