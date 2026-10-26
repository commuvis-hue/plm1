'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getFile } from '../lib/filestore';
import { parseDXF, decodeDXF, aciColor } from '../lib/dxf';
import { parseSTL, parseOBJ, parseCADKernel, bounds } from '../lib/mesh';
import { num } from '../lib/calc';

export const extOf = (name = '') => name.split('.').pop().toLowerCase();
const KIND = {
  dxf: '2d', stl: '3d', obj: '3d', step: '3d', stp: '3d', iges: '3d', igs: '3d',
  pdf: 'pdf', png: 'img', jpg: 'img', jpeg: 'img', gif: 'img', webp: 'img', svg: 'img',
  dwg: 'native', sldprt: 'native', sldasm: 'native', slddrw: 'native', ipt: 'native', iam: 'native',
  catpart: 'native', catproduct: 'native', prt: 'native', x_t: 'native', '3dm': 'native',
};
export const viewKind = (name) => KIND[extOf(name)] || 'other';
export const isViewable = (name) => ['2d', '3d', 'pdf', 'img'].includes(viewKind(name));

export default function CadViewer({ file, part, onClose }) {
  const [blob, setBlob] = useState(undefined);
  const [url, setUrl] = useState(null);
  const kind = viewKind(file.name);

  useEffect(() => {
    let live = true;
    getFile(file).then((b) => { if (live) setBlob(b); });
    return () => { live = false; };
  }, [file]);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  let body;
  if (kind === 'native') body = (
    <Message title={`${extOf(file.name).toUpperCase()} 파일은 브라우저에서 바로 열 수 없습니다`}>
      CAD 프로그램 고유 형식이라 공개된 해석 방법이 없습니다. 원본 CAD에서 2D 도면은 <b>DXF</b> 또는 <b>PDF</b>로,
      3D 모델은 <b>STEP</b>으로 내보내 같은 부품에 함께 등록하면 여기서 볼 수 있습니다.
      DWG를 일괄 변환하려면 무료 ODA File Converter를 쓸 수 있습니다.
    </Message>
  );
  else if (blob === undefined) body = <Message>파일을 여는 중입니다.</Message>;
  else if (blob === null) body = <Message title="파일 원본이 없습니다">이 항목은 파일 정보만 등록되어 있습니다. ‘파일 등록’에서 실제 파일을 올리면 여기서 볼 수 있습니다.</Message>;
  else if (kind === '2d') body = <Dxf2D blob={blob} />;
  else if (kind === '3d') body = <Model3D blob={blob} ext={extOf(file.name)} />;
  else if (kind === 'pdf') body = url && <iframe className="cv-frame" src={url} title={file.name} />;
  else if (kind === 'img') body = url && <div className="cv-img"><img src={url} alt={file.name} /></div>;
  else body = <Message title="미리보기를 지원하지 않는 형식입니다">파일을 내려받아 해당 프로그램에서 여세요.</Message>;

  return (
    <div className="cv-overlay" role="dialog" aria-modal="true" aria-label={`${file.name} 보기`}>
      <header className="cv-head">
        <div className="cv-title">
          <span className="mono">{part?.no}</span>
          <strong>{file.name}</strong>
          <span className="cv-rev">Rev {file.rev}</span>
        </div>
        <div className="row-actions">
          {url && <a className="btn dark" href={url} download={file.name}>내려받기</a>}
          <button className="btn dark" onClick={onClose}>닫기</button>
        </div>
      </header>
      <div className="cv-body">{body}</div>
    </div>
  );
}

function Message({ title, children }) {
  return <div className="cv-msg">{title && <strong>{title}</strong>}<p>{children}</p></div>;
}

/* =================== 2D: DXF =================== */
const DASH = { CENTER: '14 3 3 3', HIDDEN: '6 4', DASHED: '8 4', PHANTOM: '16 3 3 3 3 3', DOT: '1 3' };

function Dxf2D({ blob }) {
  const [doc, setDoc] = useState(null);
  const [err, setErr] = useState(null);
  const [hidden, setHidden] = useState({});
  const [vb, setVb] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [measure, setMeasure] = useState(false);
  const [pts, setPts] = useState([]);
  const svgRef = useRef();
  const contentRef = useRef();
  const drag = useRef(null);

  useEffect(() => {
    blob.arrayBuffer().then((b) => {
      try {
        const d = parseDXF(decodeDXF(b));
        if (!d.entities.length) throw new Error('도면에서 표시할 요소를 찾지 못했습니다');
        setDoc(d);
      } catch (e) { setErr(e.message); }
    });
  }, [blob]);

  const fit = useCallback(() => {
    const c = contentRef.current;
    if (!c) return;
    const b = c.getBBox();
    const m = Math.max(b.width, b.height) * 0.04 || 1;
    setVb({ x: b.x - m, y: -(b.y + b.height) - m, w: b.width + 2 * m, h: b.height + 2 * m });
  }, []);
  useLayoutEffect(() => { if (doc) fit(); }, [doc, fit]);

  const toWorld = (e) => {
    const p = svgRef.current.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const w = p.matrixTransform(contentRef.current.getScreenCTM().inverse());
    return { x: w.x, y: w.y };
  };
  const toUser = (e) => {
    const p = svgRef.current.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(svgRef.current.getScreenCTM().inverse());
  };

  const onWheel = (e) => {
    if (!vb) return;
    const k = Math.exp(e.deltaY * 0.0015);
    const p = toUser(e);
    setVb({ x: p.x - (p.x - vb.x) * k, y: p.y - (p.y - vb.y) * k, w: vb.w * k, h: vb.h * k });
  };
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const stop = (e) => e.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, [doc]);

  const onDown = (e) => {
    if (measure && e.button === 0) return;
    const r = svgRef.current.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, vb, s: Math.max(vb.w / r.width, vb.h / r.height) };
    svgRef.current.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    setCursor(toWorld(e));
    const d = drag.current;
    if (!d) return;
    setVb({ ...d.vb, x: d.vb.x - (e.clientX - d.x) * d.s, y: d.vb.y - (e.clientY - d.y) * d.s });
  };
  const onUp = () => { drag.current = null; };
  // 측정 시 가까운 끝점·중심점에 맞춤
  const snaps = useMemo(() => {
    if (!doc) return [];
    const out = [];
    for (const e of doc.entities) {
      if (e.type === 'LINE') out.push([e.x1, e.y1], [e.x2, e.y2], [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2]);
      else if (e.type === 'CIRCLE' || e.type === 'ARC') out.push([e.x, e.y]);
      else if (e.type === 'LWPOLYLINE') e.pts.forEach((p) => out.push([p.x, p.y]));
      else if (e.type === 'INSERT' || e.type === 'POINT') out.push([e.x, e.y]);
    }
    if (doc.entities.some((e) => e.type === 'ARC')) {
      for (const e of doc.entities) {
        if (e.type !== 'ARC') continue;
        for (const a of [e.a1, e.a2]) out.push([e.x + e.r * Math.cos(a * Math.PI / 180), e.y + e.r * Math.sin(a * Math.PI / 180)]);
      }
    }
    return out;
  }, [doc]);

  const onClick = (e) => {
    if (!measure) return;
    let w = toWorld(e);
    const tol = (vb.w / svgRef.current.clientWidth) * 10;
    let best = null, bd = tol;
    for (const [x, y] of snaps) {
      const d = Math.hypot(x - w.x, y - w.y);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (best) w = best;
    setPts((p) => (p.length >= 2 ? [w] : [...p, w]));
  };

  const content = useMemo(() => {
    if (!doc) return null;
    const style = (e, parentLayer, parentColor) => {
      const layer = e.layer === '0' && parentLayer ? parentLayer : e.layer;
      const info = doc.layerInfo[layer] || {};
      let c = e.color;
      if (c === 0) c = parentColor ?? 7;
      if (c === 256 || isNaN(c)) c = info.color ?? 7;
      const dash = Object.entries(DASH).find(([k]) => (info.ltype || '').includes(k));
      return { layer, color: aciColor(c), dash: dash?.[1], aci: c };
    };
    const render = (list, parentLayer, parentColor, depth, keyBase) => list.map((e, i) => {
      const st = style(e, parentLayer, parentColor);
      if (hidden[st.layer]) return null;
      const key = keyBase + i;
      const sp = { stroke: st.color, strokeDasharray: st.dash, fill: 'none', vectorEffect: 'non-scaling-stroke' };
      switch (e.type) {
        case 'LINE': return <line key={key} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} {...sp} />;
        case 'CIRCLE': return <circle key={key} cx={e.x} cy={e.y} r={e.r} {...sp} />;
        case 'ARC': {
          const a1 = e.a1 * Math.PI / 180, a2 = e.a2 * Math.PI / 180;
          const sweep = ((e.a2 - e.a1) % 360 + 360) % 360 || 360;
          const d = `M${e.x + e.r * Math.cos(a1)} ${e.y + e.r * Math.sin(a1)} A${e.r} ${e.r} 0 ${sweep > 180 ? 1 : 0} 1 ${e.x + e.r * Math.cos(a2)} ${e.y + e.r * Math.sin(a2)}`;
          return <path key={key} d={d} {...sp} />;
        }
        case 'LWPOLYLINE': {
          if (!e.pts.length) return null;
          let d = `M${e.pts[0].x} ${e.pts[0].y}`;
          const n = e.pts.length;
          const segs = e.closed ? n : n - 1;
          for (let k = 0; k < segs; k++) {
            const a = e.pts[k], b = e.pts[(k + 1) % n];
            if (a.b) {
              const ang = 4 * Math.atan(Math.abs(a.b));
              const chord = Math.hypot(b.x - a.x, b.y - a.y);
              const r = chord / (2 * Math.sin(ang / 2));
              d += ` A${r} ${r} 0 ${ang > Math.PI ? 1 : 0} ${a.b > 0 ? 1 : 0} ${b.x} ${b.y}`;
            } else d += ` L${b.x} ${b.y}`;
          }
          if (e.closed) d += ' Z';
          return <path key={key} d={d} {...sp} />;
        }
        case 'ELLIPSE': {
          const R = Math.hypot(e.mx, e.my), rot = Math.atan2(e.my, e.mx);
          const steps = 72, t2 = e.t2 < e.t1 ? e.t2 + Math.PI * 2 : e.t2;
          const p = [];
          for (let k = 0; k <= steps; k++) {
            const t = e.t1 + (t2 - e.t1) * k / steps;
            const x = R * Math.cos(t), y = R * e.ratio * Math.sin(t);
            p.push(`${e.x + x * Math.cos(rot) - y * Math.sin(rot)},${e.y + x * Math.sin(rot) + y * Math.cos(rot)}`);
          }
          return <polyline key={key} points={p.join(' ')} {...sp} />;
        }
        case 'SPLINE': return e.pts.length > 1 && <polyline key={key} points={e.pts.map((p) => p.join(',')).join(' ')} {...sp} />;
        case 'SOLID': return <polygon key={key} points={e.pts.map((p) => p.join(',')).join(' ')} fill={st.color} stroke="none" />;
        case 'POINT': return <circle key={key} cx={e.x} cy={e.y} r={0.5} fill={st.color} />;
        case 'TEXT': case 'MTEXT': {
          const fs = e.h * 1.35;
          const lines = e.text.split('\n');
          return (
            <text key={key} transform={`translate(${e.x} ${e.y}) rotate(${e.rot}) scale(1 -1)`} fontSize={fs}
              fill={st.color} textAnchor={e.anchor} dominantBaseline={e.top ? 'hanging' : 'alphabetic'} className="cv-text">
              {lines.map((l, k) => <tspan key={k} x="0" dy={k ? fs * 1.25 : 0}>{l || ' '}</tspan>)}
            </text>
          );
        }
        case 'INSERT': case 'DIMENSION': {
          const b = doc.blocks[e.block];
          if (!b || depth > 8) return null;
          return (
            <g key={key} transform={`translate(${e.x} ${e.y}) rotate(${e.rot}) scale(${e.sx} ${e.sy}) translate(${-b.bx} ${-b.by})`}>
              {render(b.entities, st.layer, st.aci, depth + 1, key + '-')}
            </g>
          );
        }
        default: return null;
      }
    });
    return render(doc.entities, null, null, 0, 'e');
  }, [doc, hidden]);

  if (err) return <Message title="도면을 열 수 없습니다">{err}</Message>;
  if (!doc) return <Message>도면을 해석하는 중입니다.</Message>;

  const dist = pts.length === 2 ? Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) : null;
  const zoomBy = (k) => vb && setVb({ x: vb.x + vb.w * (1 - k) / 2, y: vb.y + vb.h * (1 - k) / 2, w: vb.w * k, h: vb.h * k });

  return (
    <div className="cv-work">
      <div className="cv-stage">
        <svg ref={svgRef} className={'cv-svg' + (measure ? ' measuring' : '')}
          viewBox={vb ? `${vb.x} ${vb.y} ${vb.w} ${vb.h}` : '0 0 100 100'}
          onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
          onPointerLeave={() => setCursor(null)} onClick={onClick}>
          <g transform="scale(1 -1)">
            <g ref={contentRef}>{content}</g>
            {pts.length > 0 && (
              <g className="cv-measure">
                {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={vb ? vb.w / 300 : 1} />)}
                {pts.length === 2 && <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} vectorEffect="non-scaling-stroke" />}
              </g>
            )}
          </g>
        </svg>
        <div className="cv-tools" role="toolbar" aria-label="도면 도구">
          <button className="btn dark" onClick={fit}>전체 보기</button>
          <button className="btn dark" onClick={() => zoomBy(0.7)} aria-label="확대">+</button>
          <button className="btn dark" onClick={() => zoomBy(1 / 0.7)} aria-label="축소">−</button>
          <button className={'btn dark' + (measure ? ' on' : '')} aria-pressed={measure}
            onClick={() => { setMeasure(!measure); setPts([]); }}>거리 측정</button>
        </div>
        <div className="cv-status">
          {measure && <span className="cv-hint">{pts.length < 2 ? `측정할 ${pts.length ? '끝점' : '시작점'}을 클릭하세요` : `거리 ${num(dist, 2)} ${doc.units}  (ΔX ${num(Math.abs(pts[1].x - pts[0].x), 2)}, ΔY ${num(Math.abs(pts[1].y - pts[0].y), 2)})`}</span>}
          <span className="mono">{cursor ? `X ${num(cursor.x, 2)}  Y ${num(cursor.y, 2)}` : '휠로 확대·축소, 드래그로 이동'}</span>
        </div>
      </div>
      <aside className="cv-side">
        <h3>레이어</h3>
        <ul className="cv-layers">
          {doc.layers.map((l) => {
            const c = aciColor(doc.layerInfo[l]?.color ?? 7);
            return (
              <li key={l}>
                <label>
                  <input type="checkbox" checked={!hidden[l]} onChange={() => setHidden({ ...hidden, [l]: !hidden[l] })} />
                  <i style={{ background: c }} />{l}
                </label>
              </li>
            );
          })}
        </ul>
        <dl className="cv-info">
          <div><dt>요소</dt><dd>{num(doc.entities.length)}</dd></div>
          <div><dt>블록</dt><dd>{num(Object.keys(doc.blocks).length)}</dd></div>
          <div><dt>단위</dt><dd>{doc.units}</dd></div>
        </dl>
      </aside>
    </div>
  );
}

/* =================== 3D: WebGL =================== */
const m4 = {
  persp(f, a, n, fr) { const t = 1 / Math.tan(f / 2); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fr + n) / (n - fr), -1, 0, 0, 2 * fr * n / (n - fr), 0]; },
  look(e, c, u) {
    const sub = (a, b) => a.map((x, i) => x - b[i]);
    const nrm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
    const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const z = nrm(sub(e, c)), x = nrm(crs(u, z)), y = crs(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
  },
  mul(a, b) {
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    return o;
  },
};

const VS = `attribute vec3 p; attribute vec3 n; uniform mat4 mvp; uniform mat4 mv; varying vec3 vn;
void main(){ vn = (mv * vec4(n, 0.0)).xyz; gl_Position = mvp * vec4(p, 1.0); }`;
const FS = `precision mediump float; varying vec3 vn; uniform vec3 col;
void main(){ vec3 N = normalize(vn); float l = abs(dot(N, normalize(vec3(0.35, 0.45, 1.0))));
  float rim = pow(1.0 - abs(N.z), 3.0) * 0.12; gl_FragColor = vec4(col * (0.32 + 0.68 * l) + rim, 1.0); }`;
const LVS = `attribute vec3 p; uniform mat4 mvp; void main(){ gl_Position = mvp * vec4(p, 1.0); }`;
const LFS = `precision mediump float; uniform vec3 col; void main(){ gl_FragColor = vec4(col, 1.0); }`;

function program(gl, vs, fs) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const pr = gl.createProgram();
  gl.attachShader(pr, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(pr);
  return pr;
}

// 인접 면의 각도가 큰 모서리와 경계 모서리만 추출 (CAD처럼 외곽선 표시)
function featureEdges(pos, nor, limit = 400000) {
  if (pos.length / 9 > limit) return new Float32Array(0);
  const key = (i) => `${Math.round(pos[i] * 1000)},${Math.round(pos[i + 1] * 1000)},${Math.round(pos[i + 2] * 1000)}`;
  const map = new Map();
  for (let t = 0; t < pos.length; t += 9) {
    const ks = [key(t), key(t + 3), key(t + 6)];
    for (let e = 0; e < 3; e++) {
      const a = ks[e], b = ks[(e + 1) % 3];
      if (a === b) continue;
      const k = a < b ? a + '|' + b : b + '|' + a;
      const ent = map.get(k);
      if (ent) ent.n2 = t; else map.set(k, { i: t + e * 3, j: t + ((e + 1) % 3) * 3, n1: t, n2: -1 });
    }
  }
  const out = [];
  const cos = Math.cos(30 * Math.PI / 180);
  for (const ent of map.values()) {
    let sharp = ent.n2 < 0;
    if (!sharp) {
      const d = nor[ent.n1] * nor[ent.n2] + nor[ent.n1 + 1] * nor[ent.n2 + 1] + nor[ent.n1 + 2] * nor[ent.n2 + 2];
      sharp = Math.abs(d) < cos;
    }
    if (sharp) out.push(pos[ent.i], pos[ent.i + 1], pos[ent.i + 2], pos[ent.j], pos[ent.j + 1], pos[ent.j + 2]);
  }
  return new Float32Array(out);
}

const VIEWS = { '정면': [0, 0], '윗면': [0, 89.5], '우측면': [90, 0], '등각': [-35, 28] };

function Model3D({ blob, ext }) {
  const canvasRef = useRef();
  const glRef = useRef(null);
  const cam = useRef({ yaw: -35, pitch: 28, dist: 1, target: [0, 0, 0] });
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);
  const [mode, setMode] = useState('edges');
  const [loading, setLoading] = useState(ext === 'step' || ext === 'stp' || ext === 'iges' || ext === 'igs' ? 'STEP 변환 엔진을 불러오는 중입니다 (처음 한 번, 수 MB)' : '모델을 읽는 중입니다');
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const draw = useCallback(() => {
    const g = glRef.current;
    if (!g) return;
    const { gl, meshes, prog, lprog, radius } = g;
    const c = cam.current;
    const cv = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(cv.clientWidth * dpr), h = Math.floor(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.075, 0.11, 0.13, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const y = c.yaw * Math.PI / 180, p = c.pitch * Math.PI / 180;
    const eye = [c.target[0] + c.dist * Math.cos(p) * Math.sin(y), c.target[1] - c.dist * Math.cos(p) * Math.cos(y), c.target[2] + c.dist * Math.sin(p)];
    const view = m4.look(eye, c.target, [0, 0, 1]);
    const proj = m4.persp(35 * Math.PI / 180, w / h || 1, Math.max(c.dist - radius * 2, c.dist * 0.01), c.dist + radius * 4);
    const mvp = m4.mul(proj, view);
    const m = modeRef.current;
    gl.enable(gl.DEPTH_TEST);
    if (m !== 'wire') {
      gl.useProgram(prog);
      gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'mvp'), false, mvp);
      gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'mv'), false, view);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      const lp = gl.getAttribLocation(prog, 'p'), ln = gl.getAttribLocation(prog, 'n');
      for (const mesh of meshes) {
        gl.uniform3fv(gl.getUniformLocation(prog, 'col'), mesh.color);
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pb); gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nb); gl.enableVertexAttribArray(ln); gl.vertexAttribPointer(ln, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
      }
      gl.disableVertexAttribArray(ln);
    }
    if (m !== 'shade') {
      gl.useProgram(lprog);
      gl.uniformMatrix4fv(gl.getUniformLocation(lprog, 'mvp'), false, mvp);
      gl.uniform3fv(gl.getUniformLocation(lprog, 'col'), m === 'wire' ? [0.6, 0.82, 0.9] : [0.08, 0.13, 0.16]);
      const lp = gl.getAttribLocation(lprog, 'p');
      for (const mesh of meshes) {
        const buf = m === 'wire' ? mesh.wb() : mesh.eb;
        if (!buf.count) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.b); gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, buf.count);
      }
    }
  }, []);

  const raf = useRef(0);
  const redraw = useCallback(() => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(draw); }, [draw]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const buf = await blob.arrayBuffer();
        const meshes = ext === 'stl' ? parseSTL(buf) : ext === 'obj' ? parseOBJ(buf) : await parseCADKernel(buf, ext);
        if (!alive) return;
        setLoading('형상을 준비하는 중입니다');
        const bb = bounds(meshes);
        const gl = canvasRef.current.getContext('webgl', { antialias: true });
        if (!gl) throw new Error('이 브라우저는 WebGL을 지원하지 않아 3D 모델을 표시할 수 없습니다');
        const prog = program(gl, VS, FS), lprog = program(gl, LVS, LFS);
        const mk = (arr) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); return b; };
        const glMeshes = meshes.map((m) => {
          const pos = new Float32Array(m.positions.length);
          for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) pos[i + k] = m.positions[i + k] - bb.center[k];
          const edges = featureEdges(pos, m.normals);
          let wire = null;
          return {
            pb: mk(pos), nb: mk(m.normals), count: pos.length / 3,
            color: m.color && m.color.length === 3 ? m.color : [0.62, 0.7, 0.74],
            eb: { b: mk(edges), count: edges.length / 3 },
            wb: () => {
              if (wire) return wire;
              const out = new Float32Array(pos.length * 2);
              for (let t = 0, o = 0; t < pos.length; t += 9) {
                for (const [a, b] of [[0, 3], [3, 6], [6, 0]]) {
                  for (let k = 0; k < 3; k++) out[o + k] = pos[t + a + k];
                  for (let k = 0; k < 3; k++) out[o + 3 + k] = pos[t + b + k];
                  o += 6;
                }
              }
              wire = { b: mk(out), count: out.length / 3 };
              return wire;
            },
          };
        });
        const radius = Math.hypot(...bb.size) / 2 || 1;
        glRef.current = { gl, meshes: glMeshes, prog, lprog, radius };
        cam.current = { yaw: -35, pitch: 28, dist: radius * 3.4, target: [0, 0, 0], home: radius * 3.4 };
        setInfo(bb);
        setLoading(null);
        redraw();
      } catch (e) { if (alive) { setErr(e.message); setLoading(null); } }
    })();
    return () => { alive = false; cancelAnimationFrame(raf.current); };
  }, [blob, ext, redraw]);

  useEffect(() => { redraw(); }, [mode, redraw]);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ro = new ResizeObserver(redraw);
    ro.observe(cv);
    const wheel = (e) => {
      e.preventDefault();
      cam.current.dist *= Math.exp(e.deltaY * 0.0012);
      redraw();
    };
    cv.addEventListener('wheel', wheel, { passive: false });
    return () => { ro.disconnect(); cv.removeEventListener('wheel', wheel); };
  }, [redraw]);

  const drag = useRef(null);
  const onDown = (e) => {
    drag.current = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
    canvasRef.current.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.x = e.clientX; d.y = e.clientY;
    const c = cam.current;
    if (d.pan) {
      const y = c.yaw * Math.PI / 180, p = c.pitch * Math.PI / 180;
      const right = [Math.cos(y), Math.sin(y), 0];
      const up = [-Math.sin(p) * Math.sin(y), Math.sin(p) * Math.cos(y), Math.cos(p)];
      const s = c.dist * 0.0016;
      c.target = c.target.map((v, k) => v - right[k] * dx * s + up[k] * dy * s);
    } else {
      c.yaw -= dx * 0.4;
      c.pitch = Math.max(-89.5, Math.min(89.5, c.pitch + dy * 0.4));
    }
    redraw();
  };
  const setView = ([yaw, pitch]) => {
    Object.assign(cam.current, { yaw, pitch, target: [0, 0, 0], dist: cam.current.home });
    redraw();
  };

  return (
    <div className="cv-work">
      <div className="cv-stage">
        <canvas ref={canvasRef} className="cv-canvas" onPointerDown={onDown} onPointerMove={onMove}
          onPointerUp={() => { drag.current = null; }} onContextMenu={(e) => e.preventDefault()} aria-label="3D 모델" />
        {loading && <div className="cv-loading">{loading}</div>}
        {err && <Message title="모델을 열 수 없습니다">{err}</Message>}
        {!err && (
          <>
            <div className="cv-tools" role="toolbar" aria-label="3D 도구">
              {Object.entries(VIEWS).map(([k, v]) => <button key={k} className="btn dark" onClick={() => setView(v)}>{k}</button>)}
            </div>
            <div className="cv-status">
              <span>드래그 회전, Shift·오른쪽 드래그 이동, 휠 확대·축소</span>
            </div>
          </>
        )}
      </div>
      <aside className="cv-side">
        <h3>표시</h3>
        <div className="cv-seg" role="radiogroup" aria-label="표시 방식">
          {[['edges', '음영 + 모서리'], ['shade', '음영'], ['wire', '와이어']].map(([k, l]) => (
            <button key={k} role="radio" aria-checked={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>
          ))}
        </div>
        {info && (
          <dl className="cv-info">
            <div><dt>크기 X</dt><dd>{num(info.size[0], 1)}</dd></div>
            <div><dt>크기 Y</dt><dd>{num(info.size[1], 1)}</dd></div>
            <div><dt>크기 Z</dt><dd>{num(info.size[2], 1)}</dd></div>
            <div><dt>삼각형</dt><dd>{num(info.tris)}</dd></div>
          </dl>
        )}
        <p className="cv-note">STL·OBJ에는 단위 정보가 없어 보통 mm로 간주합니다.</p>
      </aside>
    </div>
  );
}
