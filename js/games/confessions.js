// Reglas configurables de Perdona Nuestros Pecados.
export function createConfessionsGame({ confessionsData, cleanUiText }) {
  const modes = Array.isArray(confessionsData?.roundsModes) && confessionsData.roundsModes.length
    ? confessionsData.roundsModes
    : ['perPlayer'];

  function defaultConfessionsConfig() {
    return { roundsMode: modes[0] || 'perPlayer' };
  }

  function confessionsRoundCount(mode, playerCount) {
    const count = Math.max(1, Number(playerCount) || 0);
    const wanted = mode === '5' ? 5 : mode === '10' ? 10 : count;
    return Math.max(1, Math.min(wanted, count));
  }

  function confessionsModeLabel(mode) {
    return mode === '5' ? '5 rondas' : mode === '10' ? '10 rondas' : 'Una confesión por jugador';
  }

  function confessionsConfigFromUI(roundsMode) {
    return { roundsMode: roundsMode || modes[0] || 'perPlayer' };
  }

  function confessionActiveIds(game) {
    return Object.keys(game?.activePlayers || {})
      .filter(id => game.activePlayers[id] === true).map(String);
  }

  function confessionInitial(name) {
    const value = cleanUiText(name).replace(/[^A-Za-zÁÉÍÓÚÜÑa-záéíóúüñ0-9]/g, '');
    return (value.slice(0, 1) || '?').toUpperCase();
  }

  return {
    confessionsMaxLength: Number(confessionsData?.maxLength || 280),
    defaultConfessionsConfig,
    confessionsRoundCount,
    confessionsModeLabel,
    confessionsConfigFromUI,
    confessionActiveIds,
    confessionInitial
  };
}
