# Local development

## Frontend API origin

The frontend no longer proxies browser API calls through a Next.js rewrite —
`axios-instance.ts` and the server-rendered tenant layouts all send requests
straight to the backend's own origin, read from `NEXT_PUBLIC_API_URL`.

Set it in `frontend/.env.local` (see `frontend/.env.example`):

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:5000
```

Leaving it unset does not fail loudly: server-rendered tenant pages still
work, but every browser-side API call resolves against the Next.js app's own
origin (`http://localhost:3000/api/...`) and gets Next's HTML 404 page back
instead of a JSON response — the app half-loads, then fails in a way that
looks like an auth bug rather than a missing config value.
`NEXT_PUBLIC_API_URL` is a build-time value inlined into the client bundle,
so changing it later requires restarting `npm run dev` (or a rebuild), not
just re-saving the file.

## MongoDB transaction support

Cafe provisioning will use MongoDB multi-document transactions. Run the local
database as the single-node replica set defined in [`../compose.yaml`](../compose.yaml).
This setup binds MongoDB only to `127.0.0.1`, stores data in the named
`nextbooq_mongodb_data` volume, and deliberately does not initiate the replica
set automatically.

### One-time initialization

Start MongoDB:

```powershell
docker compose up -d mongodb
```

After the container is healthy, initialize `rs0` exactly once:

```powershell
docker compose exec mongodb mongosh --quiet --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"
```

Do not repeat `rs.initiate()` after it succeeds. Check the state instead:

```powershell
docker compose exec mongodb mongosh --quiet --eval "rs.status().members.map(({name,stateStr}) => ({name,stateStr}))"
```

The member should report `PRIMARY`. Later starts only need:

```powershell
docker compose up -d mongodb
```

Use this local-only backend URI in `backend/.env`:

```dotenv
MONGO_URI=mongodb://localhost:27017/nextbooq?replicaSet=rs0&directConnection=true
```

`directConnection=true` is only for this local single-node setup. Do not add it
to MongoDB Atlas or other production/multi-node connection strings.

## Topology policy

- Production requires a replica set or sharded MongoDB deployment. The backend
  stops during startup if topology inspection cannot verify transaction support.
- Automated backend tests use `MongoMemoryReplSet` from `backend/tests/setup.js`.
- Development connected to a standalone MongoDB logs a clear warning so
  unrelated work can continue. Transactional cafe provisioning must fail with a
  controlled 503 before creating any records until the replica set is enabled.

## Operational safety

Before running `npm run seed` or `node scripts/grantPlatformAdmin.js`, inspect
the active `MONGO_URI`. Those scripts write directly to the selected database;
they are intended for local development or explicitly approved administrative
environments, never an accidental production target.
