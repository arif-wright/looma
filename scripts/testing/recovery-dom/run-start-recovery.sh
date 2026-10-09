#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$root"
mkdir -p artifacts/start-recovery
node node_modules/vitest/vitest.mjs run   src/lib/__tests__/gameSdkSessionLifecycle.spec.ts   src/lib/__tests__/gameSdkStartRecovery.spec.ts   src/lib/__tests__/gameIntegrationStartRecovery.spec.ts   src/lib/__tests__/arpgBootStartRecovery.spec.ts   src/lib/__tests__/arpgBootSceneReadiness.spec.ts   src/lib/__tests__/arpgGameSceneReadiness.spec.ts   src/lib/__tests__/gameFullscreenStartRecovery.spec.ts   --pool=forks --poolOptions.forks.singleFork=true
for suite in neon portal start legacy; do
  report="$root/artifacts/start-recovery/$suite-dom.json"
  node scripts/testing/recovery-dom/node_modules/vitest/vitest.mjs run     --config "scripts/testing/recovery-dom/$suite.config.mjs"     --reporter=default --reporter=json --outputFile="$report"
  node scripts/testing/recovery-dom/verify-results.mjs "$suite" "$report"
done
