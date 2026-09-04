import { characters } from '../data/whoami/characters.js';
import { categories } from '../data/whoami/categories.js';
import { ageData } from '../data/age/data.js';
import { confessionsData } from '../data/confessions/data.js';
import { stopLetters as STOP_DEFAULT_LETTERS, stopCategories as STOP_DEFAULT_CATEGORIES, stopDefaultCategories as STOP_DEFAULT_SELECTED_CATEGORIES } from '../data/stop/data.js';
import { chupisticaCategories as CULTURA_CHUPISTICA_CATEGORIES } from '../data/chupistica/data.js';
import { chamuyayaData } from '../data/chamuyaya/data.js';
import { tribunalData } from '../data/tribunal/data.js';
import { whatWouldYouDoCategories, whatWouldYouDoQuestions } from '../data/whatwouldyoudo/data.js';
import { state } from './state.js';
import { createNavigation } from './navigation.js?v=20260903rules1';
import { createCountdown } from './countdown.js';
import { createConnection } from './connection.js';
import { createWhoamiGame } from './games/whoami.js';
import { createAgeGame } from './games/age.js';
import { createConfessionsGame } from './games/confessions.js';
import { createStopGame } from './games/stop.js';
import { createChamuyayaGame } from './games/chamuyaya.js';
import { createTribunalGame } from './games/tribunal.js';
import { createWhatWouldYouDoGame } from './games/whatwouldyoudo.js';
import { createRulesController } from './rules.js';
import { createAuthController } from './auth.js';
import { createFriendsController } from './friends.js';
import { createRoomsController } from './rooms.js';
import { firebaseApp, db, auth, authPersistenceReady, FIREBASE_PLACEHOLDER, firebaseConfig } from './firebase.js';
import {
  screens, SESSION_KEY, SESSION_BACKUP_KEY, PREPARATION_DURATION_MS,
  LOCAL_PHONE_HANDOFF_DURATION_MS,
  CHARACTER_DISPLAY_DURATION_MS, STARTING_TRANSITION_DURATION_MS,
  ASSIGNMENT_RETRY_DELAY_MS, ASSIGNMENT_MAX_RETRIES, MINI_REVEAL_DURATION_MS,
  AGE_PREPARATION_DURATION_MS, AGE_REVEAL_DURATION_MS, STOP_PREP_DURATION_MS,
  CONFESSION_RESULTS_DURATION_MS, CONFESSION_SCOREBOARD_DURATION_MS,
  CHAMUYA_COUNTDOWN_DURATION_MS, CHAMUYA_DEFAULT_ROUNDS, TRIBUNAL_DEFAULT_ROUNDS,
  GAME_TYPES, ROOM_CODE_CHARS, ROOM_CODE_PATTERN, RECONNECT_GRACE_MS, RECONNECT_BACKOFF_MS,
  ROOM_HEARTBEAT_STALE_MS, ROOM_DIRECTORY_MAX_PLAYERS, TRIBUNAL_REVEAL_TIMEOUT_MS, MINI_GAME_LABELS
} from './config.js?v=20260903splash2';
const firebase = globalThis.firebase;
(() => {
  let agePresenceCheckTimer=null,whoamiVoteInFlight=false,anonymousPersistenceReady=null,rulesController=null;


  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cleanUiText = s => String(s ?? '').replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F]/gu,'').replace(/\s{2,}/g,' ').trim();
  const serverNow = () => Date.now() + (Number(state.serverTimeOffset)||0);
  const isHost = data => Boolean(data && data.hostId === state.playerId);

  function firebaseContext(path=''){
    const game=state.lastRoomData?.game||{};
    return {
      operation:'', code:'', message:'', path,
      roomCode:state.roomCode||'', playerId:state.playerId||'',
      authUid:backendUid()||'', accountUid:accountUid()||'',
      mode:state.mode||'', phase:game.phase||'', round:Number(game.currentRound||0),
      firebaseProject:firebaseConfig.projectId
    };
  }
  function logFirebaseError(operation,error,path='',extra={}){
    const context={...firebaseContext(path),...extra,operation,code:error?.code||'',message:error?.message||String(error||'')};
    console.error('[FIREBASE ERROR]',context,error);
    return context;
  }
  function withTimeout(promise,ms,code='operation-timeout'){
    let timer=null;
    const timeout=new Promise((_,reject)=>{timer=window.setTimeout(()=>reject(Object.assign(new Error('La operación tardó demasiado.'),{code})),ms);});
    return Promise.race([Promise.resolve(promise).finally(()=>{if(timer)window.clearTimeout(timer);}),timeout]);
  }

  function mapFirebaseOperationError(operation,error,path=''){
    const code=String(error?.code||'').toLowerCase();
    logFirebaseError(operation,error,path);
    if(code.includes('permission-denied')||code==='permission_denied'||code==='database/permission-denied')return 'Firebase rechazó la operación por las Security Rules. Revisa Realtime Database → Rules.';
    if(code.includes('network-request-failed')||code.includes('network'))return 'No se pudo conectar con Firebase. Comprueba Internet y que la Realtime Database esté disponible.';
    if(code.includes('unauthorized-domain'))return 'Este dominio de GitHub Pages no está autorizado en Firebase Authentication.';
    if(code.includes('admin-restricted-operation'))return 'Firebase tiene bloqueada la creación de cuentas. Ve a Authentication → Settings y habilita las acciones de usuario/creación de cuentas.';
    if(code.includes('operation-not-allowed'))return 'El proveedor de autenticación está desactivado. Ve a Authentication → Sign-in method y activa Email/Password; para invitado, activa Anonymous.';
    if(code.includes('room-transaction-timeout')||code.includes('operation-timeout'))return 'Firebase no respondió a tiempo al crear la sala. Revisa Realtime Database → Rules y que la base de datos V2 esté activa.';
    if(code.includes('invalid-api-key')||code.includes('api-key-not-valid'))return 'La configuración del Firebase nuevo no es válida. Revisa firebaseConfig.';
    return `Firebase devolvió un error en ${operation}: ${error?.message||error?.code||'error desconocido'}`;
  }
  function ensureFirebaseConfigured(){
    if(!firebaseApp||!db||!auth){
      notice('Firebase no pudo iniciarse. Revisa la configuración del proyecto ¿QuiénSoy? en firebaseConfig.','error');
      console.error('[FIREBASE CONFIG] Firebase no está disponible.',firebaseConfig);
      return false;
    }
    if(FIREBASE_PLACEHOLDER){
      notice('Falta completar la configuración web de Firebase. Pega la API key, appId y messagingSenderId del proyecto ¿QuiénSoy?.','error');
      console.error('[FIREBASE CONFIG] Faltan credenciales del proyecto nuevo. Copia la configuración de la app web desde Firebase Console.',firebaseConfig);
      return false;
    }
    return true;
  }


  
  function roomCode(){
    let value='';
    for(let i=0;i<5;i++) value+=ROOM_CODE_CHARS[Math.floor(Math.random()*ROOM_CODE_CHARS.length)];
    return value;
  }
  // ============================================================
  // RECUPERACIÓN DE SESIÓN
  // ============================================================
  const VOLUNTARY_EXIT_KEY='qs_voluntary_room_exit';
  function markVoluntaryRoomExit(){
    try{sessionStorage.setItem(VOLUNTARY_EXIT_KEY,'1');}catch(error){}
  }
  function hasVoluntaryRoomExit(){
    try{return sessionStorage.getItem(VOLUNTARY_EXIT_KEY)==='1';}catch(error){return false;}
  }
  function saveSessionInfo(roomId, playerName, playerId){
    const finalPlayerId=String(state.playerId||playerId||''),finalPlayerName=String(state.playerName||playerName||'');
    const session={roomId:String(roomId||state.roomCode||''),playerName:finalPlayerName,playerId:finalPlayerId,roomCode:String(roomId||state.roomCode||''),name:finalPlayerName,mode:state.mode||null,gameType:state.gameType||null,accountUid:accountUid()||null,authUid:backendUid()||null};
    if(!finalPlayerId)return;
    try{
      const serialized=JSON.stringify(session);
      sessionStorage.setItem('qs_roomId',session.roomId);sessionStorage.setItem('qs_playerName',session.playerName);sessionStorage.setItem('qs_playerId',session.playerId);sessionStorage.setItem(SESSION_KEY,serialized);
      sessionStorage.removeItem(VOLUNTARY_EXIT_KEY);
      if(!accountUid())sessionStorage.setItem('qs_guest_player_id',finalPlayerId);
      else localStorage.setItem(SESSION_BACKUP_KEY,serialized);
    }catch(error){console.warn('[SESSION] save failed',error);}
  }

  function readSession(){
    try{
      const active=sessionStorage.getItem(SESSION_KEY),aqRoomId=sessionStorage.getItem('qs_roomId'),aqPlayerName=sessionStorage.getItem('qs_playerName'),aqPlayerId=sessionStorage.getItem('qs_playerId');
      if(aqRoomId&&aqPlayerName&&aqPlayerId){let parsed={};try{parsed=active?JSON.parse(active):{};}catch(error){}return {...parsed,roomId:aqRoomId,playerName:aqPlayerName,playerId:aqPlayerId};}
      if(active)return JSON.parse(active);
      const backup=localStorage.getItem(SESSION_BACKUP_KEY);
      if(backup&&accountUid()){const parsed=JSON.parse(backup);if(parsed.accountUid===accountUid())return parsed;}
      return null;
    }catch(error){console.warn('read session',error);return null;}
  }

  function saveSession(){
    saveSessionInfo(state.roomCode,state.playerName,state.playerId);
  }

  function clearSession(){
    try{
      sessionStorage.removeItem('qs_roomId');
      sessionStorage.removeItem('qs_playerName');
      sessionStorage.removeItem('qs_playerId');
      sessionStorage.removeItem(SESSION_KEY);
    }catch(error){}
    try{localStorage.removeItem(SESSION_BACKUP_KEY);}catch(error){}
    const banner=$('sessionRecoveryBanner');if(banner)banner.classList.add('hidden');
  }

  function hasActiveCountdown(){
    return Boolean((state.countdownTimer&&state.countdownKey)||(state.miniCountdownTimer&&state.miniCountdownKey));
  }
  async function requestScreenWakeLock(){
    if(!('wakeLock' in navigator))return;
    if(document.visibilityState!=='visible')return;
    if(state.wakeLock && !state.wakeLock.released)return;
    try{
      state.wakeLock=await navigator.wakeLock.request('screen');
    }catch(error){
      console.warn('Wake Lock no disponible',error);
      state.wakeLock=null;
    }
  }
  async function releaseScreenWakeLock(){
    const lock=state.wakeLock;
    if(!lock)return;
    state.wakeLock=null;
    try{
      if(!lock.released)await lock.release();
    }catch(error){
      console.warn('No se pudo liberar Wake Lock',error);
    }finally{
      if(state.wakeLock===lock)state.wakeLock=null;
    }
  }
  function isAgeMobileExperience(){
    return Boolean(window.matchMedia?.('(max-width: 700px)').matches||window.matchMedia?.('(hover: none) and (pointer: coarse)').matches||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent||''));
  }
  async function requestLandscapeOrientationLock(){
    if(!isAgeMobileExperience())return;
    const orientation=screen.orientation;
    if(!orientation||typeof orientation.lock!=='function')return;
    try{await orientation.lock('landscape');}catch(error){console.info('[AGE] Orientación manual requerida en este navegador.');}
  }
  async function requestAgeOrientationLock(){await requestLandscapeOrientationLock();}
  function hasActiveWakeLockPhase(){
    return ['prep','reveal','agePreparation','ageReveal','confessionsWriting','confessionsVoting'].includes(state.currentScreen);
  }
  let countdownAudioContext=null;

  function getCountdownAudioContext(){
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)return null;
    if(!countdownAudioContext)countdownAudioContext=new AudioContextClass();
    return countdownAudioContext;
  }

  function preloadCountdownSound(){
    try{
      const context=getCountdownAudioContext();
      if(!context)return;
      const resume=context.state==='suspended'?context.resume():Promise.resolve();
      Promise.resolve(resume).then(()=>{state.soundUnlocked=true;}).catch(()=>{});
    }catch(error){console.warn('No se pudo precargar el sonido del temporizador',error);}
  }

  function playCountdownSound(){
    try{
      const context=getCountdownAudioContext();
      if(!context)return;
      const play=()=>{
        const now=context.currentTime,master=context.createGain();
        master.gain.setValueAtTime(0.0001,now);
        master.gain.exponentialRampToValueAtTime(0.22,now+0.015);
        master.gain.exponentialRampToValueAtTime(0.0001,now+0.8);
        master.connect(context.destination);
        [[880,0],[1174.66,0.12]].forEach(([frequency,delay])=>{
          const oscillator=context.createOscillator(),gain=context.createGain(),start=now+delay;
          oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,start);oscillator.frequency.exponentialRampToValueAtTime(frequency*0.72,start+0.7);
          gain.gain.setValueAtTime(0.0001,start);gain.gain.exponentialRampToValueAtTime(0.7,start+0.02);gain.gain.exponentialRampToValueAtTime(0.0001,start+0.72);
          oscillator.connect(gain);gain.connect(master);oscillator.start(start);oscillator.stop(start+0.75);
        });
        state.soundUnlocked=true;
      };
      if(context.state==='suspended')context.resume().then(play).catch(error=>console.warn('El navegador bloqueó el sonido',error));
      else play();
    }catch(error){console.warn('No se pudo reproducir el sonido',error);}
  }

  function feedbackAtZero(key){
    if(state.countdownFeedbackKey===key)return;
    state.countdownFeedbackKey=key;
    playCountdownSound();
    try{
      if('vibrate' in navigator)navigator.vibrate([200,100,200]);
    }catch(error){console.warn('Vibración no disponible',error);}
  }
  function haptic(pattern=[18]){
    try{if(typeof navigator.vibrate==='function')navigator.vibrate(pattern);}catch(error){}
  }
  function renderQuickFriendsPanel(){
    const list=$('quickFriendsList');if(!list)return;
    const ids=Object.keys(state.friendData||{});
    setText('quickFriendsCount',String(ids.length));setText('quickRequestsCount',String(Object.keys(state.requestData||{}).length));
    list.replaceChildren();
    if(!state.friendsLoaded){const loading=document.createElement('div');loading.className='quick-friends-empty';loading.textContent='Cargando amigos…';list.appendChild(loading);}
    else if(!ids.length){const empty=document.createElement('div');empty.className='quick-friends-empty';empty.textContent='Todavía no tienes amigos.';list.appendChild(empty);}
    ids.forEach(uid=>{
      const profile=state.friendProfiles[uid]||{},presence=state.friendPresence[uid]||{};
      const row=document.createElement('div');row.className='quick-friend-row';row.setAttribute('role','listitem');
      const avatar=document.createElement('div');avatar.className='quick-friend-avatar';avatar.textContent=String(profile.username||uid).replace(/^@/,'').slice(0,1).toUpperCase()||'?';
      const main=document.createElement('div');main.className='quick-friend-main';
      const name=document.createElement('div');name.className='quick-friend-name';name.textContent=visibleUsername(profile.username||uid);
      const stateLine=document.createElement('div');stateLine.className='quick-friend-state';const dot=document.createElement('span');dot.className='presence-dot '+(presence.online?'online':'offline');stateLine.append(dot,document.createTextNode(presence.online?'online':'offline'));main.append(name,stateLine);
      const actions=document.createElement('div');actions.className='row-actions';
      if(state.roomRef){const invite=document.createElement('button');invite.className='small-btn success';invite.type='button';invite.textContent='INVITAR';invite.disabled=normalizeRoomPlayers(state.lastRoomData||{}).some(player=>String(player.accountUid)===String(uid));invite.onclick=()=>{haptic([22]);void sendRoomInvite(uid);};actions.appendChild(invite);}
      const remove=document.createElement('button');remove.className='small-btn danger';remove.type='button';remove.textContent='ELIMINAR';remove.onclick=()=>{haptic([18]);void removeFriend(uid);};actions.appendChild(remove);
      row.append(avatar,main,actions);list.appendChild(row);
    });
    const req=$('quickRequestsList');if(req){req.replaceChildren();const requests=Object.values(state.requestData||{});if(!requests.length){const empty=document.createElement('div');empty.className='quick-friends-empty';empty.textContent='No tienes solicitudes pendientes.';req.appendChild(empty);}requests.forEach(request=>{const fromUid=String(request.fromUid||request.uid||'');const row=document.createElement('div');row.className='request-row';row.setAttribute('role','listitem');const name=document.createElement('div');name.className='request-name';name.textContent=visibleUsername(request.fromUsername||fromUid);const actions=document.createElement('div');actions.className='row-actions';const accept=document.createElement('button');accept.className='small-btn success';accept.type='button';accept.textContent='ACEPTAR';accept.onclick=()=>{haptic([25]);void acceptFriendRequest(fromUid);};const reject=document.createElement('button');reject.className='small-btn danger';reject.type='button';reject.textContent='RECHAZAR';reject.onclick=()=>{haptic([18]);void rejectFriendRequest(fromUid);};actions.append(accept,reject);row.append(name,actions);req.appendChild(row);});}
    renderInviteList('quickFriendsInviteList');
  }
  function openQuickFriends(){
    if(!accountUid()){haptic([18]);show('authLogin');return;}
    renderQuickFriendsPanel();const overlay=$('quickFriendsOverlay');if(!overlay)return;overlay.classList.add('show');overlay.setAttribute('aria-hidden','false');state.quickFriendsOpen=true;haptic([22]);try{$('quickFriendSearchInput')?.focus({preventScroll:true});}catch(error){}
  }
  function closeQuickFriends(){
    const overlay=$('quickFriendsOverlay');if(!overlay)return;overlay.classList.remove('show');overlay.setAttribute('aria-hidden','true');state.quickFriendsOpen=false;haptic([16]);
  }
  async function quickSearchFriend(){
    if(!accountUid()){show('authLogin');return;}
    const input=String($('quickFriendSearchInput')?.value||'').trim();state.searchTarget=null;
    const result=$('quickFriendSearchResult');if(result)result.replaceChildren();
    if(!input||input.replace(/^@+/,'').length<3){accountNotice('quickFriendsNotice','Escribe un nombre de usuario de al menos 3 caracteres.','error');return;}
    setButtonBusy('quickSearchFriendBtn','account',true,'BUSCANDO…');
    try{
      const target=await resolveUserByInput(input);
      if(!target||!target.uid){accountNotice('quickFriendsNotice','No se encontró ese usuario. Revisa que el nombre sea exactamente igual al de su cuenta.','error');return;}
      const uid=String(target.uid).trim(),me=String(accountUid()).trim();if(!uid||uid==='undefined'||uid==='null'){accountNotice('quickFriendsNotice','La cuenta encontrada no tiene un ID válido.','error');return;}
      if(uid===me){accountNotice('quickFriendsNotice','No puedes agregarte a ti mismo.','error');return;}
      if(state.friendData[uid]){accountNotice('quickFriendsNotice','Ese usuario ya es tu amigo.','error');return;}
      const [sent,received]=await Promise.all([db.ref(`friendRequests/sent/${me}/${uid}`).once('value'),db.ref(`friendRequests/received/${me}/${uid}`).once('value')]);
      if(sent.exists()||received.exists()){accountNotice('quickFriendsNotice','Ya existe una solicitud entre ambos.','error');return;}
      target.uid=uid;target.username=String(target.username||input.replace(/^@+/,'')).trim();state.searchTarget=target;
      const box=document.createElement('div');box.className='search-result';const text=document.createElement('strong');text.textContent=`¿Quieres agregar a ${visibleUsername(target.username)}?`;const actions=document.createElement('div');actions.className='row-actions';const send=document.createElement('button');send.className='small-btn success';send.type='button';send.textContent='ENVIAR SOLICITUD';send.onclick=()=>{haptic([24]);void sendQuickFriendRequest();};const cancel=document.createElement('button');cancel.className='small-btn';cancel.type='button';cancel.textContent='CANCELAR';cancel.onclick=clearQuickFriendSearch;actions.append(send,cancel);box.append(text,actions);result?.appendChild(box);
    }catch(error){console.error('quickSearchFriend',error);accountNotice('quickFriendsNotice',accountError(error),'error');}
    finally{setButtonBusy('quickSearchFriendBtn','account',false);}
  }
  function clearQuickFriendSearch(){state.searchTarget=null;const result=$('quickFriendSearchResult');if(result)result.replaceChildren();}
  async function sendQuickFriendRequest(){
    const target=state.searchTarget;if(!target||!accountUid())return;
    try{await sendFriendRequestTo(String(target.uid),String(target.username||'usuario'));accountNotice('quickFriendsNotice','Solicitud enviada correctamente.','success');haptic([35]);showSocialToast(`Solicitud enviada a ${visibleUsername(target.username)}`);clearQuickFriendSearch();renderQuickFriendsPanel();}
    catch(error){accountNotice('quickFriendsNotice',({ 'invalid-target':'El usuario seleccionado no es válido.','self-friend-request':'No puedes agregarte a ti mismo.','already-friends':'Ese usuario ya es tu amigo.','request-exists':'Ya existe una solicitud entre ambos.'})[error?.code]||'No se pudo enviar la solicitud.','error');haptic([14,50,14]);}
  }

  const ROOM_EXIT_SCREENS=new Set(['lobby','prep','reveal','starting','playing','scoring','results','agePreparation','ageReveal','agePlaying','confessionsWriting','confessionsVoting','confessionsResults','confessionsScoreboard','chamuyayaCountdown','chamuyayaReveal','chamuyayaDiscussion','chamuyayaVoting','chamuyayaResult','tribunalRoles','tribunalPresentation','tribunalDebate','tribunalSurprise','tribunalFinal','tribunalVoting','tribunalResult','tribunalFinalResult','stopReveal','stopPlaying','stopReview','miniResults','miniFinish','whatWouldYouDoPlaying','whatWouldYouDoResult']);
  function renderRoomExitControl(screenId){
    const shouldShow=ROOM_EXIT_SCREENS.has(screenId)&&Boolean(state.roomRef);
    screens.forEach(name=>{
      const screen=$(name),area=screen?.querySelector('.room-leave-area');
      if(area)area.remove();
    });
    if(!shouldShow)return;
    const screen=$(screenId),card=screen?.querySelector('.card');
    if(!card)return;
    const area=document.createElement('div');area.className='room-leave-area visible';
    const label=document.createElement('div');label.className='room-leave-label';label.textContent='Salir cierra tu contexto de partida y te devuelve a HOME.';
    const button=document.createElement('button');button.className='room-leave-btn';button.type='button';button.textContent='SALIR DE LA PARTIDA';
    button.setAttribute('aria-label','Salir de la partida y volver a HOME');
    button.addEventListener('click',()=>void requestLeaveRoom());
    area.append(label,button);card.appendChild(area);
  }
  async function requestLeaveRoom(){
    if(state.busy.leave)return;if(!state.roomRef){resetHistory();show('home',{history:false});return;}
    const confirmed=window.confirm('¿SALIR DE LA PARTIDA?\n\nSe limpiará tu contexto actual y volverás a HOME.');if(!confirmed)return;await leaveRoom(false);
  }
  function setBusy(key,value){state.busy[key]=value;}
  function setButtonBusy(id,key,busy,busyText){
    const button=$(id);if(!button)return;
    if(busy){
      if(!button.dataset.defaultText)button.dataset.defaultText=button.textContent;
      button.disabled=true;button.setAttribute('aria-busy','true');button.textContent=busyText||'CARGANDO…';
    }else{
      button.removeAttribute('aria-busy');
      if(button.dataset.defaultText)button.textContent=button.dataset.defaultText;
      if(key!=='start' || state.roomRef)button.disabled=false;
    }
  }
  function setConnectionStatus(status,text){
    const pill=$('connectionStatus'),label=$('connectionText');if(!pill||!label)return;
    pill.classList.remove('online','offline','reconnecting');
    if(status==='online')pill.classList.add('online');
    if(status==='offline')pill.classList.add('offline');
    if(status==='reconnecting')pill.classList.add('reconnecting');
    label.textContent=text;
  }

  // ============================================================
  // CUENTAS, AMIGOS, PRESENCIA E INVITACIONES
  // ============================================================
  const USERNAME_PATTERN=/^[A-Za-z0-9][A-Za-z0-9._-]{1,18}[A-Za-z0-9]$/;
  function normalizeUsername(value){return String(value??'').trim().replace(/^@+/,'').toLocaleLowerCase('es');}
  function visibleUsername(value){const clean=String(value||'').trim().replace(/^@+/,'');return clean?'@'+clean:'@usuario';}
  function accountUid(){return state.authUser&&!state.authUser.isAnonymous?state.authUser.uid:'';}
  function backendUid(){return auth.currentUser?.uid||'';}
  function roomIdentity(){
    const uid=backendUid();
    if(uid){state.playerId=String(uid);return state.playerId;}
    let tabId='';
    try{tabId=sessionStorage.getItem('qs_guest_player_id')||'';}catch(error){console.warn('[SESSION] guest id read failed',error);}
    if(!tabId){tabId=`p_tab_${crypto?.randomUUID?.()||(`${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`)}`;try{sessionStorage.setItem('qs_guest_player_id',tabId);}catch(error){console.warn('[SESSION] guest id write failed',error);}}
    state.playerId=tabId;return tabId;
  }
  async function ensureRoomAuth(){
    const current=auth.currentUser;
    if(current&&!current.isAnonymous)return current;
    if(current?.isAnonymous){
      const marker=sessionStorage.getItem('qs_guest_auth_uid'),session=readSession();
      if(marker===current.uid||session?.authUid===current.uid||state.roomRef)return current;
      try{await auth.signOut();}catch(error){console.warn('No se pudo aislar una identidad anónima anterior',error);}
      sessionStorage.removeItem('qs_guest_auth_uid');
    }
    if(state.anonymousSignInStarted)throw new Error('La autenticación todavía no está disponible.');
    state.anonymousSignInStarted=true;
    try{
      if(!anonymousPersistenceReady)anonymousPersistenceReady=auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).catch(error=>{console.warn('No se pudo activar persistencia de sesión anónima',error);});
      await anonymousPersistenceReady;
      const credentials=await auth.signInAnonymously();
      sessionStorage.setItem('qs_guest_auth_uid',credentials.user.uid);
      return credentials.user;
    }finally{state.anonymousSignInStarted=false;}
  }
  async function markRoomMembership(){
    const uid=backendUid(),path=state.roomCode?`roomMembers/${state.roomCode}/${uid}`:'';
    if(!uid||!state.roomCode||!state.playerId)return false;
    try{
      if(String(state.playerId)!==String(uid))throw Object.assign(new Error('La identidad de la sala no coincide con Firebase Auth.'),{code:'identity-mismatch'});
      await withTimeout(db.ref(path).set(String(state.playerId)),7000,'room-membership-timeout');
      console.log('[MEMBERSHIP] OK',{path,playerId:state.playerId});
      return true;
    }catch(error){
      console.warn('[MEMBERSHIP] No crítico; la sala puede continuar sin este índice.',{code:error?.code,message:error?.message,path,error});
      return false;
    }
  }
  function accountUsername(){return state.profile?.username||state.authUser?.displayName||state.authUser?.email?.split('@')[0]||'usuario';}
  function accountNotice(id,message,type=''){const el=$(id);if(!el)return;el.textContent=message||'';el.className='room-notice'+(message?' show ':'')+(type?' '+type:'');}

  let socialToastTimer=null;
  function showSocialToast(message){
    const toast=$('socialToast');if(!toast)return;
    toast.textContent=message||'';toast.classList.add('show');
    clearTimeout(socialToastTimer);socialToastTimer=setTimeout(()=>toast.classList.remove('show'),4200);
  }
  function openLockedMinigame(name){const modal=$('lockedMinigameModal');if(!modal)return;setText('lockedMinigameText',`${name} · Este minijuego todavía no está disponible.`);modal.classList.add('show');modal.setAttribute('aria-hidden','false');$('lockedMinigameCloseBtn')?.focus();}
  function closeLockedMinigame(){const modal=$('lockedMinigameModal');if(!modal)return;modal.classList.remove('show');modal.setAttribute('aria-hidden','true');}
  function getPendingRequestCount(){return Object.keys(state.requestData||{}).length;}
  function notifyFriendRequest(request){
    const from=visibleUsername(request?.fromUsername||request?.fromUid||'usuario');
    showSocialToast(`Nueva solicitud de amistad de ${from}`);
    playCountdownSound();
    try{if('vibrate' in navigator)navigator.vibrate([120,70,120]);}catch(error){console.warn('Vibración no disponible',error);}
    try{
      if(document.visibilityState==='hidden' && 'Notification' in window && Notification.permission==='granted'){
        new Notification('¿Quién soy? — Nueva solicitud', {body:`${from} quiere agregarte como amigo.`});
      }
    }catch(error){console.warn('Notificación del navegador no disponible',error);}
  }
  function requestNotificationPermission(){
    try{
      if('Notification' in window && Notification.permission==='default')return Notification.requestPermission();
    }catch(error){console.warn('No se pudo solicitar permiso de notificaciones',error);}
    return Promise.resolve('denied');
  }
  function setRequestBadge(count){
    ['profileRequestsBtn','friendsRequestsBtn'].forEach(id=>{
      const btn=$(id);if(!btn)return;
      btn.querySelector('.request-badge')?.remove();
      if(count>0){const badge=document.createElement('span');badge.className='request-badge';badge.textContent=count>99?'99+':String(count);btn.appendChild(badge);}
    });
    const quickBadge=$('quickFriendsBadge');
    if(quickBadge){quickBadge.textContent=count>99?'99+':String(count);quickBadge.classList.toggle('hidden',count<1);}
    setText('quickRequestsCount',String(count));
  }
  function setInviteBadge(count){
    ['profileBtn','quickFriendsBtn'].forEach(id=>{
      const button=$(id);if(!button)return;
      button.querySelector('.invite-badge')?.remove();
      if(count>0){const badge=document.createElement('span');badge.className='request-badge invite-badge';badge.textContent=count>99?'99+':String(count);button.appendChild(badge);}
    });
  }
  function notifyRoomInvite(invite){
    const room=String(invite?.roomCode||'sala'),from=visibleUsername(invite?.fromUsername||invite?.hostUsername||invite?.fromUid||'un amigo'),game=MINI_GAME_LABELS[String(invite?.gameType||'')]||'un minijuego';
    showSocialToast(`${from} te invitó a ${game} · sala ${room}`);playCountdownSound();
    try{if('vibrate' in navigator)navigator.vibrate([100,60,100]);}catch(error){console.warn('Vibración no disponible',error);}
    try{if(document.visibilityState==='hidden'&&'Notification' in window&&Notification.permission==='granted')new Notification('JuNTa2 · Invitación a sala',{body:`${from} te invitó a ${game}. Código: ${room}`});}catch(error){console.warn('Notificación del navegador no disponible',error);}
  }
  function hideReconnectModal(){
    const modal=$('reconnectModal');if(modal)modal.classList.remove('show');
    state.reconnectModalOpen=false;
  }
  function showReconnectModal(reason='connection-lost'){
    if(!state.roomRef)return;
    const modal=$('reconnectModal');if(!modal)return;state.reconnectModalOpen=true;
    setText('reconnectModalTitle',reason==='manual-failed'?'NO SE PUDO RECONECTAR':'CONEXIÓN INESTABLE');setText('reconnectModalText',reason==='manual-failed'?'La partida sigue protegida. Pulsa RECONECTAR para volver a intentarlo o sal de la partida.':'Se perdió temporalmente la conexión. Intentando reconectar automáticamente…');
    const notice=$('reconnectNotice');if(notice){notice.textContent='';notice.className='room-notice';}
    modal.classList.add('show');
  }
  async function discardReconnect(){
    if(state.busy.leave)return;
    hideReconnectModal();
    await leaveRoom(false);
  }
  async function manualReconnect(){
    if(state.busy.reconnect||!state.roomRef||!state.roomCode||!state.playerId||!state.playerName)return;
    // recoverRoomConnection owns the shared reconnect lock. No lo marcamos
    // antes de llamarla, porque eso haría que la propia recuperación se
    // rechazara como duplicada.
    setButtonBusy('manualReconnectBtn','reconnect',true,'RECONECTANDO…');
    hideReconnectModal();cancelReconnect();state.reconnectStartedAt=Date.now();state.roomConnectionPaused=true;setConnectionStatus('reconnecting','Reconectando…');
    try{db.goOnline();}catch(error){console.warn('db.goOnline',error);}
    const ok=await recoverRoomConnection('manual-click');
    if(ok){hideReconnectModal();setConnectionStatus('online','Conectado');}
    else{setConnectionStatus('reconnecting','Reconectando…');scheduleAutoReconnect('manual-click');}
    setButtonBusy('manualReconnectBtn','reconnect',false);
  }
  function accountError(error){
    const messages={
      'auth/email-already-in-use':'Ese correo ya está registrado.','auth/invalid-email':'El correo no es válido.','auth/weak-password':'La contraseña debe tener al menos 6 caracteres.','auth/invalid-credential':'Correo o contraseña incorrectos.','auth/user-not-found':'Correo o contraseña incorrectos.','auth/wrong-password':'Correo o contraseña incorrectos.','auth/too-many-requests':'Demasiados intentos. Espera un momento y vuelve a probar.','auth/unauthorized-domain':'Autoriza este dominio en Firebase Authentication.','auth/api-key-not-valid':'La configuración de Firebase no es válida para esta aplicación.','auth/admin-restricted-operation':'Firebase tiene desactivada la creación de cuentas para usuarios. Ve a Authentication → Settings y habilita las acciones de usuario/creación de cuentas.','auth/operation-not-allowed':'El método de acceso está desactivado en Firebase. Ve a Authentication → Sign-in method y activa Email/Password. Para Entrar como invitado, activa también Anonymous.','auth/network-request-failed':'Firebase no pudo conectarse. Revisa tu conexión o bloqueadores del navegador.','PERMISSION_DENIED':'Firebase rechazó la operación por las reglas de Realtime Database.','database/permission-denied':'Firebase rechazó la operación por las reglas de Realtime Database.','username-taken':'Ese nombre de usuario ya está ocupado.','invalid-target':'El usuario seleccionado no es válido.','request-exists':'Ya existe una solicitud entre ambos.'
    };
    return messages[error?.code]||`No se pudo completar la operación (${error?.code||'error desconocido'}). Revisa la consola del navegador si necesitas más detalles.`;
  }
  function setPresenceUi(online){
    state.presenceOnline=Boolean(online);
    const text=online?'online':'offline';
    const profilePresence=$('profilePresenceDot');if(profilePresence){profilePresence.classList.toggle('online',online);profilePresence.classList.toggle('offline',!online);}
    setText('profileStatusText',text);
    renderFriendsList();
  }
  function renderAccountUI(){
    const logged=Boolean(accountUid()),quickBtn=$('quickFriendsBtn');
    if(quickBtn)quickBtn.classList.toggle('visible',logged);
    const username=logged?accountUsername():'Invitado';
    document.body.classList.toggle('guest-mode',!logged);
    setText('gameHomeUsername',visibleUsername(username));
    setText('gameHomeAccountType',logged?'CUENTA':'INVITADO');
    const gamePresence=$('gameHomePresenceDot');if(gamePresence){gamePresence.classList.toggle('online',logged?state.presenceOnline:true);gamePresence.classList.toggle('offline',logged?!state.presenceOnline:false);}
    ['hostNameInput','joinName'].forEach(id=>{const field=$(id);if(field)field.readOnly=logged;});
    if(!logged){setPresenceUi(false);setRequestBadge(0);setInviteBadge(0);return;}
    const email=state.authUser?.email||'';
    setText('profileUsername',visibleUsername(username));setText('profileEmail',email);
    ['hostNameInput','joinName'].forEach(id=>{const field=$(id);if(field){field.readOnly=true;field.value=state.profile?.username||username;}});
    setText('profileFriendCount',Object.keys(state.friendData||{}).length);setText('profileRequestCount',Object.keys(state.requestData||{}).length);
    setPresenceUi(state.presenceOnline);renderFriendsList();renderRequestsList();renderInviteList('profileInviteList');renderQuickFriendsPanel();
  }
  function stopOwnPresence(){
    const presence=state.accountPresenceRef;if(!presence)return;
    presence.connectedRef.off('value',presence.handler);
    presence.ref.update({online:false,lastSeen:firebase.database.ServerValue.TIMESTAMP}).catch(()=>{});
    state.accountPresenceRef=null;state.presenceOnline=false;
  }
  function startOwnPresence(user){
    stopOwnPresence();
    const ref=db.ref('presence/'+user.uid),connectedRef=db.ref('.info/connected');
    const handler=async snapshot=>{
      const connected=snapshot.val()===true;setPresenceUi(connected);
      if(!connected)return;
      const profileName=state.profile?.username||user.displayName||'usuario';
      try{
        await ref.onDisconnect().set({online:false,lastSeen:firebase.database.ServerValue.TIMESTAMP,username:profileName});
        await ref.set({online:true,lastSeen:firebase.database.ServerValue.TIMESTAMP,username:profileName});
      }catch(error){console.warn('No se pudo actualizar la presencia de la cuenta',error);}
    };
    state.accountPresenceRef={ref,connectedRef,handler};connectedRef.on('value',handler);
  }
  function stopAccountListeners(){
    const uid=state.accountListenerUid||accountUid();
    if(state.profileListener&&uid)db.ref('users/'+uid).off('value',state.profileListener);
    if(state.friendListener&&uid)db.ref('friends/'+uid).off('value',state.friendListener);
    if(state.requestListener&&uid)db.ref('friendRequests/received/'+uid).off('value',state.requestListener);
    if(state.inviteListener&&uid)db.ref('roomInvites/'+uid).off('value',state.inviteListener);
    Object.values(state.friendProfileRefs||{}).forEach(item=>item.ref.off('value',item.handler));
    Object.values(state.friendPresenceRefs||{}).forEach(item=>item.ref.off('value',item.handler));
    state.profileListener=null;state.friendListener=null;state.requestListener=null;state.inviteListener=null;state.accountListenerUid='';state.friendProfileRefs={};state.friendPresenceRefs={};state.friendProfiles={};state.friendPresence={};state.friendData={};state.requestData={};state.inviteData={};state.profile=null;state.friendsLoaded=false;state.requestListenerInitialized=false;state.inviteListenerInitialized=false;state.lastRequestKeys=new Set();state.lastInviteKeys=new Set();setRequestBadge(0);setInviteBadge(0);stopOwnPresence();
  }
  function bindFriendDetails(){
    const ids=new Set(Object.keys(state.friendData||{}));
    Object.keys(state.friendProfileRefs||{}).forEach(uid=>{if(!ids.has(uid)){state.friendProfileRefs[uid].ref.off('value',state.friendProfileRefs[uid].handler);delete state.friendProfileRefs[uid];delete state.friendProfiles[uid];}});
    Object.keys(state.friendPresenceRefs||{}).forEach(uid=>{if(!ids.has(uid)){state.friendPresenceRefs[uid].ref.off('value',state.friendPresenceRefs[uid].handler);delete state.friendPresenceRefs[uid];delete state.friendPresence[uid];}});
    ids.forEach(uid=>{
      if(!state.friendProfileRefs[uid]){const ref=db.ref('publicUsers/'+uid),handler=snapshot=>{state.friendProfiles[uid]=snapshot.val()||{};renderFriendsList();renderLobbyFriends();};state.friendProfileRefs[uid]={ref,handler};ref.on('value',handler);}
      if(!state.friendPresenceRefs[uid]){const ref=db.ref('presence/'+uid),handler=snapshot=>{state.friendPresence[uid]=snapshot.val()||{};renderFriendsList();renderLobbyFriends();};state.friendPresenceRefs[uid]={ref,handler};ref.on('value',handler);}
    });
    renderFriendsList();renderLobbyFriends();
  }
  function emptyAccountList(id,message){const list=$(id);if(!list)return;list.replaceChildren();const item=document.createElement('div');item.className='empty-state';item.textContent=message;list.appendChild(item);}
  function renderFriendsList(){
    const list=$('friendsList');if(!list)return;list.replaceChildren();
    const ids=Object.keys(state.friendData||{});
    if(!ids.length){emptyAccountList('friendsList','Todavía no tienes amigos.');return;}
    ids.forEach(uid=>{
      const profile=state.friendProfiles[uid]||{},presence=state.friendPresence[uid]||{},row=document.createElement('div');row.className='account-friend-row';row.setAttribute('role','listitem');
      const info=document.createElement('div'),name=document.createElement('div'),status=document.createElement('div'),dot=document.createElement('span'),remove=document.createElement('button');
      name.className='account-friend-name';name.textContent=visibleUsername(profile.username||uid);status.className='account-friend-state';dot.className='presence-dot '+(presence.online?'online':'offline');status.append(dot,document.createTextNode(presence.online?'online':'offline'));info.append(name,status);
      remove.className='small-btn danger';remove.type='button';remove.textContent='ELIMINAR';remove.addEventListener('click',()=>void removeFriend(uid));row.append(info,remove);list.appendChild(row);
    });
  }
  function renderRequestsList(){
    const list=$('requestsList');if(!list)return;list.replaceChildren();
    const requests=Object.values(state.requestData||{});
    if(!requests.length){emptyAccountList('requestsList','No tienes solicitudes pendientes.');return;}
    requests.forEach(request=>{
      const fromUid=request.fromUid||request.uid,row=document.createElement('div');row.className='request-row';row.setAttribute('role','listitem');
      const name=document.createElement('div');name.className='request-name';name.textContent=visibleUsername(request.fromUsername||fromUid);
      const actions=document.createElement('div');actions.className='row-actions';
      const accept=document.createElement('button');accept.className='small-btn success';accept.type='button';accept.textContent='ACEPTAR';accept.addEventListener('click',()=>void acceptFriendRequest(fromUid));
      const reject=document.createElement('button');reject.className='small-btn danger';reject.type='button';reject.textContent='RECHAZAR';reject.addEventListener('click',()=>void rejectFriendRequest(fromUid));actions.append(accept,reject);row.append(name,actions);list.appendChild(row);
    });
  }
  function renderInviteList(id){
    const list=$(id);if(!list)return;list.replaceChildren();const invites=Object.values(state.inviteData||{}).filter(invite=>!invite?.status||invite.status==='pending');
    if(!invites.length){emptyAccountList(id,'No tienes invitaciones pendientes.');return;}
    invites.forEach(invite=>{
      const room=String(invite.roomCode||''),row=document.createElement('div');row.className='invite-row';
       const textNode=document.createElement('div'),roomNode=document.createElement('div'),from=document.createElement('div');roomNode.className='invite-room';roomNode.textContent=`${MINI_GAME_LABELS[String(invite.gameType||'')]||'Minijuego'} · sala ${room}`;from.className='muted tiny';from.textContent='Invita '+visibleUsername(invite.fromUsername||invite.hostUsername||invite.fromUid);textNode.append(roomNode,from);
      const actions=document.createElement('div');actions.className='row-actions';const enter=document.createElement('button');enter.className='small-btn success';enter.type='button';enter.textContent='ENTRAR';enter.addEventListener('click',()=>void acceptRoomInvite(room));const ignore=document.createElement('button');ignore.className='small-btn danger';ignore.type='button';ignore.textContent='IGNORAR';ignore.addEventListener('click',()=>void ignoreRoomInvite(room));actions.append(enter,ignore);row.append(textNode,actions);list.appendChild(row);
    });
  }
  function renderLobbyFriends(){
    const list=$('lobbyFriendsList');if(!list)return;list.replaceChildren();const ids=Object.keys(state.friendData||{});
    if(!ids.length){emptyAccountList('lobbyFriendsList','No tienes amigos para invitar.');return;}
    const players=state.roomRef?normalizeRoomPlayers(state.lastRoomData||{}):[];
    ids.forEach(uid=>{
      const profile=state.friendProfiles[uid]||{},presence=state.friendPresence[uid]||{},row=document.createElement('div');row.className='account-friend-row';
      const info=document.createElement('div'),name=document.createElement('div'),status=document.createElement('div'),dot=document.createElement('span'),invite=document.createElement('button');name.className='account-friend-name';name.textContent=visibleUsername(profile.username||uid);status.className='account-friend-state';dot.className='presence-dot '+(presence.online?'online':'offline');status.append(dot,document.createTextNode(presence.online?'online':'offline'));info.append(name,status);invite.className='small-btn success';invite.type='button';invite.textContent=players.some(player=>player.accountUid===uid)?'ENVIADO':'INVITAR';invite.disabled=players.some(player=>player.accountUid===uid);invite.addEventListener('click',()=>void sendRoomInvite(uid));row.append(info,invite);list.appendChild(row);
    });
  }
  async function ensureUserProfile(user){
    const ref=db.ref('users/'+user.uid),snapshot=await ref.once('value');
    if(snapshot.exists()){
      const profile=snapshot.val(),username=String(profile.username||'').trim(),key=normalizeUsername(username);
      if(USERNAME_PATTERN.test(username)&&key){
        const claim=await db.ref('usernames/'+key).transaction(current=>current===null||current===user.uid?user.uid:undefined);
        if(claim.committed)await db.ref('publicUsers/'+user.uid).update({username,usernameLower:key});
      }
      return profile;
    }
    let candidate=normalizeUsername(user.displayName||'');if(!USERNAME_PATTERN.test(candidate))candidate=('user'+user.uid.replace(/[^A-Za-z0-9]/g,'')).slice(0,20);if(!USERNAME_PATTERN.test(candidate))candidate='usuario'+user.uid.slice(0,8);
    for(let attempt=0;attempt<10;attempt++){
      const key=attempt?`${candidate.slice(0,18)}${attempt}`:candidate,claim=await db.ref('usernames/'+key).transaction(current=>current===null?user.uid:undefined);
      if(!claim.committed)continue;
      const profile={username:key,email:user.email||'',createdAt:firebase.database.ServerValue.TIMESTAMP,updatedAt:firebase.database.ServerValue.TIMESTAMP};
      await db.ref().update({['users/'+user.uid]:profile,['publicUsers/'+user.uid]:{username:key,usernameLower:key,createdAt:profile.createdAt}});await user.updateProfile({displayName:key});return profile;
    }
    throw {code:'username-taken'};
  }
  async function startAccountListeners(user){
    stopAccountListeners();
    const uid=user.uid;
    state.accountListenerUid=uid;
    state.profileListener=snapshot=>{state.profile=snapshot.val()||null;renderAccountUI();};db.ref('users/'+uid).on('value',state.profileListener);
    state.friendListener=snapshot=>{state.friendsLoaded=true;state.friendData=snapshot.val()||{};bindFriendDetails();renderAccountUI();};db.ref('friends/'+uid).on('value',state.friendListener);
    state.requestListener=snapshot=>{
      const next=snapshot.val()||{};
      const previousKeys=new Set(Object.keys(state.requestData||{}));
      state.requestData=next;
      const currentKeys=new Set(Object.keys(next));
      setRequestBadge(currentKeys.size);
      if(state.requestListenerInitialized){
        for(const key of currentKeys){
          if(!previousKeys.has(key)){notifyFriendRequest(next[key]);break;}
        }
      }else{
        state.requestListenerInitialized=true;
      }
      renderRequestsList();renderAccountUI();
    };
    db.ref('friendRequests/received/'+uid).on('value',state.requestListener);
    state.inviteListener=snapshot=>{const next=snapshot.val()||{},previousKeys=new Set(Object.keys(state.inviteData||{})),currentKeys=new Set(Object.keys(next));state.inviteData=next;setInviteBadge([...currentKeys].filter(key=>!next[key]?.status||next[key].status==='pending').length);if(state.inviteListenerInitialized){for(const key of currentKeys){if(!previousKeys.has(key)&&(!next[key]?.status||next[key].status==='pending')){notifyRoomInvite(next[key]);break;}}}else state.inviteListenerInitialized=true;renderInviteList('profileInviteList');renderInviteList('friendsInviteList');renderInviteList('quickFriendsInviteList');};db.ref('roomInvites/'+uid).on('value',state.inviteListener);
    startOwnPresence(user);renderFriendsList();renderRequestsList();renderInviteList('profileInviteList');
  }
  async function homeRoute(action){
    haptic([18]);
    if(accountUid()){
      if(action==='play')show('minigames');else if(action==='profile')$('profileBtn')?.click();else openGeneralJoin();
      return;
    }
    const entered=await enterGuest();
    if(!entered)return;
    if(action==='play')show('minigames');else if(action==='profile')$('profileBtn')?.click();else openGeneralJoin();
  }
  async function registerAccount(){
    if(!auth||!db){accountNotice('registerNotice','Firebase no está configurado todavía. Completa firebaseConfig para crear la cuenta.','error');return;}
    const username=String($('registerUsername').value||'').trim().replace(/^@+/,'');const key=normalizeUsername(username),email=String($('registerEmail').value||'').trim(),password=$('registerPassword').value||'',confirm=$('registerPasswordConfirm').value||'';
    if(!USERNAME_PATTERN.test(username)||username.length<3||username.length>20){accountNotice('registerNotice','El nombre debe tener entre 3 y 20 caracteres y terminar en letra o número.','error');return;}
    if(!email){accountNotice('registerNotice','Escribe tu correo electrónico.','error');return;}if(password.length<6){accountNotice('registerNotice','La contraseña debe tener al menos 6 caracteres.','error');return;}if(password!==confirm){accountNotice('registerNotice','Las contraseñas no coinciden.','error');return;}
    setButtonBusy('createAccountBtn','account',true,'CREANDO CUENTA…');state.registeringAccount=true;let createdUser=null,claimed=false;
    try{await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);const credentials=await auth.createUserWithEmailAndPassword(email,password);createdUser=credentials.user;const claim=await db.ref('usernames/'+key).transaction(current=>current===null?createdUser.uid:undefined);if(!claim.committed)throw {code:'username-taken'};claimed=true;
      const profile={username,email:createdUser.email||email,createdAt:firebase.database.ServerValue.TIMESTAMP,updatedAt:firebase.database.ServerValue.TIMESTAMP};await db.ref().update({['users/'+createdUser.uid]:profile,['publicUsers/'+createdUser.uid]:{username,usernameLower:key,createdAt:profile.createdAt}});await createdUser.updateProfile({displayName:username});state.profile=profile;await startAccountListeners(createdUser);state.guestMode=false;sessionStorage.removeItem('qs_guest_auth_uid');resetHistory();show('home',{history:false});
    }catch(error){console.error('Firebase register account',error);if(claimed)await db.ref('usernames/'+key).remove().catch(()=>{});if(createdUser)await createdUser.delete().catch(()=>{});accountNotice('registerNotice',accountError(error),'error');}finally{state.registeringAccount=false;setButtonBusy('createAccountBtn','account',false);}
  }
  async function loginAccount(){
    if(!auth||!db){accountNotice('loginNotice','Firebase no está configurado todavía. Completa firebaseConfig para iniciar sesión.','error');return;}
    const email=String($('loginEmail').value||'').trim(),password=$('loginPassword').value||'';if(!email||!password){accountNotice('loginNotice','Escribe tu correo y contraseña.','error');return;}setButtonBusy('signInBtn','account',true,'INICIANDO…');
    try{await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);const credentials=await auth.signInWithEmailAndPassword(email,password);state.authUser=credentials.user;state.guestMode=false;sessionStorage.removeItem('qs_guest_auth_uid');renderAccountUI();resetHistory();show('home',{history:false});}catch(error){accountNotice('loginNotice',accountError(error),'error');}finally{setButtonBusy('signInBtn','account',false);}
  }
  async function enterGuest(){
    if(!auth){accountNotice('accessNotice','Firebase no está configurado todavía. Completa firebaseConfig para entrar.','error');return false;}
    setButtonBusy('guestBtn','account',true,'ENTRANDO…');
    try{
      await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
      const existing=auth.currentUser;const session=readSession();
      if(existing&&!existing.isAnonymous){state.guestMode=false;state.authUser=existing;renderAccountUI();resetHistory();show('home',{history:false});return true;}
      if(existing?.isAnonymous&&session?.authUid!==existing.uid&&!state.roomRef){await auth.signOut();sessionStorage.removeItem('qs_guest_auth_uid');}
      const current=auth.currentUser;const credentials=current?.isAnonymous?{user:current}:await auth.signInAnonymously();
      sessionStorage.setItem('qs_guest_auth_uid',credentials.user.uid);state.authUser=credentials.user;state.guestMode=true;renderAccountUI();resetHistory();show('home',{history:false});haptic([28]);return true;
    }catch(error){accountNotice('accessNotice',accountError(error),'error');return false;}finally{setButtonBusy('guestBtn','account',false);}
  }
  
  async function logoutAccount(){
    setButtonBusy('signOutBtn','account',true,'CERRANDO…');
    try{
      if(state.roomRef)await leaveRoom(false);
      stopAccountListeners();
      await auth.signOut();state.guestMode=false;sessionStorage.removeItem('qs_guest_auth_uid');closeQuickFriends();resetHistory();show('access',{history:false});
    }
    catch(error){accountNotice('profileNotice','No se pudo cerrar la sesión.','error');}
    finally{setButtonBusy('signOutBtn','account',false);}
  }
  async function resolveUserByInput(input){
    if(!db)return null;
    const raw=String(input??'').trim().replace(/^@+/,'');
    const key=normalizeUsername(raw);
    if(!raw||!key)return null;

    // Camino principal: el índice privado usernames/{usernameLower} devuelve el UID.
    // No intentamos leer users/{uid}: ese nodo es privado y hacerlo para otra cuenta
    // provoca PERMISSION_DENIED cuando el perfil público histórico todavía no existe.
    try{
      const uidSnapshot=await db.ref('usernames/'+key).once('value');
      if(uidSnapshot.exists()){
        const uid=String(uidSnapshot.val()??'').trim();
        if(uid && uid!==accountUid()) return {uid,username:raw,usernameLower:key};
      }
    }catch(error){console.warn('Búsqueda por índice de nombre',error);}

    // Compatibilidad con cuentas antiguas: intenta el índice público por usernameLower.
    try{
      const snapshot=await db.ref('publicUsers').orderByChild('usernameLower').equalTo(key).limitToFirst(5).once('value');
      const entries=Object.entries(snapshot.val()||{});
      if(entries.length){
        const [uid,data]=entries.find(([candidateUid,value])=>String(value?.usernameLower||'').toLowerCase()===key)||entries[0];
        if(uid) return {uid:String(uid),...(data||{}),username:data?.username||raw,usernameLower:data?.usernameLower||key};
      }
    }catch(error){console.warn('Búsqueda pública de usuario',error);}

    // Permite pegar un UID directamente para facilitar soporte/reparación de cuentas antiguas.
    if(raw.length>=20){
      try{
        const publicSnapshot=await db.ref('publicUsers/'+raw).once('value');
        if(publicSnapshot.exists())return {uid:raw,...(publicSnapshot.val()||{})};
      }catch(error){console.warn('Búsqueda directa por UID',error);}
    }
    return null;
  }
  async function searchFriend(){
    if(!accountUid()){show('authLogin');return;}
    const input=String($('friendSearchInput').value??'').trim();state.searchTarget=null;
    if(!input||input.replace(/^@+/,'').length<3){accountNotice('friendsNotice','Escribe un nombre de usuario de al menos 3 caracteres.','error');return;}
    setButtonBusy('searchFriendBtn','account',true,'BUSCANDO…');
    try{
      const target=await resolveUserByInput(input);
      if(!target||!target.uid){accountNotice('friendsNotice','No se encontró ese usuario. Revisa que el nombre sea exactamente igual al de su cuenta.','error');return;}
      const uid=String(target.uid),me=String(accountUid());
      if(!uid||uid==='undefined'||uid==='null'){accountNotice('friendsNotice','La cuenta encontrada no tiene un ID válido.','error');return;}
      if(uid===me){accountNotice('friendsNotice','No puedes agregarte a ti mismo.','error');return;}
      if(state.friendData[uid]){accountNotice('friendsNotice','Ese usuario ya es tu amigo.','error');return;}
      const [sent,reverseReceived,ownReceived]=await Promise.all([
        db.ref(`friendRequests/sent/${me}/${uid}`).once('value'),
        db.ref(`friendRequests/sent/${uid}/${me}`).once('value'),
        db.ref(`friendRequests/received/${me}/${uid}`).once('value')
      ]);
      if(sent.exists()||reverseReceived.exists()||ownReceived.exists()){
        accountNotice('friendsNotice','Ya existe una solicitud entre ambos. Revisa SOLICITUDES por si la otra persona te agregó primero.','error');return;
      }
      target.uid=uid;target.username=String(target.username||target.displayName||input.replace(/^@+/,''));
      state.searchTarget=target;
      const result=$('friendSearchResult');result.replaceChildren();
      const box=document.createElement('div');box.className='search-result';
      const textNode=document.createElement('strong');textNode.textContent=`¿Quieres enviar una solicitud de amistad a ${visibleUsername(target.username)}?`;
      const actions=document.createElement('div');actions.className='row-actions';
      const send=document.createElement('button');send.className='small-btn success';send.type='button';send.textContent='ENVIAR SOLICITUD';send.addEventListener('click',()=>void sendFriendRequest());
      const cancel=document.createElement('button');cancel.className='small-btn';cancel.type='button';cancel.textContent='CANCELAR';cancel.addEventListener('click',clearFriendSearch);
      actions.append(send,cancel);box.append(textNode,actions);result.appendChild(box);
    }catch(error){console.error('searchFriend',error);accountNotice('friendsNotice',accountError(error),'error');}
    finally{setButtonBusy('searchFriendBtn','account',false);}
  }
  function clearFriendSearch(){state.searchTarget=null;const result=$('friendSearchResult');if(result)result.replaceChildren();}
  async function sendFriendRequestTo(targetUid,targetUsername){
    const uid=String(accountUid()||'').trim(),target=String(targetUid??'').trim();
    if(!uid||!target||target==='undefined'||target==='null')throw {code:'invalid-target'};
    if(uid===target)throw {code:'self-friend-request'};
    const username=String(targetUsername||'').trim().replace(/^@+/,'').slice(0,20)||'usuario';
    if(!USERNAME_PATTERN.test(username))throw {code:'invalid-target'};
    if(state.friendData[target])throw {code:'already-friends'};
    const [sent,received]=await Promise.all([
      db.ref(`friendRequests/sent/${uid}/${target}`).once('value'),
      db.ref(`friendRequests/received/${uid}/${target}`).once('value')
    ]);
    if(sent.exists()||received.exists())throw {code:'request-exists'};
    const payload={fromUid:uid,fromUsername:accountUsername(),toUid:target,toUsername:username,createdAt:firebase.database.ServerValue.TIMESTAMP};
    const updates={
      [`friendRequests/received/${target}/${uid}`]:payload,
      [`friendRequests/sent/${uid}/${target}`]:payload
    };
    await db.ref().update(updates);
    return payload;
  }
  function rootFriendshipKnown(uid,target){
    return Boolean(state.friendData?.[String(target)]);
  }
  async function sendFriendRequest(){
    const target=state.searchTarget;if(!target||!accountUid())return;
    try{
      await sendFriendRequestTo(target.uid,target.username);
      accountNotice('friendsNotice','Solicitud enviada correctamente.','success');
      await requestNotificationPermission();
      clearFriendSearch();showSocialToast(`Solicitud enviada a ${visibleUsername(target.username)}`);
    }catch(error){
      const messages={'invalid-target':'El usuario seleccionado no es válido.','self-friend-request':'No puedes agregarte a ti mismo.','already-friends':'Ese usuario ya es tu amigo.','request-exists':'Ya existe una solicitud entre ambos.'};
      accountNotice('friendsNotice',messages[error?.code]||'No se pudo enviar la solicitud. Revisa tu conexión y las reglas de Firebase.','error');
    }
  }
  async function addFriendFromGame(targetUid,targetUsername,button){
    if(!accountUid()||!targetUid)return;
    if(state.friendData[String(targetUid)]){button.textContent='AMIGOS';button.disabled=true;return;}
    button.disabled=true;button.textContent='ENVIANDO…';
    try{
      await sendFriendRequestTo(String(targetUid),String(targetUsername||'usuario'));
      button.textContent='SOLICITUD ENVIADA';
      await requestNotificationPermission();
      showSocialToast(`Solicitud enviada a ${visibleUsername(targetUsername)}`);
    }catch(error){
      if(error?.code==='request-exists'){button.textContent='PENDIENTE';}
      else if(error?.code==='already-friends'){button.textContent='AMIGOS';}
      else{button.disabled=false;button.textContent='AGREGAR AMIGO';showSocialToast(accountError(error));}
    }
  }
  async function acceptFriendRequest(fromUid){
    const uid=String(accountUid()||'').trim(),from=String(fromUid||'').trim();
    if(!uid||!from||uid===from)return;
    try{
      const requestSnap=await db.ref(`friendRequests/received/${uid}/${from}`).once('value');
      const request=requestSnap.val();
      if(!request||String(request.fromUid)!==from||String(request.toUid)!==uid){accountNotice('requestsNotice','La solicitud ya no está disponible.','error');return;}
      if(state.friendData[from]){
        const cleanup={};cleanup[`friendRequests/received/${uid}/${from}`]=null;cleanup[`friendRequests/sent/${from}/${uid}`]=null;await db.ref().update(cleanup);accountNotice('requestsNotice','Ya eran amigos.','success');renderQuickFriendsPanel();return;
      }
      const updates={};
      updates[`friends/${uid}/${from}`]=true;
      updates[`friends/${from}/${uid}`]=true;
      updates[`friendRequests/received/${uid}/${from}`]=null;
      updates[`friendRequests/sent/${from}/${uid}`]=null;
      await db.ref().update(updates);
      accountNotice('requestsNotice','Ahora son amigos.','success');showSocialToast('¡Solicitud aceptada! Ahora son amigos.');haptic([35]);renderQuickFriendsPanel();
    }catch(error){console.error('acceptFriendRequest',error);accountNotice('requestsNotice',accountError(error),'error');}
  }
  async function rejectFriendRequest(fromUid){
    const uid=String(accountUid()||'').trim(),from=String(fromUid||'').trim();
    if(!uid||!from||uid===from)return;
    const updates={};updates[`friendRequests/received/${uid}/${from}`]=null;updates[`friendRequests/sent/${from}/${uid}`]=null;
    try{await db.ref().update(updates);accountNotice('requestsNotice','Solicitud rechazada.','success');showSocialToast('Solicitud rechazada.');haptic([18]);renderQuickFriendsPanel();}
    catch(error){console.error('rejectFriendRequest',error);accountNotice('requestsNotice',accountError(error),'error');}
  }
  async function removeFriend(friendUid){
    const uid=accountUid();if(!uid||!friendUid)return;const updates={};updates[`friends/${uid}/${friendUid}`]=null;updates[`friends/${friendUid}/${uid}`]=null;
    try{await db.ref().update(updates);accountNotice('friendsNotice','Amigo eliminado.','success');}catch(error){accountNotice('friendsNotice','No se pudo eliminar al amigo.','error');}
  }
  async function sendRoomInvite(friendUid){
    const uid=accountUid(),recipient=String(friendUid||'').trim(),gameType=miniRoomType(state.lastRoomData||{}),route=routeRoomByGameType(gameType);
    if(!uid||!state.roomCode||!state.friendData[recipient]){showSocialToast('Solo puedes invitar a amigos con cuenta.');return;}
    if(!route){showSocialToast('No se puede invitar desde una sala sin juego válido.');return;}
    const roomPlayers=normalizeRoomPlayers(state.lastRoomData||{});if(roomPlayers.some(player=>String(player.accountUid||'')===recipient||String(player.authUid||'')===recipient)){showSocialToast('Ese amigo ya está en la sala.');renderLobbyFriends();return;}
    const payload={inviteId:state.roomCode,roomCode:state.roomCode,gameType,hostUid:uid,fromUid:uid,recipientUid:recipient,toUid:recipient,hostUsername:accountUsername(),fromUsername:accountUsername(),createdAt:firebase.database.ServerValue.TIMESTAMP,status:'pending'};
    try{await db.ref(`roomInvites/${recipient}/${state.roomCode}`).set(payload);accountNotice('lobbyNotice','Invitación enviada.','success');showSocialToast('Invitación enviada');haptic([24]);renderLobbyFriends();}catch(error){accountNotice('lobbyNotice',accountError(error),'error');}
  }
  async function ignoreRoomInvite(roomCode){if(!accountUid())return;try{await db.ref(`roomInvites/${accountUid()}/${roomCode}`).remove();}catch(error){accountNotice('profileNotice','No se pudo quitar la invitación.','error');}}
  async function acceptRoomInvite(roomCode){
    const invite=state.inviteData?.[roomCode];if(!invite)return;
    const recipient=accountUid();if(!recipient||String(invite.recipientUid||invite.toUid||recipient)!==String(recipient)){showSocialToast('Esta invitación no pertenece a la cuenta activa.');return;}
    try{
      const directory=await readRoomDirectory(roomCode);if(!directory){await ignoreRoomInvite(roomCode);showSocialToast('La sala ya no existe.');return;}
      const invitedType=String(directory.gameType||'').trim().toLowerCase(),route=routeRoomByGameType(invitedType),declaredType=String(invite.gameType||'').trim().toLowerCase();
      if(!route||invitedType===GAME_TYPES.CHUPISTICA||(!declaredType?false:declaredType!==invitedType)){await ignoreRoomInvite(roomCode);showSocialToast('La invitación ya no corresponde a esa sala.');return;}
      state.gameType=invitedType;setText('joinGameTypeLabel',invitedType===GAME_TYPES.WHOAMI?'JUGADOR':`${MINI_GAME_LABELS[invitedType]||'JUGADOR'} · JUGADOR`);$('joinRoomCode').value=roomCode;$('joinName').value=state.profile?.username||accountUsername();state.pendingInviteRoom=roomCode;show('join');await joinRoom();
      const joined=Boolean(state.roomCode===roomCode&&normalizeRoomPlayers(state.lastRoomData||{}).some(player=>String(player.accountUid||'')===String(recipient)));
      if(joined){await db.ref(`roomInvites/${recipient}/${roomCode}`).remove().catch(()=>{});showSocialToast('Invitación aceptada');}
    }catch(error){console.error('[ROOM INVITE ACCEPT]',error);showSocialToast('No se pudo validar la invitación.');}
  }
  function setTotalRounds(value){
    state.totalRounds=Math.min(20,Math.max(1,Number(value)||3));
    setText('roundsValue',state.totalRounds);
    void refreshSetupStockValidation();
  }
  function setCategorySelection(categories){
    const selected=new Set(categories||[]);
    document.querySelectorAll('#categoryBox .chip').forEach(chip=>{const selectedNow=selected.has(chip.dataset.category);chip.classList.toggle('selected',selectedNow);chip.setAttribute('aria-pressed',String(selectedNow));});
    updateSelectedCategories();
  }
  function renderCategories(){
    const cats=[...categories].sort((a,b)=>a.localeCompare(b,'es'));
    $('categoryBox').innerHTML='';
    cats.forEach(category=>{
      const button=document.createElement('button');button.type='button';button.className='chip';button.dataset.category=category;button.textContent=cleanUiText(category);button.setAttribute('aria-pressed','false');
      button.onclick=()=>{button.classList.toggle('selected');updateSelectedCategories();};
      $('categoryBox').appendChild(button);
    });
    setCategorySelection(state.categories);
  }
  function updateSelectedCategories(){
    state.categories=[...document.querySelectorAll('#categoryBox .chip.selected')].map(x=>x.dataset.category);
    const chips=[...document.querySelectorAll('#categoryBox .chip')];
    chips.forEach(chip=>chip.setAttribute('aria-pressed',String(chip.classList.contains('selected'))));
    $('toggleCategoriesBtn').textContent=chips.length&&state.categories.length===chips.length?'Quitar selección':'Seleccionar todas';
    void refreshSetupStockValidation();
  }
  function shuffle(items){
    const result=[...items];
    for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
    return result;
  }
  function normalizeRoomPlayers(data){
    return Object.entries(data?.players||{}).map(([id,player])=>({id,...player})).sort((a,b)=>(Number(a.joinedAt)||0)-(Number(b.joinedAt)||0));
  }
  function isPlayerOnline(player){const lastSeen=Number(player?.lastSeen)||0;return Boolean(player&&player.status==='online'&&player.connected===true&&(!lastSeen||serverNow()-lastSeen<=ROOM_HEARTBEAT_STALE_MS));}
  function onlineRoomPlayers(data){return normalizeRoomPlayers(data).filter(isPlayerOnline);}
  function isTemporarilyReconnectable(player, now=serverNow()){
    if(!player)return false;
    if(isPlayerOnline(player))return true;
    if(player.leftAt)return false;
    const lastSeen=Number(player.lastSeen)||0;
    return lastSeen>0 && (now-lastSeen)<=RECONNECT_GRACE_MS;
  }
  function activeGamePlayers(data, options={}){
    const now=Number(options.now)||serverNow();
    const ids=Object.keys(data?.game?.activePlayers||{}).filter(id=>data.game.activePlayers[id]===true);
    const source=ids.length
      ? ids.map(id=>data.players?.[id]?{id,...data.players[id]}:null).filter(Boolean)
      : onlineRoomPlayers(data);
    return source.filter(player=>!player.leftAt && isTemporarilyReconnectable(player,now));
  }
  function activeGamePlayerIds(data, options={}){
    return activeGamePlayers(data,options).map(player=>String(player.id));
  }
  function getCurrentPlayerAssignment(game=state.lastRoomData?.game||{}){
    const round=Number(game.currentRound||0),token=String(game.roundToken||'');
    const candidates=[state.myAssignment,state.privateAssignment];
    return candidates.find(value=>Boolean(value&&Number(value.round)===round&&String(value.roundToken||'')===token&&String(value.playerId)===String(state.playerId)&&value.character?.nombre&&value.character?.categoria))||null;
  }
  async function pruneInactiveRoundPlayers(data){
    if(!state.roomRef||state.mode!=='host')return data;
    const game=data?.game||{},active=game.activePlayers||{};
    if(!Object.keys(active).length)return data;
    const now=serverNow(),stale=Object.keys(active).filter(id=>active[id]===true&&!isTemporarilyReconnectable(data.players?.[id],now));
    if(!stale.length)return data;
    try{
      const result=await state.roomRef.child('game/activePlayers').transaction(current=>{
        if(!current)return;
        const next={...current};
        stale.forEach(id=>{delete next[id];});
        return next;
      });
      if(result.committed){
        const cleanup={};stale.forEach(id=>cleanup[`game/assignmentReceipts/${id}`]=null);
        await state.roomRef.update(cleanup);
        const fresh=(await withTimeout(state.roomRef.once('value'),7000,'prune-room-read-timeout')).val();
        console.warn('[GAME] jugadores offline/abandonados retirados de activePlayers',stale);
        return fresh||data;
      }
    }catch(error){logFirebaseError('pruneInactiveRoundPlayers',error,state.roomRef.child('game/activePlayers').toString(),{stale});}
    return data;
  }
  function playerNames(data,game){
    const names={...(game?.playerNames||{})};
    normalizeRoomPlayers(data).forEach(player=>{names[player.id]=player.name;});
    return names;
  }
  function selectedRoomConfig(data){
    const categories=Array.isArray(data?.settings?.categories)?data.settings.categories:state.categories;
    const totalRounds=Math.min(20,Math.max(1,Number(data?.settings?.totalRounds||data?.game?.totalRounds||state.totalRounds)||3));
    return {categories,totalRounds};
  }
  function validateCardStock(playersCount,categories,totalRounds){
    const players=Math.max(0,Number(playersCount)||0),cards=characterPool(categories||[]),available=cards.length;
    return {available,required:players,rounds:Math.max(1,Number(totalRounds)||1),valid:players>0&&players<=available};
  }

  function applyCardStockValidation(validation,target='errorStock'){
    const startButton=$('startRoomBtn');
    const errorContainer=$(target)||$('errorStock')||$('lobbyNotice');
    if(!errorContainer)return validation.valid;
    if(!validation.valid){
      if(startButton)startButton.disabled=true;
      errorContainer.textContent=`No hay suficientes personajes únicos para esta ronda. Hay ${validation.available} disponibles y necesitas ${validation.required}.`;
      errorContainer.className='room-notice show error';
      errorContainer.style.display='block';
      return false;
    }
    errorContainer.textContent='';
    errorContainer.className='room-notice';
    errorContainer.style.display='none';
    return true;
  }

  async function refreshSetupStockValidation(){
    let playersCount=1;
    if(state.roomRef&&state.configEditing&&state.mode==='host'){try{const snapshot=await withTimeout(state.roomRef.once('value'),7000,'setup-stock-read-timeout');playersCount=Math.max(1,onlineRoomPlayers(snapshot.val()).length);}catch(error){playersCount=1;}}
    const validation=validateCardStock(playersCount,state.categories,state.totalRounds);const button=$('createRoomBtn');if(button)button.disabled=!state.categories.length||!validation.valid;return applyCardStockValidation(validation,'errorStock');
  }

  function getCardStockMessage(validation){
    return `No hay suficientes personajes únicos para esta ronda. Hay ${validation.available} disponibles y necesitas ${validation.required}.`;
  }

  // ============================================================
  // MOTOR COMÚN DE MINIJUEGOS MULTIJUGADOR
  // ============================================================
  const ONLINE_GAME_TYPES=new Set([
    GAME_TYPES.WHOAMI,
    GAME_TYPES.AGE,
    GAME_TYPES.CONFESSIONS,
    GAME_TYPES.STOP,
    GAME_TYPES.CHAMUYA,
    GAME_TYPES.TRIBUNAL,
    GAME_TYPES.WHAT_WOULD_YOU_DO
  ]);
  function roomGameTypeInfo(data){
    const values=[data?.gameType,data?.settings?.gameType,data?.game?.gameType]
      .map(value=>String(value??'').trim().toLowerCase())
      .filter(Boolean);
    const unique=[...new Set(values)],invalid=unique.some(value=>!ONLINE_GAME_TYPES.has(value));
    return {type:unique.length===1&&!invalid?unique[0]:'',consistent:unique.length<=1&&!invalid,values:unique};
  }
  function miniRoomType(data){return roomGameTypeInfo(data).type;}
  function routeRoomByGameType(gameType){
    const type=String(gameType||'').trim().toLowerCase();
    if(!ONLINE_GAME_TYPES.has(type))return null;
    return type===GAME_TYPES.WHOAMI?{type,join:'whoami',lobby:'lobby'}:{type,join:'mini',lobby:'lobby'};
  }
  function roomDirectoryPayload(data){
    const type=miniRoomType(data),game=data?.game||{},phase=String(game.phase||'lobby'),players=normalizeRoomPlayers(data).filter(player=>!player.leftAt);
    if(!type||!state.roomCode)return null;
    return {
      gameType:type,
      phase,
      hostId:String(data.hostId||''),
      hostName:String(data.hostName||''),
      playerCount:players.length,
      maxPlayers:ROOM_DIRECTORY_MAX_PLAYERS,
      available:phase==='lobby'&&players.length<ROOM_DIRECTORY_MAX_PLAYERS,
      updatedAt:firebase.database.ServerValue.TIMESTAMP
    };
  }
  async function syncRoomDirectory(data,force=false){
    if(!state.roomRef||!state.roomCode||state.mode!=='host')return false;
    const payload=roomDirectoryPayload(data);if(!payload)return false;
    const key=JSON.stringify({...payload,updatedAt:null});
    if(!force&&state.roomDirectorySyncKey===key)return true;
    try{
      await withTimeout(db.ref(`roomDirectory/${state.roomCode}`).update(payload),7000,'room-directory-timeout');
      state.roomDirectorySyncKey=key;return true;
    }catch(error){logFirebaseError('syncRoomDirectory',error,`roomDirectory/${state.roomCode}`);return false;}
  }
  async function readRoomDirectory(code){
    const normalized=String(code||'').trim().toUpperCase();
    if(!ROOM_CODE_PATTERN.test(normalized))return null;
    const snapshot=await withTimeout(db.ref(`roomDirectory/${normalized}`).once('value'),7000,'room-directory-read-timeout');
    return snapshot.exists()?snapshot.val():null;
  }
  function miniPlayers(data){
    const ids=Object.keys(data?.game?.activePlayers||{}).filter(id=>data.game.activePlayers[id]===true);
    return ids.map(id=>({id,...(data.players?.[id]||{}),name:String(data.players?.[id]?.name||data.game?.playerNames?.[id]||id)})).filter(player=>!player.leftAt);
  }
  function miniPlayerName(data,id){return String(data?.players?.[id]?.name||data?.game?.playerNames?.[id]||id||'Jugador');}
  function miniScores(game,players){
    const scores={...(game?.scores||{})};
    players.forEach(player=>{if(scores[player.id]===undefined)scores[player.id]=0;});
    return scores;
  }
  function miniToken(type,round){return `${type}-r${round}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;}
  function chooseStopLetter(config,lastLetter=''){
    const letters=[...(config?.letters||[])].filter(letter=>STOP_DEFAULT_LETTERS.includes(String(letter)));
    if(!letters.length)return '';
    const candidates=letters.length>1?letters.filter(letter=>letter!==lastLetter):letters;
    return candidates[Math.floor(Math.random()*candidates.length)]||letters[0];
  }
  function defaultWhatWouldYouDoConfig(){return {totalRounds:3,categories:[...whatWouldYouDoCategories]};}
  function whatWouldYouDoConfigFromUI(){
    const current=state.whatWouldYouDoConfig||defaultWhatWouldYouDoConfig(),rounds=Math.min(20,Math.max(1,Number($('whatWouldYouDoRoundsSelect')?.value)||Number(current.totalRounds)||3));
    const selected=[...document.querySelectorAll('#whatWouldYouDoCategoriesBox .what-would-category-chip.selected')].map(button=>String(button.dataset.category||'')).filter(Boolean);
    return {totalRounds:rounds,categories:selected.length?selected:[...whatWouldYouDoCategories]};
  }
  function renderWhatWouldYouDoSetup(){
    const config=state.whatWouldYouDoConfig||defaultWhatWouldYouDoConfig(),box=$('whatWouldYouDoCategoriesBox');
    if($('whatWouldYouDoRoundsSelect'))$('whatWouldYouDoRoundsSelect').value=String(config.totalRounds||3);
    if(box){box.replaceChildren();whatWouldYouDoCategories.forEach(category=>{const button=document.createElement('button');button.type='button';button.className='what-would-category-chip'+(config.categories.includes(category)?' selected':'');button.dataset.category=category;button.textContent=category;button.setAttribute('aria-pressed',String(config.categories.includes(category)));button.addEventListener('click',()=>{const next=state.whatWouldYouDoConfig||defaultWhatWouldYouDoConfig();next.categories=next.categories.includes(category)?next.categories.filter(item=>item!==category):[...next.categories,category];if(!next.categories.length)next.categories=[...whatWouldYouDoCategories];state.whatWouldYouDoConfig=next;renderWhatWouldYouDoSetup();});box.appendChild(button);});}
    const allSelected=(config.categories||[]).length===whatWouldYouDoCategories.length;setText('whatWouldYouDoToggleCategoriesBtn',allSelected?'Quitar todas':'Seleccionar todas');
  }
  function openWhatWouldYouDoSetup(){
    state.gameType=GAME_TYPES.WHAT_WOULD_YOU_DO;state.mode='host';state.whatWouldYouDoConfig=state.whatWouldYouDoConfig||defaultWhatWouldYouDoConfig();
    const input=$('whatWouldYouDoHostNameInput');if(input)input.value=accountUid()?accountUsername():state.playerName||'';renderWhatWouldYouDoSetup();show('whatWouldYouDoSetup');
  }
  function toggleWhatWouldYouDoCategories(){
    const current=state.whatWouldYouDoConfig||defaultWhatWouldYouDoConfig(),allSelected=current.categories.length===whatWouldYouDoCategories.length;
    state.whatWouldYouDoConfig={...current,categories:allSelected?[]:[...whatWouldYouDoCategories]};renderWhatWouldYouDoSetup();
  }
  function miniRoomSettings(type,config){
    if(type===GAME_TYPES.STOP)return {gameType:type,stop:{totalRounds:config.totalRounds,timeSeconds:config.timeSeconds,letters:[...config.letters],categories:[...config.categories],customCategories:[...config.customCategories],lastLetter:config.lastLetter||''}};
    if(type===GAME_TYPES.CONFESSIONS)return {gameType:type,confessions:{roundsMode:config.roundsMode||'perPlayer'}};
    if(type===GAME_TYPES.CHAMUYA)return {gameType:type,chamuyaya:{chaMuyaCount:Math.max(1,Number(config.chaMuyaCount)||1),totalRounds:Math.max(1,Number(config.totalRounds)||CHAMUYA_DEFAULT_ROUNDS)}};
    if(type===GAME_TYPES.TRIBUNAL)return {gameType:type,tribunal:{totalRounds:Math.max(1,Number(config.totalRounds)||TRIBUNAL_DEFAULT_ROUNDS)}};
    if(type===GAME_TYPES.WHAT_WOULD_YOU_DO)return {gameType:type,whatWouldYouDo:{totalRounds:Math.min(20,Math.max(1,Number(config.totalRounds)||3)),categories:[...(config.categories||whatWouldYouDoCategories)]}};
    return {gameType:type,age:{totalRounds:config.totalRounds}};
  }
  function miniInitialGame(type,hostId,hostName,config,timestamp){
    const totalRounds=type===GAME_TYPES.CHAMUYA?Math.max(1,Number(config.totalRounds)||CHAMUYA_DEFAULT_ROUNDS):type===GAME_TYPES.TRIBUNAL?Math.max(1,Number(config.totalRounds)||TRIBUNAL_DEFAULT_ROUNDS):Number(config.totalRounds)||0;
    return {gameType:type,phase:'lobby',round:0,currentRound:0,totalRounds,gameStartTime:null,prepEndsAt:null,revealAt:null,revealEndsAt:null,roundEndsAt:null,countdownEndsAt:null,roundToken:null,scores:{[hostId]:0},playerNames:{[hostId]:hostName},activePlayers:{[hostId]:true},roundResults:null,ageTargetsByPlayer:null,ageEstimates:null,ageSubmitted:null,confessions:null,confessionSubmissions:null,confessionOrder:null,confessionIndex:0,confessionCurrentId:'',confessionVotes:null,stopLetter:'',stopAt:null,stopResponses:null,stopJudgments:null,stopVotingPlayers:null,stopVotes:null,chamuyaya:null,tribunal:null,whatWouldYouDo:null,createdAt:timestamp};
  }
  function miniPrepareRound(game,type,round,players,config,now){
    const names={},activePlayers={};players.forEach(player=>{names[player.id]=player.name;activePlayers[player.id]=true;});
    const totalRounds=type===GAME_TYPES.CONFESSIONS?confessionsRoundCount(config.roundsMode,players.length):Number(config.totalRounds)||Number(game.totalRounds)||3,roundToken=miniToken(type,round),base={...game,gameType:type,round,currentRound:round,totalRounds,gameStartTime:now,prepEndsAt:null,revealAt:null,revealEndsAt:null,ageDeadlineAt:null,roundEndsAt:null,roundToken,scores:miniScores(game,players),playerNames:names,activePlayers,roundResults:null,ageTargetsByPlayer:null,ageEstimates:null,ageSubmitted:null,confessionSubmissions:null,confessionOrder:null,confessionIndex:0,confessionCurrentId:'',confessionVotes:null,stopAt:null,stopResponses:null,stopJudgments:null,stopVotingPlayers:null,stopVotes:null};
    if(type===GAME_TYPES.CONFESSIONS){return {...base,phase:'confessionsWriting',currentRound:0,confessions:{},confessionSubmissions:{},confessionOrder:[],confessionIndex:0,confessionCurrentId:'',confessionVotes:{}};}
    if(type===GAME_TYPES.AGE){return {...base,phase:'agePreparation',prepEndsAt:now+AGE_PREPARATION_DURATION_MS,ageTargetsByPlayer:generateAgeTargets(players)};}
    return {...base,phase:'stopReveal',revealAt:now,revealEndsAt:now+MINI_REVEAL_DURATION_MS,stopLetter:chooseStopLetter(config,game.stopLetter),stopConfigVersion:Date.now()};
  }
  function renderMiniLobby(data){
    const type=miniRoomType(data);
    if(!routeRoomByGameType(type)){
      notice('La sala tiene un tipo de juego desconocido. No se abrirá ninguna partida.','error','joinNotice');
      return false;
    }
    const players=onlineRoomPlayers(data),allPlayers=normalizeRoomPlayers(data),host=isHost(data),settings=data.settings||{},config=type===GAME_TYPES.STOP?settings.stop||defaultStopConfig():type===GAME_TYPES.CONFESSIONS?settings.confessions||defaultConfessionsConfig():type===GAME_TYPES.CHAMUYA?settings.chamuyaya||defaultChamuyayaConfig():type===GAME_TYPES.TRIBUNAL?settings.tribunal||defaultTribunalConfig():type===GAME_TYPES.WHAT_WOULD_YOU_DO?settings.whatWouldYouDo||{totalRounds:data.game?.totalRounds||3,categories:whatWouldYouDoCategories}:settings.age||{totalRounds:data.game?.totalRounds||3};
    state.gameType=type;state.lastRoomData=data;state.totalRounds=type===GAME_TYPES.CONFESSIONS?confessionsRoundCount(config.roundsMode,players.length):Number(config.totalRounds)||3;
    setText('roomCodeValue',state.roomCode);setText('lobbyCount',`${players.length} / 20 jugadores`);
    const list=$('lobbyList');if(list)list.innerHTML=allPlayers.map(player=>{const online=isPlayerOnline(player),name=cleanUiText(player.name),initial=escapeHtml((name.replace(/[^A-Za-zÁÉÍÓÚÜÑa-záéíóúüñ0-9]/g,'').slice(0,1)||'?').toUpperCase()),role=player.id===data.hostId?'ANFITRIÓN':(online?'ONLINE':'OFFLINE');return `<div class="lobby-player" role="listitem"><div class="lobby-avatar">${initial}</div><div class="lobby-player-main"><div class="lobby-player-name">${escapeHtml(name)}</div><div class="lobby-player-status ${online?'online':'offline'}">${role==='ANFITRIÓN'?'Host':role}</div></div><span class="lobby-role">${player.id===data.hostId?'👑':''}</span></div>`;}).join('');
    const summary=$('settingsSummary');
    if(summary){if(type===GAME_TYPES.STOP){const cats=(config.categories||[]).map(category=>`<span class="summary-chip">${escapeHtml(cleanUiText(category))}</span>`).join('');summary.innerHTML=`<div><strong>STOP · ${config.totalRounds||3} rondas · ${config.timeSeconds||60} segundos</strong></div><div><strong>Letra:</strong> ${escapeHtml((config.letters||[]).join(', '))}</div><div class="summary-chips">${cats||'<span class="summary-chip">Sin categorías</span>'}</div>`;}else if(type===GAME_TYPES.CONFESSIONS){summary.innerHTML=`<div><strong>🔥 ConFESa2</strong></div><div><strong>Rondas:</strong> ${confessionsModeLabel(config.roundsMode)} · ${state.totalRounds} disponibles con este grupo</div>`;}else if(type===GAME_TYPES.CHAMUYA){summary.innerHTML=`<div><strong>🎭 ChaMuYa2</strong></div><div><strong>Rondas:</strong> ${config.totalRounds||CHAMUYA_DEFAULT_ROUNDS} · <strong>ChaMuYas:</strong> ${Math.max(1,Number(config.chaMuyaCount)||1)}</div>`;}else if(type===GAME_TYPES.TRIBUNAL){summary.innerHTML=`<div><strong>🏛️ SR. JUEZ</strong></div><div><strong>Casos:</strong> ${config.totalRounds||TRIBUNAL_DEFAULT_ROUNDS}</div>`;}else if(type===GAME_TYPES.WHAT_WOULD_YOU_DO){summary.innerHTML=`<div><strong>⚡ WHAT WOULD YOU DO?</strong></div><div><strong>Rondas:</strong> ${config.totalRounds||3} · <strong>Categorías:</strong> ${(config.categories||[]).length}</div>`;}else{summary.innerHTML=`<div><strong>ADIVINA LA EDAD</strong></div><div><strong>Rondas:</strong> ${config.totalRounds||3}</div>`;}}
    const chamuyayaSettings=$('chamuyayaLobbySettings');if(chamuyayaSettings){chamuyayaSettings.classList.toggle('hidden',type!==GAME_TYPES.CHAMUYA);if(type===GAME_TYPES.CHAMUYA){const count=Math.max(1,Number(config.chaMuyaCount)||1);setText('chamuyayaCountValue',count);$('chamuyayaCountMinusBtn').disabled=count<=1;$('chamuyayaCountPlusBtn').disabled=count>=Math.max(1,players.length-1);}}
    const start=$('startRoomBtn');if(start){start.style.display=host?'block':'none';start.disabled=!host||players.length<2||data.game?.phase!=='lobby'||(type===GAME_TYPES.CHAMUYA&&(Number(config.chaMuyaCount||1)<1||Number(config.chaMuyaCount||1)>=players.length))||(type===GAME_TYPES.TRIBUNAL&&players.length<5);}
    const edit=$('editSettingsBtn');if(edit)edit.style.display='none';const waiting=$('waitingHost');if(waiting){waiting.style.display=host?'none':'block';if(!host)waiting.textContent='Esperando al anfitrión…';}
    const info=document.querySelector('#lobby .info');if(info){const base=type===GAME_TYPES.STOP?'Todos juegan desde su propio teléfono. La letra, el tiempo y las respuestas se sincronizan con Firebase.':type===GAME_TYPES.CONFESSIONS?'Todos escriben una confesión y luego votan al autor. El cambio de etapa es automático y compartido.':type===GAME_TYPES.CHAMUYA?'Todos reciben una carta privada. La discusión es libre y el voto se sincroniza con Firebase.':type===GAME_TYPES.TRIBUNAL?'Los roles y las evidencias privadas se entregan por jugador. El Juez guía el juicio.':type===GAME_TYPES.WHAT_WOULD_YOU_DO?'Todos responden la misma pregunta. El resultado aparece cuando todos hayan votado.':'Cada jugador recibe una edad diferente. Las edades se mostrarán como recordatorio durante la estimación.';info.innerHTML=type===GAME_TYPES.TRIBUNAL?`${escapeHtml(base)}<div class="tribunal-lobby-requirement${players.length>=5?' ready':''}">${players.length>=5?'✅ LISTO:':'🔒 FALTAN JUGADORES:'} Sr. Juez necesita mínimo 5 jugadores · ${players.length} / 5</div>`:escapeHtml(base);}
    const inviteButton=$('inviteFriendsBtn');if(inviteButton){inviteButton.classList.toggle('hidden',!accountUid());inviteButton.disabled=!accountUid();}renderLobbyFriends();
  }
  async function createMiniRoom(type){
    if(!ensureFirebaseConfigured()||state.busy.create)return;
    const gameType=String(type||'').trim().toLowerCase();
    if(!routeRoomByGameType(gameType)||gameType===GAME_TYPES.WHOAMI||gameType===GAME_TYPES.CHUPISTICA){notice('Este juego no usa este flujo de sala.','error');return;}
    const stopConfig=gameType===GAME_TYPES.STOP?stopConfigFromUI():null,confessionsConfig=gameType===GAME_TYPES.CONFESSIONS?confessionsConfigFromUI(confessionsModeFromUI()):null,chamuyayaConfig=gameType===GAME_TYPES.CHAMUYA?defaultChamuyayaConfig():null,tribunalConfig=gameType===GAME_TYPES.TRIBUNAL?tribunalConfigFromUI():null,whatWouldYouDoConfig=gameType===GAME_TYPES.WHAT_WOULD_YOU_DO?whatWouldYouDoConfigFromUI():null,totalRounds=gameType===GAME_TYPES.STOP?Number(stopConfig.totalRounds)||3:gameType===GAME_TYPES.CONFESSIONS?0:gameType===GAME_TYPES.CHAMUYA?CHAMUYA_DEFAULT_ROUNDS:gameType===GAME_TYPES.TRIBUNAL?Number(tribunalConfig.totalRounds)||TRIBUNAL_DEFAULT_ROUNDS:gameType===GAME_TYPES.WHAT_WOULD_YOU_DO?Number(whatWouldYouDoConfig.totalRounds)||3:Number(state.miniConfig?.totalRounds)||3,nameInputId=gameType===GAME_TYPES.STOP?'stopHostNameInput':gameType===GAME_TYPES.CONFESSIONS?'confessionsHostNameInput':gameType===GAME_TYPES.CHAMUYA?'chamuyayaHostNameInput':gameType===GAME_TYPES.WHAT_WOULD_YOU_DO?'whatWouldYouDoHostNameInput':'tribunalHostNameInput',createButtonId=gameType===GAME_TYPES.STOP?'stopCreateRoomBtn':gameType===GAME_TYPES.CONFESSIONS?'confessionsCreateRoomBtn':gameType===GAME_TYPES.CHAMUYA?'chamuyayaCreateRoomBtn':gameType===GAME_TYPES.WHAT_WOULD_YOU_DO?'whatWouldYouDoCreateRoomBtn':'tribunalCreateRoomBtn',noticeId=gameType===GAME_TYPES.STOP?'stopSetupNotice':gameType===GAME_TYPES.CONFESSIONS?'confessionsSetupNotice':gameType===GAME_TYPES.CHAMUYA?'chamuyayaSetupNotice':gameType===GAME_TYPES.WHAT_WOULD_YOU_DO?'whatWouldYouDoSetupNotice':'tribunalSetupNotice';
    const hostName=(accountUid()?accountUsername():$(nameInputId)?.value||'').trim().slice(0,30);
    if(!hostName){miniNotice(noticeId,'Escribe tu nombre.','error');return;}
    if(gameType===GAME_TYPES.STOP&&(!stopConfig.letters.length||!stopConfig.categories.length)){miniNotice(noticeId,'Selecciona al menos una letra y una categoría.','error');return;}
    setBusy('create',true);setButtonBusy(createButtonId,'create',true,'CREANDO SALA…');
    let createdRef=null;
    try{
      if(!auth.currentUser)await ensureRoomAuth();if(!backendUid())throw new Error('No hay identidad segura para la sala.');
      state.gameType=gameType;state.mode='host';roomIdentity();state.hostName=hostName;state.playerName=hostName;state.totalRounds=totalRounds;
      const config=gameType===GAME_TYPES.STOP?stopConfig:gameType===GAME_TYPES.CONFESSIONS?confessionsConfig:gameType===GAME_TYPES.CHAMUYA?{...chamuyayaConfig,totalRounds}:gameType===GAME_TYPES.TRIBUNAL?tribunalConfig:gameType===GAME_TYPES.WHAT_WOULD_YOU_DO?whatWouldYouDoConfig:{totalRounds};if(gameType===GAME_TYPES.WHAT_WOULD_YOU_DO)state.whatWouldYouDoConfig=whatWouldYouDoConfig;let committed=false;
      for(let attempt=0;attempt<10&&!committed;attempt++){
        const code=roomCode(),ref=db.ref(`rooms/${code}`),timestamp=firebase.database.ServerValue.TIMESTAMP,settings=miniRoomSettings(gameType,config),initial={gameType,hostId:String(state.playerId),hostAuthUid:String(backendUid()),hostName,secureAssignments:false,createdAt:timestamp,metadata:{lastActiveAt:timestamp,cleanupEligibleAt:null},settings,players:{[state.playerId]:{name:hostName,accountUid:accountUid()||null,authUid:backendUid(),joinedAt:timestamp,lastSeen:timestamp,status:'online',connected:true,leftAt:null}},game:miniInitialGame(gameType,String(state.playerId),hostName,config,timestamp)};
        const result=await withTimeout(ref.transaction(current=>current===null?initial:undefined),10000,'room-transaction-timeout');
         if(result.committed){committed=true;createdRef=ref;state.roomCode=code;state.roomRef=ref;state.roomDirectorySyncKey='';state.lastRoomData=result.snapshot.val()||initial;}
      }
      if(!committed)throw new Error('No se encontró un código disponible.');
       await markRoomMembership();await installDisconnect();saveSessionInfo(state.roomCode,state.playerName,state.playerId);await syncRoomDirectory(state.lastRoomData,true);listenToRoom();renderMiniLobby(state.lastRoomData);goToScreenIfChanged('lobby');miniNotice('lobbyNotice',`Sala ${state.roomCode} creada. Comparte el código.`,'success');
    }catch(error){
      console.error('[MINIGAME CREATE]',error);
      logFirebaseError('createMiniRoom',error,createdRef?.toString()||'rooms/<codigo>');
      if(createdRef){try{await createdRef.remove();}catch(cleanupError){console.warn('No se pudo limpiar sala parcial',cleanupError);}}
      state.roomRef=null;state.roomCode='';state.lastRoomData=null;
      miniNotice(noticeId,mapFirebaseOperationError('crear sala',error,createdRef?.toString()||'rooms/<codigo>'),'error');
    }
    finally{setBusy('create',false);setButtonBusy(createButtonId,'create',false);}
  }
  async function joinMiniRoom(type){
    if(!ensureFirebaseConfigured()||state.busy.join)return;
    type=String(type||'').trim().toLowerCase();
    if(!routeRoomByGameType(type)||type===GAME_TYPES.WHOAMI||type===GAME_TYPES.CHUPISTICA){notice('Este código no corresponde a un juego online compatible.','error','joinNotice');return;}
    const code=String($('joinRoomCode')?.value||'').trim().toUpperCase(),name=(accountUid()?accountUsername():String($('joinName')?.value||'').trim()).slice(0,30),noticeId='joinNotice';
    if(!ROOM_CODE_PATTERN.test(code)){notice('Escribe un código de 5 caracteres.','error',noticeId);return;}if(!name){notice('Escribe tu nombre.','error',noticeId);return;}
    setBusy('join',true);setButtonBusy('joinRoomBtn','join',true,'BUSCANDO SALA…');notice('Buscando la sala…','',noticeId);
    try{
      if(!auth.currentUser)await ensureRoomAuth();state.gameType=type;state.mode='player';state.playerId=String(backendUid());state.playerName=name;attachRoom(code);
      const directory=await readRoomDirectory(code),declaredType=String(directory?.gameType||'').trim().toLowerCase();
      if(!directory||declaredType!==type){clearPendingRoomContext();notice(!directory?'No existe una sala con ese código. Verifica el código.':`Esa sala está configurada para ${MINI_GAME_LABELS[declaredType]||'otro minijuego'}.`,'error',noticeId);return;}
      const ownSnapshot=await withTimeout(state.roomRef.child(`players/${state.playerId}`).once('value'),7000,'room-player-read-timeout'),currentPlayer=ownSnapshot.exists()?{id:state.playerId,...(ownSnapshot.val()||{})}:null,phase=String(directory.phase||'lobby'),reconnecting=Boolean(currentPlayer&&!currentPlayer.leftAt);
      if(phase!=='lobby'&&!reconnecting){clearPendingRoomContext();notice('La partida ya comenzó. Espera a la próxima partida.','error',noticeId);return;}if(Number(directory.playerCount)>=ROOM_DIRECTORY_MAX_PLAYERS&&!reconnecting){clearPendingRoomContext();notice('La sala está llena.','error',noticeId);return;}
      if(reconnecting){state.playerName=currentPlayer.name||name;await withTimeout(state.roomRef.child(`players/${state.playerId}`).update({name:state.playerName,accountUid:accountUid()||null,authUid:backendUid(),status:'online',connected:true,leftAt:null,lastSeen:firebase.database.ServerValue.TIMESTAMP}),7000,'room-player-update-timeout');}
      else{const result=await withTimeout(state.roomRef.child(`players/${state.playerId}`).transaction(current=>current||{name,accountUid:accountUid()||null,authUid:backendUid(),joinedAt:firebase.database.ServerValue.TIMESTAMP,lastSeen:firebase.database.ServerValue.TIMESTAMP,status:'online',connected:true,leftAt:null}),7000,'room-player-join-timeout');if(!result.committed)throw Object.assign(new Error('join-conflict'),{code:'join-conflict'});}
      const snapshot=await withTimeout(state.roomRef.once('value'),7000,'room-read-after-join-timeout');if(!snapshot.exists())throw new Error('room-missing-after-join');const data=snapshot.val(),actualType=miniRoomType(data);if(actualType!==type)throw Object.assign(new Error('room-type-changed'),{code:'room-type-changed'});
      await markRoomMembership();await installDisconnect();saveSessionInfo(state.roomCode,state.playerName,state.playerId);listenToRoom();goToScreenIfChanged('lobby');notice(reconnecting?'Reconectado. Se conservó tu jugador.':'Conectado. Esperando al anfitrión.','success','lobbyNotice');
    }catch(error){console.error('[MINIGAME JOIN]',error);clearPendingRoomContext();notice(error?.code==='join-conflict'?'No se pudo reservar tu jugador. Intenta nuevamente.':'No se pudo entrar a la sala. Revisa la conexión.','error',noticeId);}
    finally{setBusy('join',false);setButtonBusy('joinRoomBtn','join',false);}
  }
  async function startMiniGame(){
    if(state.busy.start||!state.roomRef||state.mode!=='host')return;setBusy('start',true);setButtonBusy('startRoomBtn','start',true,'INICIANDO…');
    try{const data=(await withTimeout(state.roomRef.once('value'),7000,'mini-start-read-timeout')).val(),type=miniRoomType(data);if(!data||!routeRoomByGameType(type)||type===GAME_TYPES.WHOAMI||!isHost(data)||data.game?.phase!=='lobby'){notice('La sala no tiene un tipo de juego online válido.','error','lobbyNotice');return;}const players=onlineRoomPlayers(data).slice(0,20);if(players.length<2){notice('Necesitas al menos 2 jugadores para comenzar.','error','lobbyNotice');return;}
      if(type===GAME_TYPES.CHAMUYA){await startChamuyayaRound(data,players);return;}
      if(type===GAME_TYPES.TRIBUNAL){if(players.length<5){notice(`Sr. Juez necesita mínimo 5 jugadores. Actualmente hay ${players.length}.`,'error','lobbyNotice');return;}await startTribunalRound(data,players);return;}
      if(type===GAME_TYPES.WHAT_WOULD_YOU_DO){await startWhatWouldYouDoRound(data,players);return;}
      const config=type===GAME_TYPES.STOP?data.settings?.stop||defaultStopConfig():type===GAME_TYPES.CONFESSIONS?data.settings?.confessions||defaultConfessionsConfig():data.settings?.age||{totalRounds:3};if(type===GAME_TYPES.STOP&&(!config.letters?.length||!config.categories?.length)){notice('STOP necesita al menos una letra y una categoría.','error','lobbyNotice');return;}
      const round=1,now=serverNow(),nextGame=miniPrepareRound(data.game,type,round,players,type===GAME_TYPES.CONFESSIONS?config:{...config,totalRounds:Number(config.totalRounds)||3},now);const result=await withTimeout(state.roomRef.child('game').transaction(game=>!game||game.phase!=='lobby'?undefined:nextGame),7000,'mini-start-write-timeout');if(!result.committed)notice('La partida ya está siendo iniciada por otro dispositivo.','error','lobbyNotice');
    }catch(error){console.error('[MINIGAME START]',error);notice('No fue posible iniciar la partida. Revisa la conexión.','error','lobbyNotice');}finally{setBusy('start',false);setButtonBusy('startRoomBtn','start',false);}
  }
  function chamuyayaRoundPlayers(data){return miniPlayers(data).map(player=>({id:String(player.id),name:String(player.name||data.game?.playerNames?.[player.id]||player.id)}));}
  async function startChamuyayaRound(data,players=chamuyayaRoundPlayers(data)){
    if(!state.roomRef||players.length<2)return false;
    const config=data.settings?.chamuyaya||defaultChamuyayaConfig(),count=Math.max(1,Math.min(players.length-1,Number(config.chaMuyaCount)||1)),normalCount=players.length-count,game=data.game||{},used=Array.isArray(game.chamuyaya?.usedDataIds)?game.chamuyaya.usedDataIds.map(Number):[],available=chamuyayaCatalog.filter(item=>!used.includes(Number(item.id))),totalRounds=Math.max(1,Number(game.totalRounds)||Number(config.totalRounds)||CHAMUYA_DEFAULT_ROUNDS),round=Number(game.currentRound||0)+1,remainingRounds=Math.max(1,totalRounds-round+1),requiredDataCount=normalCount*remainingRounds;
    if(available.length<requiredDataCount){notice('No hay suficientes datos distintos para terminar esta partida sin repeticiones. Se necesitan '+requiredDataCount+' y quedan '+available.length+'. Agrega más datos en data/chamuyaya/data.js.','error','lobbyNotice');return false;}
    const dataPool=shuffleArray(available).slice(0,normalCount),token=miniToken(GAME_TYPES.CHAMUYA,round),chaIds=shuffleArray(players.map(player=>String(player.id))).slice(0,count),assignments={};let dataIndex=0;
    players.forEach(player=>{const id=String(player.id),isCha=chaIds.includes(id),assignedData=isCha?null:dataPool[dataIndex++];assignments[id]={kind:GAME_TYPES.CHAMUYA,playerId:id,round,roundToken:token,role:isCha?'chamuyaya':'normal',data:isCha?null:{id:assignedData.id,dato:assignedData.dato},ready:false};});
    const countdownEndsAt=serverNow()+CHAMUYA_COUNTDOWN_DURATION_MS,nextGame={...game,gameType:GAME_TYPES.CHAMUYA,phase:'chamuyayaCountdown',round,currentRound:round,totalRounds:totalRounds,countdownEndsAt,roundEndsAt:null,roundToken:token,roundResults:null,scores:miniScores(game,players),playerNames:Object.fromEntries(players.map(player=>[String(player.id),player.name])),activePlayers:Object.fromEntries(players.map(player=>[String(player.id),true])),chamuyaya:{estado:'cuenta_regresiva',countdownEndsAt,chaMuyaCount:count,usedDataIds:[...new Set([...used,...dataPool.map(item=>Number(item.id))])],secretDataId:Number(dataPool[0]?.id||0),secretRoleIds:chaIds,ready:{},votes:{},voteSubmitted:{}}};
    const updates={};updates['rooms/'+state.roomCode+'/game']=nextGame;updates['rooms/'+state.roomCode+'/metadata/lastActiveAt']=firebase.database.ServerValue.TIMESTAMP;players.forEach(player=>{updates['privateAssignments/'+state.roomCode+'/'+player.id]=assignments[String(player.id)];});
    state.chamuyayaCardVisible=false;state.chamuyayaSelectedVotes=[];await db.ref().update(updates);return true;
  }
  async function transitionChamuyayaCountdownToReveal(data){
    if(!state.roomRef||state.mode!=='host')return false;const game=data?.game||{},ends=Number(game.chamuyaya?.countdownEndsAt||game.countdownEndsAt),token=String(game.roundToken||'');if(!Number.isFinite(ends)||serverNow()<ends)return false;
    const result=await state.roomRef.child('game').transaction(current=>{if(!current||current.phase!=='chamuyayaCountdown'||String(current.roundToken||'')!==token||Number(current.chamuyaya?.countdownEndsAt||current.countdownEndsAt)!==ends||serverNow()<ends)return;return {...current,phase:'chamuyayaReveal',countdownEndsAt:null,chamuyaya:{...current.chamuyaya,estado:'revelacion',ready:{}}};});if(result.committed)handleMiniRoomSnapshot({...state.lastRoomData,game:result.snapshot.val()});return Boolean(result.committed);
  }
  function chamuyayaReadyComplete(game){const ids=Object.keys(game?.activePlayers||{}).filter(id=>game.activePlayers[id]===true);return ids.length>=2&&ids.every(id=>game.chamuyaya?.ready?.[id]===true);}
  async function markChamuyayaReady(){
    if(!state.roomRef||!state.playerId)return false;const readyRef=state.roomRef.child(`game/chamuyaya/ready/${state.playerId}`),result=await readyRef.transaction(current=>current===true?current:true);if(result.committed)void maybeStartChamuyayaDiscussion({...state.lastRoomData,game:{...state.lastRoomData.game,chamuyaya:{...state.lastRoomData.game.chamuyaya,ready:{...(state.lastRoomData.game.chamuyaya?.ready||{}),[state.playerId]:true}}}});return Boolean(result.committed);
  }
  async function maybeStartChamuyayaDiscussion(data){
    const game=data?.game||{};if(!state.roomRef||state.mode!=='host'||game.phase!=='chamuyayaReveal'||!chamuyayaReadyComplete(game))return false;const result=await state.roomRef.child('game').transaction(current=>{if(!current||current.phase!=='chamuyayaReveal'||!chamuyayaReadyComplete(current))return;return {...current,phase:'chamuyayaDiscussion',chamuyaya:{...current.chamuyaya,estado:'discusion'}};});if(result.committed)handleMiniRoomSnapshot({...state.lastRoomData,game:result.snapshot.val()});return Boolean(result.committed);
  }
  async function endChamuyayaDiscussion(){
    if(!state.roomRef||state.mode!=='host')return false;const result=await state.roomRef.child('game').transaction(current=>{if(!current||current.phase!=='chamuyayaDiscussion')return;return {...current,phase:'chamuyayaVoting',chamuyaya:{...current.chamuyaya,estado:'votacion',votes:{},voteSubmitted:{}}};});if(result.committed)handleMiniRoomSnapshot({...state.lastRoomData,game:result.snapshot.val()});return Boolean(result.committed);
  }
  function chamuyayaVotesComplete(game){const ids=Object.keys(game?.activePlayers||{}).filter(id=>game.activePlayers[id]===true),votes=game?.chamuyaya?.votes||{};return ids.length>=2&&ids.every(id=>Array.isArray(votes[id]));}
  async function submitChamuyayaVote(){
    if(!state.roomRef||state.chamuyayaVoteInFlight)return;const game=state.lastRoomData?.game||{},ids=Object.keys(game.activePlayers||{}).filter(id=>game.activePlayers[id]===true).map(String),selected=[...(state.chamuyayaSelectedVotes||[])].map(String).filter(id=>ids.includes(id));if(!selected.length){miniNotice('chamuyayaVotingStatus','Selecciona al menos una persona.','error');return;}const max=Math.max(1,Number(game.chamuyaya?.chaMuyaCount)||1);if(selected.length>max){miniNotice('chamuyayaVotingStatus','Puedes seleccionar hasta '+max+' ChaMuYa'+(max===1?'':'s')+'.','error');return;}state.chamuyayaVoteInFlight=true;try{const result=await state.roomRef.child('game/chamuyaya/votes/'+state.playerId).transaction(current=>Array.isArray(current)?current:selected);if(result.committed){const next={...state.lastRoomData,game:{...state.lastRoomData.game,chamuyaya:{...state.lastRoomData.game.chamuyaya,votes:{...(state.lastRoomData.game.chamuyaya?.votes||{}),[state.playerId]:result.snapshot.val()}}}};state.lastRoomData=next;renderChamuyayaVoting(next);void maybeFinalizeChamuyayaVoting(next);}else miniNotice('chamuyayaVotingStatus','Tu voto ya fue registrado.','error');}catch(error){console.error('[CHAMUYA VOTE]',error);miniNotice('chamuyayaVotingStatus','No se pudo registrar el voto. Revisa la conexión.','error');}finally{state.chamuyayaVoteInFlight=false;}
  }
  async function maybeFinalizeChamuyayaVoting(data){const game=data?.game||{};if(!state.roomRef||state.mode!=='host'||game.phase!=='chamuyayaVoting'||!chamuyayaVotesComplete(game))return false;const result=await state.roomRef.child('game').transaction(current=>{if(!current||current.phase!=='chamuyayaVoting'||!chamuyayaVotesComplete(current))return;const ids=Object.keys(current.activePlayers||{}).filter(id=>current.activePlayers[id]===true).map(String),roles=(current.chamuyaya?.secretRoleIds||[]).map(String),votes=current.chamuyaya?.votes||{},counts={};ids.forEach(id=>counts[id]=0);ids.forEach(voter=>{(Array.isArray(votes[voter])?votes[voter]:[]).forEach(target=>{if(Object.prototype.hasOwnProperty.call(counts,target))counts[target]++;});});const found=roles.filter(id=>ids.includes(id)&&ids.some(voter=>(votes[voter]||[]).map(String).includes(id))),foundAll=found.length===roles.filter(id=>ids.includes(id)).length;return {...current,phase:'chamuyayaResult',roundResults:{type:'chamuyaya',round:current.currentRound,dataId:current.chamuyaya.secretDataId,data:chamuyayaDataById(current.chamuyaya.secretDataId),chamuyayaIds:roles,voteCounts:counts,foundIds:found,foundAll,votes},chamuyaya:{...current.chamuyaya,estado:'resultado'}};});if(result.committed)handleMiniRoomSnapshot({...state.lastRoomData,game:result.snapshot.val()});return Boolean(result.committed);}
  async function nextChamuyayaRound(){if(!state.roomRef||state.mode!=='host')return false;const data=(await withTimeout(state.roomRef.once('value'),7000,'chamuyaya-next-read-timeout')).val(),game=data?.game||{};if(game.phase!=='chamuyayaResult'||Number(game.currentRound)>=Number(game.totalRounds))return false;return startChamuyayaRound(data,chamuyayaRoundPlayers(data));}
  function tribunalRoleLabel(role){return ({juez:'👨‍⚖️ JUEZ',fiscal:'🔴 FISCAL',abogado:'🔵 ABOGADO',acusado:'🚨 ACUSADO',jurado:'👥 JURADO'})[role]||'JUGADOR';}
  function tribunalPublicState(value){const safe={...(value||{})};['secretRoles','roleMap','voterIds','judgeId','accusedId'].forEach(key=>delete safe[key]);return safe;}
  function tribunalActiveIds(game){return Object.keys(game?.activePlayers||{}).filter(id=>game.activePlayers[id]===true).map(String);}
  function tribunalVoterCount(game){return Math.max(0,tribunalActiveIds(game).length-3);}
  function tribunalVoterComplete(game){const ids=tribunalActiveIds(game),votes=game?.tribunal?.votes||{},registered=ids.filter(id=>String(votes[id]||'')).length;return ids.length>=5&&registered>=tribunalVoterCount(game);}
  async function startTribunalRound(data,players=miniPlayers(data)){
    if(!state.roomRef||players.length<5){miniNotice('lobbyNotice','Tribunal Express necesita al menos 5 jugadores: Juez, Fiscal, Abogado, Acusado y Jurado.','error');return false;}
    const game=data.game||{},config=tribunalConfigFromData(data),used=Array.isArray(game.tribunal?.usedCaseIds)?game.tribunal.usedCaseIds.map(Number):[],allCases=tribunalCases,available=allCases.map((item,index)=>({item,index})).filter(entry=>!used.includes(entry.index)),chosen=(available.length?available:allCases.map((item,index)=>({item,index})))[Math.floor(Math.random()*(available.length?available.length:allCases.length))];if(!chosen)return false;
    const round=Number(game.currentRound||0)+1,token=miniToken(GAME_TYPES.TRIBUNAL,round),shuffled=shuffleArray(players.map(player=>String(player.id))),juezId=shuffled[0],fiscalId=shuffled[1],abogadoId=shuffled[2],acusadoId=shuffled[3],caso=chosen.item,privateAssignments={};
    players.forEach(player=>{const id=String(player.id),role=id===juezId?'juez':id===fiscalId?'fiscal':id===abogadoId?'abogado':id===acusadoId?'acusado':'jurado';let privateCase={delito:caso.delito};if(role==='juez')privateCase={...caso};if(role==='fiscal')privateCase={delito:caso.delito,evidencia:caso.evidencias[Math.floor(Math.random()*caso.evidencias.length)]};if(role==='abogado')privateCase={delito:caso.delito,defensa:caso.defensas[Math.floor(Math.random()*caso.defensas.length)]};if(role==='acusado')privateCase={delito:caso.delito,coartada:caso.coartadas[Math.floor(Math.random()*caso.coartadas.length)]};privateAssignments[id]={kind:GAME_TYPES.TRIBUNAL,playerId:id,round,roundToken:token,role,caseId:chosen.index,case:privateCase,ready:false,surprise:null};});
    const nextGame={...game,gameType:GAME_TYPES.TRIBUNAL,phase:'tribunalRoles',round,currentRound:round,totalRounds:Math.max(1,Number(config.totalRounds)||TRIBUNAL_DEFAULT_ROUNDS),roundToken:token,roundResults:null,roundEndsAt:null,scores:miniScores(game,players),playerNames:Object.fromEntries(players.map(player=>[String(player.id),player.name])),activePlayers:Object.fromEntries(players.map(player=>[String(player.id),true])),tribunal:{estado:'informacion_secreta',caseId:chosen.index,publicCase:{delito:caso.delito},usedCaseIds:[...new Set([...used,chosen.index])],ready:{},votes:{},roundPoints:{},scoredBy:{},surpriseDelivered:false}};
    const updates={};updates['rooms/'+state.roomCode+'/game']=nextGame;updates['rooms/'+state.roomCode+'/metadata/lastActiveAt']=firebase.database.ServerValue.TIMESTAMP;players.forEach(player=>{updates['privateAssignments/'+state.roomCode+'/'+player.id]=privateAssignments[String(player.id)];});await withTimeout(db.ref().update(updates),7000,'tribunal-round-start-timeout');return true;
  }
  function renderChamuyayaPrivateCard(prefix,assignment,visible){
    const role=assignment?.role==='chamuyaya',roleLabel=$(prefix+'RoleLabel'),roleName=$(prefix+'RoleName'),dataBox=$(prefix+'Data'),hiddenBox=$(prefix+'Hidden'),toggle=$(prefix+'ToggleBtn');
    if(roleLabel)roleLabel.textContent=visible?(role?'🎭 TE TOCÓ':'🧠 TE TOCÓ'):'🔒 TU CARTA';
    if(roleName){roleName.textContent=role?'ChaMuYa':'EL DATO';roleName.classList.toggle('hidden',!visible);}
    if(dataBox){dataBox.textContent=role?'':assignment?.data?.dato||'';dataBox.classList.toggle('hidden',!visible||role);}
    if(hiddenBox)hiddenBox.classList.toggle('hidden',visible);
    if(toggle){toggle.textContent=visible?'OCULTAR':'VER MI CARTA';toggle.classList.toggle('hidden',false);}
  }
  function renderChamuyayaCountdown(data){const game=data.game||{};setText('chamuyayaCountdownRoundLabel','RONDA '+game.currentRound+' DE '+game.totalRounds);setText('chamuyayaCountdownValue',Math.max(0,Math.ceil(Math.max(0,Number(game.chamuyaya?.countdownEndsAt||game.countdownEndsAt)-serverNow())/1000)));}
  function renderChamuyayaReveal(data){
    const game=data.game||{},assignment=chamuyayaPrivateAssignment(game);if(state.chamuyayaCardVisible===undefined)state.chamuyayaCardVisible=false;setText('chamuyayaRevealRoundLabel','RONDA '+game.currentRound+' DE '+game.totalRounds);renderChamuyayaPrivateCard('chamuyayaOnline',assignment,state.chamuyayaCardVisible);const ready=game.chamuyaya?.ready?.[state.playerId]===true,button=$('chamuyayaRevealReadyBtn');if(button){button.disabled=ready;button.textContent=ready?'✅ LISTO PARA DISCUSIÓN':'YA VI MI CARTA';}setText('chamuyayaRevealStatus',ready?'Esperando al resto para comenzar la discusión.':'Puedes ver u ocultar tu carta tantas veces como quieras.');
  }
  function renderChamuyayaDiscussion(data){
    const game=data.game||{},assignment=chamuyayaPrivateAssignment(game);if(state.chamuyayaDiscussionCardVisible===undefined)state.chamuyayaDiscussionCardVisible=false;setText('chamuyayaDiscussionRoundLabel','RONDA '+game.currentRound+' DE '+game.totalRounds);renderChamuyayaPrivateCard('chamuyayaDiscussion',assignment,state.chamuyayaDiscussionCardVisible);const end=$('chamuyayaEndRoundBtn');if(end)end.classList.toggle('hidden',state.mode!=='host');setText('chamuyayaDiscussionStatus',state.mode==='host'?'Cuando todos estén listos, termina la ronda.':'Esperando al anfitrión para abrir la votación.');
  }
  function renderChamuyayaVoting(data){
    const game=data.game||{},players=miniPlayers(data),votes=game.chamuyaya?.votes||{},ownVote=Array.isArray(votes[state.playerId])?votes[state.playerId].map(String):null;const token=String(game.roundToken||'');if(state.chamuyayaVoteToken!==token){state.chamuyayaVoteToken=token;state.chamuyayaSelectedVotes=ownVote||[];}if(ownVote)state.chamuyayaSelectedVotes=ownVote;setText('chamuyayaVotingRoundLabel','RONDA '+game.currentRound+' DE '+game.totalRounds);const list=$('chamuyayaVotingPlayers');if(list)list.innerHTML=players.map(player=>{const id=String(player.id),selected=(state.chamuyayaSelectedVotes||[]).includes(id),disabled=Boolean(ownVote);return '<button class="chamuyaya-vote-choice'+(selected?' selected':'')+'" type="button" data-chamuyaya-target="'+escapeHtml(id)+'" '+(disabled?'disabled':'')+' aria-pressed="'+(selected?'true':'false')+'">👤 '+escapeHtml(cleanUiText(player.name))+(selected?' ✓':'')+'</button>';}).join('');if(list)list.querySelectorAll('[data-chamuyaya-target]').forEach(button=>button.addEventListener('click',()=>{const id=String(button.dataset.chamuyayaTarget||''),selected=new Set(state.chamuyayaSelectedVotes||[]);if(selected.has(id))selected.delete(id);else if(selected.size<Math.max(1,Number(game.chamuyaya?.chaMuyaCount)||1))selected.add(id);state.chamuyayaSelectedVotes=[...selected];renderChamuyayaVoting(data);}));const registered=Object.keys(votes).filter(id=>Array.isArray(votes[id])).length;setText('chamuyayaVotingStatus',ownVote?'✅ VOTO REGISTRADO · '+registered+' DE '+players.length:'Votos registrados: '+registered+' de '+players.length+'.');const submit=$('chamuyayaSubmitVoteBtn');if(submit)submit.disabled=Boolean(ownVote);
  }
  function renderChamuyayaResult(data){
    const game=data.game||{},result=game.roundResults||{},names=game.playerNames||{},roles=(result.chamuyayaIds||[]).map(String);setText('chamuyayaResultRoundLabel','RONDA '+game.currentRound+' DE '+game.totalRounds);setText('chamuyayaResultData','🧠 EL DATO REAL ERA: '+(result.data?.dato||chamuyayaDataById(result.dataId)?.dato||'—'));setText('chamuyayaResultWinner',result.foundAll?'🎉 ¡LOS JUGADORES GANARON!<br>Descubrieron a todos los ChaMuYas.':'🎭 ¡LOS ChaMuYAS GANARON!');const winner=$('chamuyayaResultWinner');if(winner)winner.innerHTML=result.foundAll?'🎉 ¡LOS JUGADORES GANARON!<br><small>Descubrieron a todos los ChaMuYas.</small>':'🎭 ¡LOS ChaMuYAS GANARON!';const list=$('chamuyayaResultRoles');if(list)list.innerHTML=roles.map(id=>'<div class="chamuyaya-end-row"><strong>🎭 '+escapeHtml(cleanUiText(names[id]||miniPlayerName(data,id)))+'</strong><span>ChaMuYa</span></div>').join('');const next=$('chamuyayaNextRoundBtn');if(next){const last=Number(game.currentRound)>=Number(game.totalRounds);next.classList.toggle('hidden',last);next.disabled=state.mode!=='host';next.textContent='JUGAR OTRA RONDA';}setText('chamuyayaResultStatus',Number(game.currentRound)>=Number(game.totalRounds)?'Última ronda completada.':'El anfitrión puede iniciar una nueva ronda.');
  }
  function tribunalCaseSection(label,values){const list=Array.isArray(values)?values:[];return '<div class="tribunal-list"><div class="secret-role-label">'+escapeHtml(label)+'</div>'+list.map(item=>'<div class="tribunal-list-item">'+escapeHtml(item)+'</div>').join('')+'</div>';}
  function renderTribunalRoles(data){
    const game=data.game||{},assignment=tribunalPrivateAssignment(game),role=assignment?.role||'',caso=assignment?.case||{};setText('tribunalRolesRoundLabel','RONDA '+game.currentRound+' DE '+game.totalRounds);setText('tribunalRoleName',tribunalRoleLabel(role));const box=$('tribunalPrivateInfo');if(box){if(role==='juez')box.innerHTML='<div class="tribunal-public-case">'+escapeHtml(caso.delito||'—')+'</div>'+tribunalCaseSection('EVIDENCIAS',caso.evidencias)+tribunalCaseSection('DEFENSAS',caso.defensas)+tribunalCaseSection('COARTADAS',caso.coartadas)+tribunalCaseSection('TESTIGOS',caso.testigos)+tribunalCaseSection('OBJETOS',caso.objetos);else if(role==='fiscal')box.innerHTML='<strong>Usa esta información para acusar:</strong><p>'+escapeHtml(caso.evidencia||'—')+'</p>';else if(role==='abogado')box.innerHTML='<strong>Usa esta información para defender:</strong><p>'+escapeHtml(caso.defensa||'—')+'</p>';else if(role==='acusado')box.innerHTML='<strong>Tu delito:</strong><p>'+escapeHtml(caso.delito||'—')+'</p><strong>Tu coartada:</strong><p>'+escapeHtml(caso.coartada||'—')+'</p>';else box.innerHTML='<strong>Información pública del caso:</strong><p>'+escapeHtml(caso.delito||game.tribunal?.publicCase?.delito||'—')+'</p>';}
    const ready=game.tribunal?.ready?.[state.playerId]===true,button=$('tribunalRoleReadyBtn');if(button){button.disabled=ready;button.textContent=ready?'✅ LISTO':'CONTINUAR →';}setText('tribunalRolesStatus',ready?'Esperando al resto de los jugadores…':'Lee tu información en privado y continúa.');
  }
  function renderTribunalPresentation(data){
    const game=data.game||{},assignment=tribunalPrivateAssignment(game),isJudge=assignment?.role==='juez',caso=assignment?.case||{},publicCrime=game.tribunal?.publicCase?.delito||caso.delito||'—';setText('tribunalPresentationRoundLabel','RONDA '+game.currentRound+' DE '+game.totalRounds);setText('tribunalPresentationCrime',publicCrime);const full=$('tribunalPresentationFullCase'),hint=$('tribunalPresentationRoleHint');if(full)full.innerHTML=isJudge?'<div class="tribunal-public-case">'+escapeHtml(caso.delito||'—')+'</div>'+tribunalCaseSection('EVIDENCIAS',caso.evidencias)+tribunalCaseSection('DEFENSAS',caso.defensas)+tribunalCaseSection('COARTADAS',caso.coartadas)+tribunalCaseSection('TESTIGOS',caso.testigos)+tribunalCaseSection('OBJETOS',caso.objetos):'<div class="tribunal-waiting">El Juez presentará el caso al grupo.</div>';if(hint)hint.innerHTML=isJudge?'<strong>Presenta el caso en voz alta.</strong>':'<strong>Tu información privada:</strong><p>'+escapeHtml(assignment?.case?.evidencia||assignment?.case?.defensa||assignment?.case?.coartada||'Conoce el delito público y participa en el juicio.')+'</p>';const button=$('tribunalPresentationContinueBtn');if(button)button.classList.toggle('hidden',!isJudge);setText('tribunalPresentationStatus',isJudge?'Cuando termines, continúa al debate.':'⏳ Esperando al Juez…');
  }
  function renderTribunalDebate(data){const game=data.game||{},isJudge=isTribunalJudge();setText('tribunalDebateRoundLabel','RONDA '+game.currentRound+' DE '+game.totalRounds);const button=$('tribunalDebateContinueBtn');if(button)button.classList.toggle('hidden',!isJudge);setText('tribunalDebateStatus',isJudge?'Cuando estén listos, continúa a la evidencia sorpresa.':'⏳ Esperando al Juez…');}
  function renderTribunalSurprise(data){const game=data.game||{},assignment=tribunalPrivateAssignment(game),surprise=assignment?.surprise;setText('tribunalSurpriseRoundLabel','RONDA '+game.currentRound+' DE '+game.totalRounds);const box=$('tribunalSurprisePrivate');if(box){box.classList.toggle('hidden',!surprise);if(surprise)box.innerHTML='<strong>🔐 EVIDENCIA SECRETA</strong><p>'+escapeHtml(surprise.text||'—')+'</p><small>Solo tú puedes ver esta información.</small>';}const button=$('tribunalSurpriseContinueBtn');if(button)button.classList.toggle('hidden',!isTribunalJudge());setText('tribunalSurpriseStatus',isTribunalJudge()?'Cuando termines, continúa al final del juicio.':surprise?'Usa esta evidencia durante el debate.':'🔒 Se entregó una evidencia secreta a uno de los jugadores.');}
  function renderTribunalFinal(data){const game=data.game||{};setText('tribunalFinalRoundLabel','RONDA '+game.currentRound+' DE '+game.totalRounds);const button=$('tribunalFinalContinueBtn');if(button)button.classList.toggle('hidden',!isTribunalJudge());setText('tribunalFinalStatus',isTribunalJudge()?'Abre la votación cuando estén listos.':'⏳ Esperando al Juez…');}
  function renderTribunalVoting(data){const game=data.game||{},players=miniPlayers(data),voter=isTribunalVoter(game),ownVote=String(game.tribunal?.votes?.[state.playerId]||''),list=$('tribunalVotingPlayers'),expected=tribunalVoterCount(game);setText('tribunalVotingRoundLabel','RONDA '+game.currentRound+' DE '+game.totalRounds);if(list)list.innerHTML=players.map(player=>{const id=String(player.id),selected=ownVote===id;return '<button class="tribunal-vote-choice'+(selected?' selected':'')+'" type="button" data-tribunal-target="'+escapeHtml(id)+'" '+(!voter||Boolean(ownVote)?'disabled':'')+' aria-pressed="'+(selected?'true':'false')+'">👤 '+escapeHtml(cleanUiText(player.name))+(selected?' ✓':'')+'</button>';}).join('');if(list)list.querySelectorAll('[data-tribunal-target]').forEach(button=>button.addEventListener('click',()=>{state.tribunalSelectedVote=String(button.dataset.tribunalTarget||'');renderTribunalVoting(data);}));const registered=Object.keys(game.tribunal?.votes||{}).filter(id=>game.tribunal.votes[id]).length;setText('tribunalVotingStatus',!voter?'🔒 NO PUEDES VOTAR · Tu rol no participa en la votación.':ownVote?'✅ VOTO REGISTRADO · '+registered+' DE '+expected:'Votos registrados: '+registered+' de '+expected);const submit=$('tribunalSubmitVoteBtn');if(submit){submit.disabled=!voter||Boolean(ownVote);submit.classList.toggle('hidden',!voter);}}
  function calcularPuntosTribunal(role,votedId,accusedId,guilty){if(role==='jurado')return String(votedId)===String(accusedId)?20:0;if(role==='juez')return guilty?15:0;if(role==='fiscal')return guilty?20:0;if(role==='abogado')return guilty?0:20;if(role==='acusado')return guilty?0:30;return 0;}
  async function submitTribunalVote(){if(!state.roomRef||state.tribunalVoteInFlight)return;const game=state.lastRoomData?.game||{};if(!isTribunalVoter(game)){miniNotice('tribunalVotingStatus','Tu rol no participa en la votación.','error');return;}const target=String(state.tribunalSelectedVote||'');if(!target||!game.activePlayers?.[target]){miniNotice('tribunalVotingStatus','Selecciona un jugador.','error');return;}state.tribunalVoteInFlight=true;try{const result=await state.roomRef.child('game/tribunal/votes/'+state.playerId).transaction(current=>current||target);if(result.committed){const next={...state.lastRoomData,game:{...state.lastRoomData.game,tribunal:{...state.lastRoomData.game.tribunal,votes:{...(state.lastRoomData.game.tribunal?.votes||{}),[state.playerId]:result.snapshot.val()}}}};state.lastRoomData=next;renderTribunalVoting(next);void maybeFinalizeTribunalVoting(next);}else miniNotice('tribunalVotingStatus','Tu voto ya fue registrado.','error');}catch(error){console.error('[TRIBUNAL VOTE]',error);miniNotice('tribunalVotingStatus','No se pudo registrar tu voto. Revisa la conexión.','error');}finally{state.tribunalVoteInFlight=false;}}
  async function maybeFinalizeTribunalVoting(data){const game=data?.game||{};if(!state.roomRef||state.mode!=='host'||game.phase!=='tribunalVoting'||!tribunalVoterComplete(game))return false;const result=await state.roomRef.child('game').transaction(current=>{if(!current||current.phase!=='tribunalVoting'||!tribunalVoterComplete(current))return;const votes=current.tribunal.votes||{},ids=tribunalActiveIds(current),counts={};ids.forEach(id=>counts[id]=0);Object.values(votes).forEach(target=>{if(Object.prototype.hasOwnProperty.call(counts,String(target)))counts[String(target)]++;});return {...current,phase:'tribunalResult',roundResults:{type:'tribunal',round:current.currentRound,caseId:current.tribunal.caseId,crime:current.tribunal.publicCase?.delito||'',accusedId:null,voteCounts:counts,guilty:null,verdict:null,votes},tribunal:{...tribunalPublicState(current.tribunal),estado:'revelando_resultado',revealDeadlineAt:serverNow()+TRIBUNAL_REVEAL_TIMEOUT_MS,roundPoints:{},scoredBy:{}}};});if(result.committed)handleMiniRoomSnapshot({...state.lastRoomData,game:result.snapshot.val()});return Boolean(result.committed);}
  async function ensureTribunalPersonalScore(data){
    const game=data?.game||{},assignment=tribunalPrivateAssignment(game),result=game.roundResults;
    if(!state.roomRef||game.phase!=='tribunalResult'||!assignment||!result||result.accusedId===null||result.accusedId===undefined||typeof result.guilty!=='boolean'||game.tribunal?.scoredBy?.[state.playerId])return false;
    const points=calcularPuntosTribunal(assignment.role,game.tribunal?.votes?.[state.playerId],result.accusedId,result.guilty);
    const currentScore=Number(game.scores?.[state.playerId])||0,updates={};updates[`rooms/${state.roomCode}/game/scores/${state.playerId}`]=currentScore+points;updates[`rooms/${state.roomCode}/game/tribunal/scoredBy/${state.playerId}`]=true;updates[`rooms/${state.roomCode}/game/tribunal/roundPoints/${state.playerId}`]=points;
    try{await withTimeout(db.ref().update(updates),7000,'tribunal-score-update-timeout');const nextGame={...game,scores:{...(game.scores||{}),[state.playerId]:currentScore+points},tribunal:{...game.tribunal,scoredBy:{...(game.tribunal?.scoredBy||{}),[state.playerId]:true},roundPoints:{...(game.tribunal?.roundPoints||{}),[state.playerId]:points}}};handleMiniRoomSnapshot({...state.lastRoomData,game:nextGame});return true;}catch(error){console.warn('[TRIBUNAL SCORE] write failed',error);return false;}
  }
  function tribunalRevealComplete(game,reveals=state.tribunalRevealData){const ids=tribunalActiveIds(game),token=String(game?.roundToken||'');if(ids.length<5||!ids.every(id=>{const entry=reveals?.[id]||{};return String(entry.playerId||'')===id&&String(entry.roundToken||'')===token&&['juez','fiscal','abogado','acusado','jurado'].includes(String(entry.role||''));}))return false;const roles=ids.map(id=>String(reveals[id].role||''));return roles.filter(role=>role==='juez').length===1&&roles.filter(role=>role==='fiscal').length===1&&roles.filter(role=>role==='abogado').length===1&&roles.filter(role=>role==='acusado').length===1&&roles.filter(role=>role==='jurado').length===ids.length-4;}
  function renderTribunalResult(data){
    const game=data.game||{};
    const result=game.roundResults||{};
    const names=game.playerNames||{};
    const players=miniPlayers(data);
    const reveals=state.tribunalRevealData||{};
    const complete=tribunalRevealComplete(game,reveals);
    const revealFinished=complete||Boolean(result.revealTimedOut);
    setText('tribunalResultRoundLabel','CASO '+game.currentRound+' DE '+game.totalRounds);

    const accused=$('tribunalResultAccused');
    if(accused){
      accused.innerHTML=result.accusedId
        ? '🚨 EL ACUSADO ERA:<br><strong>'+escapeHtml(cleanUiText(names[result.accusedId]||miniPlayerName(data,result.accusedId)))+'</strong>'
        : result.revealTimedOut?'⚠️ REVELACIÓN INCOMPLETA':'🔎 REVELANDO LOS ROLES…';
    }

    const verdict=$('tribunalResultVerdict');
    if(verdict){
      const hasVerdict=typeof result.guilty==='boolean';
      verdict.className='tribunal-result-verdict '+(hasVerdict?(result.guilty?'guilty':'acquitted'): '');
      verdict.textContent=hasVerdict
        ? (result.guilty?'⚖️ CULPABLE':'⚖️ ABSUELTO')
        : result.revealTimedOut?'⚠️ REVELACIÓN INCOMPLETA':'⏳ ESPERANDO LA REVELACIÓN';
    }

    const table=$('tribunalResultScores');
    if(table){
      table.innerHTML=players.map(player=>{
        const reveal=reveals[player.id]||{};
        const role=reveal.role||'';
        const roundPoints=((game.tribunal||{}).roundPoints||{})[player.id]||0;
        return '<div class="tribunal-score-row"><strong>'+escapeHtml(cleanUiText(player.name))+'</strong><span>'+escapeHtml(role?tribunalRoleLabel(role):'🔒 ROL PENDIENTE')+'</span><b>+'+Number(roundPoints)+' pts</b></div>';
      }).join('');
    }

    const next=$('tribunalNextRoundBtn');
    if(next){
      const last=Number(game.currentRound)>=Number(game.totalRounds);
      next.classList.toggle('hidden',last);
      next.disabled=!isTribunalJudge()||!revealFinished||(!result.revealTimedOut&&typeof result.guilty!=='boolean');
    }

    const finish=$('tribunalFinishBtn');
    if(finish)finish.disabled=!isTribunalJudge()||!revealFinished||(!result.revealTimedOut&&typeof result.guilty!=='boolean');
    setText('tribunalResultStatus',!revealFinished?'Esperando la revelación privada de todos los jugadores…':result.revealTimedOut?'El tiempo de revelación terminó; puedes continuar.':isTribunalJudge()?'El Juez puede continuar al siguiente caso.':'Esperando al Juez…');
    if(complete)void ensureTribunalPersonalScore(data);
  }
  function renderTribunalFinalResult(data){const game=data.game||{},rows=Object.keys(game.scores||{}).map(id=>({id,name:cleanUiText(game.playerNames?.[id]||miniPlayerName(data,id)),score:Number(game.scores[id])||0})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'es')),list=$('tribunalFinalScores');if(list)list.innerHTML=rows.map((row,index)=>'<div class="tribunal-score-row"><strong>'+(['🥇','🥈','🥉'][index]||((index+1)+'°'))+' '+escapeHtml(row.name)+'</strong><span>'+row.score+' puntos</span><b>'+row.score+' pts</b></div>').join('');}
  async function tribunalRoleReady(){if(!state.roomRef)return false;const result=await state.roomRef.child('game/tribunal/ready/'+state.playerId).transaction(current=>current===true?current:true);if(result.committed){const next={...state.lastRoomData,game:{...state.lastRoomData.game,tribunal:{...state.lastRoomData.game.tribunal,ready:{...(state.lastRoomData.game.tribunal?.ready||{}),[state.playerId]:true}}}};state.lastRoomData=next;void maybeStartTribunalPresentation(next);}return Boolean(result.committed);}
  function tribunalReadyComplete(game){const ids=Object.keys(game?.activePlayers||{}).filter(id=>game.activePlayers[id]===true);return ids.length>=5&&ids.every(id=>game.tribunal?.ready?.[id]===true);}
  async function maybeStartTribunalPresentation(data){const game=data?.game||{};if(!state.roomRef||state.mode!=='host'||game.phase!=='tribunalRoles'||!tribunalReadyComplete(game))return false;const result=await state.roomRef.child('game').transaction(current=>{if(!current||current.phase!=='tribunalRoles'||!tribunalReadyComplete(current))return;return {...current,phase:'tribunalPresentation',tribunal:{...tribunalPublicState(current.tribunal),estado:'presentacion_caso'}};});if(result.committed)handleMiniRoomSnapshot({...state.lastRoomData,game:result.snapshot.val()});return Boolean(result.committed);}
  async function advanceTribunalPresentation(){if(!state.roomRef||!isTribunalJudge())return false;try{await state.roomRef.update({'game/phase':'tribunalDebate','game/tribunal/estado':'debate'});return true;}catch(error){console.warn('[TRIBUNAL] presentation transition failed',error);return false;}}
  async function advanceTribunalDebate(){if(!state.roomRef||!isTribunalJudge())return false;const data=state.lastRoomData||{},game=data.game||{},assignment=tribunalPrivateAssignment(game),caso=assignment?.case||{},candidates=Object.keys(game.activePlayers||{}).filter(id=>id!==String(state.playerId)),text=Array.isArray(caso.evidenciasSorpresa)&&caso.evidenciasSorpresa.length?caso.evidenciasSorpresa[Math.floor(Math.random()*caso.evidenciasSorpresa.length)]:'';if(!candidates.length||!text)return false;const recipient=candidates[Math.floor(Math.random()*candidates.length)],updates={};updates['rooms/'+state.roomCode+'/game/phase']='tribunalSurprise';updates['rooms/'+state.roomCode+'/game/tribunal/estado']='evidencia_sorpresa';updates['rooms/'+state.roomCode+'/game/tribunal/surpriseDelivered']=true;updates['privateAssignments/'+state.roomCode+'/'+recipient+'/surprise']={round:game.currentRound,roundToken:game.roundToken,text};try{await withTimeout(db.ref().update(updates),7000,'tribunal-debate-transition-timeout');return true;}catch(error){console.warn('[TRIBUNAL] debate transition failed',error);return false;}}
  async function advanceTribunalSurprise(){if(!state.roomRef||!isTribunalJudge())return false;try{await state.roomRef.update({'game/phase':'tribunalFinal','game/tribunal/estado':'final_juicio'});return true;}catch(error){console.warn('[TRIBUNAL] surprise transition failed',error);return false;}}
  async function advanceTribunalFinal(){if(!state.roomRef||!isTribunalJudge())return false;try{await state.roomRef.update({'game/phase':'tribunalVoting','game/tribunal/estado':'votacion','game/tribunal/votes':{}});return true;}catch(error){console.warn('[TRIBUNAL] voting transition failed',error);return false;}}
  async function nextTribunalRound(){if(!state.roomRef||!isTribunalJudge())return false;const data=(await withTimeout(state.roomRef.once('value'),7000,'tribunal-next-read-timeout')).val(),game=data?.game||{};if(game.phase!=='tribunalResult')return false;const revealSnapshot=await withTimeout(db.ref(tribunalRevealPath(game.roundToken)).once('value'),7000,'tribunal-reveal-read-timeout'),reveals=revealSnapshot.val()||{};state.tribunalRevealData=reveals;const revealTimedOut=Boolean(game.roundResults?.revealTimedOut);if((!tribunalRevealComplete(game,reveals)&&!revealTimedOut)||(!revealTimedOut&&typeof game.roundResults?.guilty!=='boolean')){miniNotice('tribunalResultStatus','Esperando a que todos los roles sean revelados.','error');renderTribunalResult({...data,game});return false;}if(Number(game.currentRound)>=Number(game.totalRounds)){try{await withTimeout(state.roomRef.update({'game/phase':'tribunalFinalResult','game/tribunal/estado':'resultado_final'}),7000,'tribunal-final-transition-timeout');return true;}catch(error){console.warn('[TRIBUNAL] final transition failed',error);return false;}}return startTribunalRound(data,miniPlayers(data));}
  async function transitionAgePreparationToReveal(data){
    if(!state.roomRef||state.mode!=='host')return false;
    const game=data?.game||{},expectedRound=Number(game.currentRound),expectedToken=String(game.roundToken||''),expectedPrepEndsAt=Number(game.prepEndsAt);
    const result=await state.roomRef.child('game').transaction(current=>{
      const prepEndsAt=Number(current?.prepEndsAt);
      if(!current||current.phase!=='agePreparation'||Number(current.currentRound)!==expectedRound||String(current.roundToken||'')!==expectedToken||prepEndsAt!==expectedPrepEndsAt||!Number.isFinite(prepEndsAt)||serverNow()<prepEndsAt)return;
      const revealAt=serverNow(),ageTargetsByPlayer=ensureAgeTargets(current,data);
      return {...current,phase:'ageReveal',revealAt,revealEndsAt:revealAt+AGE_REVEAL_DURATION_MS,ageDeadlineAt:null,ageTargetsByPlayer};
    });
    if(result.committed)handleMiniRoomSnapshot({...state.lastRoomData,game:result.snapshot.val()});
    return Boolean(result.committed);
  }
  async function repairAgeTargets(data){
    if(!state.roomRef||state.mode!=='host')return false;
    const result=await state.roomRef.child('game').transaction(current=>{
      if(!current||String(current.gameType||data?.game?.gameType||data?.gameType||'')!==GAME_TYPES.AGE||!['ageReveal','agePlaying'].includes(current.phase))return;
      const nextTargets=ensureAgeTargets(current,data),ids=Object.keys(current.activePlayers||{}).filter(id=>current.activePlayers[id]===true),currentTargets=current.ageTargetsByPlayer||{};
      const unchanged=ids.every(id=>isValidAgeTarget(currentTargets[id])&&Number(currentTargets[id])===Number(nextTargets[id]));
      return unchanged?undefined:{...current,ageTargetsByPlayer:nextTargets};
    });
    if(result.committed)handleMiniRoomSnapshot({...state.lastRoomData,game:result.snapshot.val()});
    return Boolean(result.committed);
  }
  async function transitionMiniRevealToPlaying(data){
    if(!state.roomRef||state.mode!=='host')return false;
    const game=data?.game||{},type=miniRoomType(data),phase=type===GAME_TYPES.STOP?'stopReveal':'ageReveal',nextPhase=type===GAME_TYPES.STOP?'stopPlaying':'agePlaying';
    const result=await state.roomRef.child('game').transaction(current=>{
      const ends=Number(current?.revealEndsAt);
      if(!current||current.phase!==phase||current.roundToken!==game.roundToken||!Number.isFinite(ends)||serverNow()<ends)return;
      const now=serverNow();
      if(type===GAME_TYPES.AGE){return {...current,phase:nextPhase,revealEndsAt:null,ageDeadlineAt:null,roundEndsAt:null,ageEstimates:{},ageSubmitted:{},stopAt:null,stopResponses:null,stopJudgments:null};}
      return {...current,phase:nextPhase,revealEndsAt:null,roundEndsAt:now+Number(data.settings?.stop?.timeSeconds||60)*1000,ageDeadlineAt:null,ageEstimates:null,ageSubmitted:null,stopAt:null,stopResponses:{},stopJudgments:null,stopVotingPlayers:null,stopVotes:null};
    });
    if(result.committed)handleMiniRoomSnapshot({...state.lastRoomData,game:result.snapshot.val()});
    return Boolean(result.committed);
  }
  function renderAgePreparation(data,remainingSeconds){
    const game=state.ageLocal||data?.game||{},local=Boolean(state.ageLocal),player=local?game.players?.[game.playerIndex]:null,name=String(player?.name||'Jugador').trim(),upper=name.toUpperCase(),seconds=Math.max(0,Number.isFinite(Number(remainingSeconds))?Number(remainingSeconds):Math.ceil(Math.max(0,Number(game.prepEndsAt)-serverNow())/1000)),visual=$('agePrepVisual'),instruction=$('agePrepInstruction'),detail=$('agePrepInstructionDetail');
    setText('agePreparationRoundLabel',`RONDA ${local?game.round:game.currentRound} DE ${game.totalRounds}${local?' · '+upper:''}`);setText('agePrepCountdown',seconds);
    if(local){if(visual)visual.dataset.mode='handoff';document.querySelector('#agePreparation .age-prep-lead')?.replaceChildren(document.createTextNode(`Pásale el celular a ${upper}.`));if(instruction)instruction.textContent=`LE TOCA A ${upper}`;if(detail)detail.textContent=`Pásale el celular a ${upper} · ${seconds} segundos`;document.querySelector('#agePreparation .age-prep-count-note')?.replaceChildren(document.createTextNode(`Cuando llegue a 0: ${upper}, NO MIRES LA PANTALLA · LOS DEMÁS PUEDEN MIRAR`));return;}
    document.querySelector('#agePreparation .age-prep-lead')?.replaceChildren(document.createTextNode('Cada jugador tiene una edad diferente. Sigue la indicación y no mires la pantalla hasta el reveal.'));document.querySelector('#agePreparation .age-prep-count-note')?.replaceChildren(document.createTextNode('La preparación termina en 0.'));
    if(!isAgeMobileExperience()){if(visual)visual.dataset.mode='desktop';setText('agePrepInstruction','PREPÁRATE');setText('agePrepInstructionDetail','La ronda comienza en breve.');return;}
    let mode='rotate',title='📱 GIRA TU CELULAR',copy='De vertical a horizontal.';
    if(seconds<=8&&seconds>=7){mode='brightness';title='☀️ SUBE EL BRILLO';copy='Solo es una indicación visual; no cambiaremos tu dispositivo.';}
    else if(seconds<=6&&seconds>=5){mode='horizontal';title='🔄 DÉJALO EN HORIZONTAL';copy='Mantén la pantalla en posición horizontal.';}
    else if(seconds<=4&&seconds>=3){mode='face';title='PON EL CELULAR FRENTE A TI';copy='Sin mirar la pantalla. La pantalla queda hacia los demás.';}
    else if(seconds<=2&&seconds>=1){mode='ready';title='🎂 PREPÁRATE...';copy='Tu edad aparecerá en el reveal.';}
    else if(seconds<=0){mode='ready';title='REVEAL';copy='Mostrando tu edad...';}
    if(visual)visual.dataset.mode=mode;if(instruction)instruction.textContent=title;if(detail)detail.textContent=copy;
  }
  function renderAgeReveal(data){
    if(state.ageLocal){const game=state.ageLocal,player=game.players?.[game.playerIndex],target=game.targets?.[player?.id],name=String(player?.name||'Jugador').trim(),upper=name.toUpperCase();setText('ageRevealRoundLabel',`RONDA ${game.round} DE ${game.totalRounds} · ${upper}`);setText('ageRevealInstruction',`${upper}, NO MIRES LA PANTALLA`);setText('ageRevealAudience','LOS DEMÁS PUEDEN MIRAR');$('ageRevealAudience')?.classList.remove('hidden');setText('ageRevealDataLabel',`${upper} TIENE`);setText('ageRevealNumber',isValidAgeTarget(target)?target:'—');setText('ageRevealUnit','AÑOS');$('ageRevealUnit')?.classList.remove('hidden');$('ageRevealCountdownLabel')?.classList.add('hidden');$('ageRevealCountdown')?.classList.add('hidden');const button=$('ageLocalRevealContinueBtn');button?.classList.remove('hidden');if(button)button.textContent=game.playerIndex>=game.players.length-1?'TERMINAR REVEAL':`SIGUIENTE JUGADOR · ${String(game.players?.[game.playerIndex+1]?.name||'SIGUIENTE').toUpperCase()}`;return;}
    $('ageLocalRevealContinueBtn')?.classList.add('hidden');$('ageRevealAudience')?.classList.add('hidden');setText('ageRevealInstruction','Esta es tu edad. Muéstrala a los demás.');setText('ageRevealDataLabel','TU EDAD');$('ageRevealUnit')?.classList.add('hidden');$('ageRevealCountdownLabel')?.classList.remove('hidden');$('ageRevealCountdown')?.classList.remove('hidden');setText('ageRevealCountdownLabel','REVEAL');const game=data.game||{},target=ageTargetForPlayer(game,data,state.playerId);setText('ageRevealRoundLabel',`RONDA ${game.currentRound} DE ${game.totalRounds}`);setText('ageRevealNumber',isValidAgeTarget(target)?target:'—');setText('ageRevealCountdown',Math.max(0,Math.ceil(Math.max(0,Number(game.revealEndsAt)-serverNow())/1000)));
  }
  function renderAgePlaying(data){
    if(state.ageLocal){
      const game=state.ageLocal,player=game.players?.[game.playerIndex],handoff=game.phase==='handoff',input=$('ageEstimateInput'),submit=$('ageSubmitBtn'),next=$('ageLocalHandoffBtn');setText('agePlayingRoundLabel',`RONDA ${game.round} DE ${game.totalRounds}`);setText('agePlayingTitle',handoff?'¡ESTIMACIÓN GUARDADA!':`ESTIMA LA EDAD · ${player?.name||'Jugador'}`);setText('agePlayingIntro',handoff?`Pasa el teléfono a ${game.players?.[game.playerIndex+1]?.name||'todos'}. La respuesta quedó oculta.`:'Escribe tu estimación sin que los demás vean la respuesta.');$('ageOnlineAgesPanel')?.classList.add('hidden');if(input){input.classList.toggle('hidden',handoff);input.disabled=handoff;input.value=handoff?'':String(input.value||'');}if(submit)submit.classList.toggle('hidden',handoff);if(next){next.classList.toggle('hidden',!handoff);next.textContent=game.playerIndex>=game.players.length-1?'VER RESULTADOS':`ENTREGAR A ${String(game.players?.[game.playerIndex+1]?.name||'SIGUIENTE').toUpperCase()}`;}setText('agePlayingStatus',handoff?'Respuesta guardada y oculta. Nadie puede volver atrás para verla.':'Turno privado de '+(player?.name||'Jugador')+'.');return;
    }
      const game=data.game||{},input=$('ageEstimateInput'),token=String(game.roundToken||''),submitted=Boolean(game.ageSubmitted?.[state.playerId]),value=game.ageEstimates?.[state.playerId];
    $('ageLocalHandoffBtn')?.classList.add('hidden');$('ageOnlineAgesPanel')?.classList.remove('hidden');setText('agePlayingTitle','¿Cuál es tu estimación?');setText('agePlayingIntro','Consulta las edades de los demás jugadores y escribe un entero entre 0 y 10.000. No hay límite de tiempo.');input?.classList.remove('hidden');
    if(state.ageEstimateRoundToken!==token){state.ageEstimateRoundToken=token;state.ageLocalEstimate='';}
    setText('agePlayingRoundLabel',`RONDA ${game.currentRound} DE ${game.totalRounds}`);
    const list=$('ageRoundAges'),ids=Object.keys(game.activePlayers||{}),ownId=ageCurrentPlayerId(data),players=normalizeRoomPlayers(data),byId=new Map(players.map(player=>[String(player.id),player])),visibleIds=ids.filter(id=>String(id)!==String(ownId));
    if(list)list.innerHTML=visibleIds.map((id,index)=>{const player=byId.get(String(id)),name=player?.name||game.playerNames?.[id]||`Jugador ${index+1}`,target=ageTargetForPlayer(game,data,id);return `<div class="age-round-age-row" role="listitem"><span class="age-round-age-name">👤 ${escapeHtml(cleanUiText(name))}</span><strong class="age-round-age-value">${isValidAgeTarget(target)?target:'—'} <small>años</small></strong></div>`;}).join('');
    if(input&&!input.matches(':focus'))input.value=value===undefined?(state.ageLocalEstimate||''):String(value);
    if(input)input.disabled=submitted||state.ageSubmitInFlight;
    const button=$('ageSubmitBtn');if(button){button.disabled=submitted||state.ageSubmitInFlight;button.textContent=submitted?'✓ ESTIMACIÓN ENVIADA':state.ageSubmitInFlight?'ENVIANDO…':'ENVIAR ESTIMACIÓN';}
    setText('agePlayingStatus',submitted?'Estimación enviada. Esperando al resto…':'Cada jugador envía una sola estimación.');
  }
  function confessionPlayers(data,game=data?.game||{}){const ids=confessionActiveIds(game),players=normalizeRoomPlayers(data),byId=new Map(players.map(player=>[String(player.id),player]));return ids.map(id=>({id,name:String(byId.get(String(id))?.name||game.playerNames?.[id]||id)})).filter(player=>!byId.has(String(player.id))||!byId.get(String(player.id))?.leftAt);}
  function confessionCurrent(game){return game?.confessions?.[String(game?.confessionCurrentId||'')]||null;}
  function renderConfessionsWriting(data){
    if(state.confessionsLocal){const game=state.confessionsLocal,writer=game.players?.[game.writingIndex],handoff=game.phase==='handoff',input=$('confessionInput'),submit=$('submitConfessionBtn'),next=$('confessionsLocalHandoffBtn');setText('confessionsWritingRoundLabel',`CONFESIÓN ${Math.min(game.writingIndex+1,game.players.length)} DE ${game.players.length}`);setText('confessionsWritingIntro',handoff?'Confesión guardada. Pasa el teléfono al siguiente jugador.':`Turno privado de ${writer?.name||'Jugador'}. Nadie verá lo anterior.`);input?.classList.toggle('hidden',handoff);if(input){input.disabled=handoff;input.value=handoff?'':String(input.value||'');}submit?.classList.toggle('hidden',handoff);next?.classList.toggle('hidden',!handoff);setText('confessionsWritingStatus',handoff?'✅ Confesión guardada y oculta.':'Escribe sin que los demás miren.');setText('confessionsWritingProgress',handoff?`Ahora le toca a ${game.players?.[game.writingIndex+1]?.name||'el siguiente jugador'}.`:`Turno de ${writer?.name||'Jugador'}.`);setText('confessionCharCount',`${String(input?.value||'').length}/${confessionsMaxLength}`);return;}
    $('confessionsLocalHandoffBtn')?.classList.add('hidden');$('confessionInput')?.classList.remove('hidden');setText('confessionsWritingIntro','Escribe algo que nadie del grupo sepa que hiciste.');const game=data?.game||{},players=confessionPlayers(data,game),submissions=game.confessionSubmissions||{},submitted=players.filter(player=>Boolean(submissions[player.id])).length,input=$('confessionInput'),button=$('submitConfessionBtn'),hasSubmitted=Boolean(submissions[state.playerId]);
    setText('confessionsWritingRoundLabel',`PREPARACIÓN · ${submitted} DE ${players.length}`);setText('confessionsWritingProgress',`${submitted} de ${players.length} confesiones enviadas. ${hasSubmitted?'Esperando al resto de los jugadores…':'Tu confesión todavía no ha sido enviada.'}`);setText('confessionsWritingStatus',hasSubmitted?'✅ ¡CONFESIÓN ENVIADA!':'');
    if(input){input.disabled=hasSubmitted;input.value=hasSubmitted?'':String(input.value||'');input.classList.toggle('submitted',hasSubmitted);}
    if(button){button.disabled=hasSubmitted;button.textContent=hasSubmitted?'✓ CONFESIÓN ENVIADA':'CONFESAR →';}
    setText('confessionCharCount',`${String(input?.value||'').length}/${confessionsMaxLength}`);
  }
  async function submitConfession(){
    if(state.confessionsLocal){submitConfessionLocal();return;}
    if(!state.roomRef||state.confessionSubmitInFlight)return;
    const input=$('confessionInput'),text=String(input?.value||'').trim();
    if(!text){miniNotice('confessionsWritingNotice','Escribe una confesión antes de continuar.','error');input?.focus();return;}
    if(text.length>confessionsMaxLength){miniNotice('confessionsWritingNotice',`La confesión no puede superar los ${confessionsMaxLength} caracteres.`,'error');return;}
    const playerId=String(state.playerId||'');if(!playerId)return;
    state.confessionSubmitInFlight=true;renderConfessionsWriting(state.lastRoomData||{game:{}});
    try{
      const confessionId=`c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`,submissionRef=state.roomRef.child(`game/confessionSubmissions/${playerId}`);
      const result=await submissionRef.transaction(current=>current||confessionId);
      if(!result.committed||String(result.snapshot.val()||'')!==confessionId){miniNotice('confessionsWritingNotice','La confesión ya fue enviada o la ronda terminó.','error');return;}
      try{await withTimeout(state.roomRef.child(`game/confessions/${confessionId}`).set({id:confessionId,text,authorId:playerId,used:false}),7000,'confession-write-timeout');}
      catch(error){await submissionRef.remove().catch(()=>{});throw error;}
      const nextData={...state.lastRoomData,game:{...state.lastRoomData.game,confessions:{...(state.lastRoomData.game.confessions||{}),[confessionId]:{id:confessionId,text,authorId:playerId,used:false}},confessionSubmissions:{...(state.lastRoomData.game.confessionSubmissions||{}),[playerId]:confessionId}}};state.lastRoomData=nextData;renderConfessionsWriting(nextData);void maybeStartConfessionVoting(nextData,nextData.game);
    }catch(error){console.warn('[CONFESSION SUBMIT] write failed',error);miniNotice('confessionsWritingNotice','No se pudo enviar. Revisa la conexión e inténtalo nuevamente.','error');}
    finally{state.confessionSubmitInFlight=false;if(state.lastRoomData?.game?.phase==='confessionsWriting')renderConfessionsWriting(state.lastRoomData);}
  }
  function confessionsSubmissionsComplete(data,game){const players=confessionPlayers(data,game);return players.length>=2&&players.every(player=>Boolean(game.confessionSubmissions?.[player.id]&&game.confessions?.[game.confessionSubmissions[player.id]]?.text));}
  async function maybeStartConfessionVoting(data,game){
    if(!state.roomRef||state.mode!=='host'||!confessionsSubmissionsComplete(data,game))return false;
    const result=await state.roomRef.child('game').transaction(current=>{
      if(!current||current.phase!=='confessionsWriting')return;
      const players=confessionPlayers(data,current),submissions=current.confessionSubmissions||{},ids=players.map(player=>String(submissions[player.id])).filter(id=>current.confessions?.[id]?.text),totalRounds=confessionsRoundCount(data.settings?.confessions?.roundsMode||'perPlayer',players.length),order=shuffleArray(ids).slice(0,totalRounds),firstId=order[0];
      if(players.length<2||order.length<1||order.length<totalRounds)return;
      return {...current,phase:'confessionsVoting',currentRound:1,round:1,totalRounds:order.length,confessionOrder:order,confessionIndex:0,confessionCurrentId:firstId,confessionVotes:{},roundResults:null,roundEndsAt:null,confessions:Object.fromEntries(Object.entries(current.confessions||{}).map(([id,confession])=>[id,{...confession,used:id===firstId}]))};
    });
    if(result.committed)handleMiniRoomSnapshot({...state.lastRoomData,game:result.snapshot.val()});
    return Boolean(result.committed);
  }
  function renderConfessionsVoting(data){
    if(state.confessionsLocal){const game=state.confessionsLocal,confession=game.confessions?.[game.order?.[game.index]],voters=game.players.filter(player=>player.id!==confession?.authorId),voter=voters[game.voterIndex],votes=game.votes?.[confession?.id]||{},selected=votes[voter?.id],list=$('confessionsVotingPlayers');setText('confessionsVotingRoundLabel',`CONFESIÓN #${game.index+1} DE ${game.order.length}`);setText('confessionsVotingText',confession?.text||'');setText('confessionsVotingTextHint',`Votación privada · turno de ${voter?.name||'Jugador'}`);if(list)list.innerHTML=game.players.map(player=>{const disabled=player.id===voter?.id||Boolean(selected),isSelected=selected===player.id;return `<button class="confessions-vote-choice${isSelected?' selected':''}${disabled&&!isSelected?' self':''}" type="button" data-local-confession-target="${escapeHtml(player.id)}" ${disabled?'disabled':''} aria-pressed="${isSelected?'true':'false'}"><span class="confessions-player-avatar">${escapeHtml(confessionInitial(player.name))}</span><span>${escapeHtml(player.name)}</span>${isSelected?'<small>✓ ELECCIÓN</small>':''}</button>`;}).join('');if(list)list.querySelectorAll('[data-local-confession-target]').forEach(button=>button.addEventListener('click',()=>submitConfessionVote(button.dataset.localConfessionTarget)));const registered=Object.keys(votes).length;setText('confessionsVotingStatus',selected?`✓ Voto registrado. ${registered} de ${voters.length} votos.`:`Turno de ${voter?.name||'Jugador'}. Elige quién escribió esto.`);return;}
    const game=data?.game||{},confession=confessionCurrent(game),players=confessionPlayers(data,game),votes=game.confessionVotes||{},ownId=String(state.playerId||''),ownVote=String(votes[ownId]||''),list=$('confessionsVotingPlayers');
    setText('confessionsVotingRoundLabel',`CONFESIÓN #${Number(game.confessionIndex||0)+1} DE ${game.totalRounds||game.confessionOrder?.length||1}`);setText('confessionsVotingText',confession?.text||'Preparando confesión…');setText('confessionsVotingTextHint','El autor está oculto hasta el final de la votación.');
    const registered=players.filter(player=>Boolean(votes[player.id])).length,statusElement=$('confessionsVotingStatus');if(statusElement){statusElement.className='confessions-vote-status';statusElement.textContent=ownVote?`✓ Voto registrado. ${registered} de ${players.length} votos.`:`${registered} de ${players.length} votos. Elige una persona.`;}
    if(!list)return;
    list.innerHTML=players.map(player=>{const id=String(player.id),self=id===ownId,selected=ownVote===id,label=cleanUiText(player.name),disabled=self||Boolean(ownVote),classes=`confessions-vote-choice${selected?' selected':''}${self?' self':''}`,detail=self?'TU NOMBRE · NO PUEDES VOTAR':selected?'✓ ELECCIÓN':'';return `<button class="${classes}" type="button" role="listitem" data-confession-target="${escapeHtml(id)}" ${disabled?'disabled':''} aria-pressed="${selected?'true':'false'}"><span class="confessions-player-avatar">${escapeHtml(confessionInitial(label))}</span><span>${escapeHtml(label)}</span>${detail?`<small>${escapeHtml(detail)}</small>`:''}</button>`;}).join('');
    list.querySelectorAll('[data-confession-target]').forEach(button=>button.addEventListener('click',()=>void submitConfessionVote(button.dataset.confessionTarget)));
  }
  async function submitConfessionVote(targetId){
    if(state.confessionsLocal){const game=state.confessionsLocal,confession=game.confessions?.[game.order?.[game.index]],voters=game.players.filter(player=>player.id!==confession?.authorId),voter=voters[game.voterIndex],target=String(targetId||'');if(!confession||!voter||!target||target===voter.id)return;game.votes[confession.id]={...(game.votes[confession.id]||{}),[voter.id]:target};if(voters.every(player=>game.votes[confession.id]?.[player.id])){finalizeConfessionsLocalRound();}else{game.voterIndex++;state.lastRoomData=confessionsLocalSnapshot();renderConfessionsVoting(state.lastRoomData);}return;}
    if(!state.roomRef||state.confessionVoteInFlight)return;
    const ownId=String(state.playerId||''),target=String(targetId||''),game=state.lastRoomData?.game||{},players=confessionPlayers(state.lastRoomData||{},game),ids=players.map(player=>String(player.id));
    if(!ids.includes(ownId)||!ids.includes(target)||ownId===target){if(ownId===target)miniNotice('confessionsVotingStatus','No puedes votar por ti mismo.','error');return;}
    if(game.confessionVotes?.[ownId])return;
    state.confessionVoteInFlight=true;renderConfessionsVoting(state.lastRoomData||{});
    try{
      const voteRef=state.roomRef.child(`game/confessionVotes/${ownId}`),result=await voteRef.transaction(current=>current||target);
      if(result.committed&&String(result.snapshot.val()||'')===target){const nextData={...state.lastRoomData,game:{...state.lastRoomData.game,confessionVotes:{...(state.lastRoomData.game.confessionVotes||{}),[ownId]:target}}};state.lastRoomData=nextData;renderConfessionsVoting(nextData);void maybeFinalizeConfessionVoting(nextData,nextData.game);}
      else miniNotice('confessionsVotingStatus','La votación ya terminó o tu voto ya estaba registrado.','error');
    }catch(error){console.warn('[CONFESSION VOTE] write failed',error);miniNotice('confessionsVotingStatus','No se pudo registrar tu voto. Revisa la conexión.','error');}
    finally{state.confessionVoteInFlight=false;if(state.lastRoomData?.game?.phase==='confessionsVoting')renderConfessionsVoting(state.lastRoomData);}
  }
  function confessionVotesComplete(game){const ids=confessionActiveIds(game),votes=game?.confessionVotes||{};return ids.length>=2&&ids.every(id=>ids.includes(String(votes[id]||''))&&String(votes[id])!==String(id));}
  async function maybeFinalizeConfessionVoting(data,game){if(!state.roomRef||state.mode!=='host'||game?.phase!=='confessionsVoting'||!confessionVotesComplete(game))return false;return finalizeConfessionVoting();}
  async function finalizeConfessionVoting(){
    if(!state.roomRef||state.mode!=='host')return false;
    const result=await state.roomRef.child('game').transaction(game=>{
      if(!game||game.phase!=='confessionsVoting')return;
      const ids=confessionActiveIds(game),votes=game.confessionVotes||{},confession=confessionCurrent(game);if(ids.length<2||!confession?.authorId)return;if(!confessionVotesComplete(game))return;
      const names=game.playerNames||{},counts={};ids.forEach(id=>{counts[id]=0;});ids.forEach(voterId=>{const target=String(votes[voterId]||'');if(Object.prototype.hasOwnProperty.call(counts,target))counts[target]++;});
      const correctVoters=ids.filter(id=>String(id)!==String(confession.authorId)&&String(votes[id]||'')===String(confession.authorId)),correctCount=correctVoters.length,points={};ids.forEach(id=>{points[id]=correctVoters.includes(id)?(correctCount===1?3:2):0;});if(correctCount===0&&ids.includes(String(confession.authorId)))points[String(confession.authorId)]=3;
      const voteCounts=ids.map(id=>({playerId:id,name:String(names[id]||id),votes:Number(counts[id])||0})).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name,'es')),playerOutcomes=ids.map(id=>({playerId:id,name:String(names[id]||id),isAuthor:String(id)===String(confession.authorId),correct:correctVoters.includes(id),points:Number(points[id])||0})),scores=miniScores(game,ids.map(id=>({id,name:names[id]||id})));ids.forEach(id=>{scores[id]=(Number(scores[id])||0)+(Number(points[id])||0);});
      return {...game,phase:'confessionsResults',roundEndsAt:serverNow()+CONFESSION_RESULTS_DURATION_MS,roundResults:{type:'confessions',round:game.currentRound,confessionId:confession.id,text:confession.text,authorId:String(confession.authorId),voteCounts,votes,correctVoters,correctCount,playerOutcomes,points,completedAt:firebase.database.ServerValue.TIMESTAMP},scores};
    });
    if(result.committed)handleMiniRoomSnapshot({...state.lastRoomData,game:result.snapshot.val()});
    return Boolean(result.committed);
  }
  function renderConfessionsResults(data){
    if(state.confessionsLocal){const game=state.confessionsLocal,result=game.roundResults||{},authorName=game.players?.find(player=>player.id===result.authorId)?.name||'—',localNext=$('confessionsLocalNextBtn');setText('confessionsResultsRoundLabel',`CONFESIÓN #${game.index+1} DE ${game.order.length}`);setText('confessionsResultText',result.text||'');setText('confessionsResultAuthorAvatar',confessionInitial(authorName));setText('confessionsResultAuthor',authorName);const list=$('confessionsResultVotes');if(list)list.innerHTML=(result.voteCounts||[]).map(row=>`<div class="confessions-vote-row${row.playerId===result.authorId?' author':''}"><span class="confessions-player-avatar">${escapeHtml(confessionInitial(row.name))}</span><span class="confessions-vote-row-name">${escapeHtml(row.name)}${row.playerId===result.authorId?' · AUTOR':''}</span><span class="confessions-vote-count">${Number(row.votes)||0} ${Number(row.votes)===1?'voto':'votos'}</span></div>`).join('');setText('confessionsResultOutcome',result.correctCount?'🎯 El grupo descubrió al autor.':'🤫 Nadie descubrió al autor.');setText('confessionsResultPoints','Marcador actualizado.');setText('confessionsResultStatus','Pulsa para ver el marcador.');localNext?.classList.remove('hidden');return;}
    $('confessionsLocalNextBtn')?.classList.add('hidden');const game=data?.game||{},result=game.roundResults||{},authorName=miniPlayerName(data,result.authorId),outcome=Array.isArray(result.playerOutcomes)?result.playerOutcomes.find(row=>String(row.playerId)===String(state.playerId)):null,list=$('confessionsResultVotes');
    setText('confessionsResultsRoundLabel',`CONFESIÓN #${Number(game.confessionIndex||0)+1} DE ${game.totalRounds||1}`);setText('confessionsResultText',result.text||'');setText('confessionsResultAuthorAvatar',confessionInitial(authorName));setText('confessionsResultAuthor',authorName);
    if(list)list.innerHTML=(Array.isArray(result.voteCounts)?result.voteCounts:[]).map(row=>`<div class="confessions-vote-row${String(row.playerId)===String(result.authorId)?' author':''}"><span class="confessions-player-avatar">${escapeHtml(confessionInitial(row.name))}</span><span class="confessions-vote-row-name">${escapeHtml(cleanUiText(row.name))}${String(row.playerId)===String(result.authorId)?' · AUTOR':''}</span><span class="confessions-vote-count">${Number(row.votes)||0} ${Number(row.votes)===1?'voto':'votos'}</span></div>`).join('');
    const correctCount=Number(result.correctCount)||0;if(!outcome){setText('confessionsResultOutcome','');setText('confessionsResultPoints','');}else if(outcome.isAuthor){setText('confessionsResultOutcome','🤫 ¡ESA ERA TU CONFESIÓN!');setText('confessionsResultPoints',outcome.points?`+${outcome.points} puntos`:'Sin puntos por votar tu propia confesión.');}else if(outcome.correct){setText('confessionsResultOutcome',correctCount===1?'🎯 ¡ACERTASTE! · Fuiste el único':'🎯 ¡ACERTASTE!');setText('confessionsResultPoints',`+${Number(outcome.points)||0} puntos`);}else{setText('confessionsResultOutcome','😭 Te fuiste por cualquier lado.');setText('confessionsResultPoints','+0 puntos');}
    const outcomeElement=$('confessionsResultOutcome');if(outcomeElement)outcomeElement.className=`confessions-outcome ${outcome?.isAuthor?'author':outcome?.correct?'correct':'wrong'}`;setText('confessionsResultStatus',correctCount===0?'😱 ¡NADIE LO DESCUBRIÓ!':'Los votos ya están cerrados. Siguiente: marcador.');
  }
  async function transitionConfessionResultsToScoreboard(data){
    if(!state.roomRef||state.mode!=='host')return false;const game=data?.game||{},round=Number(game.currentRound),token=String(game.roundToken||''),ends=Number(game.roundEndsAt);const result=await state.roomRef.child('game').transaction(current=>{if(!current||current.phase!=='confessionsResults'||Number(current.currentRound)!==round||String(current.roundToken||'')!==token||Number(current.roundEndsAt)!==ends||!Number.isFinite(ends)||serverNow()<ends)return;return {...current,phase:'confessionsScoreboard',roundEndsAt:serverNow()+CONFESSION_SCOREBOARD_DURATION_MS};});if(result.committed)handleMiniRoomSnapshot({...state.lastRoomData,game:result.snapshot.val()});return Boolean(result.committed);
  }
  function renderConfessionsScoreboard(data){
    if(state.confessionsLocal){const game=state.confessionsLocal,rows=game.players.map(player=>({name:player.name,score:Number(game.scores[player.id])||0})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'es'));const list=$('confessionsScoreboardList');setText('confessionsScoreboardRoundLabel',`MARCADOR · RONDA ${game.index+1} DE ${game.order.length}`);if(list)list.innerHTML=rows.map((row,index)=>`<div class="confessions-score-row"><span class="confessions-score-place">${index<3?['🥇','🥈','🥉'][index]:`${index+1}°`}</span><span class="confessions-player-avatar">${escapeHtml(confessionInitial(row.name))}</span><span class="confessions-score-name">${escapeHtml(row.name)}</span><span class="confessions-score-points">${row.score} pts</span></div>`).join('');setText('confessionsScoreboardStatus',game.index>=game.order.length-1?'Última confesión completada.':'La siguiente confesión está lista.');const button=$('confessionsLocalScoreboardNextBtn');button?.classList.remove('hidden');if(button)button.textContent=game.index>=game.order.length-1?'VER RESULTADOS FINALES':'SIGUIENTE CONFESIÓN';return;}
    $('confessionsLocalScoreboardNextBtn')?.classList.add('hidden');const game=data?.game||{},players=confessionPlayers(data,game),scores=miniScores(game,players),rows=players.map(player=>({id:player.id,name:player.name,score:Number(scores[player.id])||0})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'es'));let previousScore=null,rank=0;const list=$('confessionsScoreboardList');setText('confessionsScoreboardRoundLabel',`MARCADOR · RONDA ${game.currentRound} DE ${game.totalRounds}`);if(list)list.innerHTML=rows.map((row,index)=>{if(row.score!==previousScore)rank=index+1;previousScore=row.score;const medal=rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':`${rank}°`;return `<div class="confessions-score-row"><span class="confessions-score-place">${medal}</span><span class="confessions-player-avatar">${escapeHtml(confessionInitial(row.name))}</span><span class="confessions-score-name">${escapeHtml(cleanUiText(row.name))}</span><span class="confessions-score-points">${row.score} pts</span></div>`;}).join('');setText('confessionsScoreboardStatus',Number(game.currentRound)>=Number(game.totalRounds)?'Última confesión completada. Preparando resultados finales…':'Siguiente confesión en breve…');
  }
  async function transitionConfessionScoreboard(data){
    if(!state.roomRef||state.mode!=='host')return false;const game=data?.game||{},round=Number(game.currentRound),token=String(game.roundToken||''),ends=Number(game.roundEndsAt);const result=await state.roomRef.child('game').transaction(current=>{if(!current||current.phase!=='confessionsScoreboard'||Number(current.currentRound)!==round||String(current.roundToken||'')!==token||Number(current.roundEndsAt)!==ends||!Number.isFinite(ends)||serverNow()<ends)return;if(round>=Number(current.totalRounds))return {...current,phase:'finished',roundEndsAt:null};const nextIndex=Number(current.confessionIndex||0)+1,nextId=current.confessionOrder?.[nextIndex];if(!nextId)return {...current,phase:'finished',roundEndsAt:null};const nextRound=round+1;return {...current,phase:'confessionsVoting',round:nextRound,currentRound:nextRound,roundToken:miniToken(GAME_TYPES.CONFESSIONS,nextRound),confessionIndex:nextIndex,confessionCurrentId:String(nextId),confessionVotes:{},roundResults:null,roundEndsAt:null,confessions:{...current.confessions,[nextId]:{...current.confessions[nextId],used:true}}};});if(result.committed)handleMiniRoomSnapshot({...state.lastRoomData,game:result.snapshot.val()});return Boolean(result.committed);
  }
  function renderStopVotingResults(data){
    const game=data.game||{},result=game.roundResults||{},rows=Array.isArray(result.standings)?result.standings:[],list=$('miniResultsList');
    setText('miniResultsSummary',`Letra: ${result.letter||game.stopLetter||'—'} · La mayoría valida cada respuesta. STOP: ${result.stopByName||'tiempo agotado'}`);
    if(!list)return;
    list.innerHTML=rows.map(row=>{
      const answers=Array.isArray(row.answers)?row.answers:[];
      return `<div class="stop-result-card"><div class="stop-result-head"><span class="stop-result-name">${escapeHtml(row.name||miniPlayerName(data,row.playerId))}</span><span class="stop-result-total">${Number(row.points)||0} puntos</span></div><div class="stop-result-answer-list">${answers.map(answer=>{const hasAnswer=Boolean(String(answer.answer||'').trim()),option=whoamiVoteOption(answer.outcome),outcome=option||whoamiVoteOption('invalid'),voteCounts=answer.voteCounts||{},votes=answer.votes||{},repeat=answer.repeated?' · REPETIDA':'';return `<div class="stop-result-answer"><div class="stop-result-answer-main"><strong>${escapeHtml(answer.category||'Categoría')}:</strong> ${hasAnswer?escapeHtml(answer.answer):'Sin respuesta'}</div><div class="stop-result-answer-outcome ${outcome.className}">${hasAnswer?outcome.symbol+' '+outcome.label:'✕ SIN RESPUESTA'} · +${Number(answer.points)||0}${repeat}</div><div class="stop-result-answer-votes"><span class="valid"><b>✓ Sí (${Number(voteCounts.valid)||0}):</b> ${whoamiVoterNames(votes.valid||[],data,game)}</span><br><span class="half"><b>〰️ Medio (${Number(voteCounts.half)||0}):</b> ${whoamiVoterNames(votes.half||[],data,game)}</span><br><span class="invalid"><b>✕ No (${Number(voteCounts.invalid)||0}):</b> ${whoamiVoterNames(votes.invalid||[],data,game)}</span></div></div>`;}).join('')}</div></div>`;
    }).join('');
  }
  function renderMiniResults(data,type){
    const game=data.game||{},result=game.roundResults||{},rows=Array.isArray(result.standings)?result.standings:[];setText('miniResultsTitle','RESULTADO DE LA RONDA');setText('miniResultsRoundLabel',`RONDA ${game.currentRound} DE ${game.totalRounds}`);
    const list=$('miniResultsList');
    if(type===GAME_TYPES.AGE){
      setText('miniResultsSummary','Cada jugador se compara con su propia edad. La distancia menor obtiene más puntos.');
      if(list)list.innerHTML=rows.map(row=>{const rank=Number(row.rank)||0,medal=rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':`${rank}°`,target=isValidAgeTarget(row.targetAge)?Number(row.targetAge):null,hasEstimate=isValidAgeTarget(row.estimate),hasDistance=isValidAgeTarget(row.distance),estimate=hasEstimate?Number(row.estimate):null,distance=hasDistance?Number(row.distance):null,accumulated=Number(game.scores?.[row.playerId])||0,detail=`Edad: ${target===null?'—':target} · Estimó: ${hasEstimate?estimate:'—'} · Diferencia: ${hasDistance?distance:'—'}`;return `<div class="mini-score-row age-result-row${row.tie?' is-tie':''}"><span class="mini-score-place">${medal}</span><div class="age-result-main"><strong>${escapeHtml(row.name||miniPlayerName(data,row.playerId))}</strong><span class="age-result-detail">${detail}${row.tie?' · EMPATE':''}</span></div><span class="age-result-points">+${Number(row.points)||0}<small>Acumulado: ${accumulated}</small></span></div>`;}).join('');
    }else if(result.type==='stopVoting'){
      renderStopVotingResults(data);
    }else{
      setText('miniResultsSummary',`Letra: ${result.letter||game.stopLetter||'—'} · STOP: ${result.stopByName||'tiempo agotado'}`);
      if(list)list.innerHTML=rows.map((row,index)=>{const accumulated=Number(game.scores?.[row.playerId])||0,detail=`+${Number(row.points)||0} en ronda · acumulado ${accumulated}`;return `<div class="mini-score-row"><span>${row.tie?'EMPATE':' '+(index+1)+'°'}</span><strong>${escapeHtml(row.name||miniPlayerName(data,row.playerId))}</strong><span>${detail}</span></div>`;}).join('');
    }
    const host=isHost(data),last=Number(game.currentRound)>=Number(game.totalRounds),next=$('miniNextRoundBtn'),canAdvance=type===GAME_TYPES.AGE||host;if(next){next.classList.toggle('hidden',!canAdvance);next.disabled=false;next.textContent=last?'VER RESULTADOS FINALES':'SIGUIENTE RONDA';}setText('miniResultsStatus',type===GAME_TYPES.AGE?'Cualquier jugador puede iniciar la siguiente ronda.':host?'Continúa cuando todos hayan visto el resultado.':'Esperando al anfitrión…');
  }
  function whatWouldYouDoPlayers(data){return Object.keys(data?.game?.activePlayers||{}).filter(id=>data.game.activePlayers[id]===true).map(id=>String(id));}
  function whatWouldYouDoQuestionFor(game){
    const stored=game?.whatWouldYouDo||{},fromCatalog=whatWouldYouDoGame.getQuestionById(stored.questionId);
    return fromCatalog||{id:stored.questionId,category:stored.category,optionA:stored.optionA,optionB:stored.optionB};
  }
  function whatWouldYouDoVotesComplete(game){
    const ids=whatWouldYouDoPlayers({game});return ids.length>=2&&ids.every(id=>game.whatWouldYouDo?.votes?.[id]==='A'||game.whatWouldYouDo?.votes?.[id]==='B');
  }
  async function startWhatWouldYouDoRound(data,players=miniPlayers(data)){
    if(!state.roomRef||players.length<2)return false;
    const config=data.settings?.whatWouldYouDo||defaultWhatWouldYouDoConfig(),pool=validWhatWouldYouDoQuestions(config.categories),game=data.game||{},used=Array.isArray(game.whatWouldYouDo?.usedQuestionIds)?game.whatWouldYouDo.usedQuestionIds.map(String):[],question=chooseWhatWouldYouDoQuestion(config.categories,used,game.whatWouldYouDo?.questionId||''),round=Number(game.currentRound||0)+1,totalRounds=Math.min(20,Math.max(1,Number(config.totalRounds)||3));
    if(!pool.length||!question){notice('No hay preguntas disponibles para las categorías seleccionadas.','error','lobbyNotice');return false;}
    const names=Object.fromEntries(players.map(player=>[String(player.id),String(player.name||player.id)])),activePlayers=Object.fromEntries(players.map(player=>[String(player.id),true])),token=miniToken(GAME_TYPES.WHAT_WOULD_YOU_DO,round),nextGame={...game,gameType:GAME_TYPES.WHAT_WOULD_YOU_DO,phase:'whatWouldYouDoPlaying',round,currentRound:round,totalRounds,gameStartTime:serverNow(),roundToken:token,roundResults:null,playerNames:names,activePlayers,scores:miniScores(game,players),whatWouldYouDo:{questionId:String(question.id),category:String(question.category),optionA:String(question.optionA),optionB:String(question.optionB),usedQuestionIds:[...new Set([...used,String(question.id)])],votes:{}}};
    const result=await state.roomRef.child('game').transaction(current=>{if(!current||!['lobby','whatWouldYouDoResult'].includes(current.phase))return;return nextGame;});
    if(result.committed){const nextData={...data,game:result.snapshot.val()};state.lastRoomData=nextData;handleMiniRoomSnapshot(nextData);}return Boolean(result.committed);
  }
  async function maybeFinalizeWhatWouldYouDo(data){
    const game=data?.game||{};if(!state.roomRef||state.mode!=='host'||game.phase!=='whatWouldYouDoPlaying'||!whatWouldYouDoVotesComplete(game))return false;
    const result=await state.roomRef.child('game').transaction(current=>{
      if(!current||current.phase!=='whatWouldYouDoPlaying'||!whatWouldYouDoVotesComplete(current))return;
      const ids=whatWouldYouDoPlayers({game:current}),question=whatWouldYouDoQuestionFor(current),roundResult=calculateWhatWouldYouDoResult(question,current.whatWouldYouDo?.votes||{},ids),scores=miniScores(current,ids.map(id=>({id,name:current.playerNames?.[id]||id})));
      ids.forEach(id=>{scores[id]=(Number(scores[id])||0)+(Number(roundResult.scores?.[id])||0);});
      return {...current,phase:'whatWouldYouDoResult',roundEndsAt:null,roundResults:{...roundResult,round:current.currentRound,completedAt:firebase.database.ServerValue.TIMESTAMP},scores};
    });
    if(result.committed){const nextData={...state.lastRoomData,game:result.snapshot.val()};state.lastRoomData=nextData;handleMiniRoomSnapshot(nextData);}return Boolean(result.committed);
  }
  function whatWouldYouDoQuestionText(game){const question=whatWouldYouDoQuestionFor(game);return question.optionA&&question.optionB?'¿QUÉ PREFIERES?':'';}
  function renderWhatWouldYouDoPlaying(data){
    const game=data?.game||{},question=whatWouldYouDoQuestionFor(game),ids=whatWouldYouDoPlayers(data),votes=game.whatWouldYouDo?.votes||{},ownVote=votes[String(state.playerId||'')];
    setText('whatWouldYouDoPlayingRoundLabel',`RONDA ${game.currentRound} DE ${game.totalRounds}`);setText('whatWouldYouDoCategory',question.category||'🎲 Random');setText('whatWouldYouDoQuestion',whatWouldYouDoQuestionText(game));setText('whatWouldYouDoOptionALabel',question.optionA||'');setText('whatWouldYouDoOptionBLabel',question.optionB||'');
    const buttonA=$('whatWouldYouDoVoteABtn'),buttonB=$('whatWouldYouDoVoteBBtn');[buttonA,buttonB].forEach(button=>{if(button){const choice=button.dataset.choice;button.disabled=Boolean(ownVote);button.classList.toggle('selected',ownVote===choice);button.setAttribute('aria-pressed',String(ownVote===choice));}});
    const submitted=ids.filter(id=>votes[id]==='A'||votes[id]==='B').length;setText('whatWouldYouDoVoteStatus',ownVote?`Voto registrado. ${submitted} de ${ids.length} jugadores han respondido.`:`${submitted} de ${ids.length} jugadores han respondido. El resultado aparecerá cuando todos voten.`);
  }
  async function submitWhatWouldYouDoVote(choice){
    if(!['A','B'].includes(choice)||state.whatWouldYouDoVoteInFlight||!state.roomRef)return;
    state.whatWouldYouDoVoteInFlight=true;const ownId=String(state.playerId||'');
    try{
      const result=await state.roomRef.child(`game/whatWouldYouDo/votes/${ownId}`).transaction(current=>current||choice);
      if(result.committed){const nextGame={...state.lastRoomData.game,whatWouldYouDo:{...state.lastRoomData.game.whatWouldYouDo,votes:{...(state.lastRoomData.game.whatWouldYouDo?.votes||{}),[ownId]:result.snapshot.val()}}},nextData={...state.lastRoomData,game:nextGame};state.lastRoomData=nextData;renderWhatWouldYouDoPlaying(nextData);if(state.mode==='host')void maybeFinalizeWhatWouldYouDo(nextData);}
      else miniNotice('whatWouldYouDoVoteStatus','Tu voto ya fue registrado o la ronda terminó.','error');
    }catch(error){console.warn('[WHAT WOULD YOU DO VOTE] write failed',error);miniNotice('whatWouldYouDoVoteStatus','No se pudo registrar el voto. Revisa la conexión.','error');}
    finally{state.whatWouldYouDoVoteInFlight=false;}
  }
  function renderWhatWouldYouDoResult(data){
    const game=data?.game||{},question=whatWouldYouDoQuestionFor(game),result=game.roundResults||{},last=Number(game.currentRound)>=Number(game.totalRounds);
    setText('whatWouldYouDoResultRoundLabel',`RONDA ${game.currentRound} DE ${game.totalRounds}`);setText('whatWouldYouDoResultCategory',question.category||'🎲 Random');setText('whatWouldYouDoResultQuestion',whatWouldYouDoQuestionText(game));setText('whatWouldYouDoResultOptionA',question.optionA||'');setText('whatWouldYouDoResultOptionB',question.optionB||'');setText('whatWouldYouDoResultCountA',`${Number(result.countA)||0} votos · ${Number(result.percentageA)||0}%`);setText('whatWouldYouDoResultCountB',`${Number(result.countB)||0} votos · ${Number(result.percentageB)||0}%`);
    const barA=$('whatWouldYouDoResultBarA'),barB=$('whatWouldYouDoResultBarB');if(barA)barA.style.width=`${Math.max(0,Math.min(100,Number(result.percentageA)||0))}%`;if(barB)barB.style.width=`${Math.max(0,Math.min(100,Number(result.percentageB)||0))}%`;
    const winner=result.tie?'🤝 EMPATE · TODOS PIERDEN':`🏆 GANA LA OPCIÓN ${result.winner}`;setText('whatWouldYouDoResultWinner',winner);const ownVote=result.votes?.[String(state.playerId||'')],ownLabel=result.tie?'EMPATE':ownVote===result.winner?'TU ELECCIÓN GANÓ':'TU ELECCIÓN PERDIÓ';setText('whatWouldYouDoResultOwn',ownVote?ownLabel:'');setText('whatWouldYouDoResultScore',`Tu puntaje acumulado: ${Number(game.scores?.[String(state.playerId||'')])||0} pts`);setText('whatWouldYouDoResultStatus',last?'Última ronda completada.':'El anfitrión puede iniciar la siguiente ronda.');
    const next=$('whatWouldYouDoNextBtn');if(next){next.classList.toggle('hidden',!isHost(data));next.textContent=last?'VER RESULTADOS FINALES':'SIGUIENTE RONDA';}
  }
  function renderMiniFinished(data){const game=data.game||{},type=miniRoomType(data),rows=sortedMiniScoreRows(game,data),list=$('miniFinishList'),winner=$('miniFinishWinner');if(list)list.innerHTML=rows.map((row,index)=>`<div class="mini-score-row"><span>${index<3?['🏆','🥈','🥉'][index]:(index+1)+'°'}</span><strong>${escapeHtml(row.name)}</strong><span>${row.score} puntos</span></div>`).join('');setText('miniFinishTitle',type===GAME_TYPES.CONFESSIONS?'🎉 ¡FIN DE LA JUNTA!':MINI_GAME_LABELS[type]||'RESULTADOS FINALES');if(winner){if(type===GAME_TYPES.CONFESSIONS&&rows.length){const topScore=rows[0].score,winners=rows.filter(row=>row.score===topScore);winner.textContent=winners.length>1?`🏆 ¡EMPATE! ${winners.map(row=>row.name).join(' y ')} · ${topScore} pts`:`👑 ¡${rows[0].name.toUpperCase()} GANÓ!`;winner.classList.remove('hidden');}else{winner.textContent='';winner.classList.add('hidden');}}}
  function sortedMiniScoreRows(game,data){const scores=game?.scores||{},names=game?.playerNames||{};return Object.keys(scores).map(id=>({id,name:cleanUiText(names[id]||miniPlayerName(data,id)),score:Number(scores[id])||0})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'es'));}
  async function submitAgeEstimate(){
    if(state.ageLocal){submitAgeLocalEstimate();return;}
    if(!state.roomRef||state.ageSubmitInFlight)return;
    const input=$('ageEstimateInput'),raw=String(input?.value??'').trim(),value=Number(raw);
    if(!/^\d+$/.test(raw)||!Number.isSafeInteger(value)||value<ageData.minAge||value>ageData.maxAge){miniNotice('agePlayingNotice',`Escribe un número entero entre ${ageData.minAge} y ${ageData.maxAge.toLocaleString('es-CL')}.`,'error');return;}
    state.ageSubmitInFlight=true;renderAgePlaying(state.lastRoomData||{game:{}});
    try{
      const estimateRef=state.roomRef.child(`game/ageEstimates/${state.playerId}`),submittedRef=state.roomRef.child(`game/ageSubmitted/${state.playerId}`),estimateResult=await withTimeout(estimateRef.transaction(current=>current===null?value:current),7000,'age-estimate-write-timeout');
      if(!estimateResult.committed||Number(estimateResult.snapshot.val())!==value){miniNotice('agePlayingNotice','La estimación ya fue enviada o la ronda terminó.','error');return;}
      const submittedResult=await withTimeout(submittedRef.transaction(current=>current===true?current:true),7000,'age-submit-confirm-timeout');if(!submittedResult.committed||submittedResult.snapshot.val()!==true){miniNotice('agePlayingNotice','No se pudo confirmar tu estimación. Revisa la conexión.','error');return;}
      const nextGame={...state.lastRoomData.game,ageEstimates:{...(state.lastRoomData.game.ageEstimates||{}),[state.playerId]:value},ageSubmitted:{...(state.lastRoomData.game.ageSubmitted||{}),[state.playerId]:true}};state.ageLocalEstimate=String(value);state.lastRoomData={...state.lastRoomData,game:nextGame};renderAgePlaying(state.lastRoomData);void maybeFinalizeAgeRound(nextGame);
    }catch(error){console.warn('[AGE ESTIMATE] write failed',error);miniNotice('agePlayingNotice','No se pudo enviar. Revisa la conexión e inténtalo nuevamente.','error');}
    finally{state.ageSubmitInFlight=false;if(state.lastRoomData?.game?.phase==='agePlaying')renderAgePlaying(state.lastRoomData);}
  }
  async function maybeFinalizeAgeRound(game){
    const active=ageActivePlayerIds(game),submitted=active.length>0&&active.every(id=>game.ageSubmitted?.[id]);
    if(state.mode==='host'&&submitted)await finalizeAgeRound();
  }
  async function finalizeAgeRound(){
    if(!state.roomRef||state.mode!=='host')return false;
    const result=await state.roomRef.child('game').transaction(game=>{
      if(!game||game.phase!=='agePlaying')return;
      const active=ageActivePlayerIds(game);
      if(!active.length||!active.every(id=>isValidAgeTarget(game.ageTargetsByPlayer?.[id])))return;
      if(!active.every(id=>game.ageSubmitted?.[id]))return;
      const names=game.playerNames||{},rows=active.map(id=>{const target=Number(game.ageTargetsByPlayer[id]),estimate=Number(game.ageEstimates?.[id]),valid=Number.isSafeInteger(estimate)&&estimate>=ageData.minAge&&estimate<=ageData.maxAge,distance=valid?Math.abs(estimate-target):null;return {playerId:id,name:String(names[id]||id),targetAge:target,estimate:valid?estimate:null,distance,valid};}).sort((a,b)=>{if(a.valid!==b.valid)return a.valid?-1:1;if(!a.valid)return a.name.localeCompare(b.name,'es');return a.distance-b.distance||a.name.localeCompare(b.name,'es');});
      const scores=miniScores(game,active.map(id=>({id,name:names[id]||id})));let index=0,rank=1;
      while(index<rows.length){
        const first=rows[index];let groupEnd=index+1;
        if(first.valid){while(groupEnd<rows.length&&rows[groupEnd].valid&&rows[groupEnd].distance===first.distance)groupEnd++;}
        else groupEnd=rows.length;
        const groupSize=groupEnd-index,points=first.valid?(rank===1?3:rank===2?2:rank===3?1:0):0,tie=first.valid&&groupSize>1;
        for(let rowIndex=index;rowIndex<groupEnd;rowIndex++){const row=rows[rowIndex];row.rank=rank;row.points=points;row.tie=tie;scores[row.playerId]=(Number(scores[row.playerId])||0)+points;}
        index=groupEnd;rank+=groupSize;
      }
      return {...game,phase:'ageResults',ageDeadlineAt:null,roundEndsAt:null,roundResults:{type:'age',round:game.currentRound,standings:rows,completedAt:firebase.database.ServerValue.TIMESTAMP,reason:'all-submitted'},scores};
    });
    return Boolean(result.committed);
  }
  function stopDraftKey(){return String(state.lastRoomData?.game?.roundToken||'');}
  function readStopDrafts(){if(Object.keys(state.stopDrafts||{}).length)return state.stopDrafts;try{state.stopDrafts=JSON.parse(localStorage.getItem('qs_stop_drafts')||'{}')||{};}catch(error){state.stopDrafts={};}return state.stopDrafts;}
  function persistStopDrafts(){try{const keys=Object.keys(state.stopDrafts||{}).slice(-5),small={};keys.forEach(key=>{small[key]=state.stopDrafts[key];});localStorage.setItem('qs_stop_drafts',JSON.stringify(small));}catch(error){}}
  async function saveStopDraftToFirebase(immediate=false){
    const token=stopDraftKey(),draft=readStopDrafts()[token];if(!token||!draft||!state.roomRef||!state.playerId)return;if(state.stopDraftTimer){clearTimeout(state.stopDraftTimer);state.stopDraftTimer=null;}const write=()=>state.roomRef.child(`game/stopResponses/${state.playerId}`).set(draft).catch(error=>console.warn('[STOP RESPONSES]',error));if(immediate)await write();else state.stopDraftTimer=window.setTimeout(()=>{state.stopDraftTimer=null;void write();},350);
  }
  function renderStopForm(data){
    const game=data.game||{},config=data.settings?.stop||defaultStopConfig(),form=$('stopAnswerForm');if(!form)return;const token=String(game.roundToken||''),draft=readStopDrafts()[token]||{};state.stopFormToken=token;state.stopDrafts[token]=draft;form.replaceChildren();(config.categories||[]).forEach((category,index)=>{const wrap=document.createElement('label');wrap.className='stop-answer-field';wrap.innerHTML=`<span>${escapeHtml(category)}</span>`;const input=document.createElement('input');input.className='input';input.type='text';input.maxLength=80;input.autocomplete='off';input.dataset.stopCategory=String(index);input.value=draft[String(index)]||'';input.addEventListener('input',event=>{const current=readStopDrafts()[token]||{};current[String(index)]=event.target.value.slice(0,80);state.stopDrafts[token]=current;persistStopDrafts();void saveStopDraftToFirebase(false);});wrap.appendChild(input);form.appendChild(wrap);});
  }
  function renderStopPlaying(data){
    const game=data.game||{},inputState=state.stopFormToken===String(game.roundToken||'');setText('stopPlayingRoundLabel',`RONDA ${game.currentRound} DE ${game.totalRounds}`);setText('stopPlayingLetter',game.stopLetter||'—');setText('stopPlayingCountdown',Math.max(0,Math.ceil(Math.max(0,Number(game.roundEndsAt)-serverNow())/1000)));if(!inputState){renderStopForm(data);void saveStopDraftToFirebase(false);}setText('stopPlayingStatus',game.stopAt?`STOP de ${cleanUiText(game.stopAt.name||'un jugador')}.`:'Responde todas las categorías y pulsa STOP cuando termines.');const stop=$('stopButton');if(stop)stop.disabled=Boolean(game.stopAt);
  }
  function stopResponsesFor(data){return data.game?.stopResponses||{};}
  function stopVotingIds(game){
    const hasSnapshot=Boolean(game?.stopVotingPlayers),configured=game?.stopVotingPlayers||game?.activePlayers||{};
    const ids=Array.isArray(configured)?configured.map(String):Object.keys(configured).filter(id=>configured[id]===true),active=game?.activePlayers||{};
    return ids.filter(id=>!hasSnapshot||active[id]===true);
  }
  function stopVoteBuckets(categoryIndex,targetId,voters,votes){
    const buckets={valid:[],half:[],invalid:[]},targetVotes=votes?.[String(categoryIndex)]?.[String(targetId)]||{};
    voters.filter(voterId=>String(voterId)!==String(targetId)).forEach(voterId=>{if(buckets[targetVotes[voterId]])buckets[targetVotes[voterId]].push(String(voterId));});
    return buckets;
  }
  function stopVotingEntries(game,data){
    const config=data?.settings?.stop||defaultStopConfig(),responses=game?.stopResponses||{},players=stopVotingIds(game);
    return (config.categories||[]).flatMap((category,index)=>players.filter(playerId=>String(responses[playerId]?.[String(index)]||'').trim()).map(playerId=>({category,categoryIndex:index,targetId:String(playerId),answer:String(responses[playerId][String(index)]).trim()})));
  }
  function stopVotesComplete(game,data){
    const voters=stopVotingIds(game),votes=game?.stopVotes||{};if(voters.length<2)return false;
    return stopVotingEntries(game,data).every(entry=>voters.filter(voterId=>String(voterId)!==entry.targetId).every(voterId=>whoamiVoteOption(votes?.[String(entry.categoryIndex)]?.[entry.targetId]?.[voterId])));
  }
  function stopVotingProgress(game,data){
    const voters=stopVotingIds(game),votes=game?.stopVotes||{},entries=stopVotingEntries(game,data);let expected=0,registered=0;
    entries.forEach(entry=>{const eligible=voters.filter(voterId=>String(voterId)!==entry.targetId);expected+=eligible.length;registered+=eligible.filter(voterId=>whoamiVoteOption(votes?.[String(entry.categoryIndex)]?.[entry.targetId]?.[voterId])).length;});
    return {expected,registered};
  }
  function renderStopReview(data){
    const game=data.game||{},config=data.settings?.stop||defaultStopConfig(),responses=stopResponsesFor(data),votes=game.stopVotes||{},voters=stopVotingIds(game),ownId=String(state.playerId||''),list=$('stopReviewList');if(!list)return;
    setText('stopReviewRoundLabel',`RONDA ${game.currentRound} DE ${game.totalRounds}`);list.replaceChildren();
    if(voters.length<2){list.innerHTML='<div class="info">No hay suficientes jugadores activos para votar.</div>';setText('stopReviewStatus','');return;}
    list.innerHTML=voters.map(targetId=>{
      const targetName=miniPlayerName(data,targetId),self=targetId===ownId;
      const answers=(config.categories||[]).map((category,index)=>{
        const answer=String(responses[targetId]?.[String(index)]||'').trim();
        if(!answer)return `<div class="stop-voting-answer blank"><div class="stop-voting-answer-label"><strong>${escapeHtml(category)}</strong><span>Sin respuesta</span></div></div>`;
        const targetVotes=votes[String(index)]?.[targetId]||{},selected=whoamiVoteOption(targetVotes[ownId]),actions=self?'Solo votan los demás jugadores.':Object.entries(WHOAMI_VOTE_OPTIONS).map(([choice,option])=>`<button type="button" class="whoami-vote-choice ${option.className}${selected===option?' selected':''}" data-stop-vote="${escapeHtml(choice)}" data-stop-category="${index}" data-stop-target="${escapeHtml(targetId)}" aria-label="${escapeHtml(option.label)} para ${escapeHtml(targetName)}" aria-pressed="${selected===option?'true':'false'}">${option.symbol}<br>${option.label}</button>`).join('');
        return `<div class="stop-voting-answer"><div class="stop-voting-answer-label"><strong>${escapeHtml(category)}</strong><span>${escapeHtml(answer)}</span></div><div class="stop-voting-actions">${actions}</div><div class="stop-voting-summary">${whoamiVoteSummaryHtml(targetId,voters,{[targetId]:targetVotes},data,game)}</div></div>`;
      }).join('');
      return `<div class="stop-voting-card"><div class="stop-voting-card-head"><span class="stop-voting-player">${escapeHtml(targetName)}${self?' <small>TU RESPUESTA</small>':''}</span><span class="whoami-vote-points">${self?'Votan los demás':'VOTA'}</span></div>${answers}</div>`;
    }).join('');
    const progress=stopVotingProgress(game,data);setText('stopReviewStatus',progress.registered===progress.expected?'Todos votaron. Calculando el resultado…':`${progress.registered} de ${progress.expected} votos registrados. Cada jugador debe evaluar las respuestas de los demás.`);
    list.querySelectorAll('[data-stop-vote]').forEach(button=>button.addEventListener('click',()=>void submitStopVote(button.dataset.stopCategory,button.dataset.stopTarget,button.dataset.stopVote)));
    $('stopFinishReviewBtn')?.classList.add('hidden');
  }
  async function submitStopVote(categoryIndex,targetId,choice){
    const option=whoamiVoteOption(choice);if(!option||whoamiVoteInFlight||!state.roomRef)return;
    const game=state.lastRoomData?.game||{},voters=stopVotingIds(game),ownId=String(state.playerId||''),target=String(targetId||'');
    if(!voters.includes(ownId)||!voters.includes(target)||ownId===target)return;
    if(!String(game.stopResponses?.[target]?.[String(categoryIndex)]||'').trim())return;
    whoamiVoteInFlight=true;renderStopReview(state.lastRoomData||{game:{}});
    try{
      const voteRef=state.roomRef.child(`game/stopVotes/${String(categoryIndex)}/${target}/${ownId}`),result=await voteRef.transaction(current=>current||choice);
      if(result.committed&&String(result.snapshot.val()||'')===choice){const nextData={...state.lastRoomData,game:{...state.lastRoomData.game,stopVotes:{...(state.lastRoomData.game.stopVotes||{}),[String(categoryIndex)]:{...(state.lastRoomData.game.stopVotes?.[String(categoryIndex)]||{}),[target]:{...(state.lastRoomData.game.stopVotes?.[String(categoryIndex)]?.[target]||{}),[ownId]:choice}}}}};state.lastRoomData=nextData;renderStopReview(nextData);void maybeFinalizeStopVoting(nextData,nextData.game);}
      else miniNotice('stopReviewStatus','La votación ya terminó o tu voto no está disponible.','error');
    }catch(error){console.warn('[STOP VOTE] write failed',error);miniNotice('stopReviewStatus','No se pudo registrar tu voto. Revisa la conexión.','error');}
    finally{whoamiVoteInFlight=false;if(state.lastRoomData?.game?.phase==='stopReview')renderStopReview(state.lastRoomData);}
  }
  function stopAnswerOutcome(answer,counts,game,repeated){
    let outcome=whoamiOutcome(counts);
    if(outcome.key!=='tie'&&outcome.key!=='invalid'&&!stopAnswerMatchesLetter(answer,game?.stopLetter))outcome=whoamiVoteOption('invalid');
    if(repeated&&outcome.key==='valid')outcome=whoamiVoteOption('half');
    return outcome;
  }
  async function maybeFinalizeStopVoting(data,game){if(state.mode==='host'&&stopVotesComplete(game,data))await finalizeStopVoting(data);}
  async function finalizeStopVoting(data){
    if(!state.roomRef||state.mode!=='host')return false;
    const config=data?.settings?.stop||defaultStopConfig();
    const result=await state.roomRef.child('game').transaction(game=>{
      if(!game||game.phase!=='stopReview'||!stopVotesComplete(game,{settings:{stop:config}}))return;
      const voters=stopVotingIds(game),responses=game.stopResponses||{},votes=game.stopVotes||{},names=game.playerNames||{},duplicateCounts={};
      (config.categories||[]).forEach((category,index)=>{const counts={};voters.forEach(playerId=>{const answer=String(responses[playerId]?.[String(index)]||'').trim();if(answer){const key=stopNormalizeAnswer(answer);counts[key]=(counts[key]||0)+1;}});duplicateCounts[String(index)]=counts;});
      const standings=voters.map(playerId=>{let points=0;const answers=(config.categories||[]).map((category,index)=>{const answer=String(responses[playerId]?.[String(index)]||'').trim();if(!answer)return {category,categoryIndex:index,answer:'',outcome:'invalid',points:0,votes:{valid:[],half:[],invalid:[]},voteCounts:{valid:0,half:0,invalid:0},repeated:false};const buckets=stopVoteBuckets(index,playerId,voters,votes),counts={valid:buckets.valid.length,half:buckets.half.length,invalid:buckets.invalid.length},repeated=(duplicateCounts[String(index)]?.[stopNormalizeAnswer(answer)]||0)>1,outcome=stopAnswerOutcome(answer,counts,game,repeated);points+=outcome.points;return {category,categoryIndex:index,answer,outcome:outcome.key,points:outcome.points,votes:buckets,voteCounts:counts,repeated};});return {playerId:String(playerId),name:String(names[playerId]||playerId),points,answers};}).sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name,'es'));
      const scores={...(game.scores||{})};standings.forEach(row=>{scores[row.playerId]=(Number(scores[row.playerId])||0)+row.points;});
      return {...game,phase:'stopResults',roundEndsAt:null,stopVotes:votes,stopJudgments:null,roundResults:{type:'stopVoting',round:game.currentRound,letter:game.stopLetter,stopByName:game.stopAt?.name||'tiempo agotado',standings,completedAt:firebase.database.ServerValue.TIMESTAMP},scores};
    });
    return Boolean(result.committed);
  }
  function renderLegacyStopReview(data){
    const game=data.game||{},config=data.settings?.stop||defaultStopConfig(),responses=stopResponsesFor(data),judgments=game.stopJudgments||{},host=isHost(data),players=miniPlayers(data),list=$('stopReviewList');if(!list)return;setText('stopReviewRoundLabel',`RONDA ${game.currentRound} DE ${game.totalRounds}`);list.replaceChildren();(config.categories||[]).forEach((category,index)=>{const section=document.createElement('div');section.className='stop-review-category';const title=document.createElement('h3');title.textContent=category;section.appendChild(title);players.forEach(player=>{const row=document.createElement('div');row.className='stop-review-row';const answer=String(responses[player.id]?.[String(index)]||'').trim();const status=judgments[String(index)]?.[player.id];const label=document.createElement('span');label.textContent=`${player.name}: ${answer||'—'}`;row.appendChild(label);if(host){const valid=document.createElement('button');valid.type='button';valid.className='review-action valid'+(status===true?' selected':'');valid.textContent='✓ VÁLIDA';valid.addEventListener('click',()=>void setStopJudgment(index,player.id,true));const invalid=document.createElement('button');invalid.type='button';invalid.className='review-action invalid'+(status===false?' selected':'');invalid.textContent='✕ INVÁLIDA';invalid.addEventListener('click',()=>void setStopJudgment(index,player.id,false));row.append(valid,invalid);}else if(status!==undefined){const mark=document.createElement('small');mark.textContent=status?'VÁLIDA':'INVÁLIDA';row.appendChild(mark);}section.appendChild(row);});list.appendChild(section);});$('stopFinishReviewBtn')?.classList.toggle('hidden',!host);}
  async function setStopJudgment(categoryIndex,playerId,value){if(!state.roomRef||state.mode!=='host')return;const result=await state.roomRef.child('game').transaction(game=>{if(!game||game.phase!=='stopReview')return;const judgments={...(game.stopJudgments||{})};judgments[String(categoryIndex)]={...(judgments[String(categoryIndex)]||{}),[playerId]:Boolean(value)};return {...game,stopJudgments:judgments};});if(result.committed)renderStopReview({...state.lastRoomData,game:result.snapshot.val()});}
  function computeStopResults(game,data){
    const config=data.settings?.stop||defaultStopConfig(),players=miniPlayers(data),responses=game.stopResponses||{},judgments=game.stopJudgments||{},scores={};players.forEach(player=>scores[player.id]=0);
    (config.categories||[]).forEach((category,index)=>{const validEntries=[];players.forEach(player=>{const answer=String(responses[player.id]?.[String(index)]||'').trim(),judgment=judgments[String(index)]?.[player.id];if(!answer||judgment===false||!stopAnswerMatchesLetter(answer,game.stopLetter))return;validEntries.push({id:player.id,key:stopNormalizeAnswer(answer)});});const counts={};validEntries.forEach(entry=>{counts[entry.key]=(counts[entry.key]||0)+1;});validEntries.forEach(entry=>{scores[entry.id]=(Number(scores[entry.id])||0)+(counts[entry.key]>1?5:10);});});
    const names=game.playerNames||{},standings=players.map(player=>({playerId:player.id,name:String(names[player.id]||player.name),points:scores[player.id]||0})).sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name,'es'));return {type:'stop',round:game.currentRound,letter:game.stopLetter,stopByName:game.stopAt?.name||'tiempo agotado',standings,scores,completedAt:firebase.database.ServerValue.TIMESTAMP};
  }
  async function finishStopReview(){if(state.mode==='host')await finalizeStopVoting(state.lastRoomData||{});}
  async function finalizeStopRound(reason='manual'){
    if(!state.roomRef||state.mode!=='host')return false;await saveStopDraftToFirebase(true);const result=await state.roomRef.child('game').transaction(game=>{if(!game||game.phase!=='stopPlaying')return;const now=serverNow();if(reason==='timeout'&&!game.stopAt&&now<Number(game.roundEndsAt||0))return;if(game.stopAt&&reason==='timeout')return;const stopAt=game.stopAt||{playerId:reason==='manual'?String(state.playerId):'',name:reason==='manual'?state.playerName:'Tiempo agotado',reason,at:firebase.database.ServerValue.TIMESTAMP};return {...game,phase:'stopReview',roundEndsAt:null,stopAt,stopResponses:game.stopResponses||{},stopJudgments:null,stopVotingPlayers:{...(game.activePlayers||{})},stopVotes:{}};});return Boolean(result.committed);
  }
  async function pressStop(){if(!state.roomRef||state.lastRoomData?.game?.phase!=='stopPlaying')return;if(state.mode==='host'){await finalizeStopRound('manual');return;}try{await state.roomRef.child('game/stopAt').transaction(current=>current||{playerId:String(state.playerId),name:String(state.playerName||'Jugador'),reason:'manual',at:firebase.database.ServerValue.TIMESTAMP});}catch(error){console.warn('[STOP] stop request failed',error);miniNotice('stopPlayingStatus','No se pudo detener la ronda. Revisa la conexión.','error');}}
  async function nextMiniRound(){
    if(state.ageLocal){nextAgeLocalRound();return;}
    if(state.busy.next||!state.roomRef)return;
    setBusy('next',true);setButtonBusy('miniNextRoundBtn','next',true,'CARGANDO…');
    try{
      const data=(await withTimeout(state.roomRef.once('value'),7000,'mini-next-read-timeout')).val(),type=miniRoomType(data),canAdvance=isHost(data);
      if(!data||!canAdvance||!['ageResults','stopResults','whatWouldYouDoResult'].includes(data.game?.phase))return;
      if(Number(data.game.currentRound)>=Number(data.game.totalRounds)){
        const done=await state.roomRef.child('game').transaction(game=>!game||!['ageResults','stopResults','whatWouldYouDoResult'].includes(game.phase)?undefined:{...game,phase:'finished',roundResults:game.roundResults});
        if(done.committed)handleMiniRoomSnapshot({...data,game:done.snapshot.val()});
        return;
      }
      const players=type===GAME_TYPES.AGE?ageActivePlayerIds(data.game,data).map(id=>({id,name:String(data.players?.[id]?.name||data.game?.playerNames?.[id]||id)})):miniPlayers(data);
      if(players.length<2){notice('No hay jugadores activos para continuar.','error','lobbyNotice');return;}
      if(type===GAME_TYPES.WHAT_WOULD_YOU_DO){await startWhatWouldYouDoRound(data,players);return;}
      const config=type===GAME_TYPES.STOP?data.settings?.stop||defaultStopConfig():data.settings?.age||{totalRounds:data.game.totalRounds};
      const nextGame=miniPrepareRound(data.game,type,Number(data.game.currentRound)+1,players,config,serverNow());
      const result=await state.roomRef.child('game').transaction(game=>!game||!['ageResults','stopResults'].includes(game.phase)?undefined:nextGame);
      if(!result.committed)notice('La siguiente ronda ya está siendo preparada.','error','lobbyNotice');
    }catch(error){console.error('[MINIGAME NEXT]',error);notice('No se pudo comenzar la siguiente ronda.','error','lobbyNotice');}
    finally{setBusy('next',false);setButtonBusy('miniNextRoundBtn','next',false);}
  }
  async function handleMiniRoomSnapshot(data){
    const previousData=state.lastRoomData,sameFunctionalState=Boolean(previousData&&miniFunctionalKey(previousData)===miniFunctionalKey(data));state.lastRoomData=data||null;
    if(!data){stopRoomListener();stopAssignmentListeners();state.roomRef=null;clearMiniCountdown();clearSession();notice('La sala ya no existe.','error','joinNotice');goToScreenIfChanged('join');return;}
    const type=miniRoomType(data);
    if(!routeRoomByGameType(type)){
      stopRoomListener();stopAssignmentListeners();state.roomRef=null;state.lastRoomData=null;clearMiniCountdown();clearSession();
      notice('La sala tiene un tipo de juego desconocido. No se abrirá ninguna partida.','error','joinNotice');goToScreenIfChanged('join');return;
    }
    const players=normalizeRoomPlayers(data),sessionPlayerId=String(state.playerId||''),authId=String(backendUid()||''),me=players.find(player=>String(player.id)===sessionPlayerId&&String(player.authUid||'')===authId)||(!sessionPlayerId?players.find(player=>String(player.id)===authId&&String(player.authUid||'')===authId):null);
    if(!me){notice('Reconectando con tu identidad segura…','error','joinNotice');return;}
    state.gameType=type;state.playerName=me.name||state.playerName;state.hostName=data.hostName||state.hostName;state.mode=isHost(data)?'host':'player';saveSession();if(state.mode==='host'){void repairHostMetadata(data);void syncRoomDirectory(data);}if(!isHost(data)&&data.hostId&&!isPlayerOnline(data.players?.[data.hostId]))void attemptHostTransfer(data);
    let game=data.game||{};if(state.mode==='host'&&[GAME_TYPES.CONFESSIONS,GAME_TYPES.CHAMUYA,GAME_TYPES.TRIBUNAL].includes(type)&&!['lobby','tribunalFinalResult','chamuyayaResult','tribunalResult'].includes(game.phase)){const cleaned=await pruneInactiveRoundPlayers(data);if(cleaned&&cleaned!==data){handleMiniRoomSnapshot(cleaned);return;}game=cleaned?.game||game;}
    const expected=game.phase==='lobby'?'lobby':game.phase==='agePreparation'?'agePreparation':game.phase==='ageReveal'?'ageReveal':game.phase==='agePlaying'?'agePlaying':game.phase==='confessionsWriting'?'confessionsWriting':game.phase==='confessionsVoting'?'confessionsVoting':game.phase==='confessionsResults'?'confessionsResults':game.phase==='confessionsScoreboard'?'confessionsScoreboard':game.phase==='chamuyayaCountdown'?'chamuyayaCountdown':game.phase==='chamuyayaReveal'?'chamuyayaReveal':game.phase==='chamuyayaDiscussion'?'chamuyayaDiscussion':game.phase==='chamuyayaVoting'?'chamuyayaVoting':game.phase==='chamuyayaResult'?'chamuyayaResult':game.phase==='whatWouldYouDoPlaying'?'whatWouldYouDoPlaying':game.phase==='whatWouldYouDoResult'?'whatWouldYouDoResult':game.phase==='tribunalRoles'?'tribunalRoles':game.phase==='tribunalPresentation'?'tribunalPresentation':game.phase==='tribunalDebate'?'tribunalDebate':game.phase==='tribunalSurprise'?'tribunalSurprise':game.phase==='tribunalFinal'?'tribunalFinal':game.phase==='tribunalVoting'?'tribunalVoting':game.phase==='tribunalResult'?'tribunalResult':game.phase==='tribunalFinalResult'?'tribunalFinalResult':game.phase==='stopReveal'?'stopReveal':game.phase==='stopPlaying'?'stopPlaying':game.phase==='stopReview'?'stopReview':['ageResults','stopResults'].includes(game.phase)?'miniResults':game.phase==='finished'?'miniFinish':'',needsTimer=['agePreparation','ageReveal','stopReveal','stopPlaying','confessionsResults','confessionsScoreboard','chamuyayaCountdown'].includes(expected),ageTargetsReady=!['ageReveal','agePlaying'].includes(expected)||Object.keys(game.activePlayers||{}).filter(id=>game.activePlayers[id]===true).every(id=>isValidAgeTarget(ageTargetForPlayer(game,data,id)));if(expected!=='agePlaying')clearAgePresenceCheck();
    if(sameFunctionalState&&state.currentScreen===expected&&ageTargetsReady&&(!needsTimer||state.miniCountdownTimer)&&game.phase!=='lobby')return;
    if(game.phase==='lobby'){clearMiniCountdown();state.miniRenderKey='';renderMiniLobby(data);goToScreenIfChanged('lobby');return;}
    if(!game.activePlayers?.[state.playerId]&&!['finished'].includes(game.phase)){notice('La ronda ya había comenzado. Espera a la próxima partida.','error','lobbyNotice');goToScreenIfChanged('lobby');return;}
    if(game.phase==='chamuyayaCountdown'){clearCountdown();renderChamuyayaCountdown(data);goToScreenIfChanged('chamuyayaCountdown');startMiniCountdown({phase:game.phase,round:game.currentRound,endsAt:game.chamuyaya?.countdownEndsAt||game.countdownEndsAt,elementId:'chamuyayaCountdownValue',onZero:()=>transitionChamuyayaCountdownToReveal(data)});return;}
    if(game.phase==='chamuyayaReveal'){clearMiniCountdown();renderChamuyayaReveal(data);goToScreenIfChanged('chamuyayaReveal');void maybeStartChamuyayaDiscussion(data);return;}
    if(game.phase==='chamuyayaDiscussion'){clearMiniCountdown();renderChamuyayaDiscussion(data);goToScreenIfChanged('chamuyayaDiscussion');return;}
    if(game.phase==='chamuyayaVoting'){clearMiniCountdown();renderChamuyayaVoting(data);goToScreenIfChanged('chamuyayaVoting');void maybeFinalizeChamuyayaVoting(data);return;}
    if(game.phase==='chamuyayaResult'){clearMiniCountdown();renderChamuyayaResult(data);goToScreenIfChanged('chamuyayaResult');return;}
    if(game.phase==='whatWouldYouDoPlaying'){clearMiniCountdown();renderWhatWouldYouDoPlaying(data);goToScreenIfChanged('whatWouldYouDoPlaying');void maybeFinalizeWhatWouldYouDo(data);return;}
    if(game.phase==='whatWouldYouDoResult'){clearMiniCountdown();renderWhatWouldYouDoResult(data);goToScreenIfChanged('whatWouldYouDoResult');return;}
     if(game.phase==='tribunalRoles'){stopTribunalRevealListener();clearMiniCountdown();renderTribunalRoles(data);goToScreenIfChanged('tribunalRoles');void maybeStartTribunalPresentation(data);return;}
    if(game.phase==='tribunalPresentation'){clearMiniCountdown();renderTribunalPresentation(data);goToScreenIfChanged('tribunalPresentation');return;}
    if(game.phase==='tribunalDebate'){clearMiniCountdown();renderTribunalDebate(data);goToScreenIfChanged('tribunalDebate');return;}
    if(game.phase==='tribunalSurprise'){clearMiniCountdown();renderTribunalSurprise(data);goToScreenIfChanged('tribunalSurprise');return;}
    if(game.phase==='tribunalFinal'){clearMiniCountdown();renderTribunalFinal(data);goToScreenIfChanged('tribunalFinal');return;}
    if(game.phase==='tribunalVoting'){clearMiniCountdown();renderTribunalVoting(data);goToScreenIfChanged('tribunalVoting');void maybeFinalizeTribunalVoting(data);return;}
     if(game.phase==='tribunalResult'){clearMiniCountdown();listenToTribunalReveal(data);renderTribunalResult(data);goToScreenIfChanged('tribunalResult');void publishTribunalReveal(data);void maybeFinalizeTribunalReveal(data);return;}
     if(game.phase==='tribunalFinalResult'){stopTribunalRevealListener();clearMiniCountdown();renderTribunalFinalResult(data);goToScreenIfChanged('tribunalFinalResult');return;}
    if(game.phase==='confessionsWriting'){clearMiniCountdown();goToScreenIfChanged('confessionsWriting');renderConfessionsWriting(data);void requestScreenWakeLock();void requestLandscapeOrientationLock();void maybeStartConfessionVoting(data,game);return;}
    if(game.phase==='confessionsVoting'){clearMiniCountdown();goToScreenIfChanged('confessionsVoting');renderConfessionsVoting(data);void requestScreenWakeLock();void requestLandscapeOrientationLock();void maybeFinalizeConfessionVoting(data,game);return;}
    if(game.phase==='confessionsResults'){clearMiniCountdown();goToScreenIfChanged('confessionsResults');renderConfessionsResults(data);startMiniCountdown({phase:game.phase,round:game.currentRound,endsAt:game.roundEndsAt,onZero:()=>transitionConfessionResultsToScoreboard(data)});return;}
    if(game.phase==='confessionsScoreboard'){clearMiniCountdown();goToScreenIfChanged('confessionsScoreboard');renderConfessionsScoreboard(data);startMiniCountdown({phase:game.phase,round:game.currentRound,endsAt:game.roundEndsAt,onZero:()=>transitionConfessionScoreboard(data)});return;}
    if(game.phase==='agePreparation'){
      clearCountdown();renderAgePreparation(data);goToScreenIfChanged('agePreparation');void requestScreenWakeLock();void requestAgeOrientationLock();
      startMiniCountdown({phase:game.phase,round:game.currentRound,endsAt:game.prepEndsAt,elementId:'agePrepCountdown',onTick:seconds=>renderAgePreparation(data,seconds),onZero:()=>transitionAgePreparationToReveal(data)});return;
    }
    if(game.phase==='ageReveal'){
      if(await repairAgeTargets(data))return;
      clearCountdown();renderAgeReveal(data);goToScreenIfChanged('ageReveal');void requestScreenWakeLock();
      startMiniCountdown({phase:game.phase,round:game.currentRound,endsAt:game.revealEndsAt,elementId:'ageRevealCountdown',onZero:()=>transitionMiniRevealToPlaying(data)});return;
    }
    if(game.phase==='stopReveal'){
      clearCountdown();setText('stopRevealRoundLabel',`RONDA ${game.currentRound} DE ${game.totalRounds}`);setText('stopRevealLetter',game.stopLetter||'—');goToScreenIfChanged('stopReveal');startMiniCountdown({phase:game.phase,round:game.currentRound,endsAt:game.revealEndsAt,elementId:'stopRevealCountdown',onZero:()=>transitionMiniRevealToPlaying(data)});return;
    }
    if(game.phase==='agePlaying'){
      if(await repairAgeTargets(data))return;
      clearCountdown();renderAgePlaying(data);goToScreenIfChanged('agePlaying');void releaseScreenWakeLock();startAgePresenceCheck();void maybeFinalizeAgeRound(game);return;
    }
    if(game.phase==='stopPlaying'){
      if(state.mode==='host'&&game.stopAt)void finalizeStopRound(String(game.stopAt.reason||'manual'));clearCountdown();renderStopPlaying(data);goToScreenIfChanged('stopPlaying');startMiniCountdown({phase:game.phase,round:game.currentRound,endsAt:game.roundEndsAt,elementId:'stopPlayingCountdown',onZero:()=>finalizeStopRound('timeout')});return;
    }
    clearMiniCountdown();
    if(game.phase==='ageResults'||game.phase==='stopResults'){renderMiniResults(data,type);goToScreenIfChanged('miniResults');return;}
    if(game.phase==='stopReview'){renderStopReview(data);goToScreenIfChanged('stopReview');void maybeFinalizeStopVoting(data,game);return;}
    if(game.phase==='finished'){renderMiniFinished(data);goToScreenIfChanged('miniFinish');}
  }

  // ============================================================
  // MINIJUEGOS: estado local y catálogos independientes
  // ============================================================

  function miniNotice(id,message,type=''){
    const el=$(id);if(!el)return;el.textContent=message||'';el.className='room-notice'+(message?' show ':'')+(type?' '+type:'');
  }
  function clearMiniCountdown(){
    if(state.miniCountdownTimer){clearInterval(state.miniCountdownTimer);state.miniCountdownTimer=null;}
    if(state.miniCountdownWatchdog){clearTimeout(state.miniCountdownWatchdog);state.miniCountdownWatchdog=null;}
    state.miniCountdownKey='';state.miniCountdownTick=null;state.miniCountdownTransitioningKey='';
  }
  function clearAgePresenceCheck(){if(agePresenceCheckTimer){clearInterval(agePresenceCheckTimer);agePresenceCheckTimer=null;}}
  function startAgePresenceCheck(){
    clearAgePresenceCheck();
    if(!state.roomRef)return;
    agePresenceCheckTimer=window.setInterval(()=>{if(state.lastRoomData?.game?.phase==='agePlaying')void maybeFinalizeAgeRound(state.lastRoomData.game);else clearAgePresenceCheck();},5000);
  }
  function startMiniCountdown({phase,round,endsAt,elementId,onZero,onTick}){
    const end=Number(endsAt),r=Number(round);if(!Number.isFinite(end)||!Number.isFinite(r))return false;
    const key=`mini:${phase}:${r}:${end}`;
    const tick=()=>{
      if(state.miniCountdownKey!==key)return;
      const remaining=Math.max(0,end-serverNow()),seconds=Math.max(0,Math.ceil(remaining/1000));if(elementId)setText(elementId,seconds);onTick?.(seconds,remaining);
      if(remaining>0||state.miniCountdownTransitioningKey===key)return;
      state.miniCountdownTransitioningKey=key;
      Promise.resolve().then(()=>onZero?.()).catch(error=>console.error('[MINIGAME TIMER]',error)).finally(()=>{if(state.miniCountdownKey===key)state.miniCountdownTransitioningKey='';});
    };
    if(state.miniCountdownKey===key&&state.miniCountdownTimer){tick();return true;}
    clearMiniCountdown();state.miniCountdownKey=key;state.miniCountdownTransitioningKey='';state.miniCountdownTick=tick;state.miniCountdownTimer=window.setInterval(tick,250);tick();
    state.miniCountdownWatchdog=window.setTimeout(()=>{state.miniCountdownWatchdog=null;if(state.miniCountdownKey===key)tick();},Math.max(0,end-serverNow()+180));
    return true;
  }

  // ============================================================
  // MODO LOCAL: ¿QUIÉN SOY?
  // ============================================================
  function whoamiLocalSnapshot(){
    const game=state.whoamiLocal||{},players=localActivePlayers(game),activePlayers=Object.fromEntries(players.map(player=>[player.id,true]));
    return {game:{gameType:GAME_TYPES.WHOAMI,phase:game.phase,currentRound:game.round,totalRounds:game.totalRounds,activePlayers,playerNames:Object.fromEntries(players.map(player=>[player.id,player.name])),publicCharacters:game.publicCharacters||[],roundResults:game.roundResults||null,scores:game.scores||{}},players:Object.fromEntries(players.map(player=>[player.id,player]))};
  }
  function createWhoamiLocalState(){return {players:[{id:'local-whoami-1',name:'Jugador 1'},{id:'local-whoami-2',name:'Jugador 2'}],categories:[],totalRounds:3,round:0,phase:'setup',revealIndex:0,assignments:{},publicCharacters:[],usedKeys:[],scores:{},roundResults:null,finalRevealPlayerId:''};}
  function renderWhoamiLocalSetup(){const game=state.whoamiLocal||createWhoamiLocalState();state.whoamiLocal=game;localPlayerNames('whoamiLocalPlayers',game,()=>renderWhoamiLocalSetup());}
  function setWhoamiSetupMode(local){
    const onlineBtn=$('whoamiOnlineModeBtn'),localBtn=$('whoamiLocalModeBtn'),nameSection=$('whoamiOnlineNameSection'),create=$('createRoomBtn'),panel=$('whoamiLocalSetupPanel');
    onlineBtn?.classList.toggle('selected',!local);localBtn?.classList.toggle('selected',Boolean(local));nameSection?.classList.toggle('hidden',Boolean(local));create?.classList.toggle('hidden',Boolean(local));panel?.classList.toggle('hidden',!local);
    if(local){state.mode='local';state.whoamiLocal=state.whoamiLocal&&state.whoamiLocal.phase==='setup'?state.whoamiLocal:createWhoamiLocalState();renderWhoamiLocalSetup();}
    else{state.whoamiLocal=null;}
  }
  function openWhoamiLocalSetup(){if(!resetGameModeContext(GAME_TYPES.WHOAMI))return;state.configEditing=false;state.whoamiLocal=createWhoamiLocalState();setWhoamiSetupMode(true);renderCategories();setCategorySelection([]);setTotalRounds(3);show('setup');}
  function prepareWhoamiLocalRound(){
    const game=state.whoamiLocal;if(!game)return false;
    const players=localActivePlayers(game),selected=[...state.categories];
    if(selected.length<1){miniNotice('errorStock','Selecciona al menos una temática.','error');return false;}
    const pool=characterPool(selected),required=players.length*game.totalRounds;
    if(pool.length<required){miniNotice('errorStock',`No hay suficientes personajes únicos para esta partida. Hay ${pool.length} disponibles y necesitas ${required}.`,'error');return false;}
    const assignmentResult=createAssignments(players,selected,game.usedKeys);
    if(!assignmentResult){miniNotice('errorStock','No se pudo preparar una ronda sin repetir personajes.','error');return false;}
    game.categories=selected;game.assignments=assignmentResult.assignments;game.publicCharacters=[];game.usedKeys=[...game.usedKeys,...assignmentResult.usedKeys];return true;
  }
  function startWhoamiLocal(){
    const game=state.whoamiLocal||createWhoamiLocalState();game.players=localActivePlayers(game).map((player,index)=>({id:`local-whoami-${index+1}`,name:player.name.trim().slice(0,30)})).filter(player=>player.name);game.totalRounds=Math.min(20,Math.max(1,Number(state.totalRounds)||3));
    if(game.players.length<2){miniNotice('errorStock','Agrega al menos 2 jugadores.','error');return;}
    if(!prepareWhoamiLocalRound())return;
    game.round=1;game.phase='handoff';game.revealIndex=0;game.scores=Object.fromEntries(game.players.map(player=>[player.id,0]));game.roundResults=null;game.finalRevealPlayerId='';state.whoamiLocal=game;state.gameType=GAME_TYPES.WHOAMI;state.mode='local';state.roomRef=null;state.roomCode='';startWhoamiLocalHandoff();
  }
  function startWhoamiLocalHandoff(){const game=state.whoamiLocal;if(!game)return;clearCountdown();game.phase='handoff';state.lastRoomData=whoamiLocalSnapshot();show('prep');renderPreparation(state.lastRoomData.game);void requestScreenWakeLock();startSynchronizedCountdown({phase:'localWhoamiHandoff',round:game.round,endsAt:serverNow()+LOCAL_PHONE_HANDOFF_DURATION_MS,elementId:'prepCountdown',onZero:startWhoamiLocalReveal});}
  function startWhoamiLocalReveal(){const game=state.whoamiLocal;if(!game)return;clearCountdown();game.phase='reveal';state.lastRoomData=whoamiLocalSnapshot();show('reveal');renderReveal(state.lastRoomData.game);void requestScreenWakeLock();}
  function continueWhoamiLocalReveal(){
    const game=state.whoamiLocal;if(!game||game.phase!=='reveal')return;game.revealIndex++;
    if(game.revealIndex<game.players.length){startWhoamiLocalHandoff();return;}
    game.phase='finalReveal';game.finalRevealPlayerId='';state.lastRoomData=whoamiLocalSnapshot();show('whoamiLocalFinalReveal');renderWhoamiLocalFinalReveal();void releaseScreenWakeLock();
  }
  function renderWhoamiLocalFinalReveal(){
    const game=state.whoamiLocal,list=$('whoamiLocalFinalList');if(!game||!list)return;
    list.innerHTML=game.players.map(player=>{const id=String(player.id),assignment=game.assignments?.[id]?.character||{},revealed=String(game.finalRevealPlayerId||'')===id,value=cleanUiText(assignment.nombre||'Personaje pendiente');return `<button class="local-final-reveal-item${revealed?' revealed':''}" type="button" role="listitem" data-local-whoami-final="${escapeHtml(id)}" aria-expanded="${revealed?'true':'false'}"><span class="local-final-reveal-name">${escapeHtml(cleanUiText(player.name))}</span><span class="local-final-reveal-value">${revealed?escapeHtml(value):'🔒 OCULTO'}</span></button>`;}).join('');
    list.querySelectorAll('[data-local-whoami-final]').forEach(button=>button.addEventListener('click',()=>{const id=String(button.dataset.localWhoamiFinal||'');game.finalRevealPlayerId=String(game.finalRevealPlayerId||'')===id?'':id;renderWhoamiLocalFinalReveal();}));
  }
  function openWhoamiLocalScoring(){const game=state.whoamiLocal;if(!game||game.phase!=='playing')return;game.phase='scoring';state.lastRoomData=whoamiLocalSnapshot();show('scoring');renderScoring(state.lastRoomData.game,state.lastRoomData,{force:true,resetSelection:true});}
  function confirmWhoamiLocalResult(){
    const game=state.whoamiLocal;if(!game||game.phase!=='scoring')return;const players=localActivePlayers(game),first=String($('firstPlaceSelect')?.value||''),second=String($('secondPlaceSelect')?.value||''),third=String($('thirdPlaceSelect')?.value||''),valid=new Set(players.map(player=>player.id));
    if(!first||!second){miniNotice('scoringNotice','Debes seleccionar el 1° y el 2° lugar.','error');return;}if(first===second||third&&(first===third||second===third)||!valid.has(first)||!valid.has(second)||(third&&!valid.has(third))){miniNotice('scoringNotice','Cada puesto debe ser distinto y pertenecer a un jugador.','error');return;}if(players.length>=3&&!third){miniNotice('scoringNotice','Selecciona el 3° lugar.','error');return;}
    const names=Object.fromEntries(players.map(player=>[player.id,player.name])),places={first:{playerId:first,name:names[first],points:3},second:{playerId:second,name:names[second],points:2},third:third?{playerId:third,name:names[third],points:1}:null};game.scores[first]=(Number(game.scores[first])||0)+3;game.scores[second]=(Number(game.scores[second])||0)+2;if(third)game.scores[third]=(Number(game.scores[third])||0)+1;game.roundResults={type:'localRanking',round:game.round,places,completedAt:Date.now()};game.phase='results';state.lastRoomData=whoamiLocalSnapshot();show('results');renderResults(state.lastRoomData.game,state.lastRoomData);
  }
  function nextWhoamiLocalRound(){
    const game=state.whoamiLocal;if(!game||game.phase!=='results')return;if(game.round>=game.totalRounds){game.phase='finished';state.lastRoomData=whoamiLocalSnapshot();show('finish');renderFinished(state.lastRoomData.game,state.lastRoomData);return;}
    if(!prepareWhoamiLocalRound())return;game.round++;game.revealIndex=0;game.phase='handoff';game.finalRevealPlayerId='';game.roundResults=null;startWhoamiLocalHandoff();
  }
  function finishWhoamiLocal(){clearCountdown();clearMiniCountdown();state.whoamiLocal=null;state.lastRoomData=null;state.mode=null;state.gameType=null;resetHistory();show('home',{history:false});}

  // ============================================================
  // MODOS LOCALES: EDAD Y CONFESIONES
  // ============================================================
  function localPlayerNames(listId,game,onStructureChange){
    const list=$(listId);if(!list)return;list.replaceChildren();
    (game.players||[]).forEach((player,index)=>{
      const row=document.createElement('div');row.className='mini-name-row';
      const input=document.createElement('input');input.className='input';input.maxLength=30;input.autocomplete='off';input.spellcheck=false;input.value=String(player.name||'');input.placeholder=`Jugador ${index+1}`;input.setAttribute('aria-label',`Nombre del jugador ${index+1}`);input.addEventListener('input',event=>{player.name=String(event.target.value||'').slice(0,30);});
      const remove=document.createElement('button');remove.className='mini-remove';remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`Eliminar jugador ${index+1}`);remove.disabled=game.players.length<=2;remove.addEventListener('click',()=>{game.players.splice(index,1);onStructureChange?.();});row.append(input,remove);list.appendChild(row);
    });
  }
  function localActivePlayers(game){return (game?.players||[]).map(player=>({id:String(player.id),name:String(player.name||player.id)}));}
  function ageLocalSnapshot(){
    const game=state.ageLocal||{},players=localActivePlayers(game),activePlayers=Object.fromEntries(players.map(player=>[player.id,true]));
    return {game:{gameType:GAME_TYPES.AGE,phase:game.phase,currentRound:game.round,totalRounds:game.totalRounds,prepEndsAt:game.prepEndsAt||null,activePlayers,playerNames:Object.fromEntries(players.map(player=>[player.id,player.name])),ageTargetsByPlayer:game.targets||{},ageEstimates:game.estimates||{},ageSubmitted:Object.fromEntries(Object.keys(game.estimates||{}).map(id=>[id,true])),roundResults:game.roundResults||null,scores:game.scores||{}},players:Object.fromEntries(players.map(player=>[player.id,player]))};
  }
  function createAgeLocalState(){return {players:[{id:'local-age-1',name:'Jugador 1'},{id:'local-age-2',name:'Jugador 2'}],totalRounds:Math.max(1,Number(ageData.defaultRounds)||3),round:0,phase:'setup',targets:{},estimates:{},scores:{},playerIndex:0,roundResults:null,prepEndsAt:null,finalRevealPlayerId:''};}
  function renderAgeLocalSetup(){
    const game=state.ageLocal||createAgeLocalState();state.ageLocal=game;localPlayerNames('ageLocalPlayers',game,()=>renderAgeLocalSetup());setText('ageLocalRoundsValue',game.totalRounds);
    const minus=$('ageLocalRoundsMinusBtn'),plus=$('ageLocalRoundsPlusBtn');if(minus)minus.disabled=game.totalRounds<=1;if(plus)plus.disabled=game.totalRounds>=20;
  }
  function setAgeSetupMode(local){
    const onlinePanel=$('ageOnlineSetupPanel'),localPanel=$('ageLocalSetupPanel'),onlineBtn=$('ageOnlineModeBtn'),localBtn=$('ageLocalModeBtn');
    onlinePanel?.classList.toggle('hidden',Boolean(local));localPanel?.classList.toggle('hidden',!local);onlineBtn?.classList.toggle('selected',!local);localBtn?.classList.toggle('selected',Boolean(local));
    if(local){state.mode='local';state.ageLocal=state.ageLocal&&state.ageLocal.phase==='setup'?state.ageLocal:createAgeLocalState();renderAgeLocalSetup();}else{state.mode=null;state.ageLocal=null;}
  }
  function updateAgeLocalRounds(delta){const game=state.ageLocal||createAgeLocalState();game.totalRounds=Math.min(20,Math.max(1,(Number(game.totalRounds)||3)+Number(delta||0)));state.ageLocal=game;renderAgeLocalSetup();}
  function openAgeLocalSetup(){state.gameType=GAME_TYPES.AGE;state.ageLocal=createAgeLocalState();setAgeSetupMode(true);show('ageSetup');}
  function startAgeLocal(){
    const game=state.ageLocal||createAgeLocalState();game.players=localActivePlayers(game).map((player,index)=>({id:`local-age-${index+1}`,name:player.name.trim().slice(0,30)})).filter(player=>player.name);
    if(game.players.length<2){miniNotice('ageSetupNotice','Agrega al menos 2 jugadores.','error');return;}
    game.round=1;game.phase='handoff';game.playerIndex=0;game.scores=Object.fromEntries(game.players.map(player=>[player.id,0]));game.roundResults=null;game.finalRevealPlayerId='';game.targets=generateAgeTargets(game.players);game.estimates={};game.prepEndsAt=serverNow()+LOCAL_PHONE_HANDOFF_DURATION_MS;state.ageLocal=game;state.gameType=GAME_TYPES.AGE;state.mode='local';state.roomRef=null;state.roomCode='';state.lastRoomData=ageLocalSnapshot();show('agePreparation');renderAgePreparation(state.lastRoomData);void requestScreenWakeLock();void requestAgeOrientationLock();startMiniCountdown({phase:'localAgeHandoff',round:game.round,endsAt:game.prepEndsAt,elementId:'agePrepCountdown',onTick:seconds=>renderAgePreparation(state.lastRoomData,seconds),onZero:startAgeLocalReveal});
  }
  function startAgeLocalReveal(){
    const game=state.ageLocal;if(!game)return;clearMiniCountdown();game.phase='reveal';state.lastRoomData=ageLocalSnapshot();show('ageReveal');renderAgeReveal(state.lastRoomData);void requestScreenWakeLock();
  }
  function continueAgeLocalReveal(){
    const game=state.ageLocal;if(!game||game.phase!=='reveal')return;game.playerIndex++;
    if(game.playerIndex<game.players.length){game.phase='handoff';game.prepEndsAt=serverNow()+LOCAL_PHONE_HANDOFF_DURATION_MS;state.lastRoomData=ageLocalSnapshot();show('agePreparation');renderAgePreparation(state.lastRoomData);void requestScreenWakeLock();startMiniCountdown({phase:'localAgeHandoff',round:game.round,endsAt:game.prepEndsAt,elementId:'agePrepCountdown',onTick:seconds=>renderAgePreparation(state.lastRoomData,seconds),onZero:startAgeLocalReveal});return;}
    game.phase='finalReveal';game.finalRevealPlayerId='';state.lastRoomData=ageLocalSnapshot();show('ageLocalFinalReveal');renderAgeLocalFinalReveal();void releaseScreenWakeLock();
  }
  function renderAgeLocalFinalReveal(){
    const game=state.ageLocal,list=$('ageLocalFinalList');if(!game||!list)return;
    list.innerHTML=game.players.map(player=>{const id=String(player.id),revealed=String(game.finalRevealPlayerId||'')===id,target=game.targets?.[id],value=isValidAgeTarget(target)?`${target} AÑOS`:'EDAD PENDIENTE';return `<button class="local-final-reveal-item${revealed?' revealed':''}" type="button" role="listitem" data-local-age-final="${escapeHtml(id)}" aria-expanded="${revealed?'true':'false'}"><span class="local-final-reveal-name">${escapeHtml(cleanUiText(player.name))}</span><span class="local-final-reveal-value">${revealed?escapeHtml(value):'🔒 OCULTO'}</span></button>`;}).join('');
    list.querySelectorAll('[data-local-age-final]').forEach(button=>button.addEventListener('click',()=>{const id=String(button.dataset.localAgeFinal||'');game.finalRevealPlayerId=String(game.finalRevealPlayerId||'')===id?'':id;renderAgeLocalFinalReveal();}));
  }
  function submitAgeLocalEstimate(){
    const game=state.ageLocal;if(!game||game.phase!=='playing')return;const input=$('ageEstimateInput'),raw=String(input?.value??'').trim(),value=Number(raw);
    if(!/^\d+$/.test(raw)||!Number.isSafeInteger(value)||value<ageData.minAge||value>ageData.maxAge){miniNotice('agePlayingNotice',`Escribe un número entero entre ${ageData.minAge} y ${ageData.maxAge.toLocaleString('es-CL')}.`,'error');return;}
    const player=game.players[game.playerIndex];if(!player)return;game.estimates[player.id]=value;game.phase='handoff';state.ageLocalEstimate='';if(input)input.value='';state.lastRoomData=ageLocalSnapshot();renderAgePlaying(state.lastRoomData);
  }
  function continueAgeLocalPlayer(){
    const game=state.ageLocal;if(!game||game.phase!=='handoff')return;game.playerIndex++;
    if(game.playerIndex<game.players.length){game.phase='reveal';state.lastRoomData=ageLocalSnapshot();show('ageReveal');renderAgeReveal(state.lastRoomData);return;}
    finalizeAgeLocalRound();
  }
  function finalizeAgeLocalRound(){
    const game=state.ageLocal;if(!game)return;const rows=game.players.map(player=>{const target=Number(game.targets[player.id]),estimate=Number(game.estimates[player.id]),valid=Number.isSafeInteger(estimate)&&estimate>=ageData.minAge&&estimate<=ageData.maxAge,distance=valid?Math.abs(estimate-target):null;return {playerId:player.id,name:player.name,targetAge:target,estimate:valid?estimate:null,distance,valid};}).sort((a,b)=>{if(a.valid!==b.valid)return a.valid?-1:1;if(!a.valid)return a.name.localeCompare(b.name,'es');return a.distance-b.distance||a.name.localeCompare(b.name,'es');});
    let index=0,rank=1;while(index<rows.length){const first=rows[index],start=index;let end=index+1;if(first.valid)while(end<rows.length&&rows[end].valid&&rows[end].distance===first.distance)end++;else end=rows.length;const groupSize=end-start,points=first.valid?(rank===1?3:rank===2?2:rank===3?1:0):0;for(let i=start;i<end;i++){const row=rows[i];row.rank=rank;row.points=points;row.tie=first.valid&&groupSize>1;game.scores[row.playerId]=(Number(game.scores[row.playerId])||0)+points;}index=end;rank+=groupSize;}
    game.roundResults={type:'age',round:game.round,standings:rows,completedAt:Date.now(),reason:'all-submitted'};game.phase='results';state.lastRoomData=ageLocalSnapshot();show('miniResults');renderMiniResults(state.lastRoomData,GAME_TYPES.AGE);
  }
  function nextAgeLocalRound(){
    const game=state.ageLocal;if(!game)return;if(game.round>=game.totalRounds){game.phase='finished';state.lastRoomData=ageLocalSnapshot();show('miniFinish');renderMiniFinished(state.lastRoomData);return;}
    game.round++;game.phase='handoff';game.playerIndex=0;game.targets=generateAgeTargets(game.players);game.estimates={};game.finalRevealPlayerId='';game.roundResults=null;game.prepEndsAt=serverNow()+LOCAL_PHONE_HANDOFF_DURATION_MS;state.lastRoomData=ageLocalSnapshot();show('agePreparation');renderAgePreparation(state.lastRoomData);void requestScreenWakeLock();startMiniCountdown({phase:'localAgeHandoff',round:game.round,endsAt:game.prepEndsAt,elementId:'agePrepCountdown',onTick:seconds=>renderAgePreparation(state.lastRoomData,seconds),onZero:startAgeLocalReveal});
  }
  function finishAgeLocal(){clearMiniCountdown();state.ageLocal=null;state.lastRoomData=null;state.mode=null;state.gameType=null;resetHistory();show('home',{history:false});}

  function confessionsLocalSnapshot(){
    const game=state.confessionsLocal||{},players=localActivePlayers(game),activePlayers=Object.fromEntries(players.map(player=>[player.id,true]));
    return {game:{gameType:GAME_TYPES.CONFESSIONS,phase:game.phase,currentRound:game.round,totalRounds:game.totalRounds,activePlayers,playerNames:Object.fromEntries(players.map(player=>[player.id,player.name])),confessions:game.confessions||{},confessionOrder:game.order||[],confessionIndex:game.index||0,confessionCurrentId:game.order?.[game.index||0]||'',confessionVotes:game.votes?.[game.order?.[game.index||0]]||{},roundResults:game.roundResults||null,scores:game.scores||{}},players:Object.fromEntries(players.map(player=>[player.id,player]))};
  }
  function createConfessionsLocalState(){return {players:[{id:'local-conf-1',name:'Jugador 1'},{id:'local-conf-2',name:'Jugador 2'}],phase:'setup',writingIndex:0,round:0,totalRounds:0,confessions:{},order:[],index:0,voterIndex:0,votes:{},scores:{},roundResults:null};}
  function renderConfessionsLocalSetup(){const game=state.confessionsLocal||createConfessionsLocalState();state.confessionsLocal=game;localPlayerNames('confessionsLocalPlayers',game,()=>renderConfessionsLocalSetup());}
  function setConfessionsSetupMode(local){const onlinePanel=$('confessionsOnlineSetupPanel'),localPanel=$('confessionsLocalSetupPanel'),onlineBtn=$('confessionsOnlineModeBtn'),localBtn=$('confessionsLocalModeBtn');onlinePanel?.classList.toggle('hidden',Boolean(local));localPanel?.classList.toggle('hidden',!local);onlineBtn?.classList.toggle('selected',!local);localBtn?.classList.toggle('selected',Boolean(local));if(local){state.mode='local';state.confessionsLocal=state.confessionsLocal&&state.confessionsLocal.phase==='setup'?state.confessionsLocal:createConfessionsLocalState();renderConfessionsLocalSetup();}else{state.mode=null;state.confessionsLocal=null;}}
  function openConfessionsLocalSetup(){state.gameType=GAME_TYPES.CONFESSIONS;state.confessionsLocal=createConfessionsLocalState();setConfessionsSetupMode(true);show('confessionsSetup');}
  function startConfessionsLocal(){
    const game=state.confessionsLocal||createConfessionsLocalState();game.players=localActivePlayers(game).map((player,index)=>({id:`local-conf-${index+1}`,name:player.name.trim().slice(0,30)})).filter(player=>player.name);if(game.players.length<2){miniNotice('confessionsSetupNotice','Agrega al menos 2 jugadores.','error');return;}
    game.phase='writing';game.writingIndex=0;game.round=1;game.totalRounds=game.players.length;game.confessions={};game.order=[];game.index=0;game.voterIndex=0;game.votes={};game.scores=Object.fromEntries(game.players.map(player=>[player.id,0]));game.roundResults=null;state.confessionsLocal=game;state.gameType=GAME_TYPES.CONFESSIONS;state.mode='local';state.roomRef=null;state.roomCode='';state.lastRoomData=confessionsLocalSnapshot();show('confessionsWriting');renderConfessionsWriting(state.lastRoomData);
  }
  function submitConfessionLocal(){
    const game=state.confessionsLocal;if(!game||game.phase!=='writing')return;const input=$('confessionInput'),text=String(input?.value||'').trim();if(!text){miniNotice('confessionsWritingNotice','Escribe una confesión antes de continuar.','error');input?.focus();return;}if(text.length>confessionsMaxLength){miniNotice('confessionsWritingNotice',`La confesión no puede superar los ${confessionsMaxLength} caracteres.`,'error');return;}
    const player=game.players[game.writingIndex],id=`local-confession-${game.writingIndex+1}`;game.confessions[id]={id,text,authorId:player.id,used:false};if(input)input.value='';if(game.writingIndex<game.players.length-1){game.phase='handoff';}else{game.order=shuffleArray(Object.keys(game.confessions));game.index=0;game.voterIndex=0;game.votes={};game.round=1;game.totalRounds=game.order.length;game.phase='voting';}state.lastRoomData=confessionsLocalSnapshot();if(game.phase==='voting'){show('confessionsVoting');renderConfessionsVoting(state.lastRoomData);}else renderConfessionsWriting(state.lastRoomData);
  }
  function continueConfessionsLocalWriting(){const game=state.confessionsLocal;if(!game||game.phase!=='handoff')return;game.writingIndex++;game.phase='writing';state.lastRoomData=confessionsLocalSnapshot();renderConfessionsWriting(state.lastRoomData);}
  function finalizeConfessionsLocalRound(){
    const game=state.confessionsLocal,confession=game?.confessions?.[game.order?.[game.index]];if(!game||!confession)return;const voters=game.players.filter(player=>player.id!==confession.authorId),votes=game.votes[confession.id]||{},counts=Object.fromEntries(game.players.map(player=>[player.id,0]));voters.forEach(player=>{const target=votes[player.id];if(target&&counts[target]!==undefined)counts[target]++;});const correctVoters=voters.filter(player=>String(votes[player.id]||'')===String(confession.authorId)),correctCount=correctVoters.length,points={};game.players.forEach(player=>{points[player.id]=correctVoters.some(voter=>voter.id===player.id)?(correctCount===1?3:2):0;});if(correctCount===0)points[confession.authorId]=3;game.players.forEach(player=>{game.scores[player.id]=(Number(game.scores[player.id])||0)+(Number(points[player.id])||0);});game.roundResults={type:'confessions',round:game.round,confessionId:confession.id,text:confession.text,authorId:confession.authorId,voteCounts:game.players.map(player=>({playerId:player.id,name:player.name,votes:counts[player.id]||0})),votes,correctVoters:correctVoters.map(player=>player.id),correctCount,playerOutcomes:game.players.map(player=>({playerId:player.id,name:player.name,isAuthor:player.id===confession.authorId,correct:correctVoters.some(voter=>voter.id===player.id),points:points[player.id]||0}))};game.phase='result';state.lastRoomData=confessionsLocalSnapshot();show('confessionsResults');renderConfessionsResults(state.lastRoomData);
  }
  function nextConfessionsLocalResult(){const game=state.confessionsLocal;if(!game||game.phase!=='result')return;game.phase='scoreboard';state.lastRoomData=confessionsLocalSnapshot();show('confessionsScoreboard');renderConfessionsScoreboard(state.lastRoomData);}
  function nextConfessionsLocalScoreboard(){const game=state.confessionsLocal;if(!game||game.phase!=='scoreboard')return;if(game.index>=game.order.length-1){game.phase='finished';state.lastRoomData=confessionsLocalSnapshot();show('miniFinish');renderMiniFinished(state.lastRoomData);return;}game.index++;game.round=game.index+1;game.voterIndex=0;game.votes={};game.phase='voting';state.lastRoomData=confessionsLocalSnapshot();show('confessionsVoting');renderConfessionsVoting(state.lastRoomData);}
  function finishConfessionsLocal(){state.confessionsLocal=null;state.lastRoomData=null;state.mode=null;state.gameType=null;resetHistory();show('home',{history:false});}
  function saveChupisticaState(){
    if(!state.chupistica)return;
    try{localStorage.setItem('qs_chupistica_state',JSON.stringify(state.chupistica));}catch(error){console.warn('No se pudo guardar Cultura Chupística',error);}
  }
  function loadChupisticaState(){
    if(state.chupistica)return state.chupistica;
    let saved=null;try{saved=JSON.parse(localStorage.getItem('qs_chupistica_state')||'null');}catch(error){}
    const players=Array.isArray(saved?.players)?saved.players.map(name=>String(name||'').trim().slice(0,30)).filter(Boolean).slice(0,20):[];
    state.chupistica={players:players.length>=2?players:['Jugador 1','Jugador 2'],direction:saved?.direction==='left'?'left':'right',round:Math.max(0,Number(saved?.round)||0),usedCategories:Array.isArray(saved?.usedCategories)?saved.usedCategories.map(String):[],currentPlayer:String(saved?.currentPlayer||''),currentCategory:String(saved?.currentCategory||''),phase:String(saved?.phase||'setup'),runId:0};
    return state.chupistica;
  }
  function clearChupisticaTimers(){(state.chupisticaTimers||[]).forEach(timer=>clearTimeout(timer));state.chupisticaTimers=[];if(state.chupistica)state.chupistica.runId=(state.chupistica.runId||0)+1;}
  function renderChupisticaNames(){
    const game=loadChupisticaState(),list=$('chupisticaNames');if(!list)return;list.replaceChildren();
    game.players.forEach((name,index)=>{
      const row=document.createElement('div');row.className='mini-name-row';
      const input=document.createElement('input');input.className='input';input.maxLength=30;input.value=name;input.placeholder=`Jugador ${index+1}`;input.setAttribute('aria-label',`Nombre del jugador ${index+1}`);input.addEventListener('input',event=>{game.players[index]=event.target.value.slice(0,30);saveChupisticaState();});
      const remove=document.createElement('button');remove.className='mini-remove';remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`Eliminar jugador ${index+1}`);remove.disabled=game.players.length<=2;remove.addEventListener('click',()=>{game.players.splice(index,1);saveChupisticaState();renderChupisticaNames();});row.append(input,remove);list.appendChild(row);
    });
  }
  function openChupisticaSetup(){
    clearChupisticaTimers();clearMiniCountdown();state.gameType=GAME_TYPES.CHUPISTICA;const game=loadChupisticaState();game.phase='setup';renderChupisticaNames();document.querySelector(`input[name="chupisticaDirection"][value="${game.direction}"]`)?.click();show('chupisticaSetup');
  }
  function spinRoulette(values,target,duration,runId){
    return new Promise(resolve=>{
      const list=(values||[]).filter(Boolean),started=performance.now();if(!list.length){resolve('');return;}
      let index=Math.floor(Math.random()*list.length);
      const step=()=>{
        if(!state.chupistica||state.chupistica.runId!==runId){resolve('');return;}
        const elapsed=performance.now()-started;target.textContent=cleanUiText(list[index%list.length]);
        if(elapsed>=duration){target.classList.remove('winner');void target.offsetWidth;target.classList.add('winner');resolve(list[index%list.length]);return;}
        index+=Math.max(1,Math.floor(Math.random()*3));const progress=elapsed/duration,delay=Math.round(45+Math.pow(progress,2.1)*165);const timer=window.setTimeout(step,delay);state.chupisticaTimers.push(timer);
      };step();
    });
  }
  async function runChupisticaRound(){
    clearChupisticaTimers();const game=loadChupisticaState(),runId=game.runId||0;game.phase='spinning';game.round=Math.max(1,Number(game.round)||1);saveChupisticaState();
    const playerWheel=$('chupisticaPlayerWheel'),categoryWheel=$('chupisticaCategoryWheel');$('chupisticaNextRoundBtn').classList.add('hidden');setText('chupisticaWheelStatus','Elige quién comienza…');setText('chupisticaRoundLabel',`RONDA ${game.round}`);setText('chupisticaDirectionLabel',game.direction==='left'?'⬅️ Continúa hacia la izquierda':'➡️ Continúa hacia la derecha');const roster=$('chupisticaWheelPlayers');if(roster)roster.innerHTML=game.players.map(name=>`<span>${escapeHtml(cleanUiText(name))}</span>`).join('');
    const player=await spinRoulette(game.players,playerWheel,1700,runId);if(!player||!state.chupistica||state.chupistica.runId!==runId)return;game.currentPlayer=player;setText('chupisticaWheelStatus','Ahora elige la categoría…');
    const candidates=CULTURA_CHUPISTICA_CATEGORIES.filter(category=>game.usedCategories.length< CULTURA_CHUPISTICA_CATEGORIES.length?category!==game.usedCategories.at(-1):true),category=await spinRoulette(candidates,categoryWheel,1900,runId);if(!category)return;
    game.currentCategory=category;game.usedCategories.push(category);if(game.usedCategories.length>=CULTURA_CHUPISTICA_CATEGORIES.length)game.usedCategories=[];game.phase='result';saveChupisticaState();setText('chupisticaWheelStatus',`¡${cleanUiText(player).toUpperCase()} COMIENZA!`);$('chupisticaNextRoundBtn').classList.remove('hidden');haptic([35,80,35]);
  }
  function startChupistica(){
    const game=loadChupisticaState();game.players=game.players.map(name=>String(name||'').trim()).filter(Boolean).slice(0,20);game.direction=document.querySelector('input[name="chupisticaDirection"]:checked')?.value==='left'?'left':'right';
    if(game.players.length<2){miniNotice('chupisticaNotice','Agrega al menos 2 jugadores.','error');return;}
    if(game.players.some(name=>name.length<1)){miniNotice('chupisticaNotice','Completa todos los nombres.','error');return;}
    game.round=1;game.usedCategories=[];game.phase='result';saveChupisticaState();clearChupisticaTimers();show('chupisticaWheel');void runChupisticaRound();
  }
  function nextChupisticaRound(){const game=loadChupisticaState();game.round=Math.max(1,Number(game.round)||1)+1;game.phase='result';saveChupisticaState();void runChupisticaRound();}
  function restoreChupisticaSession(){
    let saved=null;try{saved=JSON.parse(localStorage.getItem('qs_chupistica_state')||'null');}catch(error){}
    if(saved?.phase==='result'&&Array.isArray(saved.players)&&saved.players.length>=2){state.chupistica=saved;state.gameType=GAME_TYPES.CHUPISTICA;setText('chupisticaRoundLabel',`RONDA ${saved.round||1}`);setText('chupisticaPlayerWheel',cleanUiText(saved.currentPlayer));setText('chupisticaCategoryWheel',cleanUiText(saved.currentCategory).toUpperCase());setText('chupisticaDirectionLabel',saved.direction==='left'?'⬅️ Continúa hacia la izquierda':'➡️ Continúa hacia la derecha');setText('chupisticaWheelStatus',`¡${cleanUiText(saved.currentPlayer).toUpperCase()} COMIENZA!`);const roster=$('chupisticaWheelPlayers');if(roster)roster.innerHTML=saved.players.map(name=>`<span>${escapeHtml(cleanUiText(name))}</span>`).join('');$('chupisticaNextRoundBtn')?.classList.remove('hidden');}
  }
  function defaultChamuyayaConfig(){return {chaMuyaCount:1,totalRounds:CHAMUYA_DEFAULT_ROUNDS};}
  function defaultTribunalConfig(){return {totalRounds:TRIBUNAL_DEFAULT_ROUNDS};}
  function chamuyayaCountFromData(data){return Math.max(1,Number(data?.settings?.chamuyaya?.chaMuyaCount||1));}
  function tribunalConfigFromUI(){return {totalRounds:[3,5,10].includes(Number($('tribunalRoundsSelect')?.value))?Number($('tribunalRoundsSelect').value):TRIBUNAL_DEFAULT_ROUNDS};}
  function tribunalConfigFromData(data){return data?.settings?.tribunal||defaultTribunalConfig();}
  function chamuyayaPrivateAssignment(game=state.lastRoomData?.game||{}){const value=state.chamuyayaPrivateAssignment||{};return value.round===Number(game.currentRound)&&String(value.roundToken||'')===String(game.roundToken||'')?value:null;}
  function tribunalPrivateAssignment(game=state.lastRoomData?.game||{}){const value=state.tribunalPrivateAssignment||{};return value.round===Number(game.currentRound)&&String(value.roundToken||'')===String(game.roundToken||'')?value:null;}
  function isTribunalJudge(){return String(state.tribunalPrivateAssignment?.role||'')==='juez';}
  function isTribunalVoter(game,id=state.playerId){if(String(id)!==String(state.playerId))return false;const role=String(state.tribunalPrivateAssignment?.role||'');return role==='juez'||role==='jurado';}
  function localChamuyayaSave(){try{localStorage.setItem('qs_chamuyaya_local',JSON.stringify(state.chamuyayaLocal||null));}catch(error){console.warn('No se pudo guardar ChaMuYa2 local',error);}}
  function localChamuyayaLoad(){if(state.chamuyayaLocal)return state.chamuyayaLocal;let saved=null;try{saved=JSON.parse(localStorage.getItem('qs_chamuyaya_local')||'null');}catch(error){}state.chamuyayaLocal=saved&&Array.isArray(saved.players)?saved:null;return state.chamuyayaLocal;}
  function createChamuyayaLocalState(){return {players:[{id:'local-1',name:'Jugador 1'},{id:'local-2',name:'Jugador 2'}],chaMuyaCount:1,totalRounds:CHAMUYA_DEFAULT_ROUNDS,round:0,usedDataIds:[],dataId:null,dataIdsByPlayer:{},chaMuyaIds:[],phase:'setup',revealIndex:0,revealVisible:false,discussionVisible:false,voterIndex:0,selectedVotes:[],votes:[]};}
  function renderChamuyayaLocalPlayers(){const game=localChamuyayaLoad()||createChamuyayaLocalState();state.chamuyayaLocal=game;const list=$('chamuyayaLocalPlayers');if(!list)return;list.replaceChildren();game.players.forEach((player,index)=>{const row=document.createElement('div');row.className='local-player-row';const input=document.createElement('input');input.className='input';input.maxLength=30;input.value=player.name;input.placeholder='Jugador '+(index+1);input.setAttribute('aria-label','Nombre del jugador '+(index+1));input.addEventListener('input',event=>{player.name=String(event.target.value||'').slice(0,30);localChamuyayaSave();});const remove=document.createElement('button');remove.className='local-player-remove';remove.type='button';remove.textContent='×';remove.disabled=game.players.length<=2;remove.setAttribute('aria-label','Eliminar '+player.name);remove.addEventListener('click',()=>{game.players.splice(index,1);game.chaMuyaCount=Math.min(game.chaMuyaCount,Math.max(1,game.players.length-1));localChamuyayaSave();renderChamuyayaLocalPlayers();renderChamuyayaLocalSetup();});row.append(input,remove);list.appendChild(row);});}
  function renderChamuyayaLocalSetup(){const game=localChamuyayaLoad()||createChamuyayaLocalState();state.chamuyayaLocal=game;renderChamuyayaLocalPlayers();setText('chamuyayaLocalCountValue',game.chaMuyaCount);const minus=$('chamuyayaLocalCountMinusBtn'),plus=$('chamuyayaLocalCountPlusBtn');if(minus)minus.disabled=game.chaMuyaCount<=1;if(plus)plus.disabled=game.chaMuyaCount>=Math.max(1,game.players.length-1);}
  function startChamuyayaLocal(){const game=localChamuyayaLoad()||createChamuyayaLocalState();game.players=game.players.map((player,index)=>({id:'local-'+(index+1),name:String(player.name||'').trim().slice(0,30)})).filter(player=>player.name);if(game.players.length<2){miniNotice('chamuyayaLocalNotice','Agrega al menos 2 jugadores.','error');return;}if(game.chaMuyaCount<1||game.chaMuyaCount>=game.players.length){miniNotice('chamuyayaLocalNotice','Debe quedar al menos un jugador normal.','error');return;}game.round=1;game.usedDataIds=[];state.chamuyayaLocal=game;localChamuyayaSave();startChamuyayaLocalRound();}
  function startChamuyayaLocalRound(){const game=state.chamuyayaLocal||createChamuyayaLocalState(),chaCount=Math.max(1,Math.min(game.players.length-1,Number(game.chaMuyaCount)||1)),normalCount=game.players.length-chaCount,used=Array.isArray(game.usedDataIds)?game.usedDataIds.map(Number):[],available=chamuyayaCatalog.filter(item=>!used.includes(Number(item.id))),remainingRounds=Math.max(1,Number(game.totalRounds||CHAMUYA_DEFAULT_ROUNDS)-Number(game.round||1)+1),requiredDataCount=normalCount*remainingRounds;if(available.length<requiredDataCount){miniNotice('chamuyayaLocalNotice','No hay suficientes datos distintos para terminar esta partida sin repeticiones. Se necesitan '+requiredDataCount+' y quedan '+available.length+'. Agrega más datos en data/chamuyaya/data.js.','error');return;}const dataPool=shuffleArray(available).slice(0,normalCount);game.chaMuyaIds=shuffleArray(game.players.map(player=>player.id)).slice(0,chaCount);const normalPlayers=game.players.filter(player=>!game.chaMuyaIds.includes(player.id));game.chaMuyaCount=chaCount;game.dataIdsByPlayer={};normalPlayers.forEach((player,index)=>{game.dataIdsByPlayer[player.id]=Number(dataPool[index].id);});game.dataId=Number(dataPool[0]?.id||0);game.usedDataIds=[...new Set([...used,...dataPool.map(item=>Number(item.id))])];game.phase='reveal';game.revealIndex=0;game.revealVisible=false;game.discussionVisible=false;game.selectedVotes=[];game.voterIndex=0;game.votes=[];localChamuyayaSave();show('chamuyayaLocalReveal');renderChamuyayaLocalReveal();}
  function renderChamuyayaLocalReveal(){const game=state.chamuyayaLocal||{},player=game.players?.[game.revealIndex]||{},isCha=(game.chaMuyaIds||[]).includes(player.id),dataId=game.dataIdsByPlayer?.[player.id]??game.dataId;setText('chamuyayaLocalRevealRoundLabel','RONDA '+game.round+' DE '+game.totalRounds);setText('chamuyayaLocalTurnLabel','👤 LE TOCA A '+String(player.name||'').toUpperCase());const label=$('chamuyayaLocalRoleLabel'),name=$('chamuyayaLocalRoleName'),data=$('chamuyayaLocalData'),hidden=$('chamuyayaLocalHidden'),toggle=$('chamuyayaLocalToggleBtn'),next=$('chamuyayaLocalNextPlayerBtn'),visible=game.revealVisible===true;if(label)label.textContent=visible?(isCha?'🎭 TE TOCÓ':'🧠 TE TOCÓ'):'🔒 TU CARTA';if(name){name.textContent=isCha?'ChaMuYa':'EL DATO';name.classList.toggle('hidden',!visible);}if(data){data.textContent=visible&&!isCha?(chamuyayaDataById(dataId)?.dato||''):' ';data.classList.toggle('hidden',!visible||isCha);}if(hidden)hidden.classList.toggle('hidden',visible);if(toggle)toggle.textContent=visible?'OCULTAR':'VER MI CARTA';if(next){next.classList.toggle('hidden',!visible);next.textContent=game.revealIndex>=game.players.length-1?'OCULTAR Y COMENZAR DISCUSIÓN':'OCULTAR Y PASAR';}setText('chamuyayaLocalRevealStatus',visible?'Cuando termines, oculta la carta antes de pasar el celular.':'Nadie más debe mirar la pantalla.');}
  function toggleChamuyayaLocalReveal(){const game=state.chamuyayaLocal;if(!game)return;game.revealVisible=!game.revealVisible;localChamuyayaSave();renderChamuyayaLocalReveal();}
  function nextChamuyayaLocalPlayer(){const game=state.chamuyayaLocal;if(!game)return;game.revealVisible=false;if(game.revealIndex<game.players.length-1){game.revealIndex++;localChamuyayaSave();renderChamuyayaLocalReveal();return;}game.phase='discussion';game.discussionVisible=false;localChamuyayaSave();show('chamuyayaLocalDiscussion');renderChamuyayaLocalDiscussion();}
  function renderChamuyayaLocalDiscussion(){const game=state.chamuyayaLocal||{},player=game.players?.[game.revealIndex]||{},isCha=(game.chaMuyaIds||[]).includes(player.id),dataId=game.dataIdsByPlayer?.[player.id]??game.dataId,visible=game.discussionVisible===true;setText('chamuyayaLocalDiscussionRoundLabel','RONDA '+game.round+' DE '+game.totalRounds);const role=$('chamuyayaLocalDiscussionRoleName'),data=$('chamuyayaLocalDiscussionData'),hidden=$('chamuyayaLocalDiscussionHidden'),toggle=$('chamuyayaLocalDiscussionToggleBtn');if(role){role.textContent=(isCha?'ChaMuYa':'EL DATO')+' · '+player.name;role.classList.toggle('hidden',!visible);}if(data){data.textContent=!isCha&&visible?(chamuyayaDataById(dataId)?.dato||''):'';data.classList.toggle('hidden',!visible||isCha);}if(hidden){hidden.classList.toggle('hidden',visible);hidden.innerHTML='<strong>🔒 CARTA OCULTA</strong>Entrega el celular a quien quiera consultar su propia carta.';}if(toggle)toggle.textContent=visible?'OCULTAR CARTA':'VER CARTA';}
  function toggleChamuyayaLocalDiscussionCard(){const game=state.chamuyayaLocal;if(!game)return;game.discussionVisible=!game.discussionVisible;localChamuyayaSave();renderChamuyayaLocalDiscussion();}
  function endChamuyayaLocalDiscussion(){const game=state.chamuyayaLocal;if(!game)return;game.phase='voting';game.voterIndex=0;game.selectedVotes=[];game.votes=[];localChamuyayaSave();show('chamuyayaLocalVoting');renderChamuyayaLocalVoting();}
  function renderChamuyayaLocalVoting(){const game=state.chamuyayaLocal||{},voter=game.players?.[game.voterIndex]||{},list=$('chamuyayaLocalVotingPlayers');setText('chamuyayaLocalVotingRoundLabel','RONDA '+game.round+' DE '+game.totalRounds);setText('chamuyayaLocalVoterLabel','👤 LE TOCA VOTAR A '+String(voter.name||'').toUpperCase());if(list)list.innerHTML=(game.players||[]).map(player=>{const selected=(game.selectedVotes||[]).includes(player.id);return '<button class="chamuyaya-vote-choice'+(selected?' selected':'')+'" type="button" data-local-chamuyaya-target="'+escapeHtml(player.id)+'" aria-pressed="'+(selected?'true':'false')+'">👤 '+escapeHtml(player.name)+(selected?' ✓':'')+'</button>';}).join('');if(list)list.querySelectorAll('[data-local-chamuyaya-target]').forEach(button=>button.addEventListener('click',()=>{const id=String(button.dataset.localChamuyayaTarget||''),selected=new Set(game.selectedVotes||[]);if(selected.has(id))selected.delete(id);else if(selected.size<game.chaMuyaCount)selected.add(id);game.selectedVotes=[...selected];localChamuyayaSave();renderChamuyayaLocalVoting();}));setText('chamuyayaLocalVotingStatus','Votante '+(game.voterIndex+1)+' de '+game.players.length+'. Puedes seleccionar hasta '+game.chaMuyaCount+'.');}
  function submitChamuyayaLocalVote(){const game=state.chamuyayaLocal;if(!game||!(game.selectedVotes||[]).length){miniNotice('chamuyayaLocalVotingStatus','Selecciona al menos una persona.','error');return;}game.votes[game.players[game.voterIndex].id]=[...game.selectedVotes];game.selectedVotes=[];if(game.voterIndex<game.players.length-1){game.voterIndex++;localChamuyayaSave();renderChamuyayaLocalVoting();return;}game.phase='result';const found=game.chaMuyaIds.filter(id=>game.players.some(player=>(game.votes[player.id]||[]).includes(id))),foundAll=found.length===game.chaMuyaIds.length;game.foundAll=foundAll;localChamuyayaSave();show('chamuyayaLocalResult');renderChamuyayaLocalResult();}
  function renderChamuyayaLocalResult(){const game=state.chamuyayaLocal||{},list=$('chamuyayaLocalResultRoles');if(list)list.innerHTML=(game.chaMuyaIds||[]).map(id=>'<div class="chamuyaya-end-row"><strong>🎭 '+escapeHtml(game.players.find(player=>player.id===id)?.name||'Jugador')+'</strong><span>ChaMuYa</span></div>').join('');const dataLines=(game.players||[]).filter(player=>!(game.chaMuyaIds||[]).includes(player.id)).map(player=>{const data=chamuyayaDataById(game.dataIdsByPlayer?.[player.id]??game.dataId);return data?'<div><strong>🧠 '+escapeHtml(player.name)+':</strong> '+escapeHtml(data.dato)+'</div>':'';}).filter(Boolean).join('');const resultData=$('chamuyayaLocalResultData');if(resultData)resultData.innerHTML='🧠 DATOS REALES'+(dataLines?'<br>'+dataLines:'<br>—');const winner=$('chamuyayaLocalResultWinner');if(winner){winner.className='tribunal-result-verdict '+(game.foundAll?'acquitted':'guilty');winner.textContent=game.foundAll?'🎉 ¡LOS JUGADORES GANARON!':'🎭 ¡LOS ChaMuYAS GANARON!';}const next=$('chamuyayaLocalNextRoundBtn');if(next)next.classList.toggle('hidden',game.round>=game.totalRounds);}
  function nextChamuyayaLocalRound(){const game=state.chamuyayaLocal;if(!game||game.round>=game.totalRounds)return;game.round++;localChamuyayaSave();startChamuyayaLocalRound();}
  function finishChamuyayaLocal(){state.chamuyayaLocal=null;try{localStorage.removeItem('qs_chamuyaya_local');}catch(error){}resetHistory();show('home',{history:false});}
  
  function confessionsModeFromUI(){return String(document.querySelector('input[name="confessionsRoundsMode"]:checked')?.value||'perPlayer');}
  function shuffleArray(values){const result=[...(values||[])];for(let index=result.length-1;index>0;index--){const swap=Math.floor(Math.random()*(index+1));[result[index],result[swap]]=[result[swap],result[index]];}return result;}
  function loadStopConfig(){
    if(state.stopConfig)return state.stopConfig;
    let saved=null;try{saved=JSON.parse(localStorage.getItem('qs_stop_config')||'null');}catch(error){}
    const defaults=defaultStopConfig();state.stopConfig={...defaults,...saved,totalRounds:[3,5,10,15].includes(Number(saved?.totalRounds))?Number(saved.totalRounds):defaults.totalRounds,timeSeconds:[30,45,60,90,120].includes(Number(saved?.timeSeconds))?Number(saved.timeSeconds):defaults.timeSeconds,letters:(Array.isArray(saved?.letters)?saved.letters:defaults.letters).filter(letter=>STOP_DEFAULT_LETTERS.includes(String(letter))),categories:Array.isArray(saved?.categories)?saved.categories.map(String):defaults.categories,customCategories:Array.isArray(saved?.customCategories)?saved.customCategories.map(String):[]};
    return state.stopConfig;
  }
  function saveStopConfig(){try{localStorage.setItem('qs_stop_config',JSON.stringify(state.stopConfig||defaultStopConfig()));}catch(error){console.warn('No se pudo guardar configuración de STOP',error);}}
  function renderStopConfig(){
    const config=loadStopConfig(),letters=$('stopLettersBox'),categories=$('stopCategoriesBox');
    if(letters){letters.replaceChildren();STOP_DEFAULT_LETTERS.forEach(letter=>{const button=document.createElement('button');button.type='button';button.className='stop-letter-chip'+(config.letters.includes(letter)?' selected':'');button.textContent=letter;button.setAttribute('aria-pressed',String(config.letters.includes(letter)));button.addEventListener('click',()=>{if(config.letters.includes(letter))config.letters=config.letters.filter(item=>item!==letter);else config.letters.push(letter);saveStopConfig();renderStopConfig();});letters.appendChild(button);});setText('stopToggleLettersBtn',config.letters.length===STOP_DEFAULT_LETTERS.length?'Quitar todas':'Seleccionar todas');}
    if(categories){categories.replaceChildren();STOP_DEFAULT_CATEGORIES.forEach(category=>{const button=document.createElement('button');button.type='button';button.className='stop-category-chip'+(config.categories.includes(category)?' selected':'');button.textContent=category;button.setAttribute('aria-pressed',String(config.categories.includes(category)));button.addEventListener('click',()=>{if(config.categories.includes(category))config.categories=config.categories.filter(item=>item!==category);else config.categories.push(category);saveStopConfig();renderStopConfig();});categories.appendChild(button);});setText('stopToggleCategoriesBtn',config.categories.length===STOP_DEFAULT_CATEGORIES.length+config.customCategories.length?'Quitar todas':'Seleccionar todas');}
    const customList=$('stopCustomCategoriesList');if(customList){customList.replaceChildren();config.customCategories.forEach((category,index)=>{const pill=document.createElement('button');pill.type='button';pill.className='custom-category-pill'+(config.categories.includes(category)?' selected':'');pill.setAttribute('aria-pressed',String(config.categories.includes(category)));pill.append(document.createTextNode(category));pill.addEventListener('click',event=>{if(event.target===remove)return;if(config.categories.includes(category))config.categories=config.categories.filter(item=>item!==category);else config.categories.push(category);saveStopConfig();renderStopConfig();});const remove=document.createElement('span');remove.textContent='×';remove.setAttribute('aria-label',`Eliminar categoría ${category}`);remove.addEventListener('click',event=>{event.stopPropagation();config.categories=config.categories.filter(item=>item!==category);config.customCategories.splice(index,1);saveStopConfig();renderStopConfig();});pill.appendChild(remove);customList.appendChild(pill);});}
    if($('stopRoundsSelect'))$('stopRoundsSelect').value=String(config.totalRounds);if($('stopTimeSelect'))$('stopTimeSelect').value=String(config.timeSeconds);
  }
  function resetGameModeContext(type){
    if(state.roomRef)return false;
    clearCountdown();clearMiniCountdown();clearChupisticaTimers();cancelReconnect();
    state.roomConnectionPaused=false;state.lastRoomData=null;state.roomCode='';state.mode=null;state.configEditing=false;state.gameType=type;
    if(type===GAME_TYPES.WHOAMI)state.whoamiLocal=null;
    if(type===GAME_TYPES.AGE)state.ageLocal=null;
    if(type===GAME_TYPES.CONFESSIONS)state.confessionsLocal=null;
    if(type===GAME_TYPES.CHAMUYA)state.chamuyayaLocal=null;
    return true;
  }
  function openGameModeSelector(type,screenId){
    if(!resetGameModeContext(type))return;
    show(screenId);
  }
  function leaveGameModeSelector(){
    if(state.roomRef)return;
    clearCountdown();clearMiniCountdown();state.mode=null;state.gameType=null;state.lastRoomData=null;resetHistory();show('minigames',{history:false});
  }
  function backToGameModeSelector(type,screenId){
    if(!resetGameModeContext(type))return;
    show(screenId,{history:false});
  }
  function openWhoamiOnlineSetup(){
    if(!resetGameModeContext(GAME_TYPES.WHOAMI))return;
    state.mode='host';state.roomRef=null;state.roomCode='';state.categories=[];state.playerName='';state.hostName='';roomIdentity();setTotalRounds(3);$('hostNameInput').value=accountUid()?accountUsername():'';setCategorySelection([]);openSettings(false);
  }
  function openAgeSetup(){
    openGameModeSelector(GAME_TYPES.AGE,'ageMode');
  }
  function openAgeOnlineSetup(){
    if(!resetGameModeContext(GAME_TYPES.AGE))return;state.miniConfig={totalRounds:Math.min(20,Math.max(1,Number(state.miniConfig?.totalRounds)||ageData.defaultRounds))};setText('ageRoundsValue',state.miniConfig.totalRounds);$('ageHostNameInput').value=accountUid()?accountUsername():state.playerName||'';setAgeSetupMode(false);show('ageSetup');
  }
  function openStopSetup(){
    state.gameType=GAME_TYPES.STOP;loadStopConfig();$('stopHostNameInput').value=accountUid()?accountUsername():state.playerName||'';renderStopConfig();show('stopSetup');
  }
  function openConfessionsSetup(){
    openGameModeSelector(GAME_TYPES.CONFESSIONS,'confessionsMode');
  }
  function openConfessionsOnlineSetup(){
    if(!resetGameModeContext(GAME_TYPES.CONFESSIONS))return;$('confessionsHostNameInput').value=accountUid()?accountUsername():state.playerName||'';document.querySelector('input[name="confessionsRoundsMode"][value="perPlayer"]')?.click();setConfessionsSetupMode(false);show('confessionsSetup');
  }
  function openChamuyayaHome(){openGameModeSelector(GAME_TYPES.CHAMUYA,'chamuyayaHome');}
  function openChamuyayaOnlineSetup(){if(!resetGameModeContext(GAME_TYPES.CHAMUYA))return;$('chamuyayaHostNameInput').value=accountUid()?accountUsername():state.playerName||'';show('chamuyayaOnlineSetup');}
  function openChamuyayaLocalSetup(){if(!resetGameModeContext(GAME_TYPES.CHAMUYA))return;state.chamuyayaLocal=localChamuyayaLoad()||createChamuyayaLocalState();state.mode='local';renderChamuyayaLocalSetup();show('chamuyayaSetup');}
  function openTribunalSetup(){state.gameType=GAME_TYPES.TRIBUNAL;$('tribunalHostNameInput').value=accountUid()?accountUsername():state.playerName||'';show('tribunalSetup');}
  async function updateChamuyayaCount(delta){if(!state.roomRef||state.mode!=='host')return;const data=state.lastRoomData||{},players=onlineRoomPlayers(data),max=Math.max(1,players.length-1),current=Math.max(1,Number(data.settings?.chamuyaya?.chaMuyaCount)||1),next=Math.max(1,Math.min(max,current+Number(delta||0)));await state.roomRef.child('settings/chamuyaya/chaMuyaCount').transaction(value=>Math.max(1,Math.min(max,Number(value||current)+Number(delta||0))));}
  function openMiniJoin(type){
    state.gameType=type;setText('joinGameTypeLabel',`${MINI_GAME_LABELS[type]||'JUGADOR'} · JUGADOR`);if(accountUid()&&!$('joinName').value)$('joinName').value=accountUsername();show('join');
  }
  function openGeneralJoin(){
    state.gameType='';setText('joinGameTypeLabel','TODOS LOS MINIJUEGOS');if(accountUid()&&!$('joinName').value)$('joinName').value=accountUsername();show('join');
  }
  async function joinAnyRoom(){
    if(!ensureFirebaseConfigured()||state.busy.join||state.globalJoinInFlight)return;
    const code=String($('joinRoomCode')?.value||'').trim().toUpperCase(),name=(accountUid()?accountUsername():String($('joinName')?.value||'').trim()).slice(0,30);
    if(!ROOM_CODE_PATTERN.test(code)){notice('Escribe un código de 5 caracteres.','error','joinNotice');return;}
    if(!name){notice('Escribe tu nombre.','error','joinNotice');return;}
    state.globalJoinInFlight=true;
    try{
      if(!auth.currentUser)await ensureRoomAuth();
      const directory=await readRoomDirectory(code),type=String(directory?.gameType||'').trim().toLowerCase(),route=routeRoomByGameType(type);
       if(!directory){state.roomRef=null;state.roomCode='';state.mode=null;notice('No existe una sala con ese código. Verifica el código.','error','joinNotice');return;}
       if(!route){notice('El código apunta a una sala con un juego desconocido o inválido. No se abrirá ninguna partida.','error','joinNotice');return;}
       state.gameType=type;
       if(route.join==='whoami'){await joinRoom();return;}
       await joinMiniRoom(type);return;
    }catch(error){console.error('[GENERAL JOIN]',error);notice('No se pudo detectar el minijuego de la sala. Revisa la conexión.','error','joinNotice');}
    finally{state.globalJoinInFlight=false;}
  }
  function currentMiniHostName(inputId){return (accountUid()?accountUsername():String($(inputId)?.value||'').trim()).slice(0,30);}
  function updateAgeRounds(delta){state.miniConfig={...(state.miniConfig||{}),totalRounds:Math.min(20,Math.max(1,(Number(state.miniConfig?.totalRounds)||ageData.defaultRounds)+delta))};setText('ageRoundsValue',state.miniConfig.totalRounds);}
  function addStopCategory(){
    const input=$('stopCustomCategoryInput'),value=String(input?.value||'').trim().replace(/\s+/g,' ').slice(0,50),config=loadStopConfig();if(!value)return;
    if(STOP_DEFAULT_CATEGORIES.some(item=>item.toLowerCase()===value.toLowerCase())||config.customCategories.some(item=>item.toLowerCase()===value.toLowerCase())){miniNotice('stopSetupNotice','Esa categoría ya existe.','error');return;}
    config.customCategories.push(value);config.categories.push(value);input.value='';saveStopConfig();renderStopConfig();
  }
  function stopToggleLetters(){const config=loadStopConfig();config.letters=config.letters.length===STOP_DEFAULT_LETTERS.length?[]:[...STOP_DEFAULT_LETTERS];saveStopConfig();renderStopConfig();}
  function stopToggleCategories(){const config=loadStopConfig(),all=[...STOP_DEFAULT_CATEGORIES,...config.customCategories];config.categories=config.categories.length===all.length?[]:all;saveStopConfig();renderStopConfig();}
  function stopConfigFromUI(){const config=loadStopConfig();config.totalRounds=Number($('stopRoundsSelect')?.value)||3;config.timeSeconds=Number($('stopTimeSelect')?.value)||60;saveStopConfig();return {...config,letters:[...config.letters],categories:[...config.categories],customCategories:[...config.customCategories]};}
  function renderLobby(data){
    state.lastRoomData=data||null;const players=onlineRoomPlayers(data),allPlayers=normalizeRoomPlayers(data),host=isHost(data),config=selectedRoomConfig(data);
    state.categories=config.categories;state.totalRounds=config.totalRounds;
    setText('roomCodeValue',state.roomCode);setText('lobbyCount',`${players.length} / 20 jugadores`);
    $('lobbyList').innerHTML=allPlayers.map(player=>{const online=isPlayerOnline(player),name=cleanUiText(player.name),initial=escapeHtml((name.replace(/[^A-Za-zÁÉÍÓÚÜÑa-záéíóúüñ0-9]/g,'').slice(0,1)||'?').toUpperCase()),role=player.id===data.hostId?'ANFITRIÓN':(online?'ONLINE':'OFFLINE');return `<div class="lobby-player" role="listitem"><div class="lobby-avatar">${initial}</div><div class="lobby-player-main"><div class="lobby-player-name">${escapeHtml(name)}</div><div class="lobby-player-status ${online?'online':'offline'}">${role==='ANFITRIÓN'?'Host':role}</div></div><span class="lobby-role">${player.id===data.hostId?'👑':''}</span></div>`;}).join('');
    const categoryChips=config.categories.length?config.categories.map(category=>`<span class="summary-chip">${escapeHtml(cleanUiText(category))}</span>`).join(''):'<span class="summary-chip">Sin temáticas</span>';
    $('settingsSummary').innerHTML=`<div><strong>Temáticas</strong></div><div class="summary-chips">${categoryChips}</div><div><strong>Rondas:</strong> ${config.totalRounds}</div>`;
    const stock=validateCardStock(players.length,config.categories,config.totalRounds);
    $('startRoomBtn').style.display=host?'block':'none';$('startRoomBtn').disabled=!host||players.length<2||data.game?.phase!=='lobby'||!stock.valid;
    $('editSettingsBtn').style.display=host?'block':'none';const inviteButton=$('inviteFriendsBtn');if(inviteButton){inviteButton.classList.toggle('hidden',!accountUid());inviteButton.disabled=!accountUid();}
    $('waitingHost').style.display=host?'none':'block';if(!host)setText('waitingHost','Esperando al anfitrión…');renderLobbyFriends();
    if(host&&data.game?.phase==='lobby'&&players.length>=2&&!stock.valid)notice(getCardStockMessage(stock),'error','lobbyNotice');
  }
  function openSettings(editing=false){
    state.configEditing=editing;
    state.whoamiLocal=null;
    setWhoamiSetupMode(false);
    renderCategories();
    $('hostNameInput').value=state.playerName||state.hostName||'';
    $('createRoomBtn').textContent=editing?'GUARDAR CONFIGURACIÓN':'CREAR SALA';
    setCategorySelection(state.categories);setTotalRounds(state.totalRounds);show('setup');void refreshSetupStockValidation();
  }
  function listenToRoom(){
    stopRoomListener();if(!state.roomRef)return;
    const ref=state.roomRef;state.roomListener=snapshot=>handleRoomSnapshot(snapshot.val());
    ref.on('value',state.roomListener,error=>{console.error('room value listener',error);if(state.roomConnectionPaused||state.reconnecting)return;notice('No se pudo leer la sala. Revisa la conexión y las reglas de Realtime Database.','error','lobbyNotice');});
    startRoomHeartbeat();
    if(state.gameType===GAME_TYPES.WHOAMI)listenToAssignments();else if([GAME_TYPES.CHAMUYA,GAME_TYPES.TRIBUNAL].includes(state.gameType))listenToMiniPrivateAssignment();else stopAssignmentListeners();
  }
  function stopRoomListener(){
    const ref=state.roomRef;if(ref&&state.roomListener)ref.off('value',state.roomListener);
    state.roomListener=null;stopRoomHeartbeat();clearAgePresenceCheck();
  }
  function stopRoomHeartbeat(){if(state.roomHeartbeatTimer){clearInterval(state.roomHeartbeatTimer);state.roomHeartbeatTimer=null;}}
  function startRoomHeartbeat(){
    stopRoomHeartbeat();if(!state.roomRef||!state.playerId)return;
    const playerRef=state.roomRef.child(`players/${state.playerId}`);
    const heartbeat=async()=>{if(!state.roomRef||!state.playerId||state.lastConnected===false)return;try{const player=(state.lastRoomData||{}).players?.[state.playerId]||{};if(player.status==='online'&&player.connected===true&&Number(player.lastSeen)>0&&serverNow()-Number(player.lastSeen)<4000)return;await playerRef.update({status:'online',connected:true,lastSeen:firebase.database.ServerValue.TIMESTAMP});}catch(error){console.warn('[HEARTBEAT] write failed',error);}};
    void heartbeat();state.roomHeartbeatTimer=window.setInterval(heartbeat,5000);
  }
  function attachRoom(code){state.roomCode=code;state.roomRef=db.ref('rooms/'+code);state.roomDirectorySyncKey='';}
  function clearPendingRoomContext(){
    // Unirse puede fallar después de reservar el nodo del jugador (por
    // ejemplo, si la sala se llenó o cambió de tipo). No dejamos una
    // referencia local huérfana que luego parezca una sala activa.
    if(state.roomListener)return;
    state.roomRef=null;state.roomCode='';state.mode=null;state.lastRoomData=null;state.roomDirectorySyncKey='';
  }
  function stopAssignmentListeners(){
    if(state.privateAssignmentRef&&state.privateAssignmentListener)state.privateAssignmentRef.off('value',state.privateAssignmentListener);
    if(state.privateAssignmentRecoveryTimer){clearTimeout(state.privateAssignmentRecoveryTimer);state.privateAssignmentRecoveryTimer=null;}
    state.privateAssignmentRecoveryAttempts=0;state.privateAssignmentRef=null;state.privateAssignmentListener=null;state.privateAssignment=null;state.myAssignment=null;
    stopMiniPrivateAssignmentListener();stopTribunalRevealListener();
  }
  function stopMiniPrivateAssignmentListener(){
    if(state.miniPrivateAssignmentRef&&state.miniPrivateAssignmentListener)state.miniPrivateAssignmentRef.off('value',state.miniPrivateAssignmentListener);
    state.miniPrivateAssignmentRef=null;state.miniPrivateAssignmentListener=null;state.miniPrivateAssignment=null;state.tribunalPrivateAssignment=null;state.chamuyayaPrivateAssignment=null;
  }
  function stopTribunalRevealListener(){
    if(state.tribunalRevealRef&&state.tribunalRevealListener)state.tribunalRevealRef.off('value',state.tribunalRevealListener);
    if(state.tribunalRevealDeadlineTimer){clearTimeout(state.tribunalRevealDeadlineTimer);state.tribunalRevealDeadlineTimer=null;}
    state.tribunalRevealRef=null;state.tribunalRevealListener=null;state.tribunalRevealToken='';state.tribunalRevealData=null;state.tribunalRevealPublishedToken='';state.tribunalRevealPublishInFlight=false;state.tribunalRevealFinalizeInFlight=false;
    state.tribunalRevealDeadlineKey='';
  }
  function tribunalRevealPath(roundToken=state.lastRoomData?.game?.roundToken){return `tribunalReveals/${state.roomCode}/${String(roundToken||'')}`;}
  async function publishTribunalReveal(data){
    const game=data?.game||{},token=String(game.roundToken||''),assignment=tribunalPrivateAssignment(game);
    if(!state.roomRef||game.phase!=='tribunalResult'||!token||!assignment?.role||state.tribunalRevealPublishedToken===token||state.tribunalRevealPublishInFlight)return false;
    state.tribunalRevealPublishInFlight=true;
    try{
      const revealRef=db.ref(`${tribunalRevealPath(token)}/${state.playerId}`),payload={playerId:String(state.playerId),round:Number(game.currentRound),roundToken:token,role:String(assignment.role)};
      await withTimeout(revealRef.transaction(current=>current||payload),7000,'tribunal-reveal-publish-timeout');
      state.tribunalRevealPublishedToken=token;return true;
    }catch(error){console.warn('[TRIBUNAL REVEAL] No se pudo publicar el rol propio.',{code:error?.code,message:error?.message,path:`${tribunalRevealPath(token)}/${state.playerId}`});return false;}
    finally{state.tribunalRevealPublishInFlight=false;}
  }
  function listenToTribunalReveal(data){
    const game=data?.game||{},token=String(game.roundToken||'');
    if(game.phase!=='tribunalResult'||!state.roomCode||!token){stopTribunalRevealListener();return;}
    if(state.tribunalRevealRef&&state.tribunalRevealToken===token)return;
    stopTribunalRevealListener();
    const deadline=Number(game.tribunal?.revealDeadlineAt||0),deadlineKey=token+':'+deadline,revealRef=db.ref(tribunalRevealPath(token)),listener=snapshot=>{state.tribunalRevealData=snapshot.val()||{};renderTribunalResult(state.lastRoomData||data);void maybeFinalizeTribunalReveal(state.lastRoomData||data);};
    state.tribunalRevealRef=revealRef;state.tribunalRevealListener=listener;state.tribunalRevealToken=token;revealRef.on('value',listener,error=>console.warn('[TRIBUNAL REVEAL] Listener no disponible.',{code:error?.code,message:error?.message,path:revealRef.toString()}));
    if(Number.isFinite(deadline)&&deadline>0){state.tribunalRevealDeadlineKey=deadlineKey;state.tribunalRevealDeadlineTimer=window.setTimeout(()=>{if(state.mode==='host')void maybeFinalizeTribunalReveal(state.lastRoomData||data);},Math.max(0,deadline-serverNow())+250);}
  }
  async function maybeFinalizeTribunalReveal(data){
    const game=data?.game||{},token=String(game.roundToken||''),reveals=state.tribunalRevealData||{};
    const deadline=Number(game.tribunal?.revealDeadlineAt||0),timedOut=Number.isFinite(deadline)&&deadline>0&&serverNow()>=deadline;
    if(!state.roomRef||state.mode!=='host'||game.phase!=='tribunalResult'||!token||state.tribunalRevealFinalizeInFlight||game.roundResults?.accusedId||(!tribunalRevealComplete(game,reveals)&&!timedOut))return false;
    state.tribunalRevealFinalizeInFlight=true;
    try{
      const ids=tribunalActiveIds(game),accusedId=ids.find(id=>String(reveals[id]?.role||'')==='acusado');if(!accusedId&&!timedOut)return false;
      const votes=game.roundResults?.votes||game.tribunal?.votes||{},counts={};ids.forEach(id=>counts[id]=0);Object.values(votes).forEach(target=>{if(Object.prototype.hasOwnProperty.call(counts,String(target)))counts[String(target)]++;});
      const ordered=ids.map(id=>({playerId:id,votes:counts[id]||0})).sort((a,b)=>b.votes-a.votes||a.playerId.localeCompare(b.playerId)),guilty=Boolean(accusedId)&&ordered[0]?.playerId===String(accusedId);
      const result=await withTimeout(state.roomRef.child('game').transaction(current=>{if(!current||current.phase!=='tribunalResult'||String(current.roundToken||'')!==token||current.roundResults?.accusedId)return;return {...current,roundResults:{...current.roundResults,accusedId:accusedId?String(accusedId):null,voteCounts:counts,guilty:accusedId?guilty:null,verdict:accusedId?(guilty?'CULPABLE':'ABSUELTO'):'REVELACIÓN INCOMPLETA',revealTimedOut:!tribunalRevealComplete(current,reveals)},tribunal:{...tribunalPublicState(current.tribunal),estado:'resultado',rolesRevealedAt:firebase.database.ServerValue.TIMESTAMP}};}),7000,'tribunal-reveal-finalize-timeout');
      if(result.committed){handleMiniRoomSnapshot({...state.lastRoomData,game:result.snapshot.val()});return true;}return false;
    }catch(error){console.warn('[TRIBUNAL REVEAL] No se pudo finalizar la revelación.',{code:error?.code,message:error?.message,path:state.roomRef?.toString()});return false;}
    finally{state.tribunalRevealFinalizeInFlight=false;}
  }
  function listenToMiniPrivateAssignment(){
    stopMiniPrivateAssignmentListener();if(!state.roomRef||!state.roomCode||!state.playerId)return;
    const privateRef=db.ref(`privateAssignments/${state.roomCode}/${state.playerId}`),listener=snapshot=>{
      const rawValue=snapshot.val()||null,value=rawValue&&String(rawValue.playerId)===String(state.playerId)?rawValue:null;state.miniPrivateAssignment=value;state.tribunalPrivateAssignment=value?.kind===GAME_TYPES.TRIBUNAL?value:null;state.chamuyayaPrivateAssignment=value?.kind===GAME_TYPES.CHAMUYA?value:null;
      const game=state.lastRoomData?.game||{};
      if(game.phase==='chamuyayaReveal')renderChamuyayaReveal(state.lastRoomData);
      if(game.phase==='chamuyayaDiscussion')renderChamuyayaDiscussion(state.lastRoomData);
      if(game.phase==='tribunalRoles')renderTribunalRoles(state.lastRoomData);
      if(game.phase==='tribunalPresentation')renderTribunalPresentation(state.lastRoomData);
      if(game.phase==='tribunalSurprise')renderTribunalSurprise(state.lastRoomData);
      if(game.phase==='tribunalResult'){renderTribunalResult(state.lastRoomData);void publishTribunalReveal(state.lastRoomData);}
    };
    state.miniPrivateAssignmentRef=privateRef;state.miniPrivateAssignmentListener=listener;privateRef.on('value',listener);
  }
  function listenToAssignments(){
    stopAssignmentListeners();if(!state.roomRef||!state.roomCode||!state.playerId)return;
    const privateRef=db.ref(`privateAssignments/${state.roomCode}/${state.playerId}`);
    const listener=snapshot=>{
      const value=snapshot.val()||null,currentGame=state.lastRoomData?.game||{},currentRound=Number(currentGame.currentRound||0),token=String(currentGame.roundToken||'');
      state.privateAssignment=value;
      const valid=Boolean(value&&Number(value.round)===currentRound&&String(value.roundToken||'')===token&&String(value.playerId)===String(state.playerId)&&value.character?.nombre&&value.character?.categoria);
      if(valid){
        state.myAssignment=value;
      }else if(!value || (currentRound&&token&&Number(state.myAssignment?.round)===currentRound&&String(state.myAssignment?.roundToken||'')===token)){
        // Conserva una asignación válida de la ronda actual frente a un snapshot temporalmente vacío.
      }else{
        state.myAssignment=null;
      }
      if(valid&&token){
        const receiptRef=state.roomRef.child(`game/assignmentReceipts/${state.playerId}`);
        receiptRef.transaction(current=>String(current||'')===token?current:token).catch(error=>console.error('[ASSIGNMENT] ERROR',{operation:'self receipt',code:error?.code,message:error?.message,path:receiptRef.toString(),error}));
      }
      if(currentGame.phase==='reveal')renderReveal(currentGame);
    };
    state.privateAssignmentRef=privateRef;state.privateAssignmentListener=listener;privateRef.on('value',listener);
  }
  async function maybeFinalizeAssignmentsReady(data){
    const game=data?.game||{},players=activeGamePlayers(data),receipts=game.assignmentReceipts||{},token=String(game.roundToken||'');
    if(!state.roomRef||state.mode!=='host'||game.phase!=='preparing'||game.assignmentState!=='writing'||!game.assignmentWriteCompletedAt||!token||!players.length)return false;
    const allReady=players.every(player=>String(receipts[player.id]||'')===token);if(!allReady)return false;
    try{
      const result=await state.roomRef.child('game').transaction(current=>{if(!current||current.phase!=='preparing'||current.assignmentState!=='writing'||current.roundToken!==token||!current.assignmentWriteCompletedAt)return;return {...current,assignmentState:'ready',assignmentWriterId:null,assignmentWriteStartedAt:null};});
      if(result.committed){console.log('[ASSIGNMENT] READY after player confirmations',{round:game.currentRound,roundToken:token,count:players.length});state.pendingAssignments=null;state.pendingRoundToken='';state.assignmentRetryToken='';state.assignmentRetryCount=0;return true;}
    }catch(error){console.error('[ASSIGNMENT] ERROR',{operation:'promote writing→ready',code:error?.code,message:error?.message,path:state.roomRef.child('game').toString(),error});}
    return false;
  }
  async function installDisconnect(){
    if(!state.roomRef||!state.playerId)return null;
    const playerRef=state.roomRef.child('players/'+state.playerId),path=playerRef.toString();
    try{
      await withTimeout(playerRef.onDisconnect().update({status:'offline',connected:false,lastSeen:firebase.database.ServerValue.TIMESTAMP}),7000,'disconnect-registration-timeout');
      await withTimeout(playerRef.update({status:'online',connected:true,lastSeen:firebase.database.ServerValue.TIMESTAMP}),7000,'presence-update-timeout');
      console.log('[DISCONNECT] OK',{path,playerId:state.playerId});
      return playerRef;
    }catch(error){
      console.warn('[DISCONNECT] No crítico; se continuará sin presencia avanzada.',{operation:'onDisconnect/update presence',code:error?.code,message:error?.message,path,error});
      return playerRef;
    }
  }

  function cancelReconnect(){
    if(state.reconnectTimer){clearTimeout(state.reconnectTimer);state.reconnectTimer=null;}
    state.reconnecting=false;state.reconnectAttempt=0;state.reconnectStartedAt=0;state.reconnectLastReason='';
  }

  async function recoverRoomConnection(reason='resume'){
    if(state.busy.reconnect||state.restoring||hasVoluntaryRoomExit()||!state.roomRef||!state.roomCode||!backendUid())return false;
    state.busy.reconnect=true;state.reconnecting=true;setConnectionStatus('reconnecting','Reconectando…');
    const path=state.roomRef.toString();
    try{
      db.goOnline();
      const snapshot=await withTimeout(state.roomRef.once('value'),8000,'reconnect-read-timeout');
      if(!snapshot.exists()){console.warn('[RECONNECT] room missing',{reason,path});return false;}
      const data=snapshot.val(),type=miniRoomType(data),route=routeRoomByGameType(type);
      if(!route){
        stopRoomListener();stopAssignmentListeners();state.roomRef=null;state.lastRoomData=null;state.roomCode='';clearSession();hideReconnectModal();
        notice('La sala tiene un tipo de juego desconocido. No se abrirá ninguna partida.','error','joinNotice');goToScreenIfChanged('join');
        return false;
      }
      state.gameType=type;const players=normalizeRoomPlayers(data),authId=String(backendUid());
      // La reconexión nunca debe cambiar silenciosamente la identidad del
      // jugador. Si el ID de la sesión ya no existe, se espera intervención
      // manual en vez de entrar con otra cuenta o con otro jugador.
      const matched=players.find(p=>String(p.id)===String(state.playerId)&&String(p.authUid||p.id)===authId);
      if(!matched){console.warn('[RECONNECT] identity not found',{reason,path,playerId:state.playerId,authUid:backendUid()});return false;}
      state.playerId=String(matched.id);state.playerName=matched.name||state.playerName;state.mode=String(data.hostId)===String(state.playerId)?'host':'player';state.lastRoomData=data;
      await withTimeout(state.roomRef.child('players/'+state.playerId).update({status:'online',connected:true,lastSeen:firebase.database.ServerValue.TIMESTAMP,accountUid:accountUid()||null,authUid:backendUid()}),8000,'reconnect-player-update-timeout');
      await markRoomMembership();await installDisconnect();saveSessionInfo(state.roomCode,state.playerName,state.playerId);listenToRoom();
      state.roomConnectionPaused=false;setConnectionStatus('online','Conectado');hideReconnectModal();console.log('[RECONNECT] OK',{reason,path,playerId:state.playerId});return true;
    }catch(error){
      console.error('[RECONNECT] ERROR',{operation:'recoverRoomConnection',code:error?.code,message:error?.message,path,error});return false;
    }finally{state.busy.reconnect=false;state.reconnecting=false;}
  }
  function scheduleAutoReconnect(reason='connection-lost'){
    if(!state.roomRef||state.roomConnectionPaused===false||hasVoluntaryRoomExit())return;
    if(state.reconnectTimer||state.busy.reconnect)return;
    if(!state.reconnectStartedAt)state.reconnectStartedAt=Date.now();
    state.reconnectLastReason=reason;
    let elapsed=Date.now()-state.reconnectStartedAt;
    // Una señal explícita de que volvió la conexión permite una nueva
    // recuperación incluso si la ventana de gracia anterior ya terminó.
    // No se reinicia por un simple watchdog/desconectado, para no crear loops.
    const connectionReturned=reason==='firebase-connected'||reason==='browser-online';
    if(elapsed>=RECONNECT_GRACE_MS&&connectionReturned){
      state.reconnectStartedAt=Date.now();state.reconnectAttempt=0;elapsed=0;hideReconnectModal();
    }
    if(elapsed>=RECONNECT_GRACE_MS){
      setConnectionStatus('reconnecting','Sin conexión');
      if(!state.reconnectModalOpen)showReconnectModal('manual-failed');
      return;
    }
    const attempt=Number(state.reconnectAttempt||0),backoffIndex=Math.min(attempt,RECONNECT_BACKOFF_MS.length-1),delay=RECONNECT_BACKOFF_MS[backoffIndex];
    if(attempt>=RECONNECT_BACKOFF_MS.length&&!state.reconnectModalOpen)showReconnectModal('manual-failed');
    state.reconnectAttempt=attempt+1;
    const attemptLabel=state.reconnectAttempt<=RECONNECT_BACKOFF_MS.length?` (${state.reconnectAttempt}/${RECONNECT_BACKOFF_MS.length})`:'';
    setConnectionStatus('reconnecting',`Reconectando…${attemptLabel}`);
    state.reconnectTimer=window.setTimeout(async()=>{
      state.reconnectTimer=null;
      if(!state.roomRef||hasVoluntaryRoomExit())return;
      const ok=await recoverRoomConnection(reason);
      if(!ok)scheduleAutoReconnect(reason);else cancelReconnect();
    },Math.min(delay,Math.max(0,RECONNECT_GRACE_MS-elapsed)));
  }

  function whoamiScreenForPhase(phase){return ({lobby:'lobby',preparing:'prep',reveal:'reveal',starting:'starting',friends:'playing',playing:'playing',scoring:'scoring',results:'results',finished:'finish'})[phase]||'';}
  function functionalRoomKey(data){
    const game=data?.game||{};return JSON.stringify({hostId:data?.hostId||'',phase:game.phase||'',round:game.currentRound||0,totalRounds:game.totalRounds||0,roundToken:game.roundToken||'',activePlayers:game.activePlayers||{},playerNames:game.playerNames||{},publicCharacters:game.publicCharacters||[],whoamiVotingPlayers:game.whoamiVotingPlayers||{},whoamiVotes:game.whoamiVotes||{},roundResults:game.roundResults||null,scores:game.scores||{},assignmentState:game.assignmentState||'',assignmentWriteCompletedAt:game.assignmentWriteCompletedAt||null,assignmentReceipts:game.assignmentReceipts||{}});
  }
  function miniFunctionalKey(data){const game=data?.game||{};return JSON.stringify({hostId:data?.hostId||'',phase:game.phase||'',round:game.currentRound||0,totalRounds:game.totalRounds||0,roundToken:game.roundToken||'',activePlayers:game.activePlayers||{},playerNames:game.playerNames||{},prepEndsAt:game.prepEndsAt||null,revealAt:game.revealAt||null,revealEndsAt:game.revealEndsAt||null,countdownEndsAt:game.countdownEndsAt||null,ageTargetsByPlayer:game.ageTargetsByPlayer||{},ageDeadlineAt:game.ageDeadlineAt||null,ageEstimates:game.ageEstimates||{},ageSubmitted:game.ageSubmitted||{},confessions:game.confessions||{},confessionSubmissions:game.confessionSubmissions||{},confessionOrder:game.confessionOrder||[],confessionIndex:game.confessionIndex||0,confessionCurrentId:game.confessionCurrentId||'',confessionVotes:game.confessionVotes||{},stopLetter:game.stopLetter||'',stopAt:game.stopAt||null,stopResponses:game.stopResponses||{},stopJudgments:game.stopJudgments||{},stopVotingPlayers:game.stopVotingPlayers||{},stopVotes:game.stopVotes||{},chamuyaya:game.chamuyaya||{},tribunal:game.tribunal||{},whatWouldYouDo:game.whatWouldYouDo||{},roundEndsAt:game.roundEndsAt||null,roundResults:game.roundResults||null,scores:game.scores||{}});}

  function handleRoomSnapshot(data){
    const type=miniRoomType(data);
    if(data&&!routeRoomByGameType(type)){
      stopRoomListener();stopAssignmentListeners();state.roomRef=null;state.lastRoomData=null;clearMiniCountdown();clearSession();
      notice('La sala tiene un tipo de juego desconocido. No se abrirá ninguna partida.','error','joinNotice');goToScreenIfChanged('join');return;
    }
    if(data&&type!==GAME_TYPES.WHOAMI){void handleMiniRoomSnapshot(data);return;}
    const previousData=state.lastRoomData,previousFunctionalKey=functionalRoomKey(previousData),incomingFunctionalKey=functionalRoomKey(data);state.lastRoomData=data||null;
    if(!data){
      stopRoomListener();stopAssignmentListeners();state.roomRef=null;state.lastRoomData=null;clearSession();notice('La sala ya no existe o el anfitrión la cerró.','error','joinNotice');$('joinRoomBtn').disabled=false;goToScreenIfChanged('join');return;
    }
    const players=normalizeRoomPlayers(data),sessionPlayerId=String(state.playerId||''),authId=String(backendUid()||''),me=players.find(player=>String(player.id)===sessionPlayerId&&String(player.authUid||'')===authId)||(!sessionPlayerId?players.find(player=>String(player.id)===authId&&String(player.authUid||'')===authId):null);
    if(!me){if(state.restoring||state.reconnecting){scheduleAutoReconnect('identity-missing');return;}notice('Reconectando con tu identidad segura…','error','joinNotice');state.roomConnectionPaused=true;setConnectionStatus('reconnecting','Reconectando…');scheduleAutoReconnect('identity-missing');return;}
    state.playerName=me.name||state.playerName;state.hostName=data.hostName||state.hostName;state.mode=isHost(data)?'host':'player';saveSession();if(state.mode==='host'){void repairHostMetadata(data);void syncRoomDirectory(data);}
    if(!isHost(data)&&data.hostId&&!isPlayerOnline(data.players?.[data.hostId]))void attemptHostTransfer(data);
    const config=selectedRoomConfig(data);state.categories=config.categories;state.totalRounds=config.totalRounds;
    const game=data.game||{phase:'lobby'};
    const sameFunctionalState=Boolean(previousData&&previousFunctionalKey===incomingFunctionalKey),expectedScreen=whoamiScreenForPhase(game.phase);
    if(sameFunctionalState&&state.currentScreen===expectedScreen){if(game.phase==='lobby')renderLobby(data);if(game.phase==='scoring')renderScoring(game,data);return;}
    if(game.phase==='lobby'){
      clearTransitionRetry();clearCountdown();renderLobby(data);goToScreenIfChanged('lobby');return;
    }
    if(!game.activePlayers?.[state.playerId]&&!['finished'].includes(game.phase)){notice('La partida actual ya había comenzado. Espera a la próxima partida.','error','lobbyNotice');goToScreenIfChanged('lobby');return;}
    if(game.phase==='preparing'){
      clearTransitionRetry();
      if(state.mode==='host'&&game.assignmentState==='pending'&&game.roundToken)void finalizeRoundAssignments(game.roundToken);
      if(state.mode==='host'&&game.assignmentState==='writing'){void maybeFinalizeAssignmentsReady(data);void recoverStalledAssignmentWrite(data);}
      renderPreparation(game);goToScreenIfChanged('prep');schedulePreparation(game);return;
    }
    if(game.phase==='reveal'){
      renderReveal(game);goToScreenIfChanged('reveal');scheduleReveal(game);if(!state.myAssignment)scheduleAssignmentRecovery();return;
    }
    if(game.phase==='starting'){
      const startingEndsAt=Number(game.startingEndsAt);
      if(!Number.isFinite(startingEndsAt)||startingEndsAt<=0){
        notice('La transición de la partida no tiene una hora válida. Esperando a Firebase…','error','lobbyNotice');
        return;
      }
      const startingGame=Number(game.startingEndsAt)===startingEndsAt?game:{...game,startingEndsAt};
      renderStarting(startingGame);goToScreenIfChanged('starting');scheduleStarting(startingGame);
      return;
    }
    if(game.phase==='friends'){clearCountdown();renderPlaying(game,data);goToScreenIfChanged('playing');void migrateLegacyFriendsPhase(game);return;}
    if(game.phase==='playing'){clearTransitionRetry();clearCountdown();renderPlaying(game,data);goToScreenIfChanged('playing');if(!state.myAssignment)scheduleAssignmentRecovery();return;}
    if(game.phase==='scoring'){clearCountdown();renderScoring(game,data,{force:state.currentScreen!=='scoring',resetSelection:state.currentScreen!=='scoring'});goToScreenIfChanged('scoring');if(!state.myAssignment)scheduleAssignmentRecovery();return;}
    if(game.phase==='results'){clearCountdown();renderResults(game,data);goToScreenIfChanged('results');if(!state.myAssignment)scheduleAssignmentRecovery();return;}
    if(game.phase==='finished'){clearCountdown();renderFinished(game,data);goToScreenIfChanged('finish');return;}
  }
  async function attemptHostTransfer(data){
    if(!state.roomRef||!data?.hostId)return false;
    try{
      const latest=(await withTimeout(state.roomRef.once('value'),7000,'host-transfer-read-timeout')).val();
      if(!latest?.hostId)return false;
      data=latest;
      const oldHostId=String(data.hostId);
      const candidates=normalizeRoomPlayers(data)
        .filter(player=>String(player.id)!==oldHostId&&isPlayerOnline(player))
        .sort((a,b)=>(Number(a.joinedAt)||0)-(Number(b.joinedAt)||0)||String(a.id).localeCompare(String(b.id)));
      // El jugador que detecta al anfitrión ausente debe intentar convertirse
      // en el nuevo anfitrión. Así la segunda escritura (hostAuthUid/hostName)
      // la ejecuta la misma identidad que ganó la transacción de hostId y no
      // queda una sala con hostId y hostAuthUid desincronizados.
      const candidate=candidates.find(player=>String(player.id)===String(state.playerId))||candidates[0];if(!candidate)return false;
      const result=await state.roomRef.child('hostId').transaction(current=>{
        if(String(current||'')!==oldHostId)return;
        const currentHost=data.players?.[oldHostId];
        if(isPlayerOnline(currentHost))return;
        const latestCandidate=data.players?.[candidate.id];
        if(!isPlayerOnline(latestCandidate))return;
        return String(candidate.id);
      });
      if(!result.committed)return false;
      const newHostId=String(result.snapshot.val());
      if(newHostId!==String(candidate.id))return false;
      await state.roomRef.update({hostAuthUid:String(candidate.authUid||candidate.id),hostName:String(candidate.name||''),metadata:{...(data.metadata||{}),lastActiveAt:firebase.database.ServerValue.TIMESTAMP}});
      state.mode=newHostId===String(state.playerId)?'host':'player';state.hostName=candidate.name||'';
      console.log('[HOST TRANSFER] OK',{oldHostId,newHostId,initiatedBy:state.playerId});
      showSocialToast(newHostId===String(state.playerId)?'Ahora eres el anfitrión.':'El anfitrión cambió.');
      if(newHostId===String(state.playerId)){
        const resumed=(await withTimeout(state.roomRef.once('value'),7000,'host-transfer-resume-timeout')).val();
        if(resumed)handleRoomSnapshot(resumed);
      }
      return true;
    }catch(error){
      console.error('[HOST TRANSFER] ERROR',{operation:'hostId transaction/update',code:error?.code,message:error?.message,path:state.roomRef?.toString(),error});return false;
    }
  }
  async function repairHostMetadata(data){
    if(!state.roomRef||state.hostMetadataRepairInFlight||!data||String(data.hostId)!==String(state.playerId))return false;
    const authId=String(backendUid()||''),player=data.players?.[state.playerId];
    if(!authId||String(player?.authUid||'')!==authId||String(data.hostAuthUid||'')===authId)return true;
    state.hostMetadataRepairInFlight=true;
    try{
      await withTimeout(state.roomRef.update({hostAuthUid:authId,hostName:String(player.name||data.hostName||'')}),7000,'host-metadata-repair-timeout');
      return true;
    }catch(error){console.warn('[HOST TRANSFER] metadata repair pending',{code:error?.code,message:error?.message,path:state.roomRef?.toString()});return false;}
    finally{state.hostMetadataRepairInFlight=false;}
  }
  async function transferHostBeforeExit(data){
    if(!state.roomRef||!data||String(data.hostId)!==String(state.playerId))return false;
    const candidates=normalizeRoomPlayers(data)
      .filter(player=>String(player.id)!==String(state.playerId)&&!player.leftAt)
      .sort((a,b)=>{const onlineA=isPlayerOnline(a)?0:1,onlineB=isPlayerOnline(b)?0:1;return onlineA-onlineB||(Number(a.joinedAt)||0)-(Number(b.joinedAt)||0)||String(a.id).localeCompare(String(b.id));});
    const candidate=candidates[0];if(!candidate)return false;
    try{
      const oldHostId=String(state.playerId),result=await withTimeout(state.roomRef.child('hostId').transaction(current=>String(current||'')===oldHostId?String(candidate.id):undefined),7000,'host-exit-transfer-timeout');
      if(!result.committed||String(result.snapshot.val())!==String(candidate.id))return false;
      await withTimeout(state.roomRef.update({hostAuthUid:String(candidate.authUid||candidate.id),hostName:String(candidate.name||''),metadata:{...(data.metadata||{}),lastActiveAt:firebase.database.ServerValue.TIMESTAMP}}),7000,'host-exit-transfer-metadata-timeout');
      return true;
    }catch(error){console.warn('[HOST EXIT] transfer failed',error);return false;}
  }
  async function createRoom(){
    if([GAME_TYPES.AGE,GAME_TYPES.CONFESSIONS,GAME_TYPES.STOP,GAME_TYPES.WHAT_WOULD_YOU_DO].includes(state.gameType)){await createMiniRoom(state.gameType);return;}
    if(!ensureFirebaseConfigured())return;
    if(state.configEditing){await saveRoomSettings();return;}
    if(state.busy.create)return;
    const hostName=(accountUid()?accountUsername():($('hostNameInput').value||'').trim()).slice(0,30);
    if(!hostName){notice('Escribe tu nombre.','error');return;}
    if(!state.categories.length){notice('Selecciona al menos una temática.','error');return;}
    if(characterPool(state.categories).length<2){notice('Las temáticas seleccionadas deben tener al menos 2 personajes diferentes.','error');return;}
    setBusy('create',true);setButtonBusy('createRoomBtn','create',true,'CREANDO SALA…');preloadCountdownSound();
    let createdRef=null,createdCode='',lastCreateError=null;
    const fail=(operation,error,path,extra={})=>{lastCreateError=error;logFirebaseError(operation,error,path,extra);};
    try{
      try{
        if(!auth.currentUser)await ensureRoomAuth();
        if(!auth.currentUser?.uid)throw Object.assign(new Error('Firebase Authentication no devolvió un usuario.'),{code:'auth/no-current-user'});
      }catch(error){
        fail('authentication',error,'auth.currentUser');
        notice(mapFirebaseOperationError('autenticación',error,'auth.currentUser'),'error');
        return;
      }
      state.mode='host';roomIdentity();state.hostName=hostName;state.playerName=hostName;state.totalRounds=Math.min(20,Math.max(1,Number(state.totalRounds)||3));
      let committed=false;
      for(let attempt=0;attempt<10&&!committed;attempt++){
        const code=roomCode(),ref=db.ref('rooms/'+code),path=ref.toString(),timestamp=firebase.database.ServerValue.TIMESTAMP;
        const initial={gameType:GAME_TYPES.WHOAMI,hostId:String(state.playerId),hostAuthUid:String(backendUid()),hostName,secureAssignments:true,createdAt:timestamp,metadata:{lastActiveAt:timestamp,cleanupEligibleAt:null},settings:{gameType:GAME_TYPES.WHOAMI,categories:state.categories,totalRounds:state.totalRounds},players:{[state.playerId]:{name:hostName,accountUid:accountUid()||null,authUid:backendUid(),joinedAt:timestamp,lastSeen:timestamp,status:'online',connected:true,leftAt:null}},game:{gameType:GAME_TYPES.WHOAMI,phase:'lobby',round:0,currentRound:0,totalRounds:state.totalRounds,gameStartTime:null,prepEndsAt:null,revealAt:null,revealEndsAt:null,startingEndsAt:null,currentTurn:'',turnIndex:-1,turnOrder:[],scores:{[state.playerId]:0},playerNames:{[state.playerId]:hostName},roundResults:null,recentCharacterIds:[],activePlayers:{[state.playerId]:true},assignmentState:null,assignmentWriterId:null,assignmentWriteStartedAt:null,assignmentWriteCompletedAt:null,assignmentReceipts:null,roundToken:null,secureAssignments:true}};
        try{
          const authUid=backendUid();
          if(!authUid || String(state.playerId)!==String(authUid) || String(initial.hostId)!==String(authUid) || String(initial.hostAuthUid)!==String(authUid) || String(initial.players?.[state.playerId]?.authUid)!==String(authUid)){
            throw Object.assign(new Error('La identidad de Firebase no coincide con la identidad de la sala.'),{code:'identity-mismatch'});
          }
          const result=await withTimeout(ref.transaction(current=>current===null?initial:undefined),10000,'room-transaction-timeout');
           if(result.committed){committed=true;createdRef=ref;createdCode=code;state.roomCode=code;state.roomRef=ref;state.roomDirectorySyncKey='';state.lastRoomData=result.snapshot.val()||initial;console.log('[CREATE ROOM] room write OK',{path,attempt:attempt+1});break;}
          console.warn('[CREATE ROOM] código ocupado, reintentando',{path,attempt:attempt+1});
        }catch(error){
          fail('reserve-room-code',error,path,{attempt:attempt+1});
          if(String(error?.code||'').toUpperCase().includes('PERMISSION-DENIED'))break;
          if(String(error?.code||'').toLowerCase().includes('network'))break;
        }
      }
      if(!committed){
        if(lastCreateError)throw lastCreateError;
        throw Object.assign(new Error('No se encontró un código disponible tras varios intentos.'),{code:'room/code-unavailable'});
      }
      await markRoomMembership();
      await installDisconnect();
      saveSessionInfo(state.roomCode,state.playerName,state.playerId);await syncRoomDirectory(state.lastRoomData,true);listenToRoom();renderLobby(state.lastRoomData);show('lobby');notice('Sala creada. Comparte el código con los demás.','success','lobbyNotice');
    }catch(error){
      fail('createRoom',error,createdRef?.toString()||'rooms/<code>');
      if(createdRef){try{await createdRef.remove();console.warn('[CREATE ROOM] partial room cleanup OK',{path:createdRef.toString()});}catch(cleanupError){fail('partial-cleanup',cleanupError,createdRef.toString());}}
      state.roomRef=null;state.roomCode='';state.lastRoomData=null;
      notice(mapFirebaseOperationError('crear sala',error,createdRef?.toString()||'rooms/<codigo>'),'error');
    }finally{setBusy('create',false);setButtonBusy('createRoomBtn','create',false);}
  }
  async function saveRoomSettings(){
    if(state.busy.create||!state.roomRef||state.mode!=='host')return;
    if(!state.categories.length){notice('Selecciona al menos una temática.','error');return;}
    state.totalRounds=Math.min(20,Math.max(1,Number(state.totalRounds)||3));
    const data=(await withTimeout(state.roomRef.once('value'),7000,'room-settings-preview-timeout')).val(),players=onlineRoomPlayers(data),stock=validateCardStock(players.length||1,state.categories,state.totalRounds);
    if(!stock.valid){notice(getCardStockMessage(stock),'error');return;}
    setBusy('create',true);setButtonBusy('createRoomBtn','create',true,'GUARDANDO…');
    try{
      const snapshot=await withTimeout(state.roomRef.once('value'),7000,'room-settings-read-timeout'),room=snapshot.val();
      if(!room||room.game?.phase!=='lobby'||room.hostId!==state.playerId)throw new Error('La sala cambió de estado antes de guardar la configuración.');
      await withTimeout(state.roomRef.update({settings:{gameType:GAME_TYPES.WHOAMI,categories:[...state.categories],totalRounds:state.totalRounds},'game/totalRounds':state.totalRounds,'metadata/lastActiveAt':firebase.database.ServerValue.TIMESTAMP}),7000,'room-settings-update-timeout');
      state.configEditing=false;show('lobby');
    }catch(error){console.error('save room settings',error);notice('No se pudo guardar la configuración.','error');}
    finally{setButtonBusy('createRoomBtn','create',false);setBusy('create',false);}
  }
  async function joinRoom(){
    if([GAME_TYPES.AGE,GAME_TYPES.CONFESSIONS,GAME_TYPES.STOP,GAME_TYPES.CHAMUYA,GAME_TYPES.TRIBUNAL,GAME_TYPES.WHAT_WOULD_YOU_DO].includes(state.gameType)){await joinMiniRoom(state.gameType);return;}
    if(!ensureFirebaseConfigured())return;
    if(state.busy.join)return;
    const code=($('joinRoomCode').value||'').trim().toUpperCase(),name=(accountUid()?accountUsername():($('joinName').value||'').trim()).slice(0,30);
    if(!/^[A-Z2-9]{5}$/.test(code)){notice('Escribe un código de 5 caracteres.','error','joinNotice');return;}
    if(!name){notice('Escribe tu nombre.','error','joinNotice');return;}
    if(!auth.currentUser){try{await ensureRoomAuth();}catch(error){console.error('ensure room auth',error);notice('No se pudo activar la conexión segura para la sala.','error','joinNotice');return;}}
    preloadCountdownSound();setBusy('join',true);setButtonBusy('joinRoomBtn','join',true,'BUSCANDO SALA…');notice('Buscando la sala…','','joinNotice');
    try{
      state.mode='player';state.playerId=String(backendUid());state.playerName=name;attachRoom(code);
      const directory=await readRoomDirectory(code),declaredType=String(directory?.gameType||'').trim().toLowerCase();
      if(!directory||declaredType!==GAME_TYPES.WHOAMI){clearPendingRoomContext();notice(!directory?'No existe una sala con ese código. Verifica el código.':'Esa sala pertenece a otro minijuego. Usa TENGO UN CÓDIGO para que se detecte automáticamente.','error','joinNotice');return;}
      const ownSnapshot=await withTimeout(state.roomRef.child(`players/${state.playerId}`).once('value'),7000,'room-player-read-timeout'),currentPlayer=ownSnapshot.exists()?{id:state.playerId,...(ownSnapshot.val()||{})}:null,gamePhase=String(directory.phase||'lobby');
      const reconnecting=Boolean(currentPlayer&&!currentPlayer.leftAt);
      if(gamePhase!=='lobby'&&!reconnecting){clearPendingRoomContext();notice('La partida ya comenzó. Espera a la próxima partida.','error','joinNotice');return;}
      if(Number(directory.playerCount)>=ROOM_DIRECTORY_MAX_PLAYERS&&!reconnecting){clearPendingRoomContext();notice('La sala está llena.','error','joinNotice');return;}
      if(reconnecting){
        state.playerName=currentPlayer.name||name;
        await withTimeout(state.roomRef.child('players/'+state.playerId).update({name:state.playerName,accountUid:accountUid()||null,authUid:backendUid(),status:'online',connected:true,leftAt:null,lastSeen:firebase.database.ServerValue.TIMESTAMP}),7000,'room-player-update-timeout');
      }else{
        const result=await withTimeout(state.roomRef.child('players/'+state.playerId).transaction(current=>current||{name,accountUid:accountUid()||null,authUid:backendUid(),joinedAt:firebase.database.ServerValue.TIMESTAMP,lastSeen:firebase.database.ServerValue.TIMESTAMP,status:'online',connected:true,leftAt:null}),7000,'room-player-join-timeout');
        if(!result.committed)throw {code:'join-conflict'};
      }
      const snapshot=await withTimeout(state.roomRef.once('value'),7000,'room-read-after-join-timeout');if(!snapshot.exists()||miniRoomType(snapshot.val())!==GAME_TYPES.WHOAMI)throw Object.assign(new Error('room-type-changed'),{code:'room-type-changed'});
      await markRoomMembership();await installDisconnect();saveSessionInfo(state.roomCode,state.playerName,state.playerId);listenToRoom();show('lobby');notice(reconnecting?'Reconectado. Tu jugador fue recuperado con su identidad segura.':'Conectado. Esperando al anfitrión.','success','lobbyNotice');
    }catch(error){console.error('Firebase join room',error);clearPendingRoomContext();notice(error?.code==='join-conflict'?'No se pudo reservar tu jugador. Intenta nuevamente.':'No se pudo entrar a la sala. Revisa Realtime Database y la conexión.','error','joinNotice');}
    finally{setBusy('join',false);setButtonBusy('joinRoomBtn','join',false);}
  }

  async function startGame(){
    if([GAME_TYPES.AGE,GAME_TYPES.CONFESSIONS,GAME_TYPES.STOP,GAME_TYPES.CHAMUYA,GAME_TYPES.TRIBUNAL,GAME_TYPES.WHAT_WOULD_YOU_DO].includes(state.gameType)){await startMiniGame();return;}
    if(state.busy.start||!state.roomRef||state.mode!=='host')return;setBusy('start',true);setButtonBusy('startRoomBtn','start',true,'INICIANDO…');
    try{
      const snapshot=await withTimeout(state.roomRef.once('value'),7000,'whoami-start-read-timeout'),data=snapshot.val();if(!data||!isHost(data)||data.game?.phase!=='lobby')return;
      const players=onlineRoomPlayers(data).slice(0,20),config=selectedRoomConfig(data);
      if(players.length<2){notice('Necesitas al menos 2 jugadores para comenzar.','error','lobbyNotice');return;}
      if(config.categories.length<1){notice('Selecciona al menos una temática.','error','lobbyNotice');return;}
      const stock=validateCardStock(players.length,config.categories,config.totalRounds);if(!stock.valid){notice(getCardStockMessage(stock),'error','lobbyNotice');return;}
      const currentRound=(Number(data.game?.currentRound)||0)+1,roundToken=`r${currentRound}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`,now=serverNow(),activePlayers={},names={};players.forEach(p=>{activePlayers[p.id]=true;names[p.id]=p.name;});
      const prepEndsAt=now+PREPARATION_DURATION_MS,revealEndsAt=null;
      const result=await withTimeout(state.roomRef.child('game').transaction(game=>{if(!game||game.phase!=='lobby')return;const scoreMap={...(game.scores||{})};players.forEach(p=>{if(scoreMap[p.id]===undefined)scoreMap[p.id]=0;});return {...game,phase:'preparing',round:currentRound,currentRound,totalRounds:config.totalRounds,gameStartTime:now,prepEndsAt,revealAt:prepEndsAt,revealEndsAt,startingEndsAt:null,currentTurn:'',turnIndex:-1,turnOrder:[],scores:scoreMap,playerNames:names,publicCharacters:[],roundResults:null,activePlayers,assignmentState:'pending',assignmentWriterId:null,assignmentWriteStartedAt:null,assignmentWriteCompletedAt:null,assignmentReceipts:null,roundToken,secureAssignments:true};}),7000,'whoami-start-write-timeout');
      if(!result.committed){notice('La partida ya está siendo iniciada por otro dispositivo.','error','lobbyNotice');return;}
      state.pendingRoundToken=roundToken;state.pendingAssignments=null;state.assignmentRetryToken=roundToken;state.assignmentRetryCount=0;
      // Firebase debe seguir siendo la fuente de verdad, pero el cliente que
      // inicia la partida también procesa el snapshot comprometido de forma
      // inmediata. Esto evita que el anfitrión dependa de un segundo evento
      // local para instalar el contador de preparación.
      handleRoomSnapshot({...data,game:result.snapshot.val()});
      console.log('[GAME STATE] lobby → preparing',{round:currentRound,roundToken,activePlayers:Object.keys(activePlayers).length});void finalizeRoundAssignments(roundToken);
    }catch(error){console.error('[GAME STATE] ERROR',{operation:'startGame',code:error?.code,message:error?.message,path:state.roomRef?.toString(),error});notice('No fue posible iniciar la partida. Revisa la conexión.','error','lobbyNotice');}
    finally{setBusy('start',false);setButtonBusy('startRoomBtn','start',false);}
  }
  function validateRoundAssignments(data){
    const game=data?.game||{},players=activeGamePlayers(data),expectedRound=Number(game.currentRound||0),token=String(game.roundToken||''),receipts=game.assignmentReceipts||{};
    const missing=[],invalid=[],duplicates=[],seen=new Set();
    if(!expectedRound||!token||!game.secureAssignments){return {valid:false,missing:players.map(p=>p.id),invalid:['game'],duplicates:[],expectedRound,token};}
    players.forEach(player=>{
      const receipt=String(receipts[player.id]||'');
      if(receipt!==token){missing.push(player.id);return;}
      if(String(player.id)===String(state.playerId)){
        const assignment=state.myAssignment||state.privateAssignment;
        if(!assignment||Number(assignment.round)!==expectedRound||String(assignment.roundToken||'')!==token||String(assignment.playerId)!==String(player.id)||!assignment.character?.nombre||!assignment.character?.categoria){invalid.push(player.id);return;}
        const key=characterKey(assignment.character);if(seen.has(key))duplicates.push(key);else seen.add(key);
      }
    });
    const hostValidation=state.mode==='host'&&state.pendingAssignments?Object.entries(state.pendingAssignments).map(([id,a])=>({id,a})):[];
    hostValidation.forEach(({id,a})=>{if(!a?.character?.nombre||!a?.character?.categoria)invalid.push(id);const key=a?.character?characterKey(a.character):'';if(key){if(seen.has(key))duplicates.push(key);else seen.add(key);}});
    return {valid:missing.length===0&&invalid.length===0&&duplicates.length===0,missing,invalid,duplicates,expectedRound,token};
  }
  function validateGeneratedAssignments(assignments,players,round,token){
    const errors=[],seen=new Set();
    if(!assignments||Object.keys(assignments).length!==players.length)return {valid:false,errors:['assignment-count']};
    players.forEach(player=>{const a=assignments[player.id],c=a?.character;if(!a||String(a.playerId)!==String(player.id)||!c?.nombre||!c?.categoria){errors.push(`missing:${player.id}`);return;}const key=characterKey(c);if(seen.has(key))errors.push(`duplicate:${key}`);seen.add(key);if(!Number.isFinite(Number(round))||Number(round)<1)errors.push('round');if(!token)errors.push('token');});
    return {valid:errors.length===0,errors};
  }
  async function finalizeRoundAssignments(roundToken){
    if(!state.roomRef||!roundToken||state.assignmentRecoveryInProgress)return false;state.assignmentRecoveryInProgress=true;
    try{
      const claim=await state.roomRef.child('game').transaction(game=>{if(!game||game.phase!=='preparing'||game.roundToken!==roundToken||game.assignmentState!=='pending')return;return {...game,assignmentState:'writing',assignmentWriterId:String(state.playerId),assignmentWriteStartedAt:firebase.database.ServerValue.TIMESTAMP,assignmentWriteCompletedAt:null,assignmentReceipts:null};});
      if(!claim.committed)return false;
      const snap=await withTimeout(state.roomRef.once('value'),7000,'assignment-write-read-timeout'),data=snap.val();
      if(!data||data.game?.roundToken!==roundToken||data.game?.assignmentState!=='writing'||String(data.game.assignmentWriterId)!==String(state.playerId))return false;
      const cleaned=await pruneInactiveRoundPlayers(data),players=activeGamePlayers(cleaned),config=selectedRoomConfig(cleaned);if(players.length<2)return false;
      let assignments=state.pendingRoundToken===roundToken?state.pendingAssignments:null,usedKeys=[];
      if(!assignments){const selection=createAssignments(players,config.categories,data.game?.recentCharacterIds||[]);if(!selection)throw Object.assign(new Error('No hay suficientes personajes únicos.'),{code:'assignment/insufficient-stock'});assignments=selection.assignments;usedKeys=selection.usedKeys;state.pendingAssignments=assignments;}else usedKeys=Object.values(assignments).map(a=>a?.character).filter(Boolean).map(c=>characterKey(c));
      const validation=validateGeneratedAssignments(assignments,players,Number(data.game.currentRound),roundToken);console.log('[ASSIGNMENT VALIDATION]',validation);if(!validation.valid)throw Object.assign(new Error(`Asignaciones inválidas: ${validation.errors.join(',')}`),{code:'assignment/invalid'});
      const updates={};
      const publicCharacters=[];
      players.forEach(player=>{
        const assignment={...assignments[player.id],round:Number(data.game.currentRound),roundToken};
        updates[`privateAssignments/${state.roomCode}/${player.id}`]=assignment;
        const character=assignment?.character||{};
        publicCharacters.push({
          playerId:String(player.id),
          playerName:String(player.name||''),
          id:character.id ?? null,
          nombre:String(character.nombre||''),
          imagen:String(character.imagen||character.image||character.foto||character.img||character.src||character.imageUrl||character.url||''),
          categoria:String(character.categoria||'')
        });
      });
      updates[`rooms/${state.roomCode}/game/publicCharacters`]=publicCharacters;
      updates[`rooms/${state.roomCode}/game/assignmentWriteCompletedAt`]=firebase.database.ServerValue.TIMESTAMP;
      updates[`rooms/${state.roomCode}/metadata/lastActiveAt`]=firebase.database.ServerValue.TIMESTAMP;
      await db.ref().update(updates);
      console.log('[ASSIGNMENT] private writes OK',{round:data.game.currentRound,count:players.length});
      try{
        await state.roomRef.child('game/recentCharacterIds').transaction(current=>{
          const history=Array.isArray(current)?current:Object.values(current||{}),merged=[...history.map(String),...usedKeys.map(String)];
          return [...new Set(merged)].slice(-30);
        });
      }catch(error){
        console.warn('[ASSIGNMENT] recentCharacterIds update failed',{code:error?.code,message:error?.message,path:state.roomRef.child('game/recentCharacterIds').toString(),error});
      }
      // No se promociona a ready aquí: cada jugador confirma su lectura privada mediante assignmentReceipts.
      state.pendingAssignments=null;state.pendingRoundToken=roundToken;console.log('[ASSIGNMENT] waiting player confirmations',{round:data.game.currentRound});return true;
    }catch(error){
      console.error('[ASSIGNMENT] ERROR',{operation:'finalizeRoundAssignments',code:error?.code,message:error?.message,path:state.roomRef?.toString(),roundToken,error});return false;
    }finally{state.assignmentRecoveryInProgress=false;}
  }
  async function recoverStalledAssignmentWrite(data){
    const game=data?.game,writerId=game?.assignmentWriterId,started=Number(game?.assignmentWriteStartedAt)||0;
    if(!state.roomRef||state.mode!=='host'||game?.phase!=='preparing'||game?.assignmentState!=='writing'||!writerId||!started||serverNow()-started<5000)return;
    try{
      if(game.assignmentWriteCompletedAt){await maybeFinalizeAssignmentsReady(data);return;}
      const writer=data.players?.[writerId];if(isPlayerOnline(writer))return;
      const reset=await state.roomRef.child('game').transaction(current=>{if(!current||current.phase!=='preparing'||current.assignmentState!=='writing'||String(current.assignmentWriterId)!==String(writerId)||current.roundToken!==game.roundToken||current.assignmentWriteCompletedAt)return;return {...current,assignmentState:'pending',assignmentWriterId:null,assignmentWriteStartedAt:null,assignmentWriteCompletedAt:null,assignmentReceipts:null};});
      if(reset.committed){console.log('[ASSIGNMENT] stale writer released',{writerId,roundToken:game.roundToken});state.pendingRoundToken=game.roundToken;state.pendingAssignments=null;void finalizeRoundAssignments(String(game.roundToken));}
    }catch(error){console.error('[ASSIGNMENT] ERROR',{operation:'recoverStalledAssignmentWrite',code:error?.code,message:error?.message,path:state.roomRef?.toString(),error});}
  }
  
  function normalizeAssetUrl(value){
    const raw=String(value||'').trim();
    if(!raw)return '';
    if(/^(?:https?:|data:|blob:)/i.test(raw))return raw;
    return raw.replace(/^\/+/, './');
  }
  function imageSource(character){
    if(!character)return '';
    const source=[character.imagen,character.image,character.foto,character.img,character.src,character.imageUrl,character.url].find(value=>typeof value==='string'&&value.trim())||'';
    return normalizeAssetUrl(source);
  }
  function placeholder(){return '<div class="image-placeholder">SIN IMAGEN</div>';}
  function renderCharacterImage(boxId,character){
    const box=$(boxId);if(!box)return;box.innerHTML='';const source=imageSource(character);
    if(!source){console.warn('Personaje sin imagen válida',character);box.innerHTML=placeholder();return;}
    const image=document.createElement('img');image.className='character-image';image.alt='Imagen del personaje';image.loading='lazy';image.decoding='async';image.referrerPolicy='no-referrer';image.src=source;
    image.onerror=()=>{console.warn('No se pudo cargar la imagen del personaje',character?.id,source);box.innerHTML=placeholder();};box.appendChild(image);
  }
  function renderPreparation(game,remainingSeconds){
    const localGame=state.whoamiLocal;
    if(localGame&&['handoff','preparing'].includes(localGame.phase)){
      const player=localGame.players?.[localGame.revealIndex],name=String(player?.name||'Jugador').trim(),upper=name.toUpperCase();
      setText('prepRoundLabel',`RONDA ${localGame.round} DE ${localGame.totalRounds}`);
      document.querySelector('#prep .prep-small')?.replaceChildren(document.createTextNode('ENTREGA DEL CELULAR'));
      document.querySelector('#prep .prep-title')?.replaceChildren(document.createTextNode(`LE TOCA A ${upper}`));
      document.querySelector('#prep .prep-message')?.replaceChildren(document.createTextNode(`PÁSALE EL CELULAR A ${upper}`));
      document.querySelector('#prep .phone-guide-caption')?.replaceChildren(document.createTextNode('Pantalla hacia los demás · tú mirando al frente'));
      document.querySelector('#prep .prep-sub')?.replaceChildren(document.createTextNode(`Al llegar a 0: ${upper}, NO MIRES LA PANTALLA · LOS DEMÁS PUEDEN MIRAR`));
      if(Number.isFinite(Number(remainingSeconds)))setText('prepCountdown',Number(remainingSeconds));
      return;
    }
    setText('prepRoundLabel',`RONDA ${game.currentRound} DE ${game.totalRounds}`);
    document.querySelector('#prep .prep-small')?.replaceChildren(document.createTextNode('PREPARACIÓN'));
    document.querySelector('#prep .prep-title')?.replaceChildren(document.createTextNode('PON EL CELULAR FRENTE A TI'));
    document.querySelector('#prep .prep-message')?.replaceChildren(document.createTextNode('Sin mirar la pantalla.'));
    document.querySelector('#prep .phone-guide-caption')?.replaceChildren(document.createTextNode('Pantalla hacia los demás · tú mirando al frente'));
    document.querySelector('#prep .prep-sub')?.replaceChildren(document.createTextNode('No se mostrará ningún personaje hasta llegar a 0.'));
  }
  function schedulePreparation(game){
    const prepEndsAt=Number(game?.prepEndsAt);
    if(!Number.isFinite(prepEndsAt))return;
    void requestScreenWakeLock();
    startSynchronizedCountdown({
      phase:'preparing',
      round:game.currentRound,
      endsAt:prepEndsAt,
      elementId:'prepCountdown',
      onZero:()=>transitionPreparationToReveal(game,`prep:${Number(game.currentRound)}:${prepEndsAt}`)
    });
  }
  async function transitionPreparationToReveal(game,key){
    if(state.mode!=='host'||state.transitionKey===key||!state.roomRef)return false;
    state.transitionKey=key;
    let committed=false;
    try{
    const expectedRound=Number(game.currentRound||0),expectedToken=String(game.roundToken||''),expectedPrepEndsAt=Number(game.prepEndsAt),latest=(await withTimeout(state.roomRef.once('value'),7000,'preparing-transition-read-timeout')).val(),latestGame=latest?.game||{};
      if(!latest||latestGame.phase!=='preparing'||Number(latestGame.currentRound)!==expectedRound||String(latestGame.roundToken||'')!==expectedToken){state.transitionKey='';return false;}
      const cleanedLatest=await pruneInactiveRoundPlayers(latest),cleanedGame=cleanedLatest?.game||latestGame,validation=validateRoundAssignments(cleanedLatest);
      const assignmentsWritten=Boolean(cleanedGame.assignmentWriteCompletedAt);
      const assignmentPhaseReady=['writing','ready'].includes(String(cleanedGame.assignmentState||''));
      // Los 10 s pertenecen a PREPARACIÓN. No bloqueamos REVEAL esperando
      // confirmaciones de lectura que pueden llegar unos instantes después.
      // Lo imprescindible es que las cartas privadas y públicas ya hayan sido
      // escritas por Firebase. Los clientes recuperan su carta durante REVEAL.
      if(!assignmentsWritten||!assignmentPhaseReady){
        console.warn('[ASSIGNMENT VALIDATION] esperando escritura de cartas',validation);
        if(state.mode==='host'&&cleanedGame.assignmentState==='pending'&&cleanedGame.roundToken)void finalizeRoundAssignments(cleanedGame.roundToken);
        state.transitionKey='';return false;
      }
      const result=await state.roomRef.child('game').transaction(current=>{
        const prepEndsAt=Number(current?.prepEndsAt);
        if(!current||current.phase!=='preparing'||Number(current.currentRound)!==expectedRound||String(current.roundToken||'')!==expectedToken||prepEndsAt!==expectedPrepEndsAt||serverNow()<prepEndsAt||!current.assignmentWriteCompletedAt||!['writing','ready'].includes(String(current.assignmentState||'')))return;
        const revealStartedAt=serverNow(),revealEndsAt=revealStartedAt+CHARACTER_DISPLAY_DURATION_MS;
        return {...current,phase:'reveal',revealAt:revealStartedAt,revealEndsAt};
      });
      if(result.committed){committed=true;processCommittedRoomGame(result.snapshot.val());console.log('[GAME STATE] preparing → reveal',{round:expectedRound});return true;}
      return false;
    }catch(error){console.error('[GAME STATE] ERROR',{operation:'preparing→reveal',code:error?.code,message:error?.message,path:state.roomRef.toString(),error});return false;}
    finally{if(!committed&&state.transitionKey===key)state.transitionKey='';}
  }
  function renderReveal(game){
    if(state.whoamiLocal){
      const localGame=state.whoamiLocal,player=localGame.players?.[localGame.revealIndex],assignment=localGame.assignments?.[player?.id],wrap=document.querySelector('#reveal .countdown-wrap'),button=$('whoamiLocalRevealContinueBtn'),name=String(player?.name||'Jugador').trim(),upper=name.toUpperCase();
      setText('revealRoundLabel',`RONDA ${localGame.round} DE ${localGame.totalRounds} · ${upper}`);setText('revealAudience',`${upper}, NO MIRES`);setText('revealCharacterName',assignment?.character?.nombre?cleanUiText(assignment.character.nombre):'Preparando personaje…');setText('revealCharacterCategory',assignment?.character?.categoria?cleanUiText(assignment.character.categoria):'');renderCharacterImage('revealCharacterImageBox',assignment?.character||null);document.querySelector('#reveal .title')?.replaceChildren(document.createTextNode(`${upper}, NO MIRES LA PANTALLA`));document.querySelector('#reveal .muted')?.replaceChildren(document.createTextNode('LOS DEMÁS PUEDEN MIRAR'));document.querySelector('#reveal .reveal-kicker')?.replaceChildren(document.createTextNode('REVEAL DEL PERSONAJE'));wrap?.classList.add('hidden');button?.classList.remove('hidden');if(button)button.textContent=localGame.revealIndex>=localGame.players.length-1?'TERMINAR REVEAL':`SIGUIENTE JUGADOR · ${String(localGame.players?.[localGame.revealIndex+1]?.name||'SIGUIENTE').toUpperCase()}`;return;
    }
    document.querySelector('#reveal .title')?.replaceChildren(document.createTextNode('PREPÁRENSE'));document.querySelector('#reveal .muted')?.replaceChildren(document.createTextNode('Otra persona debe mirar esta pantalla y colocar la carta. No mires.'));document.querySelector('#reveal .reveal-kicker')?.replaceChildren(document.createTextNode('COLOCA ESTA CARTA'));document.querySelector('#reveal .countdown-wrap')?.classList.remove('hidden');$('whoamiLocalRevealContinueBtn')?.classList.add('hidden');
    const assignment=getCurrentPlayerAssignment(game);
    setText('revealRoundLabel',`RONDA ${game.currentRound} DE ${game.totalRounds}`);
    setText('revealAudience','TU CARTA — NO MIRES');
    if(!assignment){
      setText('revealCharacterName','Preparando carta…');
      setText('revealCharacterCategory','');
      renderCharacterImage('revealCharacterImageBox',null);
      return;
    }
    const character=assignment.character;
    renderCharacterImage('revealCharacterImageBox',character);
    setText('revealCharacterName',cleanUiText(character.nombre));
    setText('revealCharacterCategory',cleanUiText(character.categoria));
  }
  function scheduleReveal(game){
    const revealEndsAt=revealEndAt(game);
    if(!Number.isFinite(revealEndsAt))return;
    void (async()=>{await releaseScreenWakeLock();await requestScreenWakeLock();})();
    startSynchronizedCountdown({
      phase:'reveal',
      round:game.currentRound,
      endsAt:revealEndsAt,
      elementId:'revealCountdown',
      onZero:()=>transitionRevealToStarting(game,`reveal:${Number(game.currentRound)}:${revealEndsAt}`)
    });
  }
  async function transitionRevealToStarting(game,key){
    if(state.mode!=='host'||state.transitionKey===key||!state.roomRef)return false;
    state.transitionKey=key;
    const expectedRevealEndsAt=revealEndAt(game);
    try{
      const result=await state.roomRef.child('game').transaction(current=>{
        const explicitRevealEndsAt=Number(current?.revealEndsAt),revealStartedAt=Number(current?.revealAt),revealEndsAt=explicitRevealEndsAt>0?explicitRevealEndsAt:(revealStartedAt>0?revealStartedAt+CHARACTER_DISPLAY_DURATION_MS:NaN);
        if(!current||current.phase!=='reveal'||Number(current.currentRound)!==Number(game.currentRound)||String(current.roundToken||'')!==String(game.roundToken||'')||revealEndsAt!==expectedRevealEndsAt)return;
        // Todos pueden solicitar el cambio, pero Firebase solo lo acepta
        // cuando el timestamp compartido ya venció.
        if(Number.isFinite(revealEndsAt)&&revealEndsAt>0&&serverNow()+250<revealEndsAt)return;
        const startingStartedAt=serverNow(),startingEndsAt=startingStartedAt+STARTING_TRANSITION_DURATION_MS;
        return {...current,phase:'starting',revealedAt:startingStartedAt,startingEndsAt,revealEndsAt:null,currentTurn:'',turnIndex:-1,turnOrder:[],friendsStartedAt:null};
      });
      if(result.committed){processCommittedRoomGame(result.snapshot.val());clearTransitionRetry();return true;}
      state.transitionKey='';
      return false;
    }catch(error){
      console.warn('reveal → starting transition',error);
      state.transitionKey='';
      if(state.lastRoomData?.game?.phase==='reveal'){
        scheduleTransitionRetry(()=>transitionRevealToStarting(game,key));
      }
      return false;
    }
  }
  function renderStarting(game){
    setText('startingCountdown',Math.max(1,Math.ceil((Number(game.startingEndsAt||serverNow())-serverNow())/1000)));
  }
  function scheduleStarting(game){
    const startingEndsAt=Number(game?.startingEndsAt);
    if(!Number.isFinite(startingEndsAt)||startingEndsAt<=0)return;
    void requestScreenWakeLock();
    startSynchronizedCountdown({
      phase:'starting',
      round:game.currentRound,
      endsAt:startingEndsAt,
      elementId:'startingCountdown',
      playZeroFeedback:true,
      onZero:()=>transitionStartingToPlaying(game,`starting:${Number(game.currentRound)}:${startingEndsAt}`)
    });
  }
  async function transitionStartingToPlaying(game,key){
    if(state.mode!=='host'||state.transitionKey===key||!state.roomRef)return false;
    state.transitionKey=key;
    try{
      const result=await state.roomRef.child('game').transaction(current=>{
        const startingEndsAt=Number(current?.startingEndsAt);
        if(!current||current.phase!=='starting'||Number(current.currentRound)!==Number(game.currentRound)||String(current.roundToken||'')!==String(game.roundToken||'')||startingEndsAt!==Number(game.startingEndsAt))return;
        if(Number.isFinite(startingEndsAt)&&startingEndsAt>0&&serverNow()+100<startingEndsAt)return;
        return {...current,phase:'playing',startingEndsAt:null,currentTurn:'',turnIndex:-1,turnOrder:[],friendsStartedAt:null};
      });
      if(result.committed){processCommittedRoomGame(result.snapshot.val());clearTransitionRetry();return true;}
      state.transitionKey='';
      return false;
    }catch(error){
      console.warn('starting → playing transition',error);
      state.transitionKey='';
      if(state.lastRoomData?.game?.phase==='starting'){
        scheduleTransitionRetry(()=>transitionStartingToPlaying(game,key));
      }
      return false;
    }
  }
  async function migrateLegacyFriendsPhase(game){
    if(!state.roomRef||state.mode!=='host')return;
    try{
      await state.roomRef.child('game').transaction(current=>{
        if(!current||current.phase!=='friends'||current.currentRound!==game.currentRound)return;
        return {...current,phase:'playing',currentTurn:'',turnIndex:-1,turnOrder:[],friendsStartedAt:null};
      });
    }catch(error){console.warn('legacy friends transition',error);}
  }
  function scheduleAssignmentRecovery(){
    if(state.privateAssignmentRecoveryTimer||!state.roomRef||!state.roomCode||!state.playerId)return;
    const phase=state.lastRoomData?.game?.phase||'',attempts=state.privateAssignmentRecoveryAttempts||0;if(!['reveal','starting','playing','scoring','results'].includes(phase)||attempts>=6)return;
    state.privateAssignmentRecoveryAttempts=attempts+1;
    state.privateAssignmentRecoveryTimer=setTimeout(async()=>{
      state.privateAssignmentRecoveryTimer=null;
      try{
        const snap=await withTimeout(db.ref(`privateAssignments/${state.roomCode}/${state.playerId}`).once('value'),7000,'private-assignment-recovery-timeout'),value=snap.val(),round=Number(state.lastRoomData?.game?.currentRound||0);
        if(value&&Number(value.round)===round&&String(value.roundToken||'')===String(state.lastRoomData?.game?.roundToken||'')&&value.character?.nombre&&value.character?.categoria){state.privateAssignment=value;state.myAssignment=value;state.privateAssignmentRecoveryAttempts=0;console.log('[ASSIGNMENT] private recovery OK',{round});if(state.lastRoomData?.game?.phase==='reveal')renderReveal(state.lastRoomData.game);return;}
      }catch(error){console.error('[ASSIGNMENT] ERROR',{operation:'private recovery',code:error?.code,message:error?.message,path:`privateAssignments/${state.roomCode}/${state.playerId}`,error});}
      scheduleAssignmentRecovery();
    },Math.min(3500,500*Math.pow(1.45,attempts)));
  }
  function renderPlaying(game,data){
    if(state.whoamiLocal){
      const players=localActivePlayers(state.whoamiLocal),list=$('playingCharacterList');setText('playingRoundTag',`RONDA ${state.whoamiLocal.round} LISTA`);if(list)list.innerHTML=players.map(player=>`<div class="friend-row character-public-row"><div class="friend-main"><div class="friend-name">${escapeHtml(cleanUiText(player.name))}</div><div class="friend-character">✅ PERSONAJE ENTREGADO</div><div class="friend-category">Jueguen y ayúdense con pistas</div></div></div>`).join('');const scoreButton=$('scoreRoundBtn');if(scoreButton){scoreButton.classList.remove('hidden');scoreButton.disabled=false;scoreButton.textContent='ABRIR RESULTADO';}setText('playingWaiting','Cuando terminen de jugar, abre el resultado y asigna los lugares.');return;
    }
    // En PLAYING usamos los jugadores que fueron fijados para esta ronda en
    // game.activePlayers. No debemos esconder una carta solo porque un cliente
    // esté momentáneamente reconectando o su presencia tenga unos ms de retraso.
    const activeIds=Object.keys(game?.activePlayers||{});
    const playerById=new Map(normalizeRoomPlayers(data).map(player=>[String(player.id),player]));
    const companionsIds=activeIds.filter(id=>String(id)!==String(state.playerId));
    const myAssignment=getCurrentPlayerAssignment(game);
    const myCharacterKey=characterKey(myAssignment?.character||{});
    const publicCharacters=Array.isArray(game.publicCharacters)
      ? game.publicCharacters
      : Object.values(game.publicCharacters||{});
    const characterByPlayer=new Map(publicCharacters.filter(Boolean).map(character=>[String(character.playerId||''),character]));
    setText('playingRoundTag',`RONDA ${game.currentRound} LISTA`);
    const list=$('playingCharacterList');
    list.replaceChildren();

    const visibleCharacters=[];
    companionsIds.forEach((playerId,index)=>{
      const player=playerById.get(String(playerId))||{id:String(playerId),name:game?.playerNames?.[playerId]||`Jugador ${index+1}`};
      const character=characterByPlayer.get(String(playerId));
      if(!character||characterKey(character)===myCharacterKey)return;
      visibleCharacters.push(character);
      const row=document.createElement('div');
      row.className='friend-row character-public-row';
      row.setAttribute('role','listitem');
      const media=document.createElement('div');
      media.className='friend-character-media';
      const imageBox=document.createElement('div');
      imageBox.className='playing-character-image-box';
      media.appendChild(imageBox);
      const main=document.createElement('div');
      main.className='friend-main';
      const playerName=document.createElement('div');
      playerName.className='friend-name';
      playerName.textContent=cleanUiText(player.name||character.playerName)||`Jugador ${index+1}`;
      const characterName=document.createElement('div');
      characterName.className='friend-character';
      characterName.textContent=cleanUiText(character.nombre)||'Personaje';
      const category=document.createElement('div');
      category.className='friend-category';
      category.textContent=cleanUiText(character.categoria||'');
      main.append(playerName,characterName,category);
      if(accountUid()&&player.accountUid&&String(player.accountUid)!==String(accountUid())&&!state.friendData[String(player.accountUid)]){
        const action=document.createElement('div');
        action.className='game-friend-action';
        const button=document.createElement('button');
        button.className='small-btn success';
        button.type='button';
        button.textContent='AGREGAR AMIGO';
        button.addEventListener('click',()=>void addFriendFromGame(String(player.accountUid),String(player.name||'usuario'),button));
        action.appendChild(button);
        main.appendChild(action);
      }
      row.append(media,main);
      list.appendChild(row);
      renderCharacterImageIntoElement(imageBox,character);
    });

    if(!publicCharacters.length){
      emptyAccountList('playingCharacterList','Las cartas de la ronda todavía se están preparando…');
    }else if(!visibleCharacters.length){
      emptyAccountList('playingCharacterList','No hay otros personajes para mostrar.');
    }
    if(!state.myAssignment&&['playing','scoring','results'].includes(game.phase))scheduleAssignmentRecovery();
    const host=isHost(data),scoreButton=$('scoreRoundBtn');
    scoreButton?.classList.remove('hidden');
    if(scoreButton)scoreButton.disabled=game.phase!=='playing'||!game.activePlayers?.[state.playerId];
    setText('playingWaiting',host?'Cuando terminen, abre el resultado para asignar los lugares.':'Cuando terminen, el anfitrión abrirá el resultado y asignará los lugares.');

    function renderCharacterImageIntoElement(box,character){
      if(!box)return;
      const source=imageSource(character);
      if(!source){box.innerHTML='<div class="image-placeholder">SIN IMAGEN</div>';return;}
      const image=document.createElement('img');
      image.className='character-image';
      image.alt=`Personaje de ${cleanUiText(character.playerName)||'jugador'}`;
      image.loading='lazy';
      image.decoding='async';
      image.referrerPolicy='no-referrer';
      image.src=source;
      image.onerror=()=>{box.innerHTML='<div class="image-placeholder">SIN IMAGEN</div>';};
      box.appendChild(image);
    }
  }
  async function openScoring(){
    if(state.whoamiLocal){openWhoamiLocalScoring();return;}
    if(state.busy.score||!state.roomRef||state.mode!=='host') return;setBusy('score',true);setButtonBusy('scoreRoundBtn','score',true,'ABRIENDO VOTACIÓN…');
    try{const data=(await withTimeout(state.roomRef.once('value'),7000,'open-scoring-read-timeout')).val();if(!data||data.game?.phase!=='playing'||!data.game?.activePlayers?.[state.playerId])return;const players=activeGamePlayers(data),hostId=String(data.hostId||'');if(hostId&&data.game?.activePlayers?.[hostId]===true&&!players.some(player=>String(player.id)===hostId))players.push({id:hostId,...(data.players?.[hostId]||{}),name:String(data.players?.[hostId]?.name||data.hostName||hostId)});if(players.length<2){notice('Necesitas al menos 2 jugadores activos para registrar el resultado.','error','lobbyNotice');return;}const result=await state.roomRef.child('game').transaction(game=>{if(!game||game.phase!=='playing'||!game.activePlayers?.[state.playerId])return;return {...game,phase:'scoring',whoamiVotingPlayers:null,whoamiVotes:null,roundResults:null};});if(!result.committed)notice('El resultado ya está siendo abierto por otro dispositivo.','error','lobbyNotice');}
    catch(error){console.error(error);notice('No se pudo abrir la votación.','error','lobbyNotice');}
    finally{setBusy('score',false);setButtonBusy('scoreRoundBtn','score',false);}
  }
  function fillPlaceSelect(id,players,allowEmpty){
    const select=$(id);if(!select)return;const desired=[{value:'',text:allowEmpty?'SIN ASIGNAR':'Selecciona un jugador'},...players.map(player=>({value:String(player.id),text:cleanUiText(player.name)}))],currentValue=select.value,existing=new Map([...select.options].map(option=>[option.value,option])),desiredValues=new Set(desired.map(option=>option.value));
    [...select.options].forEach(option=>{if(!desiredValues.has(option.value))option.remove();});
    desired.forEach(item=>{let option=existing.get(item.value);if(!option){option=document.createElement('option');option.value=item.value;}if(option.textContent!==item.text)option.textContent=item.text;select.appendChild(option);});
    select.value=desiredValues.has(currentValue)?currentValue:'';
  }
  const WHOAMI_VOTE_OPTIONS=Object.freeze({
    valid:{symbol:'✓',label:'VÁLIDO',points:10,className:'valid'},
    half:{symbol:'〰️',label:'MEDIO / REPETIDA',points:5,className:'half'},
    invalid:{symbol:'✕',label:'INCORRECTO',points:0,className:'invalid'}
  });
  function whoamiVoteOption(choice){return WHOAMI_VOTE_OPTIONS[choice]||null;}
  function whoamiVotingIds(game){
    const hasVotingSnapshot=Boolean(game?.whoamiVotingPlayers),configured=game?.whoamiVotingPlayers||game?.activePlayers||{};
    const ids=Array.isArray(configured)?configured.map(String):Object.keys(configured).filter(id=>configured[id]===true);
    const active=game?.activePlayers||{};
    return ids.filter(id=>!hasVotingSnapshot||active[id]===true);
  }
  function whoamiPlayerName(data,game,id){return cleanUiText(data?.players?.[id]?.name||game?.playerNames?.[id]||id||'Jugador');}
  function whoamiVoteBuckets(targetId,voters,votes){
    const buckets={valid:[],half:[],invalid:[]},targetVotes=votes?.[targetId]||{};
    voters.filter(voterId=>String(voterId)!==String(targetId)).forEach(voterId=>{if(buckets[targetVotes[voterId]])buckets[targetVotes[voterId]].push(String(voterId));});
    return buckets;
  }
  function whoamiVoterNames(ids,data,game){return ids.map(id=>whoamiPlayerName(data,game,id)).filter(Boolean).map(escapeHtml).join(', ')||'nadie';}
  function whoamiVoteSummaryHtml(targetId,voters,votes,data,game){
    const buckets=whoamiVoteBuckets(targetId,voters,votes);
    return `<span class="valid"><b>✓ Sí:</b> ${whoamiVoterNames(buckets.valid,data,game)}</span><span class="half"><b>〰️ Medio:</b> ${whoamiVoterNames(buckets.half,data,game)}</span><span class="invalid"><b>✕ No:</b> ${whoamiVoterNames(buckets.invalid,data,game)}</span>`;
  }
  function renderWhoamiVoting(game,data){
    const voters=whoamiVotingIds(game),votes=game.whoamiVotes||{},list=$('whoamiVotingList'),ownId=String(state.playerId||'');
    if(!list)return;
    if(voters.length<2){list.innerHTML='<div class="info">No hay suficientes jugadores activos para votar.</div>';setText('whoamiVotingProgress','');return;}
    let totalVotes=0,expectedVotes=0;
    list.innerHTML=voters.map((targetId,index)=>{
      const targetName=whoamiPlayerName(data,game,targetId),self=String(targetId)===ownId,targetVotes=votes[targetId]||{},expected=voters.filter(voterId=>String(voterId)!==String(targetId));
      expectedVotes+=expected.length;totalVotes+=expected.filter(voterId=>whoamiVoteOption(targetVotes[voterId])).length;
      const selected=whoamiVoteOption(targetVotes[ownId]);
      const actions=self?'No puedes evaluarte a ti mismo.':Object.entries(WHOAMI_VOTE_OPTIONS).map(([choice,option])=>`<button type="button" class="whoami-vote-choice ${option.className}${selected&&selected===option?' selected':''}" data-whoami-vote="${escapeHtml(choice)}" data-target-player="${escapeHtml(String(targetId))}" aria-label="${escapeHtml(option.label)} para ${escapeHtml(targetName)}" aria-pressed="${selected===option?'true':'false'}">${option.symbol}<br>${option.label}</button>`).join('');
      return `<div class="whoami-vote-card${self?' self':''}" role="listitem"><div class="whoami-vote-card-head"><span class="whoami-vote-target">${escapeHtml(targetName)}${self?' <small>TU RESULTADO</small>':''}</span><span class="whoami-vote-points">${selected&&!self?`${selected.symbol} elegido`:'VOTA'}</span></div><div class="whoami-vote-actions">${actions}</div><div class="whoami-vote-summary">${whoamiVoteSummaryHtml(targetId,voters,votes,data,game)}</div></div>`;
    }).join('');
    setText('whoamiVotingProgress',totalVotes===expectedVotes?'Todos votaron. Calculando el resultado…':`${totalVotes} de ${expectedVotes} votos registrados. Cada jugador debe evaluar a los demás.`);
    list.querySelectorAll('[data-whoami-vote]').forEach(button=>button.addEventListener('click',()=>void submitWhoamiVote(button.dataset.targetPlayer,button.dataset.whoamiVote)));
  }
  async function submitWhoamiVote(targetId,choice){
    const option=whoamiVoteOption(choice);if(!option||whoamiVoteInFlight||!state.roomRef)return;
    const ids=whoamiVotingIds(state.lastRoomData?.game||{}),ownId=String(state.playerId||'');if(!ids.includes(ownId)||String(targetId)===ownId||!ids.includes(String(targetId)))return;
    whoamiVoteInFlight=true;renderScoring(state.lastRoomData?.game||{},state.lastRoomData||{});
    try{
      const voteRef=state.roomRef.child(`game/whoamiVotes/${String(targetId)}/${ownId}`),result=await voteRef.transaction(current=>current||choice);
      if(result.committed){const nextData={...state.lastRoomData,game:{...state.lastRoomData.game,whoamiVotes:{...(state.lastRoomData.game.whoamiVotes||{}),[String(targetId)]:{...(state.lastRoomData.game.whoamiVotes?.[String(targetId)]||{}),[ownId]:choice}}}};state.lastRoomData=nextData;renderScoring(nextData.game,nextData);void maybeFinalizeWhoamiVoting(nextData,nextData.game);}
      else notice('La votación ya terminó o tu voto no está disponible.','error','scoringNotice');
    }catch(error){console.warn('[WHOAMI VOTE] write failed',error);notice('No se pudo registrar tu voto. Revisa la conexión.','error','scoringNotice');}
    finally{whoamiVoteInFlight=false;if(state.lastRoomData?.game?.phase==='scoring')renderScoring(state.lastRoomData.game,state.lastRoomData);}
  }
  function whoamiVotesComplete(game){
    const voters=whoamiVotingIds(game),votes=game?.whoamiVotes||{};return voters.length>=2&&voters.every(targetId=>voters.filter(voterId=>String(voterId)!==String(targetId)).every(voterId=>whoamiVoteOption(votes[targetId]?.[voterId])));
  }
  function whoamiOutcome(counts){
    const top=Math.max(...Object.values(counts)),winners=Object.keys(counts).filter(choice=>counts[choice]===top);
    if(top===0||winners.length!==1)return {key:'tie',symbol:'—',label:'SIN MAYORÍA',points:0,className:'tie'};
    const option=whoamiVoteOption(winners[0]);return {key:winners[0],symbol:option.symbol,label:option.label,points:option.points,className:option.className};
  }
  async function maybeFinalizeWhoamiVoting(data,game){if(state.mode==='host'&&whoamiVotesComplete(game))await finalizeWhoamiVoting();}
  async function finalizeWhoamiVoting(){
    if(!state.roomRef||state.mode!=='host')return false;
    const result=await state.roomRef.child('game').transaction(game=>{
      if(!game||game.phase!=='scoring'||!whoamiVotesComplete(game))return;
      const voters=whoamiVotingIds(game),votes=game.whoamiVotes||{},names=game.playerNames||{},standings=voters.map(targetId=>{
        const buckets=whoamiVoteBuckets(targetId,voters,votes),counts={valid:buckets.valid.length,half:buckets.half.length,invalid:buckets.invalid.length},outcome=whoamiOutcome(counts);
        return {playerId:targetId,name:String(names[targetId]||targetId),outcome:outcome.key,points:outcome.points,voteCounts:counts,votes:buckets};
      });
      const scores={...(game.scores||{})};standings.forEach(row=>{scores[row.playerId]=(Number(scores[row.playerId])||0)+row.points;});
      return {...game,phase:'results',whoamiVotes:votes,roundResults:{type:'whoamiVoting',round:game.currentRound,standings,completedAt:firebase.database.ServerValue.TIMESTAMP},scores};
    });
    return Boolean(result.committed);
  }
  function renderScoring(game,data,{force=false,resetSelection=false}={}){
    if(state.whoamiLocal){const players=localActivePlayers(state.whoamiLocal);$('whoamiVotingView')?.classList.add('hidden');$('scoringHostView')?.classList.remove('hidden');$('scoringWaiting')?.classList.add('hidden');setText('scoringRoundLabel',`RONDA ${state.whoamiLocal.round} DE ${state.whoamiLocal.totalRounds}`);setText('scoringIntro','Asigna el resultado de la ronda en este teléfono. El personaje de cada jugador ya fue entregado en privado.');fillPlaceSelect('firstPlaceSelect',players,false);fillPlaceSelect('secondPlaceSelect',players,false);fillPlaceSelect('thirdPlaceSelect',players,players.length<3);if(resetSelection){$('firstPlaceSelect').value='';$('secondPlaceSelect').value='';$('thirdPlaceSelect').value='';}return;}
    const isWhoami=miniRoomType(data)===GAME_TYPES.WHOAMI||state.gameType===GAME_TYPES.WHOAMI;
    const host=isHost(data),players=activeGamePlayers(data),renderKey=`${Number(game.currentRound)||0}:${players.map(player=>player.id).sort().join('|')}`;setText('scoringRoundLabel',`RONDA ${game.currentRound} DE ${game.totalRounds}`);$('whoamiVotingView')?.classList.add('hidden');$('scoringHostView').classList.toggle('hidden',!host);$('scoringWaiting').classList.toggle('hidden',host);setText('scoringIntro',isWhoami?'El anfitrión registra el resultado de la ronda y asigna los lugares.':'El anfitrión registra el resultado de la ronda.');
    if(host&&(force||state.scoringRenderKey!==renderKey)){const values=resetSelection?{first:'',second:'',third:''}:{first:$('firstPlaceSelect')?.value||'',second:$('secondPlaceSelect')?.value||'',third:$('thirdPlaceSelect')?.value||''};fillPlaceSelect('firstPlaceSelect',players,false);fillPlaceSelect('secondPlaceSelect',players,false);fillPlaceSelect('thirdPlaceSelect',players,players.length<3);$('firstPlaceSelect').value=values.first;$('secondPlaceSelect').value=values.second;$('thirdPlaceSelect').value=values.third;setText('scoringNotice','');state.scoringRenderKey=renderKey;}
    if(!host)state.scoringRenderKey=renderKey;
  }
  async function confirmResult(){
    if(state.whoamiLocal){confirmWhoamiLocalResult();return;}
    if(state.busy.confirm||!state.roomRef||state.mode!=='host')return;
    const first=$('firstPlaceSelect').value,second=$('secondPlaceSelect').value,third=$('thirdPlaceSelect').value;
    if(!first||!second){notice('Debes seleccionar el 1° y el 2° lugar.','error','scoringNotice');return;}
    setBusy('confirm',true);setButtonBusy('confirmResultBtn','confirm',true,'CONFIRMANDO…');
    try{
      const data=(await withTimeout(state.roomRef.once('value'),7000,'confirm-result-read-timeout')).val();if(!data||!isHost(data)||data.game?.phase!=='scoring'){notice('La ronda ya no está disponible para confirmar.','error','scoringNotice');return;}
      const players=activeGamePlayers(data),valid=new Set(players.map(player=>String(player.id)));
      if(!valid.has(first)||!valid.has(second)||(third&&!valid.has(third))){notice('Todos los puestos deben pertenecer a los jugadores activos de la ronda.','error','scoringNotice');return;}
      if(first===second||(third&&(first===third||second===third))){notice('Cada puesto debe ser para un jugador diferente.','error','scoringNotice');return;}
      if(players.length>=3&&!third){notice('Selecciona el 3° lugar.','error','scoringNotice');return;}
      const names=playerNames(data,data.game),places={first:{playerId:first,name:cleanUiText(names[first]),points:3},second:{playerId:second,name:cleanUiText(names[second]),points:2},third:third?{playerId:third,name:cleanUiText(names[third]),points:1}:null};
      const result=await state.roomRef.child('game').transaction(game=>{
        if(!game||game.phase!=='scoring'||game.roundResults)return;
        const active=new Set(Object.keys(game.activePlayers||{}).filter(id=>game.activePlayers[id]));if(!active.has(first)||!active.has(second)||(third&&!active.has(third))||first===second||(third&&(first===third||second===third)))return;
        const scores={...(game.scores||{})};active.forEach(id=>{if(scores[id]===undefined)scores[id]=0;});
        scores[first]=(Number(scores[first])||0)+3;scores[second]=(Number(scores[second])||0)+2;if(third)scores[third]=(Number(scores[third])||0)+1;
        return {...game,phase:'results',scores,roundResults:{round:game.currentRound,places,completedAt:firebase.database.ServerValue.TIMESTAMP}};
      });
      if(!result.committed)notice('El resultado ya fue confirmado o la ronda cambió.','error','scoringNotice');
    }catch(error){console.error('confirm result',error);notice('No se pudo confirmar el resultado.','error','scoringNotice');}
    finally{setBusy('confirm',false);setButtonBusy('confirmResultBtn','confirm',false);}
  }
  function sortedScoreRows(game,data){
    const names=playerNames(data,game),scores=game.scores||{};return Object.keys(scores).map(id=>({id,name:cleanUiText(names[id]||id),score:Number(scores[id])||0})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'es'));
  }
  function whoamiResultOutcome(row){
    if(row?.outcome==='tie')return {symbol:'—',label:'SIN MAYORÍA',points:0,className:'tie'};
    const option=whoamiVoteOption(row?.outcome);return option?{symbol:option.symbol,label:option.label,points:option.points,className:option.className}:{symbol:'—',label:'SIN MAYORÍA',points:0,className:'tie'};
  }
  function renderWhoamiResults(game,data){
    const result=game.roundResults||{},rows=Array.isArray(result.standings)?result.standings:[];setText('resultsTitle','RESULTADO DE LA VOTACIÓN');setText('resultsRoundLabel',`RONDA ${game.currentRound} DE ${game.totalRounds}`);setText('resultsWaiting','');
    $('roundResultList').innerHTML=rows.map(row=>{const outcome=whoamiResultOutcome(row),votes=row.votes||{};return `<div class="whoami-result-card"><div class="whoami-result-head"><span class="whoami-result-name">${escapeHtml(row.name||whoamiPlayerName(data,game,row.playerId))}</span><span class="whoami-result-outcome ${outcome.className}">${outcome.symbol} ${outcome.label}</span></div><div class="whoami-result-votes"><span class="valid"><b>✓ Sí:</b> ${whoamiVoterNames(votes.valid||[],data,game)}</span><br><span class="half"><b>〰️ Medio:</b> ${whoamiVoterNames(votes.half||[],data,game)}</span><br><span class="invalid"><b>✕ No:</b> ${whoamiVoterNames(votes.invalid||[],data,game)}</span></div><div class="whoami-result-points">+${Number(row.points)||0} puntos en esta ronda</div></div>`;}).join('');
    $('roundScoreList').innerHTML=sortedScoreRows(game,data).map(row=>`<div class="score-row"><div class="score-name">${escapeHtml(row.name)}</div><div class="score-points">${row.score}</div></div>`).join('');
    const host=isHost(data),last=Number(game.currentRound)>=Number(game.totalRounds);$('nextRoundBtn').classList.toggle('hidden',!host);$('nextRoundBtn').disabled=false;setText('nextRoundBtn',last?'VER RESULTADOS FINALES':'SIGUIENTE RONDA');setText('resultsWaiting',host?'Continúa cuando todos hayan visto el resultado.':'Esperando al anfitrión…');
  }
  function renderResults(game,data){
    if(state.whoamiLocal){const result=state.whoamiLocal.roundResults||{},places=[result.places?.first,result.places?.second,result.places?.third].filter(Boolean);setText('resultsTitle','RESULTADO DE LA RONDA');setText('resultsRoundLabel',`RONDA ${state.whoamiLocal.round} DE ${state.whoamiLocal.totalRounds}`);setText('resultsWaiting','');$('roundResultList').innerHTML=places.map((place,index)=>`<div class="score-row"><div class="score-main"><div class="score-name">${index+1}° ${escapeHtml(place.name)}</div></div><div class="score-points">+${place.points}</div></div>`).join('');$('roundScoreList').innerHTML=sortedScoreRows(game,data).map(row=>`<div class="score-row"><div class="score-name">${escapeHtml(row.name)}</div><div class="score-points">${row.score}</div></div>`).join('');$('nextRoundBtn').classList.remove('hidden');$('nextRoundBtn').disabled=false;setText('nextRoundBtn',state.whoamiLocal.round>=state.whoamiLocal.totalRounds?'VER RESULTADOS FINALES':'SIGUIENTE RONDA');return;}
    if(game.roundResults?.type==='whoamiVoting'&&miniRoomType(data)!==GAME_TYPES.WHOAMI){renderWhoamiResults(game,data);return;}
    setText('resultsTitle','RESULTADO DE LA RONDA');
    const result=game.roundResults||{},places=[result.places?.first,result.places?.second,result.places?.third].filter(Boolean);setText('resultsRoundLabel',`RONDA ${game.currentRound} DE ${game.totalRounds}`);
    $('roundResultList').innerHTML=places.map((place,index)=>`<div class="score-row"><div class="score-main"><div class="score-name">${index+1}° ${escapeHtml(place.name)}</div></div><div class="score-points">+${place.points}</div></div>`).join('');
    $('roundScoreList').innerHTML=sortedScoreRows(game,data).map(row=>`<div class="score-row"><div class="score-name">${escapeHtml(row.name)}</div><div class="score-points">${row.score}</div></div>`).join('');
    const host=isHost(data),last=Number(game.currentRound)>=Number(game.totalRounds);$('nextRoundBtn').classList.toggle('hidden',!host);$('nextRoundBtn').disabled=false;setText('nextRoundBtn',last?'VER RESULTADOS FINALES':'SIGUIENTE RONDA');setText('resultsWaiting',host?'Continúa cuando todos hayan visto el resultado.':'Esperando al anfitrión…');
  }
  async function nextRound(){
    if(state.whoamiLocal){nextWhoamiLocalRound();return;}
    if(state.gameType===GAME_TYPES.AGE||state.gameType===GAME_TYPES.CONFESSIONS||state.gameType===GAME_TYPES.STOP){await nextMiniRound();return;}
    if(state.busy.next||!state.roomRef||state.mode!=='host')return;setBusy('next',true);setButtonBusy('nextRoundBtn','next',true,'CARGANDO…');
    try{
      const snapshot=await withTimeout(state.roomRef.once('value'),7000,'next-round-read-timeout'),data=snapshot.val();if(!data||!isHost(data)||data.game?.phase!=='results')return;
      if(Number(data.game.currentRound)>=Number(data.game.totalRounds)){const done=await state.roomRef.child('game').transaction(game=>{if(!game||game.phase!=='results')return;return {...game,phase:'finished',assignmentState:null,assignmentWriterId:null,assignmentWriteStartedAt:null,assignmentReceipts:null,roundToken:null};});if(done.committed)await cleanupPrivateAssignmentsAfterFinish();return;}
      const cleaned=await pruneInactiveRoundPlayers(data),players=activeGamePlayers(cleaned),config=selectedRoomConfig(cleaned);if(players.length<2){notice('No hay jugadores activos para continuar.','error','lobbyNotice');return;}
      const stock=validateCardStock(players.length,config.categories,config.totalRounds);if(!stock.valid){notice(getCardStockMessage(stock),'error','lobbyNotice');return;}
      const currentRound=Number(data.game.currentRound)+1,roundToken=`r${currentRound}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`,now=serverNow(),activePlayers={},names={};players.forEach(p=>{activePlayers[p.id]=true;names[p.id]=p.name;});const prepEndsAt=now+PREPARATION_DURATION_MS,revealEndsAt=null;
      const result=await state.roomRef.child('game').transaction(game=>{if(!game||game.phase!=='results'||Number(game.currentRound)!==Number(data.game.currentRound))return;return {...game,phase:'preparing',round:currentRound,currentRound,totalRounds:config.totalRounds,gameStartTime:now,prepEndsAt,revealAt:prepEndsAt,revealEndsAt,startingEndsAt:null,currentTurn:'',turnIndex:-1,turnOrder:[],playerNames:names,publicCharacters:[],roundResults:null,activePlayers,assignmentState:'pending',assignmentWriterId:null,assignmentWriteStartedAt:null,assignmentWriteCompletedAt:null,assignmentReceipts:null,roundToken,secureAssignments:true};});
      if(!result.committed){notice('La siguiente ronda ya está siendo preparada.','error','lobbyNotice');return;}
      state.pendingRoundToken=roundToken;state.pendingAssignments=null;state.assignmentRetryToken=roundToken;state.assignmentRetryCount=0;console.log('[GAME STATE] results → preparing',{round:currentRound});void finalizeRoundAssignments(roundToken);
    }catch(error){console.error('[GAME STATE] ERROR',{operation:'nextRound',code:error?.code,message:error?.message,path:state.roomRef.toString(),error});notice('No se pudo comenzar la siguiente ronda.','error','lobbyNotice');}
    finally{setBusy('next',false);setButtonBusy('nextRoundBtn','next',false);}
  }
  function canEndGameNow(){
    if(!state.roomRef||state.mode!=='host')return false;
    const phase=state.lastRoomData?.game?.phase||'';
    return ['preparing','reveal','starting','playing','scoring','results'].includes(phase);
  }
  function updateFinishButton(){
    const button=$('finishGameBtn');
    if(!button)return;
    const visible=canEndGameNow();
    button.classList.toggle('visible',visible);
    button.disabled=!visible||state.busy.finishGame;
    if(!state.busy.finishGame){button.removeAttribute('aria-busy');button.textContent='FINALIZAR PARTIDA';}
  }
  async function cleanupPrivateAssignmentsAfterFinish(){
    if(!state.roomRef||state.mode!=='host')return;
    try{await Promise.all([db.ref(`privateAssignments/${state.roomCode}`).remove(),db.ref(`tribunalReveals/${state.roomCode}`).remove()]);await state.roomRef.child('metadata').update({lastActiveAt:firebase.database.ServerValue.TIMESTAMP,cleanupEligibleAt:firebase.database.ServerValue.TIMESTAMP});}
    catch(error){console.warn('cleanup private assignments after finish',error);}
  }
  
  async function finishGameEarly(){
    if(state.busy.finishGame||!state.roomRef||state.mode!=='host')return;
    if(!canEndGameNow())return;
    const confirmed=window.confirm('¿Finalizar la partida ahora? No se jugarán más rondas y se mostrarán los puntos acumulados.');
    if(!confirmed)return;
    setBusy('finishGame',true);setButtonBusy('finishGameBtn','finishGame',true,'FINALIZANDO…');clearCountdown();
    try{
      const snapshot=await withTimeout(state.roomRef.once('value'),7000,'finish-game-read-timeout'),data=snapshot.val();
      if(!data||!isHost(data))return;
      const result=await state.roomRef.child('game').transaction(game=>{
        const phase=game?.phase;
        if(!game||!['preparing','reveal','starting','playing','scoring','results'].includes(phase))return;
        return {...game,phase:'finished',finishedEarly:true,finishedAt:firebase.database.ServerValue.TIMESTAMP,finishReason:'host',assignmentState:null,assignmentWriterId:null,assignmentWriteStartedAt:null,assignmentWriteCompletedAt:null,roundToken:null};
      });
      if(result.committed){
        await cleanupPrivateAssignmentsAfterFinish();showSocialToast('Partida finalizada.');haptic([30,80,30]);
      }else{
        notice('La partida ya había terminado.','error','lobbyNotice');
      }
    }catch(error){
      console.error('finish game early',error);
      notice('No se pudo finalizar la partida. Revisa tu conexión.','error','lobbyNotice');
    }finally{
      setBusy('finishGame',false);
      setButtonBusy('finishGameBtn','finishGame',false);
      updateFinishButton();
    }
  }
  function renderFinished(game,data){
    updateFinishButton();
    const rows=sortedScoreRows(game,data),top=rows[0]?.score??0,winners=rows.filter(row=>row.score===top);
    setText('finishText',game.finishedEarly?`Partida finalizada por el anfitrión. Puntaje acumulado tras ${game.currentRound||0} de ${game.totalRounds} rondas.`:`Puntaje acumulado después de ${game.totalRounds} rondas.`);
    $('finalList').innerHTML=rows.map((row,index)=>`<div class="final-row"><span class="final-place">${index+1}°</span><span class="final-name">${escapeHtml(row.name)}</span><span class="final-points">${row.score} puntos</span></div>`).join('');
    if(winners.length>1){$('winnerBox').innerHTML='<div class="winner-card"><div class="winner-crown">🏆</div><div class="tag">EMPATE</div><p class="muted">'+winners.map(row=>`${escapeHtml(row.name)} — ${row.score} puntos`).join('<br>')+'</p><div class="confetti"><span>✦</span><span>✧</span><span>✦</span></div></div>';}else{$('winnerBox').innerHTML='<div class="winner-card"><div class="winner-crown">🏆</div><div class="small">GANADOR</div><div class="personaje" style="margin:8px 0 0">'+escapeHtml(winners[0]?.name||'')+'</div><div class="confetti"><span>✦</span><span>✧</span><span>✦</span></div></div>';}
    const host=isHost(data);$('restartBtn').classList.toggle('hidden',!host);
  }
  async function newGame(){
    if(state.busy.restart||!state.roomRef||state.mode!=='host')return;setBusy('restart',true);setButtonBusy('restartBtn','restart',true,'PREPARANDO…');clearCountdown();
    try{const snapshot=await withTimeout(state.roomRef.once('value'),7000,'restart-game-read-timeout'),data=snapshot.val();if(!data||!isHost(data)||data.game?.phase!=='finished')return;const players=normalizeRoomPlayers(data),scores={},names={};players.forEach(p=>{scores[p.id]=0;names[p.id]=p.name;});
      const result=await state.roomRef.child('game').transaction(game=>{if(!game||game.phase!=='finished')return;return {...game,phase:'lobby',round:0,currentRound:0,gameStartTime:null,prepEndsAt:null,revealAt:null,revealEndsAt:null,startingEndsAt:null,currentTurn:'',turnIndex:-1,turnOrder:[],friendsStartedAt:null,roundResults:null,finishedEarly:false,finishedAt:null,finishReason:null,scores,playerNames:names,activePlayers:{},assignmentState:null,assignmentWriteCompletedAt:null,roundToken:null,secureAssignments:true,tribunal:game.gameType===GAME_TYPES.TRIBUNAL?null:game.tribunal,whatWouldYouDo:null};});
      if(result.committed){const cleanup=[db.ref(`privateAssignments/${state.roomCode}`).remove(),db.ref(`tribunalReveals/${state.roomCode}`).remove()];await Promise.all(cleanup).catch(error=>console.warn('cleanup private game data',error));showSocialToast('Nueva partida preparada.');}
    }catch(error){console.error('new game',error);notice('No se pudo preparar la nueva partida.','error','lobbyNotice');}
    finally{setBusy('restart',false);setButtonBusy('restartBtn','restart',false);}
  }
  async function leaveRoom(preserveRoom=false){
    if(state.busy.leave)return;
    if(!preserveRoom)markVoluntaryRoomExit();
    setBusy('leave',true);cancelReconnect();clearCountdown();clearMiniCountdown();clearChupisticaTimers();
    const ref=state.roomRef,roomId=state.roomCode,uid=backendUid();
    let roomDeleted=false,hostTransferred=false;
    try{
      const snapshot=ref?await withTimeout(ref.once('value'),7000,'leave-room-read-timeout'):null,data=snapshot?.val()||null,currentPlayer=data?.players?.[state.playerId],currentlyHost=Boolean(data&&String(data.hostId)===String(state.playerId));
      if(ref&&state.playerId&&currentPlayer){try{await ref.child('players/'+state.playerId).onDisconnect().cancel();}catch(error){}
        if(preserveRoom){
          const updates={};
          updates[`players/${state.playerId}`]={...currentPlayer,status:'offline',connected:false,lastSeen:firebase.database.ServerValue.TIMESTAMP,leftAt:firebase.database.ServerValue.TIMESTAMP};
          updates[`game/activePlayers/${state.playerId}`]=null;
          updates[`game/assignmentReceipts/${state.playerId}`]=null;
          await ref.update(updates);
           await Promise.all([db.ref(`privateAssignments/${roomId}/${state.playerId}`).remove(),db.ref(`tribunalReveals/${roomId}/${state.lastRoomData?.game?.roundToken||''}/${state.playerId}`).remove()]).catch(()=>{});
        }
      }
      if(uid&&roomId)await db.ref(`roomMembers/${roomId}/${uid}`).remove().catch(()=>{});
      if(!preserveRoom&&ref){
        if(currentlyHost){
          hostTransferred=await transferHostBeforeExit(data);
          if(hostTransferred){
            if(currentPlayer)await ref.update({
              [`players/${state.playerId}/status`]:'offline',
              [`players/${state.playerId}/connected`]:false,
              [`players/${state.playerId}/lastSeen`]:firebase.database.ServerValue.TIMESTAMP,
              [`players/${state.playerId}/leftAt`]:firebase.database.ServerValue.TIMESTAMP,
              [`game/activePlayers/${state.playerId}`]:null,
              [`game/assignmentReceipts/${state.playerId}`]:null
            });
            await Promise.all([db.ref(`privateAssignments/${roomId}/${state.playerId}`).remove(),db.ref(`tribunalReveals/${roomId}/${data?.game?.roundToken||''}/${state.playerId}`).remove()]).catch(()=>{});
          }else if(String(data?.game?.phase||'lobby')==='lobby'){
            await Promise.all([db.ref(`roomDirectory/${roomId}`).remove(),db.ref(`privateAssignments/${roomId}`).remove(),db.ref(`tribunalReveals/${roomId}`).remove()]).catch(()=>{});await ref.remove();roomDeleted=true;
          }else if(currentPlayer){
            await ref.child('players/'+state.playerId).update({status:'offline',connected:false,lastSeen:firebase.database.ServerValue.TIMESTAMP,leftAt:firebase.database.ServerValue.TIMESTAMP});
            showSocialToast('La sala sigue activa; el anfitrión quedó desconectado.');
          }
        }else if(currentPlayer){
          await ref.update({
            [`players/${state.playerId}`]:null,
            [`game/activePlayers/${state.playerId}`]:null,
            [`game/assignmentReceipts/${state.playerId}`]:null
          });
          await Promise.all([db.ref(`privateAssignments/${roomId}/${state.playerId}`).remove(),db.ref(`tribunalReveals/${roomId}/${data?.game?.roundToken||''}/${state.playerId}`).remove()]).catch(()=>{});
        }
      }
    }catch(error){console.error('leaveRoom',error);}
    finally{stopRoomListener();stopAssignmentListeners();state.roomRef=null;state.lastRoomData=null;state.mode=null;state.gameType=null;state.roomCode='';state.myAssignment=null;state.miniRenderKey='';state.stopFormToken='';state.roomDirectorySyncKey='';clearSession();$('joinRoomBtn').disabled=false;$('createRoomBtn').disabled=false;resetHistory();show('home',{history:false});if(!hostTransferred&&!roomDeleted)showSocialToast(preserveRoom?'Saliste de la sala. Puedes volver con el código.':'Saliste de la sala.');if(roomDeleted)showSocialToast('Sala cerrada.');setBusy('leave',false);}
  }
  async function copyRoom(){
    const button=$('copyRoomBtn'),original=button?.textContent||'COPIAR';
    try{
      await navigator.clipboard.writeText(state.roomCode);notice('Código copiado al portapapeles.','success','lobbyNotice');
      if(button){button.textContent='¡COPIADO!';showSocialToast('¡Copiado!');window.setTimeout(()=>{button.textContent=original;},1800);}
    }catch(error){notice('Código: '+state.roomCode,'success','lobbyNotice');}
  }
  async function reconnectPlayer(roomId,playerName,playerId){
    console.log('Intentando reconectar a la sala:',roomId);state.restoring=true;const savedPlayerId=String(playerId||state.playerId||backendUid()||''),authId=String(backendUid()||'');state.playerId=savedPlayerId;state.playerName=playerName||state.playerName;state.mode=null;attachRoom(String(roomId).toUpperCase());
    try{
      const snapshot=await withTimeout(state.roomRef.once('value'),8000,'session-restore-read-timeout');if(!snapshot.exists()){clearSession();state.roomRef=null;state.lastRoomData=null;state.roomCode='';stopAssignmentListeners();resetHistory();show('home',{history:false});return false;}
      const data=snapshot.val(),type=miniRoomType(data);if(!routeRoomByGameType(type)){clearSession();state.roomRef=null;state.lastRoomData=null;state.roomCode='';stopAssignmentListeners();resetHistory();show('join',{history:false});notice('La sala tiene un tipo de juego desconocido. No se abrirá ninguna partida.','error','joinNotice');return false;}state.gameType=type;const players=normalizeRoomPlayers(data),matched=players.find(player=>String(player.id)===savedPlayerId&&String(player.authUid||'')===authId);
      if(!matched){clearSession();notice('No se pudo verificar tu identidad en la sala.','error','joinNotice');return false;}
      state.playerId=String(matched.id);state.playerName=matched.name||playerName;state.mode=data.hostId===state.playerId?'host':'player';state.hostName=data.hostName||state.hostName;
      await state.roomRef.child('players/'+state.playerId).update({status:'online',connected:true,lastSeen:firebase.database.ServerValue.TIMESTAMP,accountUid:accountUid()||null,authUid:backendUid()||null});
      await markRoomMembership();await installDisconnect();saveSessionInfo(roomId,state.playerName,state.playerId);listenToRoom();return true;
      }catch(error){console.warn('reconnect player',error);clearSession();state.roomRef=null;state.lastRoomData=null;state.roomCode='';state.mode=null;stopAssignmentListeners();resetHistory();show('home',{history:false});return false;}
    finally{state.restoring=false;}
  }

  async function restoreSession(){
    if(hasVoluntaryRoomExit()){
      clearSession();
      return false;
    }
    const session=readSession(),roomId=session?.roomId||session?.roomCode,playerName=session?.playerName||session?.name,playerId=session?.playerId,uid=backendUid();
    if(!roomId||!playerId||!uid)return false;
    if(accountUid()&&session.accountUid!==accountUid())return false;
    if(!accountUid()&&(!session.accountUid||session.authUid!==uid))return false;
    return reconnectPlayer(roomId,playerName||'',playerId);
  }
  function showSavedSessionBanner(){
    const session=readSession(),uid=backendUid();
    const sameIdentity=Boolean(session&&uid&&((accountUid()&&session.accountUid===accountUid())||(!accountUid()&&!session.accountUid&&session.authUid===uid)));
    const hasSession=Boolean(session&&session.roomId&&session.playerId&&sameIdentity);
    $('sessionRecoveryBanner')?.classList.toggle('hidden',!hasSession);
  }
  async function resumeSavedSession(){
    const button=$('resumeSessionBtn');if(!button)return;
    button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='CONECTANDO…';
    const restored=await restoreSession();
    if(restored){$('sessionRecoveryBanner')?.classList.add('hidden');return;}
    button.disabled=false;button.removeAttribute('aria-busy');button.textContent='REANUDAR PARTIDA';showSavedSessionBanner();
  }
  const navigation = createNavigation({
    state,
    screens,
    onReleaseWakeLock: releaseScreenWakeLock,
    onUpdateFinishButton: updateFinishButton,
    onRenderRoomExitControl: renderRoomExitControl,
    accountUid,
    onScreenChange: screenId => rulesController?.sync(screenId)
  });
  const { $, setText, show, goToScreenIfChanged, goBack, resetHistory, notice, clearNotice } = navigation;
  rulesController = createRulesController({ state });
  rulesController.bind();
  const whoami = createWhoamiGame({ characters, shuffle });
  const {
    characterKey,
    uniqueCharacters,
    characterPool,
    createAssignments
  } = whoami;
  whoami.dedupeCharacterCatalog();
  whoami.auditCharacterCatalog();
  const ageGame = createAgeGame({
    ageData,
    state,
    normalizeRoomPlayers,
    backendUid,
    isTemporarilyReconnectable
  });
  const {
    randomInteger,
    generateWeightedAge,
    isValidAgeTarget,
    ageTargetAliases,
    ageTargetForPlayer,
    generateAgeTargets,
    ensureAgeTargets,
    ageCurrentPlayerId,
    ageActivePlayerIds
  } = ageGame;
  const confessionsGame = createConfessionsGame({ confessionsData, cleanUiText });
  const {
    confessionsMaxLength,
    defaultConfessionsConfig,
    confessionsRoundCount,
    confessionsModeLabel,
    confessionsConfigFromUI,
    confessionActiveIds,
    confessionInitial
  } = confessionsGame;
  const stopGame = createStopGame({
    stopLetters: STOP_DEFAULT_LETTERS,
    stopCategories: STOP_DEFAULT_CATEGORIES,
    defaultCategories: STOP_DEFAULT_SELECTED_CATEGORIES
  });
  const {
    defaultStopConfig,
    stopNormalizeAnswer,
    stopAnswerMatchesLetter
  } = stopGame;
  const chamuyayaGame = createChamuyayaGame({ chamuyayaData });
  const { chamuyayaDataById, chamuyayaCatalog } = chamuyayaGame;
  const tribunalGame = createTribunalGame({ tribunalData });
  const { tribunalCaseById, tribunalCaseCount, tribunalCases } = tribunalGame;
  const whatWouldYouDoGame = createWhatWouldYouDoGame({
    questions: whatWouldYouDoQuestions,
    shuffle: shuffleArray
  });
  const {
    validQuestions: validWhatWouldYouDoQuestions,
    chooseQuestion: chooseWhatWouldYouDoQuestion,
    calculateResult: calculateWhatWouldYouDoResult
  } = whatWouldYouDoGame;
  const authController = createAuthController({ auth, state });
  const friendsController = createFriendsController({ state, renderAccountUI, renderLobbyFriends });
  const roomsController = createRoomsController({ state, createRoom, joinAnyRoom, startGame });
  roomsController.bind();
  const countdown = createCountdown({
    state,
    serverNow,
    setText,
    feedbackAtZero,
    handleRoomSnapshot,
    characterDisplayDuration: CHARACTER_DISPLAY_DURATION_MS
  });
  const {
    clearCountdown,
    clearTransitionRetry,
    scheduleTransitionRetry,
    revealEndAt,
    processCommittedRoomGame,
    startSynchronizedCountdown
  } = countdown;
  const connection = createConnection({
    state,
    db,
    setConnectionStatus,
    scheduleAutoReconnect,
    cancelReconnect
  });
  connection.start();
  $('homePlayBtn').onclick=()=>{haptic([18]);show('minigames');};
  $('homeJoinBtn').onclick=()=>{haptic([18]);openGeneralJoin();};
  $('homeProfileBtn').onclick=()=>{haptic([18]);renderAccountUI();show('profile');};
  $('chamuyayaCreateRoomBtn').onclick=()=>{state.gameType=GAME_TYPES.CHAMUYA;void createMiniRoom(GAME_TYPES.CHAMUYA);};$('chamuyayaJoinRoomBtn').onclick=()=>openGeneralJoin();
  $('chamuyayaAddPlayerBtn').onclick=()=>{const game=localChamuyayaLoad()||createChamuyayaLocalState();if(game.players.length>=20){miniNotice('chamuyayaLocalNotice','Máximo 20 jugadores.','error');return;}game.players.push({id:'local-'+(game.players.length+1),name:'Jugador '+(game.players.length+1)});state.chamuyayaLocal=game;localChamuyayaSave();renderChamuyayaLocalSetup();};$('chamuyayaLocalCountMinusBtn').onclick=()=>{const game=state.chamuyayaLocal;if(game){game.chaMuyaCount=Math.max(1,game.chaMuyaCount-1);localChamuyayaSave();renderChamuyayaLocalSetup();}};$('chamuyayaLocalCountPlusBtn').onclick=()=>{const game=state.chamuyayaLocal;if(game){game.chaMuyaCount=Math.min(Math.max(1,game.players.length-1),game.chaMuyaCount+1);localChamuyayaSave();renderChamuyayaLocalSetup();}};$('chamuyayaLocalStartBtn').onclick=startChamuyayaLocal;$('chamuyayaLocalToggleBtn').onclick=toggleChamuyayaLocalReveal;$('chamuyayaLocalNextPlayerBtn').onclick=nextChamuyayaLocalPlayer;$('chamuyayaLocalDiscussionToggleBtn').onclick=toggleChamuyayaLocalDiscussionCard;$('chamuyayaLocalEndRoundBtn').onclick=endChamuyayaLocalDiscussion;$('chamuyayaLocalSubmitVoteBtn').onclick=submitChamuyayaLocalVote;$('chamuyayaLocalNextRoundBtn').onclick=nextChamuyayaLocalRound;$('chamuyayaLocalFinishBtn').onclick=finishChamuyayaLocal;
  $('chamuyayaOnlineToggleBtn').onclick=()=>{state.chamuyayaCardVisible=!state.chamuyayaCardVisible;renderChamuyayaReveal(state.lastRoomData||{});};$('chamuyayaRevealReadyBtn').onclick=()=>void markChamuyayaReady();$('chamuyayaDiscussionToggleBtn').onclick=()=>{state.chamuyayaDiscussionCardVisible=!state.chamuyayaDiscussionCardVisible;renderChamuyayaDiscussion(state.lastRoomData||{});};$('chamuyayaEndRoundBtn').onclick=()=>void endChamuyayaDiscussion();$('chamuyayaSubmitVoteBtn').onclick=()=>void submitChamuyayaVote();$('chamuyayaNextRoundBtn').onclick=()=>void nextChamuyayaRound();$('chamuyayaFinishBtn').onclick=()=>void requestLeaveRoom();
  $('tribunalCreateRoomBtn').onclick=()=>{state.gameType=GAME_TYPES.TRIBUNAL;void createMiniRoom(GAME_TYPES.TRIBUNAL);};$('tribunalJoinRoomBtn').onclick=()=>openGeneralJoin();$('tribunalRoleReadyBtn').onclick=()=>void tribunalRoleReady();$('tribunalPresentationContinueBtn').onclick=()=>void advanceTribunalPresentation();$('tribunalDebateContinueBtn').onclick=()=>void advanceTribunalDebate();$('tribunalSurpriseContinueBtn').onclick=()=>void advanceTribunalSurprise();$('tribunalFinalContinueBtn').onclick=()=>void advanceTribunalFinal();$('tribunalSubmitVoteBtn').onclick=()=>void submitTribunalVote();$('tribunalNextRoundBtn').onclick=()=>void nextTribunalRound();$('tribunalFinishBtn').onclick=()=>void nextTribunalRound();$('tribunalFinalMenuBtn').onclick=()=>void requestLeaveRoom();$('chamuyayaCountMinusBtn').onclick=()=>void updateChamuyayaCount(-1);$('chamuyayaCountPlusBtn').onclick=()=>void updateChamuyayaCount(1);
  
  $('minigamesBackBtn').onclick=()=>{haptic([10]);resetHistory();show('home',{history:false});};
  
  $('cultureGameBtn').onclick=()=>{haptic([18]);openChupisticaSetup();};
  $('chaMuYa2GameBtn').onclick=()=>{haptic([18]);openChamuyayaHome();};
  $('srJuezGameBtn').onclick=()=>{haptic([18]);openTribunalSetup();};
  $('ageGameBtn').onclick=()=>{haptic([18]);openAgeSetup();};
  $('confessionsGameBtn').onclick=()=>{haptic([18]);openConfessionsSetup();};
  $('stopGameBtn').onclick=()=>{haptic([18]);openStopSetup();};
  
  $('goJoinBtn').onclick=()=>{haptic([18]);openGeneralJoin();};
  $('goCreateBtn').onclick=()=>{state.gameType='';state.configEditing=false;show('minigames');};$('joinBackBtn').onclick=()=>{resetHistory();show('home',{history:false});};$('backHomeBtn').onclick=()=>state.configEditing?show('lobby'):state.whoamiLocal?(state.whoamiLocal=null,state.mode=null,show('gameHome')):show('gameHome');
  $('guestBtn').onclick=()=>void enterGuest();
  $('loginBtn').onclick=()=>{haptic([18]);show('authLogin');};
  $('registerBtn').onclick=()=>{haptic([18]);show('authRegister');};
  $('createAccountBtn').onclick=registerAccount;$('signInBtn').onclick=loginAccount;$('toLoginBtn').onclick=()=>show('authLogin');$('toRegisterBtn').onclick=()=>show('authRegister');$('registerBackBtn').onclick=()=>goBack(accountUid()?'home':'access');$('loginBackBtn').onclick=()=>goBack(accountUid()?'home':'access');
  $('profileFriendsBtn').onclick=()=>{renderFriendsList();renderInviteList('friendsInviteList');show('friends');};$('profileRequestsBtn').onclick=()=>{renderRequestsList();show('requests');};$('signOutBtn').onclick=logoutAccount;$('profileBackBtn').onclick=()=>{resetHistory();show('home',{history:false});};
  $('friendsRequestsBtn').onclick=()=>{renderRequestsList();show('requests');};$('requestsFriendsBtn').onclick=()=>{renderFriendsList();show('friends');};$('friendsBackBtn').onclick=()=>{closeQuickFriends();show('profile');};$('requestsBackBtn').onclick=()=>{closeQuickFriends();show('profile');};
  $('profileBtn').onclick=()=>{if(accountUid()){renderAccountUI();show('profile');}else show('authLogin');};
  $('lockedMinigameCloseBtn').onclick=closeLockedMinigame;$('lockedMinigameModal').addEventListener('click',event=>{if(event.target.id==='lockedMinigameModal')closeLockedMinigame();});
  $('searchFriendBtn').onclick=searchFriend;$('friendSearchInput').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void searchFriend();}});
  $('quickFriendsBtn').onclick=openQuickFriends;$('quickFriendsClose').onclick=closeQuickFriends;$('quickFriendsOverlay').addEventListener('click',event=>{if(event.target.id==='quickFriendsOverlay')closeQuickFriends();});$('quickSearchFriendBtn').onclick=quickSearchFriend;$('quickFriendSearchInput').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void quickSearchFriend();}});
  $('inviteFriendsBtn').onclick=()=>{$('lobbyInvitePanel').classList.toggle('hidden');renderLobbyFriends();};$('closeInvitePanelBtn').onclick=()=>$('lobbyInvitePanel').classList.add('hidden');
  $('createRoomBtn').onclick=createRoom;$('joinRoomBtn').onclick=joinAnyRoom;$('startRoomBtn').onclick=startGame;$('editSettingsBtn').onclick=()=>openSettings(true);$('copyRoomBtn').onclick=copyRoom;$('leaveRoomBtn').onclick=()=>void requestLeaveRoom();
  $('scoreRoundBtn').onclick=openScoring;$('confirmResultBtn').onclick=confirmResult;$('nextRoundBtn').onclick=nextRound;$('restartBtn').onclick=newGame;$('finishHomeBtn').onclick=()=>state.whoamiLocal?finishWhoamiLocal():void requestLeaveRoom();$('finishGameBtn').onclick=finishGameEarly;
  $('whoamiLocalFinalHomeBtn').onclick=finishWhoamiLocal;$('ageLocalFinalHomeBtn').onclick=finishAgeLocal;
  $('toggleCategoriesBtn').onclick=()=>{const chips=[...document.querySelectorAll('#categoryBox .chip')],selectAll=chips.some(chip=>!chip.classList.contains('selected'));chips.forEach(chip=>{chip.classList.toggle('selected',selectAll);chip.setAttribute('aria-pressed',String(selectAll));});updateSelectedCategories();};
  $('roundsMinusBtn').onclick=()=>setTotalRounds(state.totalRounds-1);$('roundsPlusBtn').onclick=()=>setTotalRounds(state.totalRounds+1);$('whoamiOnlineModeBtn').onclick=()=>setWhoamiSetupMode(false);$('whoamiLocalModeBtn').onclick=()=>{state.whoamiLocal=state.whoamiLocal||createWhoamiLocalState();setWhoamiSetupMode(true);};$('whoamiLocalAddPlayerBtn').onclick=()=>{const game=state.whoamiLocal||createWhoamiLocalState();if(game.players.length>=20){miniNotice('errorStock','Máximo 20 jugadores.','error');return;}game.players.push({id:`local-whoami-${game.players.length+1}`,name:`Jugador ${game.players.length+1}`});state.whoamiLocal=game;renderWhoamiLocalSetup();};$('whoamiLocalStartBtn').onclick=startWhoamiLocal;$('whoamiLocalRevealContinueBtn').onclick=continueWhoamiLocalReveal;
  $('chupisticaAddPlayerBtn').onclick=()=>{const game=loadChupisticaState();if(game.players.length>=20){miniNotice('chupisticaNotice','Máximo 20 jugadores.','error');return;}game.players.push(`Jugador ${game.players.length+1}`);saveChupisticaState();renderChupisticaNames();};
  document.querySelectorAll('input[name="chupisticaDirection"]').forEach(input=>input.addEventListener('change',()=>{const game=loadChupisticaState();game.direction=input.value==='left'?'left':'right';saveChupisticaState();}));
  $('chupisticaStartBtn').onclick=()=>{haptic([25]);startChupistica();};$('chupisticaBackBtn').onclick=()=>{clearChupisticaTimers();state.gameType=null;show('minigames');};$('chupisticaNextRoundBtn').onclick=()=>{haptic([25]);nextChupisticaRound();};$('chupisticaBackMenuBtn').onclick=()=>{clearChupisticaTimers();state.gameType=null;resetHistory();show('home',{history:false});};
  $('ageRoundsMinusBtn').onclick=()=>updateAgeRounds(-1);$('ageRoundsPlusBtn').onclick=()=>updateAgeRounds(1);$('ageLocalRoundsMinusBtn').onclick=()=>updateAgeLocalRounds(-1);$('ageLocalRoundsPlusBtn').onclick=()=>updateAgeLocalRounds(1);$('ageOnlineModeBtn').onclick=()=>setAgeSetupMode(false);$('ageLocalModeBtn').onclick=()=>setAgeSetupMode(true);$('ageLocalAddPlayerBtn').onclick=()=>{const game=state.ageLocal||createAgeLocalState();if(game.players.length>=20){miniNotice('ageSetupNotice','Máximo 20 jugadores.','error');return;}game.players.push({id:`local-age-${game.players.length+1}`,name:`Jugador ${game.players.length+1}`});state.ageLocal=game;renderAgeLocalSetup();};$('ageLocalStartBtn').onclick=startAgeLocal;$('ageLocalRevealContinueBtn').onclick=continueAgeLocalReveal;$('ageLocalHandoffBtn').onclick=continueAgeLocalPlayer;$('ageCreateRoomBtn').onclick=()=>{state.gameType=GAME_TYPES.AGE;void createMiniRoom(GAME_TYPES.AGE);};$('ageJoinRoomBtn').onclick=openGeneralJoin;$('ageSubmitBtn').onclick=()=>void submitAgeEstimate();$('ageEstimateInput').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void submitAgeEstimate();}});
  $('confessionsOnlineModeBtn').onclick=()=>setConfessionsSetupMode(false);$('confessionsLocalModeBtn').onclick=openConfessionsLocalSetup;$('confessionsLocalAddPlayerBtn').onclick=()=>{const game=state.confessionsLocal||createConfessionsLocalState();if(game.players.length>=20){miniNotice('confessionsSetupNotice','Máximo 20 jugadores.','error');return;}game.players.push({id:`local-conf-${game.players.length+1}`,name:`Jugador ${game.players.length+1}`});state.confessionsLocal=game;renderConfessionsLocalSetup();};$('confessionsLocalStartBtn').onclick=startConfessionsLocal;$('confessionsLocalHandoffBtn').onclick=continueConfessionsLocalWriting;$('confessionsLocalNextBtn').onclick=nextConfessionsLocalResult;$('confessionsLocalScoreboardNextBtn').onclick=nextConfessionsLocalScoreboard;$('confessionsCreateRoomBtn').onclick=()=>{state.gameType=GAME_TYPES.CONFESSIONS;void createMiniRoom(GAME_TYPES.CONFESSIONS);};$('confessionsJoinRoomBtn').onclick=openGeneralJoin;$('submitConfessionBtn').onclick=()=>void submitConfession();if($('confessionInput'))$('confessionInput').maxLength=confessionsMaxLength;$('confessionInput').addEventListener('input',event=>setText('confessionCharCount',`${String(event.target.value||'').length}/${confessionsMaxLength}`));$('confessionInput').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();void submitConfession();}});
  $('stopRoundsSelect').addEventListener('change',()=>{const config=loadStopConfig();config.totalRounds=Number($('stopRoundsSelect').value)||3;saveStopConfig();});$('stopTimeSelect').addEventListener('change',()=>{const config=loadStopConfig();config.timeSeconds=Number($('stopTimeSelect').value)||60;saveStopConfig();});$('stopToggleLettersBtn').onclick=stopToggleLetters;$('stopToggleCategoriesBtn').onclick=stopToggleCategories;$('stopAddCategoryBtn').onclick=addStopCategory;$('stopCustomCategoryInput').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();addStopCategory();}});$('stopCreateRoomBtn').onclick=()=>{state.gameType=GAME_TYPES.STOP;void createMiniRoom(GAME_TYPES.STOP);};$('stopJoinRoomBtn').onclick=openGeneralJoin;$('stopButton').onclick=()=>void pressStop();$('stopFinishReviewBtn').onclick=()=>void finishStopReview();$('miniNextRoundBtn').onclick=()=>void nextMiniRound();$('miniFinishMenuBtn').onclick=()=>{if(state.ageLocal)finishAgeLocal();else if(state.confessionsLocal)finishConfessionsLocal();else if(state.roomRef)void requestLeaveRoom();else{resetHistory();show('home',{history:false});}};
  $('whatWouldYouDoGameBtn').onclick=()=>{haptic([18]);openWhatWouldYouDoSetup();};$('whatWouldYouDoBackBtn').onclick=()=>{state.whatWouldYouDoConfig=null;state.gameType=null;show('minigames');};$('whatWouldYouDoToggleCategoriesBtn').onclick=toggleWhatWouldYouDoCategories;$('whatWouldYouDoCreateRoomBtn').onclick=()=>{state.gameType=GAME_TYPES.WHAT_WOULD_YOU_DO;void createMiniRoom(GAME_TYPES.WHAT_WOULD_YOU_DO);};$('whatWouldYouDoVoteABtn').onclick=()=>void submitWhatWouldYouDoVote('A');$('whatWouldYouDoVoteBBtn').onclick=()=>void submitWhatWouldYouDoVote('B');$('whatWouldYouDoNextBtn').onclick=()=>void nextMiniRound();
   // Las acciones de regreso son transiciones contextuales y no agregan
   // pantallas internas al historial de navegación.
   // Un solo selector de modo por juego. Estos son asignaciones onclick (no
   // listeners acumulativos), por lo que las acciones antiguas quedan
   // reemplazadas sin duplicar eventos.
   $('whoAmIGameBtn').onclick=()=>{haptic([18]);openGameModeSelector(GAME_TYPES.WHOAMI,'gameHome');};
   $('newGameBtn').onclick=()=>{haptic([18]);openWhoamiOnlineSetup();};
   $('whoamiLocalBtn').onclick=()=>{haptic([18]);openWhoamiLocalSetup();};
   $('gameHomeBackBtn').onclick=leaveGameModeSelector;
   $('ageOnlineModeSelectBtn').onclick=()=>{haptic([18]);openAgeOnlineSetup();};
   $('ageLocalModeSelectBtn').onclick=()=>{haptic([18]);openAgeLocalSetup();};
   $('ageModeBackBtn').onclick=leaveGameModeSelector;
   $('ageBackBtn').onclick=()=>backToGameModeSelector(GAME_TYPES.AGE,'ageMode');
   $('confessionsOnlineModeSelectBtn').onclick=()=>{haptic([18]);openConfessionsOnlineSetup();};
   $('confessionsLocalModeSelectBtn').onclick=()=>{haptic([18]);openConfessionsLocalSetup();};
   $('confessionsModeBackBtn').onclick=leaveGameModeSelector;
   $('confessionsBackBtn').onclick=()=>backToGameModeSelector(GAME_TYPES.CONFESSIONS,'confessionsMode');
   $('chamuyayaSalaBtn').onclick=()=>{haptic([18]);openChamuyayaOnlineSetup();};
   $('chamuyayaCelularBtn').onclick=()=>{haptic([18]);openChamuyayaLocalSetup();};
   $('chamuyayaHomeBackBtn').onclick=leaveGameModeSelector;
   $('chamuyayaOnlineBackBtn').onclick=()=>backToGameModeSelector(GAME_TYPES.CHAMUYA,'chamuyayaHome');
   $('chamuyayaLocalBackBtn').onclick=()=>backToGameModeSelector(GAME_TYPES.CHAMUYA,'chamuyayaHome');
   $('tribunalBackBtn').onclick=()=>show('minigames',{history:false});
   $('stopBackBtn').onclick=()=>{state.gameType=null;show('minigames',{history:false});};
   document.addEventListener('visibilitychange',async()=>{
    if(document.visibilityState==='hidden'){
      await releaseScreenWakeLock();
      return;
    }
    if(document.visibilityState==='visible' && hasActiveWakeLockPhase())await requestScreenWakeLock();
    if(document.visibilityState==='visible' && state.roomRef && state.lastConnected===false)connection.requestRoomReconnect('visibility-resume');
  });
  window.addEventListener('orientationchange',()=>{
    if(['agePreparation','ageReveal','agePlaying','confessionsWriting','confessionsVoting','confessionsResults','confessionsScoreboard'].includes(state.currentScreen)&&state.lastRoomData?.game){
      if(state.currentScreen==='agePreparation')renderAgePreparation(state.lastRoomData);
      if(state.currentScreen==='ageReveal')renderAgeReveal(state.lastRoomData);
      if(state.currentScreen==='agePlaying')renderAgePlaying(state.lastRoomData);
      if(state.currentScreen==='confessionsWriting')renderConfessionsWriting(state.lastRoomData);
      if(state.currentScreen==='confessionsVoting')renderConfessionsVoting(state.lastRoomData);
      if(state.currentScreen==='confessionsResults')renderConfessionsResults(state.lastRoomData);
      if(state.currentScreen==='confessionsScoreboard')renderConfessionsScoreboard(state.lastRoomData);
    }
  });
  window.addEventListener('offline',()=>{if(state.roomRef)connection.requestRoomReconnect('browser-offline');});
  window.addEventListener('online',()=>{if(state.roomRef)connection.requestRoomReconnect('browser-online');});
  window.addEventListener('focus',()=>{if(state.roomRef&&state.lastConnected===false)connection.requestRoomReconnect('window-focus');});
  window.addEventListener('pageshow',()=>{if(state.roomRef&&state.lastConnected===false)connection.requestRoomReconnect('pageshow');});
  $('manualReconnectBtn').onclick=manualReconnect;
  $('discardReconnectBtn').onclick=()=>void discardReconnect();
  $('resumeSessionBtn')?.addEventListener('click',resumeSavedSession);
  $('dismissSessionBtn')?.addEventListener('click',()=>{clearSession();showSavedSessionBanner();});
  $('joinRoomCode').addEventListener('input',event=>{event.target.value=event.target.value.toUpperCase().replace(new RegExp('[^'+ROOM_CODE_CHARS+']','g'),'').slice(0,5);});
  $('hostNameInput').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void createRoom();}});
    $('joinName').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void joinAnyRoom();}});
  $('joinRoomCode').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('joinName').focus();}});
  ['registerUsername','registerEmail','registerPassword','registerPasswordConfirm'].forEach(id=>$(id).addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void registerAccount();}}));
  ['loginEmail','loginPassword'].forEach(id=>$(id).addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void loginAccount();}}));
  if(auth){
  authController.start(async user=>{
    const eventToken=++state.authEventToken;
    state.authReady=true;state.authUser=user;
    if(user&&!user.isAnonymous){
      if(state.registeringAccount){
        renderAccountUI();
      }else{
        try{state.profile=await ensureUserProfile(user);}catch(error){console.error('account bootstrap/profile',error);state.profile=state.profile||null;accountNotice('loginNotice','La cuenta está conectada, pero no se pudo cargar el perfil. Los amigos se intentarán cargar igualmente.','error');}
        if(eventToken===state.authEventToken && auth.currentUser?.uid===user.uid)await startAccountListeners(user);
      }
    }else{
      stopAccountListeners();
      if(user?.isAnonymous){
        const guestMarker=sessionStorage.getItem('qs_guest_auth_uid'),session=readSession();
        if(!state.roomRef&&!guestMarker&&session?.authUid!==user.uid){try{await auth.signOut();}catch(error){console.warn('anonymous isolation',error);}state.guestMode=false;state.authUser=null;renderAccountUI();showSavedSessionBanner();return;}
        sessionStorage.setItem('qs_guest_auth_uid',user.uid);state.playerId=state.playerId||user.uid;state.guestMode=true;
        if(!state.roomRef&&!state.autoRestoring){
          const session=readSession();
          if(session&&!session.accountUid&&session.authUid===user.uid){
            state.autoRestoring=true;
            const restored=await restoreSession();
            state.autoRestoring=false;
            if(restored)$('sessionRecoveryBanner')?.classList.add('hidden');
          }
        }
      }else if(!user){
        state.guestMode=false;
      }
    }
    renderAccountUI();
    if(user&&!user.isAnonymous&&!state.roomRef&&!state.autoRestoring&&state.splashDone){resetHistory();show('home',{history:false});}
    if(user?.isAnonymous&&state.guestMode&&!state.roomRef&&state.splashDone){resetHistory();show('home',{history:false});}
    if(user&&!user.isAnonymous&&!state.roomRef&&!state.autoRestoring){
      const session=readSession();
      if(session&&(session.accountUid===undefined||!session.accountUid||session.accountUid===user.uid)){
        state.autoRestoring=true;
        const restored=await restoreSession();
        state.autoRestoring=false;
        if(restored)$('sessionRecoveryBanner')?.classList.add('hidden');
      }
    }
    showSavedSessionBanner();
  });
  }else{
    state.authReady=true;
    console.warn('[FIREBASE AUTH] Authentication no disponible; se mantiene la aplicación en modo local hasta completar firebaseConfig.');
  }
  renderCategories();setTotalRounds(3);show('access',{history:false});showSavedSessionBanner();
  const splash=$('appSplash');
  const splashContent=$('splashContent');
  const splashContinueBtn=$('splashContinueBtn');
  let splashPointerRaf=0;
  const updateSplashParallax=(clientX,clientY)=>{
    if(!splash||!splashContent||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    const mx=(clientX/window.innerWidth-.5)*2,my=(clientY/window.innerHeight-.5)*2;
    splash.style.setProperty('--mx',mx.toFixed(3));splash.style.setProperty('--my',my.toFixed(3));
  };
  splash?.addEventListener('pointermove',event=>{
    if(splashPointerRaf)cancelAnimationFrame(splashPointerRaf);
    splashPointerRaf=requestAnimationFrame(()=>updateSplashParallax(event.clientX,event.clientY));
  },{passive:true});
  splash?.addEventListener('pointerleave',()=>{splash.style.setProperty('--mx','0');splash.style.setProperty('--my','0');});
  splashContinueBtn?.addEventListener('click',()=>{void finishSplash(true);});
  splash?.addEventListener('pointerdown',event=>{
    if(event.target===splash||event.target===splashContent){
      splashContent?.animate([{transform:'translate3d(calc(var(--mx) * -8px),calc(var(--my) * -8px),0) scale(1)'},{transform:'translate3d(calc(var(--mx) * -8px),calc(var(--my) * -8px),0) scale(.975)'},{transform:'translate3d(calc(var(--mx) * -8px),calc(var(--my) * -8px),0) scale(1)'}],{duration:220,easing:'ease-out'});
    }
  });

  async function finishSplash(force=false){
    if(state.splashDone)return;
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if(!force&&!state.authReady){
      const deadline=Date.now()+(reduced?350:900);
      while(!state.authReady&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
    }
    state.splashDone=true;
    const splash=$('appSplash');
    if(splash)splash.classList.add('hide');
    if(state.roomRef)return;
    const savedChupistica=(()=>{try{return JSON.parse(localStorage.getItem('qs_chupistica_state')||'null');}catch(error){return null;}})();
    if(['result','spinning'].includes(savedChupistica?.phase)&&Array.isArray(savedChupistica.players)&&savedChupistica.players.length>=2){state.gameType=GAME_TYPES.CHUPISTICA;restoreChupisticaSession();show('chupisticaWheel');if(savedChupistica.phase==='spinning')void runChupisticaRound();return;}
    if(accountUid()||state.authUser?.isAnonymous){resetHistory();show('home',{history:false});}else{resetHistory();show('access',{history:false});}
    showSavedSessionBanner();
  }
  const splashDuration=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?900:2800;
  window.setTimeout(()=>{void finishSplash(false);},splashDuration);

})();




