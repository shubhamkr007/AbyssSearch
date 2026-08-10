#!/usr/bin/env bash
# Render build hook for the demo API Gateway (free tier).
set -euo pipefail
export NODE_ENV=development
export CI=true
npx pnpm@9.15.9 install --prod=false
npx pnpm@9.15.9 --filter @enterprise-search/api-gateway build
