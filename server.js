const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;

// Parse JSON bodies globally
app.use(express.json());

// Helpers
function makeResponse(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function makeError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// MCP endpoint
app.post("/mcp", (req, res) => {
  console.log("Raw body:", req.body);

  let { jsonrpc, id, method, params } = req.body || {};

  // 🔎 New debug logs
  console.log("DEBUG jsonrpc:", jsonrpc);
  console.log("DEBUG id:", id);
  console.log("DEBUG method:", method);
  console.log("DEBUG params:", params);

  console.log("Parsed method:", method);

  if (jsonrpc !== "2.0") {
    return res.json(makeError(id, -32600, "Invalid JSON-RPC version"));
  }

  if (method === "initialize") {
    console.log("Matched: initialize");
    console.log("🔥 Entered initialize handler");
    return res.json(
      makeResponse(id, {
        protocolVersion: params?.protocolVersion || "2025-06-18",
        capabilities: {}
      })
    );
  }

  if (method === "list_tools") {
    console.log("Matched: list_tools");
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

  if (method === "call_tool") {
    console.log("Matched: call_tool with params", params);
    if (params?.name === "time") {
      return res.json(
        makeResponse(id, {
          content: [{ type: "text", text: new Date().toISOString() }]
        })
      );
    }
    return res.json(makeError(id, -32601, "Unknown tool"));
  }

  return res.json(makeError(id, -32601, "Method not found"));
});

// Health route
app.get("/", (req, res) => {
  res.send("MCP Streamable HTTP server is running");
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`mcp-streamable-test listening on ${PORT} at /mcp`);
});

// Export for test harness compatibility
module.exports = app;
