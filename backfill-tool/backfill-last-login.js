/**
 * backfill-last-login.js
 * ─────────────────────────────────────────────
 * ONE-TIME SCRIPT — run this once, then delete it.
 *
 * Firebase Auth silently tracks every account's real sign-in history
 * (metadata.lastSignInTime, metadata.creationTime) even for logins that
 * happened before we added the lastLogin tracking code to auth.js.
 * Your website can't read that for OTHER people's accounts (only your
 * own current session) — but a script running with admin credentials
 * can read it for everyone. This script pulls that real history and
 * writes it into each user's /users/{uid} Firestore doc as `lastLogin`,
 * so your Settings → Team Members table shows accurate data immediately
 * instead of "Never" for people who logged in before today.
 *
 * SETUP (do this once):
 *   1. Firebase Console → Project Settings → Service Accounts
 *      → "Generate new private key" → save the JSON file as
 *      `serviceAccountKey.json` in this same folder.
 *      (Keep this file secret — never commit it or share it. It's a
 *      master key to your whole Firebase project.)
 *   2. In this folder, run:  npm install firebase-admin
 *   3. Run:  node backfill-last-login.js
 *
 * WHAT IT DOES:
 *   - Lists every account in Firebase Authentication.
 *   - For each one, looks at metadata.lastSignInTime (falls back to
 *     metadata.creationTime if they've never actually logged in again
 *     since creating the account).
 *   - Writes that as `lastLogin` into their /users/{uid} Firestore doc,
 *     but ONLY if that doc doesn't already have a lastLogin (so it will
 *     never overwrite fresh data recorded by the new auth.js code).
 *
 * SAFE TO RE-RUN: it skips any doc that already has a lastLogin set.
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function listAllAuthUsers() {
  const users = [];
  let pageToken;
  do {
    const result = await admin.auth().listUsers(1000, pageToken);
    users.push(...result.users);
    pageToken = result.pageToken;
  } while (pageToken);
  return users;
}

async function backfill() {
  console.log('Fetching all Firebase Auth accounts…');
  const authUsers = await listAllAuthUsers();
  console.log(`Found ${authUsers.length} account(s) in Firebase Auth.\n`);

  let updated = 0;
  let skippedAlreadySet = 0;
  let skippedNoFirestoreDoc = 0;
  let skippedNoSignInData = 0;

  for (const user of authUsers) {
    const uid = user.uid;
    const docRef = db.collection('users').doc(uid);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.log(`⚠ Skipping ${user.email || uid} — no matching /users/${uid} doc in Firestore.`);
      skippedNoFirestoreDoc++;
      continue;
    }

    if (doc.data().lastLogin) {
      skippedAlreadySet++;
      continue;
    }

    // Prefer their most recent real sign-in; fall back to account creation
    // time if they were created but Firebase has no later sign-in on record.
    const lastSignIn = user.metadata.lastSignInTime;
    const created     = user.metadata.creationTime;
    const isoTime = lastSignIn || created;

    if (!isoTime) {
      skippedNoSignInData++;
      continue;
    }

    await docRef.set({
      lastLogin: admin.firestore.Timestamp.fromDate(new Date(isoTime))
    }, { merge: true });

    console.log(`✓ ${user.email || uid} → ${isoTime}`);
    updated++;
  }

  console.log('\n── Done ──────────────────────────');
  console.log(`Updated:                     ${updated}`);
  console.log(`Already had lastLogin:       ${skippedAlreadySet}`);
  console.log(`No Firestore /users/{uid}:   ${skippedNoFirestoreDoc}`);
  console.log(`No sign-in data available:   ${skippedNoSignInData}`);
  process.exit(0);
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
