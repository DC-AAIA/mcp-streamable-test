const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;

// 🔥 Marker Log: proves v0.0.7 code is running
console.log("🔥 v0.0.7 handler active!");

// Parse JSON bodies
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

  // Force normalization into a primitive string
  const methodName = String(method || "").trim().toLowerCase();

  // Debug logs
  console.log("DEBUG jsonrpc:", jsonrpc);
  console.log("DEBUG id:", id);
  console.log("DEBUG raw method:", method);
  console.log("DEBUG normalized methodName:", methodName);
  console.log("DEBUG params:", params);

  if (jsonrpc !== "2.0") {
    return res.json(makeError(id, -32600, "Invalid JSON-RPC version"));
  }

  if (methodName === "initialize") {
    console.log("Matched: initialize");
    console.log("🔥 Entered initialize handler");
    return res.json(
      makeResponse(id, {
        protocolVersion: params?.protocolVersion || "2025-06-18",
        capabilities: {}
      })
    );
  }

  if (methodName === "list_tools") {
    console.log("Matched: list_tools");
    console.log("🔥 Entered list_tools handler");
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

  if (methodName === "call_tool") {
    console.log("Matched: call_tool with params", params);
    console.log("🔥 Entered call_tool handler");
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

// Health check route
app.get("/", (req, res) => {
  res.send("MCP Streamable HTTP server is running");
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`mcp-streamable-test listening on ${PORT} at /mcp`);
});

// Export for test harness compatibility
module.exports = app;
