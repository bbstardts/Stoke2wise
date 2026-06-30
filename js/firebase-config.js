/**
 * firebase-config.js
 * ─────────────────────────────────────────────
 * Purpose: Initialize Firebase app and export core service instances.
 *
 * Services exported as globals:
 *   window.firebaseAuth    — Firebase Authentication instance
 *   window.firebaseDb      — Firestore database instance
 */

const firebaseConfig = {
  apiKey:            "AIzaSyBZjpdSePOE7wJgv9ikuvjIc4XTdXzkPnM",
  authDomain:        "project-warehouse-e6077.firebaseapp.com",
  projectId:         "project-warehouse-e6077",
  storageBucket:     "project-warehouse-e6077.firebasestorage.app",
  messagingSenderId: "921220846259",
  appId:             "1:921220846259:web:19f6e198f8eb1b08c796c6"
};

firebase.initializeApp(firebaseConfig);

window.firebaseAuth    = firebase.auth();
window.firebaseDb      = firebase.firestore();
