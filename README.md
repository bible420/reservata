# RESERVATA

RESERVATA is a multi-office resource reservation and management application for facilities, vehicles, equipment, payment verification, and OSG visitor access.

## Repository Layout

The project is split into two independent repositories:

| Folder | Purpose | Run |
| --- | --- | --- |
| `frontend/` | React + Vite UI | `cd frontend && npm install && npm run dev` (http://127.0.0.1:5178/) |
| `backend/` | Node.js local API, mock SSO, AWS Lambda target | `cd backend && npm start` (http://127.0.0.1:5179/) |

`docs/` holds the shared documentation. The old monorepo git history was archived to `.git.archive/`.

## Run both together

```bash
npm run dev
```

This starts the backend on port 5179 and the Vite dev server on port 5178 (which proxies `/api` and `/mock-sso` to the backend). Open http://127.0.0.1:5178/.

## Technology Stack

- Frontend: React with JavaScript and Vite
- Local development backend: Node.js API, mock UST SSO provider, and JSON data file
- AWS backend: API Gateway, modular JavaScript Lambda functions, DynamoDB, and private S3 receipt storage
- Production authentication: configurable University OIDC SSO with RESERVATA-managed RBAC
- Frontend deployment target: Amazon S3 and CloudFront

Local defense mode uses an OAuth 2.0-style mock UST SSO Authorization Code flow with PKCE. The deployed mode is enabled through production environment variables and replaces the mock provider with the university OIDC endpoints.

## Tests

```bash
cd frontend && npm test   # frontend domain/store tests
cd backend && npm test    # local API integration tests
cd backend && npm run aws:test
```
