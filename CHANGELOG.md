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
