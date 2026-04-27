import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBrT9-hvsljU2MGj0JMGjWsDZN3qToDBWM",
  authDomain: "meetings-shnoor.firebaseapp.com",
  projectId: "meetings-shnoor",
  storageBucket: "meetings-shnoor.firebasestorage.app",
  messagingSenderId: "1098068700272",
  appId: "1:1098068700272:web:ddf8400c72daa71abc98b5",
  measurementId: "G-PQTFCH98J2"
};
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);