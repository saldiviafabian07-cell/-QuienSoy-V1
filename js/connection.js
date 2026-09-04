// Conexión, presencia de Firebase y reconexión de la sala.
export function createConnection({
  state,
  db,
  setConnectionStatus,
  scheduleAutoReconnect,
  cancelReconnect
}) {
  const requestRoomReconnect = reason => {
    if (!state.roomRef) return;
    state.roomConnectionPaused = true;
    setConnectionStatus('reconnecting', 'Reconectando…');
    // Un único scheduler coordina .info/connected, online/offline y el
    // watchdog. Así no se solapan recuperaciones ni se crean timers paralelos.
    scheduleAutoReconnect(reason);
  };

  const startConnectionWatchdog = () => {
    clearTimeout(state.connectionWatchdog);
    state.connectionWatchdog = setTimeout(() => {
      if (state.lastConnected === null) {
        setConnectionStatus('reconnecting', 'Intentando conectar con Firebase…');
        if (state.roomRef) {
          state.roomConnectionPaused = true;
          scheduleAutoReconnect('watchdog');
        }
      }
    }, 8000);
  };

  function start() {
    if (db) {
      db.ref('.info/serverTimeOffset').on('value', snapshot => {
        state.serverTimeOffset = Number(snapshot.val()) || 0;
      });
      startConnectionWatchdog();
      db.ref('.info/connected').on('value', snapshot => {
        const connected = snapshot.val() === true;
        state.lastConnected = connected;
        clearTimeout(state.connectionWatchdog);
        if (connected) {
          if (state.roomRef) {
            requestRoomReconnect('firebase-connected');
          } else {
            state.roomConnectionPaused = false;
            cancelReconnect();
            setConnectionStatus('online', 'Conectado');
          }
          return;
        }
        if (state.roomRef) {
          state.roomConnectionPaused = true;
          setConnectionStatus('reconnecting', 'Reconectando…');
          scheduleAutoReconnect('firebase-disconnected');
        } else setConnectionStatus('offline', 'Sin conexión');
      });
      return;
    }
    setConnectionStatus('offline', 'Firebase pendiente');
  }

  return { start, startConnectionWatchdog, requestRoomReconnect };
}
