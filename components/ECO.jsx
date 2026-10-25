'use client';
import { useState } from 'react';
import { useStore } from '../lib/store';
import { uid, today, nextRev } from '../lib/calc';
import { Modal, Field, Badge, PageHead, Empty } from './ui';

const FLOW = ['요청', '검토', '승인', '적용'];

export default function ECO({ params }) {
  const { data, update, notify } = useStore();
  const [sel, setSel] = useState(data.ecos[0]?.id);
  const [form, setForm] = useState(() => params?.newFor
    ? { title: '', reason: '', parts: [params.newFor], requester: '' } : null);
  const [who, setWho] = useState('박팀장');
  const [filter, setFilter] = useState('진행중');

  const eco = data.ecos.find((e) => e.id === sel);
  const pn = (id) => data.parts.find((p) => p.id === id);
  const list = data.ecos.filter((e) => filter === '전체' ||
    (filter === '진행중' ? !['적용', '반려'].includes(e.status) : ['적용', '반려'].includes(e.status)));

  const create = () => {
    if (!form.title.trim() || !form.parts.length) return notify('제목과 대상 부품을 지정하세요');
    const year = new Date().getFullYear();
    const seq = data.ecos.length + 1;
    const e = {
      id: uid(), no: `ECR-${year}-${String(seq).padStart(3, '0')}`, ...form,
      status: '요청', date: today(),
      log: [{ date: today(), who: form.requester || '-', what: '변경 요청 등록' }],
    };
    update((d) => { d.ecos.unshift(e); });
    setSel(e.id); setForm(null); setFilter('진행중');
    notify(`${e.no} 변경 요청을 등록했습니다`);
  };

  const move = (to, what) => update((d) => {
    const e = d.ecos.find((x) => x.id === eco.id);
    e.status = to;
    e.log.push({ date: today(), who, what });
    if (to === '승인') e.no = e.no.replace('ECR', 'ECO');
    if (to === '적용') {
      const revs = [];
      for (const pid of e.parts) {
        const p = d.parts.find((x) => x.id === pid);
        if (!p) continue;
        p.rev = nextRev(p.rev);
        p.status = '승인';
        p.history.push({ rev: p.rev, date: today(), note: `${e.no} ${e.title}` });
        revs.push(`${p.no} Rev ${p.rev}`);
      }
      e.log[e.log.length - 1].what = `적용 완료, ${revs.join(', ')}`;
    }
  });

  const step = eco ? FLOW.indexOf(eco.status) : -1;

  return (
    <>
      <PageHead title="설계변경" desc="ECR 요청부터 검토·승인을 거쳐 ECO 적용까지. 적용 시 대상 부품의 리비전이 자동으로 올라갑니다">
        <button className="btn primary" onClick={() => setForm({ title: '', reason: '', parts: [], requester: '' })}>변경 요청</button>
      </PageHead>

      <div className="split">
        <section className="panel list-panel">
          <div className="toolbar">
            {['진행중', '종료', '전체'].map((f) => (
              <button key={f} className={'chip' + (filter === f ? ' on' : '')} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
          <div className="scroll">
            {list.map((e) => (
              <button key={e.id} className={'eco-item' + (e.id === sel ? ' sel' : '')} onClick={() => setSel(e.id)}>
                <span className="mono">{e.no}</span><Badge>{e.status}</Badge>
                <strong>{e.title}</strong>
                <span className="sub">{e.requester} · {e.date}</span>
              </button>
            ))}
            {!list.length && <Empty>해당하는 설계변경이 없습니다.</Empty>}
          </div>
        </section>

        {eco ? (
          <section className="panel detail">
            <div className="eco-head">
              <span className="mono big">{eco.no}</span>
              <h2 className="eco-title">{eco.title}</h2>
            </div>
            <ol className={'flow' + (eco.status === '반려' ? ' rejected' : '')}>
              {FLOW.map((s, i) => (
                <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>{s}</li>
              ))}
            </ol>
            {eco.status === '반려' && <p className="note bad">이 요청은 반려되었습니다.</p>}

            <h2 className="h2">변경 사유</h2>
            <p>{eco.reason || '-'}</p>

            <h2 className="h2">대상 부품</h2>
            <table className="table compact">
              <thead><tr><th>품번</th><th>품명</th><th>현재 Rev</th><th>적용 후</th></tr></thead>
              <tbody>{eco.parts.map((id) => {
                const p = pn(id);
                return p && (<tr key={id}><td className="mono">{p.no}</td><td>{p.name}</td><td className="mono">{p.rev}</td>
                  <td className="mono">{eco.status === '적용' ? '-' : nextRev(p.rev)}</td></tr>);
              })}</tbody>
            </table>

            {!['적용', '반려'].includes(eco.status) && (
              <div className="approve-bar">
                <Field label="처리자"><input className="input" value={who} onChange={(e) => setWho(e.target.value)} /></Field>
                <div className="row-actions">
                  {eco.status === '요청' && <button className="btn primary" onClick={() => move('검토', '검토 시작')}>검토 시작</button>}
                  {eco.status === '검토' && <>
                    <button className="btn primary" onClick={() => move('승인', '승인')}>승인</button>
                    <button className="btn ghost danger" onClick={() => move('반려', '반려')}>반려</button>
                  </>}
                  {eco.status === '승인' && <button className="btn primary" onClick={() => { move('적용', '적용'); notify('ECO를 적용하고 리비전을 올렸습니다'); }}>ECO 적용</button>}
                </div>
              </div>
            )}

            <h2 className="h2">처리 이력</h2>
            <ol className="timeline">{[...eco.log].reverse().map((l, i) => (
              <li key={i}><span className="sub-inline">{l.date}</span> <strong>{l.who}</strong><div>{l.what}</div></li>
            ))}</ol>
          </section>
        ) : <section className="panel detail"><Empty>설계변경을 선택하거나 새 요청을 등록하세요.</Empty></section>}
      </div>

      {form && (
        <Modal title="설계변경 요청 (ECR)" onClose={() => setForm(null)}
          footer={<><button className="btn" onClick={() => setForm(null)}>취소</button><button className="btn primary" onClick={create}>요청 등록</button></>}>
          <Field label="제목"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="변경 사유"><textarea className="input" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
          <Field label="요청자"><input className="input" value={form.requester} onChange={(e) => setForm({ ...form, requester: e.target.value })} /></Field>
          <fieldset className="checks">
            <legend className="field-label">대상 부품</legend>
            {data.parts.map((p) => (
              <label key={p.id} className="check">
                <input type="checkbox" checked={form.parts.includes(p.id)}
                  onChange={(e) => setForm({ ...form, parts: e.target.checked ? [...form.parts, p.id] : form.parts.filter((x) => x !== p.id) })} />
                <span className="mono">{p.no}</span> {p.name}
              </label>
            ))}
          </fieldset>
        </Modal>
      )}
    </>
  );
}
