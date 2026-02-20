---
name: convert-web-app
description: This skill should be used when the user asks to "convert my web app to an MCP App", "turn my website into an MCP App", "make my web page an MCP tool", "wrap my existing UI as an MCP App", "convert iframe embed to MCP App", "turn my SPA into an MCP App", or needs to convert an existing web application into an MCP App with server-side tool and resource registration. Provides guidance for analyzing existing web apps and creating MCP server + App wrappers.
---

# Convert Web App to MCP App

Turn an existing web application into an MCP App that renders inline in MCP-enabled hosts like Claude Desktop.

## How It Works

The existing web app becomes the View (HTML resource) in an MCP App. A new MCP server is created to:

1. Register a tool that the LLM calls to display the app
2. Register the bundled HTML as a resource
3. Pass data to the app via `structuredContent` instead of URL params / API calls

```
Host calls tool → Server returns result → Host renders your web app → App receives data via MCP lifecycle
```

## Getting Reference Code

Clone the SDK repository for working examples and API documentation:

```bash
git clone --branch "v$(npm view @modelcontextprotocol/ext-apps version)" --depth 1 https://github.com/modelcontextprotocol/ext-apps.git /tmp/mcp-ext-apps
```

### API Reference (Source Files)

Read JSDoc documentation directly from `/tmp/mcp-ext-apps/src/`:

| File | Contents |
|------|----------|
| `src/app.ts` | `App` class, handlers (`ontoolinput`, `ontoolresult`, `onhostcontextchanged`, `onteardown`), lifecycle |
| `src/server/index.ts` | `registerAppTool`, `registerAppResource`, tool visibility options |
| `src/spec.types.ts` | All type definitions: `McpUiHostContext`, CSS variable keys, display modes |
| `src/styles.ts` | `applyDocumentTheme`, `applyHostStyleVariables`, `applyHostFonts` |
| `src/react/useApp.tsx` | `useApp` hook for React apps |
| `src/react/useHostStyles.ts` | `useHostStyles`, `useHostStyleVariables`, `useHostFonts` hooks |

### Framework Templates

Learn and adapt from `/tmp/mcp-ext-apps/examples/basic-server-{framework}/`:

| Template | Key Files |
|----------|-----------|
| `basic-server-vanillajs/` | `server.ts`, `src/mcp-app.ts`, `mcp-app.html` |
| `basic-server-react/` | `server.ts`, `src/mcp-app.tsx` (uses `useApp` hook) |
| `basic-server-vue/` | `server.ts`, `src/App.vue` |
| `basic-server-svelte/` | `server.ts`, `src/App.svelte` |
| `basic-server-preact/` | `server.ts`, `src/mcp-app.tsx` |
| `basic-server-solid/` | `server.ts`, `src/mcp-app.tsx` |

### Conversion Reference Examples

| Example | Relevant Pattern |
|---------|-----------------|
| `examples/map-server/` | External API integration + CSP (`connectDomains`, `resourceDomains`) |
| `examples/sheet-music-server/` | Library that loads external assets (soundfonts) |
| `examples/pdf-server/` | Binary content handling + app-only helper tools |

## Step 1: Analyze the Existing Web App

Before writing any code, examine the existing web app to plan the conversion.

### What to Investigate

1. **Data sources** — How does the app get its data? (URL params, API calls, props, hardcoded, localStorage)
2. **External dependencies** — CDN scripts, fonts, API endpoints, iframe embeds, WebSocket connections
3. **Build system** — Current bundler (Webpack, Vite, Rollup, none), framework (React, Vue, vanilla), entry points
4. **User interactions** — Does the app have inputs/forms that should map to tool parameters?

Present findings to the user and confirm the conversion approach.

### Data Source Mapping

| Data source in web app | MCP App equivalent |
|---|---|
| URL query parameters | `ontoolinput` / `ontoolresult` `arguments` or `structuredContent` |
| REST API calls | `app.callServerTool()` to server-side tools, or keep direct API calls with CSP `connectDomains` |
| Props / component inputs | `ontoolinput` `arguments` |
| localStorage / sessionStorage | Not available in sandboxed iframe — move to `structuredContent` or server-side state |
| WebSocket connections | Keep with CSP `connectDomains`, or convert to polling via app-only tools |
| Hardcoded data | Move to tool `structuredContent` to make it dynamic |

## Step 2: Investigate CSP Requirements

MCP Apps HTML runs in a sandboxed iframe with no same-origin server. **Every** external origin must be declared in CSP — missing origins fail silently.

**Before writing any conversion code**, build the app and investigate all origins it references:

1. Build the app using the existing build command
2. Search the resulting HTML, CSS, and JS for **every** origin (not just "external" origins — every network request will need CSP approval)
3. For each origin found, trace back to source:
   - If it comes from a constant → universal (same in dev and prod)
   - If it comes from an env var or conditional → note the mechanism and identify both dev and prod values
4. Check for third-party libraries that may make their own requests (analytics, error tracking, etc.)

**Document your findings** as three lists, and note for each origin whether it's universal, dev-only, or prod-only:

- **resourceDomains**: origins serving images, fonts, styles, scripts
- **connectDomains**: origins for API/fetch requests
- **frameDomains**: origins for nested iframes

If no origins are found, the app may not need custom CSP domains.

## Step 3: Set Up the MCP Server

Create a new MCP server with tool and resource registration. The web app has no existing server, so this is built from scratch.

### Dependencies

```bash
npm install @modelcontextprotocol/ext-apps @modelcontextprotocol/sdk zod
npm install -D tsx vite vite-plugin-singlefile
```

Use `npm install` to add dependencies rather than manually writing version numbers. This lets npm resolve the latest compatible versions. Never specify version numbers from memory.

### Server Code

Create `server.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const server = new McpServer({ name: "my-app", version: "1.0.0" });

const resourceUri = "ui://my-app/mcp-app.html";

// Register the tool — inputSchema maps to the app's data sources
registerAppTool(server, "show-app", {
  description: "Displays the app with the given parameters",
  inputSchema: { query: z.string().describe("The search query") },
  _meta: { ui: { resourceUri } },
}, async (args) => {
  // Process args server-side if needed
  return {
    content: [{ type: "text", text: `Showing app for: ${args.query}` }],
    structuredContent: { query: args.query },
  };
});

// Register the HTML resource
registerAppResource(server, {
  uri: resourceUri,
  name: "My App UI",
  mimeType: RESOURCE_MIME_TYPE,
  // Add CSP domains from Step 2 if needed:
  // _meta: { ui: { connectDomains: ["api.example.com"], resourceDomains: ["cdn.example.com"] } },
}, async () => {
  const html = await fs.readFile(
    path.resolve(import.meta.dirname, "dist", "mcp-app.html"),
    "utf-8",
  );
  return { contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }] };
});

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Package Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "build:ui": "vite build",
    "build:server": "tsc",
    "build": "npm run build:ui && npm run build:server",
    "serve": "tsx server.ts"
  }
}
```

## Step 4: Adapt the Build Pipeline

The UI must be bundled into a single HTML file using `vite-plugin-singlefile`. Without it, external assets won't load in the sandboxed iframe.

### Vite Configuration

Create or update `vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: "mcp-app.html",
    },
  },
});
```

Add framework-specific Vite plugins as needed (e.g., `@vitejs/plugin-react` for React, `@vitejs/plugin-vue` for Vue).

### HTML Entry Point

Create `mcp-app.html` as the entry point for the MCP App build:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MCP App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/mcp-app.ts"></script>
  </body>
</html>
```

If the web app already uses Vite, add `vite-plugin-singlefile` and create a separate entry point. If it uses another bundler, add a Vite config alongside for the MCP App build.

### Two-Phase Build

1. Vite bundles the UI → `dist/mcp-app.html` (single file with all assets inlined)
2. Server is compiled separately (TypeScript → JavaScript)

## Step 5: Replace Data Sources with MCP App Lifecycle

This is the core conversion step. Replace the web app's data sources with MCP App lifecycle handlers.

### URL Parameters → `ontoolinput`

```typescript
// Before:
const query = new URL(location.href).searchParams.get("q");
renderApp(query);

// After:
app.ontoolinput = (params) => {
  const query = params.arguments?.q;
  renderApp(query);
};
```

### API Fetch → `app.callServerTool()`

```typescript
// Before:
const data = await fetch("/api/data").then(r => r.json());

// After:
const result = await app.callServerTool("fetch-data", {});
const data = result.structuredContent;
```

Or keep direct API calls with CSP `connectDomains`:

```typescript
// API calls can stay if the API is external and the CSP declares the domain
// Declare connectDomains: ["api.example.com"] in the resource registration
```

### Props / Component Inputs → `ontoolinput`

```typescript
// Before (e.g., passed via parent frame or global):
const config = window.__APP_CONFIG__;

// After:
app.ontoolinput = (params) => {
  const config = params.arguments;
  initApp(config);
};
```

### localStorage / sessionStorage → `structuredContent`

```typescript
// Before:
const saved = localStorage.getItem("settings");

// After — pass via tool result:
app.ontoolresult = (result) => {
  const settings = result.structuredContent?.settings;
  applySettings(settings);
};
```

### Complete Conversion Example

```typescript
import { App, PostMessageTransport, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } from "@modelcontextprotocol/ext-apps";

const app = new App({ name: "My App", version: "1.0.0" });

// Register ALL handlers BEFORE connect()
app.ontoolinput = (params) => {
  // Replace URL params / props with tool arguments
  renderApp(params.arguments);
};

app.ontoolresult = (result) => {
  // Replace API responses with structured content
  updateApp(result.structuredContent);
};

app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.safeAreaInsets) {
    const { top, right, bottom, left } = ctx.safeAreaInsets;
    document.body.style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
  }
};

app.onteardown = async () => {
  return {};
};

await app.connect(new PostMessageTransport());
```

## Step 6: Add Host Styling Integration

Replace hardcoded styles with host CSS variables for theme consistency.

**Vanilla JS** — use helper functions:
```typescript
import { applyDocumentTheme, applyHostStyleVariables, applyHostFonts } from "@modelcontextprotocol/ext-apps";

app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
};
```

**React** — use hooks:
```typescript
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";

const { app } = useApp({ appInfo, capabilities, onAppCreated });
useHostStyles(app);
```

**Using variables in CSS** — after applying, use `var()` with fallbacks for standalone testing:

```css
.container {
  background: var(--color-background-secondary, #f5f5f5);
  color: var(--color-text-primary, #333);
  font-family: var(--font-sans, system-ui);
  border-radius: var(--border-radius-md, 8px);
}
```

Key variable groups: `--color-background-*`, `--color-text-*`, `--color-border-*`, `--font-sans`, `--font-mono`, `--font-text-*-size`, `--font-heading-*-size`, `--border-radius-*`. See `src/spec.types.ts` for the full list.

## Optional Enhancements

### App-Only Helper Tools

For data the UI needs to poll or fetch that the model doesn't need to call directly:

```typescript
registerAppTool(server, "refresh-data", {
  description: "Fetches latest data for the UI",
  _meta: { ui: { resourceUri, visibility: ["app"] } },
}, async () => {
  const data = await getLatestData();
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
});
```

The UI calls these via `app.callServerTool("refresh-data", {})`.

### Streaming Partial Input

For large tool inputs, use `ontoolinputpartial` to show progress during LLM generation:

```typescript
app.ontoolinputpartial = (params) => {
  const args = params.arguments; // Healed partial JSON - always valid
  renderPreview(args);
};

app.ontoolinput = (params) => {
  renderFull(params.arguments);
};
```

### Fullscreen Mode

```typescript
app.onhostcontextchanged = (ctx) => {
  if (ctx.availableDisplayModes?.includes("fullscreen")) {
    fullscreenBtn.style.display = "block";
  }
  if (ctx.displayMode) {
    container.classList.toggle("fullscreen", ctx.displayMode === "fullscreen");
  }
};

async function toggleFullscreen() {
  const newMode = currentMode === "fullscreen" ? "inline" : "fullscreen";
  const result = await app.requestDisplayMode({ mode: newMode });
  currentMode = result.mode;
}
```

### Text Fallback

Always provide a `content` array for non-UI hosts:

```typescript
return {
  content: [{ type: "text", text: "Fallback description of the result" }],
  structuredContent: { /* data for the UI */ },
};
```

## Common Mistakes to Avoid

1. **Forgetting CSP declarations for external origins** — fails silently in the sandboxed iframe
2. **Using `localStorage` / `sessionStorage`** — not available in sandboxed iframe; move to `structuredContent` or server-side state
3. **Missing `vite-plugin-singlefile`** — external assets won't load in the iframe
4. **Registering handlers after `connect()`** — register ALL handlers BEFORE calling `app.connect()`
5. **Hardcoding styles** — use host CSS variables for theme integration
6. **Not handling safe area insets** — always apply `ctx.safeAreaInsets` in `onhostcontextchanged`
7. **Forgetting text `content` fallback** — always provide `content` array for non-UI hosts
8. **Forgetting resource registration** — the tool references a `resourceUri` that must have a matching resource

## Testing

### Using basic-host

Test the converted app with the basic-host example:

```bash
# Terminal 1: Build and run your server
npm run build && npm run serve

# Terminal 2: Run basic-host (from cloned repo)
cd /tmp/mcp-ext-apps/examples/basic-host
npm install
SERVERS='["http://localhost:3001/mcp"]' npm run start
# Open http://localhost:8080
```

Configure `SERVERS` with a JSON array of your server URLs (default: `http://localhost:3001/mcp`).

### Verify

1. App loads without console errors
2. `ontoolinput` handler fires with tool arguments
3. `ontoolresult` handler fires with tool result
4. Host styling (theme, fonts, colors) applies correctly
5. External resources load (if CSP domains are configured)
