import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, User } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCDJizDtjwxUqoWXaGe0SZeN4-FJneU-4k",
  authDomain: "greenmind-4e51e.firebaseapp.com",
  projectId: "greenmind-4e51e",
  storageBucket: "greenmind-4e51e.firebasestorage.app",
  messagingSenderId: "365121436669",
  appId: "1:365121436669:web:abbef30194ca8889a5f794",
  measurementId: "G-540MQHK1QF",
};

let authInstance: ReturnType<typeof getAuth> | null = null;
let firebaseReady = false;

try {
  const app = initializeApp(firebaseConfig);
  authInstance = getAuth(app);
  firebaseReady = true;
} catch (err) {
  console.warn("Firebase failed to initialize:", err);
}

export { authInstance as auth, firebaseReady, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword };
export type { User };
