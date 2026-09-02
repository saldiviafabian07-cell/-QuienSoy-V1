// Catálogo editable de Tribunal Express. La partida y sus resultados permanecen en Firebase.
export function createTribunalGame({ tribunalData }) {
  const cases = Array.isArray(tribunalData?.casos) ? tribunalData.casos : [];
  function tribunalCaseById(id) {
    return cases[Number(id)] || null;
  }
  function tribunalCaseCount() {
    return cases.length;
  }
  return { tribunalCaseById, tribunalCaseCount, tribunalCases: cases };
}
