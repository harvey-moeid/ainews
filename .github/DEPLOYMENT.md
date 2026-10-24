# Manual production deployment: ainews

Production is the existing Cloudflare Worker `ainews`, D1 database `ainews-db`,
and R2 bucket `ainews-content`. Do not use local `wrangler.jsonc`
for deployment: it contains `DEV_AUTH=1`.

## Initial GitHub setup

1. Go to **Settings > Secrets and variables > Actions** for this repository.
2. Add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
   Create a Cloudflare API token scoped to the correct account, with Worker
   deployment and D1 migration permissions. Scope it as narrowly as possible.
   Never commit the token or the AI/provider secrets.
3. Under **Settings > Environments**, optionally configure the `production`
   environment with deployment restrictions to `main` and required reviewers
   when your GitHub plan supports them.
4. Merge the pull request containing `.github/workflows/deploy.yml`.

## Deploy using a phone/browser

Open **Actions > Deploy ainews to Cloudflare > Run workflow**, choose **main**,
keep **Apply pending production D1 migrations** enabled when new migrations
are part of the release, and select **Run workflow**.

The workflow checks its branch, runs tests and build, validates the production
target and authentication mode, then requests the `production` environment.
It lists pending migrations, optionally applies them, deploys using
`wrangler.production.json`, and probes that unauthenticated users remain
blocked by Cloudflare Access. It does **not** run automatically on push.

Cloudflare captures a backup when Wrangler applies D1 migrations. Review SQL
changes and important data backups before executing a production deployment.
Do not disable migrations when the updated code depends on new schema.

After the workflow succeeds, sign in through Cloudflare Access and manually
test the dashboard, D1/R2-backed APIs, AI providers, and `/live` /
`/overlay2` audio. A redirect to Access only proves that the gate exists,
not that authenticated application functionality is healthy.

Code rollback does not automatically reverse database migrations. Use a
compatible prior Worker version and a reviewed database recovery plan if needed.
