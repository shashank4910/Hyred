/**
 * Check if a skill keyword appears in a job title or description (whole-word, case-insensitive).
 */
export function isSkillPresentInJd(
  skill: string,
  jdText: string | null,
  jobTitle: string | null,
): boolean {
  if (!skill) return false;
  const normalizedSkill = skill.trim().toLowerCase();
  if (!normalizedSkill) return false;

  const stripHtml = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ');
  const textToCheck = `${jobTitle ?? ''}\n${stripHtml(jdText ?? '')}`.toLowerCase();
  if (!textToCheck) return false;

  const hasExactWord = (word: string): boolean => {
    const firstCharAlpha = /[a-zA-Z0-9]/.test(word[0]);
    const lastCharAlpha = /[a-zA-Z0-9]/.test(word[word.length - 1]);

    let index = 0;
    while (true) {
      const foundIdx = textToCheck.indexOf(word, index);
      if (foundIdx === -1) break;

      let isMatch = true;

      if (firstCharAlpha && foundIdx > 0) {
        const charBefore = textToCheck[foundIdx - 1];
        if (/[a-zA-Z0-9]/.test(charBefore)) {
          isMatch = false;
        }
      }

      if (lastCharAlpha && foundIdx + word.length < textToCheck.length) {
        const charAfter = textToCheck[foundIdx + word.length];
        if (/[a-zA-Z0-9]/.test(charAfter)) {
          if (charAfter === 's') {
            const charAfterS =
              foundIdx + word.length + 1 < textToCheck.length
                ? textToCheck[foundIdx + word.length + 1]
                : '';
            if (/[a-zA-Z0-9]/.test(charAfterS)) {
              isMatch = false;
            }
          } else {
            isMatch = false;
          }
        }
      }

      if (isMatch) return true;
      index = foundIdx + 1;
    }
    return false;
  };

  if (hasExactWord(normalizedSkill)) return true;

  if (normalizedSkill.endsWith('s') && normalizedSkill.length > 3) {
    const singular = normalizedSkill.slice(0, -1);
    if (hasExactWord(singular)) return true;
  } else {
    const plural = normalizedSkill + 's';
    if (hasExactWord(plural)) return true;
  }

  const words = normalizedSkill.split(/[\s\-\/]+/);
  if (words.length > 1) {
    const stopWords = new Set([
      'and', 'the', 'for', 'with', 'use', 'using', 'dev', 'developer', 'engineer',
      'engineering', 'development', 'programming', 'scripting', 'testing', 'automation',
      'systems', 'platform', 'framework', 'tools', 'tool', 'cloud', 'architecture', 'services',
    ]);

    for (const w of words) {
      if (w.length >= 3 && !stopWords.has(w)) {
        if (hasExactWord(w)) return true;
      }
    }
  }

  return false;
}
