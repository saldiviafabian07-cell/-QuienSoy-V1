// Punto de integración de amigos, solicitudes e invitaciones.
// La implementación de operaciones permanece en app para conservar sus rutas Firebase.
export function createFriendsController({ state, renderAccountUI, renderLobbyFriends }) {
  function refresh() {
    renderAccountUI?.();
    renderLobbyFriends?.();
  }
  return { state, refresh };
}
