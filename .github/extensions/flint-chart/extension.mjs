import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, joinSession } from "@github/copilot-sdk/extension";

const extensionDirectory = dirname(fileURLToPath(import.meta.url));
const chartAppPath = join(extensionDirectory, "assets", "flint-app.html");
const skillDirectory = join(extensionDirectory, "skills");
const canvases = new Map();

function defaultInput() {
    const services = ["Notifications", "Payments", "Checkout API", "Auth Service"];
    const severities = ["SEV1", "SEV2", "SEV3", "SEV4"];
    return {
        data: {
            values: services.flatMap((service, serviceIndex) =>
                severities.flatMap((severity, severityIndex) =>
                    Array.from({ length: 6 }, (_, sampleIndex) => ({
                        service,
                        severity,
                        timeToMitigate: 20 + (3 - severityIndex) * 35 + serviceIndex * 11 + sampleIndex * 8,
                    })),
                ),
            ),
        },
        semantic_types: {
            severity: "Ordinal",
            service: "Nominal",
            timeToMitigate: "Quantity",
        },
        chart_spec: {
            chartType: "Boxplot",
            baseSize: { width: 560, height: 360 },
            encodings: {
                x: { field: "severity" },
                y: { field: "timeToMitigate" },
                color: { field: "service" },
            },
        },
    };
}

function chartInput(input) {
    const candidate = input?.chart_spec ? input : input?.input;
    if (
        candidate?.chart_spec &&
        Array.isArray(candidate?.data?.values)
    ) {
        return candidate;
    }
    return defaultInput();
}

function scriptSafeJson(value) {
    return JSON.stringify(value)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026");
}

function renderBridgeHtml(instance) {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Flint Chart Canvas</title>
    <style>
      html, body, iframe { border: 0; height: 100%; margin: 0; width: 100%; }
      body { background: #1f232b; }
    </style>
  </head>
  <body>
    <iframe id="flint-app" src="/app" title="Flint Chart Canvas"></iframe>
    <script>
      const chartInput = ${scriptSafeJson(instance.input)};
      const frame = document.getElementById("flint-app");

      window.addEventListener("message", (event) => {
        if (event.source !== frame.contentWindow || !event.data?.method) return;
        const message = event.data;
        if (message.method === "ui/initialize") {
          event.source.postMessage({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              protocolVersion: message.params.protocolVersion,
              hostInfo: { name: "Copilot Flint plugin", version: "0.2.2" },
              hostCapabilities: { message: { text: {} } },
              hostContext: { theme: "dark", displayMode: "inline" }
            }
          }, "*");
          event.source.postMessage({
            jsonrpc: "2.0",
            method: "ui/notifications/tool-input",
            params: { arguments: chartInput }
          }, "*");
          return;
        }
        if (message.method === "ui/message") {
          void fetch("/message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(message.params)
          });
        }
        if (message.id !== undefined) {
          event.source.postMessage({ jsonrpc: "2.0", id: message.id, result: {} }, "*");
        }
      });
    </script>
  </body>
</html>`;
}

function messageText(params) {
    const content = params?.content;
    if (!Array.isArray(content)) return "Updated Flint chart from the chart canvas.";
    return content
        .filter((item) => item?.type === "text" && typeof item.text === "string")
        .map((item) => item.text)
        .join("\n")
        || "Updated Flint chart from the chart canvas.";
}

async function startCanvasServer(instanceId, input, session) {
    const appHtml = await readFile(chartAppPath, "utf8");
    const instance = { input };
    const server = createServer(async (request, response) => {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (request.method === "GET" && url.pathname === "/") {
            response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            response.end(renderBridgeHtml(instance));
            return;
        }
        if (request.method === "GET" && url.pathname === "/app") {
            response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            response.end(appHtml);
            return;
        }
        if (request.method === "POST" && url.pathname === "/message") {
            const body = [];
            for await (const chunk of request) body.push(chunk);
            try {
                const params = JSON.parse(Buffer.concat(body).toString("utf8"));
                await session.send({ prompt: messageText(params) });
                response.writeHead(204).end();
            } catch (error) {
                await session.log(
                    `Flint chart canvas could not send the edited chart: ${error instanceof Error ? error.message : String(error)}`,
                    { level: "error" },
                );
                response.writeHead(500).end();
            }
            return;
        }
        response.writeHead(404).end();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { instance, server, url: `http://127.0.0.1:${port}/` };
}

const session = await joinSession({
    mcpServers: {
        flint: {
            type: "local",
            command: "npx",
            args: ["--yes", "flint-chart-mcp"],
            tools: ["*"],
        },
    },
    skillDirectories: [skillDirectory],
    canvases: [
        createCanvas({
            id: "flint-chart",
            displayName: "Flint Chart Canvas",
            description: "Interactive Flint chart workspace with a live preview and Vega-Lite output.",
            inputSchema: {
                type: "object",
                additionalProperties: true,
            },
            open: async (ctx) => {
                const input = chartInput(ctx.input);
                let entry = canvases.get(ctx.instanceId);
                if (!entry) {
                    entry = await startCanvasServer(ctx.instanceId, input, session);
                    canvases.set(ctx.instanceId, entry);
                } else {
                    entry.instance.input = input;
                }
                return {
                    title: "Flint Chart Canvas",
                    url: `${entry.url}?revision=${Date.now()}`,
                };
            },
            onClose: async (ctx) => {
                const entry = canvases.get(ctx.instanceId);
                if (!entry) return;
                canvases.delete(ctx.instanceId);
                await new Promise((resolve) => entry.server.close(resolve));
            },
        }),
    ],
});
