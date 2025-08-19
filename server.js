/**
 * mcp-streamable-test server.js
 * Version: v0.0.12
 *
 * Purpose:
 * - JSON-RPC 2.0 over HTTP for MCP handshake + tools
 * - Includes serverInfo + instructions in initialize (per MCPO needs)
 * - Robust method normalization and detailed debug logs (req/resp first 2KB)
 * - Accepts both "/mcp" and "/mcp/" (trailing slash tolerated)
 * - Supports both legacy ("list_tools", "call_tool") and spec-style ("tools/list", "tools/call") methods
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
const VERSION = '0.0.12';
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
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase();
}

function log(...args) {
  const ts = new Date().toISOString();
  console.log(`[${ts}]`, ...args);
}

function logBody(prefix, objOrStr) {
  try {
    const s = typeof objOrStr === 'string' ? objOrStr : JSON.stringify(objOrStr);
    const snip = s.length > 2048 ? s.slice(0, 2048) + ' ...[truncated]' : s;
    log(prefix, snip);
  } catch (e) {
    log(prefix, '[unprintable]', String(e));
  }
}

function sendJson(res, status, obj) {
  // Always send a single JSON-RPC object body, nothing else
  logBody('HTTP RESP body:', obj);
  const data = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function makeError(id, code, message, data) {
  const err = { jsonrpc: '2.0', error: { code, message } };
  if (id !== undefined && id !== null) err.id = id;
  if (data !== undefined) err.error.data = data;
  return err;
}

// Path normalization to tolerate trailing slash
function normalizePath(p) {
  if (!p) return '/';
  return p.endsWith('/') && p.length > 1 ? p.slice(0, -1) : p;
}

// ---------- JSON-RPC Handlers ----------
async function handleInitialize(id, params) {
  return {
    jsonrpc: '2.0',
    id,
    result: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      serverInfo: { name: SERVER_NAME, version: VERSION },
      instructions: 'Streamable test MCP server for n8n-mcp integration.',
    },
  };
}

async function handleListTools(id) {
  try {
    const tools = [
      {
        name: 'time',
        description: 'Returns the current UTC time in ISO 8601 format.',
        inputSchema: {
          type: 'object',
          properties: { echo: { type: 'string' } },
          required: [],
          additionalProperties: false,
        },
        outputSchema: {
          type: 'object',
          properties: { now_utc: { type: 'string' }, echo: { type: 'string' } },
          required: ['now_utc'],
          additionalProperties: false,
        },
      },
    ];
    return { jsonrpc: '2.0', id, result: { tools } };
  } catch (e) {
    return makeError(id, -32603, 'Internal error in list_tools', { message: String(e) });
  }
}

async function handleCallTool(id, params) {
  const toolName = params && typeof params.name === 'string' ? params.name : '';
  const args = (params && params.arguments) || {};
  if (toolName !== 'time') {
    return makeError(id, -32601, `Tool not found: ${toolName}`);
  }
  const payload = { now_utc: nowUtcIso() };
  if (typeof args.echo === 'string' && args.echo.length) payload.echo = args.echo;
  return {
    jsonrpc: '2.0',
    id,
    result: { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: false },
  };
}

// ---------- Router ----------
async function handleRpc(req, res, body) {
  const parsed = safeJsonParse(body);
  if (!parsed) {
    log('Parse error: body not valid JSON');
    return sendJson(res, 400, makeError(null, -32700, 'Parse error'));
  }

  const { jsonrpc, method, id, params } = parsed;
  if (jsonrpc !== '2.0') {
    log('Invalid Request: jsonrpc must be "2.0"', parsed);
    return sendJson(res, 400, makeError(id, -32600, 'Invalid Request: jsonrpc must be "2.0"'));
  }

  const rawMethod = typeof method === 'string' ? method : '';
  const normMethod = normalizeMethod(rawMethod);

  log('RPC id:', id);
  log('RPC raw method:', rawMethod);
  log('RPC norm method:', normMethod);
  logBody('RPC params:', params);

  try {
    if (normMethod === 'initialize') {
      const response = await handleInitialize(id, params);
      return sendJson(res, 200, response);
    }
    if (normMethod === 'list_tools' || normMethod === 'list-tools' || normMethod === 'tools/list') {
      const response = await handleListTools(id);
      return sendJson(res, 200, response);
    }
    if (normMethod === 'call_tool' || normMethod === 'call-tool' || normMethod === 'tools/call') {
      const response = await handleCallTool(id, params || {});
      return sendJson(res, 200, response);
    }

    if (!rawMethod) {
      return sendJson(res, 200, makeError(id, -32601, 'Method not found: <empty>'));
    }
    return sendJson(res, 200, makeError(id, -32601, `Method not found: ${rawMethod}`));
  } catch (err) {
    log('Handler error:', err && err.stack ? err.stack : err);
    return sendJson(res, 200, makeError(id, -32603, 'Internal error', { message: String(err) }));
  }
}

// ---------- HTTP Server ----------
const server = http.createServer((req, res) => {
  const { method } = req;
  const parsedUrl = url.parse(req.url, true);

  const reqPath = normalizePath(parsedUrl.pathname);
  const basePath = normalizePath(PATH_PREFIX);

  if (method === 'POST' && reqPath === basePath) {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2e6) {
        log('Body too large; closing connection');
        req.connection.destroy();
      }
    });
    req.on('end', async () => {
      log('HTTP POST', reqPath, 'Content-Type:', req.headers['content-type'] || '<none>');
      logBody('HTTP REQ body:', body);
      await handleRpc(req, res, body);
    });
    return;
  }

  if (method === 'GET' && reqPath === '/health') {
    return sendJson(res, 200, { status: 'ok', name: SERVER_NAME, version: VERSION });
  }
  if (method === 'GET' && reqPath === '/') {
    const msg = `${SERVER_NAME} v${VERSION} - JSON-RPC at ${PATH_PREFIX}\n`;
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(msg);
    return;
  }

  sendJson(res, 404, { error: 'Not Found', path: parsedUrl.pathname });
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
