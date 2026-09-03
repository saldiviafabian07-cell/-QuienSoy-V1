// Punto de integración de creación, unión y lobby de salas.
// Las salas continúan siendo datos remotos de Firebase, no archivos locales.
export function createRoomsController({ state, createRoom, joinAnyRoom, startGame }) {
  function bind() {
    return { state, createRoom, joinAnyRoom, startGame };
  }
  return { bind };
}
