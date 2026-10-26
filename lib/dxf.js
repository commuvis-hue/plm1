// 경량 DXF 파서: 2D 도면 표시에 필요한 엔티티만 해석한다.
// 지원: LINE, CIRCLE, ARC, LWPOLYLINE(벌지 포함), POLYLINE/VERTEX, ELLIPSE, SPLINE(근사),
//       POINT, SOLID, TEXT, MTEXT, INSERT(블록), DIMENSION(익명 블록)

// AutoCAD 색상 인덱스(ACI) 중 자주 쓰는 값
const ACI = {
  1: '#ff4d4d', 2: '#ffe14d', 3: '#4dff6a', 4: '#4de1ff', 5: '#5b7cff', 6: '#ff4dff',
  7: '#f2f4f0', 8: '#8a9499', 9: '#c0c6c8', 30: '#ff9f40', 40: '#ffbf40', 140: '#40a0ff', 250: '#5e6a70', 251: '#7b868b',
};
export const aciColor = (n) => ACI[n] || ACI[7];

export function decodeDXF(buf) {
  const bytes = new Uint8Array(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch {}
  // 구버전 한글 AutoCAD 도면(ANSI_949)
  try { return new TextDecoder('euc-kr').decode(bytes); } catch {}
  return new TextDecoder('latin1').decode(bytes);
}

function pairs(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) out.push([parseInt(lines[i], 10), lines[i + 1]]);
  return out;
}

const cleanMText = (s) => s
  .replace(/\\P/gi, '\n')
  .replace(/\\[ACcFfHhQqTtWw][^;]*;/g, '')
  .replace(/\\[LlOoKk]/g, '')
  .replace(/\\S([^;]*);/g, (_, x) => x.replace(/[\^#]/, '/'))
  .replace(/[{}]/g, '')
  .replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±');
const cleanText = (s) => s.replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[uUoO]/g, '');

// 그룹 코드 목록을 엔티티 객체로 변환
function readEntity(type, codes) {
  const get = (c, d) => { const f = codes.find((x) => x[0] === c); return f ? f[1] : d; };
  const n = (c, d = 0) => parseFloat(get(c, d));
  const e = { type, layer: get(8, '0'), color: parseInt(get(62, 256), 10) };
  switch (type) {
    case 'LINE': Object.assign(e, { x1: n(10), y1: n(20), x2: n(11), y2: n(21) }); break;
    case 'CIRCLE': Object.assign(e, { x: n(10), y: n(20), r: n(40) }); break;
    case 'ARC': Object.assign(e, { x: n(10), y: n(20), r: n(40), a1: n(50), a2: n(51) }); break;
    case 'POINT': Object.assign(e, { x: n(10), y: n(20) }); break;
    case 'SOLID': Object.assign(e, { pts: [[n(10), n(20)], [n(11), n(21)], [n(13), n(23)], [n(12), n(22)]] }); break;
    case 'ELLIPSE': Object.assign(e, { x: n(10), y: n(20), mx: n(11), my: n(21), ratio: n(40, 1), t1: n(41, 0), t2: n(42, Math.PI * 2) }); break;
    case 'LWPOLYLINE': {
      const pts = [];
      for (const [c, v] of codes) {
        if (c === 10) pts.push({ x: parseFloat(v), y: 0, b: 0 });
        else if (c === 20 && pts.length) pts[pts.length - 1].y = parseFloat(v);
        else if (c === 42 && pts.length) pts[pts.length - 1].b = parseFloat(v);
      }
      Object.assign(e, { pts, closed: (parseInt(get(70, 0), 10) & 1) === 1 });
      break;
    }
    case 'SPLINE': {
      const fit = [], ctrl = [];
      for (const [c, v] of codes) {
        if (c === 11) fit.push([parseFloat(v), 0]); else if (c === 21 && fit.length) fit[fit.length - 1][1] = parseFloat(v);
        if (c === 10) ctrl.push([parseFloat(v), 0]); else if (c === 20 && ctrl.length) ctrl[ctrl.length - 1][1] = parseFloat(v);
      }
      e.pts = fit.length > 1 ? fit : ctrl;
      break;
    }
    case 'TEXT': case 'MTEXT': {
      let s = '';
      for (const [c, v] of codes) if (c === 3) s += v;
      s += get(1, '');
      const align = parseInt(get(72, 0), 10);
      const hasAlign = align && codes.some((x) => x[0] === 11);
      Object.assign(e, {
        x: hasAlign && type === 'TEXT' ? n(11) : n(10),
        y: hasAlign && type === 'TEXT' ? n(21) : n(20),
        h: n(40, 2.5), rot: n(50, 0),
        text: type === 'MTEXT' ? cleanMText(s) : cleanText(s),
        anchor: type === 'TEXT' ? (align === 1 || align === 4 ? 'middle' : align === 2 ? 'end' : 'start')
          : ({ 2: 'middle', 5: 'middle', 8: 'middle', 3: 'end', 6: 'end', 9: 'end' }[get(71, 1)] || 'start'),
        top: type === 'MTEXT' && [1, 2, 3].includes(parseInt(get(71, 1), 10)),
      });
      if (type === 'MTEXT' && codes.some((x) => x[0] === 11)) e.rot = Math.atan2(n(21), n(11)) * 180 / Math.PI;
      break;
    }
    case 'INSERT': case 'DIMENSION':
      Object.assign(e, { block: get(2, ''), x: type === 'INSERT' ? n(10) : 0, y: type === 'INSERT' ? n(20) : 0,
        sx: n(41, 1), sy: n(42, 1), rot: type === 'INSERT' ? n(50, 0) : 0 });
      break;
    default: return null;
  }
  return e;
}

export function parseDXF(text) {
  const p = pairs(text);
  const blocks = {};
  const entities = [];
  const layerInfo = {};
  let units = 0;
  let section = null;
  let i = 0;
  let curBlock = null;
  let polyline = null;

  const push = (e) => {
    if (!e) return;
    if (curBlock) curBlock.entities.push(e); else entities.push(e);
  };

  while (i < p.length) {
    const [c, v] = p[i];
    if (c === 0 && v === 'SECTION') { section = p[i + 1]?.[1]; i += 2; continue; }
    if (c === 0 && v === 'ENDSEC') { section = null; i++; continue; }
    if (section === 'HEADER' && c === 9 && v === '$INSUNITS') { units = parseInt(p[i + 1]?.[1], 10); i += 2; continue; }
    if (section === 'TABLES' && c === 0 && v === 'LAYER') {
      let j = i + 1;
      const codes = [];
      while (j < p.length && p[j][0] !== 0) codes.push(p[j++]);
      const name = (codes.find((x) => x[0] === 2) || [])[1];
      if (name) {
        layerInfo[name] = {
          color: Math.abs(parseInt((codes.find((x) => x[0] === 62) || [0, 7])[1], 10)),
          ltype: ((codes.find((x) => x[0] === 6) || [0, ''])[1] || '').toUpperCase(),
        };
      }
      i = j;
      continue;
    }
    if (c === 0 && (section === 'ENTITIES' || section === 'BLOCKS')) {
      // 다음 0 코드까지 모은다
      let j = i + 1;
      const codes = [];
      while (j < p.length && p[j][0] !== 0) codes.push(p[j++]);
      if (v === 'BLOCK') {
        const name = (codes.find((x) => x[0] === 2) || [])[1];
        const bx = parseFloat((codes.find((x) => x[0] === 10) || [0, 0])[1]);
        const by = parseFloat((codes.find((x) => x[0] === 20) || [0, 0])[1]);
        curBlock = { name, bx, by, entities: [] };
      } else if (v === 'ENDBLK') {
        if (curBlock) blocks[curBlock.name] = curBlock;
        curBlock = null;
      } else if (v === 'POLYLINE') {
        polyline = { type: 'LWPOLYLINE', layer: (codes.find((x) => x[0] === 8) || [0, '0'])[1],
          color: parseInt((codes.find((x) => x[0] === 62) || [0, 256])[1], 10),
          closed: (parseInt((codes.find((x) => x[0] === 70) || [0, 0])[1], 10) & 1) === 1, pts: [] };
      } else if (v === 'VERTEX' && polyline) {
        const g = (k, d = 0) => parseFloat((codes.find((x) => x[0] === k) || [0, d])[1]);
        polyline.pts.push({ x: g(10), y: g(20), b: g(42) });
      } else if (v === 'SEQEND' && polyline) {
        push(polyline); polyline = null;
      } else {
        push(readEntity(v, codes));
      }
      i = j;
      continue;
    }
    i++;
  }
  const layers = [...new Set(entities.map((e) => e.layer))].sort();
  const unitName = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' }[units] || '단위';
  return { entities, blocks, layers, layerInfo, units: unitName };
}
