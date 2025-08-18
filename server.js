import express from "express";
import bodyParser from "body-parser";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json());

function makeResponse(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function makeError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

app.post("/mcp", (req, res) => {
  const { jsonrpc, id, method, params } = req.body;

  if (jsonrpc !== "2.0") {
    return res.json(makeError(id, -32600, "Invalid JSON-RPC version"));
  }

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

  return res.json(makeError(id, -32601, "Method not found"));
});

app.get("/", (req, res) => {
  res.send("MCP Streamable HTTP server is running");
});

app.listen(PORT, () => {
  console.log(`MCP server listening on port ${PORT} at /mcp`);
});
