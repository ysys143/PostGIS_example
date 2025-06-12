// 전역 변수
let map;
let markers = [];
let currentPolygon = null;
let isPolygonMode = false;
let polygonPoints = [];
let polygonPointMarkers = []; // 다각형 점 마커들
let searchMarkers = []; // 검색 관련 마커들 (중심점, 반경 원 등)

// API 기본 URL - 환경에 따라 자동 설정
const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:8000/api' 
    : 'https://seismic-backend-ufeh.onrender.com/api';

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

    // 축척(스케일) 컨트롤 추가 및 커스텀 div에 동기화
    const scaleControl = L.control.scale({ position: 'bottomleft', imperial: false });
    scaleControl.addTo(map);
    // scaleControl은 내부적으로 .leaflet-control-scale-line을 사용하므로, 주기적으로 동기화
    function updateScaleDiv() {
        const scaleLine = document.querySelector('.leaflet-control-scale-line');
        const scaleDiv = document.getElementById('map-scale');
        if (scaleLine && scaleDiv) {
            scaleDiv.textContent = scaleLine.textContent;
        }
    }
    map.on('move zoom', updateScaleDiv);
    setTimeout(updateScaleDiv, 500); // 초기화 후 한번 동기화
    setInterval(updateScaleDiv, 1000); // 항상 동기화

    // 마우스 좌표 표시
    map.on('mousemove', function(e) {
        const { lat, lng } = e.latlng;
        document.getElementById('map-coords').textContent =
            `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
    });
    map.on('mouseout', function() {
        document.getElementById('map-coords').textContent = '';
    });
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

// 규모에 따라 색상 그라데이션(노랑→빨강)
function magnitudeToColor(mag) {
    // 시작색: 짙은 노랑 #facc15 (RGB 250,204,21)
    // 끝색:   짙은 빨강 #b91c1c (RGB 185,28,28)
    const start = [250, 204, 21];
    const end = [185, 28, 28];

    // 0-8 스케일로 정규화 (8 이상이면 1, 0 이하면 0)
    const t = Math.max(0, Math.min(1, mag / 8));

    const rgb = start.map((s, i) => Math.round(s + (end[i] - s) * t));
    // RGB를 hex 문자열로 변환
    return '#' + rgb.map(x => x.toString(16).padStart(2, '0')).join('');
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
        
        // 시각적 마커 (규모별 색상) - 태평양 중심 좌표로 표시
        const markerColor = magnitudeToColor(magnitude);
        const visualMarker = L.circleMarker([eq.latitude, pacificLng], {
            radius: visualSize,
            fillColor: 'red',
            color: 'darkred',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.9
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
        
        const fullPlace = eq.place || '';
        let locationName = fullPlace;
        let distanceInfo = '';

        // "DISTANCE DIRECTION of LOCATION" 패턴 파싱
        const ofIndex = fullPlace.indexOf(' of ');
        if (ofIndex !== -1) {
            distanceInfo = fullPlace.substring(0, ofIndex).trim();
            locationName = fullPlace.substring(ofIndex + ' of '.length).trim();
        } else {
            // 'of'가 없으면 전체를 지역명으로 간주하고 거리 정보는 비워둠
            locationName = fullPlace;
            distanceInfo = '';
        }
        
        // 규모에 따른 색상
        let bgColor = '#16a34a';
        if (magnitude >= 6.0) bgColor = '#dc2626';
        else if (magnitude >= 4.0) bgColor = '#ea580c';
        else if (magnitude >= 2.0) bgColor = '#ca8a04';
        
        // 팝업 내용 - 극도로 컴팩트하게, 요청된 형식으로 재구성
        const popupContent = `
            <div style="
                min-width: 100px; 
                max-width: 120px; 
                font-size: 11px; 
                line-height: 1.2;
                padding: 4px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            ">
                <div style="
                    background: ${bgColor}; 
                    color: white; 
                    padding: 2px 6px; 
                    margin: -4px -4px 3px -4px;
                    font-weight: bold;
                    font-size: 12px;
                ">
                    M${magnitude || '?'}
                </div>
                <div style="color: #333; padding: 1px 6px; font-size: 10px; word-wrap: break-word;">
                    ${locationName || '위치 미상'}
                </div>
                <div style="color: #666; padding: 1px 6px; font-size: 9px;">
                    ${distanceInfo || ''}
                </div>
            </div>
        `;

        clickMarker.bindPopup(popupContent, {
            closeButton: true,
            maxWidth: 120,
            className: 'compact-popup'
        });
        
        // 클릭 이벤트
        marker.on('click', () => {
            console.log('지진 마커 클릭됨:', eq.id, eq.magnitude);
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
            radius: radius * 1000, // 미터 단위
            interactive: false  // 지진 마커 클릭을 방해하지 않도록 설정
        }).addTo(map);
        
        // 검색 마커들을 배열에 저장
        searchMarkers.push(centerMarker);
        searchMarkers.push(radiusCircle);
        
        console.log(`중심점 마커 생성 완료: ${searchMarkers.length}개`);
        
    } catch (error) {
        console.error('중심점 마커 생성 오류:', error);
    }
}

// 지진 상세정보 표시
function showEarthquakeInfo(earthquake) {
    const infoDiv = document.getElementById('earthquake-info');
    
    const timeStr = earthquake.time ? new Date(earthquake.time).toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }) : '미상';
    
    // 규모에 따른 색상
    let magnitudeColor = 'text-green-600';
    if (earthquake.magnitude >= 6.0) magnitudeColor = 'text-red-600';
    else if (earthquake.magnitude >= 4.0) magnitudeColor = 'text-orange-600';
    else if (earthquake.magnitude >= 2.0) magnitudeColor = 'text-yellow-600';
    
    infoDiv.innerHTML = `
        <div class="bg-gray-50 rounded p-1 mb-1">
            <div class="text-xs">
                <span class="font-bold ${magnitudeColor}">M${earthquake.magnitude || '?'}</span>
                <span class="ml-1 text-gray-700 break-words whitespace-normal">${earthquake.place || '위치 미상'}</span>
            </div>
        </div>
        
        <div class="space-y-0.5 text-xs">
            <div><span class="text-gray-500">시간:</span> ${timeStr}</div>
            <div><span class="text-gray-500">좌표:</span> ${earthquake.latitude?.toFixed(1) || '?'}, ${earthquake.longitude?.toFixed(1) || '?'}</div>
            <div><span class="text-gray-500">깊이:</span> ${earthquake.depth || '?'}km</div>
            ${earthquake.distance_km ? `<div><span class="text-gray-500">거리:</span> ${earthquake.distance_km}km</div>` : ''}
        </div>
    `;
}

// 검색 결과 팝업 표시
function showSearchResults(earthquakes, searchType) {
    const popup = document.getElementById('search-results-popup');
    const title = document.getElementById('results-title');
    const resultsList = document.getElementById('results-list');
    
    title.innerHTML = `
        <i class="fas fa-search mr-2 text-xs"></i>
        ${searchType} (${earthquakes.length})
    `;
    
    // 결과 목록 생성
    resultsList.innerHTML = '';
    
    if (earthquakes.length === 0) {
        resultsList.innerHTML = `
            <div class="flex items-center justify-center py-8 text-gray-500">
                <div class="text-center">
                    <i class="fas fa-search text-2xl mb-2"></i>
                    <p class="text-xs">검색 결과 없음</p>
                </div>
            </div>
        `;
    } else {
        earthquakes.forEach(eq => {
            const item = document.createElement('div');
            item.className = 'bg-gray-50 border border-gray-200 rounded p-2 cursor-pointer hover:bg-gray-100 hover:border-blue-300 transition-all duration-200';
            
            const timeStr = eq.time ? new Date(eq.time).toLocaleDateString('ko-KR', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }) : '시간 미상';
            
            // 규모에 따른 색상 지정
            let magnitudeColor = 'text-green-600';
            if (eq.magnitude >= 6.0) magnitudeColor = 'text-red-600';
            else if (eq.magnitude >= 4.0) magnitudeColor = 'text-orange-600';
            else if (eq.magnitude >= 2.0) magnitudeColor = 'text-yellow-600';
            
            item.innerHTML = `
                <div class="flex justify-between items-start mb-1">
                    <span class="text-lg font-bold ${magnitudeColor}">
                        ${eq.magnitude || '?'}
                    </span>
                    <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
                </div>
                <div class="text-xs text-gray-700 mb-1" title="${eq.place || '위치 미상'}">
                    ${eq.place || '위치 미상'}
                </div>
                <div class="flex justify-between text-xs text-gray-500">
                    <span>${timeStr}</span>
                    ${eq.distance_km ? `<span>${eq.distance_km}km</span>` : ''}
                </div>
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
    }
    
    // 팝업 표시
    popup.classList.remove('hidden');
}

// 검색 결과 팝업 숨기기
function hideSearchResults() {
    const popup = document.getElementById('search-results-popup');
    popup.classList.add('hidden');
}

// API 호출 함수들
async function loadEarthquakes() {
    const maxCount = document.getElementById('max-count').value || 1000;
    
    try {
        showLoading('load-earthquakes-btn');
        
        // 기존 검색 마커 제거
        clearSearchMarkers();
        
        const response = await fetch(`${API_BASE}/earthquakes?limit=${maxCount}`);
        const earthquakes = await response.json();
        
        addEarthquakeMarkers(earthquakes);
        alert(`DATA_LOADED: ${earthquakes.length} SEISMIC_EVENTS`);
    } catch (error) {
        console.error('Error loading earthquakes:', error);
        alert('ERROR: SEISMIC_DATA_LOAD_FAILED');
    } finally {
        hideLoading('load-earthquakes-btn');
    }
}

async function syncData() {
    try {
        showLoading('sync-btn');
        const response = await fetch(`${API_BASE}/earthquakes/sync`);
        const result = await response.json();
        alert(`SYNC_STATUS: ${result.message}`);
    } catch (error) {
        console.error('Error syncing data:', error);
        alert('ERROR: DATA_SYNC_FAILED');
    } finally {
        hideLoading('sync-btn');
    }
}

async function radiusSearch() {
    const lat = parseFloat(document.getElementById('search-lat').value);
    const lon = parseFloat(document.getElementById('search-lon').value);
    const radius = parseFloat(document.getElementById('search-radius').value);
    
    if (!lat || !lon || !radius) {
        alert('ERROR: INCOMPLETE_COORDINATES');
        return;
    }
    
    // 좌표 유효성 검사
    if (lat < -90 || lat > 90) {
        alert('ERROR: LATITUDE_OUT_OF_RANGE [-90,90]');
        return;
    }
    
    if (lon < -180 || lon > 180) {
        alert('ERROR: LONGITUDE_OUT_OF_RANGE [-180,180]');
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
        
        // 검색 입력 필드 비활성화 (고정)
        ['search-lat', 'search-lon'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.disabled = true;
                el.classList.add('bg-gray-100', 'cursor-not-allowed');
            }
        });
        const radiusSlider = document.getElementById('search-radius');
        if (radiusSlider) {
            radiusSlider.value = '1000';
            radiusSlider.disabled = false;
            radiusSlider.classList.remove('range-fake-disabled', 'bg-gray-100', 'cursor-not-allowed');
        }
        
        // 반경에 따라 더 넓은 영역은 더 낮은 줌레벨로
        let zoomLevel;
        if (radius >= 10000) zoomLevel = 1;
        else if (radius >= 5000) zoomLevel = 2;
        else if (radius >= 3500) zoomLevel = 3;
        else if (radius >= 1500) zoomLevel = 4;
        else if (radius >= 1000) zoomLevel = 4;
        else if (radius >= 500) zoomLevel = 5;
        else if (radius >= 300) zoomLevel = 6;
        else if (radius >= 100) zoomLevel = 7;
        else if (radius >= 50) zoomLevel = 8;
        else zoomLevel = 10;
        map.setView([lat, pacificLon], zoomLevel);
        
        // 검색 결과 팝업 표시
        showSearchResults(earthquakes, `반경 ${radius}km 검색`);
        
        alert(`RADIUS_SEARCH_RESULT: ${earthquakes.length} EVENTS IN ${radius}KM`);
    } catch (error) {
        console.error('Error in radius search:', error);
        alert('ERROR: RADIUS_SEARCH_FAILED');
    } finally {
        hideLoading('radius-search-btn');
    }
}

async function polygonSearch() {
    if (!currentPolygon || polygonPoints.length < 3) {
        alert('ERROR: POLYGON_NOT_DEFINED');
        return;
    }
    
    // WKT 형식으로 변환
    const wktPoints = polygonPoints.map(p => `${p[1]} ${p[0]}`).join(', ');
    const polygonWkt = `POLYGON((${wktPoints}, ${polygonPoints[0][1]} ${polygonPoints[0][0]}))`;
    
    // 디버깅: WKT 형식 확인
    console.log('다각형 WKT:', polygonWkt);
    console.log('다각형 좌표:', polygonPoints);
    
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
        console.log(`다각형 검색 결과: ${earthquakes.length}개`);
        
        addEarthquakeMarkers(earthquakes);
        
        // 검색 결과 팝업 표시
        showSearchResults(earthquakes, '다각형 영역 검색');
        
        alert(`POLYGON_SEARCH_RESULT: ${earthquakes.length} EVENTS DETECTED`);
    } catch (error) {
        console.error('Error in polygon search:', error);
        alert('ERROR: POLYGON_SEARCH_FAILED');
    } finally {
        hideLoading('polygon-search-btn');
    }
}

// 통계 정보 표시
async function showStats() {
    try {
        showLoading('stats-btn');
        
        const response = await fetch(`${API_BASE}/earthquakes/stats`);
        const stats = await response.json();
        
        const modal = document.getElementById('stats-modal');
        const content = document.getElementById('stats-content');
        
        content.innerHTML = `
            <!-- 전체 통계 카드 -->
            <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
                <div class="flex items-center mb-4">
                    <div class="bg-blue-500 rounded-lg p-3 mr-4">
                        <i class="fas fa-database text-white text-xl"></i>
                    </div>
                    <div>
                        <h3 class="text-lg font-semibold text-blue-900">전체 지진 데이터</h3>
                        <p class="text-blue-700">데이터베이스 현황</p>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="text-center">
                        <p class="text-3xl font-bold text-blue-600">${stats.total_earthquakes.toLocaleString()}</p>
                        <p class="text-sm text-blue-700">총 지진 이벤트</p>
                    </div>
                    <div class="text-center">
                        <p class="text-3xl font-bold text-green-600">${stats.recent_24h}</p>
                        <p class="text-sm text-blue-700">최근 24시간</p>
                    </div>
                </div>
            </div>

            <!-- 규모 통계 카드 -->
            <div class="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200">
                <div class="flex items-center mb-4">
                    <div class="bg-orange-500 rounded-lg p-3 mr-4">
                        <i class="fas fa-chart-line text-white text-xl"></i>
                    </div>
                    <div>
                        <h3 class="text-lg font-semibold text-orange-900">규모 통계</h3>
                        <p class="text-orange-700">지진 강도 분석</p>
                    </div>
                </div>
                <div class="space-y-3">
                    <div class="flex justify-between items-center">
                        <span class="text-orange-800 font-medium">평균 규모:</span>
                        <span class="text-2xl font-bold text-orange-600">${stats.magnitude_stats.average.toFixed(2)}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-orange-800 font-medium">최대 규모:</span>
                        <span class="text-xl font-bold text-red-600">${stats.magnitude_stats.maximum.toFixed(2)}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-orange-800 font-medium">최소 규모:</span>
                        <span class="text-lg font-bold text-green-600">${stats.magnitude_stats.minimum.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            <!-- 깊이 통계 카드 -->
            <div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
                <div class="flex items-center mb-4">
                    <div class="bg-purple-500 rounded-lg p-3 mr-4">
                        <i class="fas fa-arrows-alt-v text-white text-xl"></i>
                    </div>
                    <div>
                        <h3 class="text-lg font-semibold text-purple-900">깊이 통계</h3>
                        <p class="text-purple-700">지진 발생 깊이</p>
                    </div>
                </div>
                <div class="space-y-3">
                    <div class="flex justify-between items-center">
                        <span class="text-purple-800 font-medium">평균 깊이:</span>
                        <span class="text-2xl font-bold text-purple-600">${stats.depth_stats.average.toFixed(1)}km</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-purple-800 font-medium">최대 깊이:</span>
                        <span class="text-xl font-bold text-red-600">${stats.depth_stats.maximum.toFixed(1)}km</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-purple-800 font-medium">최소 깊이:</span>
                        <span class="text-lg font-bold text-green-600">${stats.depth_stats.minimum.toFixed(1)}km</span>
                    </div>
                </div>
            </div>

            <!-- 규모별 분포 카드 -->
            <div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200 col-span-1 md:col-span-2">
                <div class="flex items-center mb-4">
                    <div class="bg-gray-500 rounded-lg p-3 mr-4">
                        <i class="fas fa-chart-bar text-white text-xl"></i>
                    </div>
                    <div>
                        <h3 class="text-lg font-semibold text-gray-900">규모별 분포</h3>
                        <p class="text-gray-700">지진 강도별 발생 빈도</p>
                    </div>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="text-center bg-white rounded-lg p-4 shadow-sm">
                        <p class="text-sm text-gray-600">규모 0-2</p>
                        <p class="text-xl font-bold text-green-600">미세</p>
                    </div>
                    <div class="text-center bg-white rounded-lg p-4 shadow-sm">
                        <p class="text-sm text-gray-600">규모 2-4</p>
                        <p class="text-xl font-bold text-yellow-600">약함</p>
                    </div>
                    <div class="text-center bg-white rounded-lg p-4 shadow-sm">
                        <p class="text-sm text-gray-600">규모 4-6</p>
                        <p class="text-xl font-bold text-orange-600">보통</p>
                    </div>
                    <div class="text-center bg-white rounded-lg p-4 shadow-sm">
                        <p class="text-sm text-gray-600">규모 6+</p>
                        <p class="text-xl font-bold text-red-600">강함</p>
                    </div>
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
        
    } catch (error) {
        console.error('통계 조회 오류:', error);
        alert('통계 정보를 불러오는데 실패했습니다.');
    } finally {
        hideLoading('stats-btn');
    }
}

function togglePolygonMode() {
    isPolygonMode = !isPolygonMode;
    const btn = document.getElementById('polygon-mode-btn');
    
    if (isPolygonMode) {
        // 반경 검색이 활성화되어 있었다면 초기화
        const latInputDisabled = document.getElementById('search-lat')?.disabled;
        if (latInputDisabled) {
            clearRadiusSearch();
        }

        btn.textContent = '완료';
        btn.classList.add('bg-blue-600');
        btn.classList.remove('bg-gray-600');
        map.getContainer().style.cursor = 'crosshair';
    } else {
        btn.textContent = '그리기';
        btn.classList.add('bg-gray-600');
        btn.classList.remove('bg-blue-600');
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
    
    // 입력 필드 초기화 및 재활성화
    ['search-lat', 'search-lon'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.value = '';
            el.disabled = false;
            el.classList.remove('bg-gray-100', 'cursor-not-allowed');
        }
    });
    const radiusSlider = document.getElementById('search-radius');
    if (radiusSlider) {
        radiusSlider.value = '1000';
        radiusSlider.disabled = false;
        radiusSlider.classList.remove('range-fake-disabled', 'bg-gray-100', 'cursor-not-allowed');
    }
    
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

// 로딩 표시
function showLoading(buttonId) {
    const button = document.getElementById(buttonId);
    const originalText = button.innerHTML;
    button.setAttribute('data-original', originalText);
    button.innerHTML = '<i class="fas fa-spinner loading-spinner mr-1"></i>로딩';
    button.disabled = true;
}

// 로딩 숨기기
function hideLoading(buttonId) {
    const button = document.getElementById(buttonId);
    const originalText = button.getAttribute('data-original');
    if (originalText) {
        button.innerHTML = originalText;
        button.removeAttribute('data-original');
    }
    button.disabled = false;
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
    
    // 반경 슬라이더 변경 시: 표시 숫자 업데이트 + 마커 업데이트
    const radiusSlider = document.getElementById('search-radius');
    const radiusValueSpan = document.getElementById('search-radius-value');
    radiusSlider.addEventListener('input', () => {
        radiusValueSpan.textContent = radiusSlider.value;
        updateCenterMarkerIfValid();
    });
    
    // 좌표 입력 필드 변경시 마커 업데이트
    document.getElementById('search-lat').addEventListener('input', updateCenterMarkerIfValid);
    document.getElementById('search-lon').addEventListener('input', updateCenterMarkerIfValid);
    
    // 최대 표시 개수 슬라이더 표시 숫자 업데이트
    const maxCountSlider = document.getElementById('max-count');
    const maxCountValueSpan = document.getElementById('max-count-value');
    const updateMaxCountDisplay = () => {
        if (parseInt(maxCountSlider.value) >= parseInt(maxCountSlider.max)) {
            maxCountValueSpan.textContent = 'MAX';
        } else {
            maxCountValueSpan.textContent = maxCountSlider.value;
        }
    };
    // 초기 표시
    updateMaxCountDisplay();

    maxCountSlider.addEventListener('input', updateMaxCountDisplay);
    
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
        document.getElementById('stats-modal').classList.add('hidden');
    });
    
    // 검색 결과 팝업 닫기
    document.getElementById('close-results').addEventListener('click', hideSearchResults);
    
    // 모달 외부 클릭시 닫기
    document.getElementById('stats-modal').addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.add('hidden');
        }
    });
    
    document.getElementById('search-results-popup').addEventListener('click', function(e) {
        if (e.target === this) {
            hideSearchResults();
        }
    });
    
    // 초기 데이터 로드
    loadEarthquakes();
}); 