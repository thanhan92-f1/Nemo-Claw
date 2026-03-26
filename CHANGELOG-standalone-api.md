# Standalone API Changelog

## 2026-03-26

### Added
- `GET /api/openshell/diagnostics` for OpenShell and container runtime diagnostics.
- `GET /api/preflight/ports` for batch port availability checks.
- `GET /api/inference/local/providers` for local inference provider catalog.
- `GET /api/inference/local/providers/:provider/diagnostics` for provider-specific diagnostics.
- `GET /api/presets/:name/entries` for extracted preset network entries.
- `GET /api/nim/models/compatible` for current-host NIM compatibility checks.
- `GET /api/sandboxes/:name/policy/preview-merge` for read-only merged policy preview.
- `GET /api/runtime/platform` for platform and container runtime internals.
- `GET /api/runtime/registry` for sandbox registry diagnostics.
- `GET /api/runtime/inference-config` for resolved inference route defaults and provider mapping.

### Changed
- `GET /api/environment/summary` now includes `localInference` metadata.
- `standalone-api/README.md` now documents deep diagnostic routes and response examples.
- `standalone-api/postman/nemoclaw-standalone-api.postman_collection.json` now includes requests for deep diagnostics and preview APIs.

### Fixed
- Repaired the `handle()` router in `standalone-api/server.js` after malformed route insertion.
- Restored valid route ordering and sandbox policy handler matching.

### Notes
- New deep endpoints are intentionally read-only or preview-focused.
- Policy changes still require the explicit apply endpoints.
- Runtime and service diagnostics remain most reliable on Linux, WSL, or macOS environments.
