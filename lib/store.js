'use client';
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { seed } from './seed';

// 저장소: 기본은 브라우저 localStorage.
// 팀 공유가 필요하면 load/save 두 함수만 API 호출(/api/data)로 바꾸면 된다 (README 참고).
const KEY = 'aifusion-plm-v1';
const OLD_KEY = 'clip-plm-v1'; // 이전 이름으로 저장된 데이터를 이어받기 위함

const load = () => {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const save = (data) => {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
};

// v1 → v2: 샘플 부품의 도면 파일을 뷰어로 볼 수 있는 샘플 파일로 교체
function migrate1to2(d) {
  const fresh = seed();
  for (const p of d.parts) {
    const f = fresh.parts.find((x) => x.id === p.id);
    if (!f) continue;
    const sampleIds = new Set(f.files.map((x) => x.id));
    if (p.files.some((x) => sampleIds.has(x.id))) {
      p.files = [...structuredClone(f.files), ...p.files.filter((x) => !sampleIds.has(x.id))];
    }
  }
  d.version = 2;
  return d;
}

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [data, setData] = useState(() => structuredClone(seed()));
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState(null);
  const timer = useRef();

  useEffect(() => {
    const saved = load();
    if (saved && saved.version === 1) setData(migrate1to2(saved));
    else if (saved && saved.version === 2) setData(saved);
    setReady(true);
  }, []);

  useEffect(() => { if (ready) save(data); }, [data, ready]);

  // update(draft => { ...변경... }) 형태로 사용
  const update = useCallback((fn) => {
    setData((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }, []);

  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const reset = () => { setData(structuredClone(seed())); notify('샘플 데이터로 초기화했습니다'); };
  const replace = (d) => { setData(d.version === 1 ? migrate1to2(d) : d); notify('데이터를 불러왔습니다'); };

  return (
    <Ctx.Provider value={{ data, update, notify, reset, replace }}>
      {children}
      {toast && <div className="toast" role="status">{toast}</div>}
    </Ctx.Provider>
  );
}

export const useStore = () => useContext(Ctx);

export const usePart = () => {
  const { data } = useStore();
  return (id) => data.parts.find((p) => p.id === id);
};
