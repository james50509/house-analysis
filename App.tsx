import React, { useState, useMemo, useRef, useEffect } from 'react';
import { HouseData, ParkingData, ViewTab } from './types';
import { processFiles } from './utils/data';
import MapView from './components/MapView';
import { Inspector } from './components/Inspector';
import { 
    VolumeChart, UnitPriceChart, RoomPieChart, 
    DistRoomTypeBar, ParkingAreaBar, TotalRoomTypeBar, AreaRoomTypeBar,
    ParkingPriceBar, DistrictMinTotalChart, UnitPriceDistributionChart,
    FloorUnitScatterChart, UnitPriceBoxplotChart, MonthlyTrendComboChart,
    DistrictRoomHeatmap, ProjectCompareMode
} from './components/charts/AnalysisCharts';
import { Boxplot } from './components/charts/D3Charts';
import { PremiumRateChart, TwoBedScatter, ScatterUnitAreaD3 } from './components/charts/AdvancedCharts';
import { DetailPanel } from './components/DetailPanel';
import { ProjectGrid } from './components/ProjectGrid';
import { Upload, Home, Map as MapIcon, BarChart3, Car, Info, MousePointer2, Layout, Download } from 'lucide-react';
import { toPng } from 'html-to-image';

type ActiveFilter = { type: 'dist' | 'room' | 'range' | 'none', key: string, sourceId: string, roomType?: string };

const formatFilterTitle = (filter: ActiveFilter) => {
    let label = filter.key;
    if (filter.sourceId === 'monthlyTrend') {
        const [month, dist, project] = filter.key.split('|');
        const parts = [month, dist && dist !== 'all' ? dist : '', project && project !== 'all' ? project : '']
            .filter(Boolean);
        label = parts.join('｜') || month || '篩選';
    } else if (filter.sourceId === 'minHouseTotal') {
        label = filter.key.split('|').filter(Boolean).join('｜');
    } else if (filter.sourceId === 'roomHeatmap') {
        label = filter.key.split('|').filter(Boolean).join('｜');
    } else if (filter.sourceId === 'roomDist') {
        label = filter.key.split('|').filter(Boolean).join('｜');
    }
    if (filter.roomType && filter.roomType !== '全部房型') {
        label = `${label}｜${filter.roomType}`;
    }
    return `【${label}】篩選結果`;
};

const ChartCard: React.FC<{
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    subtitle?: string;
    filterSource?: string;
    activeFilter: ActiveFilter;
    drillDownData: HouseData[];
    onClearFilter: () => void;
}> = ({ title, icon, children, subtitle, filterSource, activeFilter, drillDownData, onClearFilter }) => {
    const chartCardRef = useRef<HTMLDivElement>(null);
    const filterTitle = formatFilterTitle(activeFilter);

    const handleDownloadPng = async () => {
        if (!chartCardRef.current) return;
        try {
            const exportContainer = chartCardRef.current.querySelector('.export-container') as HTMLElement;
            if (!exportContainer) return;

            const dataUrl = await toPng(exportContainer, {
                backgroundColor: '#ffffff',
                pixelRatio: 2,
                cacheBust: true,
                filter: (node) => {
                    const exclusionClasses = ['export-exclude'];
                    return !exclusionClasses.some(className =>
                        node.classList?.contains(className)
                    );
                }
            });

            const link = document.createElement('a');
            link.download = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error('Export failed', err);
        }
    };

    return (
        <div ref={chartCardRef} className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden mb-8 w-full transition-all duration-700 ease-in-out">
            <div className="px-7 py-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-br from-white via-white to-slate-50/50">
                <div className="flex items-center gap-4">
                    <span className="p-3 bg-white rounded-2xl text-slate-600 shadow-md border border-slate-100 flex items-center justify-center transform group-hover:scale-110 transition-transform">{icon}</span>
                    <div>
                        <h3 className="font-black text-2xl text-slate-800 tracking-tight">{title}</h3>
                        <p className="text-[11px] font-bold text-slate-400 mt-1 flex items-center gap-2">
                            <MousePointer2 size={14} className="text-blue-500 animate-pulse" />
                            點擊圖表元素可篩選下方建案清單
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleDownloadPng}
                        className="flex items-center gap-2 text-xs font-black bg-slate-900 text-white rounded-2xl px-5 py-3 hover:bg-blue-600 transition-all shadow-lg active:scale-95"
                    >
                        <Download size={14} />
                        下載圖表 PNG
                    </button>
                </div>
            </div>
            <div className="p-5 chart-content-area">
                {subtitle && <p className="text-xs font-bold text-slate-500 mb-4 flex items-start gap-3 bg-blue-50/40 p-4 rounded-2xl border border-blue-100/40 leading-relaxed shadow-inner export-exclude line-clamp-2"><Info size={18} className="mt-0.5 shrink-0 text-blue-500" />{subtitle}</p>}
                <div className="w-full bg-white export-container p-1">
                    {children}
                </div>

                {activeFilter.sourceId === filterSource && activeFilter.sourceId !== 'none' && (
                    <div className="mt-5 pt-5 border-t border-slate-100 export-exclude">
                        <ProjectGrid
                            data={drillDownData}
                            title={filterTitle}
                            onClear={onClearFilter}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

const App: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<HouseData[]>([]);
    const [parkingData, setParkingData] = useState<ParkingData[]>([]);
    const [tab, setTab] = useState<ViewTab>('data');
    const [filterDist, setFilterDist] = useState<string>('all');
    const [activeFilter, setActiveFilter] = useState<ActiveFilter>({ type: 'none', key: '', sourceId: '' });
    const [logs, setLogs] = useState<string[]>([]);
    const [replaceOnUpload, setReplaceOnUpload] = useState(true);
    const [totalRangeRoomType, setTotalRangeRoomType] = useState('全部房型');
    const [areaRangeRoomType, setAreaRangeRoomType] = useState('全部房型');
    const [excludedProjects, setExcludedProjects] = useState<string[]>([]);
    const [compareProjects, setCompareProjects] = useState<string[]>([]);
    const [parkingBoxplotMode, setParkingBoxplotMode] = useState<'type' | 'floor'>('type');

    const matchRange = (val: number, rangeLabel: string) => {
        // Handle Chinese labels
        if (rangeLabel.includes('以上')) {
            const num = parseFloat(rangeLabel.replace(/[^\d.]/g, ''));
            return !isNaN(num) && val >= num;
        }
        if (rangeLabel.includes('以下')) {
            const num = parseFloat(rangeLabel.replace(/[^\d.]/g, ''));
            return !isNaN(num) && val < num;
        }

        const cleanRange = rangeLabel.replace(/[^\d.<≥\-]/g, '');
        if (cleanRange.startsWith('<')) return val < parseFloat(cleanRange.substring(1));
        if (cleanRange.startsWith('≥')) return val >= parseFloat(cleanRange.substring(1));
        if (cleanRange.includes('-')) {
            const [min, max] = cleanRange.split('-').map(parseFloat);
            return val >= min && val < max;
        }
        
        // If it's just a number string after cleanup, default to >= (fallback for older labels)
        const justNum = parseFloat(cleanRange);
        if (!isNaN(justNum)) return val >= justNum;

        return false;
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        setLoading(true);
        const files = Array.from(e.target.files || []) as File[];
        
        try {
            await new Promise(r => setTimeout(r, 100));
            const result = await processFiles(files);
            setData(prev => replaceOnUpload ? result.data : [...prev, ...result.data]);
            setParkingData(prev => replaceOnUpload ? result.parkingData : [...prev, ...result.parkingData]);
            setLogs(prev => replaceOnUpload ? result.logs : [...prev, ...result.logs]);
            setActiveFilter({ type: 'none', key: '', sourceId: '' });
            if (replaceOnUpload) {
                setExcludedProjects([]);
                setCompareProjects([]);
            }
        } catch (err) {
            console.error(err);
            alert("Error processing files");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setExcludedProjects(prev => prev.filter(project => data.some(row => row.project === project)));
        setCompareProjects(prev => prev.filter(project => data.some(row => row.project === project)).slice(0, 10));
    }, [data]);

    const districtFilteredData = useMemo(() => {
        if (filterDist === 'all') return data;
        return data.filter(d => d.dist === filterDist);
    }, [data, filterDist]);

    const filteredData = useMemo(() => {
        if (excludedProjects.length === 0) return districtFilteredData;
        return districtFilteredData.filter(d => !excludedProjects.includes(d.project));
    }, [districtFilteredData, excludedProjects]);

    const filteredParkingData = useMemo(() => {
        return parkingData
            .filter(item => filterDist === 'all' || item.dist === filterDist)
            .filter(item => excludedProjects.length === 0 || !excludedProjects.includes(item.project));
    }, [parkingData, filterDist, excludedProjects]);

    const drillDownData = useMemo(() => {
        if (activeFilter.sourceId === 'minHouseTotal') {
            const [dist, roomType] = activeFilter.key.split('|');
            const rows = filteredData.filter(d => d.dist === dist && d.type === roomType);
            const minTotal = Math.min(...rows.map(d => d.houseTotal > 0 ? d.houseTotal : d.total).filter(v => v > 0));
            return rows.filter(d => (d.houseTotal > 0 ? d.houseTotal : d.total) === minTotal);
        }
        if (activeFilter.sourceId === 'unitDistribution') {
            const [min, max] = activeFilter.key.split('-').map(Number);
            if (Number.isFinite(min) && Number.isFinite(max)) {
                return filteredData.filter(d => d.unit >= min && d.unit < max);
            }
        }
        if (activeFilter.sourceId === 'unitBoxplot') {
            const [mode, ...keyParts] = activeFilter.key.split(':');
            const key = keyParts.join(':');
            if (mode === 'project') return filteredData.filter(d => d.project === key);
            if (mode === 'dist') return filteredData.filter(d => d.dist === key);
        }
        if (activeFilter.sourceId === 'monthlyTrend') {
            const [month, dist, project] = activeFilter.key.split('|');
            return filteredData
                .filter(d => d.month === month)
                .filter(d => !dist || dist === 'all' || d.dist === dist)
                .filter(d => !project || project === 'all' || d.project === project);
        }
        if (activeFilter.sourceId === 'projectCompare') {
            return filteredData.filter(d => d.project === activeFilter.key);
        }
        if (activeFilter.sourceId === 'roomHeatmap') {
            const [dist, roomType] = activeFilter.key.split('|');
            return filteredData
                .filter(d => d.dist === dist)
                .filter(d => !roomType || d.type === roomType);
        }
        if (activeFilter.sourceId === 'roomDist') {
            const [dist, roomType] = activeFilter.key.split('|');
            return filteredData
                .filter(d => d.dist === dist)
                .filter(d => !roomType || d.type === roomType);
        }
        if (activeFilter.type === 'dist') return filteredData.filter(d => d.dist === activeFilter.key);
        if (activeFilter.type === 'room') return filteredData.filter(d => d.type === activeFilter.key);
        if (activeFilter.type === 'range') {
            const prop = activeFilter.sourceId === 'totalRange' ? 'total' : 'area';
            return filteredData
                .filter(d => matchRange(d[prop], activeFilter.key))
                .filter(d => !activeFilter.roomType || activeFilter.roomType === '全部房型' || d.type === activeFilter.roomType);
        }
        return filteredData;
    }, [filteredData, activeFilter]);

    const districts = useMemo(() => Array.from(new Set(data.map(d => d.dist))).sort(), [data]);
    const updateActiveFilterWithoutScrollJump = (nextFilter: ActiveFilter) => {
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        setActiveFilter(nextFilter);
        const restoreScroll = () => window.scrollTo({ left: scrollX, top: scrollY, behavior: 'auto' });
        requestAnimationFrame(() => {
            restoreScroll();
            requestAnimationFrame(restoreScroll);
        });
        [80, 220, 500, 900].forEach(delay => window.setTimeout(restoreScroll, delay));
    };
    const chartCardProps = {
        activeFilter,
        drillDownData,
        onClearFilter: () => updateActiveFilterWithoutScrollJump({ type: 'none', key: '', sourceId: '' })
    };
    const clearSelectionSources = new Set(['totalRange', 'areaRange', 'roomDist', 'roomHeatmap']);
    const handlePageClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!clearSelectionSources.has(activeFilter.sourceId)) return;
        const target = event.target as HTMLElement;
        if (target.closest('[data-filter-segment="true"]')) return;
        setActiveFilter({ type: 'none', key: '', sourceId: '' });
    };

    const LegacyChartCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; subtitle?: string; filterSource?: string }> = ({ title, icon, children, subtitle, filterSource }) => {
        const chartCardRef = useRef<HTMLDivElement>(null);
        const filterTitle = formatFilterTitle(activeFilter);

        const handleDownloadPng = async () => {
            if (!chartCardRef.current) return;
            try {
                const exportContainer = chartCardRef.current.querySelector('.export-container') as HTMLElement;
                if (!exportContainer) return;

                const dataUrl = await toPng(exportContainer, {
                    backgroundColor: '#ffffff',
                    pixelRatio: 2,
                    cacheBust: true,
                    filter: (node) => {
                        const exclusionClasses = ['export-exclude'];
                        return !exclusionClasses.some(className => 
                            node.classList?.contains(className)
                        );
                    }
                });

                const link = document.createElement('a');
                link.download = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.png`;
                link.href = dataUrl;
                link.click();
            } catch (err) {
                console.error('Export failed', err);
            }
        };

        return (
            <div ref={chartCardRef} className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden mb-8 w-full transition-all duration-700 ease-in-out">
                <div className="px-7 py-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-br from-white via-white to-slate-50/50">
                    <div className="flex items-center gap-4">
                        <span className="p-3 bg-white rounded-2xl text-slate-600 shadow-md border border-slate-100 flex items-center justify-center transform group-hover:scale-110 transition-transform">{icon}</span>
                        <div>
                            <h3 className="font-black text-2xl text-slate-800 tracking-tight">{title}</h3>
                            <p className="text-[11px] font-bold text-slate-400 mt-1 flex items-center gap-2">
                                <MousePointer2 size={14} className="text-blue-500 animate-pulse" />
                                點擊圖表元素可篩選下方建案清單
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={handleDownloadPng}
                            className="flex items-center gap-2 text-xs font-black bg-slate-900 text-white rounded-2xl px-5 py-3 hover:bg-blue-600 transition-all shadow-lg active:scale-95"
                        >
                            <Download size={14} />
                            下載圖表 PNG
                        </button>
                    </div>
                </div>
                <div className="p-5 chart-content-area">
                    {subtitle && <p className="text-xs font-bold text-slate-500 mb-4 flex items-start gap-3 bg-blue-50/40 p-4 rounded-2xl border border-blue-100/40 leading-relaxed shadow-inner export-exclude line-clamp-2"><Info size={18} className="mt-0.5 shrink-0 text-blue-500" />{subtitle}</p>}
                    <div className="w-full bg-white export-container p-1">
                        {children}
                    </div>
                    
                    {activeFilter.sourceId === filterSource && activeFilter.sourceId !== 'none' && (
                        <div className="mt-5 pt-5 border-t border-slate-100 export-exclude">
                            <ProjectGrid 
                                data={drillDownData} 
                                title={filterTitle} 
                                onClear={() => setActiveFilter({ type: 'none', key: '', sourceId: '' })}
                            />
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans flex flex-col scroll-smooth" onClick={handlePageClick}>
            <div className="sticky top-0 z-[100] bg-slate-50/80 backdrop-blur-2xl pb-3 pt-4 px-6 border-b border-slate-200/50">
                <div className="max-w-screen-2xl mx-auto flex flex-col lg:flex-row justify-between items-end gap-4">
                    <div>
                        <div className="flex items-center gap-4 mb-1">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[1.25rem] flex items-center justify-center shadow-xl shadow-blue-200 ring-4 ring-white">
                                <Home className="text-white" size={28} />
                            </div>
                            <div>
                                <h1 className="text-4xl font-black text-slate-900 tracking-tighter">雙北實價登錄深度分析 <span className="text-blue-600 font-black ml-1 text-2xl">v5.2</span></h1>
                                <p className="text-slate-500 text-sm font-bold mt-1 uppercase tracking-[0.3em]">Interactive Market Intelligence Dashboard</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-white/60 backdrop-blur-md shadow-2xl border border-slate-200 rounded-[2rem] p-2 flex gap-1">
                        {[
                            { id: 'data', label: '地圖與資料', icon: MapIcon },
                            { id: 'market', label: '市場概況', icon: BarChart3 },
                            { id: 'room', label: '房型配比', icon: Home },
                            { id: 'parking', label: '車位概況', icon: Car },
                        ].map(t => (
                            <button
                                key={t.id}
                                onClick={() => { setTab(t.id as ViewTab); setActiveFilter({ type: 'none', key: '', sourceId: '' }); }}
                                className={`px-6 py-3 rounded-[1.25rem] text-sm font-black flex items-center gap-3 transition-all duration-500 ${
                                    tab === t.id 
                                    ? 'bg-blue-600 text-white shadow-[0_10px_30px_rgba(37,99,235,0.4)] scale-105' 
                                    : 'text-slate-500 hover:bg-white hover:text-slate-800'
                                }`}
                            >
                                <t.icon size={22} />
                                <span className="hidden sm:inline">{t.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="max-w-screen-2xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 px-6 pb-16 w-full mt-6">
                <div className="lg:col-span-3 h-fit lg:sticky lg:top-28">
                    <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200 max-h-[calc(100vh-9rem)] overflow-y-auto custom-scrollbar">
                        <h3 className="font-black text-slate-900 mb-10 flex items-center gap-5 text-2xl">
                            <div className="p-3 bg-blue-100 rounded-2xl shadow-inner"><Upload size={24} className="text-blue-600" /></div>
                            資料中心
                        </h3>
                        <div className="space-y-8">
                            <div>
                                <label className="block text-[11px] font-black text-slate-400 mb-3 uppercase tracking-[0.2em]">匯入實價登錄單據</label>
                                <div className="relative group">
                                    <input 
                                        type="file" 
                                        multiple 
                                        accept=".xlsx,.xls,.csv" 
                                        onChange={handleFileUpload}
                                        className="block w-full text-xs text-slate-500 file:mr-5 file:py-4 file:px-8 file:rounded-2xl file:border-0 file:text-xs file:font-black file:bg-slate-900 file:text-white hover:file:bg-blue-600 file:transition-all cursor-pointer"
                                    />
                                </div>
                                <label className="mt-4 flex items-center gap-3 text-xs font-black text-slate-500 select-none">
                                    <input
                                        type="checkbox"
                                        checked={replaceOnUpload}
                                        onChange={(e) => setReplaceOnUpload(e.target.checked)}
                                        className="h-4 w-4 accent-blue-600"
                                    />
                                    匯入前清空舊資料
                                </label>
                            </div>

                            <div className="pt-8 border-t border-slate-100">
                                <label className="block text-[11px] font-black text-slate-400 mb-3 uppercase tracking-[0.2em]">行政區篩選</label>
                                <select 
                                    className="w-full p-5 bg-slate-50 border border-slate-200 rounded-3xl text-sm font-black outline-none focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none cursor-pointer"
                                    value={filterDist}
                                    onChange={(e) => { setFilterDist(e.target.value); setActiveFilter({ type: 'none', key: '', sourceId: '' }); }}
                                >
                                    <option value="all">顯示全部行政區 (GLOBAL)</option>
                                    {districts.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </div>
                            
                            <button onClick={() => { setData([]); setParkingData([]); setLogs([]); setExcludedProjects([]); setCompareProjects([]); setActiveFilter({ type: 'none', key: '', sourceId: '' }); }} className="w-full py-5 bg-rose-50 text-rose-600 rounded-[1.5rem] text-xs font-black hover:bg-rose-500 hover:text-white transition-all duration-300 uppercase tracking-widest border border-rose-100 shadow-sm">清空目前所有資料</button>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">有效成交</div>
                                    <div className="mt-1 text-2xl font-black text-slate-900">{filteredData.length}</div>
                                </div>
                                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">車位資料</div>
                                    <div className="mt-1 text-2xl font-black text-slate-900">{filteredParkingData.length}</div>
                                </div>
                            </div>

                            {logs.length > 0 && (
                                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 max-h-32 overflow-y-auto custom-scrollbar">
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">匯入紀錄</div>
                                    <div className="space-y-1">
                                        {logs.slice(-8).map((log, i) => (
                                            <div key={`${log}-${i}`} className="text-[10px] font-bold text-slate-500 truncate" title={log}>{log}</div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {tab === 'data' && (
                            <div className="mt-10 pt-10 border-t border-slate-100 pb-4">
                                <Inspector data={data} />
                            </div>
                        )}
                        <div className="mt-10 pt-10 border-t border-slate-100">
                            <DetailPanel
                                data={drillDownData}
                                projectData={districtFilteredData}
                                excludedProjects={excludedProjects}
                                onExcludedProjectsChange={setExcludedProjects}
                                compareProjects={compareProjects}
                                onCompareProjectsChange={setCompareProjects}
                            />
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-9">
                    <div className={tab === 'data' ? 'block animate-in fade-in duration-700' : 'hidden'}>
                        <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-10 border-b border-slate-100 mb-8 flex justify-between items-center bg-gradient-to-r from-slate-50/50 to-white">
                                <h2 className="text-3xl font-black text-slate-900 flex items-center gap-5">📍 地理分佈全覽</h2>
                                <span className="text-[10px] font-black bg-emerald-100 text-emerald-600 px-5 py-2 rounded-full uppercase tracking-widest border border-emerald-200 shadow-sm">Real-time Map Integration</span>
                            </div>
                            <MapView data={filteredData} isActive={tab === 'data'} />
                        </div>
                    </div>

                    {tab === 'market' && (
                        <div className="space-y-16">
                            <ChartCard {...chartCardProps} title="成交量排行榜" icon={<BarChart3 size={32} className="text-blue-600" />} filterSource="volume">
                                <VolumeChart data={filteredData} onSelect={(k) => updateActiveFilterWithoutScrollJump({ type: 'dist', key: k, sourceId: 'volume' })} />
                            </ChartCard>
                            
                            <ChartCard {...chartCardProps} title="平均單價分佈 (扣車位)" icon={<Home size={32} className="text-amber-500" />} filterSource="unitPrice">
                                <UnitPriceChart data={filteredData} onSelect={(k) => updateActiveFilterWithoutScrollJump({ type: 'dist', key: k, sourceId: 'unitPrice' })} />
                            </ChartCard>

                            <ChartCard {...chartCardProps} title="各房型最低房屋總價" icon={<Home size={32} className="text-sky-600" />} filterSource="minHouseTotal" subtitle="僅統計 1房、2房、3房、4房；已排除開放格局與其他。">
                                <DistrictMinTotalChart data={filteredData} onSelect={(k) => updateActiveFilterWithoutScrollJump({ type: 'range', key: k, sourceId: 'minHouseTotal' })} />
                            </ChartCard>

                            <ChartCard {...chartCardProps} title="單價分布" icon={<BarChart3 size={32} className="text-teal-600" />} filterSource="unitDistribution">
                                <UnitPriceDistributionChart data={filteredData} onSelect={(k) => updateActiveFilterWithoutScrollJump({ type: 'range', key: k, sourceId: 'unitDistribution' })} />
                            </ChartCard>

                            <ChartCard {...chartCardProps} title="樓層 vs 單價分析 (垂直價差)" icon={<BarChart3 size={32} className="text-indigo-600" />} filterSource="floorUnit">
                                <FloorUnitScatterChart data={filteredData} onSelect={(k) => updateActiveFilterWithoutScrollJump({ type: 'dist', key: k, sourceId: 'floorUnit' })} />
                            </ChartCard>

                            <ChartCard {...chartCardProps} title="單價箱型圖" icon={<BarChart3 size={32} className="text-blue-600" />} filterSource="unitBoxplot">
                                <UnitPriceBoxplotChart data={filteredData} onSelect={(k) => updateActiveFilterWithoutScrollJump({ type: 'range', key: k, sourceId: 'unitBoxplot' })} />
                            </ChartCard>

                            <ChartCard {...chartCardProps} title="成交量&平均單價趨勢" icon={<BarChart3 size={32} className="text-orange-500" />} filterSource="monthlyTrend">
                                <MonthlyTrendComboChart data={filteredData} onSelect={(k) => updateActiveFilterWithoutScrollJump({ type: 'range', key: k, sourceId: 'monthlyTrend' })} />
                            </ChartCard>

                            <ChartCard {...chartCardProps} 
                                title="個案價值對比矩陣 (個案 vs 區域行情)" 
                                icon={<BarChart3 size={32} className="text-indigo-600" />} 
                                subtitle="分析建案相對於行政區平均行情的價位分佈。位於虛線上方的圓點表示單價高於區域平均（溢價），位於虛線下方則表示低於區域平均（折價）。點擊氣泡可篩選行政區。"
                                filterSource="premium"
                            >
                                <PremiumRateChart data={filteredData} onSelect={(k) => updateActiveFilterWithoutScrollJump({ type: 'dist', key: k, sourceId: 'premium' })} />
                            </ChartCard>

                            <ChartCard {...chartCardProps} title="市場定位分析 (坪數 vs 單價)" icon={<BarChart3 size={32} className="text-emerald-600" />} filterSource="marketPos">
                                <ScatterUnitAreaD3 data={filteredData} onSelect={(k) => updateActiveFilterWithoutScrollJump({ type: 'dist', key: k, sourceId: 'marketPos' })} />
                            </ChartCard>

                            <ChartCard {...chartCardProps} title="建案比較模式" icon={<BarChart3 size={32} className="text-amber-500" />} filterSource="projectCompare">
                                <ProjectCompareMode data={filteredData} selectedProjects={compareProjects} onSelect={(k) => updateActiveFilterWithoutScrollJump({ type: 'range', key: k, sourceId: 'projectCompare' })} />
                            </ChartCard>
                        </div>
                    )}

                    {tab === 'room' && (
                        <div className="space-y-16">
                            <ChartCard {...chartCardProps} title="核心房型佔比" icon={<Home size={32} className="text-pink-600" />} filterSource="roomPie">
                                <RoomPieChart data={filteredData} onSelect={(k) => updateActiveFilterWithoutScrollJump({ type: 'room', key: k, sourceId: 'roomPie' })} />
                            </ChartCard>

                            <ChartCard {...chartCardProps} 
                                title="總價級距 × 房型 (房屋總價)" 
                                icon={<Layout size={32} className="text-blue-500" />} 
                                subtitle="分析不同總價預算範圍內的房型組成比例。每個級距為 250 萬，幫助了解各預算層級的主流產品。"
                                filterSource="totalRange"
                            >
                                <TotalRoomTypeBar
                                    data={filteredData}
                                    selectedRoomType={totalRangeRoomType}
                                    onRoomTypeChange={setTotalRangeRoomType}
                                    selectedSegment={activeFilter.sourceId === 'totalRange' ? { group: activeFilter.key, roomType: activeFilter.roomType } : undefined}
                                    onSelect={(k, roomType) => updateActiveFilterWithoutScrollJump({ type: 'range', key: k, sourceId: 'totalRange', roomType: roomType || totalRangeRoomType })}
                                />
                            </ChartCard>

                            <ChartCard {...chartCardProps} 
                                title="淨坪數級距 × 房型" 
                                icon={<Layout size={32} className="text-emerald-500" />} 
                                subtitle="分析房屋坪數大小與房型的配置關係，揭示市場上各面積區間的規劃趨勢。"
                                filterSource="areaRange"
                            >
                                <AreaRoomTypeBar
                                    data={filteredData}
                                    selectedRoomType={areaRangeRoomType}
                                    onRoomTypeChange={setAreaRangeRoomType}
                                    selectedSegment={activeFilter.sourceId === 'areaRange' ? { group: activeFilter.key, roomType: activeFilter.roomType } : undefined}
                                    onSelect={(k, roomType) => updateActiveFilterWithoutScrollJump({ type: 'range', key: k, sourceId: 'areaRange', roomType: roomType || areaRangeRoomType })}
                                />
                            </ChartCard>

                            <ChartCard {...chartCardProps} title="區域房型結構分析" icon={<BarChart3 size={32} className="text-sky-600" />} filterSource="roomDist">
                                <DistRoomTypeBar
                                    data={filteredData}
                                    selectedSegment={activeFilter.sourceId === 'roomDist' ? { group: activeFilter.key.split('|')[0], roomType: activeFilter.key.split('|')[1] } : undefined}
                                    onSelect={(k, roomType) => updateActiveFilterWithoutScrollJump({ type: 'dist', key: roomType ? `${k}|${roomType}` : k, sourceId: 'roomDist' })}
                                />
                            </ChartCard>

                            <ChartCard {...chartCardProps} title="各行政區房型分佈熱力圖" icon={<BarChart3 size={32} className="text-cyan-600" />} filterSource="roomHeatmap">
                                <DistrictRoomHeatmap
                                    data={filteredData}
                                    selectedSegment={activeFilter.sourceId === 'roomHeatmap' ? { group: activeFilter.key.split('|')[0], roomType: activeFilter.key.split('|')[1] } : undefined}
                                    onSelect={(k, roomType) => updateActiveFilterWithoutScrollJump({ type: 'range', key: roomType ? `${k}|${roomType}` : k, sourceId: 'roomHeatmap' })}
                                />
                            </ChartCard>

                            <ChartCard {...chartCardProps} title="2房核心研究" icon={<Home size={32} className="text-rose-600" />} subtitle="探討兩房產品在不同衛浴配置下的總價門檻。" filterSource="twoBed">
                                <TwoBedScatter data={filteredData} onSelect={(k) => updateActiveFilterWithoutScrollJump({ type: 'dist', key: k, sourceId: 'twoBed' })} />
                            </ChartCard>
                        </div>
                    )}

                    {tab === 'parking' && (
                        <div className="space-y-16">
                            <ChartCard {...chartCardProps} title="車位價格分析 (平均單價)" icon={<Car size={32} className="text-blue-600" />}>
                                <ParkingPriceBar data={filteredParkingData} />
                            </ChartCard>

                            <ChartCard {...chartCardProps} title={'\u8eca\u4f4d\u50f9\u683c\u5206\u6790 (\u4f9d\u985e\u5225 / \u4f9d\u6a13\u5c64)'} icon={<Car size={32} className="text-slate-700" />}>
                                <div className="export-exclude mb-5 flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setParkingBoxplotMode('type')}
                                        className={`rounded-xl border px-5 py-2.5 text-sm font-black transition-all ${
                                            parkingBoxplotMode === 'type'
                                                ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-100'
                                                : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-600'
                                        }`}
                                    >
                                        {'\u4f9d\u985e\u5225'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setParkingBoxplotMode('floor')}
                                        className={`rounded-xl border px-5 py-2.5 text-sm font-black transition-all ${
                                            parkingBoxplotMode === 'floor'
                                                ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-100'
                                                : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-600'
                                        }`}
                                    >
                                        {'\u4f9d\u6a13\u5c64'}
                                    </button>
                                </div>
                                <Boxplot
                                    data={filteredParkingData}
                                    groupBy={parkingBoxplotMode}
                                    xLabel={parkingBoxplotMode === 'type' ? '\u8eca\u4f4d\u985e\u5225' : '\u505c\u8eca\u5c64\u4f4d'}
                                />
                            </ChartCard>



                            <ChartCard {...chartCardProps} title="房屋級距與車位配比" icon={<Car size={32} className="text-blue-600" />} filterSource="parkingRatio">
                                <ParkingAreaBar data={filteredData} onSelect={(k) => updateActiveFilterWithoutScrollJump({ type: 'range', key: k, sourceId: 'parkingRatio' })} />
                            </ChartCard>
                        </div>
                    )}
                </div>
            </div>

            {loading && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-3xl z-[500] flex flex-col items-center justify-center transition-all duration-1000">
                    <div className="relative">
                        <div className="w-32 h-32 border-[8px] border-blue-100/20 border-t-blue-500 rounded-full animate-spin shadow-2xl"></div>
                        <div className="absolute inset-0 flex items-center justify-center text-blue-400">
                            <Home size={40} className="animate-bounce" />
                        </div>
                    </div>
                    <div className="mt-14 flex flex-col items-center gap-4">
                        <div className="text-white font-black text-3xl tracking-[0.4em] uppercase animate-pulse">Processing Market Data</div>
                        <div className="w-64 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 animate-[loading_2s_infinite]"></div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
