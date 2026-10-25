# aifusionPLM

PDM · Multi-BOM · PMS · CMS를 하나로 연결한 제조업 PLM 웹 앱입니다.
Next.js 14 (App Router) 기반이며 Vercel에 바로 배포할 수 있습니다.

## 기능

| 메뉴 | 모듈 | 내용 |
|---|---|---|
| 현황 | - | 처리할 ECO·계약, 프로젝트 SPI/CPI, 견적 대비 원가 변동 |
| 부품·도면 | PDM | 부품 마스터, 도면/3D/문서 등록, 리비전 이력, Where-used |
| 설계변경 | ECR/ECO | 요청 → 검토 → 승인 → 적용 워크플로, 적용 시 리비전 자동 증가 |
| Multi-BOM | Multi-BOM | E-BOM/M-BOM/S-BOM 트리 편집, 순환 참조 차단, BOM 간 차이 자동 감지, ERP 업로드용 CSV |
| 프로젝트 | PMS | WBS 작업·선후행, 간트 차트, Critical Path(CPM), EVMS(PV/EV/AC, SPI/CPI/EAC) |
| 원가관리 | CMS | ECMS 사전원가(재료비·노무비·감가상각비 + 5공정 수율), ICMS 사후원가(공시단가·단가변경 반영), 원소재 공시단가 이력, 단가변경 전자계약(서명·문서 지문) |

## 로컬 실행

```bash
npm install
npm run dev     # http://localhost:3000
```

## Vercel 배포

**방법 1. GitHub 연동 (권장)**
1. 이 폴더를 GitHub 저장소로 push 합니다.
2. https://vercel.com/new 에서 저장소를 Import 합니다.
3. Framework Preset이 Next.js로 자동 인식됩니다. 설정 변경 없이 Deploy를 누릅니다.

**방법 2. CLI**
```bash
npm i -g vercel
vercel          # 미리보기 배포
vercel --prod   # 운영 배포
```

## 데이터 저장

현재 버전은 데이터를 **브라우저 localStorage**에 저장합니다. 서버 없이 바로 동작하지만,
사용자·브라우저마다 데이터가 따로 저장됩니다. 사이드바의 ‘데이터 백업 / 백업 불러오기’로 JSON 파일을 주고받을 수 있습니다.

### 팀 공유 DB로 전환하기

저장 로직은 `lib/store.js`의 `load()` / `save()` 두 함수에만 있습니다. 이 두 함수를 API 호출로 바꾸면 됩니다.

1. Vercel 대시보드 → Storage → **Neon Postgres** 또는 **Supabase**를 연결합니다 (환경변수 자동 등록).
2. `app/api/data/route.js`를 만들어 GET(전체 조회)과 PUT(저장)을 구현합니다.
3. `load()`는 `fetch('/api/data')`, `save()`는 `fetch('/api/data', { method: 'PUT', body })`로 바꿉니다.

운영 수준으로 가려면 JSON 통째 저장 대신 아래 테이블로 정규화하는 것을 권장합니다.

```
parts(id, no, name, type, rev, status, material, weight, unit_price, supplier, spec, owner)
part_files(id, part_id, kind, name, rev, blob_url, date, author)
part_history(part_id, rev, date, note)
bom_lines(id, type, parent_id, child_id, qty)          -- type: E | M | S
ecos(id, no, title, reason, status, requester, date)
eco_parts(eco_id, part_id) / eco_log(eco_id, date, who, what)
projects(id, name, product_id, pm, start) / tasks(id, project_id, wbs, name, dur, progress, owner, budget, ac)
task_deps(task_id, dep_id)
materials(id, code, name, price) / material_prices(material_id, date, price)
cost_models(product_id, ...) / cost_quotes(...)
price_changes(id, part_id, old, new, reason, status, signed_by, signed_at, hash)
```

### 도면 파일 실제 보관

지금은 파일명·리비전 등 메타데이터만 기록합니다. 실제 CAD 파일을 올리려면
Vercel Blob(`@vercel/blob`)을 연결하고 업로드 결과 URL을 `part_files.blob_url`에 저장하세요.

### 로그인·권한

역할 기반 접근 제어가 필요하면 Auth.js(NextAuth) 또는 Supabase Auth를 붙이고,
ECO 승인·계약 서명 버튼을 역할(설계/검토자/구매/협력사)에 따라 노출하면 됩니다.

## 파일 구성

```
app/            layout.js, page.js, globals.css
components/     App(메뉴), Dashboard, PDM, ECO, BOM, PMS, CMS, ui
lib/calc.js     BOM 전개·비교, 원가 롤업·견적, CPM, EVMS
lib/store.js    상태 관리와 저장 (DB 전환 지점)
lib/seed.js     샘플 데이터 (전동 리프트 테이블 LT-500)
```
