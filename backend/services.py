import psycopg2
import psycopg2.extras
from models import EarthquakeResponse, BoundaryStatsResponse, StatsResponse
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
import json

class EarthquakeService:
    def __init__(self, db_conn):
        self.db = db_conn

    def get_earthquakes(self, limit: int = 100, min_magnitude: Optional[float] = None) -> List[EarthquakeResponse]:
        """전체 지진 목록 조회"""
        with self.db.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            query = """
                SELECT id, magnitude, place, time, depth, 
                       ST_Y(location::geometry) as latitude, 
                       ST_X(location::geometry) as longitude, 
                       url
                FROM earthquakes 
                WHERE 1=1
            """
            params = []
            
            if min_magnitude:
                query += " AND magnitude >= %s"
                params.append(min_magnitude)
            
            query += " ORDER BY time DESC LIMIT %s"
            params.append(limit)
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            return [
                EarthquakeResponse(
                    id=row['id'],
                    magnitude=float(row['magnitude']) if row['magnitude'] else None,
                    place=row['place'],
                    time=row['time'],
                    depth=float(row['depth']) if row['depth'] else None,
                    latitude=float(row['latitude']) if row['latitude'] else None,
                    longitude=float(row['longitude']) if row['longitude'] else None,
                    url=row['url']
                ) for row in rows
            ]

    def sync_usgs_data(self, geojson_data: Dict[str, Any]) -> int:
        """USGS GeoJSON 데이터를 데이터베이스에 동기화"""
        count = 0
        skipped = 0
        processed = 0
        
        with self.db.cursor() as cursor:
            for feature in geojson_data.get('features', []):
                processed += 1
                properties = feature['properties']
                geometry = feature['geometry']
                
                if geometry['type'] != 'Point':
                    print(f"지원하지 않는 geometry 타입: {geometry['type']}")
                    skipped += 1
                    continue
                    
                coords = geometry['coordinates']
                
                # ID 파싱: ids가 ",nn00898840," 형태이므로 쉼표로 분리 후 빈 문자열 제외
                if properties.get('ids'):
                    ids_list = [id_str.strip() for id_str in properties['ids'].split(',') if id_str.strip()]
                    earthquake_id = ids_list[0] if ids_list else None
                else:
                    earthquake_id = feature.get('id')
                
                if not earthquake_id:
                    print(f"earthquake_id 없음: {feature}")
                    skipped += 1
                    continue
                
                # 중복 체크
                cursor.execute("SELECT id FROM earthquakes WHERE id = %s", (earthquake_id,))
                if cursor.fetchone():
                    print(f"중복 데이터 건너뜀: {earthquake_id}")
                    skipped += 1
                    continue
                
                # 데이터 삽입
                insert_query = """
                    INSERT INTO earthquakes (id, magnitude, place, time, updated, depth, location, url, detail, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s, %s)
                """
                
                try:
                    cursor.execute(insert_query, (
                        earthquake_id,
                        properties.get('mag'),
                        properties.get('place'),
                        datetime.fromtimestamp(properties['time'] / 1000) if properties.get('time') else None,
                        datetime.fromtimestamp(properties['updated'] / 1000) if properties.get('updated') else None,
                        coords[2] if len(coords) > 2 else None,
                        coords[0],  # longitude
                        coords[1],  # latitude
                        properties.get('url'),
                        properties.get('detail'),
                        datetime.now()
                    ))
                    count += 1
                    print(f"삽입 성공: {earthquake_id} - {properties.get('place')}")
                except Exception as e:
                    print(f"삽입 실패: {earthquake_id} - {str(e)}")
                    skipped += 1
            
            # Transaction commit
            self.db.commit()
            print(f"총 {processed}개 처리, {count}개 삽입, {skipped}개 건너뜀")
        
        return count

    def search_within_radius(self, lat: float, lon: float, radius_km: float) -> List[EarthquakeResponse]:
        """반경 검색"""
        with self.db.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute("""
                SELECT 
                    e.id,
                    e.magnitude,
                    e.place,
                    e.time,
                    e.depth,
                    e.url,
                    ST_Y(e.location::geometry) as latitude,
                    ST_X(e.location::geometry) as longitude,
                    ROUND((ST_Distance(e.location, ST_Point(%s, %s)::geography) / 1000)::numeric, 2) as distance_km
                FROM earthquakes e
                WHERE ST_DWithin(e.location, ST_Point(%s, %s)::geography, %s * 1000)
                ORDER BY distance_km
            """, (lon, lat, lon, lat, radius_km))
            
            rows = cursor.fetchall()
            
            return [
                EarthquakeResponse(
                    id=row['id'],
                    magnitude=float(row['magnitude']) if row['magnitude'] else None,
                    place=row['place'],
                    time=row['time'],
                    depth=float(row['depth']) if row['depth'] else None,
                    latitude=float(row['latitude']) if row['latitude'] else None,
                    longitude=float(row['longitude']) if row['longitude'] else None,
                    url=row['url'],
                    distance_km=float(row['distance_km']) if row['distance_km'] else None
                ) for row in rows
            ]

    def search_within_polygon(self, polygon_wkt: str) -> List[EarthquakeResponse]:
        """다각형 내 검색"""
        with self.db.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute("""
                SELECT 
                    e.id,
                    e.magnitude,
                    e.place,
                    e.time,
                    e.depth,
                    e.url,
                    ST_Y(e.location::geometry) as latitude,
                    ST_X(e.location::geometry) as longitude
                FROM earthquakes e
                WHERE ST_Within(e.location::geometry, ST_GeomFromText(%s, 4326))
            """, (polygon_wkt,))
            
            rows = cursor.fetchall()
            
            return [
                EarthquakeResponse(
                    id=row['id'],
                    magnitude=float(row['magnitude']) if row['magnitude'] else None,
                    place=row['place'],
                    time=row['time'],
                    depth=float(row['depth']) if row['depth'] else None,
                    latitude=float(row['latitude']) if row['latitude'] else None,
                    longitude=float(row['longitude']) if row['longitude'] else None,
                    url=row['url']
                ) for row in rows
            ]

    def calculate_boundary_stats(self, earthquake_ids: List[str]) -> BoundaryStatsResponse:
        """경계 계산 - 직접 SQL 구현"""
        with self.db.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            # 지진 ID들을 WHERE 조건으로 사용
            placeholders = ','.join(['%s'] * len(earthquake_ids))
            
            cursor.execute(f"""
                SELECT 
                    COUNT(*) as total_count,
                    ST_AsText(ST_Centroid(ST_Collect(location::geometry))) as center_point,
                    ST_AsText(ST_Envelope(ST_Collect(location::geometry))) as bounding_box,
                    ST_AsText(ST_ConvexHull(ST_Collect(location::geometry))) as convex_hull,
                    ST_Area(ST_ConvexHull(ST_Collect(location::geometry))::geography) / 1000000 as area_km2
                FROM earthquakes 
                WHERE id IN ({placeholders})
            """, earthquake_ids)
            
            row = cursor.fetchone()
            
            if not row or row['total_count'] == 0:
                raise ValueError("계산할 지진 데이터가 없습니다")
            
            return BoundaryStatsResponse(
                total_count=row['total_count'],
                center_point=row['center_point'],
                bounding_box=row['bounding_box'],
                convex_hull=row['convex_hull'],
                area_km2=float(row['area_km2']) if row['area_km2'] else 0.0
            )

    def get_statistics(self) -> StatsResponse:
        """통계 정보"""
        with self.db.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            # 전체 지진 수
            cursor.execute("SELECT COUNT(*) as total FROM earthquakes")
            total_count = cursor.fetchone()['total']
            
            # 규모별 통계
            cursor.execute("""
                SELECT 
                    COUNT(*) as total,
                    AVG(magnitude) as avg_magnitude,
                    MAX(magnitude) as max_magnitude,
                    MIN(magnitude) as min_magnitude
                FROM earthquakes WHERE magnitude IS NOT NULL
            """)
            mag_stats = cursor.fetchone()
            
            # 깊이별 통계
            cursor.execute("""
                SELECT 
                    AVG(depth) as avg_depth,
                    MAX(depth) as max_depth,
                    MIN(depth) as min_depth
                FROM earthquakes WHERE depth IS NOT NULL
            """)
            depth_stats = cursor.fetchone()
            
            # 최근 24시간
            cursor.execute("""
                SELECT COUNT(*) as recent_count 
                FROM earthquakes 
                WHERE time >= %s
            """, (datetime.now() - timedelta(hours=24),))
            recent_count = cursor.fetchone()['recent_count']
            
            return StatsResponse(
                total_earthquakes=total_count,
                magnitude_stats={
                    'average': float(mag_stats['avg_magnitude']) if mag_stats['avg_magnitude'] else 0,
                    'maximum': float(mag_stats['max_magnitude']) if mag_stats['max_magnitude'] else 0,
                    'minimum': float(mag_stats['min_magnitude']) if mag_stats['min_magnitude'] else 0
                },
                depth_stats={
                    'average': float(depth_stats['avg_depth']) if depth_stats['avg_depth'] else 0,
                    'maximum': float(depth_stats['max_depth']) if depth_stats['max_depth'] else 0,
                    'minimum': float(depth_stats['min_depth']) if depth_stats['min_depth'] else 0
                },
                recent_24h=recent_count
            ) 