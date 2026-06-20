const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 4000;
const CONFIG_FILE = path.join(__dirname, 'config.json');
const HTML_FILE = path.join(__dirname, 'index.html');
const SESSIONS_DIR = path.join(__dirname, 'sessions');
const PROMPTS_FILE = path.join(__dirname, 'prompts.json');
const LOGS_DIR = path.join(__dirname, 'logs');
const HEALTH_FILE = path.join(__dirname, 'healthState.json');
const ITERATIONS_FILE = path.join(__dirname, 'iterations.json');
const SOURCES_FILE = path.join(__dirname, 'sources.json');
const MATERIALS_FILE = path.join(__dirname, 'materials.json');

try { fs.mkdirSync(SESSIONS_DIR, { recursive: true }); } catch {}
try { fs.mkdirSync(LOGS_DIR, { recursive: true }); } catch {}

// ─── Health Check & Circuit Breaker ──────────────────────────────────────────

let healthState = {};
const HEALTH_INTERVAL = 60000;
let healthTimer = null;

function loadHealthState() {
  try {
    const raw = fs.readFileSync(HEALTH_FILE, 'utf8');
    healthState = JSON.parse(raw);
  } catch {
    healthState = {};
  }
}

function saveHealthState() {
  try { fs.writeFileSync(HEALTH_FILE, JSON.stringify(healthState, null, 2)); } catch {}
}

// Initialize health state for all sources
function initHealthState() {
  const cfg = loadConfig();
  const sources = sourceList(cfg);
  for (const s of sources) {
    if (!healthState[s.id]) {
      healthState[s.id] = {
        status: 'healthy',
        lastCheck: null,
        errorRate: 0,
        avgLatencyMs: 0,
        consecutiveFailures: 0,
        circuitOpenAt: null,
        recentLatencies: [],
        recentErrors: 0,
      };
    }
  }
  saveHealthState();
}

function updateHealthRecord(sourceId, latencyMs, isError) {
  if (!healthState[sourceId]) {
    healthState[sourceId] = {
      status: 'healthy', lastCheck: null, errorRate: 0, avgLatencyMs: 0,
      consecutiveFailures: 0, circuitOpenAt: null, recentLatencies: [], recentErrors: 0,
    };
  }
  const hs = healthState[sourceId];
  // 每次请求结束都更新timestamp
  hs.lastCheck = new Date().toISOString();

  if (isError) {
    hs.recentErrors++;
    hs.consecutiveFailures++;
    // 简化：只用 consecutiveFailures 标记状态
    if (hs.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      hs.status = 'circuit_open';
      hs.circuitOpenAt = new Date().toISOString();
      console.log(`[health] 🔴 ${sourceId} 熔断开启（连续${hs.consecutiveFailures}次失败）`);
    } else if (hs.consecutiveFailures >= 1) {
      hs.status = 'degraded';
      console.log(`[health] ⚠️  ${sourceId} degraded（连续${hs.consecutiveFailures}次失败）`);
    }
  } else {
    hs.consecutiveFailures = 0;
    if (hs.status === 'degraded' || hs.status === 'circuit_open') {
      hs.status = 'healthy';
      console.log(`[health] ✅ ${sourceId} healthy`);
    }
  }

  if (latencyMs > 0) {
    hs.recentLatencies.push(latencyMs);
    if (hs.recentLatencies.length > 10) hs.recentLatencies.shift();
    hs.avgLatencyMs = Math.round(hs.recentLatencies.reduce((a, b) => a + b, 0) / hs.recentLatencies.length);
  }

  const window = hs.recentLatencies.length;
  hs.errorRate = window > 0 ? Math.round((hs.recentErrors / window) * 100) / 100 : 0;
  hs.recentErrors = 0;
  saveHealthState();
}

function getSourceHealth(sourceId) {
  const hs = healthState[sourceId] || { status: 'healthy', lastCheck: null, errorRate: 0, avgLatencyMs: 0, consecutiveFailures: 0, circuitOpenAt: null };
  // Check circuit open recovery
  if (hs.status === 'circuit_open' && hs.circuitOpenAt) {
    const elapsed = Date.now() - new Date(hs.circuitOpenAt).getTime();
    if (elapsed > 300000) {
      setTimeout(() => checkCircuitRecovery(sourceId), 0);
    }
  }
  return hs;
}

async function checkCircuitRecovery(sourceId) {
  const cfg = loadConfig();
  const source = sourceById(sourceId, cfg);
  if (!source) return;
  const apiKey = getNextApiKey(source);
  if (!apiKey) return;

  let successCount = 0;
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    try {
      const res = await httpRequest(
        source.baseUrl + '/models',
        { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` }, timeout: 15000 },
        null
      );
      const latency = Date.now() - t0;
      if (res.status === 200) {
        successCount++;
        updateHealthRecord(sourceId, latency, false);
      } else {
        updateHealthRecord(sourceId, latency, true);
      }
    } catch {
      updateHealthRecord(sourceId, 0, true);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  if (successCount >= 2 && healthState[sourceId]?.status === 'circuit_open') {
    healthState[sourceId].status = 'healthy';
    healthState[sourceId].consecutiveFailures = 0;
    healthState[sourceId].circuitOpenAt = null;
    console.log(`[health]  ${sourceId} 熔断恢复`);
    saveHealthState();
  }
}

async function runHealthCheck() {
  const cfg = loadConfig();
  for (const source of sourceList(cfg)) {
    if (!source.baseUrl) continue;
    const apiKey = getNextApiKey(source);
    if (!apiKey) continue;

    const t0 = Date.now();
    try {
      const res = await httpRequest(
        source.baseUrl + '/models',
        { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` }, timeout: 15000 },
        null
      );
      const latency = Date.now() - t0;
      if (res.status === 429) cooldownKey(source.id, apiKey);
      updateHealthRecord(source.id, latency, res.status !== 200);
    } catch (err) {
      updateHealthRecord(source.id, 0, true);
    }
  }
}

function startHealthCheckLoop() {
  initHealthState();
  runHealthCheck();
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = setInterval(runHealthCheck, HEALTH_INTERVAL);
}

// ─── Model Routes (per-model platform priority + fallback) ─────────────────────

function inferSourceName(baseUrl) {
  try { return new URL(baseUrl).hostname; } catch { return baseUrl || '默认'; }
}

function shouldAutoRenameSource(source) {
  if (!source?.name) return true;
  if (source.name === source.baseUrl) return true;
  return source.baseUrl && source.name === inferSourceName(source.baseUrl);
}

function sourceList(cfg = loadConfig()) {
  if (Array.isArray(cfg.sources)) return cfg.sources;
  if (cfg.sources && typeof cfg.sources === 'object') {
    return Object.entries(cfg.sources).map(([id, s]) => ({ id, apiKeys: s.keys || s.apiKeys || [], ...s }));
  }
  return [];
}

function sourceById(id, cfg = loadConfig()) {
  return sourceList(cfg).find(s => s.id === id || s.name === id);
}

function routeSourceId(entry) {
  if (typeof entry === 'string') return entry;
  return entry?.source || entry?.sourceId || entry?.platform || entry?.platformId || entry?.id;
}

function normalizeModelRoute(model, cfg = loadConfig()) {
  const route = cfg.modelRoutes?.[model];
  const allSources = sourceList(cfg);
  if (!route) return { preferred: allSources.map(s => s.id), disabled: [] };

  if (Array.isArray(route)) {
    const preferred = route
      .filter(r => !r.disabled && !r.banned && !r.neverUse)
      .sort((a, b) => {
        const ap = typeof a === 'object' && a.priority !== undefined ? a.priority : null;
        const bp = typeof b === 'object' && b.priority !== undefined ? b.priority : null;
        if (ap === null && bp === null) return 0;
        if (ap === null) return 1;
        if (bp === null) return -1;
        return ap - bp;
      })
      .map(routeSourceId)
      .filter(Boolean);
    const disabled = route.filter(r => r.disabled || r.banned || r.neverUse).map(routeSourceId).filter(Boolean);
    return { preferred: preferred.length ? preferred : allSources.map(s => s.id), disabled };
  }

  const preferred = route.preferredPlatforms || route.preferred || route.platforms || route.sources || [];
  const disabled = route.disabledPlatforms || route.disabled || route.neverUsePlatforms || route.neverUse || [];
  return {
    preferred: (preferred.length ? preferred : allSources.map(s => s.id)).map(routeSourceId).filter(Boolean),
    disabled: disabled.map(routeSourceId).filter(Boolean),
  };
}

function getRouteForModel(model, cfg = loadConfig()) {
  const { preferred, disabled } = normalizeModelRoute(model, cfg);
  const disabledSet = new Set(disabled);
  return preferred.map((id, index) => {
    if (disabledSet.has(id)) return null;
    const source = sourceById(id, cfg);
    if (!source || !source.baseUrl) return null;
    const hs = healthState[source.id] || {};
    if (hs.status === 'circuit_open') return null;
    const key = getNextApiKey(source);
    if (!key) return null;
    return { source, key, priority: index + 1 };
  }).filter(Boolean);
}

function ensureRoutesForSourceModels(cfg, source, models = []) {
  cfg.modelRoutes = cfg.modelRoutes || {};
  const ids = models.map(m => typeof m === 'string' ? m : m?.id).filter(Boolean);
  for (const modelId of ids) {
    const route = cfg.modelRoutes[modelId];
    if (!route) {
      cfg.modelRoutes[modelId] = { preferredPlatforms: [source.id], disabledPlatforms: [] };
      continue;
    }
    if (Array.isArray(route)) continue;
    const preferred = route.preferredPlatforms || route.preferred || route.platforms || route.sources || [];
    const disabled = route.disabledPlatforms || route.disabled || route.neverUsePlatforms || route.neverUse || [];
    if (!preferred.includes(source.id) && !disabled.includes(source.id)) {
      route.preferredPlatforms = [...preferred, source.id];
    }
  }
}

async function syncSourceModelsToRoutes(source) {
  if (!source?.baseUrl) return;
  const apiKey = getNextApiKey(source);
  if (!apiKey) return;
  try {
    const result = await httpRequest(
      source.baseUrl + '/models',
      { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` }, timeout: 10000 },
      null
    );
    if (result.status !== 200) return;
    const data = JSON.parse(result.body);
    const cfg = loadConfig();
    ensureRoutesForSourceModels(cfg, source, data.data || []);
    saveConfig(cfg);
  } catch {}
}

function shouldFailoverStatus(status) {
  return status === 402 || status === 403 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function shouldFailoverError(err) {
  return err?.message === 'TIMEOUT' || RETRY_ERRORS.has(err?.code) || err?.message === 'timeout';
}

function failoverMessage(model, from, to, reason) {
  const next = to ? `，切换到 [${model}@${to.name || to.id}]` : '，无可用备用平台';
  return '[' + model + '@' + (from.name || from.id) + '] failed: ' + reason + next;
}

// ─── Config & Multi-source ────────────────────────────────────────────────────

let _cfg = null;

// Converts legacy single-source config to multi-source format
function migrateLegacyConfig(cfg) {
  if (cfg.sources) return cfg;
  const source = {
    id: 's1',
    name: cfg.baseUrl ? new URL(cfg.baseUrl).hostname : '默认',
    baseUrl: cfg.baseUrl || '',
    apiKeys: cfg.apiKey ? [cfg.apiKey] : [],
  };
  return {
    sources: [source],
    activeSourceId: 's1',
    timeout: cfg.timeout || 60000,
    retries: cfg.retries ?? 3,
  };
}

function loadConfig() {
  if (_cfg) return _cfg;
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    _cfg = migrateLegacyConfig(raw);
  } catch {
    _cfg = { sources: [], activeSourceId: null, timeout: 120000, retries: 3 };
  }
  return _cfg;
}

function saveConfig(data) {
  _cfg = { ...loadConfig(), ...data };
  if (_cfg.sources) _cfg.sources = sourceList(_cfg);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(_cfg, null, 2));
  return _cfg;
}

// ─── Source & Key rotation ─────────────────────────────────────────────────

// Map<sourceId, Map<key, cooldownUntilMs>>
const keyCooldowns = new Map();

function getActiveSource() {
  const cfg = loadConfig();
  const sources = sourceList(cfg);
  if (sources.length === 0) return null;
  return sources.find(s => s.id === cfg.activeSourceId) || sources[0] || null;
}

function genSourceId() {
  return 's' + Math.random().toString(36).slice(2, 10);
}

function cooldownKey(sourceId, key, ms = 60000) {
  if (!sourceId || !key) return;
  if (!keyCooldowns.has(sourceId)) keyCooldowns.set(sourceId, new Map());
  keyCooldowns.get(sourceId).set(key, Date.now() + ms);
}

function getNextApiKey(source) {
  const keys = source?.apiKeys || source?.keys || [];
  if (!keys.length) return '';
  const cooldowns = keyCooldowns.get(source.id) || new Map();
  const now = Date.now();
  for (const key of keys) {
    if ((cooldowns.get(key) || 0) <= now) return key;
  }
  return keys[0];
}

function sanitizeSource(source, cfg = loadConfig()) {
  const keys = source.apiKeys || source.keys || [];
  return {
    id: source.id,
    name: source.name,
    baseUrl: source.baseUrl,
    hasKey: keys.length > 0,
    keyCount: keys.length,
    active: source.id === cfg.activeSourceId,
  };
}

async function handleSources(req, res, id, action) {
  const cfg = loadConfig();
  const sources = sourceList(cfg);

  if (!id && req.method === 'GET') {
    const list = sources.map(s => sanitizeSource(s, cfg));
    return json(res, 200, { sources: list, activeSourceId: cfg.activeSourceId });
  }

  if (!id && req.method === 'POST') {
    const raw = await readBody(req);
    const data = raw ? JSON.parse(raw) : {};
    if (!data.baseUrl) return json(res, 400, { error: 'Bad request' });
    const apiKeys = data.apiKeys || data.keys || (data.apiKey ? [data.apiKey] : []);
    const newSource = {
      id: data.id || genSourceId(),
      name: data.name || inferSourceName(data.baseUrl),
      baseUrl: data.baseUrl.replace(/\/$/, ''),
      apiKeys,
    };
    cfg.sources = [...sources, newSource];
    if (!cfg.activeSourceId) cfg.activeSourceId = newSource.id;
    saveConfig(cfg);
    return json(res, 200, sanitizeSource(newSource, cfg));
  }

  if (id && !action && req.method === 'GET') {
    const source = sources.find(s => s.id === id);
    if (!source) return json(res, 404, { error: 'Not found' });
    return json(res, 200, sanitizeSource(source, cfg));
  }

  if (id && !action && req.method === 'PUT') {
    const idx = sources.findIndex(s => s.id === id);
    if (idx === -1) return json(res, 404, { error: 'Not found' });
    const raw = await readBody(req);
    const data = raw ? JSON.parse(raw) : {};
    const updated = { ...sources[idx] };
    if (data.name !== undefined) updated.name = data.name;
    if (data.baseUrl !== undefined) {
      const nextBaseUrl = data.baseUrl.replace(/\/$/, '');
      if (data.name === undefined && shouldAutoRenameSource(updated)) updated.name = inferSourceName(nextBaseUrl);
      updated.baseUrl = nextBaseUrl;
    }
    if (data.apiKeys !== undefined) updated.apiKeys = data.apiKeys;
    if (data.keys !== undefined) updated.apiKeys = data.keys;
    if (data.apiKey !== undefined) {
      if (updated.apiKeys === undefined) updated.apiKeys = updated.keys || [];
      if (data.apiKey && !updated.apiKeys.includes(data.apiKey)) updated.apiKeys = [data.apiKey, ...updated.apiKeys];
    }
    cfg.sources = sources;
    cfg.sources[idx] = updated;
    saveConfig(cfg);
    return json(res, 200, { ok: true });
  }

  if (id && !action && req.method === 'DELETE') {
    const idx = sources.findIndex(s => s.id === id);
    if (idx === -1) return json(res, 404, { error: 'Not found' });
    sources.splice(idx, 1);
    cfg.sources = sources;
    if (cfg.activeSourceId === id) cfg.activeSourceId = sources[0]?.id || null;
    saveConfig(cfg);
    return json(res, 200, { ok: true });
  }

  if (id && action === 'activate' && req.method === 'POST') {
    const source = sources.find(s => s.id === id);
    if (!source) return json(res, 404, { error: 'Not found' });
    cfg.activeSourceId = id;
    saveConfig(cfg);
    return json(res, 200, { ok: true, activeSourceId: id });
  }

  return json(res, 405, { error: 'Method not allowed' });
}
// ─── Sessions ─────────────────────────────────────────────────────────────────

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function validId(id) {
  return typeof id === 'string' && /^[a-z0-9]+$/.test(id);
}

function listSessions() {
  try {
    return fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const s = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'));
          return {
            id: s.id,
            name: s.name || '未命名',
            model: s.model || '',
            updatedAt: s.updatedAt || s.createdAt || '',
            messageCount: (s.messages || []).length,
          };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch { return []; }
}

function getSession(id) {
  if (!validId(id)) return null;
  const file = path.join(SESSIONS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function putSession(data) {
  if (!validId(data.id)) throw new Error('Invalid session id');
  fs.writeFileSync(path.join(SESSIONS_DIR, `${data.id}.json`), JSON.stringify(data, null, 2));
}

function removeSession(id) {
  if (!validId(id)) return;
  try { fs.unlinkSync(path.join(SESSIONS_DIR, `${id}.json`)); } catch {}
}

async function handleSessions(req, res, id) {
  if (!id && req.method === 'GET') {
    return json(res, 200, { sessions: listSessions() });
  }

  if (!id && req.method === 'POST') {
    const raw = await readBody(req);
    const data = raw ? JSON.parse(raw) : {};
    const now = new Date().toISOString();
    const s = {
      id: genId(),
      name: data.name || '未命名',
      model: data.model || '',
      system: data.system || '',
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    putSession(s);
    return json(res, 200, s);
  }

  if (id && req.method === 'GET') {
    const s = getSession(id);
    return s ? json(res, 200, s) : json(res, 404, { error: 'Not found' });
  }

  if (id && req.method === 'PUT') {
    const existing = getSession(id);
    if (!existing) return json(res, 404, { error: 'Not found' });
    const raw = await readBody(req);
    const data = raw ? JSON.parse(raw) : {};
    const updated = { ...existing, ...data, id, updatedAt: new Date().toISOString() };
    putSession(updated);
    return json(res, 200, { ok: true });
  }

  if (id && req.method === 'DELETE') {
    removeSession(id);
    return json(res, 200, { ok: true });
  }

  return json(res, 405,  { error: 'Method not allowed' });
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

function loadPrompts() {
  try { return JSON.parse(fs.readFileSync(PROMPTS_FILE, 'utf8')); } catch { return []; }
}

function savePrompts(list) {
  fs.writeFileSync(PROMPTS_FILE, JSON.stringify(list, null, 2));
}

async function handlePrompts(req, res, id) {
  if (!id && req.method === 'GET') {
    return json(res, 200, { prompts: loadPrompts() });
  }
  if (!id && req.method === 'POST') {
    const raw = await readBody(req);
    const data = raw ? JSON.parse(raw) : {};
    const item = { id: genId(), name: data.name || '未命名', content: data.content || '' };
    const list = loadPrompts();
    list.unshift(item);
    savePrompts(list);
    return json(res, 200, item);
  }
  if (id && req.method === 'DELETE') {
    savePrompts(loadPrompts().filter(p => p.id !== id));
    return json(res, 200, { ok: true });
  }
  return json(res, 405,  { error: 'Method not allowed' });
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

function appendLog(entry) {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const file = path.join(LOGS_DIR, `${month}.jsonl`);
  try { fs.appendFileSync(file, JSON.stringify(entry) + '\n'); } catch {}
}

function readLogs(limit = 100) {
  try {
    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .sort()
      .reverse();
    const lines = [];
    for (const f of files) {
      const content = fs.readFileSync(path.join(LOGS_DIR, f), 'utf8');
      const fileLines = content.trim().split('\n').filter(Boolean).reverse();
      lines.push(...fileLines);
      if (lines.length >= limit) break;
    }
    return lines.slice(0, limit).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

function computeStats() {
  try {
    const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.jsonl')).sort();
    const byModel = {};
    const byDay = {};
    let totalPrompt = 0, totalCompletion = 0, totalRequests = 0;
    for (const f of files) {
      const content = fs.readFileSync(path.join(LOGS_DIR, f), 'utf8');
      for (const line of content.trim().split('\n').filter(Boolean)) {
        try {
          const e = JSON.parse(line);
          totalRequests++;
          totalPrompt += e.promptTokens || 0;
          totalCompletion += e.completionTokens || 0;
          if (e.model) byModel[e.model] = (byModel[e.model] || 0) + 1;
          if (e.ts) {
            const day = e.ts.slice(0, 10);
            byDay[day] = (byDay[day] || 0) + 1;
          }
        } catch {}
      }
    }
    return { totalRequests, totalPrompt, totalCompletion, byModel, byDay };
  } catch { return { totalRequests: 0, totalPrompt: 0, totalCompletion: 0, byModel: {}, byDay: {} }; }
}

async function handleLogs(req, res) {
  if (req.method === 'GET') {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    return json(res, 200, { logs: readLogs(limit) });
  }
  return json(res, 405,  { error: 'Method not allowed' });
}

async function handleStats(req, res) {
  if (req.method === 'GET') return json(res, 200, computeStats());
  return json(res, 405,  { error: 'Method not allowed' });
}

// ─── Prompts V2 (with versions & variables) ──────────────────────────────────

function loadPromptsV2() {
  try { return JSON.parse(fs.readFileSync(PROMPTS_FILE, 'utf8')); } catch { return []; }
}
function savePromptsV2(list) {
  fs.writeFileSync(PROMPTS_FILE, JSON.stringify(list, null, 2));
}

async function handlePromptsV2(req, res, id, sub) {
  if (!id && req.method === 'GET') {
    const list = loadPromptsV2();
    const filtered = sub ? null : list;
    if (filtered !== null) return json(res, 200, { prompts: filtered });
    return json(res, 200, { prompts: list });
  }
  if (!id && req.method === 'POST') {
    const raw = await readBody(req);
    const d = raw ? JSON.parse(raw) : {};
    const now = new Date().toISOString();
    const item = {
      id: genId(),
      name: d.name || '未命名',
      category: d.category || [],
      tags: d.tags || [],
      content: d.content || '',
      variables: d.variables || [],
      version: 1,
      versions: [{ v: 1, content: d.content || '', updatedAt: now, note: '初始创建' }],
      stats: { useCount: 0, avgScore: 0, lastUsed: null },
      createdAt: now,
      updatedAt: now,
    };
    const list = loadPromptsV2();
    list.unshift(item);
    savePromptsV2(list);
    return json(res, 200, item);
  }
  if (id && sub === '/versions' && req.method === 'GET') {
    const list = loadPromptsV2();
    const p = list.find(p => p.id === id);
    if (!p) return json(res, 404, { error: 'Not found' });
    return json(res, 200, { versions: p.versions || [] });
  }
  if (id && sub === '/iterations' && req.method === 'GET') {
    const iter = loadIterations().filter(i => i.promptId === id);
    return json(res, 200, { iterations: iter });
  }
  if (id && req.method === 'GET') {
    const list = loadPromptsV2();
    const p = list.find(p => p.id === id);
    if (!p) return json(res, 404, { error: 'Not found' });
    return json(res, 200, p);
  }
  if (id && req.method === 'PUT') {
    const raw = await readBody(req);
    const d = raw ? JSON.parse(raw) : {};
    const list = loadPromptsV2();
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) return json(res, 404, { error: 'Not found' });
    const p = list[idx];
    const now = new Date().toISOString();
    if (d.content && d.content !== p.content) {
      p.version++;
      p.versions.push({ v: p.version, content: d.content, updatedAt: now, note: d.versionNote || '' });
    }
    if (d.name !== undefined) p.name = d.name;
    if (d.category !== undefined) p.category = d.category;
    if (d.tags !== undefined) p.tags = d.tags;
    if (d.content !== undefined) p.content = d.content;
    if (d.variables !== undefined) p.variables = d.variables;
    if (d.stats) { p.stats = { ...p.stats, ...d.stats }; }
    p.updatedAt = now;
    savePromptsV2(list);
    return json(res, 200, p);
  }
  if (id && req.method === 'DELETE') {
    savePromptsV2(loadPromptsV2().filter(p => p.id !== id));
    return json(res, 200, { ok: true });
  }
  return json(res, 405,  { error: 'Method not allowed' });
}

// ─── Iterations ───────────────────────────────────────────────────────────────

function loadIterations() {
  try { return JSON.parse(fs.readFileSync(ITERATIONS_FILE, 'utf8')); } catch { return []; }
}
function saveIterations(list) { fs.writeFileSync(ITERATIONS_FILE, JSON.stringify(list, null, 2)); }

async function handleIterations(req, res, id) {
  if (!id && req.method === 'GET') return json(res, 200, { iterations: loadIterations() });
  if (!id && req.method === 'POST') {
    const raw = await readBody(req);
    const d = raw ? JSON.parse(raw) : {};
    const item = {
      id: 'iter_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      promptId: d.promptId,
      status: 'running',
      goal: d.goal || '',
      references: d.references || [],
      rounds: [],
      finalPrompt: null,
      finalScores: null,
      converged: false,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    const list = loadIterations();
    list.unshift(item);
    saveIterations(list);
    return json(res, 200, item);
  }
  if (id && req.method === 'GET') {
    const list = loadIterations();
    const it = list.find(i => i.id === id);
    return it ? json(res, 200, it) : json(res, 404, { error: 'Not found' });
  }

  if (id && req.method === 'PUT') {
    const raw = await readBody(req);
    const d = raw ? JSON.parse(raw) : {};
    const list = loadIterations();
    const idx = list.findIndex(i => i.id === id);
    if (idx === -1) return json(res, 404, { error: 'Not found' });
    const it = list[idx];
    if (d.rounds) it.rounds = d.rounds;
    if (d.status) it.status = d.status;
    if (d.finalPrompt !== undefined) it.finalPrompt = d.finalPrompt;
    if (d.finalScores) it.finalScores = d.finalScores;
    if (d.converged !== undefined) it.converged = d.converged;
    if (d.completedAt) it.completedAt = d.completedAt;
    saveIterations(list);
    return json(res, 200, it);
  }
  return json(res, 405,  { error: 'Method not allowed' });
}

// ─── Materials ────────────────────────────────────────────────────────────────

function loadMaterialSources() {
  try { return JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf8')); } catch { return []; }
}
function saveMaterialSources(list) { fs.writeFileSync(SOURCES_FILE, JSON.stringify(list, null, 2)); }

function genMatId() {
  return 'mat_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}
function genSrcId() {
  return 'src_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

async function handleMaterialSources(req, res, id) {
  if (!id && req.method === 'GET') return json(res, 200, { sources: loadMaterialSources() });
  if (!id && req.method === 'POST') {
    const raw = await readBody(req);
    const d = raw ? JSON.parse(raw) : {};
    const item = { id: genSrcId(), name: d.name || '未命名模板', url: d.url || '', platform: d.platform || '', category: d.category || '', subCategory: d.subCategory || '', note: d.note || '', createdAt: new Date().toISOString() };
    const list = loadMaterialSources();
    list.unshift(item);
    saveMaterialSources(list);
    return json(res, 200, item);
  }
  if (id && req.method === 'GET') {
    const s = loadMaterialSources().find(s => s.id === id);
    return s ? json(res, 200, s) : json(res, 404, { error: 'Not found' });
  }

  if (id && req.method === 'PUT') {
    const raw = await readBody(req);
    const d = raw ? JSON.parse(raw) : {};
    const list = loadMaterialSources();
    const idx = list.findIndex(s => s.id === id);
    if (idx === -1) return json(res, 404, { error: 'Not found' });
    list[idx] = { ...list[idx], ...d };
    saveMaterialSources(list);
    return json(res, 200, list[idx]);
  }
  if (id && req.method === 'DELETE') {
    saveMaterialSources(loadMaterialSources().filter(s => s.id !== id));
    return json(res, 200, { ok: true });
  }
  return json(res, 405,  { error: 'Method not allowed' });
}

function loadMaterials() {
  try { return JSON.parse(fs.readFileSync(MATERIALS_FILE, 'utf8')); } catch { return []; }
}
function saveMaterials(list) { fs.writeFileSync(MATERIALS_FILE, JSON.stringify(list, null, 2)); }

async function handleMaterials(req, res, id) {
  if (!id && req.method === 'GET') {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const sourceId = url.searchParams.get('sourceId');
    const tag = url.searchParams.get('tag');
    const list = loadMaterials();
    let filtered = list;
    if (sourceId) filtered = filtered.filter(m => m.sourceId === sourceId);
    if (tag) filtered = filtered.filter(m => (m.tags || []).includes(tag));
    filtered.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return json(res, 200, { materials: filtered, total: filtered.length });
  }
  if (!id && req.method === 'POST') {
    const raw = await readBody(req);
    const d = raw ? JSON.parse(raw) : {};
    const now = new Date().toISOString();
    const item = {
      id: genMatId(),
      title: d.title || '未命名素材',
      sourceId: d.sourceId || null,
      url: d.url || '',
      content: d.content || '',
      summary: d.summary || '',
      extractedFeatures: d.extractedFeatures || null,
      analysisNotes: d.analysisNotes || '',
      tags: d.tags || [],
      reusableModules: d.reusableModules || [],
      linkedPrompts: d.linkedPrompts || [],
      createdAt: now,
      updatedAt: now,
    };
    const list = loadMaterials();
    list.unshift(item);
    saveMaterials(list);
    return json(res, 200, item);
  }
  if (id && req.method === 'GET') {
    const m = loadMaterials().find(m => m.id === id);
    return m ? json(res, 200, m) : json(res, 404, { error: 'Not found' });
  }

  if (id && req.method === 'PUT') {
    const raw = await readBody(req);
    const d = raw ? JSON.parse(raw) : {};
    const list = loadMaterials();
    const idx = list.findIndex(m => m.id === id);
    if (idx === -1) return json(res, 404, { error: 'Not found' });
    list[idx] = { ...list[idx], ...d, id, updatedAt: new Date().toISOString() };
    saveMaterials(list);
    return json(res, 200, list[idx]);
  }
  if (id && req.method === 'DELETE') {
    saveMaterials(loadMaterials().filter(m => m.id !== id));
    return json(res, 200, { ok: true });
  }
  return json(res, 405,  { error: 'Method not allowed' });
}

async function handleMaterialSearch(req, res) {
  if (req.method !== 'GET') return json(res, 405,  { error: 'Method not allowed' });
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const q = (url.searchParams.get('q') || '').toLowerCase().trim();
  const tag = url.searchParams.get('tag');
  const sourceId = url.searchParams.get('sourceId');
  const list = loadMaterials();
  let results = list;
  if (q) {
    results = results.filter(m =>
      (m.title || '').toLowerCase().includes(q) ||
      (m.content || '').toLowerCase().includes(q) ||
      (m.summary || '').toLowerCase().includes(q) ||
      (m.analysisNotes || '').toLowerCase().includes(q)
    );
  }
  if (tag) results = results.filter(m => (m.tags || []).includes(tag));
  if (sourceId) results = results.filter(m => m.sourceId === sourceId);
  // Add matchedContent snippet
  results = results.map(m => {
    let matchedContent = '';
    if (q) {
      const searchIn = [m.title, m.content, m.summary, m.analysisNotes].filter(Boolean).join(' ');
      const idx = searchIn.toLowerCase().indexOf(q);
      if (idx >= 0) {
        const start = Math.max(0, idx - 40);
        const end = Math.min(searchIn.length, idx + q.length + 60);
        matchedContent = (start > 0 ? '...' : '') + searchIn.slice(start, end) + (end < searchIn.length ? '...' : '');
      }
    }
    return { ...m, matchedContent };
  });
  return json(res, 200, { results, total: results.length });
}

async function handleMaterialStats(req, res) {
  if (req.method !== 'GET') return json(res, 405,  { error: 'Method not allowed' });
  const list = loadMaterials();
  const srcList = loadMaterialSources();
  const byPlatform = {};
  const byTag = {};
  for (const m of list) {
    if (m.sourceId) {
      const src = srcList.find(s => s.id === m.sourceId);
      const pname = src?.platform || m.sourceId;
      byPlatform[pname] = (byPlatform[pname] || 0) + 1;
    }
    for (const t of m.tags || []) {
      byTag[t] = (byTag[t] || 0) + 1;
    }
  }
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const recentlyAdded = list.filter(m => new Date(m.createdAt).getTime() > sevenDaysAgo).length;
  return json(res, 200, { total: list.length, byPlatform, byTag, recentlyAdded });
}

async function handleMaterialAnalyze(req, res, id) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const list = loadMaterials();
  const idx = list.findIndex(m => m.id === id);
  if (idx === -1) return json(res, 404, { error: 'Not found' });
  const mat = list[idx];
  if (!mat.content) return json(res, 400, { error: 'Bad request' });

  const features = {
    genre: '',
    tags: mat.tags || [],
    structure: '',
    pacing: '',
    openingHook: '',
    summary: mat.summary || (mat.content || '').slice(0, 120),
  };
  list[idx].extractedFeatures = features;
  if (!list[idx].summary && features.summary) list[idx].summary = features.summary;
  saveMaterials(list);
  return json(res, 200, features);
}
async function handleMaterialFeatures(req, res, id) {
  const list = loadMaterials();
  const mat = list.find(m => m.id === id);
  if (!mat) return json(res, 404, { error: 'Not found' });
  return json(res, 200, mat);
}

// ─── Prompts Export/Import ─────────────────────────────────────────────────────

async function handlePromptsExport(req, res) {
  const list = loadPromptsV2();
  const exp = { version: 1, exportedAt: new Date().toISOString(), prompts: list };
  res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename=prompts.json' });
  res.end(JSON.stringify(exp, null, 2));
}

async function handlePromptsImport(req, res) {
  if (req.method !== 'POST') return json(res, 405,  { error: 'Method not allowed' });
  const raw = await readBody(req);
  try {
    const data = JSON.parse(raw);
    if (!data.prompts || !Array.isArray(data.prompts)) return json(res, 400,  { error: 'Bad request' });
    const list = loadPromptsV2();
    for (const p of data.prompts) {
      if (!list.find(e => e.id === p.id)) list.push(p);
    }
    savePromptsV2(list);
    return json(res, 200, { ok: true, count: data.prompts.length });
  } catch (err) {
    return json(res, 400, { error: err.message });
  }
}

// ─── HTTP utilities ───────────────────────────────────────────────────────────

function parseReqOptions(reqUrl, options) {
  const parsed = new URL(reqUrl);
  const isHttps = parsed.protocol === 'https:';
  return {
    mod: isHttps ? https : http,
    opts: {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 60000,
    },
  };
}

function httpRequest(reqUrl, options, body, sourceIdForCircuit) {
  return new Promise((resolve, reject) => {
    const { mod, opts } = parseReqOptions(reqUrl, options);
    const timeoutMs = options.timeout || REQUEST_TIMEOUT_MS;
    const timer = setTimeout(() => {
      req.destroy();
      if (sourceIdForCircuit) recordTimeout(sourceIdForCircuit);
      reject(new Error('TIMEOUT'));
    }, timeoutMs);
    const req = mod.request(opts, (res) => {
      clearTimeout(timer);
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    if (body) req.write(body);
    req.end();
  });
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_ERRORS = new Set(['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT']);

// ─── Concurrency Control ──────────────────────────────────────────────────────
// Per-source in-flight request limit + queue
const REQUEST_TIMEOUT_MS = 120000; // 允许长prompt充分输出：120s
const MAX_CONCURRENT_PER_SOURCE = 2;
const CIRCUIT_BREAKER_THRESHOLD = 2; // 连续2次超时就熔断
const CIRCUIT_COOLDOWN_MS = 10000; // 熔断后10s冷却

const inFlightCount = new Map(); // sourceId → current in-flight count
const inFlightQueue = new Map(); // sourceId → queued resolve functions
const circuitBreaker = new Map(); // sourceId → { consecutiveFailures, openAt, probeScheduled }

function getInFlightCount(sourceId) {
  return inFlightCount.get(sourceId) || 0;
}

function incInFlight(sourceId) {
  inFlightCount.set(sourceId, getInFlightCount(sourceId) + 1);
}

function decInFlight(sourceId) {
  const n = Math.max(0, (inFlightCount.get(sourceId) || 0) - 1);
  inFlightCount.set(sourceId, n);
  // Drain queue if below limit
  drainQueue(sourceId);
}

function drainQueue(sourceId) {
  const q = inFlightQueue.get(sourceId);
  if (!q || q.length === 0) return;
  const count = getInFlightCount(sourceId);
  while (q.length > 0) {
    const count = getInFlightCount(sourceId);
    if (count >= MAX_CONCURRENT_PER_SOURCE) break;
    const resolve = q.shift();
    inFlightCount.set(sourceId, count + 1);
    resolve();
  }
}

function enqueueRequest(sourceId) {
  return new Promise((resolve) => {
    const count = getInFlightCount(sourceId);
    if (count < MAX_CONCURRENT_PER_SOURCE) {
      inFlightCount.set(sourceId, count + 1);
      resolve();
    } else {
      if (!inFlightQueue.has(sourceId)) inFlightQueue.set(sourceId, []);
      inFlightQueue.get(sourceId).push(resolve);
    }
  });
}

function isCircuitOpen(sourceId) {
  const cb = circuitBreaker.get(sourceId);
  if (!cb || cb.openAt === null) return false;
  const elapsed = Date.now() - cb.openAt;
  if (elapsed >= CIRCUIT_COOLDOWN_MS) {
    // Cool-down expired, schedule probe
    if (!cb.probeScheduled) {
      cb.probeScheduled = true;
      setTimeout(() => probeCircuit(sourceId), 0);
    }
    return false;
  }
  return true;
}

async function probeCircuit(sourceId) {
  const cb = circuitBreaker.get(sourceId);
  if (!cb) return;
  cb.probeScheduled = false;
  // Reset to degraded state, allow one probe request
  cb.consecutiveFailures = 0;
  cb.openAt = null;
  if (healthState[sourceId]) {
    healthState[sourceId].status = 'degraded';
    healthState[sourceId].consecutiveFailures = 0;
  }
  saveHealthState();
  console.log(`[circuit] ${sourceId} 冷却结束，进入探测模式`);
}

function recordTimeout(sourceId) {
  const cb = circuitBreaker.get(sourceId) || { consecutiveFailures: 0, openAt: null, probeScheduled: false };
  cb.consecutiveFailures++;
  circuitBreaker.set(sourceId, cb);
  if (cb.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    cb.openAt = Date.now();
    cb.probeScheduled = false;
    console.log(`[circuit] 🔴 ${sourceId} 熔断开启（连续${cb.consecutiveFailures}次超时），${CIRCUIT_COOLDOWN_MS / 1000}s后重试`);
    if (healthState[sourceId]) {
      healthState[sourceId].status = 'circuit_open';
      healthState[sourceId].circuitOpenAt = new Date().toISOString();
    }
    saveHealthState();
  }
}

function recordSuccess(sourceId) {
  const cb = circuitBreaker.get(sourceId);
  if (cb) {
    cb.consecutiveFailures = 0;
    circuitBreaker.set(sourceId, cb);
  }
}

function backoff(attempt) {
  return new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 8000)));
}

async function fetchWithRetry(reqUrl, options, body, retries = 1, sourceId = null) {
  let lastErr;
  const effectiveTimeout = Math.min(options.timeout || REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS);
  const opts = { ...options, timeout: effectiveTimeout };
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await httpRequest(reqUrl, opts, body, sourceId);
      if (RETRY_STATUSES.has(res.status) && i < retries) {
        console.log(`[retry ${i + 1}/${retries}] status=${res.status}`);
        await backoff(i);
        continue;
      }
      if (sourceId) recordSuccess(sourceId);
      return res;
    } catch (err) {
      lastErr = err;
      if (err.message === 'TIMEOUT') {
        // TIMEOUT 快速失败：超时说明 source 有问题，不重试避免请求堆积
        if (sourceId) recordTimeout(sourceId);
        throw err;
      }
      if ((RETRY_ERRORS.has(err.code)) && i < retries) {
        console.log(`[retry ${i + 1}/${retries}] err=${err.message}`);
        await backoff(i);
        continue;
      }
      // 其他错误也记录到 circuit breaker
      if (sourceId) recordTimeout(sourceId);
      throw err;
    }
  }
  throw lastErr || new Error('Max retries exceeded');
}

function streamRequest(reqUrl, options, body, onChunk, onEnd, onError, sourceId) {
  const { mod, opts } = parseReqOptions(reqUrl, { ...options, method: options.method || 'POST' });
  const timeoutMs = Math.min(opts.timeout || REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS);
  const req = mod.request(opts, (res) => {
    if (res.statusCode !== 200) {
      let errData = '';
      res.on('data', c => (errData += c));
      res.on('end', () => onError(new Error(`HTTP ${res.statusCode}: ${errData}`)));
      return;
    }
    res.on('data', onChunk);
    res.on('end', onEnd);
    res.on('error', onError);
  });
  req.on('error', onError);
  const timer = setTimeout(() => {
    req.destroy();
    if (sourceId) recordTimeout(sourceId);
    onError(new Error('TIMEOUT'));
  }, timeoutMs);
  req.on('close', () => clearTimeout(timer));
  if (body) req.write(body);
  req.end();
}

// ─── Route handlers ───────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => resolve(body));
  });
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

async function handleModels(req, res) {
  const source = getActiveSource();
  if (!source || !source.baseUrl) return json(res, 400,  { error: 'Bad request' });
  const apiKey = getNextApiKey(source);
  if (!apiKey) return json(res, 400,  { error: 'Bad request' });
  const t0 = Date.now();
  try {
    const result = await fetchWithRetry(
      source.baseUrl + '/models',
      { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` }, timeout: 15000 },
      null, 2
    );
    updateHealthRecord(source.id, Date.now() - t0, result.status !== 200);
    if (result.status === 429) cooldownKey(source.id, apiKey);
    if (result.status !== 200) return json(res, result.status, { error: result.body });
    let data;
    try { data = JSON.parse(result.body); } catch (e) { return json(res, 502,  { error: 'Bad gateway' }); }
    json(res, 200, data);
  } catch (err) {
    updateHealthRecord(source.id, 0, true);
    json(res, 500, { error: err.message });
  }
}

async function handleAllModels(req, res) {
  const cfg = loadConfig();
  const sources = sourceList(cfg);
  const results = [];
  const errors = [];

  await Promise.allSettled(sources.map(async (source) => {
    if (!source.baseUrl) return;
    const apiKey = getNextApiKey(source);
    if (!apiKey) return;
    const health = healthState[source.id] || {};
    try {
      const result = await httpRequest(
        source.baseUrl + '/models',
        { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` }, timeout: 10000 },
        null
      );
      if (result.status === 200) {
        const data = JSON.parse(result.body);
        const hostname = new URL(source.baseUrl).hostname;
        const platformName = source.name || hostname;
        const models = (data.data || []).map(m => ({
          id: typeof m === 'string' ? m : m.id,
          sourceId: source.id,
          sourceName: platformName,
          baseUrl: source.baseUrl,
          displayName: (typeof m === 'object' && m.display_name) ? m.display_name : (typeof m === 'string' ? m : m.id),
        }));
        ensureRoutesForSourceModels(cfg, source, data.data || []);
        results.push({ sourceId: source.id, sourceName: platformName, baseUrl: source.baseUrl, health: health.status || 'unknown', models });
      }
    } catch {}
  }));

  saveConfig(cfg);
  return json(res, 200, { sources: results, timestamp: new Date().toISOString() });
}

async function handleModelCatalog(req, res) {
  const cfg = loadConfig();
  const sources = sourceList(cfg);
  const byModel = new Map();

  await Promise.allSettled(sources.map(async (source) => {
    if (!source.baseUrl) return;
    const apiKey = getNextApiKey(source);
    if (!apiKey) return;
    const health = getSourceHealth(source.id);
    try {
      const result = await httpRequest(
        source.baseUrl + '/models',
        { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` }, timeout: 10000 },
        null
      );
      updateHealthRecord(source.id, 0, result.status !== 200);
      if (result.status !== 200) return;
      const data = JSON.parse(result.body);
      ensureRoutesForSourceModels(cfg, source, data.data || []);
      for (const item of data.data || []) {
        const id = typeof item === 'string' ? item : item?.id;
        if (!id) continue;
        const route = normalizeModelRoute(id, cfg);
        const existing = byModel.get(id) || {
          id,
          displayName: (typeof item === 'object' && (item.displayName || item.display_name)) || id,
          platforms: [],
        };
        existing.platforms.push({
          sourceId: source.id,
          sourceName: source.name || inferSourceName(source.baseUrl),
          health: health.status || 'unknown',
        });
        const preferredNames = (route.preferred || [])
          .map(sourceId => sources.find(s => s.id === sourceId)?.name || sourceId)
          .filter(Boolean);
        const disabled = new Set(route.disabled || []);
        existing.platformCount = existing.platforms.filter(p => !disabled.has(p.sourceId)).length;
        existing.preferredSourceName = preferredNames[0] || '';
        existing.routeSummary = preferredNames.join(' / ');
        existing.health = existing.platforms.some(p => p.health === 'healthy') ? 'healthy' : (existing.platforms[0]?.health || 'unknown');
        byModel.set(id, existing);
      }
    } catch {}
  }));

  saveConfig(cfg);
  return json(res, 200, {
    models: [...byModel.values()].sort((a, b) => a.id.localeCompare(b.id)),
    timestamp: new Date().toISOString(),
  });
}

async function doCallback(callbackUrl, data) {
  try {
    const body = JSON.stringify(data);
    await fetchWithRetry(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, body, 2);
    console.log(`[callback]  ${callbackUrl}`);
  } catch (err) {
    console.error(`[callback] 失败  ${callbackUrl}: ${err.message}`);
  }
}

function extractSSEContent(raw) {
  let text = '';
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const s = line.slice(6).trim();
    if (s === '[DONE]') continue;
    try {
      const delta = JSON.parse(s).choices?.[0]?.delta?.content;
      if (delta) text += delta;
    } catch {}
  }
  return text;
}

async function handleChat(req, res, stream) {
  const raw = await readBody(req);
  let payload;
  try { payload = JSON.parse(raw); } catch { return json(res, 400, { error: 'Bad request' }); }

  if (!payload.model) return json(res, 400, { error: 'Bad request' });
  if (!payload.messages?.length) return json(res, 400, { error: 'Bad request' });

  const cfg = loadConfig();
  let routeCandidates = getRouteForModel(payload.model, cfg);
  if (!routeCandidates.length) return json(res, 503, { error: 'Service unavailable' });

  // ?source= override — 强制使用指定源（如插件备份模式）
  const urlForSource = new URL(req.url, 'http://localhost:' + PORT);
  const sourceOverride = urlForSource.searchParams.get('source');
  if (sourceOverride) {
    const forcedSource = sourceById(sourceOverride, cfg);
    if (forcedSource && forcedSource.baseUrl) {
      const key = getNextApiKey(forcedSource);
      if (key) {
        routeCandidates = [{ source: forcedSource, key, priority: 1 }];
        console.log('[chat] ?source= override: forcing', sourceOverride);
      }
    }
  }

  if (!routeCandidates.length) return json(res, 503, { error: 'Service unavailable' });

  const timeout = payload.timeout || REQUEST_TIMEOUT_MS;
  const retries = cfg.retries === undefined ? 1 : cfg.retries;
  const callbackUrl = payload.callbackUrl || payload.callback_url || '';
  const makeBody = (asStream) => {
    const body = { ...payload, stream: asStream };
    delete body.callbackUrl;
    delete body.callback_url;
    delete body.timeout;
    return JSON.stringify(body);
  };

  if (!stream) {
    let lastError = null;
    for (let i = 0; i < routeCandidates.length; i++) {
      const { source, key: apiKey } = routeCandidates[i];
      if (!apiKey || !source.baseUrl) continue;
      // Check circuit breaker
      if (isCircuitOpen(source.id)) {
        console.log(`[circuit] ${source.id} 熔断中，跳过`);
        continue;
      }
      // Concurrency control
      await enqueueRequest(source.id);
      const endpoint = source.baseUrl + '/chat/completions';
      const body = makeBody(false);
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'Content-Length': Buffer.byteLength(body) };
      const logEntry = { ts: new Date().toISOString(), model: payload.model, source: source.id, promptTokens: 0, completionTokens: 0, latencyMs: 0, status: 0 };
      const t0 = Date.now();
      try {
        const result = await fetchWithRetry(endpoint, { method: 'POST', headers, timeout }, body, retries, source.id);
        logEntry.latencyMs = Date.now() - t0;
        logEntry.status = result.status;
        updateHealthRecord(source.id, logEntry.latencyMs, result.status !== 200);
        if (result.status === 429 || result.status === 402 || result.status === 403) cooldownKey(source.id, apiKey);
        if (result.status !== 200) {
          lastError = { error: result.body, status: result.status, source: source.id };
          appendLog(logEntry);
          if (shouldFailoverStatus(result.status) && i < routeCandidates.length - 1) {
            console.log(failoverMessage(payload.model, source, routeCandidates[i + 1].source, `HTTP ${result.status}`));
            decInFlight(source.id);
            continue;
          }
          decInFlight(source.id);
          if (callbackUrl) doCallback(callbackUrl, lastError);
          return json(res, result.status, lastError);
        }
        const parsed = JSON.parse(result.body);
        if (parsed.usage) {
          logEntry.promptTokens = parsed.usage.prompt_tokens || 0;
          logEntry.completionTokens = parsed.usage.completion_tokens || 0;
        }
        appendLog(logEntry);
        parsed._route = { model: payload.model, source: source.id, platform: source.name || source.id };
        decInFlight(source.id);
        json(res, 200, parsed);
        if (callbackUrl) doCallback(callbackUrl, parsed);
        return;
      } catch (err) {
        logEntry.latencyMs = Date.now() - t0;
        logEntry.status = 500;
        updateHealthRecord(source.id, 0, true);
        appendLog(logEntry);
        lastError = { error: err.message, source: source.id };
        decInFlight(source.id);
        if (shouldFailoverError(err) && i < routeCandidates.length - 1) {
          console.log(failoverMessage(payload.model, source, routeCandidates[i + 1].source, err.message));
          continue;
        }
        if (callbackUrl) doCallback(callbackUrl, lastError);
        return json(res, 500, lastError);
      }
    }
    const errData = lastError || { error: `模型 ${payload.model} 没有可用平台` };
    if (callbackUrl) doCallback(callbackUrl, errData);
    return json(res, errData.status || 503, errData);
  }

  let lastRouteError = null;
  for (let i = 0; i < routeCandidates.length; i++) {
    const { source, key: apiKey } = routeCandidates[i];
    if (!apiKey || !source.baseUrl) continue;
    // Check circuit breaker
    if (isCircuitOpen(source.id)) {
      console.log(`[circuit] ${source.id} 熔断中，跳过`);
      continue;
    }
    // Concurrency control - enqueue
    await enqueueRequest(source.id);
    const body = makeBody(true);
    const endpoint = source.baseUrl + '/chat/completions';
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'Content-Length': Buffer.byteLength(body) };
    const logEntry = { ts: new Date().toISOString(), model: payload.model, source: source.id, promptTokens: 0, completionTokens: 0, latencyMs: 0, status: 0 };
    const t0 = Date.now();
    const sourceId = source.id;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*', Connection: 'keep-alive' });
    let accumulated = '';
    streamRequest(endpoint, { method: 'POST', headers, timeout }, body,
      (chunk) => { res.write(chunk); accumulated += chunk; },
      () => {
        res.end();
        logEntry.latencyMs = Date.now() - t0;
        logEntry.status = 200;
        updateHealthRecord(sourceId, logEntry.latencyMs, false);
        appendLog(logEntry);
        decInFlight(sourceId);
        if (callbackUrl) doCallback(callbackUrl, { choices: [{ message: { role: 'assistant', content: extractSSEContent(accumulated) } }] });
      },
      (err) => {
        res.write(`data: ${JSON.stringify({ error: err.message })}

`);
        res.end();
        logEntry.latencyMs = Date.now() - t0;
        logEntry.status = 500;
        updateHealthRecord(sourceId, 0, true);
        appendLog(logEntry);
        lastRouteError = { status: 500, error: err.message, source: source.id };
        decInFlight(sourceId);
        if (callbackUrl) doCallback(callbackUrl, { error: err.message });
      },
      sourceId
    );
    return;
  }
  return json(res, lastRouteError?.status || 503, lastRouteError || { error: `模型 ${payload.model} 没有可用流式平台` });
}

async function handleModelRoutes(req, res, model) {
  const cfg = loadConfig();
  cfg.modelRoutes = cfg.modelRoutes || {};
  const sourceIds = new Set(sourceList(cfg).map(s => s.id));

  if (!model && req.method === 'GET') return json(res, 200, { modelRoutes: cfg.modelRoutes, sources: sourceList(cfg).map(s => ({ id: s.id, name: s.name, baseUrl: s.baseUrl })) });

  if (!model && req.method === 'PUT') {
    const raw = await readBody(req);
    const data = raw ? JSON.parse(raw) : {};
    const updates = Array.isArray(data.updates)
      ? data.updates
      : Object.entries(data.routes || {}).map(([modelId, route]) => ({ model: modelId, ...route }));
    let count = 0;
    for (const update of updates) {
      const modelId = update.model || update.id;
      if (!modelId) continue;
      const preferredPlatforms = (update.preferredPlatforms || []).filter(id => sourceIds.has(id));
      const disabledPlatforms = (update.disabledPlatforms || []).filter(id => sourceIds.has(id));
      cfg.modelRoutes[modelId] = { preferredPlatforms, disabledPlatforms };
      count++;
    }
    saveConfig(cfg);
    return json(res, 200, { ok: true, count, modelRoutes: cfg.modelRoutes });
  }

  if (!model) return json(res, 405,  { error: 'Method not allowed' });
  const decodedModel = decodeURIComponent(model);
  if (req.method === 'GET') return json(res, 200, cfg.modelRoutes[decodedModel] || { preferredPlatforms: sourceList(cfg).map(s => s.id), disabledPlatforms: [] });
  if (req.method === 'PUT') {
    const raw = await readBody(req);
    const data = raw ? JSON.parse(raw) : {};
    const preferredPlatforms = (data.preferredPlatforms || []).filter(id => sourceIds.has(id));
    const disabledPlatforms = (data.disabledPlatforms || []).filter(id => sourceIds.has(id));
    cfg.modelRoutes[decodedModel] = { preferredPlatforms, disabledPlatforms };
    saveConfig(cfg);
    return json(res, 200, { ok: true, model: decodedModel, route: cfg.modelRoutes[decodedModel] });
  }
  if (req.method === 'DELETE') {
    delete cfg.modelRoutes[decodedModel];
    saveConfig(cfg);
    return json(res, 200, { ok: true });
  }
  return json(res, 405,  { error: 'Method not allowed' });
}

async function handleConfig(req, res) {
  if (req.method === 'GET') {
    const cfg = loadConfig();
    const source = getActiveSource();
    json(res, 200, {
      // Legacy compat fields
      baseUrl: source?.baseUrl || '',
      hasKey: !!(source && getNextApiKey(source)),
      timeout: cfg.timeout,
      retries: cfg.retries,
      // Multi-source fields
      activeSourceId: cfg.activeSourceId,
      sourceName: source?.name || '',
    });
  } else {
    const raw = await readBody(req);
    try {
      const data = JSON.parse(raw);
      // Legacy single-source update: if baseUrl/apiKey sent, patch the active source
      if ((data.baseUrl || data.apiKey) && !data.sources) {
        const cfg = loadConfig();
        const source = getActiveSource();
        if (source) {
          if (data.name !== undefined) source.name = data.name;
          if (data.baseUrl) {
            const nextBaseUrl = data.baseUrl.replace(/\/$/, '');
            if (data.name === undefined && shouldAutoRenameSource(source)) source.name = inferSourceName(nextBaseUrl);
            source.baseUrl = nextBaseUrl;
          }
          const keys = source.apiKeys || source.keys || [];
          if (data.apiKey) {
            if (!keys.includes(data.apiKey)) source.apiKeys = [data.apiKey, ...keys];
          }
          if (data.timeout) cfg.timeout = data.timeout;
          if (data.retries !== undefined) cfg.retries = data.retries;
          saveConfig(cfg);
          return json(res, 200, { ok: true, baseUrl: source.baseUrl, sourceName: source.name, hasKey: (source.apiKeys || source.keys || []).length > 0 });
        } else {
          // No active source, create one
          const newSource = {
            id: genSourceId(),
            name: data.name || (data.baseUrl ? inferSourceName(data.baseUrl) : '默认'),
            baseUrl: (data.baseUrl || '').replace(/\/$/, ''),
            apiKeys: data.apiKey ? [data.apiKey] : [],
          };
          cfg.sources = [newSource];
          cfg.activeSourceId = newSource.id;
          if (data.timeout) cfg.timeout = data.timeout;
          if (data.retries !== undefined) cfg.retries = data.retries;
          saveConfig(cfg);
          return json(res, 200, { ok: true, baseUrl: newSource.baseUrl, hasKey: newSource.apiKeys.length > 0 });
        }
      }
      const cfg = saveConfig(data);
      const source = getActiveSource();
      json(res, 200, { ok: true, baseUrl: source?.baseUrl || '', hasKey: !!(source && getNextApiKey(source)) });
    } catch (err) {
      json(res, 400, { error: err.message });
    }
  }
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
    return res.end();
  }

  console.log(`${req.method} ${pathname}`);

  if (pathname === '/' || pathname === '/index.html') {
    try {
      const html = fs.readFileSync(HTML_FILE);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch {
      res.writeHead(404); return res.end('index.html not found');
    }
  }

  if (pathname === '/models' && req.method === 'GET') return handleModels(req, res);
  if (pathname === '/models/all' && req.method === 'GET') return handleAllModels(req, res);
  if (pathname === '/models/catalog' && req.method === 'GET') return handleModelCatalog(req, res);
  if (pathname === '/chat' && req.method === 'POST') return handleChat(req, res, false);
  if (pathname === '/chat/stream' && req.method === 'POST') return handleChat(req, res, true);
  if (pathname === '/v1/chat/completions' && req.method === 'POST') return handleChat(req, res, false);
  if (pathname === '/v1/chat/completions') return json(res, 405,  { error: 'Method not allowed' });
  if (pathname === '/config') return handleConfig(req, res);
  if (pathname === '/logs') return handleLogs(req, res);
  if (pathname === '/stats') return handleStats(req, res);

  const sessMatch = pathname.match(/^\/sessions\/([a-z0-9]+)$/);
  if (pathname === '/sessions') return handleSessions(req, res, null);
  if (sessMatch) return handleSessions(req, res, sessMatch[1]);

  const promptMatch = pathname.match(/^\/prompts\/([a-z0-9]+)$/);
  if (pathname === '/prompts') return handlePrompts(req, res, null);
  if (promptMatch) return handlePrompts(req, res, promptMatch[1]);

  // Sources routes: /sources, /sources/:id, /sources/:id/activate
  const sourceActivate = pathname.match(/^\/sources\/([a-z0-9]+)\/activate$/);
  const sourceMatch = pathname.match(/^\/sources\/([a-z0-9]+)$/);
  if (pathname === '/sources') return handleSources(req, res, null, null);
  if (sourceActivate) return handleSources(req, res, sourceActivate[1], 'activate');
  if (sourceMatch) return handleSources(req, res, sourceMatch[1], null);

  const routeMatch = pathname.match(/^\/model-routes\/(.+)$/);
  if (pathname === '/model-routes') return handleModelRoutes(req, res, null);
  if (routeMatch) return handleModelRoutes(req, res, routeMatch[1]);
  if (pathname === '/health' && req.method === 'GET') return json(res, 200, { sources: healthState });

  const promptV2Match = pathname.match(/^\/prompts\/v2\/([a-z0-9_]+)(?:\/(.+))?$/);
  if (pathname === '/prompts/v2') return handlePromptsV2(req, res, null, null);
  if (promptV2Match) return handlePromptsV2(req, res, promptV2Match[1], promptV2Match[2]);

  const iterMatch = pathname.match(/^\/iterations\/([a-z0-9_]+)$/);
  if (pathname === '/iterations') return handleIterations(req, res, null);
  if (iterMatch) return handleIterations(req, res, iterMatch[1]);

  const matSrcMatch = pathname.match(/^\/materials\/sources\/([a-z0-9_]+)$/);
  const matAnalyzeMatch = pathname.match(/^\/materials\/([a-z0-9_]+)\/analyze$/);
  const matFeatureMatch = pathname.match(/^\/materials\/([a-z0-9_]+)\/features$/);
  const matMatch = pathname.match(/^\/materials\/([a-z0-9_]+)$/);
  if (pathname === '/materials') return handleMaterials(req, res, null);
  if (pathname === '/materials/search') return handleMaterialSearch(req, res);
  if (pathname === '/materials/stats') return handleMaterialStats(req, res);
  if (pathname === '/materials/sources') return handleMaterialSources(req, res, null);
  if (matSrcMatch) return handleMaterialSources(req, res, matSrcMatch[1]);
  if (matAnalyzeMatch) return handleMaterialAnalyze(req, res, matAnalyzeMatch[1]);
  if (matFeatureMatch) return handleMaterialFeatures(req, res, matFeatureMatch[1]);
  if (matMatch) return handleMaterials(req, res, matMatch[1]);

  // /prompts/export & /prompts/import
  if (pathname === '/prompts/export' && req.method === 'GET') return handlePromptsExport(req, res);
  if (pathname === '/prompts/import' && req.method === 'POST') return handlePromptsImport(req, res);

  json(res, 404,  { error: 'Not found' });
});

server.listen(PORT, () => {
  startHealthCheckLoop();
  console.log(`Model Runner 运行  http://localhost:${PORT}`);
  console.log(`API 端点：POST http://localhost:${PORT}/chat`);
});