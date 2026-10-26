// 샘플 데이터용 도면(DXF)과 3D 모델(STL)을 코드로 생성한다.

/* ---------- DXF ---------- */
function dxfWriter() {
  const out = [];
  const g = (code, v) => out.push(String(code), String(v));
  return { g, out };
}

function armDXF() {
  const { g, out } = dxfWriter();
  const line = (l, x1, y1, x2, y2) => { g(0, 'LINE'); g(8, l); g(10, x1); g(20, y1); g(11, x2); g(21, y2); };
  const circle = (l, x, y, r) => { g(0, 'CIRCLE'); g(8, l); g(10, x); g(20, y); g(40, r); };
  const text = (l, x, y, h, s, align = 0) => {
    g(0, 'TEXT'); g(8, l); g(10, x); g(20, y); g(40, h); g(1, s);
    if (align) { g(72, align); g(11, x); g(21, y); }
  };
  const rect = (l, x, y, w, h) => { line(l, x, y, x + w, y); line(l, x + w, y, x + w, y + h); line(l, x + w, y + h, x, y + h); line(l, x, y + h, x, y); };
  // 화살표가 있는 수평 치수
  const dimH = (x1, x2, y, yRef, label) => {
    line('DIM', x1, yRef, x1, y + 3); line('DIM', x2, yRef, x2, y + 3);
    line('DIM', x1, y, x2, y);
    for (const [x, d] of [[x1, 1], [x2, -1]]) {
      g(0, 'SOLID'); g(8, 'DIM'); g(10, x); g(20, y); g(11, x + 8 * d); g(21, y + 1.5); g(12, x + 8 * d); g(22, y - 1.5); g(13, x + 8 * d); g(23, y - 1.5);
    }
    text('DIM', (x1 + x2) / 2, y + 2.5, 5, label, 1);
  };

  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$INSUNITS'); g(70, 4); g(0, 'ENDSEC');

  g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER');
  for (const [name, color, lt] of [['0', 7, 'CONTINUOUS'], ['OUTLINE', 7, 'CONTINUOUS'], ['CENTER', 1, 'CENTER'],
    ['HIDDEN', 4, 'HIDDEN'], ['DIM', 3, 'CONTINUOUS'], ['TEXT', 2, 'CONTINUOUS'], ['BORDER', 8, 'CONTINUOUS']]) {
    g(0, 'LAYER'); g(2, name); g(70, 0); g(62, color); g(6, lt);
  }
  g(0, 'ENDTAB'); g(0, 'ENDSEC');

  // 블록: 구멍 중심 표시
  g(0, 'SECTION'); g(2, 'BLOCKS');
  g(0, 'BLOCK'); g(8, '0'); g(2, 'CENTERMARK'); g(70, 0); g(10, 0); g(20, 0);
  line('CENTER', -13, 0, 13, 0); line('CENTER', 0, -13, 0, 13);
  g(0, 'ENDBLK');
  g(0, 'ENDSEC');

  g(0, 'SECTION'); g(2, 'ENTITIES');
  // A2 도곽과 표제란
  rect('BORDER', 0, 0, 594, 420); rect('BORDER', 10, 10, 574, 400);
  rect('BORDER', 404, 10, 180, 56);
  line('BORDER', 404, 38, 584, 38); line('BORDER', 464, 10, 464, 66); line('BORDER', 524, 10, 524, 38);
  text('TEXT', 408, 56, 4, '품명'); text('TEXT', 470, 46, 9, '시저 암');
  text('TEXT', 408, 28, 3.5, '품번'); text('TEXT', 408, 15, 5, 'C-1103');
  text('TEXT', 468, 28, 3.5, '재질'); text('TEXT', 468, 15, 5, 'SS400');
  text('TEXT', 528, 28, 3.5, 'REV / 척도'); text('TEXT', 528, 15, 5, 'C   1:1');

  // 정면도: 길이 400, 폭 40, 양 끝 R20 (벌지가 있는 폴리라인)
  const ox = 97, oy = 240;
  g(0, 'LWPOLYLINE'); g(8, 'OUTLINE'); g(90, 4); g(70, 1);
  g(10, ox); g(20, oy - 20); g(10, ox + 360); g(20, oy - 20); g(42, 1);
  g(10, ox + 360); g(20, oy + 20); g(10, ox); g(20, oy + 20); g(42, 1);
  for (const x of [ox, ox + 180, ox + 360]) {
    circle('OUTLINE', x, oy, 8);
    g(0, 'INSERT'); g(8, 'CENTER'); g(2, 'CENTERMARK'); g(10, x); g(20, oy);
  }
  line('CENTER', ox - 30, oy, ox + 390, oy);
  // 경량화 슬롯 (원호 두 개 + 직선)
  for (const sx of [ox + 60, ox + 240]) {
    line('OUTLINE', sx, oy - 8, sx + 60, oy - 8); line('OUTLINE', sx, oy + 8, sx + 60, oy + 8);
    g(0, 'ARC'); g(8, 'OUTLINE'); g(10, sx); g(20, oy); g(40, 8); g(50, 90); g(51, 270);
    g(0, 'ARC'); g(8, 'OUTLINE'); g(10, sx + 60); g(20, oy); g(40, 8); g(50, 270); g(51, 90);
  }
  dimH(ox, ox + 360, oy + 48, oy + 8, '360');
  dimH(ox, ox + 180, oy + 34, oy + 8, '180');
  text('DIM', ox + 196, oy - 34, 5, '3-Ø16 관통');
  line('DIM', ox + 186, oy - 6, ox + 196, oy - 28);
  text('DIM', ox + 372, oy + 22, 5, 'R20');

  // 측면도: 두께 4.0
  const sy = 120;
  rect('OUTLINE', ox - 20, sy, 400, 4);
  line('HIDDEN', ox - 8, sy, ox - 8, sy + 4); line('HIDDEN', ox + 8, sy, ox + 8, sy + 4);
  dimH(ox - 20, ox + 380, sy - 24, sy, '400');
  text('DIM', ox + 386, sy - 1, 5, 't4.0');

  // 주석
  g(0, 'MTEXT'); g(8, 'TEXT'); g(10, 24); g(20, 60); g(40, 4.5);
  g(1, '주기\\P1. 지시없는 모서리 C0.5\\P2. 레이저 절단 후 버 제거\\P3. ECO-2026-007: 두께 3.2 → 4.0');
  g(0, 'ENDSEC'); g(0, 'EOF');
  return out.join('\n');
}

/* ---------- STL ---------- */
// 간단한 메시 빌더: 상자와 원기둥(Z축)을 조합한다
function meshBuilder() {
  const tris = [];
  const quad = (a, b, c, d) => { tris.push([a, b, c], [a, c, d]); };
  const box = (x, y, z, w, d, h) => {
    const p = (i, j, k) => [x + i * w, y + j * d, z + k * h];
    quad(p(0, 0, 0), p(0, 1, 0), p(1, 1, 0), p(1, 0, 0));
    quad(p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1));
    quad(p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1));
    quad(p(1, 1, 0), p(0, 1, 0), p(0, 1, 1), p(1, 1, 1));
    quad(p(0, 1, 0), p(0, 0, 0), p(0, 0, 1), p(0, 1, 1));
    quad(p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1));
  };
  const cyl = (cx, cy, z, r, h, n = 32) => {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
      const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
      quad([...p0, z], [...p1, z], [...p1, z + h], [...p0, z + h]);
      tris.push([[cx, cy, z + h], [...p0, z + h], [...p1, z + h]]);
      tris.push([[cx, cy, z], [...p1, z], [...p0, z]]);
    }
  };
  return { tris, box, cyl };
}

function toBinarySTL(tris) {
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const v = new DataView(buf);
  v.setUint32(80, tris.length, true);
  let o = 84;
  for (const [a, b, c] of tris) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const l = Math.hypot(...n) || 1;
    for (const x of [n[0] / l, n[1] / l, n[2] / l, ...a, ...b, ...c]) { v.setFloat32(o, x, true); o += 4; }
    o += 2;
  }
  return buf;
}

function armSTL() {
  const m = meshBuilder();
  m.box(0, -20, 0, 360, 40, 4);
  m.cyl(0, 0, 0, 20, 4); m.cyl(360, 0, 0, 20, 4);
  m.cyl(0, 0, 4, 9, 1.5, 24); m.cyl(180, 0, 4, 9, 1.5, 24); m.cyl(360, 0, 4, 9, 1.5, 24); // 부싱
  return toBinarySTL(m.tris);
}

function frameSTL() {
  const m = meshBuilder();
  const W = 800, D = 500, T = 50;
  m.box(0, 0, 0, W, T, T); m.box(0, D - T, 0, W, T, T);
  m.box(0, T, 0, T, D - 2 * T, T); m.box(W - T, T, 0, T, D - 2 * T, T);
  m.box(W / 2 - T / 2, T, 0, T, D - 2 * T, T);
  for (const [x, y] of [[T / 2, T / 2], [W - T / 2, T / 2], [T / 2, D - T / 2], [W - T / 2, D - T / 2]]) {
    m.cyl(x, y, -30, 18, 30); // 레벨링 풋
  }
  m.box(120, 180, T, 80, 140, 8); m.box(W - 200, 180, T, 80, 140, 8); // 힌지 브래킷
  return toBinarySTL(m.tris);
}

const SAMPLES = {
  'arm-dxf': () => new Blob([armDXF()], { type: 'application/dxf' }),
  'arm-stl': () => new Blob([armSTL()], { type: 'model/stl' }),
  'frame-stl': () => new Blob([frameSTL()], { type: 'model/stl' }),
};

export const sampleFile = (key) => (SAMPLES[key] ? SAMPLES[key]() : null);
