// Configuración central de la aplicación. Los datos de contenido viven en data/.
import { ageData } from '../data/age/data.js';
export const FIREBASE_APP_NAME = 'quien-soy-app-v2';

export const firebaseConfig = {
  apiKey: "AIzaSyBRzy2qF2RZGpLvli0MD9NmDD2HGT6Cw9o",
  authDomain: "quiensoyv2.firebaseapp.com",
  databaseURL: "https://quiensoyv2-default-rtdb.firebaseio.com/",
  projectId: "quiensoyv2",
  storageBucket: "quiensoyv2.firebasestorage.app",
  messagingSenderId: "1085916820235",
  appId: "1:1085916820235:web:c02bcf703be0813e6b680e",
  measurementId: "G-WTHES72K17"
};

export const FIREBASE_PLACEHOLDER = Object.values(firebaseConfig)
  .some(value => String(value).startsWith('REEMPLAZAR_'));

export const screens = [
  'access','home','minigames','gameHome','authRegister','authLogin','profile',
  'friends','requests','setup','join','lobby','prep','reveal','starting','playing',
  'scoring','results','finish','chupisticaSetup','chupisticaWheel','ageMode','ageSetup',
  'agePreparation','ageReveal','agePlaying','confessionsSetup','confessionsWriting',
  'confessionsMode','confessionsVoting','confessionsResults','confessionsScoreboard','chamuyayaHome',
  'chamuyayaOnlineSetup','chamuyayaSetup','chamuyayaCountdown','chamuyayaReveal',
  'chamuyayaDiscussion','chamuyayaVoting','chamuyayaResult','chamuyayaLocalReveal',
  'chamuyayaLocalDiscussion','chamuyayaLocalVoting','chamuyayaLocalResult',
  'tribunalSetup','tribunalRoles','tribunalPresentation','tribunalDebate',
  'tribunalSurprise','tribunalFinal','tribunalVoting','tribunalResult',
  'tribunalFinalResult','stopSetup','stopReveal','stopPlaying','stopReview',
  'miniResults','miniFinish','whoamiLocalFinalReveal','ageLocalFinalReveal'
];

export const SESSION_KEY = 'quien_soy_session';
export const SESSION_BACKUP_KEY = 'quien_soy_session_backup';
export const PREPARATION_DURATION_MS = 10000;
export const LOCAL_PHONE_HANDOFF_DURATION_MS = 5000;
export const CHARACTER_DISPLAY_DURATION_MS = 15000;
export const STARTING_TRANSITION_DURATION_MS = 1200;
export const ASSIGNMENT_RETRY_DELAY_MS = 3000;
export const ASSIGNMENT_MAX_RETRIES = 3;
export const MINI_REVEAL_DURATION_MS = 3000;
export const AGE_PREPARATION_DURATION_MS = Number(ageData.preparationSeconds || 10) * 1000;
export const AGE_REVEAL_DURATION_MS = Number(ageData.revealSeconds || 15) * 1000;
export const STOP_PREP_DURATION_MS = 3000;
export const CONFESSION_RESULTS_DURATION_MS = 3000;
export const CONFESSION_SCOREBOARD_DURATION_MS = 3000;
export const CHAMUYA_COUNTDOWN_DURATION_MS = 5000;
export const CHAMUYA_DEFAULT_ROUNDS = 5;
export const TRIBUNAL_DEFAULT_ROUNDS = 5;
export const GAME_TYPES = Object.freeze({
  WHOAMI: 'whoami', AGE: 'age', CHUPISTICA: 'chupistica',
  CONFESSIONS: 'confessions', STOP: 'stop', CHAMUYA: 'chamuyaya', TRIBUNAL: 'tribunal'
});
export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;
export const RECONNECT_GRACE_MS = 120000;
export const ROOM_HEARTBEAT_STALE_MS = 15000;

export const MINI_GAME_LABELS = {
  age: '🎂 ADIVINA LA EDAD',
  confessions: '🔥 ConFESa2',
  stop: '🛑 STOP',
  chamuyaya: '🎭 ChaMuYa2',
  tribunal: '🏛️ SR. JUEZ'
};
