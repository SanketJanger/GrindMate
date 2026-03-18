# Static Assets

This folder is for static assets served by the Worker.
Currently, the frontend is embedded in `src/index.ts` for simplicity.

For a production app, you would:
1. Build a React/Vue/Svelte app
2. Place the build output here
3. The Worker serves files from this directory
