# Main modified files — HunterKit 1.12.0

- `backend/src/core.ts`: authorization, standardized statuses, native Security Testing, Nuclei CVE evidence, tool compatibility checks and consolidated intelligent reporting.
- `backend/src/server.ts`: API channels and project-level exclusion for Security Testing and report generation.
- `frontend/src/components/createProject.form.tsx`: explicit authorization confirmation.
- `frontend/src/views/project/SecurityTesting.tsx`: independent Security Testing workflow and evidence UI.
- `frontend/src/views/project/IntelligentAnalysis.tsx`: deduplicated risk report and separated optional AI interpretation.
- `frontend/src/views/project/attackResults.tsx`: exact standardized status display.
- `frontend/src/App.tsx`, `frontend/src/components/sidebar.tsx`, `frontend/src/web-ipc.ts`: routing, navigation and bounded action calls.
- `tests/api.test.ts`, `tests/integration.test.ts`, `tests/targets.test.ts`: CLI compatibility, status, authorization, real-tool, API and browser coverage.
- `README.md`, `TOOL-COMPATIBILITY.md`, `TEST-REPORT.md`, `FIX-REPORT.ar.md`: setup, evidence, limitations and review notes.

Generated `backend/dist` and `frontend/dist` files are rebuilt from the corresponding source.
