#!/usr/bin/env bash
# T-1704 · Verify the RC builds green from a clean checkout.
#
# Runs the full gate sequence in a throwaway `git worktree` of a given ref (default: the
# current HEAD), exactly as CI + a fresh clone would. Proves `npm ci` from lockfile, the
# typecheck, lint, format, unit tests, and the workspace build all pass with no local
# state. The worktree is created under the system temp dir and removed on exit — nothing
# is committed.
#
# Usage:  scripts/verify-clean-clone.sh [git-ref]
# Example: scripts/verify-clean-clone.sh v1.0.0-rc1
set -euo pipefail

REF="${1:-HEAD}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
WORKTREE="$(mktemp -d "${TMPDIR:-/tmp}/sq-clean-clone.XXXXXX")"

cleanup() {
  cd "$REPO_ROOT"
  git worktree remove --force "$WORKTREE" 2>/dev/null || rm -rf "$WORKTREE"
}
trap cleanup EXIT

echo "==> Clean-clone verify of ref '$REF' in $WORKTREE"
git -C "$REPO_ROOT" worktree add --detach "$WORKTREE" "$REF"

cd "$WORKTREE"
echo "==> npm ci"           && npm ci
echo "==> npx tsc -b"       && npx tsc -b
echo "==> npm run lint"     && npm run lint
echo "==> npm run format:check" && npm run format:check
echo "==> npm test"         && npm test
echo "==> npm run build"    && npm run build

echo "==> Optional unsigned desktop package (--dir)"
CSC_IDENTITY_AUTO_DISCOVERY=false npm run package:dir -w @spacerquest/desktop

echo "==> Clean-clone verify PASSED for ref '$REF'"
