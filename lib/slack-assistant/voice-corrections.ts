/**
 * Voice-to-text corrections applied before intent classification.
 * Maps common speech-to-text mistakes to correct words.
 */

const corrections: Record<string, string> = {
  "choker": "choquer",
  "choke air": "choquer",
  "choker agency": "choquer agency",
  "choke her": "choquer",
  "shocker": "choquer",
};

/**
 * Apply known voice-to-text corrections to a message.
 * Uses case-insensitive word-boundary matching.
 */
export function applyVoiceCorrections(text: string): string {
  let corrected = text;
  for (const [wrong, right] of Object.entries(corrections)) {
    const regex = new RegExp(`\\b${wrong}\\b`, "gi");
    corrected = corrected.replace(regex, right);
  }
  return corrected;
}
