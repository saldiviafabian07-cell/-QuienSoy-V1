// Lógica de catálogo y asignación de ¿Quién soy?.
// El contenido editable se recibe desde data/whoami/characters.js.
export function createWhoamiGame({ characters, shuffle }) {
  const characterCatalog = characters;

  function normalizarNombrePersonaje(nombre) {
    return String(nombre || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[()¿?¡!.,'"/]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function characterKey(character) {
    const category = normalizarNombrePersonaje(character?.categoria || '');
    const name = normalizarNombrePersonaje(character?.nombre || '');
    if (category && name) return `${category}|${name}`;
    if (character?.id !== undefined && character?.id !== null) return `id|${String(character.id)}`;
    return 'unknown|';
  }

  function uniqueCharacters(items) {
    const seen = new Set();
    const seenNames = new Set();
    const result = [];
    for (const character of items || []) {
      const key = characterKey(character);
      const name = normalizarNombrePersonaje(character?.nombre || '');
      if (!key || seen.has(key) || (name && seenNames.has(name))) continue;
      seen.add(key);
      if (name) seenNames.add(name);
      result.push(character);
    }
    return result;
  }

  function dedupeCharacterCatalog() {
    const seen = new Set();
    const duplicates = [];
    const unique = characterCatalog.filter(character => {
      const key = characterKey(character);
      if (seen.has(key)) {
        duplicates.push(`${character?.categoria || ''}/${character?.nombre || ''}`);
        return false;
      }
      seen.add(key);
      return true;
    });
    if (duplicates.length) console.warn('Personajes duplicados eliminados del catálogo:', duplicates);
    characterCatalog.splice(0, characterCatalog.length, ...unique);
  }

  function characterPool(categories) {
    return uniqueCharacters(characterCatalog.filter(character => categories.includes(character.categoria)));
  }

  function createAssignments(players, categories, recentKeys) {
    const pool = uniqueCharacters(characterPool(categories));
    const recent = new Set((recentKeys || []).map(String));
    if (pool.length < players.length) return null;
    const fresh = shuffle(pool.filter(character => !recent.has(characterKey(character))));
    const old = shuffle(pool.filter(character => recent.has(characterKey(character))));
    const available = [...fresh, ...old];
    if (available.length < players.length) return null;
    const assignments = {};
    const usedKeys = [];
    players.forEach((player, index) => {
      const character = available[index];
      assignments[String(player.id)] = {
        playerId: String(player.id),
        player: player.name,
        character
      };
      usedKeys.push(characterKey(character));
    });
    return { assignments, usedKeys };
  }

  function auditCharacterCatalog() {
    const seen = new Set();
    const duplicates = [];
    for (const character of characterCatalog) {
      const key = characterKey(character);
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }
    if (duplicates.length) console.warn('[CHARACTERS] duplicates removed', duplicates);
    return { total: characterCatalog.length, unique: seen.size, duplicates };
  }

  return {
    characterKey,
    uniqueCharacters,
    dedupeCharacterCatalog,
    characterPool,
    createAssignments,
    auditCharacterCatalog
  };
}
