# RESERVATA Frontend

React + Vite client for the RESERVATA multi-office reservation system.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5178/. The dev server proxies `/api` and `/mock-sso` to the backend at http://127.0.0.1:5179/ — start the backend (`cd ../backend && npm start`) first.

## Scripts

- `npm run dev` — Vite dev server on port 5178
- `npm run build` — production build to `dist/`
- `npm run preview` — preview the build on port 4173
- `npm test` — domain/store unit tests
