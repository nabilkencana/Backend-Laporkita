/**
 * Basic Profanity Filter Utility
 * Sesuai Rules.md §2.3 — Filter kata kasar/spam sebelum disimpan
 */

const PROFANITY_WORDS = [
  'anjing',
  'babi',
  'bangsat',
  'kontol',
  'memek',
  'jembut',
  'pantek',
  'bajingan',
  'tai',
  'fuck',
  'bitch',
  'asshole',
  'shit',
];

export function containsProfanity(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return PROFANITY_WORDS.some((word) => {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(lower);
  });
}

export function maskProfanity(text: string): string {
  if (!text) return text;
  let result = text;
  for (const word of PROFANITY_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(regex, (match) => '*'.repeat(match.length));
  }
  return result;
}
