import {
  FIREBASE_APP_NAME,
  FIREBASE_PLACEHOLDER,
  firebaseConfig
} from './config.js';

let firebaseApp = null;
let db = null;
let auth = null;
const firebaseSdk = globalThis.firebase;

try {
  if (firebaseSdk) {
    firebaseApp = firebaseSdk.initializeApp(firebaseConfig, FIREBASE_APP_NAME);
    db = firebaseSdk.database(firebaseApp);
    auth = firebaseSdk.auth(firebaseApp);
  }
} catch (error) {
  console.error('[FIREBASE INIT] No se pudo inicializar Firebase.', error);
}

if (FIREBASE_PLACEHOLDER) {
  console.warn('[FIREBASE CONFIG] Falta una credencial del proyecto nuevo ¿QuiénSoy?.');
}

export const authPersistenceReady = auth
  ? auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(error => {
      console.warn('No se pudo activar la persistencia local de Firebase Auth', error);
    })
  : Promise.resolve();

export { firebaseApp, db, auth, FIREBASE_PLACEHOLDER, firebaseConfig };
