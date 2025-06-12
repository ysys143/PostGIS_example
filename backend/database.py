import psycopg2
import psycopg2.extras
import os
from contextlib import contextmanager

# 데이터베이스 연결 설정
DB_CONFIG = {
    'host': 'localhost',
    'port': 5433,
    'database': 'postgis_sample',
    'user': 'postgres',
    'password': 'password'
}

@contextmanager
def get_db():
    """데이터베이스 연결 컨텍스트 매니저"""
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = True
        yield conn
    except Exception as e:
        if conn:
            conn.rollback()
        raise e
    finally:
        if conn:
            conn.close()

def get_db_connection():
    """단순한 데이터베이스 연결 반환"""
    return psycopg2.connect(**DB_CONFIG) 