# Verification evidence

Current records cover HunterKit 1.11.0 on Linux x64:

- `tests.txt`: 44 passing tests, no failures or skips. Real native scanners, a loopback-only response fixture, local proxy/recovery, queue/API, production React in Chromium, and screenshot capture.
- `build.txt`: TypeScript and production Vite build.
- `installation.txt` / `fresh-install.json`: separate installation in a directory containing spaces, locked npm dependencies from registry, existing official release archives rechecked with SHA-256, then production startup and a local panel detection.
- `ci.json`: [successful Windows and Ubuntu verification](https://github.com/mohamed15ahmed/Hunter-Kit/actions/runs/39310214428) for source commit06158e8; Windows runs browser and screenshot checks with installed Edge.
- `source-sha256.json`: SHA-256 of packaged source and built files, excluding validation records themselves and downloads.
- `1.10.0/`: historical records for the previous release, including its full production profile smoke run. These are not a new full-library run for 1.11.0.

The fixture validates report and execution paths. CVE, takeover and default-login signatures emulate service responses; they do not establish exploitation of real deployed products. Reflected XSS uses deliberately unescaped HTML. Browser tests used a container-only Chromium wrapper; application startup retains browser sandboxing.

Public target scans were not performed. Windows runtime execution was verified separately on GitHub Actions, as recorded in `ci.json`; local container execution is Linux. Madaar's public homepage request was blocked by this environment's egress proxy, not by an observed response from the target.
