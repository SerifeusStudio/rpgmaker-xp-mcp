// Smoke test: spawn the MCP server over stdio and run an initialize /
// tools-list / tool-call sequence against the scratch project.
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const PROJECT = process.argv[2] ?? join(here, 'scratch-project');

const server = spawn(process.execPath, [join(here, '..', 'dist', 'index.js')], {
  env: { ...process.env, RPGMAKER_PROJECT_PATH: PROJECT },
  stdio: ['pipe', 'pipe', 'inherit'],
});

let buffer = '';
const pending = new Map();
server.stdout.on('data', chunk => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

let nextId = 1;
function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 10000);
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

try {
  const init = await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke-test', version: '1.0.0' },
  });
  console.log(`initialize OK: ${init.result.serverInfo.name} v${init.result.serverInfo.version}`);
  if (!init.result.instructions || init.result.instructions.length < 200) {
    throw new Error('initialize missing server instructions');
  }
  if (!init.result.capabilities?.resources) throw new Error('server does not advertise resources capability');
  console.log(`instructions OK: ${init.result.instructions.length} chars`);
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const tools = await request('tools/list', {});
  console.log(`tools/list OK: ${tools.result.tools.length} tools`);

  const resources = await request('resources/list', {});
  const uris = resources.result.resources.map(r => r.uri);
  if (!uris.includes('rpgmaker-xp://docs/map-design')) throw new Error('map-design resource not listed');
  console.log(`resources/list OK: ${uris.length} (${uris.join(', ')})`);
  const doc = await request('resources/read', { uri: 'rpgmaker-xp://docs/map-design' });
  if (!(doc.result.contents?.[0]?.text || '').includes('three tile layers')) throw new Error('map-design resource content unexpected');
  console.log('resources/read OK: map-design loaded');

  const title = await request('tools/call', { name: 'get_game_title', arguments: {} });
  console.log(`tools/call get_game_title OK: ${title.result.content[0].text}`);

  const actors = await request('tools/call', { name: 'get_actors', arguments: {} });
  const names = JSON.parse(actors.result.content[0].text).map(a => a.name);
  console.log(`tools/call get_actors OK: ${names.join(', ')}`);

  console.log('\nServer smoke test passed');
  process.exit(0);
} catch (err) {
  console.error(`Smoke test FAILED: ${err.message}`);
  process.exit(1);
} finally {
  server.kill();
}
