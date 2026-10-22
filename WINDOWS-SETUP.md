# Windows x64 setup — HunterKit 1.12.0

Prerequisites: Windows x64, Node.js 20.18 or newer, npm, and Chrome or Edge for screenshots.

From Command Prompt in the extracted project folder:

```bat
INSTALL-TOOLS.cmd
START-HUNTERKIT.cmd
```

Equivalent diagnostic commands:

```bat
npm ci
npm run download:tools
npm run setup:templates
npm run check:tools
npm run check:attacks
npm run build
npm test
```

For the deterministic local presentation lab, open a second Command Prompt and run:

```bat
START-DEMO-LAB.cmd
```

Keep that window open, copy the exact `http://localhost:<port>/lab/` URL, create a HunterKit project with it, tick the authorization confirmation, then run Full Recon → Security Testing → Penetration Testing modules one at a time → AI Analysis.

If `check:tools` reports an incompatible `httpx.exe`, rerun `INSTALL-TOOLS.cmd`. HunterKit expects ProjectDiscovery HTTPX v1.12.0 in this project's `bin` folder and does not accept a different program from `%PATH%` as compatible.
