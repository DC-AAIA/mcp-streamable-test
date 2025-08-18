const express = require("express");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 8080;

// Parse JSON bodies
app.use(bodyParser.json());

// Error handler for invalid JSON
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    console.error("Invalid JSON received:", req.body);
    return res.status(400).json({ error: "Invalid JSON" });
  }
  next();
});

// Helpers
function makeResponse(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function makeError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// MCP endpoint
app.post("/mcp", (req, res) => {
  const { jsonrpc, id, method, params } = req.body;

  if (jsonrpc !== "2.0") {
    return res.json(makeError(id, -32600, "Invalid JSON-RPC version"));
  }

  // list_tools
  if (method === "list_tools") {
    return res.json(
      makeResponse(id, {
        tools: [
          {
            name: "time",
            description: "Returns current UTC timestamp",
            inputSchema: { type: "object", properties: {} }
          }
        ]
      })
    );
  }

  // call_tool
  if (method === "call_tool") {
    if (params?.name === "time") {
      return res.json(
        makeResponse(id, {
          content: [{ type: "text", text: new Date().toISOString() }]
        })
      );
    }
    return res.json(makeError(id, -32601, "Unknown tool"));
  }

  // Fallback
  return res.json(makeError(id, -32601, "Method not found"));
});

// Health route
app.get("/", (req, res) => {
  res.send("MCP Streamable HTTP server is running");
});

// Start server — must bind to 0.0.0.0 for Railway
app.listen(PORT, "0.0.0.0", () => {
  console.log(`MCP server listening on port ${PORT} at /mcp`);
});
