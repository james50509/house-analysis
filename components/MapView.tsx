import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { HouseData } from '../types';
import { GeoManager, GeoCache } from '../utils/geo';
import * as d3 from 'd3';

const PRICE_RANGES = [
    { color: '#22c55e', label: '< 100萬', test: (unit: number) => unit < 100 },
    { color: '#facc15', label: '100-130萬', test: (unit: number) => unit >= 100 && unit < 130 },
    { color: '#f97316', label: '130-160萬', test: (unit: number) => unit >= 130 && unit < 160 },
    { color: '#dc2626', label: '160-190萬', test: (unit: number) => unit >= 160 && unit < 190 },
    { color: '#9333ea', label: '> 190萬', test: (unit: number) => unit >= 190 }
];

const escapeHtml = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

type TooltipDirection = 'left' | 'right' | 'top' | 'bottom';

const createProjectIcon = (color: string, label: string, direction: TooltipDirection = 'right', showLabel = false) => {
    const svgString = `<svg class="project-marker-pin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="${color}" stroke="white" stroke-width="1.5"/><circle cx="12" cy="9" r="2.5" fill="white"/></svg>`;
    const labelHtml = showLabel ? `<span class="project-marker-name project-marker-name-${direction}">${escapeHtml(label)}</span>` : '';

    return L.divIcon({
        html: `<div class="project-marker-wrap">${svgString}${labelHtml}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -34],
        className: 'project-marker-div-icon'
    });
};

const floorLabel = (floor: number | null) => {
    if (floor == null) return '-';
    return floor > 0 ? `${floor}F` : `B${Math.abs(floor)}`;
};

interface PendingGeoProject {
    project: string;
    address: string;
    dist: string;
}

interface ProjectLegendItem {
    project: string;
    dist: string;
    count: number;
}

interface MarkerRecord {
    marker: L.Marker;
    rangeLabel: string;
    project: string;
    count: number;
    dist: string;
    coord: { lat: number; lng: number };
    color: string;
    labelDirection: TooltipDirection;
}

const estimateLabelWidth = (text: string) => Math.max(text.length * 13 + 20, 56);

const rectOverlapArea = (
    a: { left: number; top: number; right: number; bottom: number },
    b: { left: number; top: number; right: number; bottom: number }
) => {
    const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return width * height;
};

const getTooltipCandidate = (point: L.Point, labelWidth: number, direction: TooltipDirection) => {
    const labelHeight = 26;
    const gap = 14;
    const markerTopOffset = -28;
    const markerCenterY = point.y + markerTopOffset;

    if (direction === 'left') {
        return {
            direction,
            offset: [-12, -28] as [number, number],
            rect: { left: point.x - gap - labelWidth, top: markerCenterY - labelHeight / 2, right: point.x - gap, bottom: markerCenterY + labelHeight / 2 }
        };
    }

    if (direction === 'top') {
        return {
            direction,
            offset: [0, -44] as [number, number],
            rect: { left: point.x - labelWidth / 2, top: markerCenterY - gap - labelHeight, right: point.x + labelWidth / 2, bottom: markerCenterY - gap }
        };
    }

    if (direction === 'bottom') {
        return {
            direction,
            offset: [0, 4] as [number, number],
            rect: { left: point.x - labelWidth / 2, top: markerCenterY + gap, right: point.x + labelWidth / 2, bottom: markerCenterY + gap + labelHeight }
        };
    }

    return {
        direction,
        offset: [12, -28] as [number, number],
        rect: { left: point.x + gap, top: markerCenterY - labelHeight / 2, right: point.x + gap + labelWidth, bottom: markerCenterY + labelHeight / 2 }
    };
};

const clearProjectTooltips = (records: MarkerRecord[]) => {
    records.forEach(record => {
        record.marker.closeTooltip();
        record.marker.unbindTooltip();
    });
    document.querySelectorAll('.leaflet-tooltip.project-marker-label').forEach(element => element.remove());
};

const applyTooltipPlacements = (map: L.Map, records: MarkerRecord[], showLabels: boolean) => {
    clearProjectTooltips(records);
    if (!showLabels) {
        records.forEach(record => {
            record.marker.setIcon(createProjectIcon(record.color, record.project, record.labelDirection, false));
        });
        return;
    }

    const occupied: { left: number; top: number; right: number; bottom: number }[] = [];
    const markerPoints = records.map(record => map.latLngToLayerPoint([record.coord.lat, record.coord.lng]));
    const directions: TooltipDirection[] = ['right', 'left', 'top', 'bottom'];

    records
        .slice()
        .sort((a, b) => b.project.length - a.project.length)
        .forEach(record => {
            const point = map.latLngToLayerPoint([record.coord.lat, record.coord.lng]);
            const labelWidth = estimateLabelWidth(record.project);
            const best = directions
                .map(direction => {
                    const candidate = getTooltipCandidate(point, labelWidth, direction);
                    const labelOverlap = occupied.reduce((sum, rect) => sum + rectOverlapArea(candidate.rect, rect), 0);
                    const markerOverlap = markerPoints.reduce((sum, markerPoint) => {
                        if (markerPoint.equals(point)) return sum;
                        const markerRect = {
                            left: markerPoint.x - 16,
                            top: markerPoint.y - 42,
                            right: markerPoint.x + 16,
                            bottom: markerPoint.y + 4
                        };
                        return sum + rectOverlapArea(candidate.rect, markerRect) * 3;
                    }, 0);
                    const screenPenalty =
                        Math.max(0, -candidate.rect.left) +
                        Math.max(0, -candidate.rect.top) +
                        Math.max(0, candidate.rect.right - map.getSize().x) +
                        Math.max(0, candidate.rect.bottom - map.getSize().y);

                    return { ...candidate, score: labelOverlap + markerOverlap + screenPenalty * 20 };
                })
                .sort((a, b) => a.score - b.score)[0];

            record.labelDirection = best.direction;
            record.marker.setIcon(createProjectIcon(record.color, record.project, best.direction, showLabels));
            occupied.push(best.rect);
        });
};

const MapUpdater: React.FC<{
    data: HouseData[];
    hiddenRanges: string[];
    hiddenProjects: string[];
    showProjectLabels: boolean;
    onProgress: (processed: number, total: number, currentProject: string, located: number, pending: PendingGeoProject[]) => void;
    onProjects: (projects: ProjectLegendItem[]) => void;
}> = ({ data, hiddenRanges, hiddenProjects, showProjectLabels, onProgress, onProjects }) => {
    const map = useMap();
    const markerRecordsRef = useRef<MarkerRecord[]>([]);
    const showLabelsRef = useRef(showProjectLabels);

    useEffect(() => {
        showLabelsRef.current = showProjectLabels;
    }, [showProjectLabels]);

    useEffect(() => {
        markerRecordsRef.current.forEach(record => {
            const shouldShow = !hiddenRanges.includes(record.rangeLabel) && !hiddenProjects.includes(record.project);
            const isShown = map.hasLayer(record.marker);
            if (shouldShow && !isShown) record.marker.addTo(map);
            if (!shouldShow && isShown) record.marker.remove();
        });
    }, [hiddenRanges, hiddenProjects, map]);

    useEffect(() => {
        const handleMapResize = () => applyTooltipPlacements(map, markerRecordsRef.current, showProjectLabels);
        map.on('resize zoomend moveend', handleMapResize);
        return () => {
            map.off('resize zoomend moveend', handleMapResize);
        };
    }, [map, showProjectLabels]);

    useEffect(() => {
        applyTooltipPlacements(map, markerRecordsRef.current, showProjectLabels);
    }, [map, showProjectLabels]);

    useEffect(() => {
        markerRecordsRef.current.forEach(record => record.marker.remove());
        markerRecordsRef.current = [];

        let isMounted = true;
        const cache: GeoCache = GeoManager.loadCache();

        const process = async () => {
            if (data.length === 0) {
                onProgress(0, 0, '', 0, []);
                onProjects([]);
                return;
            }

            const grouped = d3.group(data, d => {
                if (d.project && d.project !== '(未命名)') return `project::${d.project}_${d.dist}`;
                return `addr::${d.address || d.id}`;
            }) as Map<string, HouseData[]>;

            let processedCount = 0;
            let locatedCount = 0;
            const pendingProjects: PendingGeoProject[] = [];
            const entries = Array.from(grouped.entries());
            const total = entries.length;

            for (const [, items] of entries) {
                if (!isMounted) break;

                const d = items[0];
                const displayTitle = d.project || d.address || d.id;
                onProgress(processedCount, total, displayTitle, locatedCount, pendingProjects);

                try {
                    const geocodePromise = GeoManager.geocode(d.address, d.dist, cache, d.project);
                    const timeoutPromise = new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 6000));
                    const coord = await Promise.race([geocodePromise, timeoutPromise]).catch(() => null);

                    if (coord && isMounted) {
                        locatedCount++;
                        const unit = Math.round(d3.mean(items, item => item.unit) || 0);
                        const range = PRICE_RANGES.find(item => item.test(unit)) || PRICE_RANGES[PRICE_RANGES.length - 1];
                        const projectName = d.project || d.address || d.id;
                        const marker = L.marker([coord.lat, coord.lng], { icon: createProjectIcon(range.color, projectName, 'right', false) });

                        const listHtml = `
                            <div class="p-4 flex flex-col gap-2 font-sans text-slate-700">
                                <div class="font-bold text-base border-b pb-2">${escapeHtml(d.project)} <span class="text-xs font-normal text-slate-500">(${items.length}筆)</span></div>
                                <div class="flex justify-between text-sm"><span>區域</span><span class="font-semibold">${escapeHtml(d.dist)}</span></div>
                                <div class="flex justify-between text-sm"><span>地址</span><span class="font-semibold text-xs text-right max-w-[220px] truncate" title="${escapeHtml(d.address)}">${escapeHtml(d.address)}</span></div>
                                <div class="flex justify-between text-sm"><span>均價</span><span class="font-semibold text-amber-600">${unit} 萬/坪</span></div>
                                <div class="mt-2 bg-slate-50 rounded p-2 border border-slate-200 max-h-32 overflow-y-auto">
                                    ${items.slice(0, 5).map(item => `
                                        <div class="flex justify-between text-xs py-1 border-b border-dashed border-slate-200 last:border-0">
                                            <span>${floorLabel(item.floor)} (${item.area}坪)</span>
                                            <span class="font-bold">${item.unit} 萬</span>
                                        </div>
                                    `).join('')}
                                    ${items.length > 5 ? `<div class="text-center text-xs text-slate-400 mt-1">還有 ${items.length - 5} 筆</div>` : ''}
                                </div>
                            </div>
                        `;

                        marker.bindPopup(listHtml);
                        marker.addTo(map);
                        markerRecordsRef.current.push({
                            marker,
                            rangeLabel: range.label,
                            project: projectName,
                            count: items.length,
                            dist: d.dist,
                            coord,
                            color: range.color,
                            labelDirection: 'right'
                        });
                    } else if (isMounted) {
                        pendingProjects.push({
                            project: d.project || '(未命名)',
                            address: d.address || '(無地址)',
                            dist: d.dist || '未知'
                        });
                    }
                } catch (err) {
                    console.error(`Error in geocoding loop for ${displayTitle}:`, err);
                } finally {
                    processedCount++;
                    if (isMounted) onProgress(processedCount, total, '', locatedCount, pendingProjects);
                    if (processedCount % 10 === 0) GeoManager.saveCache(cache);
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }

            if (isMounted) {
                GeoManager.saveCache(cache);
                const allMarkers = markerRecordsRef.current.map(record => record.marker);
                if (allMarkers.length > 0) {
                    const featureGroup = L.featureGroup(allMarkers);
                    map.fitBounds(featureGroup.getBounds(), { padding: [50, 50], maxZoom: 16 });
                    setTimeout(() => applyTooltipPlacements(map, markerRecordsRef.current, showLabelsRef.current), 0);
                }
                onProjects(markerRecordsRef.current
                    .map(record => ({ project: record.project, dist: record.dist, count: record.count }))
                    .sort((a, b) => b.count - a.count || a.project.localeCompare(b.project, 'zh-Hant')));
            }
        };

        process();

        return () => {
            isMounted = false;
            clearProjectTooltips(markerRecordsRef.current);
            markerRecordsRef.current.forEach(record => record.marker.remove());
            markerRecordsRef.current = [];
        };
    }, [data, map, onProgress, onProjects]);

    return null;
};

const InvalidateSize: React.FC<{ isActive: boolean; height: number }> = ({ isActive, height }) => {
    const map = useMap();
    useEffect(() => {
        if (isActive) {
            setTimeout(() => {
                map.invalidateSize();
                map.fire('resize');
            }, 100);
        }
    }, [isActive, height, map]);
    return null;
};

interface MapViewProps {
    data: HouseData[];
    isActive?: boolean;
}

const MapView: React.FC<MapViewProps> = ({ data, isActive = true }) => {
    const [progress, setProgress] = useState({
        current: 0,
        total: 0,
        located: 0,
        currentProject: '',
        pending: [] as PendingGeoProject[]
    });
    const [hiddenRanges, setHiddenRanges] = useState<string[]>([]);
    const [hiddenProjects, setHiddenProjects] = useState<string[]>([]);
    const [projectLegend, setProjectLegend] = useState<ProjectLegendItem[]>([]);
    const [showProjectLabels, setShowProjectLabels] = useState(true);
    const [mapHeight, setMapHeight] = useState(500);
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        setHiddenProjects([]);
        setProjectLegend([]);
    }, [data]);

    useEffect(() => {
        if (!isFullscreen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsFullscreen(false);
        };
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isFullscreen]);

    const handleProgress = React.useCallback((
        current: number,
        total: number,
        currentProject: string,
        located: number,
        pending: PendingGeoProject[]
    ) => {
        setProgress({ current, total, currentProject, located, pending: [...pending] });
    }, []);

    const toggleRange = (label: string) => {
        setHiddenRanges(prev =>
            prev.includes(label) ? prev.filter(item => item !== label) : [...prev, label]
        );
    };

    const toggleProject = (project: string) => {
        setHiddenProjects(prev =>
            prev.includes(project) ? prev.filter(item => item !== project) : [...prev, project]
        );
    };

    const visibleProjectCount = projectLegend.filter(item => {
        const rangeLabel = PRICE_RANGES.find(range => range.test(
            d3.mean(data.filter(row => row.project === item.project && row.dist === item.dist), row => row.unit) || 0
        ))?.label;

        return !hiddenProjects.includes(item.project) && (!rangeLabel || !hiddenRanges.includes(rangeLabel));
    }).length;

    return (
        <div className={isFullscreen ? 'fixed inset-0 z-[9999] bg-slate-50 p-4 overflow-y-auto' : 'relative w-full'}>
            <div className="flex justify-between items-center mb-4 p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="flex gap-4 items-center">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span>總建案</span> <span className="font-bold text-slate-900">{progress.total}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span>已定位</span> <span className="font-bold text-green-600">{progress.located}</span>
                    </div>
                    {progress.total > progress.located && progress.current >= progress.total && (
                        <div className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                            {progress.total - progress.located} 個地址未達精準定位標準，已略過
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-slate-400 hidden sm:inline italic">點擊圖例可切換顯示</span>
                    {progress.current < progress.total && progress.total > 0 && (
                        <div className="flex items-center gap-2">
                            {progress.currentProject && (
                                <span className="text-[10px] text-slate-300 font-mono truncate max-w-[100px] hidden sm:inline">
                                    {progress.currentProject}
                                </span>
                            )}
                            <div className="text-[10px] text-amber-500 font-black animate-pulse bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                                {Math.round((progress.current / progress.total) * 100)}%
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 mb-3 export-exclude">
                <div className="flex items-center gap-2 bg-white/85 backdrop-blur px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">目前顯示建案</span>
                    <span className="text-sm font-black text-slate-950">{visibleProjectCount}</span>
                    <span className="text-[10px] font-bold text-slate-400">/ {projectLegend.length}</span>
                </div>
                <div className="flex items-center gap-4 bg-white/80 backdrop-blur px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">調整圖表高度</span>
                    <input
                        type="range"
                        min="320"
                        max="760"
                        step="20"
                        value={mapHeight}
                        onChange={(e) => setMapHeight(Number(e.target.value))}
                        className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <span className="text-[10px] font-bold text-slate-600 min-w-[42px]">{mapHeight}px</span>
                    <button
                        onClick={() => setIsFullscreen(prev => !prev)}
                        className="ml-2 rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-black text-white shadow-sm transition-colors hover:bg-blue-600"
                    >
                        {isFullscreen ? '退出全螢幕' : '全螢幕'}
                    </button>
                </div>
            </div>

            <div className="w-full rounded-2xl overflow-hidden border border-slate-200 shadow-inner relative z-10" style={{ height: isFullscreen ? 'calc(100vh - 220px)' : `${mapHeight}px` }}>
                <MapContainer center={[25.05, 121.55]} zoom={12} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                        attribution='&copy; CARTO'
                    />
                    <MapUpdater
                        data={data}
                        hiddenRanges={hiddenRanges}
                        hiddenProjects={hiddenProjects}
                        showProjectLabels={showProjectLabels}
                        onProgress={handleProgress}
                        onProjects={setProjectLegend}
                    />
                    <InvalidateSize isActive={isActive || isFullscreen} height={isFullscreen ? window.innerHeight : mapHeight} />
                </MapContainer>
            </div>

            <div className="flex gap-2 flex-wrap mt-4 justify-center">
                {PRICE_RANGES.map(range => {
                    const isHidden = hiddenRanges.includes(range.label);
                    return (
                        <button
                            key={range.label}
                            onClick={() => toggleRange(range.label)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-300 group ${
                                isHidden
                                    ? 'bg-slate-50 border-slate-100 opacity-40 grayscale shadow-none'
                                    : 'bg-white border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md'
                            }`}
                        >
                            <div
                                className="w-2.5 h-2.5 rounded-sm transition-transform group-hover:scale-125"
                                style={{ backgroundColor: range.color }}
                            />
                            <span className={`text-[10px] font-bold ${isHidden ? 'text-slate-300 line-through' : 'text-slate-500'}`}>
                                {range.label}
                            </span>
                        </button>
                    );
                })}
            </div>

            {projectLegend.length > 0 && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm export-exclude">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                            <h3 className="text-sm font-black text-slate-900">案名圖例</h3>
                            <p className="text-[11px] font-bold text-slate-400 mt-1">點擊案名可隱藏或顯示地標，不會重新定位。</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                                onClick={() => setShowProjectLabels(prev => !prev)}
                                className={`text-[10px] font-black border px-3 py-1 rounded-full transition-colors ${
                                    showProjectLabels
                                        ? 'bg-slate-900 text-white border-slate-900 hover:bg-blue-600 hover:border-blue-600'
                                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                {showProjectLabels ? '關閉案名' : '打開案名'}
                            </button>
                        {hiddenProjects.length > 0 && (
                            <button
                                onClick={() => setHiddenProjects([])}
                                className="text-[10px] font-black text-blue-600 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full hover:bg-blue-100 transition-colors"
                            >
                                顯示全部
                            </button>
                        )}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto pr-1">
                        {projectLegend.map(item => {
                            const isHidden = hiddenProjects.includes(item.project);
                            return (
                                <button
                                    key={`${item.project}-${item.dist}`}
                                    onClick={() => toggleProject(item.project)}
                                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black transition-all ${
                                        isHidden
                                            ? 'bg-slate-50 border-slate-100 text-slate-300 line-through'
                                            : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-600 shadow-sm'
                                    }`}
                                    title={`${item.project}｜${item.dist}｜${item.count}筆`}
                                >
                                    <span>{item.project}</span>
                                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${isHidden ? 'bg-slate-100 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>
                                        {item.count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {progress.pending.length > 0 && progress.current >= progress.total && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div>
                            <h3 className="text-sm font-black text-amber-900">待校正建案</h3>
                            <p className="text-[11px] font-semibold text-amber-700 mt-1">
                                這些建案目前沒有足夠精準的座標，暫不放上地圖，避免誤標。
                            </p>
                        </div>
                        <span className="text-xs font-black text-amber-700 bg-white border border-amber-200 px-3 py-1 rounded-full">
                            {progress.pending.length} 筆
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                        {progress.pending.map((item, index) => (
                            <div
                                key={`${item.project}-${item.address}-${index}`}
                                className="rounded-xl bg-white border border-amber-100 px-3 py-2"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-black text-slate-900 truncate" title={item.project}>
                                        {item.project}
                                    </span>
                                    <span className="shrink-0 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                        {item.dist}
                                    </span>
                                </div>
                                <p className="text-[11px] font-semibold text-slate-500 mt-1 truncate" title={item.address}>
                                    {item.address}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MapView;
