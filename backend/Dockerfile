FROM python:3.11-slim

# 시스템 패키지 업데이트 및 필요한 패키지 설치
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 작업 디렉토리 설정
WORKDIR /app

# uv 설치 (빠른 Python 패키지 관리자)
RUN pip install uv

# 의존성 파일 복사 및 설치
COPY requirements.txt .
RUN uv pip install --system -r requirements.txt

# 애플리케이션 코드 복사
COPY . .

# 포트 노출
EXPOSE 8000

# 헬스체크 스크립트 생성
RUN echo '#!/usr/bin/env python3\nimport urllib.request\ntry:\n    urllib.request.urlopen("http://localhost:8000/")\n    exit(0)\nexcept:\n    exit(1)' > /healthcheck.py && chmod +x /healthcheck.py

# 헬스체크 추가
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python3 /healthcheck.py

# 프로덕션용 실행 명령
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"] 