# Agent notes

- **Bun** for package installs/scripts; Node runs `server/server.js`.
- Frontend is Vite + React 19 + React Compiler (`reactCompilerPreset` + `@rolldown/plugin-babel`).
- Existing product UI lives in `frontend/src/legacy/` (imperative). New work should be typed React under `frontend/src/`; peel legacy screens out, don't enlarge `legacy/app.js`.
- Household data under `data/` is gitignored — never commit it.
- British spellings in identifiers/docs where not language keywords.
- Prefer Tailwind for new UI; legacy CSS stays until that screen is rewritten.
