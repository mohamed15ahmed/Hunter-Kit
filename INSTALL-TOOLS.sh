#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<20 || (major===20 && minor<18)){console.error("Node.js 20.18+ is required");process.exit(1)}'
npm ci
npm run download:tools
npm run setup:templates
npm run check:tools
npm run check:attacks
