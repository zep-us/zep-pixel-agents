# Arcadia

VS Code extension with an embedded React webview panel.

## Architecture

```
├── src/extension.ts          — Extension entry point. Registers a WebviewViewProvider
│                               that loads the built React app into the bottom panel.
├── webview-ui/               — Standalone React + TypeScript app (Vite)
│   ├── src/App.tsx           — Root component (agent launcher + session buttons)
│   └── vite.config.ts        — Builds to ../dist/webview with relative base paths
├── esbuild.js                — Bundles the extension (src/) → dist/extension.js
├── dist/                     — Build output (gitignored)
│   ├── extension.js          — Bundled extension
│   └── webview/              — Built React app (loaded by extension at runtime)
└── package.json              — VS Code manifest + all build scripts
```

## How it works

- The extension registers a `WebviewViewProvider` for the view `arcadia.panelView`, which lives in the bottom panel (next to Terminal).
- On resolve, it reads `dist/webview/index.html` and rewrites `./` asset paths to `webview.asWebviewUri()` URIs.
- The command `arcadia.showPanel` focuses the panel.
- The webview communicates with the extension via `postMessage`. Clicking "Open Claude Code" sends `openClaude`, the extension creates a named terminal running `claude` and replies with `agentCreated`. Each session gets an "Agent #n" button; clicking it sends `focusAgent` to show that terminal. Closing a terminal sends `agentClosed` to remove its button.

## Build

```sh
npm install                   # root deps
cd webview-ui && npm install  # webview deps
cd .. && npm run build        # builds both extension + webview
```

`npm run build` runs: type-check → lint → esbuild (extension) → vite build (webview).

## Dev

Press F5 to launch the Extension Development Host. The "Arcadia" tab appears in the bottom panel. Run "Arcadia: Show Panel" from the command palette to focus it.

## Key decisions

- Used `WebviewViewProvider` (not `WebviewPanel`) so the view sits in the panel area alongside the terminal rather than in an editor tab.
- Inline esbuild problem matcher in `.vscode/tasks.json` to avoid requiring the `connor4312.esbuild-problem-matchers` extension.
- Webview is a separate Vite project with its own `node_modules` and `tsconfig`. Root `tsconfig.json` excludes `webview-ui/`.
