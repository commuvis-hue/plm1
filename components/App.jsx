'use client';
import { useEffect, useRef, useState } from 'react';
import { StoreProvider, useStore } from '../lib/store';
import { downloadText, today } from '../lib/calc';
import Dashboard from './Dashboard';
import PDM from './PDM';
import ECO from './ECO';
import BOM from './BOM';
import PMS from './PMS';
import CMS from './CMS';

const NAV = [
  ['home', '현황', null],
  ['pdm', '부품·도면', 'PDM'],
  ['eco', '설계변경', 'ECR/ECO'],
  ['bom', 'Multi-BOM', 'E/M/S'],
  ['pms', '프로젝트', 'PMS'],
  ['cms', '원가관리', 'CMS'],
];

function Shell() {
  const { data, reset, replace, notify } = useStore();
  const [page, setPage] = useState('home');
  const [params, setParams] = useState(null);
  const [menu, setMenu] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    const read = () => {
      const h = location.hash.slice(1);
      if (NAV.some(([k]) => k === h)) setPage(h);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const goto = (k, p = null) => {
    setParams(p);
    setPage(k);
    setMenu(false);
    history.replaceState(null, '', '#' + k);
  };

  const exportJSON = () => downloadText(`aifusionPLM-backup_${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
  const importJSON = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    f.text().then((t) => {
      try {
        const d = JSON.parse(t);
        if (!d.parts || !d.lines) throw new Error();
        replace(d);
      } catch { notify('백업 파일 형식이 올바르지 않습니다'); }
    });
    e.target.value = '';
  };

  const View = { home: Dashboard, pdm: PDM, eco: ECO, bom: BOM, pms: PMS, cms: CMS }[page];

  return (
    <div className="app">
      <aside className={'side' + (menu ? ' open' : '')}>
        <div className="brand">
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <rect x="1.5" y="1.5" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M1.5 17.5h23M17.5 17.5v7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 6h9v7H6z" fill="currentColor" opacity=".35" />
          </svg>
          <div><strong>aifusionPLM</strong><span>제품·BOM·프로젝트·원가</span></div>
        </div>
        <nav aria-label="주 메뉴">
          {NAV.map(([k, label, code]) => (
            <button key={k} className={'nav' + (page === k ? ' on' : '')} aria-current={page === k ? 'page' : undefined} onClick={() => goto(k)}>
              <span>{label}</span>{code && <small>{code}</small>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <button className="nav small" onClick={exportJSON}>데이터 백업</button>
          <button className="nav small" onClick={() => fileRef.current.click()}>백업 불러오기</button>
          <button className="nav small" onClick={() => confirm('모든 데이터를 샘플 데이터로 되돌릴까요?') && reset()}>샘플로 초기화</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={importJSON} />
        </div>
      </aside>
      <div className="mobile-bar">
        <button className="icon-btn" aria-label="메뉴" onClick={() => setMenu(!menu)}>☰</button>
        <strong>aifusionPLM</strong>
      </div>
      <main className="main" id="main">
        <View key={page + JSON.stringify(params)} goto={goto} params={params} />
      </main>
    </div>
  );
}

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>;
}
