# HunterKit fixed project — 1.11.0

[Download HunterKit 1.11.0 ZIP](https://github.com/mohamed15ahmed/Hunter-Kit/raw/refs/heads/hunterkit-fixed-1.10.0/downloads/HunterKit-Fixed-1.11.0.zip)

Extract into a new directory, run `INSTALL-TOOLS.cmd`, then `START-HUNTERKIT.cmd` on Windows x64. Create a project with the exact target URL. On Attacks, use **Check target connection** before a large scan and **Download diagnostic report** if a scanner cannot connect. The installer downloads checksum-verified binaries and templates; they are not bundled in the ZIP.

This update serializes tool jobs, resolves native attack proxy settings, preserves target ports and distinguishes failed connectivity, completed runs with request errors, interrupted runs and skipped tests. A zero count is not proof that the target is secure. Login sessions, POST/JSON and JavaScript workflows are not automatically covered.

Local Linux verification: build and 44 tests passed, none skipped, including real scanners, Chromium UI, screenshots, proxy/recovery and deadline tests. A separate installation and production scan passed in a path containing spaces. Windows execution is not yet verified; `.github/workflows/verify.yml` adds Linux and Windows checks.

Full details: `FIX-REPORT.ar.md` and `validation/`. ZIP SHA-256: `downloads/HunterKit-Fixed-1.11.0.zip.sha256`.
