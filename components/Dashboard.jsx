'use client';
import { useStore } from '../lib/store';
import { cpm, evms, today, won, materialRollup, quote, addDays } from '../lib/calc';
import { Badge, PageHead } from './ui';

export default function Dashboard({ goto }) {
  const { data } = useStore();
  const now = today();
  const openEcos = data.ecos.filter((e) => !['적용', '반려'].includes(e.status));
  const pending = data.priceChanges.filter((c) => c.status === '서명 대기');
  const working = data.parts.filter((p) => p.status !== '승인' && p.status !== '폐기');
  const pn = (id) => data.parts.find((p) => p.id === id);

  const projects = data.projects.map((p) => {
    const cp = cpm(p.tasks);
    const ev = evms(p.tasks, cp, p.start, now);
    const late = p.tasks.filter((t) => cp.result[t.id].critical && t.progress < 100 && addDays(p.start, cp.result[t.id].ef) < now);
    return { p, cp, ev, late, done: ev.bac ? ev.ev / ev.bac : 0 };
  });

  const costs = Object.entries(data.costModels).map(([id, m]) => {
    const r = materialRollup(data.lines, m.bomType, id, data.parts, data.materials);
    const q = quote(m, r.total);
    const base = m.quotes[m.quotes.length - 1];
    return { id, q, base, d: base ? (q.total - base.total) / base.total * 100 : null };
  });

  return (
    <>
      <PageHead title="현황" desc={`${now} 기준`} />
      <div className="dash">
        <section className="panel">
          <h2 className="h2 flush">처리할 일</h2>
          <ul className="todo">
            {openEcos.map((e) => (
              <li key={e.id}><button className="todo-item" onClick={() => goto('eco')}>
                <Badge>{e.status}</Badge><span className="mono">{e.no}</span> {e.title}
              </button></li>
            ))}
            {pending.map((c) => (
              <li key={c.id}><button className="todo-item" onClick={() => goto('cms')}>
                <Badge>서명 대기</Badge> {pn(c.partId)?.no} 단가변경 계약
              </button></li>
            ))}
            {working.map((p) => (
              <li key={p.id}><button className="todo-item" onClick={() => goto('pdm')}>
                <Badge>{p.status}</Badge><span className="mono">{p.no}</span> {p.name} 승인 필요
              </button></li>
            ))}
            {!openEcos.length && !pending.length && !working.length && <li className="muted">처리할 일이 없습니다.</li>}
          </ul>
        </section>

        <section className="panel">
          <h2 className="h2 flush">프로젝트</h2>
          {projects.map(({ p, cp, ev, late, done }) => (
            <button key={p.id} className="proj-card" onClick={() => goto('pms')}>
              <div className="between"><strong>{p.name}</strong><span className="mono">{addDays(p.start, cp.duration)} 완료 예정</span></div>
              <div className="bar"><div style={{ width: done * 100 + '%' }} /></div>
              <div className="between sub">
                <span>진척 {(done * 100).toFixed(0)}%</span>
                <span className={ev.spi != null && ev.spi < 0.95 ? 'up' : ''}>SPI {ev.spi?.toFixed(2) ?? '-'} · CPI {ev.cpi?.toFixed(2) ?? '-'}</span>
              </div>
              {late.length > 0 && <p className="note warn-text">Critical Path 지연: {late.map((t) => t.name).join(', ')}</p>}
            </button>
          ))}
        </section>

        <section className="panel">
          <h2 className="h2 flush">제품 원가</h2>
          {costs.map(({ id, q, base, d }) => (
            <button key={id} className="proj-card" onClick={() => goto('cms')}>
              <div className="between"><strong>{pn(id)?.no} {pn(id)?.name}</strong></div>
              <div className="between">
                <span className="big-num">{won(q.total)}</span>
                {d != null && <span className={d > 0 ? 'up' : 'down'}>견적 대비 {d > 0 ? '+' : ''}{d.toFixed(2)}%</span>}
              </div>
              {base && <span className="sub">기준 견적 {base.date} {won(base.total)}</span>}
            </button>
          ))}
        </section>

        <section className="panel">
          <h2 className="h2 flush">데이터 현황</h2>
          <dl className="counts">
            <div><dt>부품</dt><dd>{data.parts.length}</dd></div>
            <div><dt>도면·문서</dt><dd>{data.parts.reduce((s, p) => s + p.files.length, 0)}</dd></div>
            <div><dt>BOM 항목</dt><dd>{data.lines.length}</dd></div>
            <div><dt>설계변경</dt><dd>{data.ecos.length}</dd></div>
            <div><dt>원소재</dt><dd>{data.materials.length}</dd></div>
            <div><dt>프로젝트</dt><dd>{data.projects.length}</dd></div>
          </dl>
        </section>
      </div>
    </>
  );
}
