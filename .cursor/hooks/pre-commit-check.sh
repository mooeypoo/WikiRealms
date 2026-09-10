#!/usr/bin/env bash
# Gate git commits on the same checks CI runs (npm test + npm run build).
# Cursor beforeShellExecution hook — see .cursor/hooks.json.
set -euo pipefail

input=$(cat)
command=$(printf '%s' "$input" | node -e '
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try {
      const data = JSON.parse(raw || "{}");
      process.stdout.write(String(data.command ?? ""));
    } catch {
      process.stdout.write("");
    }
  });
')

# Only gate commits. Allow everything else (including npm run check itself).
if ! [[ "$command" =~ (^|[[:space:]])git[[:space:]]+commit([[:space:]]|$) ]]; then
  printf '%s\n' '{ "permission": "allow" }'
  exit 0
fi

# Escape hatch for emergencies: SKIP_CHECKS=1 git commit ...
if [[ "$command" == *"SKIP_CHECKS=1"* ]] || [[ "${SKIP_CHECKS:-}" == "1" ]]; then
  printf '%s\n' '{
    "permission": "allow",
    "agent_message": "SKIP_CHECKS=1 set — committing without npm run check."
  }'
  exit 0
fi

root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$root"

if ! npm run check; then
  printf '%s\n' '{
    "permission": "deny",
    "user_message": "Pre-commit checks failed (npm run check). Fix tests/build before committing.",
    "agent_message": "Blocked git commit: npm run check failed. Fix failures, then commit again. To bypass once, set SKIP_CHECKS=1 (not for production fixes)."
  }'
  exit 0
fi

printf '%s\n' '{
  "permission": "allow",
  "agent_message": "Pre-commit checks passed (npm test && npm run build)."
}'
exit 0
