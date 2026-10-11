#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$root"
node_bin="${NODE_BIN:-node}"
artifacts="$root/artifacts/start-recovery"
mkdir -p "$artifacts"
"$node_bin" --version | tee "$artifacts/node-version.txt"
"$node_bin" --test scripts/testing/recovery-dom/verify-start-recovery-results.test.mjs \
  2>&1 | tee "$artifacts/verifier-tests.log"
"$node_bin" node_modules/vitest/vitest.mjs run \
  src/lib/__tests__/gameSdkSessionLifecycle.spec.ts \
  src/lib/__tests__/gameSdkStartRecovery.spec.ts \
  src/lib/__tests__/gameIntegrationStartRecovery.spec.ts \
  src/lib/__tests__/arpgBootStartRecovery.spec.ts \
  src/lib/__tests__/arpgBootSceneReadiness.spec.ts \
  src/lib/__tests__/arpgGameSceneReadiness.spec.ts \
  src/lib/__tests__/arpgExpedition.spec.ts \
  src/lib/__tests__/arpgExpeditionScene.spec.ts \
  src/lib/__tests__/arpgTownCorner.spec.ts \
  src/lib/__tests__/arpgTownSurface.spec.ts \
  src/lib/__tests__/arpgTownPlaza.spec.ts \
  src/lib/__tests__/arpgViewportLayout.spec.ts \
  src/lib/__tests__/arpgTownSession.spec.ts \
  src/lib/__tests__/gameFullscreenStartRecovery.spec.ts \
  --pool=forks --poolOptions.forks.singleFork=true --retry=0 --allowOnly=false \
  --reporter=default --reporter=json --outputFile="$artifacts/unit.json" \
  2>&1 | tee "$artifacts/unit.log"
"$node_bin" scripts/testing/recovery-dom/verify-start-recovery-results.mjs unit "$artifacts/unit.json"
for suite in neon portal start legacy arpg-town; do
  report="$artifacts/$suite-dom.json"
  # Use the fixture's installed Vitest so happy-dom/jsdom resolve from its lock.
  "$node_bin" scripts/testing/recovery-dom/node_modules/vitest/vitest.mjs run \
    --config "scripts/testing/recovery-dom/$suite.config.mjs" \
    --retry=0 --allowOnly=false --reporter=default --reporter=json --outputFile="$report" \
    2>&1 | tee "$artifacts/$suite-dom.log"
  "$node_bin" scripts/testing/recovery-dom/verify-results.mjs "$suite" "$report"
  "$node_bin" scripts/testing/recovery-dom/verify-start-recovery-results.mjs "$suite" "$report"
done
printf '%s\n' 'Verified 331 focused unit cases + 130 component-DOM cases; no skipped tests or retries. Browser execution is a separate gate.'
