# 📚 Virtual Study World

A cozy top-down 3D town where you and your friends study together. Walk around with WASD, sit at a desk in the Library, the Café or the park, and start a Pomodoro session. Everyone sees your progress ring, and everyone sees it if you bail early 🥀.

## Run it locally

Use two terminals:

```bash
npm install
INVITE_CODE=cozy npm run dev:server   # game server on :8787
npm run dev:client                    # Vite on :5173, proxies /ws to the server
```

Open http://localhost:5173 and enter the invite code `cozy`.

To see two players at once, use a normal window and a private window. Tabs in the same window share a device token, so the newer tab takes over from the older one.

## Production

```bash
npm run build                          # builds the client into dist/client
INVITE_CODE=<secret> PORT=8787 DB_PATH=data.db npm start
```

One process serves the page and the WebSocket (`/ws`). Profiles are stored in `data.db`. `GET /health` returns `ok`.

## Controls

| Key | Action |
|---|---|
| WASD / arrows | walk |
| E | sit / stand / say hi to someone nearby |
| Space | start a study session (while seated) |
| Esc | close dialogs |

## Tests

```bash
npm test          # vitest: shared, server and client logic
npm run typecheck
```
