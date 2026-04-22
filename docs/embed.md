# Embeddable analytics client

The `client/` package builds a small browser library that `POST`s to `/analytics/events?v=1` with a stable `sessionId` and your `appId`. Build outputs are gitignored: run `npm ci && npm run build` in `client/` to produce `dist/shared-analytics.mjs` and `dist/shared-analytics.iife.js`.

**ESM (bundler apps)**

```ts
import { createClient } from './dist/shared-analytics.mjs' // or from source path in your app

const analytics = createClient({ baseUrl: 'https://api.michaelj43.dev', appId: 'my-site' })
await analytics.pageview(location.pathname)
```

**Classic / script tag** — the IIFE assigns `createClient` to the global `SharedApiAnalytics` namespace (see the built file’s `var SharedApiAnalytics = ...`).

```html
<script src="https://your-cdn.example/shared-analytics.iife.js"></script>
<script>
  const analytics = SharedApiAnalytics.createClient({
    baseUrl: 'https://api.michaelj43.dev',
    appId: 'my-app',
  })
  analytics.pageview(window.location.pathname)
</script>
```

CORS must allow the page origin: configure `CORS_ALLOWED_BASE_HOST` (and optional localhost) as documented in [deployment](deployment.md).
