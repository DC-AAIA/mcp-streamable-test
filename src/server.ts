import express from "express";

const app = express();
app.use(express.json());

const PATH = process.env.MCP_ENDPOINT || "/mcp";

app.post(PATH, (req, res) => {
  const body = req.body || {};
  const method = body.method as string | undefined;
  const id = body.id as string | number | undefined;

  // Treat anything without a proper id as a notification: return 204
  if (id === undefined || id === null || (typeof id !== "string" && typeof id !== "number")) {
    return res.status(204).end();
  }

  // If method is missing or not a string, also treat as notification
  if (typeof method !== "string") {
    return res.status(204).end();
  }

  // Explicitly ignore MCP notifications
  if (method.startsWith("notifications/")) {
    return res.status(204).end();
  }

  if (method === "initialize") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "mcp-streamable-test", version: "0.1.0" },
        capabilities: { tools: {} }
      }
    });
  }

  if (method === "tools/list") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "time",
            description: "Returns current server time (ISO-8601).",
            inputSchema: { type: "object", properties: {}, additionalProperties: false }
          }
        ]
      }
    });
  }

  if (method === "tools/call" && body.params?.name === "time") {
    const now = new Date().toISOString();
    return res.json({
      jsonrpc: "2.0",
      id,
      result: { content: [{ type: "text", text: now }] }
    });
  }

  // Unknown request with id present
  return res.status(200).json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: "Method not found" }
  });
});

const port = Number(process.env.PORT || 8080);
app.listen(port, "0.0.0.0", () => {
  console.log(`mcp-streamable-test listening on ${port} at ${PATH}`);
});
