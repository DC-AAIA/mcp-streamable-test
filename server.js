const express = require("express");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 8080;

// Parse JSON globally
app.use(bodyParser.json());

// Invalid JSON handler
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    console.error("Invalid JSON received:", req.body);
    return res.status(400).json({ error: "Invalid JSON" });
  }
  next();
});

// Helpers for JSON-RPC
function makeResponse(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function makeError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// MCP endpoint with debug logging
app.post("/mcp", express.json(), (req, res) => {
  console.log("Raw body:", req.body);

  let { jsonrpc, id, method, params } = req.body;

  console.log("Parsed method:", method);

  if (typeof method !== "string") {
    return res.json(makeError(id || null, -32601, "Method missing or not a string"));
  }

  if (jsonrpc !== "2.0") {
    return res.json(makeError(id, -32600, "Invalid JSON-RPC version"));
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

// Simple healthcheck
app.get("/", (req, res) => {
  res.send("MCP Streamable HTTP server is running");
});

// Start server — Railway requires 0.0.0.0
app.listen(PORT, "0.0.0.0", () => {
  console.log(`mcp-streamable-test listening on ${PORT} at /mcp`);
});
