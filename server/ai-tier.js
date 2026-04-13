/**
 * server/ai-tier.js — Shared AI model tier lookup
 * Import: import { getModel, getAIKey } from './ai-tier.js';
 */
import { D } from './db.js';

const DEFAULTS = {
  fast: 'claude-haiku-4-5-20251001',
  balanced: 'claude-sonnet-4-6',
  powerful: 'claude-opus-4-6',
};

export function getModel(tenantId, tier = 'fast') {
  try {
    const col = 'tier_' + tier;
    const sql = 'SELECT ' + col + ' FROM ai_model_tiers WHERE tenant_id=?';
    const row = D().prepare(sql).get(tenantId);
    return row?.[col] || DEFAULTS[tier] || DEFAULTS.fast;
  } catch(e) { return DEFAULTS[tier] || DEFAULTS.fast; }
}

export function getAIKey(tenantId) {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try { const p = D().prepare("SELECT api_key FROM ai_provider_config WHERE tenant_id=? AND provider='anthropic'").get(tenantId); if (p?.api_key) return p.api_key; } catch(e) {}
  try { const p = D().prepare("SELECT key_value FROM tenant_credentials WHERE tenant_id=? AND provider='anthropic' AND key_name='api_key'").get(tenantId); if (p?.key_value) return p.key_value; } catch(e) {}
  return null;
}
