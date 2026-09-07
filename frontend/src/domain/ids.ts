let uidCounter = 0;

export function uid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}${Date.now().toString(36)}${uidCounter.toString(36)}`;
}
