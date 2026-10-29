const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const splitEmailRecipients = (value = "") =>
  String(value)
    .split(/[;,\n]+/)
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);

export const invalidEmailRecipients = (value = "") =>
  splitEmailRecipients(value).filter(email => !EMAIL_PATTERN.test(email));

export const normalizeEmailRecipients = (value = "") =>
  [...new Set(splitEmailRecipients(value))].join(", ");
