import { materialRollup, quote } from './calc';

const P = (id, no, name, type, extra = {}) => ({
  id, no, name, type, rev: 'A', status: '승인', material: '', weight: 0,
  unitPrice: 0, supplier: '', spec: '', unit: 'EA', owner: '김설계',
  files: [], history: [{ rev: 'A', date: '2026-03-02', note: '최초 등록' }],
  ...extra,
});

const parts = [
  P('p1000', 'P-1000', '전동 리프트 테이블 LT-500', '제품', { spec: '최대 하중 500kg, 승강 250~900mm', owner: '박팀장' }),
  P('a1100', 'A-1100', '프레임 조립', '조립'),
  P('a1200', 'A-1200', '구동 유닛 조립', '조립'),
  P('c1101', 'C-1101', '베이스 프레임', '부품', { material: 'SS400', weight: 12, spec: '□50×50×2.3t 각관 용접' }),
  P('c1102', 'C-1102', '상판', '부품', { material: 'AL6061', weight: 4.5, spec: '800×500×8t' }),
  P('c1103', 'C-1103', '시저 암', '부품', { material: 'SS400', weight: 3.2, spec: '3.2t 레이저 절단', rev: 'B',
    history: [{ rev: 'A', date: '2026-03-02', note: '최초 등록' }, { rev: 'B', date: '2026-06-18', note: 'ECO-2026-003 홀 위치 수정' }] }),
  P('c1201', 'C-1201', 'BLDC 모터 24V 200W', '부품', { unitPrice: 85000, supplier: '한빛모터' }),
  P('c1202', 'C-1202', '감속기 1:30', '부품', { unitPrice: 62000, supplier: '대성기어' }),
  P('c1203', 'C-1203', '리드 스크류 Ø16', '부품', { material: 'SUS304', weight: 1.1, spec: 'Tr16×4, L=420' }),
  P('c1204', 'C-1204', '모터 브래킷', '부품', { material: 'SPCC', weight: 0.6, spec: '2.0t 절곡' }),
  P('c1301', 'C-1301', '제어 PCB', '부품', { unitPrice: 41000, supplier: '세진전자' }),
  P('c1302', 'C-1302', '와이어 하네스', '부품', { unitPrice: 8500, supplier: '세진전자' }),
  P('c1401', 'C-1401', '육각 볼트 M8×25', '부품', { unitPrice: 120, supplier: '동아볼트', spec: 'KS B 1002, 8.8' }),
  P('c1402', 'C-1402', '포장 박스', '부품', { unitPrice: 3500, supplier: '그린패키징' }),
  P('c1501', 'C-1501', '사용자 매뉴얼', '부품', { unitPrice: 900, supplier: '사내 인쇄' }),
];

parts[0].files = [
  { id: 'f1', kind: '도면', name: 'P-1000_GA.dwg', rev: 'A', date: '2026-03-02', author: '박팀장' },
  { id: 'f2', kind: '문서', name: 'LT-500 제품 사양서.pdf', rev: 'A', date: '2026-03-05', author: '박팀장' },
];
parts[5].files = [
  { id: 'f3', kind: '도면', name: 'C-1103_시저암.dxf', rev: 'B', date: '2026-06-18', author: '김설계', sample: 'arm-dxf' },
  { id: 'f4', kind: '3D 모델', name: 'C-1103_시저암.stl', rev: 'B', date: '2026-06-18', author: '김설계', sample: 'arm-stl' },
  { id: 'f6', kind: '도면', name: 'C-1103_시저암.dwg', rev: 'B', date: '2026-06-18', author: '김설계' },
];
parts[3].files = [
  { id: 'f5', kind: '3D 모델', name: 'C-1101_베이스.stl', rev: 'A', date: '2026-03-02', author: '김설계', sample: 'frame-stl' },
];

let n = 0;
const L = (type, parent, child, qty) => ({ id: 'l' + ++n, type, parent, child, qty });

const lines = [
  // E-BOM (설계 기준)
  L('E', 'p1000', 'a1100', 1), L('E', 'p1000', 'a1200', 1),
  L('E', 'p1000', 'c1301', 1), L('E', 'p1000', 'c1302', 1),
  L('E', 'a1100', 'c1101', 1), L('E', 'a1100', 'c1102', 1),
  L('E', 'a1100', 'c1103', 4), L('E', 'a1100', 'c1401', 16),
  L('E', 'a1200', 'c1201', 1), L('E', 'a1200', 'c1202', 1),
  L('E', 'a1200', 'c1203', 1), L('E', 'a1200', 'c1204', 2),
  L('E', 'a1200', 'c1401', 4),
  // M-BOM (생산 기준: 포장·매뉴얼 추가, 볼트 여유분)
  L('M', 'p1000', 'a1100', 1), L('M', 'p1000', 'a1200', 1),
  L('M', 'p1000', 'c1301', 1), L('M', 'p1000', 'c1302', 1),
  L('M', 'p1000', 'c1402', 1), L('M', 'p1000', 'c1501', 1),
  L('M', 'a1100', 'c1101', 1), L('M', 'a1100', 'c1102', 1),
  L('M', 'a1100', 'c1103', 4), L('M', 'a1100', 'c1401', 18),
  L('M', 'a1200', 'c1201', 1), L('M', 'a1200', 'c1202', 1),
  L('M', 'a1200', 'c1203', 1), L('M', 'a1200', 'c1204', 2),
  L('M', 'a1200', 'c1401', 4),
  // S-BOM (서비스 교체 부품)
  L('S', 'p1000', 'c1201', 1), L('S', 'p1000', 'c1301', 1),
  L('S', 'p1000', 'c1302', 2), L('S', 'p1000', 'c1501', 1),
];

const materials = [
  { id: 'm1', code: 'SS400', name: '일반구조용 압연강', price: 1080,
    history: [{ date: '2026-04-01', price: 1020 }, { date: '2026-10-01', price: 1080 }] },
  { id: 'm2', code: 'AL6061', name: '알루미늄 합금 판재', price: 5200,
    history: [{ date: '2026-04-01', price: 4800 }, { date: '2026-10-01', price: 5200 }] },
  { id: 'm3', code: 'SUS304', name: '스테인리스 봉재', price: 4350,
    history: [{ date: '2026-04-01', price: 4350 }] },
  { id: 'm4', code: 'SPCC', name: '냉간압연 강판', price: 1150,
    history: [{ date: '2026-04-01', price: 1100 }, { date: '2026-10-01', price: 1150 }] },
];

const ecos = [
  { id: 'e1', no: 'ECO-2026-007', title: '시저 암 두께 3.2t → 4.0t 상향', reason: '신뢰성 시험 중 최대 하중 시 처짐 2.1mm 발생, 허용치 1.5mm 초과', parts: ['c1103'], status: '검토', requester: '이시험', date: '2026-10-14',
    log: [{ date: '2026-10-14', who: '이시험', what: '변경 요청 등록' }, { date: '2026-10-16', who: '박팀장', what: '검토 시작' }] },
  { id: 'e2', no: 'ECR-2026-008', title: '제어 PCB 커넥터 Molex → JST 변경', reason: 'Molex 커넥터 납기 12주로 장기화', parts: ['c1301', 'c1302'], status: '요청', requester: '최회로', date: '2026-10-21',
    log: [{ date: '2026-10-21', who: '최회로', what: '변경 요청 등록' }] },
  { id: 'e3', no: 'ECO-2026-003', title: '시저 암 힌지 홀 위치 수정', reason: '조립 간섭', parts: ['c1103'], status: '적용', requester: '김설계', date: '2026-06-10',
    log: [{ date: '2026-06-10', who: '김설계', what: '변경 요청 등록' }, { date: '2026-06-18', who: '박팀장', what: '적용 완료, C-1103 Rev B' }] },
];

const projects = [
  { id: 'pj1', name: 'LT-500 2세대 개발', product: 'p1000', pm: '박팀장', start: '2026-09-01',
    tasks: [
      { id: 't1', wbs: '1.1', name: '요구사항 정의', dur: 5, deps: [], progress: 100, owner: '박팀장', budget: 4000000, ac: 3800000 },
      { id: 't2', wbs: '1.2', name: '사양 확정', dur: 3, deps: ['t1'], progress: 100, owner: '박팀장', budget: 2000000, ac: 2100000 },
      { id: 't3', wbs: '2.1', name: '기구 설계', dur: 15, deps: ['t2'], progress: 100, owner: '김설계', budget: 18000000, ac: 19500000 },
      { id: 't4', wbs: '2.2', name: '회로 설계', dur: 12, deps: ['t2'], progress: 90, owner: '최회로', budget: 12000000, ac: 11000000 },
      { id: 't5', wbs: '2.3', name: '도면 출도', dur: 4, deps: ['t3'], progress: 100, owner: '김설계', budget: 3000000, ac: 3000000 },
      { id: 't6', wbs: '3.1', name: '시작품 제작', dur: 10, deps: ['t5', 't4'], progress: 100, owner: '정생산', budget: 25000000, ac: 27000000 },
      { id: 't7', wbs: '3.2', name: '신뢰성 시험', dur: 12, deps: ['t6'], progress: 55, owner: '이시험', budget: 9000000, ac: 5600000 },
      { id: 't8', wbs: '4.1', name: '금형·지그 제작', dur: 30, deps: ['t5'], progress: 60, owner: '정생산', budget: 40000000, ac: 22000000 },
      { id: 't9', wbs: '4.2', name: '양산 이관', dur: 7, deps: ['t7', 't8'], progress: 0, owner: '정생산', budget: 6000000, ac: 0 },
    ] },
];

const costModels = {
  p1000: {
    bomType: 'M',
    processes: [
      { name: '절단', hours: 0.3, rate: 32000, yield: 99.0 },
      { name: '용접', hours: 0.8, rate: 38000, yield: 98.0 },
      { name: '도장', hours: 0.4, rate: 30000, yield: 97.5 },
      { name: '조립', hours: 1.2, rate: 30000, yield: 99.5 },
      { name: '검사', hours: 0.3, rate: 34000, yield: 99.8 },
    ],
    equipCost: 120000000, lifeQty: 20000, overheadPct: 12, profitPct: 8,
    quotes: [],
  },
};

// 4월 공시단가 기준의 확정 견적을 기준선으로 둔다 (사후원가 비교용)
const aprilMaterials = materials.map((m) => ({ ...m, price: m.history[0].price }));
// 4월 당시 모터 단가는 82,000원 (8월 단가변경 계약 이전)
const aprilParts = parts.map((p) => (p.id === 'c1201' ? { ...p, unitPrice: 82000 } : p));
const base = materialRollup(lines, 'M', 'p1000', aprilParts, aprilMaterials);
costModels.p1000.quotes.push({
  id: 'q1', date: '2026-04-03', note: '2026년 상반기 견적 확정',
  ...quote(costModels.p1000, base.total),
});

const priceChanges = [
  { id: 'pc1', partId: 'c1201', old: 82000, new: 85000, reason: '희토류 자석 단가 인상', status: '체결',
    requestedAt: '2026-08-20', signedBy: '한빛모터 김대표', signedAt: '2026-08-22', hash: 'A41F0C9E' },
];

export const seed = () => ({
  version: 2, parts, lines, materials, ecos, projects, costModels, priceChanges,
});
