# RESERVATA Backend

Local Node.js API server (mock UST SSO, JSON data store) plus the AWS serverless deployment target under `aws/`.

## Run

```bash
npm start
```

The API listens on http://127.0.0.1:5179/ (`PORT` env var overrides). In development, the frontend Vite server proxies `/api` and `/mock-sso` here. The server also serves the built frontend from `../frontend/dist` when present.

## Scripts

- `npm start` / `npm run api` — start the local API on port 5179
- `npm test` — local API integration tests
- `npm run aws:check` / `npm run aws:test` — AWS Lambda backend checks and tests (run `npm --prefix aws/backend install` first)

Data files live in `data/` (`db.json`, `accounts.json`, `resource-photos/`).
