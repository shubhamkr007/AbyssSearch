import type { JsonObject, Source } from '../domain/models';

/** Fields that must never leave S4 in clear text on read APIs. */
const SECRET_KEYS = new Set([
  'secretAccessKey',
  'secretKey',
  'secret',
  'password',
  'token',
  'apiKey',
]);

export function redactConnectorConfig(config: JsonObject): JsonObject {
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(config ?? {})) {
    if (SECRET_KEYS.has(key) && typeof value === 'string' && value.length > 0) {
      out[key] = '***';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = redactConnectorConfig(value as JsonObject);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function redactSource(source: Source): Source {
  return {
    ...source,
    connectorConfig: redactConnectorConfig(source.connectorConfig ?? {}),
  };
}

/** For audits: never store secret values. */
export function redactSourceForAudit(source: Source): Source {
  return redactSource(source);
}
