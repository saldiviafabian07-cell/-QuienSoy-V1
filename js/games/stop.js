// Configuración de contenido de STOP. El estado del formulario se conserva en app/localStorage.
export function createStopGame({ stopLetters, stopCategories, defaultCategories }) {
  const letters = [...(stopLetters || [])];
  const categories = [...(stopCategories || [])];
  const selectedCategories = [...(defaultCategories || [])];

  function defaultStopConfig() {
    return {
      totalRounds: 3,
      timeSeconds: 60,
      letters: [...letters],
      categories: [...selectedCategories],
      customCategories: [],
      lastLetter: ''
    };
  }

  function normalizeAnswer(value) {
    return String(value || '').trim().toLocaleLowerCase('es')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  }

  function answerMatchesLetter(value, letter) {
    const answer = normalizeAnswer(value), expected = normalizeAnswer(letter);
    return Boolean(answer.length >= 2 && expected && answer.startsWith(expected));
  }

  return {
    stopLetters: letters,
    stopCategories: categories,
    defaultStopConfig,
    stopNormalizeAnswer: normalizeAnswer,
    stopAnswerMatchesLetter: answerMatchesLetter
  };
}
