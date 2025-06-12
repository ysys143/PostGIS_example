# PostGIS 지진 데이터 샘플 프로젝트

PostGIS의 핵심 기능을 학습하기 위한 실시간 지진 데이터 시각화 샘플 프로젝트입니다.

## 주요 기능

### 🗺️ 공간 데이터 기능
- **좌표 기반 검색**: 특정 위치 기준 반경 내 지진 검색
- **거리 기반 검색**: 거리 계산 및 정렬
- **내포 여부 판단**: 다각형 영역 내 지진 검색
- **경계 계산**: 면적, 중심점, 경계선 계산
- **공간 인덱싱**: GIST 인덱스로 성능 최적화

### 📊 데이터 소스
- USGS 실시간 지진 데이터 API 연동
- API 키 없이 무료 사용
- 매분 업데이트되는 실시간 데이터

### 🎯 시각화 기능
- Leaflet 기반 인터랙티브 지도
- 규모별 색상 구분 마커
- 반경 검색 시각화
- 다각형 영역 그리기
- 실시간 통계 차트

## 기술 스택

- **Database**: PostgreSQL 14 + PostGIS 3.2
- **Backend**: Python 3.11 + FastAPI
- **Frontend**: HTML5 + Leaflet + Chart.js
- **Infrastructure**: Docker + Docker Compose

## 빠른 시작

### 1. 프로젝트 클론 및 실행
```bash
# Docker Compose로 전체 시스템 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f
```

### 2. 접속
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API 문서**: http://localhost:8000/docs
- **PostgreSQL**: localhost:5433

### 3. 초기 데이터 동기화
웹 인터페이스에서 "데이터 동기화" 버튼 클릭

## 로컬 개발 환경

### 데이터베이스만 Docker로 실행
```bash
# PostgreSQL + PostGIS만 실행
docker-compose up -d db

# 상태 확인
docker-compose ps
```

### 백엔드 로컬 실행
```bash
# backend 디렉토리로 이동
cd backend

# 가상환경 생성 (선택사항)
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 의존성 설치 (uv 권장)
uv pip install -r requirements.txt
# 또는
pip install -r requirements.txt

# 환경변수 로드하여 서버 실행
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 로컬 개발 시 접속 주소
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API 문서**: http://localhost:8000/docs
- **PostgreSQL**: localhost:5433

## 사용법

### 반경 검색
1. 지도를 클릭하거나 직접 좌표 입력
2. 반경(km) 설정
3. "반경 검색" 버튼 클릭

### 지역 검색
1. "다각형 그리기" 버튼 클릭
2. 지도에서 3개 이상 점 클릭
3. "지역 내 검색" 버튼 클릭

### 통계 확인
"통계 보기" 버튼으로 지진 데이터 현황 확인

## API 엔드포인트

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/earthquakes` | GET | 전체 지진 목록 |
| `/api/earthquakes/sync` | GET | 데이터 동기화 |
| `/api/earthquakes/search/radius` | POST | 반경 검색 |
| `/api/earthquakes/search/region` | POST | 지역 내 검색 |
| `/api/earthquakes/boundary` | POST | 경계 계산 |
| `/api/earthquakes/stats` | GET | 통계 정보 |

## PostGIS 학습 요소

### 공간 함수 활용
```sql
-- 거리 기반 검색
ST_DWithin(location, point, radius)

-- 다각형 내포 검색
ST_Within(point, polygon)

-- 면적 계산
ST_Area(convex_hull)

-- 중심점 계산
ST_Centroid(points)
```

### 공간 인덱싱
```sql
-- GIST 인덱스 생성
CREATE INDEX idx_location ON earthquakes USING GIST(location);
```

### 공간 집계 함수
```sql
-- 볼록껍질 생성
ST_ConvexHull(ST_Collect(locations))

-- 경계 상자
ST_Envelope(geometries)
```

## 프로젝트 구조

```
PostGIS_example/
├── docker-compose.yml       # Docker 환경 설정
├── .env.example            # 환경 변수 예시
├── run_local.md            # 로컬 개발 가이드
├── requirements.md         # 프로젝트 요구사항
├── TASKS.md               # 작업 목록
├── database/
│   └── init.sql           # PostGIS 초기화 스크립트
├── backend/               # FastAPI 서버
│   ├── main.py           # API 라우트
│   ├── models.py         # 데이터 모델
│   ├── services.py       # 비즈니스 로직
│   ├── database.py       # DB 연결
│   ├── requirements.txt  # Python 의존성
│   └── Dockerfile        # 백엔드 Docker 설정
└── frontend/             # 웹 인터페이스
    ├── index.html        # 메인 페이지
    ├── style.css         # 스타일
    ├── app.js            # JavaScript 로직
    ├── favicon.ico       # 파비콘
    ├── favicon.svg       # SVG 파비콘
    └── site.webmanifest  # 웹 매니페스트
```

## 환경 변수

`.env` 파일 생성 (`.env.example` 참고):
```bash
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5433/postgis_sample
POSTGRES_DB=postgis_sample
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
USGS_API_BASE_URL=https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary
```

## 문제 해결

### 데이터베이스 연결 오류
```bash
# 컨테이너 상태 확인
docker-compose ps

# 로그 확인
docker-compose logs db

# 데이터베이스 직접 접속
psql -h localhost -p 5433 -U postgres -d postgis_sample

# Docker 컨테이너 내부 접속
docker-compose exec db psql -U postgres -d postgis_sample
```

### 백엔드 연결 오류
- `.env` 파일이 backend 디렉토리에 있는지 확인
- `DATABASE_URL`이 올바른지 확인 (포트 5433)
- 데이터베이스 컨테이너가 정상 실행 중인지 확인

### 프론트엔드 CORS 오류
- 백엔드 `main.py`에서 CORS 설정 확인
- API 요청 URL이 올바른 포트(8000)로 설정되어 있는지 확인

### 포트 충돌
`docker-compose.yml`에서 포트 변경:
```yaml
ports:
  - "5433:5432"  # PostgreSQL
  - "8000:8000"  # Backend
  - "3000:80"    # Frontend
```

## 디버깅

### 로그 확인
```bash
# 전체 서비스 로그
docker-compose logs -f

# 특정 서비스 로그
docker-compose logs -f db
docker-compose logs -f backend
docker-compose logs -f frontend
```

### 컨테이너 상태 확인
```bash
# 실행 중인 컨테이너 확인
docker-compose ps

# 컨테이너 재시작
docker-compose restart backend
```

## 라이센스

MIT License

## 참고 자료

- [PostGIS 공식 문서](https://postgis.net/docs/)
- [USGS Earthquake API](https://earthquake.usgs.gov/fdsnws/event/1/)
- [Leaflet 문서](https://leafletjs.com/reference.html)
- [FastAPI 문서](https://fastapi.tiangolo.com/) 