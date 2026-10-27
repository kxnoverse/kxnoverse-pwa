# KxnoDesk AI Worker

This Worker is an optional, separate backend. It is not deployed or configured by the frontend build.

## Security model

- The Worker validates every chat and connection-test request with Cloudflare Turnstile Siteverify. The Turnstile site key used by the frontend is public; `TURNSTILE_SECRET_KEY` is a server-side secret and must never be placed in frontend files.
- Turnstile is bot friction, not a login. A public visitor who can pass the widget can use the AI service, so do not treat this as personal account access control. CORS/origin checks are not authentication.
- Requests are limited to 100 per source IP per UTC day and 300 total per UTC day across the Worker. Shared school/household IPs share the per-IP limit; different IPs can receive separate limits. The global cap bounds total daily provider calls.
- Set `APP_ORIGIN` to the exact HTTPS origin of the GitHub Pages site (for example, `https://username.github.io`, without `/kxnoverse-pwa/`). Add the matching hostname to the Turnstile widget configuration. Add `localhost` as a hostname too only if you intend to verify against a local app.
- Keep deployed provider credentials in Wrangler's server-side secret store. Never add them to the Vite app, `.env`, GitHub Pages variables, or source control. `.dev.vars` is only for untracked local development.
- The Durable Object enforces daily limits. Input is limited to 8,000 characters, custom instructions to 2,000 characters, generated output to 1,200 tokens, and conversation history to 24 messages.
- `GET /api/usage` reports the lower of the current IP and global remaining quotas. It does not consume a request; the displayed count is server-calculated and can change when requests or connection tests use the shared quota.
- Only the user's explicitly submitted message, conversation text history, chosen assistant preset, and selected attachments are sent. The frontend does not attach notes, tasks, timetable entries, or files automatically.
- OpenRouter chat and connection tests use the dedicated `OPENROUTER_API_KEY` Worker secret. The Worker allows only the OpenRouter Free Models Router (`openrouter/free`) or explicit model IDs ending in `:free`; other model IDs are rejected to prevent paid-model requests. The free router selects only free models.
- OpenRouter accepts up to five PNG, JPEG, WEBP, or PDF attachments per message; each is limited to 10 MiB and combined attachments to 20 MiB. Both the frontend and Worker validate MIME type, size, and file signatures. Attachments are converted to OpenRouter-compatible inline data only after the user sends the message. PDF parsing explicitly uses the Cloudflare AI parser to avoid the paid Mistral OCR fallback.
- The request body is bounded to 27 MiB to account for base64 attachment encoding. Worker model and attachment restrictions are enforced server-side; client validation is not a security boundary.
- `POST /api/test` makes a real, short request to OpenRouter using `AI_MODEL`. The model must be `openrouter/free` or end in `:free`. The endpoint requires a fresh Turnstile token and consumes one request from both daily quotas; do not use it as a free health check.
- Model choices are controlled by Worker configuration and an explicit free-model allowlist. OpenRouter free-model availability and pricing can change; verify current terms before use.

## Configuration

1. In Cloudflare Turnstile, create a widget and add the GitHub Pages hostname (for example `username.github.io`). Copy its **site key**; it is public and will be entered in KxnoDesk Settings.
2. In `wrangler.toml`, set `APP_ORIGIN` to the exact app origin and use `openrouter/free` or currently free model IDs ending in `:free` for `AI_MODEL` and `ALLOWED_MODELS`. Verify OpenRouter's current free-tier terms; they can change.
3. From this directory, authenticate Wrangler with `npx wrangler login`, then store `OPENROUTER_API_KEY` and `TURNSTILE_SECRET_KEY` as Worker secrets. Never add secrets to frontend files or source control.
4. Deploy the Worker with `npx wrangler deploy`. The Worker URL is provided by Wrangler and does not require a custom domain.
5. In KxnoDesk Settings, enter the Worker URL and the public Turnstile site key, save both, then enable cloud AI and grant cloud-sharing permission for that endpoint. Permission is stored on the device until revoked. Turnstile is requested automatically for each chat or connection test; its widget stays hidden unless Cloudflare requires interaction. Only the submitted text, selected attachments, and relevant conversation history go to the configured provider; school records are not automatically included.
6. The connection test makes a real provider call and consumes both the IP and global daily quota. Use it only when ready to verify the service.
7. For local Worker development, copy `.dev.vars.example` to `.dev.vars` and put credentials only in that ignored local file. Configure local `APP_ORIGIN`/model values in the appropriate Wrangler local config. `npm run typecheck` and `npm test` from the app root validate the Worker implementation and tests.

The Worker and frontend require separate deployment.
