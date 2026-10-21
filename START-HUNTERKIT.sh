#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<20 || (major===20 && minor<18)){console.error("Node.js 20.18+ is required");process.exit(1)}'
if [[ ! -d node_modules ]]; then npm ci; fi
if [[ ! -f .env ]]; then cp .env.example .env; fi
npm run dev
