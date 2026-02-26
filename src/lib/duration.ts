const DURATION_RE = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?$/;

export function parseDuration(input: string): number {
  const match = DURATION_RE.exec(input);
  if (!match || input === "") {
    throw new Error(`Invalid duration: "${input}". Use formats like 30m, 1h, 2d, 1h30m.`);
  }

  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);

  const ms = ((days * 24 + hours) * 60 + minutes) * 60 * 1000;

  if (ms === 0) {
    throw new Error("Duration must be greater than zero.");
  }

  return ms;
}
