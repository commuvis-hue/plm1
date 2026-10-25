'use client';
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { uid, today, won, whereUsed, partCost } from '../lib/calc';
import { Modal, Field, Badge, PageHead, Empty } from './ui';

const TYPES = ['제품', '조립', '부품'];
const STATUS = ['작업중', '검토중', '승인', '폐기'];
const blank = { no: '', name: '', type: '부품', material: '', weight: 0, unitPrice: 0, supplier: '', spec: '', unit: 'EA', status: '작업중', owner: '' };

export default function PDM({ goto }) {
  const { data, update, notify } = useStore();
  const [q, setQ] = useState('');
  const [type, setType] = useState('전체');
  const [sel, setSel] = useState(data.parts[0]?.id);
  const [edit, setEdit] = useState(null);
  const [fileForm, setFileForm] = useState(null);

  const list = useMemo(() => data.parts.filter((p) =>
    (type === '전체' || p.type === type) &&
    (p.no + p.name + p.spec + p.material + p.supplier).toLowerCase().includes(q.toLowerCase())
  ), [data.parts, q, type]);

  const part = data.parts.find((p) => p.id === sel);

  const savePart = () => {
    if (!edit.no.trim() || !edit.name.trim()) return notify('품번과 품명을 입력하세요');
    if (data.parts.some((p) => p.no === edit.no.trim() && p.id !== edit.id))
      return notify(`품번 ${edit.no}은(는) 이미 등록되어 있습니다`);
    update((d) => {
      const v = { ...edit, no: edit.no.trim(), weight: Number(edit.weight), unitPrice: Number(edit.unitPrice) };
      if (edit.id) {
        const i = d.parts.findIndex((p) => p.id === edit.id);
        d.parts[i] = { ...d.parts[i], ...v };
      } else {
        v.id = uid(); v.rev = 'A'; v.files = [];
        v.history = [{ rev: 'A', date: today(), note: '최초 등록' }];
        d.parts.push(v); setSel(v.id);
      }
    });
    notify(edit.id ? '부품 정보를 저장했습니다' : '부품을 등록했습니다');
    setEdit(null);
  };

  const removePart = () => {
    if (whereUsed(data.lines, part.id).length || data.lines.some((l) => l.parent === part.id))
      return notify('BOM에서 사용 중인 부품은 삭제할 수 없습니다. 상태를 ‘폐기’로 바꾸세요');
    if (!confirm(`${part.no} ${part.name}을(를) 삭제할까요?`)) return;
    update((d) => { d.parts = d.parts.filter((p) => p.id !== part.id); });
    setSel(data.parts.find((p) => p.id !== part.id)?.id);
    notify('부품을 삭제했습니다');
  };

  const addFile = () => {
    if (!fileForm.name.trim()) return notify('파일 이름을 입력하세요');
    update((d) => {
      d.parts.find((p) => p.id === part.id).files.push({
        id: uid(), ...fileForm, rev: part.rev, date: today(),
      });
    });
    notify('파일을 등록했습니다');
    setFileForm(null);
  };

  const used = part ? whereUsed(data.lines, part.id) : [];
  const pc = part ? partCost(part, data.materials) : null;
  const pn = (id) => data.parts.find((p) => p.id === id);

  return (
    <>
      <PageHead title="부품·도면" desc="부품 마스터, 도면과 기술문서, 리비전 이력을 관리합니다">
        <button className="btn primary" onClick={() => setEdit({ ...blank })}>부품 등록</button>
      </PageHead>

      <div className="split">
        <section className="panel list-panel">
          <div className="toolbar">
            <input className="input" placeholder="품번, 품명, 재질, 협력사 검색" value={q}
              onChange={(e) => setQ(e.target.value)} aria-label="부품 검색" />
            <select className="input narrow" value={type} onChange={(e) => setType(e.target.value)} aria-label="유형">
              {['전체', ...TYPES].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="scroll">
            <table className="table">
              <thead><tr><th>품번</th><th>품명</th><th>Rev</th><th>상태</th></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className={p.id === sel ? 'sel' : ''} onClick={() => setSel(p.id)}
                    tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSel(p.id)}>
                    <td className="mono">{p.no}</td>
                    <td>{p.name}<span className="sub">{p.type}</span></td>
                    <td className="mono">{p.rev}</td>
                    <td><Badge>{p.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!list.length && <Empty>조건에 맞는 부품이 없습니다. 검색어를 지우거나 새 부품을 등록하세요.</Empty>}
          </div>
        </section>

        {part ? (
          <section className="panel detail">
            <div className="titleblock">
              <div className="tb-name">
                <span className="tb-l">품명</span>
                <strong>{part.name}</strong>
              </div>
              <div><span className="tb-l">품번</span><span className="mono">{part.no}</span></div>
              <div><span className="tb-l">리비전</span><span className="mono big">{part.rev}</span></div>
              <div><span className="tb-l">유형</span>{part.type}</div>
              <div><span className="tb-l">상태</span><Badge>{part.status}</Badge></div>
              <div><span className="tb-l">재질</span>{part.material || '-'}</div>
              <div><span className="tb-l">중량</span>{part.weight ? part.weight + ' kg' : '-'}</div>
              <div><span className="tb-l">협력사</span>{part.supplier || '-'}</div>
              <div><span className="tb-l">담당</span>{part.owner || '-'}</div>
              <div className="tb-wide"><span className="tb-l">규격·사양</span>{part.spec || '-'}</div>
              <div className="tb-full"><span className="tb-l">원가 기준</span>
                {part.type === '부품'
                  ? <span>{won(pc.cost)} <span className="sub-inline">{pc.basis}</span></span>
                  : <span className="muted">하위 BOM 합산, 원가관리 화면에서 계산합니다</span>}</div>
            </div>

            <div className="row-actions">
              <button className="btn" onClick={() => setEdit({ ...part })}>정보 수정</button>
              <button className="btn" onClick={() => goto('eco', { newFor: part.id })}>설계변경 요청</button>
              <button className="btn ghost danger" onClick={removePart}>삭제</button>
            </div>

            <h2 className="h2">도면·문서 <button className="link" onClick={() => setFileForm({ kind: '도면', name: '', author: '' })}>파일 등록</button></h2>
            {part.files.length ? (
              <div className="scroll-x"><table className="table compact nowrap">
                <thead><tr><th>구분</th><th>파일</th><th>Rev</th><th>등록일</th><th>등록자</th></tr></thead>
                <tbody>{part.files.map((f) => (
                  <tr key={f.id}><td>{f.kind}</td><td>{f.name}</td><td className="mono">{f.rev}</td><td className="mono">{f.date}</td><td>{f.author}</td></tr>
                ))}</tbody>
              </table></div>
            ) : <Empty>등록된 도면이 없습니다. CAD 파일이나 사양서를 등록하세요.</Empty>}

            <div className="two-col">
              <div>
                <h2 className="h2">사용처 (Where-used)</h2>
                {used.length ? (
                  <ul className="plain">{used.map((l) => (
                    <li key={l.id}><span className="tag">{l.type}-BOM</span> {pn(l.parent)?.no} {pn(l.parent)?.name} <span className="sub-inline">× {l.qty}</span></li>
                  ))}</ul>
                ) : <p className="muted">어느 BOM에도 사용되지 않습니다.</p>}
              </div>
              <div>
                <h2 className="h2">리비전 이력</h2>
                <ol className="timeline">{[...part.history].reverse().map((h, i) => (
                  <li key={i}><span className="mono">Rev {h.rev}</span> <span className="sub-inline">{h.date}</span><div>{h.note}</div></li>
                ))}</ol>
              </div>
            </div>
          </section>
        ) : <section className="panel detail"><Empty>왼쪽 목록에서 부품을 선택하세요.</Empty></section>}
      </div>

      {edit && (
        <Modal title={edit.id ? `${edit.no} 수정` : '부품 등록'} onClose={() => setEdit(null)}
          footer={<><button className="btn" onClick={() => setEdit(null)}>취소</button><button className="btn primary" onClick={savePart}>저장</button></>}>
          <div className="grid2">
            <Field label="품번"><input className="input" value={edit.no} onChange={(e) => setEdit({ ...edit, no: e.target.value })} /></Field>
            <Field label="품명"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="유형"><select className="input" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="상태"><select className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{STATUS.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="재질" hint="원소재 코드와 같으면 공시단가로 원가를 계산합니다">
              <input className="input" list="mat-codes" value={edit.material} onChange={(e) => setEdit({ ...edit, material: e.target.value })} />
              <datalist id="mat-codes">{data.materials.map((m) => <option key={m.id} value={m.code}>{m.name}</option>)}</datalist>
            </Field>
            <Field label="중량 (kg)"><input className="input" type="number" step="0.01" value={edit.weight} onChange={(e) => setEdit({ ...edit, weight: e.target.value })} /></Field>
            <Field label="구매 단가 (원)"><input className="input" type="number" value={edit.unitPrice} onChange={(e) => setEdit({ ...edit, unitPrice: e.target.value })} /></Field>
            <Field label="협력사"><input className="input" value={edit.supplier} onChange={(e) => setEdit({ ...edit, supplier: e.target.value })} /></Field>
            <Field label="담당자"><input className="input" value={edit.owner} onChange={(e) => setEdit({ ...edit, owner: e.target.value })} /></Field>
            <Field label="단위"><input className="input" value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} /></Field>
          </div>
          <Field label="규격·사양"><textarea className="input" rows={2} value={edit.spec} onChange={(e) => setEdit({ ...edit, spec: e.target.value })} /></Field>
        </Modal>
      )}

      {fileForm && (
        <Modal title={`${part.no} 파일 등록`} onClose={() => setFileForm(null)}
          footer={<><button className="btn" onClick={() => setFileForm(null)}>취소</button><button className="btn primary" onClick={addFile}>등록</button></>}>
          <Field label="구분"><select className="input" value={fileForm.kind} onChange={(e) => setFileForm({ ...fileForm, kind: e.target.value })}><option>도면</option><option>3D 모델</option><option>문서</option></select></Field>
          <Field label="파일" hint="현재 버전은 파일 정보만 기록합니다. 실제 파일 보관은 README의 Vercel Blob 연동을 참고하세요">
            <input className="input" type="file" onChange={(e) => setFileForm({ ...fileForm, name: e.target.files[0]?.name || '' })} />
          </Field>
          <Field label="파일 이름"><input className="input" value={fileForm.name} onChange={(e) => setFileForm({ ...fileForm, name: e.target.value })} /></Field>
          <Field label="등록자"><input className="input" value={fileForm.author} onChange={(e) => setFileForm({ ...fileForm, author: e.target.value })} /></Field>
        </Modal>
      )}
    </>
  );
}
