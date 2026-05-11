export function readVersion(content: string): string | undefined {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const v = parsed.version;
  if (typeof v !== 'string') return undefined;
  return v;
}

function findTopLevelVersionRange(content: string): { start: number; end: number } | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  let i = 0;

  const tryMatchVersionAt = (p: number): { start: number; end: number } | null => {
    const re = /^"version"\s*:\s*"([^"]*)"/;
    const m = re.exec(content.slice(p));
    if (!m) return null;
    const valueStart = p + m[0].indexOf('"', m[0].indexOf(':')) + 1;
    const valueEnd = valueStart + m[1].length;
    return { start: valueStart, end: valueEnd };
  };

  while (i < content.length) {
    const ch = content[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      i++;
      continue;
    }
    if (ch === '"') {
      if (depth === 1) {
        const found = tryMatchVersionAt(i);
        if (found) return found;
      }
      inString = true;
      i++;
      continue;
    }
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    i++;
  }
  return null;
}

function detectIndent(content: string): string | number {
  const m = /\n([ \t]+)\S/.exec(content);
  if (!m) return 2;
  const indent = m[1];
  if (indent.includes('\t')) return '\t';
  return indent.length;
}

export function writeVersion(content: string, newVersion: string): string {
  const range = findTopLevelVersionRange(content);
  if (range) {
    return content.slice(0, range.start) + newVersion + content.slice(range.end);
  }
  const parsed = JSON.parse(content) as Record<string, unknown>;
  parsed.version = newVersion;
  const indent = detectIndent(content);
  const trailingNewline = content.endsWith('\n');
  return JSON.stringify(parsed, null, indent) + (trailingNewline ? '\n' : '');
}
