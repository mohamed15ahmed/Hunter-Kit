# Test report — HunterKit 1.12.0

The authoritative command output is stored in `validation/`. The release is accepted only when all of these commands return exit code 0:

```text
npm ci
npm run check:tools
npm run check:attacks
npm test
npm run test:integration
npm run build
npm audit --audit-level=low
```

Coverage includes real Nuclei, Dalfox, HTTPX and JSLeak processes; a loopback-only authorized lab; API and production React UI; Security Testing evidence; Penetration Testing findings/no-findings/skips/timeouts; Intelligent Analysis evidence boundaries; tool-name/version compatibility; and authorization rejection.

Final recorded results on 22 October 2026:

- `npm ci`: PASS, 325 packages installed from the lockfile.
- `npm run check:tools`: PASS, six expected CLIs started and matched compatibility signatures.
- `npm run check:attacks`: PASS, all eight Nuclei profile directories were present.
- `npm test`: **43/43 PASS**, 0 failed, 0 skipped.
- `npm run test:integration`: **29/29 PASS**, 0 failed, 0 skipped.
- `npm run build`: PASS for React/Vite and backend TypeScript.
- `npm run smoke:modules`: PASS; Recon, Security Testing, SQLi, XSS and Intelligent Analysis completed on the loopback lab.
- `npm audit --audit-level=low`: 0 known vulnerabilities.

See `validation/tests.txt`, `validation/integration-tests.txt`, `validation/build.txt`, `validation/tool-check.txt`, `validation/attack-profiles.txt`, `validation/npm-audit.json` and `validation/module-smoke.json` for the final measured counts and outputs.
