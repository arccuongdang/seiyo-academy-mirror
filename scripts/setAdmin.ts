// scripts/setAdmin.ts
import * as admin from 'firebase-admin';

// 1) init bằng service account hoặc default credentials (Cloud env)
// Nếu chạy local, dùng GOOGLE_APPLICATION_CREDENTIALS -> đường dẫn JSON
admin.initializeApp();

async function setAdminByEmail(email: string) {
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, { admin: true });
  console.log(`✓ Set admin=true for ${email} (${user.uid})`);
}

async function setAdminByUid(uid: string) {
  await admin.auth().setCustomUserClaims(uid, { admin: true });
  console.log(`✓ Set admin=true for uid=${uid}`);
}

// ví dụ:
setAdminByEmail('arccuongdang@gmail.com').catch(console.error);
setAdminByEmail('nguyentrunghieu@seiyobuilding.co.jp').catch(console.error);
setAdminByEmail('trunghieu16@gmail.com').catch(console.error);