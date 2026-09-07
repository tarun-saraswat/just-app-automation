const GENERAL_SENSITIVE = [
  /\b\d{10}\b/g,
  /\b\d{4,8}\b/g,
  /\b(?:flat|house|floor|building|apartment|road|street|lane)\b[^,\n]{0,80}/gi
];

export function redact(value, secrets = []) {
  let output = String(value ?? '');
  for (const secret of secrets.filter(Boolean)) output = output.replaceAll(secret, '[REDACTED]');
  for (const pattern of GENERAL_SENSITIVE) output = output.replace(pattern, '[REDACTED]');
  return output;
}

export function assertNonSensitive(value, secrets = []) {
  const original = String(value ?? '');
  if (redact(original, secrets) !== original) throw new Error('Sensitive content refused by evidence policy');
  return true;
}

