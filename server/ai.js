import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant, requireRole } from './middleware.js';

const r = Router();

// ─── DB INIT ──────────────────────────────────────────────────────────────────
function ensureTables() {
  D().prepare(`CREATE TABLE IF NOT EXISTS ai_providers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    label TEXT,
    api_key TEXT,
    base_url TEXT,
    default_model TEXT,
    enabled INTEGER DEFAULT 1,
    is_default INTEGER DEFAULT 0,
    cost_per_1k_input_cents INTEGER DEFAULT 0,
    cost_per_1k_output_cents INTEGER DEFAULT 0,
    monthly_budget_cents INTEGER DEFAULT 0,
    usage_cents_this_month INTEGER DEFAULT 0,
    total_requests INTEGER DEFAULT 0,
    total_tokens_in INTEGER DEFAULT 0,
    total_tokens_out INTEGER DEFAULT 0,
    last_used TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(tenant_id, provider)
  )`).run();

  D().prepare(`CREATE TABLE IF NOT EXISTS ai_usage_log (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    model TEXT,
    feature TEXT,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    cost_cents INTEGER DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    success INTEGER DEFAULT 1,
    error_msg TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
}

// ─── PROVIDER CATALOGUE (public metadata, no keys) ────────────────────────────
export const PROVIDER_CATALOGUE = {
  openai: {
    name: 'OpenAI',
    icon: '🟢',
    website: 'https://platform.openai.com',
    key_label: 'API Key (sk-...)',
    key_placeholder: 'sk-proj-...',
    models: [
      { id: 'gpt-4o',             label: 'GPT-4o',             ctx: 128000, in: 0.250, out: 1.000, tier: 'flagship'   },
      { id: 'gpt-4o-mini',        label: 'GPT-4o Mini',        ctx: 128000, in: 0.015, out: 0.060, tier: 'fast'       },
      { id: 'gpt-4-turbo',        label: 'GPT-4 Turbo',        ctx: 128000, in: 1.000, out: 3.000, tier: 'powerful'   },
      { id: 'gpt-3.5-turbo',      label: 'GPT-3.5 Turbo',      ctx: 16385,  in: 0.050, out: 0.150, tier: 'economy'    },
      { id: 'o1-mini',            label: 'o1-mini (reasoning)', ctx: 128000, in: 0.110, out: 0.440, tier: 'reasoning'  },
    ],
    default_model: 'gpt-4o-mini',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    auth_header: 'Authorization',
    auth_prefix: 'Bearer ',
  },
  anthropic: {
    name: 'Anthropic (Claude)',
    icon: '🟤',
    website: 'https://console.anthropic.com',
    key_label: 'API Key (sk-ant-...)',
    key_placeholder: 'sk-ant-api03-...',
    models: [
      { id: 'claude-opus-4-5',         label: 'Claude Opus 4.5',        ctx: 200000, in: 1.500, out: 7.500, tier: 'flagship'  },
      { id: 'claude-sonnet-4-5',       label: 'Claude Sonnet 4.5',      ctx: 200000, in: 0.300, out: 1.500, tier: 'balanced'  },
      { id: 'claude-haiku-4-5',        label: 'Claude Haiku 4.5',       ctx: 200000, in: 0.025, out: 0.125, tier: 'fast'      },
      { id: 'claude-opus-4',           label: 'Claude Opus 4',          ctx: 200000, in: 1.500, out: 7.500, tier: 'flagship'  },
      { id: 'claude-sonnet-4',         label: 'Claude Sonnet 4',        ctx: 200000, in: 0.300, out: 1.500, tier: 'balanced'  },
    ],
    default_model: 'claude-haiku-4-5',
    endpoint: 'https://api.anthropic.com/v1/messages',
    auth_header: 'x-api-key',
    auth_prefix: '',
    extra_headers: { 'anthropic-version': '2023-06-01' },
  },
  google: {
    name: 'Google (Gemini)',
    icon: '🔵',
    website: 'https://aistudio.google.com',
    key_label: 'API Key',
    key_placeholder: 'AIzaSy...',
    models: [
      { id: 'gemini-1.5-pro',           label: 'Gemini 1.5 Pro',   ctx: 1000000, in: 0.125, out: 0.375, tier: 'flagship' },
      { id: 'gemini-1.5-flash',         label: 'Gemini 1.5 Flash', ctx: 1000000, in: 0.007, out: 0.021, tier: 'fast'     },
      { id: 'gemini-2.0-flash',         label: 'Gemini 2.0 Flash', ctx: 1048576, in: 0.010, out: 0.040, tier: 'fast'     },
      { id: 'gemini-2.5-pro-preview',   label: 'Gemini 2.5 Pro',   ctx: 1048576, in: 0.125, out: 0.375, tier: 'flagship' },
    ],
    default_model: 'gemini-1.5-flash',
    endpoint_template: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}',
  },
  mistral: {
    name: 'Mistral AI',
    icon: '🟠',
    website: 'https://console.mistral.ai',
    key_label: 'API Key',
    key_placeholder: 'your-mistral-key',
    models: [
      { id: 'mistral-large-latest',  label: 'Mistral Large',  ctx: 128000, in: 0.200, out: 0.600, tier: 'flagship' },
      { id: 'mistral-small-latest',  label: 'Mistral Small',  ctx: 128000, in: 0.020, out: 0.060, tier: 'fast'     },
      { id: 'mistral-nemo',          label: 'Mistral Nemo',   ctx: 128000, in: 0.015, out: 0.015, tier: 'economy'  },
      { id: 'open-mistral-7b',       label: 'Mistral 7B',     ctx: 32768,  in: 0.002, out: 0.002, tier: 'economy'  },
    ],
    default_model: 'mistral-small-latest',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    auth_header: 'Authorization',
    auth_prefix: 'Bearer ',
  },
  ollama: {
    name: 'Ollama (Local)',
    icon: '🦙',
    website: 'https://ollama.ai',
    key_label: 'Base URL',
    key_placeholder: 'http://localhost:11434',
    models: [
      { id: 'llama3.2',   label: 'Llama 3.2 (3B)',   ctx: 131072, in: 0, out: 0, tier: 'local' },
      { id: 'llama3.1',   label: 'Llama 3.1 (8B)',   ctx: 131072, in: 0, out: 0, tier: 'local' },
      { id: 'mistral',    label: 'Mistral (7B)',      ctx: 32768,  in: 0, out: 0, tier: 'local' },
      { id: 'qwen2.5',    label: 'Qwen 2.5 (7B)',    ctx: 131072, in: 0, out: 0, tier: 'local' },
      { id: 'gemma2',     label: 'Gemma 2 (9B)',      ctx: 8192,   in: 0, out: 0, tier: 'local' },
      { id: 'phi3',       label: 'Phi-3 (3.8B)',      ctx: 131072, in: 0, out: 0, tier: 'local' },
    ],
    default_model: 'llama3.2',
    endpoint: '{baseUrl}/api/chat',
  },
};

// ─── GET catalogue (no keys) ─────────────────────────────────────────────────
r.get('/catalogue', requireAuth, requireTenant, (req, res) => {
  const safe = {};
  for (const [k, v] of Object.entries(PROVIDER_CATALOGUE)) {
    safe[k] = { ...v, models: v.models };
  }
  res.json(safe);
});

// ─── GET providers for tenant ────────────────────────────────────────────────
r.get('/providers', requireAuth, requireTenant, (req, res) => {
  ensureTables();
  const rows = D().prepare('SELECT * FROM ai_providers WHERE tenant_id=? ORDER BY is_default DESC, provider').all(req.tenantId);
  // Mask key
  res.json(rows.map(row => ({
    ...row,
    api_key: row.api_key ? '••••••••' + (row.api_key.slice(-4)) : null,
    has_key: !!row.api_key,
  })));
});

// ─── POST / PUT provider ─────────────────────────────────────────────────────
r.post('/providers', requireAuth, requireTenant, requireRole('admin','director'), (req, res) => {
  ensureTables();
  const b = req.body;
  const id = uuid();
  // If set as default, unset others
  if (b.is_default) D().prepare('UPDATE ai_providers SET is_default=0 WHERE tenant_id=?').run(req.tenantId);
  const cat = PROVIDER_CATALOGUE[b.provider];
  D().prepare(`INSERT INTO ai_providers (id,tenant_id,provider,label,api_key,base_url,default_model,enabled,is_default,
    cost_per_1k_input_cents,cost_per_1k_output_cents,monthly_budget_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(tenant_id,provider) DO UPDATE SET
      label=excluded.label, api_key=COALESCE(CASE WHEN excluded.api_key='••••••••' THEN NULL ELSE excluded.api_key END, api_key),
      base_url=excluded.base_url, default_model=excluded.default_model, enabled=excluded.enabled,
      is_default=excluded.is_default, cost_per_1k_input_cents=excluded.cost_per_1k_input_cents,
      cost_per_1k_output_cents=excluded.cost_per_1k_output_cents, monthly_budget_cents=excluded.monthly_budget_cents,
      updated_at=datetime('now')`)
    .run(id, req.tenantId, b.provider, b.label||cat?.name||b.provider, b.api_key||null, b.base_url||null,
      b.default_model||cat?.default_model||'gpt-4o-mini',
      b.enabled!==false?1:0, b.is_default?1:0,
      Math.round((b.cost_per_1k_input||0)*100), Math.round((b.cost_per_1k_output||0)*100),
      Math.round((b.monthly_budget||0)*100));
  res.json({ ok: true, id });
});

r.delete('/providers/:provider', requireAuth, requireTenant, requireRole('admin','director'), (req, res) => {
  ensureTables();
  D().prepare('DELETE FROM ai_providers WHERE tenant_id=? AND provider=?').run(req.tenantId, req.params.provider);
  res.json({ ok: true });
});

// ─── GET usage stats ─────────────────────────────────────────────────────────
r.get('/usage', requireAuth, requireTenant, (req, res) => {
  ensureTables();
  const rows = D().prepare(`SELECT provider_id, model, feature,
    SUM(tokens_in) as total_in, SUM(tokens_out) as total_out,
    SUM(cost_cents) as total_cost, COUNT(*) as requests,
    SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as successes,
    AVG(latency_ms) as avg_latency
    FROM ai_usage_log WHERE tenant_id=? AND created_at >= date('now','-30 days')
    GROUP BY provider_id, model, feature ORDER BY total_cost DESC`).all(req.tenantId);
  const total = D().prepare(`SELECT SUM(cost_cents) as cost, SUM(tokens_in+tokens_out) as tokens, COUNT(*) as requests
    FROM ai_usage_log WHERE tenant_id=? AND created_at >= date('now','-30 days')`).get(req.tenantId);
  res.json({ by_feature: rows, totals: total });
});

// ─── UNIFIED AI COMPLETION PROXY ──────────────────────────────────────────────
// POST /api/ai/complete — used by all features
r.post('/complete', requireAuth, requireTenant, async (req, res) => {
  ensureTables();
  const { messages, system, max_tokens = 1000, temperature = 0.7, feature = 'general', provider: preferredProvider, model: preferredModel } = req.body;
  if (!messages?.length && !system) return res.status(400).json({ error: 'messages required' });

  // Find active provider
  let provider;
  if (preferredProvider) {
    provider = D().prepare('SELECT * FROM ai_providers WHERE tenant_id=? AND provider=? AND enabled=1').get(req.tenantId, preferredProvider);
  }
  if (!provider) {
    provider = D().prepare('SELECT * FROM ai_providers WHERE tenant_id=? AND enabled=1 AND api_key IS NOT NULL ORDER BY is_default DESC, created_at').get(req.tenantId);
  }

  if (!provider) {
    return res.json({ content: null, error: 'no_provider', message: 'No AI provider configured. Please add an API key in Settings → AI.' });
  }

  const model = preferredModel || provider.default_model;
  const cat = PROVIDER_CATALOGUE[provider.provider];
  const t0 = Date.now();
  let responseText = null, tokensIn = 0, tokensOut = 0, errorMsg = null;

  try {
    const allMessages = messages || [];
    const sysMsg = system || null;

    if (provider.provider === 'openai' || provider.provider === 'mistral') {
      const body = {
        model,
        messages: [
          ...(sysMsg ? [{ role: 'system', content: sysMsg }] : []),
          ...allMessages,
        ],
        max_tokens, temperature,
      };
      const resp = await fetch(cat.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [cat.auth_header]: `${cat.auth_prefix}${provider.api_key}`,
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`${provider.provider} API error ${resp.status}: ${err.slice(0,200)}`);
      }
      const data = await resp.json();
      responseText = data.choices?.[0]?.message?.content || '';
      tokensIn  = data.usage?.prompt_tokens || 0;
      tokensOut = data.usage?.completion_tokens || 0;

    } else if (provider.provider === 'anthropic') {
      const body = {
        model,
        max_tokens,
        ...(sysMsg ? { system: sysMsg } : {}),
        messages: allMessages,
      };
      const resp = await fetch(cat.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': provider.api_key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Anthropic API error ${resp.status}: ${err.slice(0,200)}`);
      }
      const data = await resp.json();
      responseText = data.content?.[0]?.text || '';
      tokensIn  = data.usage?.input_tokens || 0;
      tokensOut = data.usage?.output_tokens || 0;

    } else if (provider.provider === 'google') {
      const endpoint = cat.endpoint_template
        .replace('{model}', model)
        .replace('{key}', provider.api_key);
      const contents = allMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      if (sysMsg) {
        contents.unshift({ role: 'user', parts: [{ text: sysMsg }] });
        contents.splice(1, 0, { role: 'model', parts: [{ text: 'Understood.' }] });
      }
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: max_tokens, temperature } }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Google API error ${resp.status}: ${err.slice(0,200)}`);
      }
      const data = await resp.json();
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      tokensIn  = data.usageMetadata?.promptTokenCount || 0;
      tokensOut = data.usageMetadata?.candidatesTokenCount || 0;

    } else if (provider.provider === 'ollama') {
      const baseUrl = provider.base_url || 'http://localhost:11434';
      const resp = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            ...(sysMsg ? [{ role: 'system', content: sysMsg }] : []),
            ...allMessages,
          ],
          stream: false,
          options: { temperature, num_predict: max_tokens },
        }),
      });
      if (!resp.ok) throw new Error(`Ollama error ${resp.status}`);
      const data = await resp.json();
      responseText = data.message?.content || '';
      tokensIn  = data.prompt_eval_count || 0;
      tokensOut = data.eval_count || 0;
    }

    // Log usage
    const latency = Date.now() - t0;
    const modelInfo = cat?.models?.find(m2 => m2.id === model);
    const costCents = modelInfo
      ? Math.round((tokensIn / 1000 * modelInfo.in) + (tokensOut / 1000 * modelInfo.out))
      : 0;
    try {
      D().prepare('INSERT INTO ai_usage_log (id,tenant_id,provider_id,model,feature,tokens_in,tokens_out,cost_cents,latency_ms,success) VALUES(?,?,?,?,?,?,?,?,?,1)')
        .run(uuid(), req.tenantId, provider.id, model, feature, tokensIn, tokensOut, costCents, latency);
      D().prepare('UPDATE ai_providers SET total_requests=total_requests+1,total_tokens_in=total_tokens_in+?,total_tokens_out=total_tokens_out+?,usage_cents_this_month=usage_cents_this_month+?,last_used=datetime(\'now\') WHERE id=?')
        .run(tokensIn, tokensOut, costCents, provider.id);
    } catch(e) {}

    res.json({ content: responseText, tokens_in: tokensIn, tokens_out: tokensOut, model, provider: provider.provider });

  } catch(e) {
    errorMsg = e.message;
    try {
      D().prepare('INSERT INTO ai_usage_log (id,tenant_id,provider_id,model,feature,success,error_msg) VALUES(?,?,?,?,?,0,?)')
        .run(uuid(), req.tenantId, provider.id, model, feature, errorMsg.slice(0,500));
    } catch{}
    res.status(502).json({ error: 'ai_error', message: errorMsg, content: null });
  }
});

export default r;
export { ensureTables };
