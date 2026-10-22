# 1.12.0 — three-module security refactor

- Add an independent Security Testing workflow for security headers, TLS certificates/protocols, CORS, advertised HTTP methods and Nuclei known-vulnerability evidence.
- Keep Penetration Testing as the active Nuclei/Dalfox DAST workflow and standardize every final state as `COMPLETED_WITH_FINDINGS`, `COMPLETED_NO_FINDINGS`, `SKIPPED_NO_INPUTS`, `FAILED_TOOL_ERROR` or `PARTIAL`.
- Require explicit authorization and bind the confirmed scope to every new project before active testing can run.
- Add a consolidated Intelligent Analysis report that normalizes and deduplicates real evidence, scores risk and separates optional AI interpretation from scanner evidence.
- Add Windows executable-name and CLI compatibility regression checks so unrelated `httpx` programs and unsupported Dalfox versions cannot pass diagnostics.
- Add API, browser and real-tool integration coverage for the new modules while preserving Recon and JavaScript Leaks.

# 1.10.2 — reliable completion reporting

- Reserve `PARTIAL` for an actual timeout or an engine run that stopped early.
- Treat a normally exited Nuclei or Dalfox run as `COMPLETED` while retaining a visible warning and exact count for isolated failed requests.
- Retry individual Nuclei and Dalfox requests once and increase large-profile/Dalfox process budgets to five minutes.
- Keep all-request failures as `FAILED`; parameter-dependent scans remain `SKIPPED` until a real parameterized URL is available.
- Add regression coverage so a minority of request errors cannot incorrectly relabel a completed engine run.
- Add a loopback-only deterministic demo lab and Windows launcher for repeatable graduation-project demonstrations.

# 1.10.1 — verified baseline hardening

- Prevent concurrent Recon/Attack/JSLeak tools for the same project; competing API requests fail immediately with HTTP 409 instead of queueing or overloading the target.
- Disable the other Attack buttons while one scanner is active and replace blocking browser alerts with inline status and toast messages.
- Restrict the loopback API and project files to local browser origins and local Host headers.
- Reject project names that alias paths or Windows device names.
- Update AdmZip, React Router, Tailwind/PostCSS and Vite; `npm audit` reports zero known vulnerabilities for the locked dependency tree.
- Validate Node 20.18+ and failed tool diagnostics in the Windows launchers; make Vite fail clearly if port 5173 is occupied.
- Upgrade the full-profile smoke test to run every Nuclei profile and Dalfox sequentially, consistent with project job isolation.
- Add regression coverage for API origin isolation, project-wide job exclusion, non-blocking UI behavior, and portable project names (36/36 tests).

# 1.10.0 — Attack pipeline repair

- Preserve target scheme, port, path and query; separate HTTP inputs from DNS hostnames.
- Discover scoped current-page links and GET form parameters even with an existing archive.
- Remove General's technology-detection prerequisite and unnecessary info filtering for exposures.
- Enable parameter-based Nuclei DAST for LFI and retain the dedicated SQLi DAST profile.
- Persist request/template counts, raw reports, skipped/partial/failed states and finding provenance.
- Reject duplicate same-module jobs and serialize atomic project metadata updates.
- Distinguish Dalfox V findings from reflection/static/information observations.
- Fix JSLeak output parsing, scan discovered JS files and expose saved results in the UI.
- Replace unreliable browser screenshot CLI calls with Playwright Core controlling an installed browser.
- Pin tool/template releases, archive and executable digests; fix executable permissions on Unix.
- Add a package lock, reproducible installers, real-tool regression tests, and repair production TypeScript builds.
- Remove the hardcoded frontend AI credential; use the backend environment configuration.

See FIX-REPORT.ar.md and validation/ for evidence and limitations.
