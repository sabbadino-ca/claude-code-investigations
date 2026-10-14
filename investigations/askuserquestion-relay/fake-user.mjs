// PreToolUse command hook for AskUserQuestion in the `claude -p` experiment: plays the user.
// Logs the hook input (stamped with the wall clock) to argv[2], then answers every question with the option whose
// label matches argv[3] (default "French"), or the first option. This is the documented way to answer
// AskUserQuestion from a hook: permissionDecision "allow" + updatedInput with the original questions and `answers`.
import { appendFileSync } from "node:fs";

const wanted = new RegExp(process.argv[3] ?? "French", "i");
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  const input = JSON.parse(raw);
  const questions = input.tool_input?.questions ?? [];
  const answers = {};
  for (const q of questions) answers[q.question] = (q.options.find((o) => wanted.test(o.label)) ?? q.options[0]).label;
  try {
    appendFileSync(process.argv[2], JSON.stringify({ t_epoch: Date.now(), fake_user_answers: answers, ...input }) + "\n");
  } catch {}
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: { questions, answers } },
  }));
  process.exit(0);
});
