import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Use Redirect instead of Popup for better cross-platform support and to avoid "popup blocked" issues
export const signIn = () => signInWithRedirect(auth, googleProvider);
export const handleRedirectResult = () => getRedirectResult(auth);
export const signOut = () => auth.signOut();
