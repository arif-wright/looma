#!/usr/bin/env bash
# Preparation checks only. This script NEVER launches a browser.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"
NODE_BIN="${NODE_BIN:-node}"
FIXTURE="scripts/testing/start-recovery-preview"
mkdir -p "$FIXTURE/.results"
"$NODE_BIN" -e 'if (Number(process.versions.node.split(".")[0]) !== 22) throw new Error("Use the approved Node 22 runtime for this fixture."); console.log(process.version)' | tee "$FIXTURE/.results/node-version.log"
"$NODE_BIN" node_modules/svelte-check/bin/svelte-check --tsconfig "$FIXTURE/tsconfig.json" 2>&1 | tee "$FIXTURE/.results/svelte-check.log"
"$NODE_BIN" node_modules/typescript/bin/tsc --noEmit -p "$FIXTURE/tsconfig.json" 2>&1 | tee "$FIXTURE/.results/typescript.log"
"$NODE_BIN" --test "$FIXTURE/controls.test.mjs" 2>&1 | tee "$FIXTURE/.results/controls.log"
"$NODE_BIN" node_modules/vite/bin/vite.js build --config "$FIXTURE/vite.config.mjs" 2>&1 | tee "$FIXTURE/.results/build.log"
"$NODE_BIN" node_modules/@playwright/test/cli.js test --config "$FIXTURE/playwright.config.ts" --list 2>&1 | tee "$FIXTURE/.results/discovery.log"
grep -Fx 'Total: 42 tests in 1 file' "$FIXTURE/.results/discovery.log"
echo 'Preparation checks complete. Browser execution remains a separate, unrun gate.'
