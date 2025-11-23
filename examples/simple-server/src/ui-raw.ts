import {
  McpUiInitializeRequest,
  McpUiInitializeResult,
  McpUiInitializedNotification,
  McpUiToolResultNotification,
  McpUiHostContextChangedNotification,
  McpUiToolInputNotification,
  McpUiSizeChangeNotification,
  McpUiMessageRequest,
  McpUiMessageResult,
  McpUiOpenLinkRequest,
  McpUiOpenLinkResult,
} from "@modelcontextprotocol/ext-apps";
import {
  CallToolRequest,
  CallToolResult,
  JSONRPCMessage,
  LoggingMessageNotification,
} from "@modelcontextprotocol/sdk/types.js";

const app = (() => {
  let nextId = 1;
  return {
    sendRequest({ method, params }: { method: string; params: any }) {
      const id = nextId++;
      window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
      return new Promise((resolve, reject) => {
        window.addEventListener("message", function listener(event) {
          const data: JSONRPCMessage = event.data;
          if (event.data?.id === id) {
            window.removeEventListener("message", listener);
            if (event.data?.result) {
              resolve(true);
            } else if (event.data?.error) {
              reject(new Error(event.data.error));
            }
          } else {
            reject(new Error(`Unsupported message: ${JSON.stringify(data)}`));
          }
        });
      });
    },
    sendNotification({ method, params }: { method: string; params: any }) {
      window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
    },
    onNotification(method: string, handler: (params: any) => void) {
      window.addEventListener("message", function listener(event) {
        if (event.data?.method === method) {
          handler(event.data.params);
        }
      });
    },
  };
})();

window.addEventListener("load", async () => {
  const root = document.getElementById("root")!;
  const appendText = (textContent: string, opts = {}) => {
    root.appendChild(
      Object.assign(document.createElement("div"), {
        textContent,
        ...opts,
      }),
    );
  };
  const appendError = (error: unknown) =>
    appendText(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
      { style: "color: red;" },
    );

  app.onNotification(
    "ui/notifications/tool-result" as McpUiToolResultNotification["method"],
    async (params: McpUiToolResultNotification["params"]) => {
      appendText(`Tool call result: ${JSON.stringify(params)}`);
    },
  );
  app.onNotification(
    "ui/notifications/host-context-changed" as McpUiHostContextChangedNotification["method"],
    async (params: McpUiHostContextChangedNotification["params"]) => {
      appendText(`Host context changed: ${JSON.stringify(params)}`);
    },
  );
  app.onNotification(
    "ui/notifications/tool-input" as McpUiToolInputNotification["method"],
    async (params: McpUiToolInputNotification["params"]) => {
      appendText(`Tool call input: ${JSON.stringify(params)}`);
    },
  );

  const initializeResult = (await app.sendRequest(<McpUiInitializeRequest>{
    method: "ui/initialize",
    params: {
      appCapabilities: {},
      appInfo: { name: "My UI", version: "1.0.0" },
      protocolVersion: "2025-06-18",
    },
  })) as McpUiInitializeResult;

  app.sendNotification(<McpUiInitializedNotification>{
    method: "ui/notifications/initialized",
    params: {},
  });

  new ResizeObserver(() => {
    const { body, documentElement: html } = document;

    const bodyStyle = getComputedStyle(body);
    const htmlStyle = getComputedStyle(html);

    const width = body.scrollWidth;
    const height =
      body.scrollHeight +
      (parseFloat(bodyStyle.borderTop) || 0) +
      (parseFloat(bodyStyle.borderBottom) || 0) +
      (parseFloat(htmlStyle.borderTop) || 0) +
      (parseFloat(htmlStyle.borderBottom) || 0);

    app.sendNotification(<McpUiSizeChangeNotification>{
      method: "ui/notifications/size-change",
      params: { width, height },
    });
  }).observe(document.body);

  root.appendChild(
    Object.assign(document.createElement("button"), {
      textContent: "Get Weather (Tool)",
      onclick: async () => {
        try {
          const result = (await app.sendRequest(<CallToolRequest>{
            method: "tools/call",
            params: {
              name: "get-weather",
              arguments: { location: "Tokyo" },
            },
          })) as CallToolResult;

          appendText(`Weather tool result: ${JSON.stringify(result)}`);
        } catch (e) {
          appendError(e);
        }
      },
    }),
  );

  root.appendChild(
    Object.assign(document.createElement("button"), {
      textContent: "Notify Cart Updated",
      onclick: async () => {
        app.sendNotification(<LoggingMessageNotification>{
          method: "notifications/message",
          params: {
            level: "info",
            data: "cart-updated",
          },
        });
      },
    }),
  );

  root.appendChild(
    Object.assign(document.createElement("button"), {
      textContent: "Prompt Weather in Tokyo",
      onclick: async () => {
        try {
          const { isError } = (await app.sendRequest(<McpUiMessageRequest>{
            method: "ui/message",
            params: {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "What is the weather in Tokyo?",
                },
              ],
            },
          })) as McpUiMessageResult;

          appendText(`Message result: ${isError ? "error" : "success"}`);
        } catch (e) {
          appendError(e);
        }
      },
    }),
  );

  root.appendChild(
    Object.assign(document.createElement("button"), {
      textContent: "Open Link to Google",
      onclick: async () => {
        try {
          const { isError } = (await app.sendRequest(<McpUiOpenLinkRequest>{
            method: "ui/open-link",
            params: {
              url: "https://www.google.com",
            },
          })) as McpUiOpenLinkResult;
          appendText(`Link result: ${isError ? "error" : "success"}`);
        } catch (e) {
          appendError(e);
        }
      },
    }),
  );

  console.log("Initialized with host info:", initializeResult.hostInfo);
});
