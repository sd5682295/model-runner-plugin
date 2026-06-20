# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Work Style
- Work autonomously. Do NOT stop to ask for confirmation after reading files or making plans.
- Complete all tasks end-to-end without pausing for user input.
- If you need to read multiple files, read them all and continue working.
- If you need to edit multiple files, edit them all in sequence.
- Do NOT enter plan mode. Go straight to implementation.
- Do NOT summarize what you're about to do — just do it.
- After finishing one subtask, immediately move to the next one.
- Only stop when ALL tasks are fully completed and tested.

## When stuck
- If a file read fails, try alternative paths.
- If an approach fails twice, try a different approach.
- Do NOT ask the user "should I continue?" — always continue.

## Commands

```bash
node server.js        # Start server on http://localhost:4000
start.bat             # Windows shortcut to start server
```

No build step, no package.json, no npm. The project has zero dependencies — everything runs with native Node.js modules.

### Tests

Jest is installed in the parent `D:\work\` directory. Run tests from `D:\work\`:

```bash
# All tests (from D:\work\)
npx jest model-runner/tests/

# Specific test suite
npx jest model-runner/tests/unit/index.test.js
npx jest model-runner/tests/integration/index.test.js
npx jest model-runner/tests/security.test.js
npx jest model-runner/tests/regression.test.js
npx jest model-runner/tests/smoke/smoke.test.js
```

**Important:** Unit, integration, security, and regression tests each spin up their own mock HTTP server on a dedicated port — they do NOT require the real server to be running. Only the smoke tests (`tests/smoke/`) hit the real server on port 4000.

Test ports to avoid conflicts: unit (no server), integration (4001), security (4996), regression (4998), smoke (4000, requires live server).

## Architecture

**Two files do all the work:**

- `server.js` — pure Node.js HTTP server (no Express). Uses only built-in `http`, `https`, `fs`, `path`.
- `index.html` — single-page frontend loaded via CDN: marked.js (Markdown) + highlight.js (code highlighting).

**Request flow in server.js:**

The main `http.createServer` handler routes by `pathname` using simple string matching and one regex (`/^\/sessions\/([a-z0-9]+)$/`). Each route calls a dedicated `handle*` function. All upstream API calls go through `fetchWithRetry` (exponential backoff, retries on 429/5xx/network errors). Streaming uses the callback-based `streamRequest` function; non-streaming uses the Promise-based `httpRequest`.

**Config is lazily loaded and in-memory cached** in `_cfg`. `saveConfig` merges partial updates so you can PATCH individual fields. The config file is never exposed — `GET /config` omits the API key (returns `hasKey: bool`).

**Sessions** are stored as individual JSON files in `sessions/{id}.json`. IDs are alphanumeric strings validated by regex before any file path construction (path traversal protection). `listSessions` reads all files and returns a summary sorted by `updatedAt`.

**Prompts** are stored as a flat array in `prompts.json`. The entire array is read and written on each operation — suitable for the expected small collection size (< 100 templates).

**Frontend session lifecycle:**
1. On init: load session list → switch to most-recent session (or create new one)
2. On switch: call `autoSaveSession()` for current session, then `GET /sessions/:id`, repopulate UI
3. After each assistant reply: fire-and-forget `PUT /sessions/:id` (auto-names session from first user message)
4. Sessions panel toggles via `.hidden` CSS class (width transition)

**Markdown rendering strategy:** user messages use `textContent` (XSS-safe); assistant messages use `marked.parse()`. During streaming, raw text is shown via `textContent`; after stream ends, the element is switched to `innerHTML = renderMarkdown(full)`.

**Stop generation:** `AbortController` passed to `fetch()`. `Escape` key or clicking the send button (which toggles to a stop button during generation) calls `abortController.abort()`. Already-received content is preserved in history.

## API reference (for OpenClaw integration)

```
POST /chat          # non-streaming, returns OpenAI-format JSON
POST /chat/stream   # SSE stream, OpenAI delta format
```

Both accept: `{ model, messages, system?, temperature?, max_tokens?, callback_url? }`

`callback_url`: when provided, server POSTs the full response to that URL after completion (works for both stream and non-stream).

### Full endpoint list

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Frontend HTML |
| GET/POST | `/config` | Read (no key) / save API config |
| GET | `/models` | Proxy upstream model list |
| POST | `/chat` | Non-streaming chat completion |
| POST | `/chat/stream` | SSE streaming chat completion |
| GET/POST | `/sessions` | List / create sessions |
| GET/PUT/DELETE | `/sessions/:id` | Read / update / delete session |
| GET/POST | `/prompts` | List / create prompt templates |
| DELETE | `/prompts/:id` | Delete prompt template |
