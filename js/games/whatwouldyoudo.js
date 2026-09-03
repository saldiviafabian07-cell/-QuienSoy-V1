// Lógica pura de selección y resultados de WHAT WOULD YOU DO?.
// Las preguntas editables viven en data/whatwouldyoudo/data.js.
export function createWhatWouldYouDoGame({ questions, shuffle }) {
  const catalog = Array.isArray(questions) ? questions : [];

  function validQuestions(categories) {
    const selected = new Set((categories || []).map(String));
    return catalog.filter(question => selected.has(String(question.category)));
  }

  function chooseQuestion(categories, usedIds = [], previousId = '') {
    const pool = validQuestions(categories);
    if (!pool.length) return null;
    const used = new Set((usedIds || []).map(String));
    const unused = pool.filter(question => !used.has(String(question.id)));
    const withoutPrevious = unused.filter(question => String(question.id) !== String(previousId));
    const candidates = withoutPrevious.length ? withoutPrevious : (unused.length ? unused : pool.filter(question => String(question.id) !== String(previousId)));
    const source = candidates.length ? candidates : pool;
    return shuffle(source)[0] || null;
  }

  function getQuestionById(id) {
    return catalog.find(question => String(question.id) === String(id)) || null;
  }

  function calculateResult(question, votes, playerIds) {
    const ids = (playerIds || []).map(String);
    const normalizedVotes = {};
    ids.forEach(id => {
      const vote = votes?.[id];
      if (vote === 'A' || vote === 'B') normalizedVotes[id] = vote;
    });
    const countA = Object.values(normalizedVotes).filter(vote => vote === 'A').length;
    const countB = Object.values(normalizedVotes).filter(vote => vote === 'B').length;
    const total = ids.length || 1;
    const percentageA = Math.round((countA / total) * 100);
    const percentageB = Math.round((countB / total) * 100);
    const tie = countA === countB;
    const winner = tie ? null : countA > countB ? 'A' : 'B';
    const scores = {};
    ids.forEach(id => { scores[id] = !tie && normalizedVotes[id] === winner ? 1 : 0; });
    return {
      type: 'whatwouldyoudo',
      questionId: String(question?.id || ''),
      category: String(question?.category || ''),
      optionA: String(question?.optionA || ''),
      optionB: String(question?.optionB || ''),
      votes: normalizedVotes,
      countA,
      countB,
      percentageA,
      percentageB,
      winner,
      tie,
      scores
    };
  }

  return { catalog, validQuestions, chooseQuestion, getQuestionById, calculateResult };
}
