// 전역 변수
let map;
let markers = [];
let currentPolygon = null;
let isPolygonMode = false;
let polygonPoints = [];
let polygonPointMarkers = []; // 다각형 점 마커들
let searchMarkers = []; // 검색 관련 마커들 (중심점, 반경 원 등)

// API 기본 URL
const API_BASE = 'http://localhost:8000/api';

// 지도 초기화
function initMap() {
    map = L.map('map', {
        center: [0, 180], // 태평양 중심
        zoom: 3,
        worldCopyJump: false, // 태평양 중심에서는 비활성화
        maxBounds: [[-85, 0], [85, 360]], // 태평양 중심 범위 (0~360도)
        maxBoundsViscosity: 1.0
    });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        noWrap: false // 연속적인 지도 표시
    }).addTo(map);
    
    // 지도 클릭 이벤트
    map.on('click', onMapClick);
}

// 경도를 -180~180 범위로 정규화하는 함수
function normalizeLongitude(lng) {
    while (lng > 180) lng -= 360;
    while (lng < -180) lng += 360;
    return lng;
}

// 태평양 중심 좌표계로 변환하는 함수 (0~360도)
function toPacificCentricLongitude(lng) {
    // 음수 경도를 양수로 변환하여 태평양 중심 지도에서 연속적으로 표시
    if (lng < 0) {
        return lng + 360;
    }
    return lng;
}

// 날짜변경선을 고려한 다각형 처리 함수
function handleDateLinePolygon(points) {
    if (points.length < 3) return points;
    
    // 날짜변경선(180도)을 넘나드는지 확인
    let crossesDateLine = false;
    let minLng = points[0][1];
    let maxLng = points[0][1];
    
    for (let i = 0; i < points.length; i++) {
        const lng = points[i][1];
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
        
        // 인접한 점들 간의 경도 차이가 180도 이상이면 날짜변경선을 넘는다고 판단
        const nextIdx = (i + 1) % points.length;
        const lngDiff = Math.abs(points[nextIdx][1] - lng);
        if (lngDiff > 180) {
            crossesDateLine = true;
            break;
        }
    }
    
    // 경도 범위가 180도 이상이면 날짜변경선을 넘는다고 판단
    if (maxLng - minLng > 180) {
        crossesDateLine = true;
    }
    
    if (!crossesDateLine) {
        return points; // 날짜변경선을 넘지 않으면 그대로 반환
    }
    
    // 날짜변경선을 넘는 경우 처리
    console.log('날짜변경선을 넘는 다각형 감지, 분할 처리');
    
    // 모든 점을 0-360도 범위로 변환
    const adjustedPoints = points.map(point => {
        let lng = point[1];
        if (lng < 0) lng += 360;
        return [point[0], lng];
    });
    
    // 다시 확인하여 여전히 문제가 있으면 180도 기준으로 분할
    let stillCrossing = false;
    for (let i = 0; i < adjustedPoints.length; i++) {
        const nextIdx = (i + 1) % adjustedPoints.length;
        const lngDiff = Math.abs(adjustedPoints[nextIdx][1] - adjustedPoints[i][1]);
        if (lngDiff > 180) {
            stillCrossing = true;
            break;
        }
    }
    
    if (stillCrossing) {
        // 여전히 문제가 있으면 두 개의 다각형으로 분할
        const leftPoints = [];
        const rightPoints = [];
        
        adjustedPoints.forEach(point => {
            const originalLng = point[1] > 180 ? point[1] - 360 : point[1];
            if (originalLng > 0) {
                rightPoints.push([point[0], originalLng]);
            } else {
                leftPoints.push([point[0], originalLng]);
            }
        });
        
        const result = [];
        if (leftPoints.length >= 3) result.push(leftPoints);
        if (rightPoints.length >= 3) result.push(rightPoints);
        
        return result.length > 0 ? result : [points];
    }
    
    // 0-360도 범위로 변환된 점들을 다시 -180~180도로 변환
    return adjustedPoints.map(point => [point[0], point[1] > 180 ? point[1] - 360 : point[1]]);
}

// 지도 클릭 이벤트 처리
function onMapClick(e) {
    if (isPolygonMode) {
        addPolygonPoint(e.latlng);
    } else {
        // 태평양 중심 좌표를 원래 좌표로 변환
        const originalLng = e.latlng.lng > 180 ? e.latlng.lng - 360 : e.latlng.lng;
        
        // 클릭한 위치를 반경 검색 필드에 설정 (원래 좌표로)
        document.getElementById('search-lat').value = e.latlng.lat.toFixed(4);
        document.getElementById('search-lon').value = originalLng.toFixed(4);
        
        console.log(`지도 클릭: 태평양 좌표=${e.latlng.lng.toFixed(4)}, 원래 좌표=${originalLng.toFixed(4)}`);
        
        // 즉시 중심점 마커 표시 (태평양 좌표로 표시, 원래 좌표로 저장)
        showCenterMarker(e.latlng.lat, e.latlng.lng, originalLng);
    }
}

// 다각형 점 추가
function addPolygonPoint(latlng) {
    // 태평양 중심 좌표를 원래 좌표로 변환하여 저장
    const originalLng = latlng.lng > 180 ? latlng.lng - 360 : latlng.lng;
    
    polygonPoints.push([latlng.lat, originalLng]);
    
    // 임시 마커 추가 (태평양 좌표로 표시)
    const pointMarker = L.circleMarker(latlng, {
        color: '#8B6B3A',
        fillColor: '#8B6B3A',
        fillOpacity: 0.8,
        weight: 0.2,
        radius: 0.5
    }).addTo(map);
    
    // 점 마커를 배열에 저장
    polygonPointMarkers.push(pointMarker);
    
    console.log(`다각형 점 추가: 태평양 좌표=${latlng.lng.toFixed(4)}, 원래 좌표=${originalLng.toFixed(4)}`);
    
    // 3개 이상의 점이 있으면 다각형 그리기
    if (polygonPoints.length >= 3) {
        if (currentPolygon) {
            map.removeLayer(currentPolygon);
        }
        
        // 태평양 중심 표시를 위해 다각형 점들을 변환
        const displayPoints = polygonPoints.map(point => [
            point[0], // 위도는 그대로
            toPacificCentricLongitude(point[1]) // 경도는 태평양 중심으로 변환
        ]);
        
        // 단순하게 변환된 점들로 다각형 그리기
        currentPolygon = L.polygon(displayPoints, {
            color: '#8B6B3A',
            fillColor: '#8B6B3A',
            fillOpacity: 0.2,
            weight: 0.5
        }).addTo(map);
        
        document.getElementById('polygon-search-btn').disabled = false;
        document.getElementById('polygon-clear-btn').disabled = false;
    }
}

// 마커 추가
function addEarthquakeMarkers(earthquakes) {
    // 기존 마커 제거
    clearMarkers();
    
    earthquakes.forEach(eq => {
        if (!eq.latitude || !eq.longitude) return;
        
        // 태평양 중심 좌표계로 변환 (0 ~ 360 범위로)
        const pacificLng = toPacificCentricLongitude(eq.longitude);
        
        const magnitude = eq.magnitude || 0;
        const visualSize = Math.max(2, Math.min(10, magnitude*0.8));
        const clickSize = Math.max(8, visualSize * 2); // 클릭 영역을 시각적 크기보다 크게
        
        // 시각적 마커 (작은 빨간 점) - 태평양 중심 좌표로 표시
        const visualMarker = L.circleMarker([eq.latitude, pacificLng], {
            radius: visualSize,
            fillColor: 'red',
            color: 'darkred',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
        });
        
        // 클릭 영역 마커 (투명한 큰 원) - 태평양 중심 좌표로 표시
        const clickMarker = L.circleMarker([eq.latitude, pacificLng], {
            radius: clickSize,
            fillColor: 'transparent',
            color: 'transparent',
            weight: 0,
            opacity: 0,
            fillOpacity: 0
        });
        
        // 그룹으로 묶어서 함께 관리
        const markerGroup = L.layerGroup([visualMarker, clickMarker]);
        const marker = clickMarker; // 이벤트는 클릭 마커에 붙임
        
        // 팝업 내용 - 원래 좌표로 표시
        const popupContent = `
            <div class="earthquake-popup">
                <h4>규모 ${magnitude}</h4>
                <p><strong>위치:</strong> ${eq.place || '알 수 없음'}</p>
                <p><strong>좌표:</strong> ${eq.latitude?.toFixed(4)}, ${eq.longitude?.toFixed(4)}</p>
                <p><strong>깊이:</strong> ${eq.depth ? eq.depth + 'km' : '알 수 없음'}</p>
                <p><strong>시간:</strong> ${eq.time ? new Date(eq.time).toLocaleString('ko-KR') : '알 수 없음'}</p>
                ${eq.distance_km ? `<p><strong>거리:</strong> ${eq.distance_km}km</p>` : ''}
                ${eq.url ? `<p><a href="${eq.url}" target="_blank">상세 정보</a></p>` : ''}
            </div>
        `;
        
        // 팝업과 이벤트는 클릭 마커에 붙임
        marker.bindPopup(popupContent);
        
        // 클릭 이벤트
        marker.on('click', () => {
            showEarthquakeInfo(eq);
        });
        
        // 호버 효과 - 클릭 영역 표시
        marker.on('mouseover', () => {
            clickMarker.setStyle({
                fillColor: 'red',
                fillOpacity: 0.1,
                color: 'red',
                opacity: 0.3,
                weight: 1
            });
        });
        
        marker.on('mouseout', () => {
            clickMarker.setStyle({
                fillColor: 'transparent',
                fillOpacity: 0,
                color: 'transparent',
                opacity: 0,
                weight: 0
            });
        });
        
        // 마커 그룹을 지도에 추가
        markerGroup.addTo(map);
        markers.push(markerGroup);
    });
}

// 마커 제거
function clearMarkers() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
}

// 검색 마커 제거 (중심점, 반경 원 등)
function clearSearchMarkers() {
    console.log('검색 마커 제거 중:', searchMarkers.length, '개');
    searchMarkers.forEach(marker => map.removeLayer(marker));
    searchMarkers = [];
}

// 다각형 점 마커 제거
function clearPolygonPointMarkers() {
    polygonPointMarkers.forEach(marker => map.removeLayer(marker));
    polygonPointMarkers = [];
}

// 중심점 마커 표시 함수
function showCenterMarker(lat, displayLon, originalLon) {
    // 기존 검색 마커 제거 (새로운 중심점을 위해)
    clearSearchMarkers();
    
    try {
        console.log(`중심점 마커 생성: 위도=${lat}, 표시경도=${displayLon}, 원래경도=${originalLon}`);
        
        // 마커는 태평양 좌표로 표시
        const centerMarker = L.marker([lat, displayLon], {
            icon: L.divIcon({
                html: '<div style="color: black; font-size: 14px; font-weight: normal; text-align: center; line-height: 14px;">+</div>',
                className: 'center-marker',
                iconSize: [14, 14],
                iconAnchor: [7, 7]
            })
        }).addTo(map);
        
        const radius = parseFloat(document.getElementById('search-radius').value) || 1000;
        
        // 팝업에는 원래 좌표 표시
        centerMarker.bindPopup(`
            <div>
                <h4>검색 중심점</h4>
                <p><strong>좌표:</strong> ${lat.toFixed(4)}, ${originalLon.toFixed(4)}</p>
                <p><strong>반경:</strong> ${radius}km</p>
                <p><em>반경 검색 버튼을 눌러 검색하세요</em></p>
            </div>
        `);
        
        // 반경 원 표시 (태평양 좌표로)
        const radiusCircle = L.circle([lat, displayLon], {
            color: '#8B6B3A',
            fillColor: '#8B6B3A',
            fillOpacity: 0.1,
            weight: 0.5,
            radius: radius * 1000 // 미터 단위
        }).addTo(map);
        
        // 검색 마커들을 배열에 저장
        searchMarkers.push(centerMarker);
        searchMarkers.push(radiusCircle);
        
        console.log(`중심점 마커 생성 완료: ${searchMarkers.length}개`);
        
    } catch (error) {
        console.error('중심점 마커 생성 오류:', error);
    }
}

// 지진 정보 표시
function showEarthquakeInfo(earthquake) {
    const infoDiv = document.getElementById('earthquake-info');
    infoDiv.innerHTML = `
        <h4>지진 정보</h4>
        <p><strong>ID:</strong> ${earthquake.id}</p>
        <p><strong>규모:</strong> ${earthquake.magnitude || '알 수 없음'}</p>
        <p><strong>위치:</strong> ${earthquake.place || '알 수 없음'}</p>
        <p><strong>좌표:</strong> ${earthquake.latitude?.toFixed(4)}, ${earthquake.longitude?.toFixed(4)}</p>
        <p><strong>깊이:</strong> ${earthquake.depth ? earthquake.depth + 'km' : '알 수 없음'}</p>
        <p><strong>시간:</strong> ${earthquake.time ? new Date(earthquake.time).toLocaleString('ko-KR') : '알 수 없음'}</p>
        ${earthquake.distance_km ? `<p><strong>거리:</strong> ${earthquake.distance_km}km</p>` : ''}
    `;
}

// 검색 결과 팝업 표시
function showSearchResults(earthquakes, searchType) {
    const popup = document.getElementById('search-results-popup');
    const title = document.getElementById('results-title');
    const resultsList = document.getElementById('results-list');
    
    title.textContent = `${searchType} (${earthquakes.length}개)`;
    
    // 결과 목록 생성
    resultsList.innerHTML = '';
    
    earthquakes.forEach(eq => {
        const item = document.createElement('div');
        item.className = 'result-item';
        
        const timeStr = eq.time ? new Date(eq.time).toLocaleDateString('ko-KR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) : '시간 미상';
        
        item.innerHTML = `
            <h5>규모 <span class="magnitude">${eq.magnitude || '미상'}</span></h5>
            <p class="location">${eq.place || '위치 미상'}</p>
            <p>깊이: ${eq.depth ? eq.depth + 'km' : '미상'}</p>
            <p class="time">${timeStr}</p>
            ${eq.distance_km ? `<p>거리: ${eq.distance_km}km</p>` : ''}
        `;
        
        // 클릭 이벤트 - 상세정보 표시 및 지도 이동
        item.addEventListener('click', () => {
            showEarthquakeInfo(eq);
            
            // 지도 중심 이동 (태평양 중심 좌표로)
            const pacificLng = toPacificCentricLongitude(eq.longitude);
            map.setView([eq.latitude, pacificLng], 8);
            
            // 해당 마커 강조 (팝업 열기)
            markers.forEach(markerGroup => {
                const layers = markerGroup.getLayers();
                if (layers.length > 0) {
                    const marker = layers[1]; // clickMarker
                    const markerLatLng = marker.getLatLng();
                    if (Math.abs(markerLatLng.lat - eq.latitude) < 0.001 && 
                        Math.abs(markerLatLng.lng - pacificLng) < 0.001) {
                        marker.openPopup();
                    }
                }
            });
        });
        
        resultsList.appendChild(item);
    });
    
    // 팝업 표시
    popup.style.display = 'block';
}

// 검색 결과 팝업 숨기기
function hideSearchResults() {
    const popup = document.getElementById('search-results-popup');
    popup.style.display = 'none';
}

// API 호출 함수들
async function loadEarthquakes() {
    const minMagnitude = document.getElementById('min-magnitude').value || 0;
    const maxCount = document.getElementById('max-count').value || 1000;
    
    try {
        showLoading('load-earthquakes-btn');
        
        // 기존 검색 마커 제거
        clearSearchMarkers();
        
        const response = await fetch(`${API_BASE}/earthquakes?limit=${maxCount}&min_magnitude=${minMagnitude}`);
        const earthquakes = await response.json();
        
        addEarthquakeMarkers(earthquakes);
        alert(`${earthquakes.length}개 지진 데이터를 로드했습니다.`);
    } catch (error) {
        console.error('Error loading earthquakes:', error);
        alert('지진 데이터 로드 실패');
    } finally {
        hideLoading('load-earthquakes-btn');
    }
}

async function syncData() {
    try {
        showLoading('sync-btn');
        const response = await fetch(`${API_BASE}/earthquakes/sync`);
        const result = await response.json();
        alert(result.message);
    } catch (error) {
        console.error('Error syncing data:', error);
        alert('데이터 동기화 실패');
    } finally {
        hideLoading('sync-btn');
    }
}

async function radiusSearch() {
    const lat = parseFloat(document.getElementById('search-lat').value);
    const lon = parseFloat(document.getElementById('search-lon').value);
    const radius = parseFloat(document.getElementById('search-radius').value);
    
    if (!lat || !lon || !radius) {
        alert('위도, 경도, 반경을 모두 입력해주세요.');
        return;
    }
    
    // 좌표 유효성 검사
    if (lat < -90 || lat > 90) {
        alert('위도는 -90 ~ 90 범위여야 합니다.');
        return;
    }
    
    if (lon < -180 || lon > 180) {
        alert('경도는 -180 ~ 180 범위여야 합니다.');
        return;
    }
    
    try {
        showLoading('radius-search-btn');
        
        // 다각형 검색 해제
        clearPolygon();
        
        // 기존 검색 마커 제거
        clearSearchMarkers();
        
        const response = await fetch(`${API_BASE}/earthquakes/search/radius`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                latitude: lat,
                longitude: lon,
                radius_km: radius
            })
        });
        
        const earthquakes = await response.json();
        addEarthquakeMarkers(earthquakes);
        
        // 태평양 중심 좌표로 변환
        const pacificLon = toPacificCentricLongitude(lon);
        
        // 중심점 마커와 반경 원 표시 (태평양 좌표로)
        showCenterMarker(lat, pacificLon, lon);
        
        // 적절한 줌 레벨로 조정 (태평양 좌표로)
        const zoomLevel = radius > 500 ? 5 : radius > 100 ? 7 : radius > 50 ? 8 : 10;
        map.setView([lat, pacificLon], zoomLevel);
        
        // 검색 결과 팝업 표시
        showSearchResults(earthquakes, `반경 ${radius}km 검색`);
        
        alert(`반경 ${radius}km 내에서 ${earthquakes.length}개 지진을 발견했습니다.`);
    } catch (error) {
        console.error('Error in radius search:', error);
        alert('반경 검색 실패');
    } finally {
        hideLoading('radius-search-btn');
    }
}

async function polygonSearch() {
    if (!currentPolygon || polygonPoints.length < 3) {
        alert('다각형을 먼저 그려주세요.');
        return;
    }
    
    // WKT 형식으로 변환
    const wktPoints = polygonPoints.map(p => `${p[1]} ${p[0]}`).join(', ');
    const polygonWkt = `POLYGON((${wktPoints}, ${polygonPoints[0][1]} ${polygonPoints[0][0]}))`;
    
    try {
        showLoading('polygon-search-btn');
        
        // 반경 검색 해제
        clearRadiusSearch();
        
        const response = await fetch(`${API_BASE}/earthquakes/search/region`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                polygon_wkt: polygonWkt
            })
        });
        
        const earthquakes = await response.json();
        addEarthquakeMarkers(earthquakes);
        
        // 검색 결과 팝업 표시
        showSearchResults(earthquakes, '다각형 영역 검색');
        
        alert(`다각형 영역 내에서 ${earthquakes.length}개 지진을 발견했습니다.`);
    } catch (error) {
        console.error('Error in polygon search:', error);
        alert('지역 검색 실패');
    } finally {
        hideLoading('polygon-search-btn');
    }
}

async function showStats() {
    try {
        const response = await fetch(`${API_BASE}/earthquakes/stats`);
        const stats = await response.json();
        
        document.getElementById('total-count').textContent = stats.total_earthquakes;
        document.getElementById('recent-count').textContent = stats.recent_24h;
        document.getElementById('avg-magnitude').textContent = stats.magnitude_stats.average.toFixed(2);
        document.getElementById('avg-depth').textContent = stats.depth_stats.average.toFixed(1) + ' km';
        
        document.getElementById('stats-modal').style.display = 'block';
        
        // 간단한 차트 그리기
        createMagnitudeChart(stats);
    } catch (error) {
        console.error('Error loading stats:', error);
        alert('통계 로드 실패');
    }
}

function createMagnitudeChart(stats) {
    const ctx = document.getElementById('magnitude-chart').getContext('2d');
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['평균 규모', '최대 규모', '최소 규모'],
            datasets: [{
                data: [
                    stats.magnitude_stats.average,
                    stats.magnitude_stats.maximum,
                    stats.magnitude_stats.minimum
                ],
                backgroundColor: ['#4f46e5', '#ef4444', '#22c55e']
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: '규모 분포'
                }
            }
        }
    });
}

function togglePolygonMode() {
    isPolygonMode = !isPolygonMode;
    const btn = document.getElementById('polygon-mode-btn');
    
    if (isPolygonMode) {
        btn.textContent = '다각형 완료';
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-secondary');
        map.getContainer().style.cursor = 'crosshair';
    } else {
        btn.textContent = '다각형 그리기';
        btn.classList.add('btn-secondary');
        btn.classList.remove('btn-primary');
        map.getContainer().style.cursor = '';
    }
}

// 반경 검색 해제
function clearRadiusSearch() {
    // 검색 마커들 제거 (중심점 마커와 반경 원)
    clearSearchMarkers();
    
    // 지진 마커들 제거
    clearMarkers();
    
    // 검색 결과 팝업 숨기기
    hideSearchResults();
    
    // 입력 필드 초기화
    document.getElementById('search-lat').value = '';
    document.getElementById('search-lon').value = '';
    document.getElementById('search-radius').value = '1000';
    
    console.log('반경 검색이 해제되었습니다.');
}

function clearPolygon() {
    if (currentPolygon) {
        map.removeLayer(currentPolygon);
        currentPolygon = null;
    }
    polygonPoints = [];
    document.getElementById('polygon-search-btn').disabled = true;
    document.getElementById('polygon-clear-btn').disabled = true;
    
    // 모든 마커들 제거
    clearSearchMarkers();      // 검색 중심점, 반경 원
    clearMarkers();           // 지진 마커들
    clearPolygonPointMarkers(); // 다각형 점 마커들
    
    // 검색 결과 팝업 숨기기
    hideSearchResults();
    
    // 다각형 모드가 활성화되어 있다면 비활성화
    if (isPolygonMode) {
        togglePolygonMode();
    }
}

function showLoading(buttonId) {
    const btn = document.getElementById(buttonId);
    btn.innerHTML = '<span class="loading"></span> 처리중...';
    btn.disabled = true;
}

function hideLoading(buttonId) {
    const btn = document.getElementById(buttonId);
    btn.disabled = false;
    
    switch(buttonId) {
        case 'sync-btn':
            btn.innerHTML = '데이터 동기화';
            break;
        case 'load-earthquakes-btn':
            btn.innerHTML = '지진 조회';
            break;
        case 'radius-search-btn':
            btn.innerHTML = '반경 검색';
            break;
        case 'polygon-search-btn':
            btn.innerHTML = '지역 내 검색';
            break;
    }
}

// 이벤트 리스너 등록
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    
    // 버튼 이벤트
    document.getElementById('sync-btn').addEventListener('click', syncData);
    document.getElementById('load-earthquakes-btn').addEventListener('click', loadEarthquakes);
    document.getElementById('radius-search-btn').addEventListener('click', radiusSearch);
    document.getElementById('radius-clear-btn').addEventListener('click', clearRadiusSearch);
    document.getElementById('polygon-mode-btn').addEventListener('click', togglePolygonMode);
    document.getElementById('polygon-search-btn').addEventListener('click', polygonSearch);
    document.getElementById('polygon-clear-btn').addEventListener('click', clearPolygon);
    document.getElementById('stats-btn').addEventListener('click', showStats);
    
    // 반경값 변경시 마커 업데이트
    document.getElementById('search-radius').addEventListener('input', updateCenterMarkerIfValid);
    
    // 좌표 입력 필드 변경시 마커 업데이트
    document.getElementById('search-lat').addEventListener('input', updateCenterMarkerIfValid);
    document.getElementById('search-lon').addEventListener('input', updateCenterMarkerIfValid);
    
    function updateCenterMarkerIfValid() {
        const lat = parseFloat(document.getElementById('search-lat').value);
        const lon = parseFloat(document.getElementById('search-lon').value);
        
        // 유효한 좌표가 입력되어 있으면 마커 업데이트
        if (lat && lon && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
            showCenterMarker(lat, lon);
        }
    }
    
    // 모달 닫기
    document.querySelector('.close').addEventListener('click', function() {
        document.getElementById('stats-modal').style.display = 'none';
    });
    
    // 검색 결과 팝업 닫기
    document.getElementById('close-results').addEventListener('click', hideSearchResults);
    
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('stats-modal');
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    // 초기 데이터 로드
    loadEarthquakes();
}); 