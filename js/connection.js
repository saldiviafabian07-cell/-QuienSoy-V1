// Conexión, presencia de Firebase y reconexión de la sala.
export function createConnection({
  state,
  db,
  setConnectionStatus,
  scheduleAutoReconnect,
  cancelReconnect,
  recoverRoomConnection
}) {
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
            state.roomConnectionPaused = true;
            setConnectionStatus('reconnecting', 'Reconectando…');
            if (!state.restoring && !state.busy.reconnect) {
              void recoverRoomConnection('firebase-connected').then(ok => {
                if (ok) {
                  state.roomConnectionPaused = false;
                  cancelReconnect();
                } else {
                  state.roomConnectionPaused = true;
                  scheduleAutoReconnect('firebase-connected');
                }
              });
            }
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

  return { start, startConnectionWatchdog };
}
