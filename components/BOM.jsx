'use client';
import { Fragment, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { uid, buildTree, diffBom, explode, partCost, won, num, toCSV, downloadText, today } from '../lib/calc';
import { Modal, Field, Badge, PageHead, Tabs, Empty } from './ui';

const TYPE_NAME = { E: 'E-BOM 설계', M: 'M-BOM 생산', S: 'S-BOM 서비스' };

export default function BOM() {
  const { data, update, notify } = useStore();
  const products = data.parts.filter((p) => p.type === '제품');
  const [root, setRoot] = useState(products[0]?.id);
  const [tab, setTab] = useState('E');
  const [adding, setAdding] = useState(null);
  const [cmp, setCmp] = useState(['E', 'M']);
  const [open, setOpen] = useState({});

  const pn = (id) => data.parts.find((p) => p.id === id);
  const tree = useMemo(() => root && tab !== 'diff' ? buildTree(data.lines, tab, root) : null, [data.lines, tab, root]);
  const diff = useMemo(() => root && tab === 'diff' ? diffBom(data.lines, root, cmp[0], cmp[1]) : [], [data.lines, root, tab, cmp]);

  const setQty = (lineId, qty) => update((d) => { d.lines.find((l) => l.id === lineId).qty = Math.max(0, Number(qty)); });
  const removeLine = (lineId) => { update((d) => { d.lines = d.lines.filter((l) => l.id !== lineId); }); notify('BOM 항목을 삭제했습니다'); };

  const addLine = () => {
    const { parent, child, qty } = adding;
    if (!child) return notify('추가할 부품을 선택하세요');
    if (child === parent) return notify('자기 자신을 하위로 넣을 수 없습니다');
    // 순환 참조 검사: child의 하위에 parent가 있으면 안 됨
    if (child === root || explode(data.lines, tab, child).has(parent))
      return notify('순환 구조가 되어 추가할 수 없습니다');
    if (data.lines.some((l) => l.type === tab && l.parent === parent && l.child === child))
      return notify('이미 같은 위치에 있는 부품입니다. 수량을 조정하세요');
    update((d) => { d.lines.push({ id: uid(), type: tab, parent, child, qty: Number(qty) || 1 }); });
    setOpen({ ...open, [parent]: true });
    setAdding(null);
    notify('BOM 항목을 추가했습니다');
  };

  const copyFrom = (src) => {
    const has = data.lines.some((l) => l.type === tab);
    if (has && !confirm(`${TYPE_NAME[tab]}의 기존 구성을 지우고 ${src}-BOM으로 덮어쓸까요?`)) return;
    const reachable = new Set([root, ...explode(data.lines, src, root).keys()]);
    update((d) => {
      const keepOther = d.lines.filter((l) => !(l.type === tab && reachable.has(l.parent)));
      const copies = d.lines.filter((l) => l.type === src && reachable.has(l.parent))
        .map((l) => ({ ...l, id: uid(), type: tab }));
      d.lines = [...keepOther, ...copies];
    });
    notify(`${src}-BOM을 ${tab}-BOM으로 복사했습니다`);
  };

  const exportCSV = () => {
    const rows = [['BOM유형', '레벨', '모품번', '자품번', '자품명', 'Rev', '수량', '단위', '재질', '단가']];
    const walk = (node, lvl) => node.children.forEach((c) => {
      const p = pn(c.id);
      rows.push([tab, lvl, pn(c.line.parent)?.no, p?.no, p?.name, p?.rev, c.line.qty, p?.unit, p?.material, Math.round(partCost(p, data.materials).cost)]);
      walk(c, lvl + 1);
    });
    walk(tree, 1);
    downloadText(`${pn(root).no}_${tab}-BOM_${today()}.csv`, toCSV(rows), 'text/csv');
    notify('ERP 업로드용 CSV를 내려받았습니다');
  };

  // 컴포넌트가 아닌 함수로 렌더링해야 수량 입력 중 포커스가 유지된다
  const renderNode = (node, depth, mult, key) => {
    const p = pn(node.id);
    const kids = node.children;
    const isOpen = open[node.id] ?? depth < 2;
    const qty = node.line ? Number(node.line.qty) : 1;
    const tot = mult * qty;
    const unit = partCost(p, data.materials).cost;
    return (
      <Fragment key={key}>
        <tr className={depth === 0 ? 'root-row' : ''}>
          <td>
            <div className="tree-cell" style={{ paddingLeft: depth * 22 }}>
              {kids.length ? (
                <button className="twisty" aria-expanded={isOpen} aria-label={isOpen ? '접기' : '펼치기'}
                  onClick={() => setOpen({ ...open, [node.id]: !isOpen })}>{isOpen ? '−' : '+'}</button>
              ) : <span className="leaf" />}
              <span className="mono">{p?.no}</span>
              <span className="tree-name">{p?.name}</span>
              {node.cycle && <Badge>반려</Badge>}
            </div>
          </td>
          <td className="mono">{p?.rev}</td>
          <td className="num">
            {node.line ? <input className="qty" type="number" min="0" step="any" value={node.line.qty}
              aria-label={`${p?.no} 수량`} onChange={(e) => setQty(node.line.id, e.target.value)} /> : '-'}
          </td>
          <td className="num">{depth ? num(tot, 2) : '-'}</td>
          <td>{p?.material || <span className="muted">{kids.length || !depth ? '-' : '구매'}</span>}</td>
          <td className="num">{!kids.length && depth ? won(unit * tot) : ''}</td>
          <td className="act">
            <button className="link" onClick={() => setAdding({ parent: node.id, child: '', qty: 1 })}>하위 추가</button>
            {node.line && <button className="link danger" onClick={() => removeLine(node.line.id)}>삭제</button>}
          </td>
        </tr>
        {isOpen && kids.map((c) => renderNode(c, depth + 1, tot, c.line.id))}
      </Fragment>
    );
  };

  const leafTotal = useMemo(() => {
    if (!tree) return 0;
    let s = 0;
    const walk = (n, m) => n.children.forEach((c) => {
      const t = m * Number(c.line.qty);
      if (!c.children.length) s += partCost(pn(c.id), data.materials).cost * t;
      walk(c, t);
    });
    walk(tree, 1);
    return s;
  }, [tree, data.materials, data.parts]);

  const changed = diff.filter((r) => r.status !== '동일').length;

  return (
    <>
      <PageHead title="Multi-BOM" desc="한 제품의 설계·생산·서비스 BOM을 함께 관리하고 사양 간 차이를 자동으로 찾아냅니다">
        <select className="input" value={root} onChange={(e) => setRoot(e.target.value)} aria-label="제품 선택">
          {products.map((p) => <option key={p.id} value={p.id}>{p.no} {p.name}</option>)}
        </select>
      </PageHead>

      {!root ? <Empty>먼저 부품·도면에서 유형이 ‘제품’인 품목을 등록하세요.</Empty> : (
        <section className="panel">
          <div className="toolbar between">
            <Tabs value={tab} onChange={setTab} items={[['E', 'E-BOM 설계'], ['M', 'M-BOM 생산'], ['S', 'S-BOM 서비스'], ['diff', '사양 비교']]} />
            {tab !== 'diff' && (
              <div className="row-actions">
                {tab !== 'E' && <button className="btn" onClick={() => copyFrom('E')}>E-BOM에서 복사</button>}
                <button className="btn" onClick={exportCSV}>ERP용 CSV</button>
              </div>
            )}
          </div>

          {tab !== 'diff' ? (
            <>
              <div className="scroll-x">
                <table className="table bom">
                  <thead><tr><th>품번 / 품명</th><th>Rev</th><th className="num">단위수량</th><th className="num">총소요</th><th>재질</th><th className="num">재료비</th><th></th></tr></thead>
                  <tbody>{renderNode(tree, 0, 1, 'root')}</tbody>
                  <tfoot><tr><td colSpan={5}>말단 부품 재료비 합계</td><td className="num strong">{won(leafTotal)}</td><td /></tr></tfoot>
                </table>
              </div>
              {!tree.children.length && <Empty>이 BOM은 비어 있습니다. 최상위 행의 ‘하위 추가’로 구성하거나 E-BOM에서 복사하세요.</Empty>}
            </>
          ) : (
            <>
              <div className="toolbar">
                <select className="input narrow" value={cmp[0]} onChange={(e) => setCmp([e.target.value, cmp[1]])} aria-label="기준 BOM">
                  {Object.keys(TYPE_NAME).map((k) => <option key={k} value={k}>{k}-BOM</option>)}
                </select>
                <span className="muted">대비</span>
                <select className="input narrow" value={cmp[1]} onChange={(e) => setCmp([cmp[0], e.target.value])} aria-label="비교 BOM">
                  {Object.keys(TYPE_NAME).map((k) => <option key={k} value={k}>{k}-BOM</option>)}
                </select>
                <span className="note">{changed ? `차이 ${changed}건` : '차이 없음'}</span>
              </div>
              <div className="scroll-x">
                <table className="table">
                  <thead><tr><th>구분</th><th>품번</th><th>품명</th><th className="num">{cmp[0]}-BOM 총소요</th><th className="num">{cmp[1]}-BOM 총소요</th><th className="num">증감</th></tr></thead>
                  <tbody>{diff.map((r) => (
                    <tr key={r.id} className={r.status === '동일' ? 'dim' : ''}>
                      <td><Badge>{r.status}</Badge></td>
                      <td className="mono">{pn(r.id)?.no}</td><td>{pn(r.id)?.name}</td>
                      <td className="num">{num(r.qa, 2)}</td><td className="num">{num(r.qb, 2)}</td>
                      <td className="num">{r.qb - r.qa > 0 ? '+' : ''}{num(r.qb - r.qa, 2)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {adding && (
        <Modal title={`${pn(adding.parent)?.no} 하위 부품 추가 (${tab}-BOM)`} onClose={() => setAdding(null)}
          footer={<><button className="btn" onClick={() => setAdding(null)}>취소</button><button className="btn primary" onClick={addLine}>추가</button></>}>
          <Field label="부품">
            <select className="input" value={adding.child} onChange={(e) => setAdding({ ...adding, child: e.target.value })}>
              <option value="">선택하세요</option>
              {data.parts.filter((p) => p.type !== '제품' && p.status !== '폐기').map((p) => <option key={p.id} value={p.id}>{p.no} {p.name}</option>)}
            </select>
          </Field>
          <Field label="수량"><input className="input" type="number" min="0" step="any" value={adding.qty} onChange={(e) => setAdding({ ...adding, qty: e.target.value })} /></Field>
        </Modal>
      )}
    </>
  );
}
