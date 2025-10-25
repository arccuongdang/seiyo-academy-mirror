// scripts/setAdmin.js
// Purpose: set custom claim { admin: true } for selected users (by email)
// Usage (Windows CMD):
//   set "GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json"
//   node scripts\setAdmin.js

const admin = require('firebase-admin');

/**
 * Initialize Admin SDK using Application Default Credentials.
 * On Windows, point GOOGLE_APPLICATION_CREDENTIALS to your Service Account JSON.
 */
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

async function setAdminByEmail(email) {
  if (!email) return;
  const user = await admin.auth().getUserByEmail(email);
  const claims = { ...(user.customClaims || {}), admin: true };
  await admin.auth().setCustomUserClaims(user.uid, claims);
  console.log(`✓ Set admin=true for ${email} (uid=${user.uid})`);
}

async function main() {
  // TODO: chỉnh danh sách email admin tại đây:
  const emails = [
    'arccuongdang@gmail.com',
    'nguyentrunghieu@seiyobuilding.co.jp',
    'trunghieu16@gmail.com',
  ];

  for (const email of emails) {
    try { await setAdminByEmail(email); }
    catch (e) { console.error(`× Failed for ${email}:`, e && e.message ? e.message : e); }
  }

  console.log('Done. Please sign out/in in the web app to refresh ID token claims.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
