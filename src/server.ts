import express from "express";

const app = express();
app.use(express.json());

const PATH = process.env.MCP_ENDPOINT || "/mcp";

app.post(PATH, (req, res) => {
  const body = req.body || {};
  const method = body.method;

  if (method === "initialize") {
  return res.json({
    jsonrpc: "2.0",
    id: body.id ?? null,
    result: {
      protocolVersion: "2024-11-05",
      serverInfo: { name: "mcp-streamable-test", version: "0.1.0" },
      capabilities: {
        tools: {} // advertise tools capability (minimal OK)
      }
    }
  });
}

  if (method === "tools/list") {
    return res.json({
      jsonrpc: "2.0",
      id: body.id ?? null,
      result: {
        tools: [
          {
            name: "time",
            description: "Returns current server time.",
            inputSchema: { type: "object", properties: {} }
          }
        ]
      }
    });
  }

  if (method === "tools/call" && body.params?.name === "time") {
    return res.json({
      jsonrpc: "2.0",
      id: body.id ?? null,
      result: { content: new Date().toISOString() }
    });
  }

  return res.status(200).json({
    jsonrpc: "2.0",
    id: body.id ?? null,
    error: { code: -32601, message: "Method not found" }
  });
});

const port = Number(process.env.PORT || 8080);
app.listen(port, "0.0.0.0", () => {
  console.log(`mcp-streamable-test listening on ${port} at ${PATH}`);
});
