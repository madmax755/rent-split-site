import markup from "./markup.html?raw";

let started = false;

/**
 * Mount the pre-React UI and boot its imperative script.
 * Appended to `document.body` (not a React-managed node) so StrictMode
 * remounts in development do not wipe the running UI.
 *
 * New features should be React components; peel screens out of
 * `legacy/app.js` over time rather than growing that file.
 */
export function startLegacyApp(): void {
  if (started) {
    return;
  }
  started = true;

  const host = document.createElement("div");
  host.id = "rent-split-root";
  host.innerHTML = markup;
  document.body.appendChild(host);
  void import("./app.js");
}
