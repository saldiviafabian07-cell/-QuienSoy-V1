// Temporizadores sincronizados. Conserva serverTimeOffset/serverNow, timestamps
// compartidos, setInterval, watchdog y reintentos de las fases existentes.
export function createCountdown({
  state,
  serverNow,
  setText,
  feedbackAtZero,
  handleRoomSnapshot,
  characterDisplayDuration
}) {
  function clearCountdown() {
    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }
    if (state.countdownWatchdogTimer) {
      clearTimeout(state.countdownWatchdogTimer);
      state.countdownWatchdogTimer = null;
    }
    state.countdownKey = '';
    state.countdownPhase = '';
    state.countdownEndAt = 0;
    state.countdownPerformanceEndAt = 0;
    state.countdownTransitioningKey = '';
    state.countdownFeedbackKey = '';
  }

  function clearTransitionRetry() {
    if (state.transitionRetryTimer) {
      clearTimeout(state.transitionRetryTimer);
      state.transitionRetryTimer = null;
    }
  }

  function scheduleTransitionRetry(callback, delay = 350) {
    if (state.transitionRetryTimer || typeof callback !== 'function') return;
    state.transitionRetryTimer = window.setTimeout(() => {
      state.transitionRetryTimer = null;
      void callback();
    }, delay);
  }

  function revealEndAt(game) {
    const explicit = Number(game?.revealEndsAt);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const started = Number(game?.revealAt);
    if (Number.isFinite(started) && started > 0) return started + characterDisplayDuration;
    // Las rondas nuevas escriben revealEndsAt. revealAt queda como compatibilidad
    // con salas antiguas y también es un timestamp compartido.
    return NaN;
  }

  function processCommittedRoomGame(gameSnapshot) {
    if (!gameSnapshot || !state.lastRoomData) return;
    handleRoomSnapshot({...state.lastRoomData, game: gameSnapshot});
  }

  function startSynchronizedCountdown({
    phase,
    round,
    endsAt,
    elementId,
    onZero,
    playZeroFeedback = false
  }) {
    const endAt = Number(endsAt);
    const roundNumber = Number(round);
    if (!Number.isFinite(endAt) || !Number.isFinite(roundNumber)) return false;
    const key = `${phase}:${roundNumber}:${endAt}`;

    // Firebase puede emitir muchos snapshots por segundo. Si la fase, ronda y
    // EndsAt no cambiaron, conservamos el intervalo existente.
    if (state.countdownKey === key && state.countdownPhase === phase && Number(state.countdownEndAt) === endAt) {
      const seconds = Math.max(0, Math.ceil((endAt - serverNow()) / 1000));
      setText(elementId, seconds);
      return true;
    }

    clearCountdown();
    state.countdownKey = key;
    state.countdownPhase = phase;
    state.countdownEndAt = endAt;
    const initialRemainingMs = Math.max(0, endAt - serverNow());
    state.countdownPerformanceEndAt = performance.now() + initialRemainingMs;
    state.countdownTransitioningKey = '';

    const tick = () => {
      const remainingMs = Math.max(0, endAt - serverNow());
      const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
      setText(elementId, seconds);
      const finished = remainingMs <= 0;
      if (!finished || state.countdownTransitioningKey === key) return;

      state.countdownTransitioningKey = key;
      if (playZeroFeedback) feedbackAtZero(key);
      Promise.resolve()
        .then(() => onZero?.())
        .catch(error => console.error(`[GAME STATE] ${phase} timeout transition`, error))
        .finally(() => {
          if (state.countdownKey === key && state.lastRoomData?.game?.phase === phase) {
            state.countdownTransitioningKey = '';
          }
        });
    };

    tick();
    state.countdownTimer = window.setInterval(tick, 250);

    const watchdogDelay = Math.max(0, endAt - serverNow() + 150);
    state.countdownWatchdogTimer = window.setTimeout(() => {
      state.countdownWatchdogTimer = null;
      if (state.countdownKey !== key) return;
      tick();
      if (state.countdownKey === key && state.lastRoomData?.game?.phase === phase && serverNow() < endAt) {
        state.countdownWatchdogTimer = window.setTimeout(() => {
          state.countdownWatchdogTimer = null;
          if (state.countdownKey === key) tick();
        }, Math.max(250, endAt - serverNow() + 100));
      }
    }, watchdogDelay);
    return true;
  }

  return {
    clearCountdown,
    clearTransitionRetry,
    scheduleTransitionRetry,
    revealEndAt,
    processCommittedRoomGame,
    startSynchronizedCountdown
  };
}
