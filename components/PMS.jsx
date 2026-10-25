'use client';
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { uid, cpm, evms, addDays, diffDays, today, won, num, toDate } from '../lib/calc';
import { Modal, Field, PageHead, Empty } from './ui';

const DAY = 14; // 간트 1일 폭(px)

export default function PMS() {
  const { data, update, notify } = useStore();
  const [pid, setPid] = useState(data.projects[0]?.id);
  const [task, setTask] = useState(null);
  const [newProj, setNewProj] = useState(null);
  const proj = data.projects.find((p) => p.id === pid);
  const now = today();

  const cp = useMemo(() => proj ? cpm(proj.tasks) : null, [proj]);
  const ev = useMemo(() => proj ? evms(proj.tasks, cp, proj.start, now) : null, [proj, cp, now]);

  const saveTask = () => {
    if (!task.name.trim()) return notify('작업명을 입력하세요');
    update((d) => {
      const p = d.projects.find((x) => x.id === pid);
      const v = { ...task, dur: Number(task.dur), progress: Math.min(100, Math.max(0, Number(task.progress))), budget: Number(task.budget), ac: Number(task.ac) };
      if (task.id) p.tasks[p.tasks.findIndex((t) => t.id === task.id)] = v;
      else p.tasks.push({ ...v, id: uid() });
    });
    setTask(null);
    notify('작업을 저장했습니다');
  };
  const removeTask = () => {
    update((d) => {
      const p = d.projects.find((x) => x.id === pid);
      p.tasks = p.tasks.filter((t) => t.id !== task.id);
      p.tasks.forEach((t) => { t.deps = (t.deps || []).filter((x) => x !== task.id); });
    });
    setTask(null);
    notify('작업을 삭제했습니다');
  };
  const createProject = () => {
    if (!newProj.name.trim()) return notify('프로젝트명을 입력하세요');
    const p = { id: uid(), ...newProj, tasks: [] };
    update((d) => { d.projects.push(p); });
    setPid(p.id); setNewProj(null);
    notify('프로젝트를 만들었습니다. 작업을 추가하세요');
  };

  const sorted = proj ? [...proj.tasks].sort((a, b) => a.wbs.localeCompare(b.wbs, undefined, { numeric: true })) : [];
  const span = cp ? Math.max(cp.duration, diffDays(proj.start, now) + 7, 30) : 0;
  const nowX = proj ? diffDays(proj.start, now) * DAY : 0;
  const end = proj ? addDays(proj.start, cp.duration) : '';
  const ratio = (x) => x == null ? '-' : x.toFixed(2);

  // 월 경계 눈금
  const months = [];
  if (proj) {
    for (let i = 0; i <= span; i++) {
      const d = toDate(addDays(proj.start, i));
      if (d.getDate() === 1 || i === 0) months.push({ x: i * DAY, label: `${d.getMonth() + 1}월` });
    }
  }

  return (
    <>
      <PageHead title="프로젝트" desc="WBS 작업과 선후행 관계로 일정을 계산하고 Critical Path와 EVMS 지표를 보여줍니다">
        <select className="input" value={pid || ''} onChange={(e) => setPid(e.target.value)} aria-label="프로젝트 선택">
          {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn" onClick={() => setNewProj({ name: '', pm: '', start: now, product: '' })}>새 프로젝트</button>
        {proj && <button className="btn primary" onClick={() => setTask({ wbs: '', name: '', dur: 5, deps: [], progress: 0, owner: '', budget: 0, ac: 0 })}>작업 추가</button>}
      </PageHead>

      {!proj ? <Empty>프로젝트가 없습니다. ‘새 프로젝트’로 시작하세요.</Empty> : (
        <>
          <div className="metrics">
            <div><span className="m-l">일정</span><span className="m-v">{end} 완료</span><span className="sub">{proj.start} 시작, {cp.duration}일, PM {proj.pm}</span></div>
            <div><span className="m-l">계획가치 PV</span><span className="m-v">{won(ev.pv)}</span><span className="sub">총예산 {won(ev.bac)}</span></div>
            <div><span className="m-l">획득가치 EV</span><span className="m-v">{won(ev.ev)}</span><span className="sub">실투입 AC {won(ev.ac)}</span></div>
            <div className={ev.spi != null && ev.spi < 0.95 ? 'warn' : ''}><span className="m-l">일정성과 SPI</span><span className="m-v">{ratio(ev.spi)}</span><span className="sub">{ev.spi == null ? '-' : ev.spi < 1 ? '계획보다 늦음' : '계획대로 진행'}</span></div>
            <div className={ev.cpi != null && ev.cpi < 0.95 ? 'warn' : ''}><span className="m-l">원가성과 CPI</span><span className="m-v">{ratio(ev.cpi)}</span><span className="sub">완료 예상 {ev.eac ? won(ev.eac) : '-'}</span></div>
          </div>
          {cp.cycle && <p className="note bad">선후행 관계에 순환이 있습니다. 작업의 선행 작업을 다시 확인하세요.</p>}

          <section className="panel">
            <div className="gantt-wrap">
              <div className="gantt-left">
                <div className="g-head">WBS / 작업</div>
                {sorted.map((t) => (
                  <button key={t.id} className="g-row" onClick={() => setTask({ ...t })}>
                    <span className="mono">{t.wbs}</span> {t.name}
                    <span className="sub-inline">{t.owner}</span>
                  </button>
                ))}
              </div>
              <div className="gantt-right">
                <div className="g-canvas" style={{ width: span * DAY + 80 }}>
                  <div className="g-head g-scale">
                    {months.map((m, i) => <span key={i} style={{ left: m.x }}>{m.label}</span>)}
                  </div>
                  {sorted.map((t) => {
                    const r = cp.result[t.id];
                    return (
                      <div key={t.id} className="g-track">
                        <div className={'g-bar' + (r.critical ? ' crit' : '')}
                          style={{ left: r.es * DAY, width: Math.max(4, t.dur * DAY) }}
                          title={`${t.name}: ${addDays(proj.start, r.es)} ~ ${addDays(proj.start, r.ef)}, 여유 ${r.slack}일`}>
                          <div className="g-prog" style={{ width: t.progress + '%' }} />
                        </div>
                        <span className="g-pct" style={{ left: r.es * DAY + Math.max(4, t.dur * DAY) + 6 }}>{t.progress}%</span>
                        {r.slack > 0 && <div className="g-slack" style={{ left: r.ef * DAY, width: r.slack * DAY }} />}
                      </div>
                    );
                  })}
                  <div className="g-today" style={{ left: nowX }}><span>오늘</span></div>
                </div>
              </div>
            </div>
            <p className="legend"><i className="lg crit" />Critical Path (여유 0일) <i className="lg" />일반 작업 <i className="lg slack" />여유 기간</p>
          </section>

          <section className="panel">
            <div className="scroll-x">
              <table className="table">
                <thead><tr><th>WBS</th><th>작업</th><th>담당</th><th className="num">기간</th><th>시작</th><th>종료</th><th className="num">여유</th><th className="num">진척</th><th className="num">예산</th><th className="num">실투입</th></tr></thead>
                <tbody>{sorted.map((t) => {
                  const r = cp.result[t.id];
                  return (
                    <tr key={t.id} onClick={() => setTask({ ...t })} className="click">
                      <td className="mono">{t.wbs}</td><td>{t.name}{r.critical && <span className="tag crit">CP</span>}</td><td>{t.owner}</td>
                      <td className="num">{t.dur}일</td><td className="mono">{addDays(proj.start, r.es)}</td><td className="mono">{addDays(proj.start, r.ef)}</td>
                      <td className="num">{r.slack}일</td><td className="num">{t.progress}%</td><td className="num">{num(t.budget / 10000)}만</td><td className="num">{num(t.ac / 10000)}만</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            {!sorted.length && <Empty>작업이 없습니다. ‘작업 추가’로 WBS를 구성하세요.</Empty>}
          </section>
        </>
      )}

      {task && (
        <Modal title={task.id ? `${task.wbs} ${task.name}` : '작업 추가'} onClose={() => setTask(null)}
          footer={<>{task.id && <button className="btn ghost danger" onClick={removeTask}>삭제</button>}<span className="grow" /><button className="btn" onClick={() => setTask(null)}>취소</button><button className="btn primary" onClick={saveTask}>저장</button></>}>
          <div className="grid2">
            <Field label="WBS 코드"><input className="input" value={task.wbs} onChange={(e) => setTask({ ...task, wbs: e.target.value })} placeholder="예: 2.4" /></Field>
            <Field label="작업명"><input className="input" value={task.name} onChange={(e) => setTask({ ...task, name: e.target.value })} /></Field>
            <Field label="담당자"><input className="input" value={task.owner} onChange={(e) => setTask({ ...task, owner: e.target.value })} /></Field>
            <Field label="기간 (일)"><input className="input" type="number" min="0" value={task.dur} onChange={(e) => setTask({ ...task, dur: e.target.value })} /></Field>
            <Field label={`진척률 ${task.progress}%`}><input type="range" min="0" max="100" step="5" value={task.progress} onChange={(e) => setTask({ ...task, progress: e.target.value })} /></Field>
            <Field label="예산 (원)"><input className="input" type="number" value={task.budget} onChange={(e) => setTask({ ...task, budget: e.target.value })} /></Field>
            <Field label="실투입 비용 (원)"><input className="input" type="number" value={task.ac} onChange={(e) => setTask({ ...task, ac: e.target.value })} /></Field>
          </div>
          <fieldset className="checks">
            <legend className="field-label">선행 작업</legend>
            {sorted.filter((t) => t.id !== task.id).map((t) => (
              <label key={t.id} className="check">
                <input type="checkbox" checked={task.deps.includes(t.id)}
                  onChange={(e) => setTask({ ...task, deps: e.target.checked ? [...task.deps, t.id] : task.deps.filter((x) => x !== t.id) })} />
                <span className="mono">{t.wbs}</span> {t.name}
              </label>
            ))}
          </fieldset>
        </Modal>
      )}

      {newProj && (
        <Modal title="새 프로젝트" onClose={() => setNewProj(null)}
          footer={<><button className="btn" onClick={() => setNewProj(null)}>취소</button><button className="btn primary" onClick={createProject}>만들기</button></>}>
          <Field label="프로젝트명"><input className="input" value={newProj.name} onChange={(e) => setNewProj({ ...newProj, name: e.target.value })} /></Field>
          <Field label="PM"><input className="input" value={newProj.pm} onChange={(e) => setNewProj({ ...newProj, pm: e.target.value })} /></Field>
          <Field label="시작일"><input className="input" type="date" value={newProj.start} onChange={(e) => setNewProj({ ...newProj, start: e.target.value })} /></Field>
          <Field label="대상 제품">
            <select className="input" value={newProj.product} onChange={(e) => setNewProj({ ...newProj, product: e.target.value })}>
              <option value="">없음</option>
              {data.parts.filter((p) => p.type === '제품').map((p) => <option key={p.id} value={p.id}>{p.no} {p.name}</option>)}
            </select>
          </Field>
        </Modal>
      )}
    </>
  );
}
