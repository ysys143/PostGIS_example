from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import List, Optional
import httpx
import asyncio
from datetime import datetime

from database import get_db
from models import EarthquakeResponse, RadiusSearchRequest, RegionSearchRequest, BoundaryStatsResponse
from services import EarthquakeService

app = FastAPI(title="PostGIS Earthquake API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "PostGIS Earthquake API"}

@app.get("/api/status")
async def api_status():
    """API 상태 확인"""
    return {"status": "healthy", "message": "PostGIS Earthquake API is running"}

@app.get("/api/earthquakes", response_model=List[EarthquakeResponse])
async def get_earthquakes(
    limit: Optional[int] = 100,
    min_magnitude: Optional[float] = None
):
    """전체 지진 목록 조회"""
    with get_db() as db:
        service = EarthquakeService(db)
        return service.get_earthquakes(limit, min_magnitude)

@app.get("/api/earthquakes/recent", response_model=List[EarthquakeResponse])
async def get_recent_earthquakes(
    limit: Optional[int] = 100,
    min_magnitude: Optional[float] = None
):
    """최근 지진 목록 조회 (get_earthquakes와 동일)"""
    with get_db() as db:
        service = EarthquakeService(db)
        return service.get_earthquakes(limit, min_magnitude)

@app.get("/api/earthquakes/sync")
async def sync_earthquake_data():
    """USGS API에서 지진 데이터 동기화"""
    try:
        # 최근 24시간 데이터 가져오기
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"
            )
            data = response.json()
        
        print(f"USGS API에서 {len(data.get('features', []))}개 지진 데이터 받음")
        
        with get_db() as db:
            service = EarthquakeService(db)
            count = service.sync_usgs_data(data)
        
        return {
            "message": f"동기화 완료: {count}개 지진 데이터 처리", 
            "total_received": len(data.get('features', []))
        }
    
    except Exception as e:
        print(f"동기화 오류: {str(e)}")
        raise HTTPException(status_code=500, detail=f"동기화 실패: {str(e)}")

@app.post("/api/earthquakes/search/radius", response_model=List[EarthquakeResponse])
async def search_radius(request: RadiusSearchRequest):
    """반경 검색 (좌표 기반)"""
    with get_db() as db:
        service = EarthquakeService(db)
        return service.search_within_radius(
            request.latitude, request.longitude, request.radius_km
        )

@app.post("/api/earthquakes/search/region", response_model=List[EarthquakeResponse])
async def search_region(request: RegionSearchRequest):
    """지역 내 검색 (내포 여부)"""
    with get_db() as db:
        service = EarthquakeService(db)
        return service.search_within_polygon(request.polygon_wkt)

@app.post("/api/earthquakes/boundary", response_model=BoundaryStatsResponse)
async def calculate_boundary(earthquake_ids: List[str]):
    """경계 계산 (면적, 중심점)"""
    with get_db() as db:
        service = EarthquakeService(db)
        return service.calculate_boundary_stats(earthquake_ids)

@app.get("/api/earthquakes/stats")
async def get_stats():
    """통계 정보"""
    with get_db() as db:
        service = EarthquakeService(db)
        return service.get_statistics()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 