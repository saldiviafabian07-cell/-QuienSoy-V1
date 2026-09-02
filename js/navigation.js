// Navegación y utilidades DOM compartidas por todas las pantallas.
export function createNavigation({
  state,
  screens,
  onReleaseWakeLock = () => {},
  onUpdateFinishButton = () => {},
  onRenderRoomExitControl = () => {},
  accountUid = () => {}
}) {
  const $ = id => document.getElementById(id);
  const setText = (id, text) => {
    const element = $(id);
    if (element) element.textContent = text ?? '';
  };

  function clearNotice() {
    [
      'roomNotice','joinNotice','lobbyNotice','prepNotice','scoringNotice',
      'registerNotice','loginNotice','profileNotice','friendsNotice',
      'requestsNotice','chupisticaNotice','ageSetupNotice',
      'confessionsSetupNotice','confessionsWritingStatus','errorStock',
      'confessionsWritingNotice','confessionsVotingStatus','agePlayingStatus',
      'agePlayingNotice','stopPlayingStatus','stopReviewStatus',
      'miniResultsStatus'
    ].forEach(id => {
      const element = $(id);
      if (!element) return;
      element.textContent = '';
      element.className = id === 'confessionsVotingStatus'
        ? 'confessions-vote-status'
        : element.className.includes('mini-status') ? 'mini-status' : 'room-notice';
    });
  }

  function show(id, {history = true, replace = false} = {}) {
    if (!id) return false;
    const previous = state.currentScreen;
    if (history && previous && previous !== id) {
      if (replace) state.screenHistory[state.screenHistory.length - 1] = id;
      else if (state.screenHistory[state.screenHistory.length - 1] !== previous) state.screenHistory.push(previous);
    }
    state.currentScreen = id;
    clearNotice();
    screens.forEach(screen => {
      const element = $(screen);
      if (element) element.classList.toggle('active', screen === id);
    });
    const labels = {
      home:'',mainMenu:'MENÚ',minigames:'MINIJUEGOS',gameHome:'¿QUIÉN SOY?',
      authRegister:'CUENTA',authLogin:'CUENTA',profile:'CUENTA',friends:'CUENTA',
      requests:'CUENTA',setup:'SALA',join:'SALA',lobby:'LOBBY',prep:'PARTIDA',
      reveal:'PARTIDA',starting:'PARTIDA',playing:'PARTIDA',scoring:'RESULTADO',
      results:'RESULTADO',finish:'FINAL',chupisticaSetup:'CHUPÍSTICA',
      chupisticaWheel:'CHUPÍSTICA',ageSetup:'EDAD',agePreparation:'EDAD',
      ageReveal:'EDAD',agePlaying:'EDAD',confessionsSetup:'CONFESIONES',
      confessionsWriting:'CONFESIONES',confessionsVoting:'CONFESIONES',
      confessionsResults:'CONFESIONES',confessionsScoreboard:'MARCADOR',
      chamuyayaHome:'CHAMUYA2',chamuyayaOnlineSetup:'CHAMUYA2',
      chamuyayaSetup:'CHAMUYA2',chamuyayaCountdown:'CHAMUYA2',
      chamuyayaReveal:'CHAMUYA2',chamuyayaDiscussion:'CHAMUYA2',
      chamuyayaVoting:'CHAMUYA2',chamuyayaResult:'CHAMUYA2',
      chamuyayaLocalReveal:'CHAMUYA2',chamuyayaLocalDiscussion:'CHAMUYA2',
      chamuyayaLocalVoting:'CHAMUYA2',chamuyayaLocalResult:'CHAMUYA2',
      tribunalSetup:'TRIBUNAL',tribunalRoles:'TRIBUNAL',
      tribunalPresentation:'TRIBUNAL',tribunalDebate:'TRIBUNAL',
      tribunalSurprise:'TRIBUNAL',tribunalFinal:'TRIBUNAL',
      tribunalVoting:'TRIBUNAL',tribunalResult:'TRIBUNAL',
      tribunalFinalResult:'TRIBUNAL',stopSetup:'STOP',stopReveal:'STOP',
      stopPlaying:'STOP',stopReview:'STOP',miniResults:'RESULTADO',miniFinish:'FINAL'
    };
    setText('stepBadge', labels[id] || '');
    const pageTitles = {
      home:'Acceso · JuNTa2',mainMenu:'Menú principal · JuNTa2',
      minigames:'Minijuegos · JuNTa2',gameHome:'Menú ¿Quién soy? · JuNTa2',
      authRegister:'Crear cuenta · JuNTa2',authLogin:'Iniciar sesión · JuNTa2',
      profile:'Mi perfil · JuNTa2',friends:'Amigos · JuNTa2',requests:'Solicitudes · JuNTa2',
      setup:'Crear sala · JuNTa2',join:'Entrar a una sala · JuNTa2',lobby:'Lobby · JuNTa2',
      prep:'Preparación · JuNTa2',reveal:'Tu personaje · JuNTa2',
      starting:'Comienza la partida · JuNTa2',playing:'Partida · JuNTa2',
      scoring:'Resultado · JuNTa2',results:'Puntajes · JuNTa2',
      finish:'Resultados finales · JuNTa2',
      chupisticaSetup:'Cultura Chupística · JuNTa2',
      chupisticaWheel:'Cultura Chupística · JuNTa2',
      ageSetup:'Adivina la Edad · JuNTa2',agePreparation:'Preparación · Adivina la Edad',
      ageReveal:'Tu edad · JuNTa2',agePlaying:'Estimación · JuNTa2',
      confessionsSetup:'🔥 Perdona Nuestros Pecados · JuNTa2',
      confessionsWriting:'🔥 Perdona Nuestros Pecados · JuNTa2',
      confessionsVoting:'Votación · Perdona Nuestros Pecados',
      confessionsResults:'Resultados · Perdona Nuestros Pecados',
      confessionsScoreboard:'Marcador · Perdona Nuestros Pecados',
      chamuyayaHome:'ChaMuYa2 · JuNTa2',chamuyayaOnlineSetup:'Sala ChaMuYa2 · JuNTa2',
      chamuyayaSetup:'ChaMuYa2 · Un celular',chamuyayaCountdown:'ChaMuYa2 · Comienza la partida',
      chamuyayaReveal:'ChaMuYa2 · Tu carta',chamuyayaDiscussion:'ChaMuYa2 · Discusión',
      chamuyayaVoting:'ChaMuYa2 · Votación',chamuyayaResult:'ChaMuYa2 · Resultado',
      chamuyayaLocalReveal:'ChaMuYa2 · Revelación',chamuyayaLocalDiscussion:'ChaMuYa2 · Discusión',
      chamuyayaLocalVoting:'ChaMuYa2 · Votación',chamuyayaLocalResult:'ChaMuYa2 · Resultado',
      tribunalSetup:'Tribunal Express · JuNTa2',tribunalRoles:'Tribunal Express · Roles',
      tribunalPresentation:'Tribunal Express · Caso',tribunalDebate:'Tribunal Express · Debate',
      tribunalSurprise:'Tribunal Express · Evidencia sorpresa',tribunalFinal:'Tribunal Express · Final del juicio',
      tribunalVoting:'Tribunal Express · Votación',tribunalResult:'Tribunal Express · Resultado',
      tribunalFinalResult:'Tribunal Express · Resultado final',stopSetup:'STOP · JuNTa2',
      stopReveal:'STOP · JuNTa2',stopPlaying:'STOP · JuNTa2',stopReview:'Revisión STOP · JuNTa2',
      miniResults:'Resultado · JuNTa2',miniFinish:'Resultados finales · JuNTa2'
    };
    document.title = pageTitles[id] || '¿Quién soy?';
    const active = $(id);
    if (active) {
      active.setAttribute('tabindex', '-1');
      window.setTimeout(() => {
        const heading = active.querySelector('h1');
        if (heading) {
          heading.setAttribute('tabindex', '-1');
          heading.focus({preventScroll:true});
        }
      }, 0);
    }
    const authOnly = ['home','authRegister','authLogin'];
    $('connectionStatus')?.classList.toggle('hidden', authOnly.includes(id));
    const showTopActions = [
      'gameHome','lobby','prep','reveal','starting','playing','scoring','results','finish',
      'agePreparation','ageReveal','agePlaying','confessionsWriting','confessionsVoting',
      'confessionsResults','confessionsScoreboard','chamuyayaCountdown','chamuyayaReveal',
      'chamuyayaDiscussion','chamuyayaVoting','chamuyayaResult','chamuyayaLocalReveal',
      'chamuyayaLocalDiscussion','chamuyayaLocalVoting','chamuyayaLocalResult',
      'tribunalRoles','tribunalPresentation','tribunalDebate','tribunalSurprise',
      'tribunalFinal','tribunalVoting','tribunalResult','tribunalFinalResult',
      'stopReveal','stopPlaying','stopReview','miniResults','miniFinish'
    ].includes(id);
    $('quickFriendsBtn')?.classList.toggle('visible', showTopActions && Boolean(accountUid()));
    $('profileBtn')?.classList.toggle('visible', showTopActions);
    if (!['prep','reveal','agePreparation','ageReveal','confessionsWriting','confessionsVoting'].includes(id)) {
      void onReleaseWakeLock();
    }
    onUpdateFinishButton();
    onRenderRoomExitControl(id);
    return true;
  }

  function goToScreenIfChanged(id) {
    if (state.currentScreen === id) return false;
    show(id, {history:false});
    return true;
  }

  function goBack(fallback = 'mainMenu') {
    const previous = state.screenHistory.pop();
    if (!previous || previous === state.currentScreen) {
      show(fallback, {history:false});
      return false;
    }
    show(previous, {history:false});
    return true;
  }

  function notice(message, type = '', target = 'roomNotice') {
    const element = $(target);
    if (!element) return;
    element.textContent = message || '';
    element.className = 'room-notice' + (message ? ' show ' : '') + (type ? ' ' + type : '');
  }

  return { $, setText, show, goToScreenIfChanged, goBack, notice, clearNotice };
}
