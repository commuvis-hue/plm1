// 계산 로직 모음: BOM 전개·비교, 원가, CPM, EVMS, 유틸
export const uid = () => Math.random().toString(36).slice(2, 10);

export const won = (n) =>
  (Math.round(n || 0)).toLocaleString('ko-KR') + '원';
export const num = (n, d = 0) =>
  Number(n || 0).toLocaleString('ko-KR', { maximumFractionDigits: d });

/* ---------- 날짜 ---------- */
export const toDate = (s) => new Date(s + 'T00:00:00');
export const fmtDate = (d) => {
  const z = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
export const addDays = (s, n) => {
  const d = toDate(s);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
};
export const diffDays = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
export const today = () => fmtDate(new Date());

/* ---------- 리비전 ---------- */
export const nextRev = (rev) => {
  if (!rev) return 'A';
  const c = rev.charCodeAt(rev.length - 1);
  if (c >= 65 && c < 90) return rev.slice(0, -1) + String.fromCharCode(c + 1);
  return rev + 'A';
};

/* ---------- BOM ---------- */
export const childLines = (lines, type, parentId) =>
  lines.filter((l) => l.type === type && l.parent === parentId);

export function buildTree(lines, type, rootId, path = []) {
  if (path.includes(rootId)) return { id: rootId, cycle: true, children: [] };
  return {
    id: rootId,
    children: childLines(lines, type, rootId).map((l) => ({
      line: l,
      ...buildTree(lines, type, l.child, [...path, rootId]),
    })),
  };
}

// 전개: 부품ID → 총 소요수량 (루트 제외)
export function explode(lines, type, rootId) {
  const total = new Map();
  const walk = (id, mult, path) => {
    if (path.includes(id)) return;
    for (const l of childLines(lines, type, id)) {
      const q = mult * Number(l.qty || 0);
      total.set(l.child, (total.get(l.child) || 0) + q);
      walk(l.child, q, [...path, id]);
    }
  };
  walk(rootId, 1, []);
  return total;
}

export const hasChildren = (lines, type, id) =>
  lines.some((l) => l.type === type && l.parent === id);

// 사양 간 차이 자동 감지
export function diffBom(lines, rootId, a, b) {
  const ea = explode(lines, a, rootId);
  const eb = explode(lines, b, rootId);
  const ids = new Set([...ea.keys(), ...eb.keys()]);
  const rows = [];
  for (const id of ids) {
    const qa = ea.get(id) || 0;
    const qb = eb.get(id) || 0;
    let status = '동일';
    if (!qa) status = '추가';
    else if (!qb) status = '삭제';
    else if (qa !== qb) status = '수량 변경';
    rows.push({ id, qa, qb, status });
  }
  const order = { 추가: 0, 삭제: 1, '수량 변경': 2, 동일: 3 };
  return rows.sort((x, y) => order[x.status] - order[y.status]);
}

export function whereUsed(lines, partId) {
  return lines.filter((l) => l.child === partId);
}

/* ---------- 원가 ---------- */
export function partCost(part, materials) {
  if (!part) return { cost: 0, basis: '-' };
  const m = materials.find((x) => x.code === part.material);
  if (m && Number(part.weight) > 0) {
    return {
      cost: Number(part.weight) * m.price,
      basis: `${part.weight}kg × ${num(m.price)}원/kg`,
    };
  }
  return { cost: Number(part.unitPrice || 0), basis: '구매 단가' };
}

// 말단 부품 기준 재료비 롤업
export function materialRollup(lines, type, rootId, parts, materials) {
  const ex = explode(lines, type, rootId);
  const rows = [];
  let total = 0;
  for (const [id, qty] of ex) {
    if (hasChildren(lines, type, id)) continue;
    const part = parts.find((p) => p.id === id);
    const { cost, basis } = partCost(part, materials);
    rows.push({ id, qty, unit: cost, ext: cost * qty, basis });
    total += cost * qty;
  }
  rows.sort((a, b) => b.ext - a.ext);
  return { rows, total };
}

// 사전원가 견적: 재료비 + 노무비 + 감가상각비, 5공정 누적수율 반영
export function quote(model, materialCost) {
  const labor = model.processes.reduce(
    (s, p) => s + Number(p.hours || 0) * Number(p.rate || 0), 0);
  const depreciation = Number(model.lifeQty) > 0
    ? Number(model.equipCost || 0) / Number(model.lifeQty) : 0;
  const yieldTotal = model.processes.reduce(
    (s, p) => s * (Number(p.yield || 100) / 100), 1);
  const direct = materialCost + labor + depreciation;
  const yieldAdjusted = yieldTotal > 0 ? direct / yieldTotal : direct;
  const yieldLoss = yieldAdjusted - direct;
  const overhead = yieldAdjusted * Number(model.overheadPct || 0) / 100;
  const profit = (yieldAdjusted + overhead) * Number(model.profitPct || 0) / 100;
  return {
    material: materialCost, labor, depreciation, yieldTotal, yieldLoss,
    overhead, profit, total: yieldAdjusted + overhead + profit,
  };
}

/* ---------- CPM ---------- */
export function cpm(tasks) {
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const es = {}, ef = {};
  const visiting = new Set();
  let cycle = false;
  const calc = (id) => {
    if (ef[id] !== undefined) return ef[id];
    if (visiting.has(id)) { cycle = true; return 0; }
    visiting.add(id);
    const t = byId[id];
    const start = Math.max(0, ...(t.deps || []).filter((d) => byId[d]).map(calc));
    es[id] = start;
    ef[id] = start + Number(t.dur || 0);
    visiting.delete(id);
    return ef[id];
  };
  tasks.forEach((t) => calc(t.id));
  const duration = Math.max(0, ...Object.values(ef));
  const lf = {}, ls = {};
  const succ = (id) => tasks.filter((t) => (t.deps || []).includes(id));
  const order = [...tasks].sort((a, b) => ef[b.id] - ef[a.id]);
  for (const t of order) {
    const s = succ(t.id);
    lf[t.id] = s.length ? Math.min(...s.map((x) => ls[x.id] ?? duration)) : duration;
    ls[t.id] = lf[t.id] - Number(t.dur || 0);
  }
  // 후행 작업의 ls가 먼저 계산되지 않았을 수 있으므로 한 번 더 보정
  for (let i = 0; i < tasks.length; i++) {
    for (const t of order) {
      const s = succ(t.id);
      lf[t.id] = s.length ? Math.min(...s.map((x) => ls[x.id])) : duration;
      ls[t.id] = lf[t.id] - Number(t.dur || 0);
    }
  }
  const result = {};
  for (const t of tasks) {
    const slack = ls[t.id] - es[t.id];
    result[t.id] = { es: es[t.id], ef: ef[t.id], ls: ls[t.id], lf: lf[t.id], slack, critical: slack === 0 };
  }
  return { result, duration, cycle };
}

export function evms(tasks, cp, startDate, asOf) {
  const elapsed = diffDays(startDate, asOf);
  let pv = 0, ev = 0, ac = 0, bac = 0;
  for (const t of tasks) {
    const r = cp.result[t.id];
    const b = Number(t.budget || 0);
    bac += b;
    const planned = t.dur > 0
      ? Math.min(1, Math.max(0, (elapsed - r.es) / t.dur)) : (elapsed >= r.es ? 1 : 0);
    pv += b * planned;
    ev += b * Number(t.progress || 0) / 100;
    ac += Number(t.ac || 0);
  }
  return {
    pv, ev, ac, bac,
    spi: pv ? ev / pv : null,
    cpi: ac ? ev / ac : null,
    eac: ac && ev ? bac / (ev / ac) : null,
  };
}

/* ---------- 기타 ---------- */
// 전자계약 문서 지문용 FNV-1a 해시
export function fingerprint(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8).toUpperCase();
}

export function downloadText(name, text, mime = 'text/plain') {
  const blob = new Blob(['\ufeff' + text], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const toCSV = (rows) =>
  rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
