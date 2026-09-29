// Firebase project config — see firebase-backend/FIREBASE_SETUP.md, Step 5.
// These values are NOT secret; Firebase is designed to have them visible
// in client code. Real protection comes from firestore.rules.
const firebaseConfig = {
    apiKey: "AIzaSyAvoRM09suEEJDDMLRUGArrLbPEFtVfCVQ",
    authDomain: "thestarth-b7620.firebaseapp.com",
    projectId: "thestarth-b7620",
    storageBucket: "thestarth-b7620.firebasestorage.app",
    messagingSenderId: "597137579605",
    appId: "1:597137579605:web:3770514798f2161266bedc",
    measurementId: "G-T8PCCGPKDM"
};

let auth = null;
let db = null;
const FIREBASE_READY = !!firebaseConfig.apiKey;

if (FIREBASE_READY) {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
} else {
    console.warn('Firebase not configured yet — see firebase-backend/FIREBASE_SETUP.md. Accounts and admin panel will not work until it is.');
}
