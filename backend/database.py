import os
import psycopg2
from contextlib import contextmanager
from dotenv import load_dotenv

# 환경변수 로드
load_dotenv()

# 데이터베이스 연결 설정
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://postgres:password@localhost:5433/postgis_sample"
)

def get_connection():
    """데이터베이스 연결 생성"""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        print(f"데이터베이스 연결 오류: {e}")
        raise

@contextmanager
def get_db():
    """데이터베이스 연결 컨텍스트 매니저"""
    conn = None
    try:
        conn = get_connection()
        yield conn
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"데이터베이스 오류: {e}")
        raise
    finally:
        if conn:
            conn.close()

def test_connection():
    """데이터베이스 연결 테스트"""
    try:
        with get_db() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT version();")
                version = cursor.fetchone()
                print(f"데이터베이스 연결 성공: {version[0]}")
                return True
    except Exception as e:
        print(f"데이터베이스 연결 실패: {e}")
        return False

if __name__ == "__main__":
    test_connection() 