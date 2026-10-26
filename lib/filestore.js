// 도면 파일 원본 저장소 (브라우저 IndexedDB)
// 팀 공유가 필요하면 put/get/del 세 함수만 Vercel Blob 업로드·조회로 바꾸면 된다 (README 참고).
import { sampleFile } from './samples';

const DB = 'aifusion-plm-files';
const STORE = 'blobs';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export const putFile = (id, blob) => tx('readwrite', (s) => s.put(blob, id));
export const delFile = (id) => tx('readwrite', (s) => s.delete(id)).catch(() => {});

// 파일 메타데이터로 원본을 찾는다: 업로드한 파일 → 샘플 생성 → 없음(null)
export async function getFile(meta) {
  try {
    const b = await tx('readonly', (s) => s.get(meta.id));
    if (b) return b;
  } catch {}
  if (meta.sample) return sampleFile(meta.sample);
  return null;
}
