function levenshteinDistance<T>(a: T[], b: T[]): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[rows - 1][cols - 1];
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[\r\n]+/g, " ")
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function normalizeChars(text: string): string[] {
  return Array.from(
    text
      .toLowerCase()
      .replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function computeWer(reference: string, hypothesis: string): number {
  const ref = normalizeWords(reference);
  const hyp = normalizeWords(hypothesis);
  const distance = levenshteinDistance(ref, hyp);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  return distance / ref.length;
}

export function computeCer(reference: string, hypothesis: string): number {
  const ref = normalizeChars(reference);
  const hyp = normalizeChars(hypothesis);
  const distance = levenshteinDistance(ref, hyp);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  return distance / ref.length;
}
