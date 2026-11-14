# Terminal AI 2.0 — Cross-device AI Terminal foundation

A safe relay + local agent foundation for Windows, Linux and Android/Termux. The relay never executes shell commands. A paired device agent runs a small fixed set of task IDs using `spawn(..., { shell:false })`.

## Requirements
- Node.js 20+ (no third-party runtime dependencies)
- npm (for running the test script)
- Windows PowerShell/CMD, Linux/macOS terminal, or Android Termux

## Install and run relay
```bash
# Set a strong owner token before starting
# Linux/macOS/Termux:
export TERMINAL_AI_OWNER_TOKEN="$(openssl rand -hex 32)"
npm start
# Windows PowerShell:
$env:TERMINAL_AI_OWNER_TOKEN = "use-a-long-random-secret"
npm start
```

Expose the relay only behind HTTPS. The included JSON store is suitable only for a single-instance prototype; use a transactional database before multi-instance/production deployment. Back up `data/store.json` and restrict filesystem access.

## Pair a device
Create a one-time code using `POST /api/pair-codes` with `Authorization: Bearer <OWNER_TOKEN>` and optional JSON `{ "label": "My Windows PC" }`. Pair the local device using `POST /api/devices/pair` with `{ "code": "..." }`. Save the returned `deviceId` and `deviceToken` securely; the token is shown once.

## Run local agent (on each device)
Set `TERMINAL_AI_URL`, `TERMINAL_AI_DEVICE_ID`, and `TERMINAL_AI_DEVICE_TOKEN`, then:
```bash
npm run agent
```
The same Node agent runs on Windows, Linux and Termux. Keep the agent process alive on the device.

## Queue a task
`POST /api/jobs` with owner auth and JSON `{ "deviceId": "...", "taskId": "system_info" }`. Allowed task IDs: `system_info`, `list_files`, `working_directory`, `git_status`. Arbitrary shell strings are rejected. The AI intent endpoint `POST /api/ai/interpret` is a deterministic starter, not a connected LLM; it returns a suggested task and requires explicit owner approval before queuing.

## API
- `GET /health`
- `POST /api/pair-codes` (owner)
- `POST /api/devices/pair` (one-time code)
- `GET /api/devices` (owner)
- `POST /api/devices/:id/revoke` (owner)
- `POST /api/jobs` (owner)
- `GET /api/jobs/:id` (owner)
- `GET /api/device/jobs/next` (device)
- `POST /api/device/jobs/:id/result` (assigned device)
- `POST /api/ai/interpret` (owner)

## Security and limitations
- No arbitrary remote shell execution.
- Device credentials are stored as SHA-256 hashes on the relay; owner token is supplied via environment.
- Pair codes expire after five minutes and are single-use.
- Output is capped; task runtime is capped at 10 seconds.
- Sensitive/destructive tasks are intentionally not included. Add narrowly-scoped task IDs and explicit approval UX before expanding capabilities.
- The local agent can access files and tools available to its OS user. Run it as a non-admin/non-root account and only in a workspace you intend to expose.
- This foundation does not yet contain a hosted LLM. ChatGPT/Brilla can act as the reasoning layer by interpreting requests and asking the relay to queue approved task IDs; full autonomous multi-step orchestration requires a separately configured model/API and approval policy.

## Verify
```bash
npm test
```
