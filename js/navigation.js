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
      'miniResultsStatus','accessNotice'
      ,'whatWouldYouDoSetupNotice','whatWouldYouDoVoteStatus','whatWouldYouDoResultStatus','whatWouldYouDoResultOwn','whatWouldYouDoResultScore'
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
    // El DOM es la fuente final de verdad para no dejar pantallas antiguas
    // activas si la lista de compatibilidad y el HTML no se actualizan juntos.
    document.querySelectorAll('.screen').forEach(element => {
      element.classList.toggle('active', element.id === id);
    });
    const labels = {
      access:'ACCESO',home:'HOME',minigames:'ELEGIR JUEGO',gameHome:'¿QUIÉN SOY?',
      authRegister:'CUENTA',authLogin:'CUENTA',profile:'CUENTA',friends:'CUENTA',
      requests:'CUENTA',setup:'CONFIGURACIÓN',join:'INGRESAR CÓDIGO',lobby:'LOBBY',prep:'PARTIDA',
      reveal:'PARTIDA',starting:'PARTIDA',playing:'PARTIDA',scoring:'RESULTADO',
      results:'RESULTADO',finish:'FINAL',chupisticaSetup:'CULTURA CHUPÍSTICA',
      chupisticaWheel:'CULTURA CHUPÍSTICA',ageMode:'ADIVINA LA EDAD',ageSetup:'CONFIGURACIÓN',agePreparation:'ADIVINA LA EDAD',
      ageReveal:'ADIVINA LA EDAD',agePlaying:'ADIVINA LA EDAD',confessionsSetup:'ConFESa2',
      confessionsWriting:'ConFESa2',confessionsVoting:'ConFESa2',
      confessionsResults:'ConFESa2',confessionsScoreboard:'MARCADOR',
      chamuyayaHome:'ChaMuYa2',chamuyayaOnlineSetup:'ChaMuYa2',
      chamuyayaSetup:'ChaMuYa2',chamuyayaCountdown:'ChaMuYa2',
      chamuyayaReveal:'ChaMuYa2',chamuyayaDiscussion:'ChaMuYa2',
      chamuyayaVoting:'ChaMuYa2',chamuyayaResult:'ChaMuYa2',
      chamuyayaLocalReveal:'ChaMuYa2',chamuyayaLocalDiscussion:'ChaMuYa2',
      chamuyayaLocalVoting:'ChaMuYa2',chamuyayaLocalResult:'ChaMuYa2',
      tribunalSetup:'SR. JUEZ',tribunalRoles:'SR. JUEZ',
      tribunalPresentation:'SR. JUEZ',tribunalDebate:'SR. JUEZ',
      tribunalSurprise:'SR. JUEZ',tribunalFinal:'SR. JUEZ',
      tribunalVoting:'SR. JUEZ',tribunalResult:'SR. JUEZ',
      tribunalFinalResult:'TRIBUNAL',stopSetup:'STOP',stopReveal:'STOP',
      stopPlaying:'STOP',stopReview:'STOP',miniResults:'RESULTADO',miniFinish:'FINAL',
      whatWouldYouDoSetup:'WHAT WOULD YOU DO?',whatWouldYouDoPlaying:'WHAT WOULD YOU DO?',whatWouldYouDoResult:'WHAT WOULD YOU DO?',
      whoamiLocalFinalReveal:'¿QUIÉN SOY?',ageLocalFinalReveal:'ADIVINA LA EDAD'
    };
    setText('stepBadge', labels[id] || '');
    const pageTitles = {
      access:'Acceso · JuNTa2',home:'Home · JuNTa2',
      minigames:'Elegir juego · JuNTa2',gameHome:'¿Quién soy? · Modo de juego · JuNTa2',
      authRegister:'Crear cuenta · JuNTa2',authLogin:'Iniciar sesión · JuNTa2',
      profile:'Mi perfil · JuNTa2',friends:'Amigos · JuNTa2',requests:'Solicitudes · JuNTa2',
      setup:'Crear sala · JuNTa2',join:'Entrar a una sala · JuNTa2',lobby:'Lobby · JuNTa2',
      prep:'Preparación · JuNTa2',reveal:'Tu personaje · JuNTa2',
      starting:'Comienza la partida · JuNTa2',playing:'Partida · JuNTa2',
      scoring:'Resultado · JuNTa2',results:'Puntajes · JuNTa2',
      finish:'Resultados finales · JuNTa2',
      chupisticaSetup:'CULTURA CHUPÍSTICA · JuNTa2',
      chupisticaWheel:'CULTURA CHUPÍSTICA · JuNTa2',
      ageMode:'Adivina la Edad · Modo de juego · JuNTa2',ageSetup:'Adivina la Edad · Configuración · JuNTa2',agePreparation:'Preparación · Adivina la Edad',
      ageReveal:'Tu edad · JuNTa2',agePlaying:'Estimación · JuNTa2',
      confessionsMode:'CONFESIONES · MODO DE JUEGO',
      confessionsSetup:'🔥 ConFESa2 · JuNTa2',
      confessionsWriting:'🔥 ConFESa2 · JuNTa2',
      confessionsVoting:'Votación · ConFESa2',
      confessionsResults:'Resultados · ConFESa2',
      confessionsScoreboard:'Marcador · ConFESa2',
      chamuyayaHome:'ChaMuYa2 · JuNTa2',chamuyayaOnlineSetup:'Sala ChaMuYa2 · JuNTa2',
      chamuyayaSetup:'ChaMuYa2 · Un celular',chamuyayaCountdown:'ChaMuYa2 · Comienza la partida',
      chamuyayaReveal:'ChaMuYa2 · Tu carta',chamuyayaDiscussion:'ChaMuYa2 · Discusión',
      chamuyayaVoting:'ChaMuYa2 · Votación',chamuyayaResult:'ChaMuYa2 · Resultado',
      chamuyayaLocalReveal:'ChaMuYa2 · Revelación',chamuyayaLocalDiscussion:'ChaMuYa2 · Discusión',
      chamuyayaLocalVoting:'ChaMuYa2 · Votación',chamuyayaLocalResult:'ChaMuYa2 · Resultado',
      tribunalSetup:'SR. JUEZ · JuNTa2',tribunalRoles:'SR. JUEZ · Roles',
      tribunalPresentation:'SR. JUEZ · Caso',tribunalDebate:'SR. JUEZ · Debate',
      tribunalSurprise:'SR. JUEZ · Evidencia sorpresa',tribunalFinal:'SR. JUEZ · Final del juicio',
      tribunalVoting:'SR. JUEZ · Votación',tribunalResult:'SR. JUEZ · Resultado',
      tribunalFinalResult:'SR. JUEZ · Resultado final',stopSetup:'STOP · JuNTa2',
      stopReveal:'STOP · JuNTa2',stopPlaying:'STOP · JuNTa2',stopReview:'Revisión STOP · JuNTa2',
      miniResults:'Resultado · JuNTa2',miniFinish:'Resultados finales · JuNTa2',
      whatWouldYouDoSetup:'WHAT WOULD YOU DO? · Configuración · JuNTa2',whatWouldYouDoPlaying:'WHAT WOULD YOU DO? · Votación · JuNTa2',whatWouldYouDoResult:'WHAT WOULD YOU DO? · Resultado · JuNTa2',
      whoamiLocalFinalReveal:'¿Quién era quién? · JuNTa2',ageLocalFinalReveal:'¿Quién era quién? · JuNTa2'
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
    const authOnly = ['access','authRegister','authLogin'];
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
    $('profileBtn')?.classList.toggle('visible', showTopActions || id === 'home');
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

  function resetHistory() {
    state.screenHistory.length = 0;
  }

  function goBack(fallback = 'home') {
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

  return { $, setText, show, goToScreenIfChanged, goBack, resetHistory, notice, clearNotice };
}
