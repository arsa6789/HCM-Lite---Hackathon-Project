// C0 (U+0000-U+001F) and C1 (U+007F-U+009F) control characters.
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;
// Control characters except newline (U+000A).
const CONTROL_CHARS_KEEP_NEWLINE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;
// Zero-width and bidirectional-override characters (prompt-injection defense).
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

export function sanitizeText(value, maxLength = 500) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(CONTROL_CHARS, "")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeMultiline(value, maxLength = 2000) {
  return String(value ?? "")
    .replace(CONTROL_CHARS_KEEP_NEWLINE, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeForLlm(value, maxLength = 2000) {
  return String(value ?? "")
    .replace(CONTROL_CHARS_KEEP_NEWLINE, "")
    .replace(INVISIBLE_CHARS, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

const SECRET_KEY_PATTERN = /password|secret|token|authorization|apikey/i;

function redact(value) {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value && typeof value === "object") {
    const clone = {};

    for (const [key, item] of Object.entries(value)) {
      clone[key] = SECRET_KEY_PATTERN.test(key) ? "[redacted]" : redact(item);
    }

    return clone;
  }

  return value;
}

export function redactSecrets(value) {
  return redact(value);
}

export function metaForAudit(value, maxLength = 2000) {
  try {
    const json = JSON.stringify(redactSecrets(value));

    if (json.length > maxLength) {
      return { truncated: true };
    }

    return json;
  } catch {
    return { truncated: true };
  }
}
