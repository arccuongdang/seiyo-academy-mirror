import { getFirestore, doc, setDoc, serverTimestamp, increment } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export async function bumpWrong(params: {
  questionId: string;
  courseId: string;
  subjectId: string;
  examYear: number;
}) {
  const auth = getAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) return; // chưa đăng nhập thì bỏ qua

  const db = getFirestore();
  const ref = doc(db, 'users', uid, 'wrongs', params.questionId);

  // setDoc merge: nếu đã có thì chỉ tăng count + cập nhật lastAt
  await setDoc(ref, {
    userId: uid,
    courseId: params.courseId,
    subjectId: params.subjectId,
    examYear: Math.trunc(params.examYear || 0),
    count: increment(1),
    lastAt: serverTimestamp(),
  }, { merge: true });
}
