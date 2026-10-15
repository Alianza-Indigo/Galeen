# Versioned Neon migrations

All database migrations must live in db/migrations/ and are executed from GitHub/Vercel. A manual SQL editor is not required.

## Automatic deploy flow

1. A reviewed push to main triggers a Vercel production build.
2. The build executes Next.js compilation, followed by node scripts/migrate.mjs --auto.
3. The runner applies missing SQL files in filename order, only on Vercel production.
4. Migrations run inside a PostgreSQL transaction guarded by advisory lock.
5. The public.galeen_schema_migrations ledger stores SHA-256 checksums and timestamps.
6. Failed migrations roll back and fail the build; the previous production deployment remains available.

Preview and local builds skip automatic database mutations.

## Commands

- npm run db:status : check current database migration status; read-only.
- npm run db:migrate : explicitly run pending migrations for the configured Neon database.
- npm run build : compile application and apply migrations on Vercel production.

Do not edit existing SQL migrations after application. Add new numbered files instead.
Do not include BEGIN or COMMIT statements inside migration files.

## Connection

The migration runner tries DATABASE_URL_UNPOOLED, then POSTGRES_URL_NON_POOLING, and finally DATABASE_URL. All values are stored in Vercel environment variables, never committed to GitHub.

Use distinct migration and application DB roles before enabling production tenant CRUD.
The application role must not own RLS-protected tables or have BYPASSRLS rights.
