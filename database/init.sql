-- PostGIS 확장 활성화
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- 지진 데이터 테이블
CREATE TABLE IF NOT EXISTS earthquakes (
    id VARCHAR(50) PRIMARY KEY,
    magnitude DECIMAL(5,2),
    place VARCHAR(500),
    time TIMESTAMP WITH TIME ZONE,
    updated TIMESTAMP WITH TIME ZONE,
    depth DECIMAL(6,2),
    location GEOGRAPHY(POINT, 4326),
    url TEXT,
    detail TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 공간 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_earthquakes_location ON earthquakes USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_earthquakes_time ON earthquakes(time);
CREATE INDEX IF NOT EXISTS idx_earthquakes_magnitude ON earthquakes(magnitude);
CREATE INDEX IF NOT EXISTS idx_earthquakes_depth ON earthquakes(depth);

-- 거리 기반 검색 함수
CREATE OR REPLACE FUNCTION find_earthquakes_within_radius(
    center_lat DECIMAL,
    center_lon DECIMAL,
    radius_km DECIMAL
)
RETURNS TABLE(
    id VARCHAR,
    magnitude DECIMAL,
    place VARCHAR,
    time TIMESTAMP WITH TIME ZONE,
    depth DECIMAL,
    distance_km DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.magnitude,
        e.place,
        e.time,
        e.depth,
        ROUND(ST_Distance(e.location, ST_Point(center_lon, center_lat)::geography) / 1000, 2) as distance_km
    FROM earthquakes e
    WHERE ST_DWithin(e.location, ST_Point(center_lon, center_lat)::geography, radius_km * 1000)
    ORDER BY distance_km;
END;
$$ LANGUAGE plpgsql;

-- 지역 내 검색 함수 (다각형 내포 여부) - 날짜변경선 처리 개선
CREATE OR REPLACE FUNCTION find_earthquakes_within_polygon(polygon_wkt TEXT)
RETURNS TABLE(
    id VARCHAR,
    magnitude DECIMAL,
    place VARCHAR,
    time TIMESTAMP WITH TIME ZONE,
    depth DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.magnitude,
        e.place,
        e.time,
        e.depth
    FROM earthquakes e
    WHERE ST_Covers(ST_GeogFromText(polygon_wkt), e.location);
END;
$$ LANGUAGE plpgsql;

-- 경계 계산 함수
CREATE OR REPLACE FUNCTION calculate_earthquake_region_stats(earthquake_ids TEXT[])
RETURNS TABLE(
    total_count INTEGER,
    center_point TEXT,
    bounding_box TEXT,
    convex_hull TEXT,
    area_km2 DECIMAL
) AS $$
DECLARE
    points_geom GEOMETRY;
BEGIN
    -- 지진 위치들을 하나의 멀티포인트로 수집
    SELECT ST_Collect(location::geometry) INTO points_geom
    FROM earthquakes 
    WHERE id = ANY(earthquake_ids);
    
    IF points_geom IS NULL THEN
        RETURN;
    END IF;
    
    RETURN QUERY
    SELECT 
        array_length(earthquake_ids, 1) as total_count,
        ST_AsText(ST_Centroid(points_geom)) as center_point,
        ST_AsText(ST_Envelope(points_geom)) as bounding_box,
        ST_AsText(ST_ConvexHull(points_geom)) as convex_hull,
        ROUND((ST_Area(ST_ConvexHull(points_geom)::geography) / 1000000)::numeric, 2) as area_km2;
END;
$$ LANGUAGE plpgsql; 