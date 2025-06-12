from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

# Pydantic 스키마
class EarthquakeResponse(BaseModel):
    id: str
    magnitude: Optional[float]
    place: Optional[str]
    time: Optional[datetime]
    depth: Optional[float]
    latitude: Optional[float]
    longitude: Optional[float]
    url: Optional[str]
    distance_km: Optional[float] = None

class RadiusSearchRequest(BaseModel):
    latitude: float
    longitude: float
    radius_km: float

class RegionSearchRequest(BaseModel):
    polygon_wkt: str  # WKT 형식의 다각형

class BoundaryStatsResponse(BaseModel):
    total_count: int
    center_point: str
    bounding_box: str
    convex_hull: str
    area_km2: float

class StatsResponse(BaseModel):
    total_earthquakes: int
    magnitude_stats: dict
    depth_stats: dict
    recent_24h: int 