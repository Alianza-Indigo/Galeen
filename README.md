# GALEEN

GALEEN is a BYO multi-institutional AI administration SaaS, built with Next.js for Vercel.

## Current status

- A live configuration dashboard and GET /api/health endpoint.
- A PostgreSQL migration under db/migrations/001_initial.sql for an intended Neon instance. The migration has NOT been applied.
- No live provider accounts, no working authentication, no provisioning, no billing, and no active inference gateway yet.

All statistics in the initial dashboard explicitly show zero real activity. Administrative writes are not exposed before authentication and tenant authorization are implemented.

## Architecture

See docs/ARCHITECTURE.md. The institutional customer owns and manages authorized provider connections; GALEEN only manages platform access and later metering, policies, and billing for the SaaS itself.

## Local

Install with npm install, then npm run dev. Set secrets in Vercel's encrypted environment management. Never commit credentials.

## Deployment

Connected repository: Alianza-Indigo/Galeen (main). Vercel project: galeen.
