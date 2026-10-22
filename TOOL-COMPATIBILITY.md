# Tool compatibility report — HunterKit 1.12.0

| Tool | Expected upstream | Pinned version | Compatibility evidence |
|---|---|---:|---|
| Subfinder | ProjectDiscovery/subfinder | 2.17.0 | `subfinder -version` must contain `Current Version` |
| HTTPX | ProjectDiscovery/httpx | 1.12.0 | `httpx -version` must contain ProjectDiscovery `Current Version`; unrelated URL-client CLIs are rejected |
| WaybackURLs | tomnomnom/waybackurls | 0.1.0 | `waybackurls -h` must print its Go usage banner |
| Nuclei | ProjectDiscovery/nuclei | 3.11.1 | `nuclei -version` must report Nuclei Engine v3 |
| Dalfox | hahwul/dalfox | 3.2.4 | `dalfox --version` must report v3 |
| JSLeak | 0xHunterr/jsleak | 1.0.0 | help output must contain its `secretFinder` option |
| Nuclei templates | ProjectDiscovery/nuclei-templates | 10.5.0 | archive SHA-256 and required profile paths are verified |

`scripts/tools-lock.json` records official release URLs, archive hashes and extracted executable hashes for Windows x64 and Linux x64. `INSTALL-TOOLS.cmd` is repeatable: `npm ci`, verified tool extraction, verified template extraction, CLI diagnostics and profile diagnostics. A file existing in `bin` is insufficient; incompatible output fails the install.

Windows executable resolution is `<project>\\bin\\<tool>.exe`. Subprocesses use argument arrays with `shell:false`, Windows-hidden processes, explicit deadlines and process-tree termination on timeout.

Runtime execution was verified on Linux x64. Official Windows x64 archives and executable SHA-256 values were verified, but the executables were not run on a Windows host in this environment.
