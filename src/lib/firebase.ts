import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);
// Ensure persistence is set to LOCAL
setPersistence(auth, browserLocalPersistence);

export const googleProvider = new GoogleAuthProvider();

// Standard sign in options
export const signIn = () => signInWithPopup(auth, googleProvider);
export const signInRedirect = () => signInWithRedirect(auth, googleProvider);
export const handleRedirectResult = () => getRedirectResult(auth);
export const signOut = () => auth.signOut();
