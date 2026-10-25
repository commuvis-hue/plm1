'use client';
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { uid, today, won, num, materialRollup, quote, fingerprint } from '../lib/calc';
import { Modal, Field, Badge, PageHead, Tabs, Empty } from './ui';

const defaultModel = () => ({
  bomType: 'M',
  processes: ['절단', '가공', '도장', '조립', '검사'].map((name) => ({ name, hours: 0.5, rate: 30000, yield: 99 })),
  equipCost: 0, lifeQty: 10000, overheadPct: 10, profitPct: 8, quotes: [],
});

export default function CMS() {
  const { data, update, notify } = useStore();
  const products = data.parts.filter((p) => p.type === '제품');
  const [root, setRoot] = useState(products[0]?.id);
  const [tab, setTab] = useState('ecms');
  const pn = (id) => data.parts.find((p) => p.id === id);

  const model = data.costModels[root] || defaultModel();
  const roll = useMemo(() => root ? materialRollup(data.lines, model.bomType, root, data.parts, data.materials) : null,
    [data.lines, data.parts, data.materials, root, model.bomType]);
  const q = roll ? quote(model, roll.total) : null;

  const setModel = (fn) => update((d) => {
    if (!d.costModels[root]) d.costModels[root] = defaultModel();
    fn(d.costModels[root]);
  });

  return (
    <>
      <PageHead title="원가관리" desc="BOM과 원소재 공시단가로 사전 견적을 내고, 단가 변동을 사후원가로 추적합니다">
        <select className="input" value={root || ''} onChange={(e) => setRoot(e.target.value)} aria-label="제품 선택">
          {products.map((p) => <option key={p.id} value={p.id}>{p.no} {p.name}</option>)}
        </select>
      </PageHead>
      <Tabs value={tab} onChange={setTab} items={[['ecms', '사전원가 견적'], ['icms', '사후원가 추적'], ['index', '원소재 공시단가'], ['contract', '단가변경 계약']]} />

      {!root && tab !== 'index' && tab !== 'contract' ? <Empty>원가를 계산할 제품이 없습니다.</Empty> : (
        <>
          {tab === 'ecms' && <ECMS model={model} setModel={setModel} roll={roll} q={q} pn={pn} notify={notify} />}
          {tab === 'icms' && <ICMS model={model} q={q} roll={roll} pn={pn} data={data} />}
        </>
      )}
      {tab === 'index' && <IndexTab data={data} update={update} notify={notify} />}
      {tab === 'contract' && <Contracts data={data} update={update} notify={notify} pn={pn} />}
    </>
  );
}

function ECMS({ model, setModel, roll, q, pn, notify }) {
  const setP = (i, k, v) => setModel((m) => { m.processes[i][k] = v === '' ? '' : Number(v); });
  const setV = (k, v) => setModel((m) => { m[k] = k === 'bomType' ? v : Number(v); });
  const confirmQuote = () => {
    const note = prompt('견적 메모', `${today()} 견적 확정`);
    if (note === null) return;
    setModel((m) => { m.quotes.push({ id: uid(), date: today(), note, ...q }); });
    notify('견적을 확정했습니다. 사후원가 추적의 기준이 됩니다');
  };
  const parts = [
    ['재료비', q.material], ['노무비', q.labor], ['감가상각비', q.depreciation],
    ['수율 손실', q.yieldLoss], ['일반관리비', q.overhead], ['이윤', q.profit],
  ];
  return (
    <div className="cost-grid">
      <section className="panel">
        <div className="toolbar between">
          <h2 className="h2 flush">재료비</h2>
          <select className="input narrow" value={model.bomType} onChange={(e) => setV('bomType', e.target.value)} aria-label="기준 BOM">
            <option value="E">E-BOM 기준</option><option value="M">M-BOM 기준</option>
          </select>
        </div>
        <div className="scroll-x">
          <table className="table compact">
            <thead><tr><th>품번</th><th>품명</th><th className="num">수량</th><th>산정 근거</th><th className="num">금액</th></tr></thead>
            <tbody>{roll.rows.map((r) => (
              <tr key={r.id}><td className="mono">{pn(r.id)?.no}</td><td>{pn(r.id)?.name}</td><td className="num">{num(r.qty, 2)}</td><td className="sub-inline">{r.basis}</td><td className="num">{won(r.ext)}</td></tr>
            ))}</tbody>
            <tfoot><tr><td colSpan={4}>재료비 합계</td><td className="num strong">{won(roll.total)}</td></tr></tfoot>
          </table>
        </div>

        <h2 className="h2">공정별 노무비와 수율</h2>
        <div className="scroll-x">
          <table className="table compact edit">
            <thead><tr><th>공정</th><th className="num">공수(h)</th><th className="num">임율(원/h)</th><th className="num">수율(%)</th><th className="num">노무비</th></tr></thead>
            <tbody>{model.processes.map((p, i) => (
              <tr key={i}>
                <td><input className="cell" value={p.name} aria-label="공정명" onChange={(e) => setModel((m) => { m.processes[i].name = e.target.value; })} /></td>
                <td className="num"><input className="cell num" type="number" step="0.1" value={p.hours} aria-label={`${p.name} 공수`} onChange={(e) => setP(i, 'hours', e.target.value)} /></td>
                <td className="num"><input className="cell num" type="number" step="1000" value={p.rate} aria-label={`${p.name} 임율`} onChange={(e) => setP(i, 'rate', e.target.value)} /></td>
                <td className="num"><input className="cell num" type="number" step="0.1" max="100" value={p.yield} aria-label={`${p.name} 수율`} onChange={(e) => setP(i, 'yield', e.target.value)} /></td>
                <td className="num">{won(p.hours * p.rate)}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr><td colSpan={3}>누적 수율 (5공정)</td><td className="num strong">{(q.yieldTotal * 100).toFixed(2)}%</td><td className="num strong">{won(q.labor)}</td></tr></tfoot>
          </table>
        </div>

        <div className="grid4">
          <Field label="설비 투자액 (원)"><input className="input" type="number" value={model.equipCost} onChange={(e) => setV('equipCost', e.target.value)} /></Field>
          <Field label="상각 기간 생산량 (EA)"><input className="input" type="number" value={model.lifeQty} onChange={(e) => setV('lifeQty', e.target.value)} /></Field>
          <Field label="일반관리비 (%)"><input className="input" type="number" step="0.5" value={model.overheadPct} onChange={(e) => setV('overheadPct', e.target.value)} /></Field>
          <Field label="이윤 (%)"><input className="input" type="number" step="0.5" value={model.profitPct} onChange={(e) => setV('profitPct', e.target.value)} /></Field>
        </div>
      </section>

      <aside className="panel quote">
        <span className="m-l">견적 단가</span>
        <div className="quote-total">{won(q.total)}</div>
        <div className="stack" aria-hidden="true">
          {parts.map(([k, v], i) => <span key={k} className={'seg s' + i} style={{ flexGrow: Math.max(v, 0) }} />)}
        </div>
        <dl className="breakdown">
          {parts.map(([k, v], i) => (
            <div key={k}><dt><i className={'dot s' + i} />{k}</dt><dd>{won(v)}<span className="sub-inline">{q.total ? (v / q.total * 100).toFixed(1) : 0}%</span></dd></div>
          ))}
        </dl>
        <button className="btn primary full" onClick={confirmQuote}>견적 확정</button>
        {model.quotes.length > 0 && (
          <>
            <h2 className="h2">확정 이력</h2>
            <ul className="plain small">{[...model.quotes].reverse().map((x) => (
              <li key={x.id}><span className="mono">{x.date}</span> {won(x.total)}<div className="sub">{x.note}</div></li>
            ))}</ul>
          </>
        )}
      </aside>
    </div>
  );
}

function ICMS({ model, q, pn, data }) {
  const base = model.quotes[model.quotes.length - 1];
  if (!base) return <Empty>확정된 견적이 없습니다. 사전원가 견적에서 ‘견적 확정’을 먼저 하세요.</Empty>;
  const rows = [
    ['재료비', base.material, q.material], ['노무비', base.labor, q.labor],
    ['감가상각비', base.depreciation, q.depreciation], ['수율 손실', base.yieldLoss, q.yieldLoss],
    ['일반관리비', base.overhead, q.overhead], ['이윤', base.profit, q.profit],
    ['합계', base.total, q.total],
  ];
  const delta = q.total - base.total;
  const pct = base.total ? delta / base.total * 100 : 0;
  const changedMats = data.materials.filter((m) => m.history.some((h) => h.date > base.date));
  const changedPrices = data.priceChanges.filter((c) => c.status === '체결' && c.signedAt > base.date);
  return (
    <div className="cost-grid">
      <section className="panel">
        <h2 className="h2 flush">확정 견적 대비 현재 원가</h2>
        <p className="muted">기준: {base.date} {base.note}</p>
        <table className="table">
          <thead><tr><th>항목</th><th className="num">확정 견적</th><th className="num">현재</th><th className="num">차이</th></tr></thead>
          <tbody>{rows.map(([k, a, b]) => (
            <tr key={k} className={k === '합계' ? 'strong' : ''}>
              <td>{k}</td><td className="num">{won(a)}</td><td className="num">{won(b)}</td>
              <td className={'num ' + (b - a > 0.5 ? 'up' : b - a < -0.5 ? 'down' : '')}>{b - a > 0 ? '+' : ''}{won(b - a)}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
      <aside className="panel quote">
        <span className="m-l">견적 대비 원가 변동</span>
        <div className={'quote-total ' + (delta > 0 ? 'up' : 'down')}>{delta > 0 ? '+' : ''}{pct.toFixed(2)}%</div>
        <p className="muted">{delta > 0 ? `개당 ${won(delta)} 상승. 고객사 단가 재협의 근거로 사용할 수 있습니다.` : '확정 견적 이내에서 관리되고 있습니다.'}</p>
        <h2 className="h2">변동 요인</h2>
        <ul className="plain small">
          {changedMats.map((m) => {
            const before = [...m.history].reverse().find((h) => h.date <= base.date)?.price ?? m.history[0].price;
            return <li key={m.id}>원소재 {m.code} {num(before)} → {num(m.price)}원/kg</li>;
          })}
          {changedPrices.map((c) => <li key={c.id}>{pn(c.partId)?.no} 구매단가 {num(c.old)} → {num(c.new)}원 (계약 체결)</li>)}
          {!changedMats.length && !changedPrices.length && <li className="muted">기준일 이후 변동 없음</li>}
        </ul>
      </aside>
    </div>
  );
}

function Spark({ history }) {
  if (history.length < 2) return <span className="muted">-</span>;
  const ps = history.map((h) => h.price);
  const min = Math.min(...ps), max = Math.max(...ps);
  const pts = ps.map((p, i) => `${(i / (ps.length - 1)) * 80},${22 - ((p - min) / (max - min || 1)) * 18}`).join(' ');
  return <svg width="84" height="26" className="spark" aria-label="단가 추이"><polyline points={pts} /></svg>;
}

function IndexTab({ data, update, notify }) {
  const [edit, setEdit] = useState(null);
  const save = () => {
    if (!edit.code.trim() || !(Number(edit.price) > 0)) return notify('코드와 단가를 입력하세요');
    update((d) => {
      if (edit.id) {
        const m = d.materials.find((x) => x.id === edit.id);
        m.name = edit.name;
        if (Number(edit.price) !== m.price) {
          m.price = Number(edit.price);
          m.history.push({ date: edit.date, price: m.price });
          m.history.sort((a, b) => a.date.localeCompare(b.date));
        }
      } else {
        d.materials.push({ id: uid(), code: edit.code.trim(), name: edit.name, price: Number(edit.price), history: [{ date: edit.date, price: Number(edit.price) }] });
      }
    });
    notify('공시단가를 반영했습니다. 관련 부품 원가가 다시 계산됩니다');
    setEdit(null);
  };
  return (
    <section className="panel">
      <div className="toolbar between">
        <p className="muted">재질 코드가 일치하는 부품은 중량 × 공시단가로 재료비를 계산합니다.</p>
        <button className="btn primary" onClick={() => setEdit({ code: '', name: '', price: '', date: today() })}>원소재 추가</button>
      </div>
      <table className="table">
        <thead><tr><th>코드</th><th>원소재</th><th className="num">현재 단가 (원/kg)</th><th>추이</th><th>최근 고시</th><th className="num">사용 부품</th><th></th></tr></thead>
        <tbody>{data.materials.map((m) => (
          <tr key={m.id}>
            <td className="mono">{m.code}</td><td>{m.name}</td><td className="num">{num(m.price)}</td>
            <td><Spark history={m.history} /></td>
            <td className="mono">{m.history[m.history.length - 1]?.date}</td>
            <td className="num">{data.parts.filter((p) => p.material === m.code).length}</td>
            <td className="act"><button className="link" onClick={() => setEdit({ ...m, date: today() })}>단가 갱신</button></td>
          </tr>
        ))}</tbody>
      </table>
      {edit && (
        <Modal title={edit.id ? `${edit.code} 공시단가 갱신` : '원소재 추가'} onClose={() => setEdit(null)}
          footer={<><button className="btn" onClick={() => setEdit(null)}>취소</button><button className="btn primary" onClick={save}>반영</button></>}>
          <Field label="코드"><input className="input" value={edit.code} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
          <Field label="원소재명"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="단가 (원/kg)"><input className="input" type="number" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
          <Field label="고시일"><input className="input" type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
        </Modal>
      )}
    </section>
  );
}

function Contracts({ data, update, notify, pn }) {
  const [form, setForm] = useState(null);
  const [sign, setSign] = useState(null);
  const buyable = data.parts.filter((p) => p.unitPrice > 0);

  const request = () => {
    const p = pn(form.partId);
    if (!p || !(Number(form.new) > 0)) return notify('부품과 변경 단가를 입력하세요');
    update((d) => { d.priceChanges.unshift({ id: uid(), partId: p.id, old: p.unitPrice, new: Number(form.new), reason: form.reason, status: '서명 대기', requestedAt: today() }); });
    setForm(null);
    notify('단가변경 계약서를 발송했습니다. 협력사 서명을 기다립니다');
  };
  const doSign = () => {
    if (!sign.name.trim()) return notify('서명자 이름을 입력하세요');
    const c = sign.c;
    const hash = fingerprint([c.id, c.partId, c.old, c.new, c.reason, sign.name, today()].join('|'));
    update((d) => {
      const x = d.priceChanges.find((y) => y.id === c.id);
      Object.assign(x, { status: '체결', signedBy: sign.name.trim(), signedAt: today(), hash });
      d.parts.find((p) => p.id === c.partId).unitPrice = c.new;
    });
    setSign(null);
    notify('계약이 체결되어 구매 단가를 갱신했습니다');
  };
  const reject = (c) => update((d) => { d.priceChanges.find((y) => y.id === c.id).status = '반려'; });

  return (
    <section className="panel">
      <div className="toolbar between">
        <p className="muted">협력사 서명이 끝나면 부품 구매 단가가 자동으로 바뀌고 사후원가에 반영됩니다.</p>
        <button className="btn primary" onClick={() => setForm({ partId: buyable[0]?.id || '', new: '', reason: '' })}>단가변경 요청</button>
      </div>
      <div className="scroll-x">
        <table className="table">
          <thead><tr><th>요청일</th><th>부품</th><th>협력사</th><th className="num">기존</th><th className="num">변경</th><th>사유</th><th>상태</th><th>서명</th><th></th></tr></thead>
          <tbody>{data.priceChanges.map((c) => {
            const p = pn(c.partId);
            return (
              <tr key={c.id}>
                <td className="mono">{c.requestedAt}</td><td>{p?.no} {p?.name}</td><td>{p?.supplier}</td>
                <td className="num">{num(c.old)}</td><td className="num">{num(c.new)}</td><td>{c.reason}</td>
                <td><Badge>{c.status}</Badge></td>
                <td>{c.signedBy ? <>{c.signedBy}<div className="sub mono">{c.signedAt} #{c.hash}</div></> : '-'}</td>
                <td className="act">{c.status === '서명 대기' && <>
                  <button className="link" onClick={() => setSign({ c, name: p?.supplier ? p.supplier + ' 대표' : '' })}>서명 받기</button>
                  <button className="link danger" onClick={() => reject(c)}>반려</button></>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {!data.priceChanges.length && <Empty>단가변경 이력이 없습니다.</Empty>}

      {form && (
        <Modal title="단가변경 계약 요청" onClose={() => setForm(null)}
          footer={<><button className="btn" onClick={() => setForm(null)}>취소</button><button className="btn primary" onClick={request}>계약서 발송</button></>}>
          <Field label="부품">
            <select className="input" value={form.partId} onChange={(e) => setForm({ ...form, partId: e.target.value })}>
              {buyable.map((p) => <option key={p.id} value={p.id}>{p.no} {p.name} ({num(p.unitPrice)}원, {p.supplier})</option>)}
            </select>
          </Field>
          <Field label="변경 단가 (원)"><input className="input" type="number" value={form.new} onChange={(e) => setForm({ ...form, new: e.target.value })} /></Field>
          <Field label="변경 사유"><textarea className="input" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
        </Modal>
      )}
      {sign && (
        <Modal title="전자서명" onClose={() => setSign(null)}
          footer={<><button className="btn" onClick={() => setSign(null)}>취소</button><button className="btn primary" onClick={doSign}>서명하고 체결</button></>}>
          <div className="contract-doc">
            <p><strong>단가변경 합의서</strong></p>
            <p>품목 {pn(sign.c.partId)?.no} {pn(sign.c.partId)?.name}의 납품 단가를 {num(sign.c.old)}원에서 {num(sign.c.new)}원으로 변경하며, {today()}부터 적용한다.</p>
            <p className="sub">사유: {sign.c.reason || '-'}</p>
          </div>
          <Field label="협력사 서명자" hint="체결 시 계약 내용으로 문서 지문(해시)을 생성해 위변조를 확인합니다">
            <input className="input" value={sign.name} onChange={(e) => setSign({ ...sign, name: e.target.value })} />
          </Field>
        </Modal>
      )}
    </section>
  );
}
