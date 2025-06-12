# 로컬 개발 환경 실행 가이드

## 1. 선택적 서비스 실행

### 데이터베이스만 실행 (권장 개발 방식)
```bash
# PostgreSQL + PostGIS만 실행
docker-compose up -d db

# 상태 확인
docker-compose ps

# 데이터베이스 로그 확인
docker-compose logs -f db
```

### 특정 서비스만 실행
```bash
# 데이터베이스 + 백엔드만 실행
docker-compose up -d db backend

# 데이터베이스 + 프론트엔드만 실행
docker-compose up -d db frontend

# 전체 서비스 실행
docker-compose up -d
```

### 서비스 중지 및 정리
```bash
# 특정 서비스 중지
docker-compose stop backend
docker-compose stop frontend

# 모든 서비스 중지
docker-compose down

# 볼륨까지 삭제 (데이터베이스 데이터 초기화)
docker-compose down -v
```

## 2. 백엔드 로컬 개발

### 환경 설정
```bash
# backend 디렉토리로 이동
cd backend

# 가상환경 생성 (권장)
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# 의존성 설치 (uv 권장)
uv pip install -r requirements.txt
# 또는
pip install -r requirements.txt
```

### 환경 변수 설정
```bash
# .env 파일 생성 (프로젝트 루트의 .env.example 참고)
cp ../.env.example .env

# .env 파일 내용 확인 및 수정
cat .env
```

### 개발 서버 실행
```bash
# 개발 모드로 서버 실행 (자동 리로드)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 또는 디버그 모드
uvicorn main:app --host 0.0.0.0 --port 8000 --reload --log-level debug
```

## 3. 프론트엔드 로컬 개발

### 정적 파일 서버 실행
```bash
# frontend 디렉토리로 이동
cd frontend

# Python 내장 서버 사용
python -m http.server 3000

# 또는 Node.js가 있다면
npx serve -p 3000

# 또는 PHP가 있다면
php -S localhost:3000
```

## 4. 개발 후 빌드 및 배포 절차

### 백엔드 이미지 재빌드
```bash
# 백엔드 코드 변경 후 이미지 재빌드
docker-compose build backend

# 캐시 없이 강제 재빌드
docker-compose build --no-cache backend

# 재빌드 후 서비스 재시작
docker-compose up -d backend
```

### 전체 시스템 재빌드
```bash
# 모든 서비스 중지
docker-compose down

# 모든 이미지 재빌드
docker-compose build

# 캐시 없이 전체 재빌드
docker-compose build --no-cache

# 재빌드된 이미지로 전체 시스템 실행
docker-compose up -d
```

### 개발 → 프로덕션 전환
```bash
# 1. 로컬 개발 환경 정리
docker-compose down

# 2. 프로덕션 이미지 빌드
docker-compose build --no-cache

# 3. 프로덕션 모드로 실행
docker-compose up -d

# 4. 서비스 상태 확인
docker-compose ps
docker-compose logs -f
```

## 5. 접속 주소

### 로컬 개발 시
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API 문서**: http://localhost:8000/docs
- **PostgreSQL**: localhost:5433

### Docker Compose 전체 실행 시
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API 문서**: http://localhost:8000/docs
- **PostgreSQL**: localhost:5433

## 6. 디버깅 및 모니터링

### 로그 확인
```bash
# 특정 서비스 로그
docker-compose logs -f db
docker-compose logs -f backend
docker-compose logs -f frontend

# 전체 서비스 로그
docker-compose logs -f

# 최근 로그만 확인
docker-compose logs --tail=50 backend
```

### 컨테이너 상태 확인
```bash
# 실행 중인 컨테이너 확인
docker-compose ps

# 컨테이너 리소스 사용량 확인
docker stats

# 컨테이너 내부 접속
docker-compose exec db bash
docker-compose exec backend bash
```

### 데이터베이스 접속 및 확인
```bash
# psql로 직접 접속
psql -h localhost -p 5433 -U postgres -d postgis_sample

# Docker 컨테이너 내부에서 접속
docker-compose exec db psql -U postgres -d postgis_sample

# 테이블 확인
docker-compose exec db psql -U postgres -d postgis_sample -c "\dt"

# PostGIS 확장 확인
docker-compose exec db psql -U postgres -d postgis_sample -c "SELECT PostGIS_Version();"
```

## 7. 문제 해결

### 백엔드 연결 오류
```bash
# 환경 변수 확인
cat backend/.env

# 데이터베이스 연결 테스트
docker-compose exec backend python -c "
from database import engine
print('Database connection test...')
try:
    with engine.connect() as conn:
        result = conn.execute('SELECT 1')
        print('✅ Database connection successful')
except Exception as e:
    print(f'❌ Database connection failed: {e}')
"
```

### 프론트엔드 CORS 오류
- 백엔드 `main.py`에서 CORS 설정 확인
- API 요청 URL이 올바른 포트(8000)로 설정되어 있는지 확인
- 브라우저 개발자 도구에서 네트워크 탭 확인

### 포트 충돌 해결
```bash
# 포트 사용 중인 프로세스 확인
lsof -i :8000
lsof -i :3000
lsof -i :5433

# 프로세스 종료
kill -9 <PID>

# 또는 docker-compose.yml에서 포트 변경
```

### 데이터베이스 초기화
```bash
# 데이터베이스 볼륨 삭제 후 재생성
docker-compose down -v
docker-compose up -d db

# 초기화 스크립트 재실행 확인
docker-compose logs db | grep "database system is ready"
```

## 8. 개발 워크플로우 예시

```bash
# 1. 개발 환경 시작
docker-compose up -d db
cd backend && source .venv/bin/activate
uvicorn main:app --reload &
cd ../frontend && python -m http.server 3000 &

# 2. 개발 작업 수행
# ... 코드 수정 ...

# 3. 테스트
curl http://localhost:8000/api/earthquakes

# 4. 개발 완료 후 Docker 이미지 빌드
docker-compose down
docker-compose build backend
docker-compose up -d

# 5. 최종 테스트
curl http://localhost:8000/api/earthquakes
``` 