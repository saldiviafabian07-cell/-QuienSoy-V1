// Punto de integración de autenticación. Las operaciones y perfiles siguen usando Firebase.
export function createAuthController({ auth, state }) {
  function start(onAuthStateChanged) {
    if (auth && typeof onAuthStateChanged === 'function') {
      return auth.onAuthStateChanged(onAuthStateChanged);
    }
    state.authReady = true;
    return null;
  }
  return { start };
}
