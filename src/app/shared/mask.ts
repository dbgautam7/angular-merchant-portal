/**
 * Shows only the last 4 characters: `TAX900000001` becomes `••••••••0001`. This is the format the
 * server uses, and masking an already masked value changes nothing, so it is safe on any input.
 */
export const maskValue = (value: string): string =>
  '•'.repeat(Math.max(0, value.length - 4)) + value.slice(-4);
