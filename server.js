/**
 * mcp-streamable-test server.js
 * Version: v0.0.9
 *
 * Purpose:
 * - JSON-RPC 2.0 over HTTP for MCP handshake + tools
 * - Adds serverInfo and instructions to initialize result (mcpo schema)
 * - Robust method normalization and detailed debug logs
 * - NEW: Tolerate both "/mcp" and "/mcp/" paths (trailing slash accepted)
 *
 * Endpoints:
 *   POST /mcp   (JSON-RPC 2.0)
 *
 * Tools supported:
 *   - time: returns current UTC time (ISO 8601)
 *
 * Environment:
 *   PORT (default 8080)
 *   PATH_PREFIX (default '/mcp')
 */

const http = require('http');
const url = require('url');

// ---------- Config ----------
const VERSION = '0.0.9';
const SERVER_NAME = 'mcp-streamable-test';
const PROTOCOL_VERSION = '2025-06-18';
const PATH_PREFIX = process.env.PATH_PREFIX || '/mcp';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

// ---------- Utilities ----------
function nowUtcIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function safeJsonParse(body) {
  try {
    return JSON.parse(body);
  } catch (e) {
    return null;
  }
}

function normalizeMethod(m) {
  if (typeof m !== 'string') return '';
  return m
    .normalize('NFKC')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '') // remove zero-width chars
    .trim()
    .toLowerCase();
}

function sendJson(res, status, obj) {
  const data = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function makeError(id, code, message, data) {
  const err = {
    jsonrpc: '2.0',
    error: { code, message },
  };
  if (id !== undefined && id !== null) err.id = id;
  if (data !== undefined) err.error.data = data;
  return err;
}

function log(...args) {
  const ts = new Date().toISOString();
  console.log(`[${ts}]`, ...args);
}

// Normalize a path to tolerate trailing slash (e.g., "/mcp" and "/mcp/")
function normalizePath(p) {
  if (!p) return '/';
  return p.endsWith('/') && p.length > 1 ? p.slice(0, -1) : p;
}

// ---------- JSON-RPC Handlers ----------
async function handleInitialize(id, params) {
  log('initialize params:', params);

  return {
    jsonrpc: '2.0',
    id,
    result: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      serverInfo: {
        name: SERVER_NAME,
        version: VERSION,
      },
      instructions: 'Streamable test MCP server for n8n-mcp integration.',
    },
  };
}

async function handleListTools(id) {
  const tools = [
    {
      name: 'time',
      description: 'Returns the current UTC time in ISO 8601 format.',
      inputSchema: {
        type: 'object',
        properties: {
          echo: { type: 'string' },
        },
        required: [],
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: {
          now_utc: { type: 'string' },
          echo: { type: 'string' },
        },
        required: ['now_utc'],
        additionalProperties: false,
      },
    },
  ];
  return {
    jsonrpc: '2.0',
    id,
    result: { tools },
  };
}

async function handleCallTool(id, params) {
  log('call_tool params:', params);

  const toolName = params && typeof params.name === 'string' ? params.name : '';
  const args = (params && params.arguments) || {};

  if (toolName !== 'time') {
    return makeError(id, -32601, `Tool not found: ${toolName}`);
  }

  const payload = {
    now_utc: nowUtcIso(),
  };
  if (typeof args.echo === 'string' && args.echo.length) {
    payload.echo = args.echo;
  }

  return {
    jsonrpc: '2.0',
    id,
    result: {
      content: [
        {
          type: 'text',
          text: JSON.stringify(payload),
        },
      ],
      isError: false,
    },
  };
}

// ---------- Router ----------
async function handleRpc(req, res, body) {
  const parsed = safeJsonParse(body);
  if (!parsed) {
    return sendJson(res, 400, makeError(null, -32700, 'Parse error'));
  }

  const { jsonrpc, method, id, params } = parsed;

  if (jsonrpc !== '2.0') {
    return sendJson(res, 400, makeError(id, -32600, 'Invalid Request: jsonrpc must be "2.0"'));
  }
  if (!method) {
    return sendJson(res, 400, makeError(id, -32600, 'Invalid Request: method required'));
  }

  const rawMethod = typeof method === 'string' ? method : '';
  const normMethod = normalizeMethod(rawMethod);

  log('DEBUG jsonrpc:', jsonrpc);
  log('DEBUG id:', id);
  log('DEBUG raw method:', rawMethod);
  log('DEBUG normalized method:', normMethod);
  log('DEBUG params :', params);

  try {
    if (normMethod === 'initialize') {
      log('Matched: initialize');
      const response = await handleInitialize(id, params);
      return sendJson(res, 200, response);
    }
    if (normMethod === 'list_tools' || normMethod === 'list-tools') {
      log('Matched: list_tools');
      const response = await handleListTools(id);
      return sendJson(res, 200, response);
    }
    if (normMethod === 'call_tool' || normMethod === 'call-tool') {
      log('Matched: call_tool');
      const response = await handleCallTool(id, params || {});
      return sendJson(res, 200, response);
    }
    log('Method not found:', rawMethod);
    return sendJson(res, 404, makeError(id, -32601, `Method not found: ${rawMethod}`));
  } catch (err) {
    log('Handler error:', err && err.stack ? err.stack : err);
    return sendJson(res, 500, makeError(id, -32603, 'Internal error', { message: String(err) }));
  }
}

// ---------- HTTP Server ----------
const server = http.createServer((req, res) => {
  const { method } = req;
  const parsedUrl = url.parse(req.url, true);

  // Normalize incoming path and base path to tolerate trailing slash
  const reqPath = normalizePath(parsedUrl.pathname);
  const basePath = normalizePath(PATH_PREFIX);

  if (method === 'POST' && reqPath === basePath) {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.connection.destroy();
      }
    });
    req.on('end', () => handleRpc(req, res, body));
    return;
  }

  // Simple health and info routes
  if (method === 'GET' && reqPath === '/health') {
    return sendJson(res, 200, { status: 'ok', name: SERVER_NAME, version: VERSION });
  }
  if (method === 'GET' && reqPath === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`${SERVER_NAME} v${VERSION} - JSON-RPC at ${PATH_PREFIX}\n`);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Not Found', path: parsedUrl.pathname }));
});

// ---------- Startup ----------
server.listen(PORT, () => {
  log(`v${VERSION} handler active!`);
  log(`${SERVER_NAME} listening on ${PORT} at ${PATH_PREFIX}`);
});

process.on('SIGTERM', () => {
  log('SIGTERM received, shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  log('SIGINT received, shutting down...');
  server.close(() => process.exit(0));
});
