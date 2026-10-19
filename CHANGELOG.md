# 1.11.0 — Native connectivity and scan jobs

- Check Node and Nuclei connectivity before a large attack scan; report proxy, DNS, TLS, timeout and port failures separately from zero findings.
- Resolve proxy environment/NO_PROXY and static Windows proxy consistently for Node discovery, Nuclei and Dalfox. Keep explicit target schemes and ports.
- Serialize tool jobs across clients with duplicate protection, queued cancellation, status polling and concise inline results.
- Distinguish engine completion with request errors from interruption; preserve valid Dalfox reports with exit2 and mark process deadlines incomplete.
- Export bounded diagnostics and describe GET/POST/login discovery coverage.
- Add real native proxy/recovery regressions and a Windows/Linux verification workflow using a checkout path containing spaces.

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
