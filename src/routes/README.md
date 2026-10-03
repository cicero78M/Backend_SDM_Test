# API routes

`index.js` is the composition root mounted by `server.js` at `/api/v1`.
Each domain module owns its endpoint registration. The refactor is behavior
preserving: URLs, methods, middleware, response shapes, and authorization
rules remain unchanged.

## Route inventory

| Domain | Prefixes | Main responsibility |
| --- | --- | --- |
| `auth.js` | `/auth/*`, `/public/*` | Login, registration, OTP, password, users, scopes, public selectors |
| `audit.js` | `/audit-log` | Scoped audit-log search |
| `pegawai.js` | `/pegawai/*` | Legacy personnel CRUD |
| `master.js` | `/master/*` | Satker, unit, position, rank, and reference data |
| `dashboard.js` | `/dashboard/*` | Aggregated selection overview |
| `personel.js` | `/personel/*`, `/merit/*` | Personnel CRUD, profile, education, training, history, merit |

## Audit checklist

- Add a new endpoint to the domain module matching its prefix.
- Keep `authenticate`/`authorize` middleware visible beside the endpoint.
- Keep request validation at the route boundary with `validate(...)`.
- Keep database writes transactional where more than one table is changed.
- Add or update route-level tests before changing response contracts.
- Run `npm test` and review `git diff --stat` plus the endpoint inventory.
