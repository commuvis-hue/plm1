// 3D 모델 로더: STL, OBJ는 직접 해석하고 STEP/IGES는 OpenCascade(occt-import-js, WebAssembly)로 변환한다.
// 결과 형식: [{ positions: Float32Array(삼각형 정점 xyz), normals: Float32Array, color: [r,g,b] }]

function flatNormals(pos) {
  const n = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 9) {
    const ux = pos[i + 3] - pos[i], uy = pos[i + 4] - pos[i + 1], uz = pos[i + 5] - pos[i + 2];
    const vx = pos[i + 6] - pos[i], vy = pos[i + 7] - pos[i + 1], vz = pos[i + 8] - pos[i + 2];
    let x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    const l = Math.hypot(x, y, z) || 1;
    x /= l; y /= l; z /= l;
    for (let k = 0; k < 9; k += 3) { n[i + k] = x; n[i + k + 1] = y; n[i + k + 2] = z; }
  }
  return n;
}

export function parseSTL(buf) {
  const v = new DataView(buf);
  const count = buf.byteLength >= 84 ? v.getUint32(80, true) : 0;
  if (buf.byteLength === 84 + count * 50 && count > 0) {
    const pos = new Float32Array(count * 9);
    for (let t = 0; t < count; t++) {
      const o = 84 + t * 50 + 12;
      for (let k = 0; k < 9; k++) pos[t * 9 + k] = v.getFloat32(o + k * 4, true);
    }
    return [{ positions: pos, normals: flatNormals(pos) }];
  }
  const text = new TextDecoder().decode(buf);
  const nums = [];
  const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
  let m;
  while ((m = re.exec(text))) nums.push(+m[1], +m[2], +m[3]);
  if (!nums.length) throw new Error('STL 파일에서 삼각형을 찾지 못했습니다');
  const pos = new Float32Array(nums.slice(0, nums.length - (nums.length % 9)));
  return [{ positions: pos, normals: flatNormals(pos) }];
}

export function parseOBJ(buf) {
  const text = new TextDecoder().decode(buf);
  const vs = [];
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.split(/\s+/);
      vs.push([+x, +y, +z]);
    } else if (line.startsWith('f ')) {
      const idx = line.split(/\s+/).slice(1).map((t) => {
        const i = parseInt(t.split('/')[0], 10);
        return i < 0 ? vs.length + i : i - 1;
      });
      for (let k = 1; k + 1 < idx.length; k++) {
        for (const j of [idx[0], idx[k], idx[k + 1]]) out.push(...(vs[j] || [0, 0, 0]));
      }
    }
  }
  if (!out.length) throw new Error('OBJ 파일에서 면을 찾지 못했습니다');
  const pos = new Float32Array(out);
  return [{ positions: pos, normals: flatNormals(pos) }];
}

// STEP/IGES 변환 엔진. public/occt/ 에 파일을 두면 그곳을 먼저 사용하고, 없으면 CDN에서 받는다.
const OCCT_SOURCES = ['/occt/', 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.22/dist/'];
let occtPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => { s.remove(); reject(new Error(src)); };
    document.head.appendChild(s);
  });
}

function loadOCCT() {
  if (occtPromise) return occtPromise;
  occtPromise = (async () => {
    for (const base of OCCT_SOURCES) {
      try {
        if (!window.occtimportjs) await loadScript(base + 'occt-import-js.js');
        return await window.occtimportjs({ locateFile: (f) => base + f });
      } catch {}
    }
    occtPromise = null;
    throw new Error('STEP 변환 엔진(occt-import-js)을 불러오지 못했습니다. 인터넷 연결을 확인하거나 README의 오프라인 설정을 따르세요');
  })();
  return occtPromise;
}

export async function parseCADKernel(buf, ext) {
  const occt = await loadOCCT();
  const bytes = new Uint8Array(buf);
  const res = ext === 'igs' || ext === 'iges' ? occt.ReadIgesFile(bytes, null) : occt.ReadStepFile(bytes, null);
  if (!res || !res.success) throw new Error('STEP/IGES 파일을 해석하지 못했습니다');
  return res.meshes.map((m) => {
    const p = m.attributes.position.array;
    const nrm = m.attributes.normal?.array;
    const idx = m.index.array;
    const pos = new Float32Array(idx.length * 3);
    const nor = new Float32Array(idx.length * 3);
    for (let i = 0; i < idx.length; i++) {
      for (let k = 0; k < 3; k++) {
        pos[i * 3 + k] = p[idx[i] * 3 + k];
        if (nrm) nor[i * 3 + k] = nrm[idx[i] * 3 + k];
      }
    }
    return { positions: pos, normals: nrm ? nor : flatNormals(pos), color: m.color };
  });
}

export function bounds(meshes) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let tris = 0;
  for (const m of meshes) {
    const p = m.positions;
    tris += p.length / 9;
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (p[i + k] < min[k]) min[k] = p[i + k];
        if (p[i + k] > max[k]) max[k] = p[i + k];
      }
    }
  }
  return { min, max, size: max.map((x, k) => x - min[k]), center: max.map((x, k) => (x + min[k]) / 2), tris };
}
