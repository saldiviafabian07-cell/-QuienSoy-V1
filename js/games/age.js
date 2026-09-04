// Lógica pura y configurable de Adivina la Edad.
// La partida, los jugadores y sus resultados siguen viviendo en Firebase.
export function createAgeGame({ ageData, state, normalizeRoomPlayers, backendUid, isTemporarilyReconnectable }) {
  const minAge = Number(ageData?.minAge ?? 0);
  const maxAge = Number(ageData?.maxAge ?? 10000);

  function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function generateWeightedAge() {
    const roll = Math.random();
    if (roll < .85) return randomInteger(minAge, Math.min(100, maxAge));
    if (roll < .97) return randomInteger(Math.min(101, maxAge), Math.min(150, maxAge));
    if (roll < .995) return randomInteger(Math.min(151, maxAge), Math.min(999, maxAge));
    return randomInteger(Math.min(1000, maxAge), maxAge);
  }

  function isValidAgeTarget(value) {
    if (value === null || value === undefined || String(value).trim() === '') return false;
    const target = Number(value);
    return Number.isSafeInteger(target) && target >= minAge && target <= maxAge;
  }

  function ageTargetAliases(data, playerId) {
    let player = data?.players?.[playerId] || {};
    if (!Object.keys(player).length) {
      const match = Object.entries(data?.players || {}).find(([id, value]) =>
        String(id) === String(playerId) ||
        String(value?.authUid || '') === String(playerId) ||
        String(value?.accountUid || '') === String(playerId)
      );
      if (match) player = { id: match[0], ...match[1] };
    }
    return [...new Set([
      String(playerId || ''), String(player.authUid || ''),
      String(player.accountUid || ''), String(player.id || '')
    ].filter(Boolean))];
  }

  function ageTargetForPlayer(game, data, playerId) {
    const targets = game?.ageTargetsByPlayer || {};
    for (const key of ageTargetAliases(data, playerId)) {
      if (isValidAgeTarget(targets[key])) return Number(targets[key]);
    }
    return null;
  }

  function generateAgeTargets(players, reservedTargets = new Set()) {
    const targets = {}, used = new Set([...reservedTargets]), maxAttempts = 80;
    (players || []).forEach(player => {
      const id = String(player.id);
      let target = null;
      for (let index = 0; index < maxAttempts; index++) {
        const candidate = generateWeightedAge();
        if (!used.has(candidate)) { target = candidate; break; }
      }
      if (target === null) {
        for (let candidate = minAge; candidate <= maxAge; candidate++) {
          if (!used.has(candidate)) { target = candidate; break; }
        }
      }
      if (target === null) target = minAge;
      used.add(target);
      targets[id] = target;
    });
    return targets;
  }

  function ensureAgeTargets(game, data) {
    const ids = Object.keys(game?.activePlayers || {})
      .filter(id => game.activePlayers[id] === true);
    const targets = {}, used = new Set();
    ids.forEach(id => {
      const target = ageTargetForPlayer(game, data, id);
      if (isValidAgeTarget(target) && !used.has(target)) {
        targets[id] = target;
        used.add(target);
      }
    });
    const missing = ids.filter(id => targets[id] === undefined);
    return { ...targets, ...generateAgeTargets(missing.map(id => ({ id })), used) };
  }

  function ageCurrentPlayerId(data) {
    const players = normalizeRoomPlayers(data), uid = String(backendUid() || '');
    return players.find(player => String(player.id) === String(state.playerId))?.id ||
      players.find(player => uid && (String(player.id) === uid || String(player.authUid || '') === uid))?.id ||
      state.playerId;
  }

  function ageActivePlayerIds(game, data = state.lastRoomData) {
    const ids = Object.keys(game?.activePlayers || {})
      .filter(id => game.activePlayers[id] === true);
    if (!data?.players) return ids;
    return ids.filter(id => {
      const player = data.players?.[id];
      return Boolean(player && !player.leftAt && isTemporarilyReconnectable(player));
    });
  }

  return {
    randomInteger,
    generateWeightedAge,
    isValidAgeTarget,
    ageTargetAliases,
    ageTargetForPlayer,
    generateAgeTargets,
    ensureAgeTargets,
    ageCurrentPlayerId,
    ageActivePlayerIds
  };
}
