# Agent notes

- **Bun** for package installs/scripts; Node runs `server/server.js`.
- Frontend is Vite + React 19 + React Compiler (`reactCompilerPreset` + `@rolldown/plugin-babel`).
- Existing product UI is typed React under `frontend/src/ui/`. Domain maths lives in `frontend/src/domain/`. Styles live in `frontend/src/styles/`; prefer Tailwind for new UI.
- Household data under `data/` is gitignored — never commit it.
- British spellings in identifiers/docs where not language keywords.
- Prefer Tailwind for new UI.
