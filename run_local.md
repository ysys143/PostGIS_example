# 로컬 개발 환경 실행 가이드

## 1. 데이터베이스만 Docker로 실행

```bash
# PostgreSQL + PostGIS만 실행
docker-compose up -d

# 상태 확인
docker-compose ps
```

## 2. 백엔드 로컬 실행

```bash
# backend 디렉토리로 이동
cd backend

# 가상환경 생성 (선택사항)
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 의존성 설치
uv pip install -r requirements.txt
# 또는
pip install -r requirements.txt

# 환경변수 로드하여 서버 실행
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

## 3. 접속 주소

- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:8001
- **API 문서**: http://localhost:8001/docs
- **PostgreSQL**: localhost:5433

## 4. 디버깅

### 로그 확인
```bash
# 데이터베이스 로그
docker-compose logs db

# 백엔드는 터미널에서 직접 확인 가능
```

### 데이터베이스 접속
```bash
# psql로 직접 접속
psql -h localhost -p 5433 -U postgres -d postgis_sample

# Docker 컨테이너 내부 접속
docker-compose exec db psql -U postgres -d postgis_sample
```

## 5. 문제 해결

### 백엔드 연결 오류
- .env 파일이 backend 디렉토리에 있는지 확인
- DATABASE_URL이 올바른지 확인 (포트 5433)

### 프론트엔드 CORS 오류
- 백엔드 main.py에서 CORS 설정 확인
- API_BASE URL이 8001 포트로 설정되어 있는지 확인 