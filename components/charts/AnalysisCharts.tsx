import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, Cell, PieChart, Pie, ComposedChart, Line, LabelList } from 'recharts';
import { HouseData } from '../../types';
import * as d3 from 'd3';
import { Car } from 'lucide-react';
import { toPng } from 'html-to-image';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b', '#06b6d4'];
const ROOM_KEYS = ['1房', '2房', '3房', '4房', '開放格局', '其他'];
const ROOM_COLORS: { [key: string]: string } = {
    '1房': '#3b82f6',
    '2房': '#10b981',
    '3房': '#f59e0b',
    '4房': '#ef4444',
    '開放格局': '#94a3b8',
    '其他': '#8b5cf6'
};

// Keep the x-axis compact; y-axis units are shown on the left side to save vertical space.
const COMMON_MARGIN = { top: 34, right: 28, left: 64, bottom: 42 };
const CHART_HEIGHT = 480; 
const X_AXIS_DY = 12; // 讓斜排文字與軸線保留可讀距離
const X_AXIS_HEIGHT = 44; 
const STACKED_MARGIN = { top: 34, right: 28, left: 64, bottom: 38 };
const STACKED_X_AXIS_HEIGHT = 44;
const PROJECT_COMPARE_MONTHLY_MARGIN = { top: 28, right: 72, left: 64, bottom: 74 };

interface ChartProps {
    data: HouseData[];
    onSelect?: (key: string, roomType?: string) => void;
}

interface ProjectCompareProps {
    data: HouseData[];
    selectedProjects: string[];
    onSelect?: (key: string, roomType?: string) => void;
}

interface RoomTypeSelectorProps extends ChartProps {
    selectedRoomType?: string;
    onRoomTypeChange?: (value: string) => void;
    selectedSegment?: { group: string; roomType?: string };
}

const LegendSection: React.FC<{ 
    items: { name: string, color: string }[], 
    hiddenItems?: string[], 
    onToggle?: (name: string) => void 
}> = ({ items, hiddenItems = [], onToggle }) => (
    <div className="mt-2">
        <div className="w-full h-px bg-slate-100 mb-2" />
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 px-3">
            {items.map((item, i) => {
                const isHidden = hiddenItems.includes(item.name);
                return (
                    <div 
                        key={i} 
                        className={`flex items-center gap-2.5 cursor-pointer transition-all duration-200 select-none ${isHidden ? 'opacity-30 grayscale' : 'opacity-100 hover:scale-105'}`}
                        onClick={() => onToggle?.(item.name)}
                    >
                        <div className="w-3 h-3 rounded-sm shadow-sm" style={{ backgroundColor: item.color }} />
                        <span className="text-[12px] font-black text-slate-800 tracking-tight">{item.name}</span>
                    </div>
                );
            })}
        </div>
    </div>
);

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const visiblePayload = payload.filter((entry: any) => entry?.dataKey !== 'visibleTotal');
        return (
            <div className="bg-white/82 backdrop-blur-xl p-5 border border-white/80 ring-1 ring-slate-900/10 shadow-[0_24px_70px_rgba(15,23,42,0.32)] rounded-2xl text-sm min-w-[190px] text-slate-950">
                <p className="font-black text-slate-950 mb-3 border-b border-slate-300/70 pb-2 drop-shadow-[0_1px_0_rgba(255,255,255,0.9)]">{label}</p>
                {visiblePayload.map((entry: any, index: number) => {
                    if (!entry || entry.value === undefined) return null;
                    return (
                        <div key={index} className="flex justify-between gap-8 py-1.5">
                            <span className="font-black text-slate-800 drop-shadow-[0_1px_0_rgba(255,255,255,0.85)]">{entry.name}:</span>
                            <span className="font-black" style={{ color: entry.color }}>{entry.value} 筆</span>
                        </div>
                    );
                })}
            </div>
        );
    }
    return null;
};

const AxisSideLabel: React.FC<{ value?: string }> = ({ value }) => {
    if (!value) return null;
    return (
        <div className="absolute left-5 top-[35%] -translate-y-1/2 text-[13px] font-black text-slate-700 tracking-wide leading-tight [writing-mode:vertical-rl] pointer-events-none">
            {value}
        </div>
    );
};

const formatWan = (value: number) => Math.round(value).toLocaleString('zh-TW');

const MinTotalValueLabel = (props: any) => {
    const { x, y, width, height, value, fill, allMode, index } = props;
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
    const centerX = Number(x) + Number(width) / 2;
    const allModeInside = Boolean(allMode) && Number(height) > 24;
    const textY = allModeInside ? Number(y) + 15 + (Number(index) % 2) * 8 : Number(y) - 8 - (Number(index) % 2) * 10;
    return (
        <text
            x={centerX}
            y={textY}
            textAnchor="middle"
            fontSize={allModeInside ? 10 : 13}
            fontWeight={950}
            fill={allModeInside ? '#0f172a' : fill}
            stroke="#ffffff"
            strokeWidth={allModeInside ? 2.5 : 3}
            paintOrder="stroke"
        >
            {formatWan(numericValue)}
        </text>
    );
};

const appendChartCrosshair = (
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    width: number,
    height: number
) => {
    const crosshair = g.append("g")
        .attr("class", "chart-crosshair")
        .style("display", "none")
        .style("pointer-events", "none");

    const vertical = crosshair.append("line")
        .attr("y1", 0)
        .attr("y2", height)
        .attr("stroke", "#0f172a")
        .attr("stroke-width", 1.2)
        .attr("stroke-dasharray", "5,5")
        .attr("opacity", 0.38);

    const horizontal = crosshair.append("line")
        .attr("x1", 0)
        .attr("x2", width)
        .attr("stroke", "#0f172a")
        .attr("stroke-width", 1.2)
        .attr("stroke-dasharray", "5,5")
        .attr("opacity", 0.38);

    const xLabel = crosshair.append("text")
        .attr("y", height + 42)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .style("font-weight", "950")
        .style("fill", "#0f172a")
        .style("paint-order", "stroke")
        .style("stroke", "#ffffff")
        .style("stroke-width", 4);

    const yLabel = crosshair.append("text")
        .attr("x", -16)
        .attr("text-anchor", "end")
        .style("font-size", "12px")
        .style("font-weight", "950")
        .style("fill", "#0f172a")
        .style("paint-order", "stroke")
        .style("stroke", "#ffffff")
        .style("stroke-width", 4);

    return { crosshair, vertical, horizontal, xLabel, yLabel };
};

const CrosshairToggle: React.FC<{ enabled: boolean; onToggle: () => void }> = ({ enabled, onToggle }) => (
    <button
        type="button"
        onClick={onToggle}
        className={`text-[10px] font-black px-4 py-2 rounded-xl border transition-all uppercase tracking-widest ${
            enabled
                ? 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100'
                : 'border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200'
        }`}
    >
        十字虛線 {enabled ? 'ON' : 'OFF'}
    </button>
);

const getHouseTotal = (item: HouseData) => item.houseTotal > 0 ? item.houseTotal : item.total;

const projectColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) {
        hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    }
    const hue = ((hash % 997) * 137.508 + 24) % 360;
    const saturation = 0.72 + (hash % 3) * 0.08;
    const lightness = 0.42 + ((hash >>> 3) % 3) * 0.08;
    return d3.hsl(hue, saturation, lightness).formatHex();
};

const distinctProjectColor = (index: number) => {
    const hue = (index * 137.508 + 24) % 360;
    const saturation = 0.72 + (index % 3) * 0.08;
    const lightness = 0.42 + (Math.floor(index / 3) % 3) * 0.08;
    return d3.hsl(hue, saturation, lightness).formatHex();
};

const EmptyChart: React.FC<{ message: string }> = ({ message }) => (
    <div className="w-full h-[280px] flex items-center justify-center rounded-[2rem] border border-dashed border-slate-200 bg-slate-50/50">
        <div className="text-sm font-black text-slate-400 tracking-widest">{message}</div>
    </div>
);

const useClearTooltipOutsideChart = <T extends Element>(
    chartRef: React.RefObject<T>,
    clearTooltip: () => void,
    isActive: boolean
) => {
    React.useEffect(() => {
        if (!isActive) return;

        const handlePointerMove = (event: PointerEvent) => {
            const chart = chartRef.current;
            if (!chart) {
                clearTooltip();
                return;
            }
            const rect = chart.getBoundingClientRect();
            const padding = 2;
            const isInside =
                event.clientX >= rect.left - padding &&
                event.clientX <= rect.right + padding &&
                event.clientY >= rect.top - padding &&
                event.clientY <= rect.bottom + padding;
            if (!isInside) clearTooltip();
        };

        window.addEventListener('pointermove', handlePointerMove, true);
        window.addEventListener('scroll', clearTooltip, true);
        window.addEventListener('blur', clearTooltip);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove, true);
            window.removeEventListener('scroll', clearTooltip, true);
            window.removeEventListener('blur', clearTooltip);
        };
    }, [chartRef, clearTooltip, isActive]);
};

const formatDateLabel = (date: Date | null, fallback?: string | null) => {
    if (!date) return fallback || '-';
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export const ProjectCompareMode: React.FC<ProjectCompareProps> = ({ data, selectedProjects, onSelect }) => {
    const summaryChartRef = React.useRef<HTMLDivElement>(null);
    const monthlyChartRef = React.useRef<HTMLDivElement>(null);
    const [summaryChartHeight, setSummaryChartHeight] = useState(360);
    const [monthlyChartHeight, setMonthlyChartHeight] = useState(380);

    const compareData = React.useMemo(() => {
        return selectedProjects.map((project, index) => {
            const rows = data.filter(item => item.project === project).sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
            const units = rows.map(row => row.unit).filter(value => Number.isFinite(value)).sort(d3.ascending);
            const totals = rows.map(getHouseTotal).filter(value => Number.isFinite(value));
            const areas = rows.map(row => row.area).filter(value => Number.isFinite(value)).sort(d3.ascending);
            const roomCounts = d3.rollups(rows, v => v.length, row => row.type).sort((a, b) => b[1] - a[1]);
            const latest = rows[rows.length - 1];
            return {
                project,
                color: distinctProjectColor(index),
                rows,
                count: rows.length,
                dist: latest?.dist || '-',
                avgUnit: units.length ? Math.round((d3.mean(units) || 0) * 10) / 10 : 0,
                q1: units.length ? Math.round((d3.quantile(units, 0.25) || 0) * 10) / 10 : 0,
                median: units.length ? Math.round((d3.quantile(units, 0.5) || 0) * 10) / 10 : 0,
                q3: units.length ? Math.round((d3.quantile(units, 0.75) || 0) * 10) / 10 : 0,
                minTotal: d3.min(totals) || 0,
                maxTotal: d3.max(totals) || 0,
                areaMin: d3.min(areas) || 0,
                areaMax: d3.max(areas) || 0,
                mainRoom: roomCounts[0]?.[0] || '-',
                latestMonth: latest ? formatDateLabel(latest.date, latest.month) : '-'
            };
        }).filter(item => item.count > 0);
    }, [data, selectedProjects]);

    const barData = compareData.map(item => ({
        name: item.project,
        avgUnit: item.avgUnit,
        count: item.count,
        color: item.color
    }));

    const monthlySalesData = React.useMemo(() => {
        const monthSet = new Set<string>();
        const countMap = new Map<string, number>();
        compareData.forEach(item => {
            item.rows.forEach(row => {
                const month = row.month || formatDateLabel(row.date);
                if (!month || month === '-') return;
                monthSet.add(month);
                const key = `${month}|${item.project}`;
                countMap.set(key, (countMap.get(key) || 0) + 1);
            });
        });

        return Array.from(monthSet).sort().map(month => {
            const row: Record<string, string | number> = { month };
            compareData.forEach(item => {
                row[item.project] = countMap.get(`${month}|${item.project}`) || 0;
            });
            return row;
        });
    }, [compareData]);

    const downloadChartPng = async (target: React.RefObject<HTMLDivElement>, title: string) => {
        if (!target.current) return;
        const dataUrl = await toPng(target.current, {
            backgroundColor: '#ffffff',
            pixelRatio: 2,
            cacheBust: true,
            filter: (node) => !node.classList?.contains('export-exclude')
        });
        const link = document.createElement('a');
        link.download = `${title}_${new Date().toISOString().slice(0, 10)}.png`;
        link.href = dataUrl;
        link.click();
    };

    if (selectedProjects.length === 0) {
        return <EmptyChart message="請先在下方建案清單選擇 2-10 個建案進行比較" />;
    }
    if (compareData.length === 0) {
        return <EmptyChart message="目前選取的建案沒有可比較資料" />;
    }

    return (
        <div className="w-full relative">
            <div className="mb-6 grid grid-cols-1 gap-4 px-2 md:grid-cols-2 xl:grid-cols-3 export-exclude">
                {compareData.map(item => (
                    <button
                        type="button"
                        key={item.project}
                        onClick={() => onSelect?.(item.project)}
                        className="rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl"
                    >
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                                    <h4 className="truncate text-lg font-black text-slate-900">{item.project}</h4>
                                </div>
                                <div className="mt-1 text-xs font-bold text-slate-400">{item.dist}｜最新 {item.latestMonth}</div>
                            </div>
                            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-600">{item.count} 筆</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-2xl bg-slate-50 p-3">
                                <div className="text-[10px] font-black text-slate-400">平均單價</div>
                                <div className="mt-1 text-lg font-black text-slate-950">{item.avgUnit} 萬/坪</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-3">
                                <div className="text-[10px] font-black text-slate-400">中位單價</div>
                                <div className="mt-1 text-lg font-black text-slate-950">{item.median} 萬/坪</div>
                            </div>
                            <div className="rounded-2xl bg-amber-50 p-3">
                                <div className="text-[10px] font-black text-amber-500">房屋總價</div>
                                <div className="mt-1 text-sm font-black text-slate-950">{formatWan(item.minTotal)}~{formatWan(item.maxTotal)} 萬</div>
                            </div>
                            <div className="rounded-2xl bg-emerald-50 p-3">
                                <div className="text-[10px] font-black text-emerald-600">坪數 / 主力房型</div>
                                <div className="mt-1 text-sm font-black text-slate-950">{item.areaMin}~{item.areaMax} 坪｜{item.mainRoom}</div>
                            </div>
                        </div>
                        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-xs font-black text-slate-500">
                            Q1 {item.q1}｜Q3 {item.q3} 萬/坪
                        </div>
                    </button>
                ))}
            </div>

            <div ref={summaryChartRef} className="relative bg-white">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4 px-8">
                    <h4 className="text-sm font-black text-slate-800">建案成交量與平均單價比較</h4>
                    <div className="export-exclude flex flex-wrap items-center justify-end gap-3">
                        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">調整圖表高度</span>
                            <input
                                type="range"
                                min="300"
                                max="760"
                                step="20"
                                value={summaryChartHeight}
                                onChange={(e) => setSummaryChartHeight(Number(e.target.value))}
                                className="h-1.5 w-32 cursor-pointer appearance-none rounded-lg bg-slate-200 accent-blue-600"
                            />
                            <span className="min-w-[42px] text-[10px] font-bold text-slate-600">{summaryChartHeight}px</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => downloadChartPng(summaryChartRef, '建案成交量與平均單價比較')}
                            className="rounded-xl bg-slate-900 px-4 py-2 text-[11px] font-black text-white shadow-sm transition-colors hover:bg-blue-600"
                        >
                            下載 PNG
                        </button>
                    </div>
                </div>
                <AxisSideLabel value="成交筆數" />
                <div className="absolute right-3 top-[35%] -translate-y-1/2 text-[13px] font-black text-slate-700 tracking-wide leading-tight [writing-mode:vertical-rl] pointer-events-none">
                    平均單價 (萬/坪)
                </div>
                <ResponsiveContainer width="100%" height={summaryChartHeight}>
                    <ComposedChart data={barData} margin={{ top: 28, right: 72, left: 64, bottom: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" angle={-30} textAnchor="end" height={70} tick={{ fontSize: 12, fill: '#334155', fontWeight: 900 }} stroke="#e2e8f0" />
                        <YAxis yAxisId="left" tick={{ fontSize: 13, fill: '#334155', fontWeight: 900 }} stroke="#e2e8f0" allowDecimals={false} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 13, fill: '#0f172a', fontWeight: 900 }} stroke="#cbd5e1" />
                        <Tooltip formatter={(value: any, name: any) => [
                            name === '成交筆數' ? `${value} 筆` : `${value} 萬/坪`,
                            name
                        ]} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.3)' }} />
                        <Bar yAxisId="left" dataKey="count" name="成交筆數" radius={[8, 8, 0, 0]} barSize={32} label={{ position: 'top', fill: '#334155', fontSize: 12, fontWeight: '950', offset: 6 }}>
                            {barData.map(item => <Cell key={item.name} fill={item.color} opacity={0.84} />)}
                        </Bar>
                        <Line yAxisId="right" type="monotone" dataKey="avgUnit" name="平均單價" stroke="#0f172a" strokeWidth={3} dot={{ r: 5, fill: '#0f172a' }} label={{ position: 'top', fill: '#1e3a8a', fontSize: 12, fontWeight: '950', offset: 8 }} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            <div ref={monthlyChartRef} className="relative mt-10 border-t border-slate-100 bg-white pt-8">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4 px-8">
                    <h4 className="text-sm font-black text-slate-800">每月成交筆數趨勢</h4>
                    <div className="export-exclude flex flex-wrap items-center justify-end gap-3">
                        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">調整圖表高度</span>
                            <input
                                type="range"
                                min="300"
                                max="760"
                                step="20"
                                value={monthlyChartHeight}
                                onChange={(e) => setMonthlyChartHeight(Number(e.target.value))}
                                className="h-1.5 w-32 cursor-pointer appearance-none rounded-lg bg-slate-200 accent-blue-600"
                            />
                            <span className="min-w-[42px] text-[10px] font-bold text-slate-600">{monthlyChartHeight}px</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => downloadChartPng(monthlyChartRef, '每月成交筆數趨勢')}
                            className="rounded-xl bg-slate-900 px-4 py-2 text-[11px] font-black text-white shadow-sm transition-colors hover:bg-blue-600"
                        >
                            下載 PNG
                        </button>
                    </div>
                </div>
                <AxisSideLabel value="成交筆數" />
                <div className="relative">
                    <ResponsiveContainer width="100%" height={monthlyChartHeight}>
                        <ComposedChart data={monthlySalesData} margin={PROJECT_COMPARE_MONTHLY_MARGIN}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="month" angle={-35} textAnchor="end" height={70} tick={{ fontSize: 12, fill: '#334155', fontWeight: 900 }} stroke="#e2e8f0" />
                            <YAxis tick={{ fontSize: 13, fill: '#334155', fontWeight: 900 }} stroke="#e2e8f0" allowDecimals={false} axisLine={false} tickLine={false} />
                            <Tooltip formatter={(value: any) => [`${value} 筆`, '成交筆數']} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.3)' }} />
                            {compareData.map(item => (
                                <Line
                                    key={item.project}
                                    type="monotone"
                                    dataKey={item.project}
                                    name={item.project}
                                    stroke={item.color}
                                    strokeWidth={3}
                                    dot={{ r: 4, fill: item.color, stroke: '#ffffff', strokeWidth: 2 }}
                                    activeDot={{ r: 6, fill: item.color, stroke: '#ffffff', strokeWidth: 2 }}
                                    connectNulls
                                />
                            ))}
                        </ComposedChart>
                    </ResponsiveContainer>
                    <LegendSection items={compareData.map(item => ({ name: item.project, color: item.color }))} />
                </div>
            </div>
        </div>
    );
};

const updateRoomTypeWithoutScrollJump = (value: string, setter: (value: string) => void) => {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    setter(value);
    requestAnimationFrame(() => {
        window.scrollTo({ left: scrollX, top: scrollY, behavior: 'auto' });
        requestAnimationFrame(() => window.scrollTo({ left: scrollX, top: scrollY, behavior: 'auto' }));
    });
};

const StackedBar: React.FC<{
    data: any[];
    keys: string[];
    xAxisKey: string;
    xAxisLabel?: string;
    yAxisLabel?: string;
    onSelect?: (key: string, roomType?: string) => void;
    selectedSegment?: { group: string; roomType?: string };
}> = ({ data, keys, xAxisKey, yAxisLabel = '案件筆數', onSelect, selectedSegment }) => {
    const wrapperRef = React.useRef<HTMLDivElement>(null);
    const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
    const [segmentTooltip, setSegmentTooltip] = useState<{
        x: number;
        y: number;
        label: string;
        payload: { dataKey: string; name: string; value: number; color: string }[];
    } | null>(null);
    const clearSegmentTooltip = React.useCallback(() => setSegmentTooltip(null), []);
    useClearTooltipOutsideChart(wrapperRef, clearSegmentTooltip, Boolean(segmentTooltip));
    const toggleKey = (key: string) => {
        setHiddenKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    };

    const visibleKeys = keys.filter(k => !hiddenKeys.includes(k));
    const visibleData = React.useMemo(() => data.map(item => ({
        ...item,
        visibleTotal: visibleKeys.reduce((sum, key) => sum + (Number(item[key]) || 0), 0)
    })), [data, visibleKeys]);

    return (
        <div ref={wrapperRef} className="w-full relative" onMouseLeave={() => setSegmentTooltip(null)}>
            <AxisSideLabel value={yAxisLabel} />
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <ComposedChart data={visibleData} margin={STACKED_MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                        dataKey={xAxisKey} 
                        angle={-45} 
                        textAnchor="end" 
                        height={STACKED_X_AXIS_HEIGHT} 
                        interval={0}
                        tick={{ fontSize: 13, fill: '#334155', fontWeight: 900 }} 
                        stroke="#e2e8f0"
                        dy={X_AXIS_DY}
                    >
                    </XAxis>
                    <YAxis stroke="#e2e8f0" tick={{ fontSize: 13, fill: '#334155', fontWeight: 900 }} axisLine={false} tickLine={false} />
                    {keys.map((key, index) => {
                        return (
                            <Bar
                                key={key} 
                                dataKey={key} 
                                stackId="a" 
                                fill={ROOM_COLORS[key] || COLORS[index % COLORS.length]} 
                                radius={[0, 0, 0, 0]} 
                                barSize={42}
                                hide={hiddenKeys.includes(key)}
                                opacity={0.85}
                                activeBar={false}
                                shape={(props: any) => {
                                    const group = props?.payload?.[xAxisKey];
                                    const value = Number(props?.payload?.[key]) || 0;
                                    const isSelected = selectedSegment?.group === group && selectedSegment?.roomType === key;
                                    const fillOpacity = isSelected || !selectedSegment ? 0.9 : 0.52;
                                    if (value <= 0) return <g />;
                                    const showTooltip = (event: React.MouseEvent<SVGRectElement>) => {
                                        setSegmentTooltip({
                                            x: event.clientX,
                                            y: event.clientY,
                                            label: group,
                                            payload: visibleKeys.map(visibleKey => ({
                                                dataKey: visibleKey,
                                                name: visibleKey,
                                                value: Number(props?.payload?.[visibleKey]) || 0,
                                                color: ROOM_COLORS[visibleKey] || COLORS[keys.indexOf(visibleKey) % COLORS.length]
                                            }))
                                        });
                                    };
                                    return (
                                        <rect
                                            data-filter-segment="true"
                                            x={props.x}
                                            y={props.y}
                                            width={props.width}
                                            height={props.height}
                                            fill={props.fill}
                                            fillOpacity={fillOpacity}
                                            stroke={isSelected ? '#2563eb' : 'transparent'}
                                            strokeWidth={isSelected ? 2 : 0}
                                            vectorEffect="non-scaling-stroke"
                                            onMouseEnter={showTooltip}
                                            onMouseMove={showTooltip}
                                            onMouseLeave={() => setSegmentTooltip(null)}
                                        />
                                    );
                                }}
                                onClick={(payload: any) => {
                                    const group = payload?.payload?.[xAxisKey];
                                    if (group && Number(payload?.payload?.[key]) > 0) onSelect?.(group, key);
                                }}
                            />
                        );
                    })}
                    <Line
                        type="linear"
                        dataKey="visibleTotal"
                        stroke="transparent"
                        dot={false}
                        activeDot={false}
                        isAnimationActive={false}
                        label={{
                            position: 'top',
                            fill: '#1e3a8a',
                            fontSize: 14,
                            fontWeight: 950,
                            offset: 8,
                            formatter: (value: any) => Number(value) > 0 ? value : ''
                        }}
                    />
                </ComposedChart>
            </ResponsiveContainer>
            <LegendSection 
                items={keys.map(k => ({ name: k, color: ROOM_COLORS[k] || COLORS[keys.indexOf(k) % COLORS.length] }))} 
                hiddenItems={hiddenKeys}
                onToggle={toggleKey}
            />
            {segmentTooltip && (
                <div
                    className="pointer-events-none fixed z-[9999] export-exclude"
                    style={{
                        left: `min(calc(100vw - 260px), ${segmentTooltip.x + 16}px)`,
                        top: `max(12px, ${segmentTooltip.y - 18}px)`
                    }}
                >
                    <CustomTooltip active payload={segmentTooltip.payload} label={segmentTooltip.label} />
                </div>
            )}
        </div>
    );
};

export const VolumeChart: React.FC<ChartProps> = ({ data, onSelect }) => {
    const chartData = React.useMemo(() => {
        const rollup = d3.rollups(data, v => v.length, d => d.dist).sort((a, b) => b[1] - a[1]);
        return rollup.map(([name, value]) => ({ name, value }));
    }, [data]);

    return (
        <div className="w-full relative">
            <AxisSideLabel value="成交筆數" />
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={chartData} margin={COMMON_MARGIN} onClick={(e) => e && e.activeLabel && onSelect?.(e.activeLabel)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" angle={-35} textAnchor="end" height={X_AXIS_HEIGHT} tick={{ fontSize: 13, fill: '#334155', fontWeight: 900 }} stroke="#e2e8f0" dy={X_AXIS_DY} />
                    <YAxis stroke="#e2e8f0" tick={{ fontSize: 13, fill: '#334155', fontWeight: 900 }} axisLine={false} tickLine={false} />
                    <Bar dataKey="value" name="成交量" fill="#3b82f6" radius={[8, 8, 0, 0]} barSize={54} opacity={0.86} label={{ position: 'top', fill: '#1e3a8a', fontSize: 14, fontWeight: '950', offset: 6 }} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export const UnitPriceChart: React.FC<ChartProps> = ({ data, onSelect }) => {
    const chartData = React.useMemo(() => {
        const rollup = d3.rollups(data, v => Math.round(d3.mean(v, d => d.unit) || 0), d => d.dist).sort((a, b) => b[1] - a[1]);
        return rollup.map(([name, value]) => ({ name, value }));
    }, [data]);

    return (
        <div className="w-full relative">
            <AxisSideLabel value="平均單價 (萬/坪)" />
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={chartData} margin={COMMON_MARGIN} onClick={(e) => e && e.activeLabel && onSelect?.(e.activeLabel)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" angle={-35} textAnchor="end" height={X_AXIS_HEIGHT} tick={{ fontSize: 13, fill: '#334155', fontWeight: 900 }} stroke="#e2e8f0" dy={X_AXIS_DY} />
                    <YAxis stroke="#e2e8f0" tick={{ fontSize: 13, fill: '#334155', fontWeight: 900 }} axisLine={false} tickLine={false} />
                    <Bar dataKey="value" name="平均單價" fill="#f59e0b" radius={[8, 8, 0, 0]} barSize={54} opacity={0.86} label={{ position: 'top', fill: '#92400e', fontSize: 14, fontWeight: '950', offset: 6 }} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export const DistrictMinTotalChart: React.FC<ChartProps> = ({ data, onSelect }) => {
    const MIN_TOTAL_ROOM_KEYS = ['1房', '2房', '3房', '4房'];
    const [selectedRoomType, setSelectedRoomType] = useState('全部房型');
    const activeRoomKeys = selectedRoomType === '全部房型' ? MIN_TOTAL_ROOM_KEYS : [selectedRoomType];
    const chartData = React.useMemo(() => {
        return d3.groups(data.filter(d => d.dist), d => d.dist)
            .map(([dist, items]) => {
                const row: Record<string, string | number> = { name: dist };
                MIN_TOTAL_ROOM_KEYS.forEach(roomType => {
                    const rows = items.filter(d => d.type === roomType && getHouseTotal(d) > 0);
                    row[roomType] = Math.round(d3.min(rows, getHouseTotal) || 0);
                });
                return row;
            })
            .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hant'));
    }, [data]);

    if (!chartData.some(row => MIN_TOTAL_ROOM_KEYS.some(key => Number(row[key]) > 0))) return <EmptyChart message="沒有可分析的房屋總價資料" />;

    return (
        <div className="w-full relative">
            <div className="mb-4 flex justify-center export-exclude">
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">選擇房型</span>
                    <select
                        value={selectedRoomType}
                        onChange={(event) => updateRoomTypeWithoutScrollJump(event.target.value, setSelectedRoomType)}
                        className="min-w-[140px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm outline-none transition-colors focus:border-blue-400"
                    >
                        <option value="全部房型">全部房型</option>
                        {MIN_TOTAL_ROOM_KEYS.map(key => <option key={key} value={key}>{key}</option>)}
                    </select>
                </label>
            </div>
            <AxisSideLabel value="最低總價 (萬)" />
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={chartData} margin={{ ...COMMON_MARGIN, bottom: 58 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" angle={-35} textAnchor="end" height={58} tick={{ fontSize: 13, fill: '#334155', fontWeight: 900 }} stroke="#e2e8f0" dy={X_AXIS_DY} />
                    <YAxis stroke="#e2e8f0" tick={{ fontSize: 13, fill: '#334155', fontWeight: 900 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(value: any, _name: any, item: any) => [
                        Number(value) > 0 ? `${formatWan(Number(value))} 萬` : '無資料',
                        `${item?.dataKey || ''}最低總價`
                    ]} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.3)' }} />
                    {activeRoomKeys.map((roomType, index) => (
                        <Bar
                            key={roomType}
                            dataKey={roomType}
                            name={roomType}
                            fill={ROOM_COLORS[roomType] || '#0ea5e9'}
                            radius={[6, 6, 0, 0]}
                            barSize={selectedRoomType === '全部房型' ? 18 : 48}
                            opacity={0.86}
                            onClick={(payload: any) => {
                                if (Number(payload?.[roomType]) > 0) onSelect?.(`${payload.name}|${roomType}`);
                            }}
                        >
                            <LabelList
                                dataKey={roomType}
                                content={(props: any) => (
                                    <MinTotalValueLabel
                                        {...props}
                                        fill={ROOM_COLORS[roomType] || '#075985'}
                                        allMode={selectedRoomType === '全部房型'}
                                        index={index}
                                    />
                                )}
                            />
                        </Bar>
                    ))}
                </BarChart>
            </ResponsiveContainer>
            <LegendSection items={activeRoomKeys.map(key => ({ name: key, color: ROOM_COLORS[key] || '#0ea5e9' }))} />
        </div>
    );
};

export const UnitPriceDistributionChart: React.FC<ChartProps> = ({ data, onSelect }) => {
    const units = React.useMemo(() => data.map(d => d.unit).filter(v => Number.isFinite(v) && v > 0).sort(d3.ascending), [data]);
    const stats = React.useMemo(() => ({
        count: units.length,
        avg: units.length ? Math.round((d3.mean(units) || 0) * 10) / 10 : 0,
        q1: units.length ? Math.round((d3.quantile(units, 0.25) || 0) * 10) / 10 : 0,
        median: units.length ? Math.round((d3.quantile(units, 0.5) || 0) * 10) / 10 : 0,
        q3: units.length ? Math.round((d3.quantile(units, 0.75) || 0) * 10) / 10 : 0
    }), [units]);
    const chartData = React.useMemo(() => {
        if (units.length === 0) return [];
        const min = Math.floor((d3.min(units) || 0) / 10) * 10;
        const max = Math.ceil((d3.max(units) || 0) / 10) * 10;
        return d3.range(min, max + 10, 10).slice(0, -1).map(start => {
            const end = start + 10;
            return {
                name: `${start}-${end}`,
                value: units.filter(unit => unit >= start && unit < end).length
            };
        });
    }, [units]);

    if (chartData.length === 0) return <EmptyChart message="沒有可分析的單價資料" />;

    return (
        <div className="w-full relative">
            <div className="mb-4 flex flex-wrap justify-center gap-3 export-exclude">
                {[
                    { label: '總筆數', value: `${stats.count} 筆` },
                    { label: '均價', value: `${stats.avg} 萬/坪` },
                    { label: 'Q1', value: `${stats.q1} 萬/坪` },
                    { label: '中位數', value: `${stats.median} 萬/坪` },
                    { label: 'Q3', value: `${stats.q3} 萬/坪` }
                ].map(item => (
                    <div key={item.label} className="min-w-[108px] rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-center shadow-sm">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.label}</div>
                        <div className="mt-1 text-sm font-black text-slate-900">{item.value}</div>
                    </div>
                ))}
            </div>
            <AxisSideLabel value="成交筆數" />
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={chartData} margin={COMMON_MARGIN} onClick={(e) => e && e.activeLabel && onSelect?.(e.activeLabel)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" angle={-35} textAnchor="end" height={X_AXIS_HEIGHT} interval={0} tick={{ fontSize: 13, fill: '#334155', fontWeight: 900 }} stroke="#e2e8f0" dy={X_AXIS_DY} />
                    <YAxis stroke="#e2e8f0" tick={{ fontSize: 13, fill: '#334155', fontWeight: 900 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip formatter={(value: any) => [`${value} 筆`, '成交筆數']} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.3)' }} />
                    <Bar dataKey="value" name="成交筆數" fill="#14b8a6" radius={[8, 8, 0, 0]} barSize={34} opacity={0.86} label={{ position: 'top', fill: '#0f766e', fontSize: 13, fontWeight: '950', offset: 6, formatter: (v: any) => Number(v) > 0 ? v : '' }} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export const FloorUnitScatterChart: React.FC<ChartProps> = ({ data, onSelect }) => {
    const [hiddenProjects, setHiddenProjects] = useState<string[]>([]);
    const [isProjectFilterOpen, setIsProjectFilterOpen] = useState(false);
    const [tooltip, setTooltip] = useState<{ x: number, y: number, content: any } | null>(null);
    const [showCrosshair, setShowCrosshair] = useState(true);
    const svgRef = React.useRef<SVGSVGElement>(null);
    const zoomRef = React.useRef<any>(null);
    const clearTooltip = React.useCallback(() => setTooltip(null), []);
    useClearTooltipOutsideChart(svgRef, clearTooltip, Boolean(tooltip));
    const chartData = React.useMemo(() => {
        return data
            .filter(d => d.floor !== null && Number.isFinite(d.unit) && d.unit > 0)
            .map(d => ({ ...d, floorValue: d.floor as number }));
    }, [data]);
    const projectLegend = React.useMemo(() => {
        return d3.rollups(chartData, rows => rows.length, d => d.project || '未命名建案')
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'));
    }, [chartData]);
    const projectColorMap = React.useMemo(() => {
        return new Map(projectLegend.map(([project], index) => [project, distinctProjectColor(index)]));
    }, [projectLegend]);
    const projectNames = React.useMemo(() => projectLegend.map(([project]) => project), [projectLegend]);
    const selectedCount = Math.max(0, projectNames.length - hiddenProjects.length);
    const visibleUnits = React.useMemo(() => {
        return chartData
            .filter(d => !hiddenProjects.includes(d.project || '未命名建案'))
            .map(d => d.unit)
            .sort(d3.ascending);
    }, [chartData, hiddenProjects]);
    const visibleChartData = React.useMemo(() => {
        return chartData.filter(d => !hiddenProjects.includes(d.project || '未命名建案'));
    }, [chartData, hiddenProjects]);
    const unitStats = React.useMemo(() => ({
        count: visibleUnits.length,
        q1: visibleUnits.length ? Math.round((d3.quantile(visibleUnits, 0.25) || 0) * 10) / 10 : 0,
        median: visibleUnits.length ? Math.round((d3.quantile(visibleUnits, 0.5) || 0) * 10) / 10 : 0,
        q3: visibleUnits.length ? Math.round((d3.quantile(visibleUnits, 0.75) || 0) * 10) / 10 : 0
    }), [visibleUnits]);
    const formatAxisTick = (value: number) => {
        const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
        return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    };
    const formatDate = (row: HouseData) => {
        if (!row.date) return row.month || '-';
        const year = row.date.getFullYear();
        const month = String(row.date.getMonth() + 1).padStart(2, '0');
        const day = String(row.date.getDate()).padStart(2, '0');
        return `${year}/${month}/${day}`;
    };
    const formatFloor = (floor: number | null) => {
        if (floor === null || floor === undefined) return '-';
        if (floor < 0) return `B${Math.abs(floor)}`;
        return `${floor}F`;
    };
    const transactionLabel = (id: string) => {
        const parts = String(id || '').split('_');
        return parts[parts.length - 1] || id || '-';
    };

    const handleResetZoom = () => {
        if (zoomRef.current && svgRef.current) {
            d3.select(svgRef.current).transition().duration(650).call(zoomRef.current.transform, d3.zoomIdentity);
        }
    };

    React.useEffect(() => {
        if (!svgRef.current || chartData.length === 0) return;
        const svgElement = svgRef.current;
        const width = svgElement.clientWidth - COMMON_MARGIN.left - COMMON_MARGIN.right;
        const height = CHART_HEIGHT - COMMON_MARGIN.top - 56;
        if (width <= 0 || height <= 0) return;

        const svg = d3.select(svgElement);
        svg.selectAll("*").remove();

        const defs = svg.append("defs");
        defs.append("clipPath")
            .attr("id", "clip-floor-unit")
            .append("rect")
            .attr("width", width)
            .attr("height", height);

        const g = svg.append("g").attr("transform", `translate(${COMMON_MARGIN.left},${COMMON_MARGIN.top})`);
        const chartArea = g.append("g").attr("clip-path", "url(#clip-floor-unit)");

        const source = visibleChartData.length ? visibleChartData : chartData;
        const xMax = Math.ceil(Math.max(24, d3.max(source, d => d.floorValue) || 24));
        const yMax = Math.ceil(Math.max(260, d3.max(source, d => d.unit) || 260) / 10) * 10;
        const x = d3.scaleLinear().domain([0, xMax]).range([0, width]).nice();
        const y = d3.scaleLinear().domain([0, yMax]).range([height, 0]).nice();
        let currentX = x;
        let currentY = y;

        const xAxis = d3.axisBottom(x).ticks(8).tickFormat(d => formatAxisTick(Number(d)));
        const yAxis = d3.axisLeft(y).ticks(5).tickFormat(d => formatAxisTick(Number(d)));

        const gX = g.append("g").attr("transform", `translate(0,${height})`).call(xAxis);
        const gY = g.append("g").call(yAxis);

        const styleAxes = () => {
            g.selectAll(".domain").style("stroke", "#e2e8f0").style("stroke-width", "2");
            g.selectAll(".tick line").style("stroke", "#f1f5f9").style("stroke-width", 1.5).style("stroke-dasharray", "4,4");
            g.selectAll(".tick text").style("font-size", "13px").style("font-weight", "900").style("fill", "#334155");
        };
        styleAxes();

        chartArea.selectAll(".grid-x")
            .data(x.ticks(8))
            .join("line")
            .attr("class", "grid-x")
            .attr("x1", d => x(d))
            .attr("x2", d => x(d))
            .attr("y1", 0)
            .attr("y2", height)
            .attr("stroke", "#f1f5f9")
            .attr("stroke-dasharray", "3,3");

        chartArea.selectAll(".grid-y")
            .data(y.ticks(5))
            .join("line")
            .attr("class", "grid-y")
            .attr("x1", 0)
            .attr("x2", width)
            .attr("y1", d => y(d))
            .attr("y2", d => y(d))
            .attr("stroke", "#f1f5f9")
            .attr("stroke-dasharray", "3,3");

        const crosshairParts = appendChartCrosshair(g, width, height);

        const dots = chartArea.selectAll<SVGCircleElement, HouseData & { floorValue: number }>(".floor-unit-dot")
            .data(chartData, d => d.id)
            .join("circle")
            .attr("class", "floor-unit-dot")
            .attr("cx", d => x(d.floorValue))
            .attr("cy", d => y(d.unit))
            .attr("r", 4.6)
            .attr("fill", d => projectColorMap.get(d.project || '未命名建案') || projectColor(d.project || '未命名建案'))
            .attr("opacity", d => hiddenProjects.includes(d.project || '未命名建案') ? 0 : 0.76)
            .attr("stroke", "white")
            .attr("stroke-width", 1.2)
            .style("cursor", "pointer")
            .style("pointer-events", d => hiddenProjects.includes(d.project || '未命名建案') ? "none" : "auto")
            .on("click", (_event, d) => onSelect?.(d.dist))
            .on("mouseover", (event, d) => {
                setTooltip({
                    x: event.clientX,
                    y: event.clientY,
                    content: d
                });
            })
            .on("mousemove", (event) => {
                setTooltip(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null);
            })
            .on("mouseout", () => setTooltip(null));

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.6, 12])
            .extent([[0, 0], [width, height]])
            .translateExtent([[-width * 0.25, -height * 0.25], [width * 1.25, height * 1.25]])
            .on("zoom", (event) => {
                const transform = event.transform;
                const newX = transform.rescaleX(x);
                const newY = transform.rescaleY(y);
                currentX = newX;
                currentY = newY;
                gX.call(xAxis.scale(newX));
                gY.call(yAxis.scale(newY));
                styleAxes();
                dots.attr("cx", d => newX(d.floorValue)).attr("cy", d => newY(d.unit));
            });

        zoomRef.current = zoom;
        svg.call(zoom as any)
            .on("mousemove.crosshair", (event) => {
                if (!showCrosshair) {
                    crosshairParts.crosshair.style("display", "none");
                    return;
                }
                const [mx, my] = d3.pointer(event, g.node());
                if (mx < 0 || mx > width || my < 0 || my > height) {
                    crosshairParts.crosshair.style("display", "none");
                    return;
                }
                crosshairParts.crosshair.style("display", null);
                crosshairParts.vertical.attr("x1", mx).attr("x2", mx);
                crosshairParts.horizontal.attr("y1", my).attr("y2", my);
                crosshairParts.xLabel.attr("x", mx).text(`${Math.round(currentX.invert(mx) * 10) / 10}F`);
                crosshairParts.yLabel.attr("y", my - 8).text(`${Math.round(currentY.invert(my) * 10) / 10} 萬/坪`);
            })
            .on("mouseleave.crosshair", () => crosshairParts.crosshair.style("display", "none"));

        g.append("text")
            .attr("x", width / 2)
            .attr("y", height + 58)
            .attr("text-anchor", "middle")
            .text("樓層")
            .style("font-size", "14px")
            .style("fill", "#334155")
            .style("font-weight", "950");

        g.append("text")
            .attr("x", -72)
            .attr("y", Math.max(34, height * 0.34))
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .text("單價 (萬/坪)")
            .style("writing-mode", "vertical-rl")
            .style("font-size", "13px")
            .style("fill", "#334155")
            .style("font-weight", "950");

        return () => {
            svg.on(".zoom", null);
            svg.on(".crosshair", null);
        };
    }, [chartData, visibleChartData, hiddenProjects, projectColorMap, onSelect, showCrosshair]);

    if (chartData.length === 0) return <EmptyChart message="沒有可分析的樓層或單價資料" />;

    return (
        <div className="w-full relative">
            {tooltip && (
                <div
                    className="fixed z-[1000] pointer-events-none bg-white/95 backdrop-blur-xl p-4 border border-slate-200 shadow-2xl rounded-2xl text-sm min-w-[260px] max-w-[340px] text-slate-900"
                    style={{ left: tooltip.x + 15, top: tooltip.y - 15 }}
                >
                    <div className="font-black border-b border-slate-100 pb-2 mb-2">{tooltip.content.project || '未命名建案'}</div>
                    <div className="space-y-1.5 font-bold">
                        <div className="flex justify-between gap-4"><span className="text-slate-500">交易編號</span><span className="font-black text-slate-950">{transactionLabel(tooltip.content.id)}</span></div>
                        <div className="flex justify-between gap-4"><span className="text-slate-500">成交日期</span><span>{formatDate(tooltip.content)}</span></div>
                        <div className="flex justify-between gap-4"><span className="text-slate-500">行政區</span><span>{tooltip.content.dist}</span></div>
                        <div className="flex justify-between gap-4"><span className="text-slate-500">樓層</span><span>{formatFloor(tooltip.content.floor)}</span></div>
                        <div className="flex justify-between gap-4"><span className="text-slate-500">房型</span><span>{tooltip.content.type} / {tooltip.content.bath || '-'}衛</span></div>
                        <div className="flex justify-between gap-4"><span className="text-slate-500">房屋總價</span><span>{formatWan(getHouseTotal(tooltip.content))} 萬</span></div>
                        <div className="flex justify-between gap-4"><span className="text-slate-500">建物淨坪</span><span>{Math.round(tooltip.content.area * 10) / 10} 坪</span></div>
                        <div className="flex justify-between gap-4"><span className="text-slate-500">單價</span><span className="text-emerald-600 font-black">{Math.round(tooltip.content.unit * 10) / 10} 萬/坪</span></div>
                        <div className="pt-2 text-[11px] leading-relaxed text-slate-500 border-t border-slate-100">{tooltip.content.address || '未標示地址'}</div>
                    </div>
                </div>
            )}
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4 px-8 export-exclude">
                <div className="flex flex-wrap gap-3">
                    {[
                        { label: '可見筆數', value: `${unitStats.count} 筆` },
                        { label: 'Q1', value: `${unitStats.q1} 萬/坪` },
                        { label: '中位數', value: `${unitStats.median} 萬/坪` },
                        { label: 'Q3', value: `${unitStats.q3} 萬/坪` }
                    ].map(item => (
                        <div key={item.label} className="min-w-[106px] rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-center shadow-sm">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.label}</div>
                            <div className="mt-1 text-sm font-black text-slate-900">{item.value}</div>
                        </div>
                    ))}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={handleResetZoom}
                        className="text-[10px] font-black bg-slate-100 text-slate-500 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-200 hover:text-slate-800 transition-all uppercase tracking-widest"
                    >
                        重設縮放 (Reset Zoom)
                    </button>
                    <CrosshairToggle enabled={showCrosshair} onToggle={() => setShowCrosshair(prev => !prev)} />
                    <div className="relative min-w-[260px]">
                    <button
                        type="button"
                        onClick={() => setIsProjectFilterOpen(prev => !prev)}
                        className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-3 text-left text-xs font-black text-slate-700 shadow-sm transition-all hover:border-blue-300 hover:text-blue-600"
                    >
                        <span>建案篩選：已選 {selectedCount} / {projectNames.length}</span>
                        <span className="text-slate-400">{isProjectFilterOpen ? '▲' : '▼'}</span>
                    </button>
                    {isProjectFilterOpen && (
                        <div className="absolute right-0 z-50 mt-2 w-[360px] rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl">
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">複選建案</div>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setHiddenProjects([])} className="rounded-xl bg-blue-50 px-3 py-1.5 text-[11px] font-black text-blue-600 hover:bg-blue-100">全選</button>
                                    <button type="button" onClick={() => setHiddenProjects(projectNames)} className="rounded-xl bg-slate-100 px-3 py-1.5 text-[11px] font-black text-slate-500 hover:bg-slate-200">清空</button>
                                </div>
                            </div>
                            <div className="max-h-64 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
                                {projectLegend.map(([project, count]) => {
                                    const isHidden = hiddenProjects.includes(project);
                                    return (
                                        <label key={project} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-xs font-black text-slate-700 transition-colors hover:bg-slate-50">
                                            <input
                                                type="checkbox"
                                                checked={!isHidden}
                                                onChange={() => setHiddenProjects(prev => isHidden ? prev.filter(item => item !== project) : [...prev, project])}
                                                className="h-4 w-4 accent-blue-600"
                                            />
                                            <span className="h-3 w-3 rounded-full shadow-sm" style={{ backgroundColor: projectColorMap.get(project) || projectColor(project) }} />
                                            <span className="flex-1 truncate">{project}</span>
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{count}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    </div>
                </div>
            </div>
            <svg ref={svgRef} width="100%" height={CHART_HEIGHT} className="bg-white cursor-grab active:cursor-grabbing" />
        </div>
    );
};

type BoxMode = 'project' | 'dist';

export const UnitPriceBoxplotChart: React.FC<ChartProps> = ({ data, onSelect }) => {
    const [mode, setMode] = useState<BoxMode>('project');
    const [hiddenGroups, setHiddenGroups] = useState<string[]>([]);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [showCrosshair, setShowCrosshair] = useState(true);
    const [boxTooltip, setBoxTooltip] = useState<{
        x: number;
        y: number;
        content: { key: string; count: number; min: number; q1: number; median: number; q3: number; max: number };
    } | null>(null);
    const svgRef = React.useRef<SVGSVGElement>(null);
    const clearBoxTooltip = React.useCallback(() => setBoxTooltip(null), []);
    useClearTooltipOutsideChart(svgRef, clearBoxTooltip, Boolean(boxTooltip));
    const groupOptions = React.useMemo(() => {
        const keyFn = (item: HouseData) => mode === 'project' ? item.project : item.dist;
        return d3.rollups(
            data.filter(d => d.unit > 0 && keyFn(d)),
            rows => rows.length,
            keyFn
        ).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'));
    }, [data, mode]);
    const groupNames = React.useMemo(() => groupOptions.map(([name]) => name), [groupOptions]);
    const selectedCount = Math.max(0, groupNames.length - hiddenGroups.length);

    React.useEffect(() => {
        if (!svgRef.current) return;
        const source = data.filter(d => {
            const key = mode === 'project' ? d.project : d.dist;
            return d.unit > 0 && key && !hiddenGroups.includes(key);
        });
        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove();
        setBoxTooltip(null);
        if (source.length === 0) return;

        const margin = { top: 34, right: 28, bottom: 92, left: 86 };
        const width = svgRef.current.clientWidth - margin.left - margin.right;
        const height = CHART_HEIGHT - margin.top - margin.bottom;
        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        const grouped = d3.group(source, d => mode === 'project' ? d.project : d.dist);
        const stats = Array.from(grouped, ([key, values]) => {
            const sorted = values.map(d => d.unit).sort(d3.ascending);
            const q1 = d3.quantile(sorted, 0.25) || 0;
            const median = d3.quantile(sorted, 0.5) || 0;
            const q3 = d3.quantile(sorted, 0.75) || 0;
            const iqr = q3 - q1;
            return {
                key,
                count: values.length,
                min: Math.max(d3.min(sorted) || 0, q1 - 1.5 * iqr),
                max: Math.min(d3.max(sorted) || 0, q3 + 1.5 * iqr),
                q1,
                median,
                q3
            };
        }).filter(d => d.key && d.count > 0).sort((a, b) => b.median - a.median);

        const x = d3.scaleBand().range([0, width]).domain(stats.map(d => d.key)).padding(0.35);
        const yMax = Math.max(80, (d3.max(stats, d => d.max) || 100) * 1.1);
        const y = d3.scaleLinear().range([height, 0]).domain([60, yMax]).clamp(true);

        g.selectAll("line.grid").data(y.ticks(6)).enter().append("line")
            .attr("x1", 0).attr("x2", width).attr("y1", d => y(d)).attr("y2", d => y(d))
            .attr("stroke", "#f1f5f9").attr("stroke-dasharray", "4,4");

        g.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).tickPadding(8))
            .selectAll("text")
            .attr("transform", "rotate(-35)")
            .style("text-anchor", "end")
            .style("font-size", "12px")
            .style("font-weight", "900")
            .style("fill", "#334155");
        g.append("g").call(d3.axisLeft(y).tickPadding(12))
            .style("font-size", "13px")
            .style("font-weight", "900")
            .style("color", "#334155");

        const crosshairParts = appendChartCrosshair(g, width, height);

        g.append("text")
            .attr("x", width / 2)
            .attr("y", height + 70)
            .attr("text-anchor", "middle")
            .text(mode === 'project' ? '建案' : '行政區')
            .style("font-size", "14px")
            .style("fill", "#334155")
            .style("font-weight", "950");

        g.append("text")
            .attr("x", -72)
            .attr("y", Math.max(34, height * 0.34))
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .text("單價 (萬/坪)")
            .style("writing-mode", "vertical-rl")
            .style("font-size", "13px")
            .style("fill", "#334155")
            .style("font-weight", "950");

        const boxes = g.selectAll(".unit-box").data(stats).enter().append("g")
            .style("cursor", "pointer");
        boxes.append("rect")
            .attr("x", d => x(d.key)! - 6)
            .attr("y", d => Math.max(0, y(d.max) - 12))
            .attr("width", x.bandwidth() + 12)
            .attr("height", d => Math.min(height, y(d.min) + 12) - Math.max(0, y(d.max) - 12))
            .attr("fill", "transparent")
            .attr("pointer-events", "all")
            .on("mouseenter", (event, d) => {
                setBoxTooltip({ x: event.clientX, y: event.clientY, content: d });
            })
            .on("mousemove", (event, d) => {
                setBoxTooltip({ x: event.clientX, y: event.clientY, content: d });
            })
            .on("mouseleave", () => setBoxTooltip(null))
            .on("click", (_event, d) => onSelect?.(`${mode}:${d.key}`));
        boxes.append("line")
            .attr("x1", d => x(d.key)! + x.bandwidth() / 2)
            .attr("x2", d => x(d.key)! + x.bandwidth() / 2)
            .attr("y1", d => y(d.min))
            .attr("y2", d => y(d.max))
            .attr("stroke", "#cbd5e1")
            .attr("stroke-width", 2)
            .attr("pointer-events", "none");
        boxes.append("rect")
            .attr("x", d => x(d.key)!)
            .attr("y", d => y(d.q3))
            .attr("width", x.bandwidth())
            .attr("height", d => Math.max(2, y(d.q1) - y(d.q3)))
            .attr("rx", 7)
            .attr("fill", "#dbeafe")
            .attr("stroke", "#3b82f6")
            .attr("opacity", 0.78)
            .attr("pointer-events", "none");
        boxes.append("line")
            .attr("x1", d => x(d.key)!)
            .attr("x2", d => x(d.key)! + x.bandwidth())
            .attr("y1", d => y(d.median))
            .attr("y2", d => y(d.median))
            .attr("stroke", "#1d4ed8")
            .attr("stroke-width", 4)
            .attr("pointer-events", "none");

        svg.on("mousemove.crosshair", (event) => {
            if (!showCrosshair) {
                crosshairParts.crosshair.style("display", "none");
                return;
            }
            const [mx, my] = d3.pointer(event, g.node());
            if (mx < 0 || mx > width || my < 0 || my > height) {
                crosshairParts.crosshair.style("display", "none");
                return;
            }
            const hovered = stats.find(item => {
                const start = x(item.key);
                return start !== undefined && mx >= start && mx <= start + x.bandwidth();
            });
            crosshairParts.crosshair.style("display", null);
            crosshairParts.vertical.attr("x1", mx).attr("x2", mx);
            crosshairParts.horizontal.attr("y1", my).attr("y2", my);
            crosshairParts.xLabel.attr("x", mx).text(hovered?.key || '');
            crosshairParts.yLabel.attr("y", my - 8).text(`${Math.round(y.invert(my) * 10) / 10} 萬/坪`);
        }).on("mouseleave.crosshair", () => crosshairParts.crosshair.style("display", "none"));
    }, [data, mode, hiddenGroups, onSelect, showCrosshair]);

    return (
        <div className="relative w-full">
            <div className="mb-4 flex flex-wrap items-start justify-end gap-3 px-8 export-exclude">
                <div className="flex gap-2">
                    {[
                        { key: 'project' as BoxMode, label: '依建案' },
                        { key: 'dist' as BoxMode, label: '依行政區' }
                    ].map(item => (
                        <button
                            key={item.key}
                            onClick={() => {
                                setMode(item.key);
                                setHiddenGroups([]);
                                setIsFilterOpen(false);
                            }}
                            className={`rounded-xl border px-4 py-2 text-xs font-black transition-all ${mode === item.key ? 'border-blue-600 bg-blue-600 text-white shadow-md' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-300 hover:text-blue-600'}`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
                <CrosshairToggle enabled={showCrosshair} onToggle={() => setShowCrosshair(prev => !prev)} />
                <div className="relative min-w-[260px]">
                    <button
                        type="button"
                        onClick={() => setIsFilterOpen(prev => !prev)}
                        className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-3 text-left text-xs font-black text-slate-700 shadow-sm transition-all hover:border-blue-300 hover:text-blue-600"
                    >
                        <span>{mode === 'project' ? '建案' : '行政區'}篩選：已選 {selectedCount} / {groupNames.length}</span>
                        <span className="text-slate-400">{isFilterOpen ? '▲' : '▼'}</span>
                    </button>
                    {isFilterOpen && (
                        <div className="absolute right-0 z-50 mt-2 w-[360px] rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl">
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">複選{mode === 'project' ? '建案' : '行政區'}</div>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setHiddenGroups([])} className="rounded-xl bg-blue-50 px-3 py-1.5 text-[11px] font-black text-blue-600 hover:bg-blue-100">全選</button>
                                    <button type="button" onClick={() => setHiddenGroups(groupNames)} className="rounded-xl bg-slate-100 px-3 py-1.5 text-[11px] font-black text-slate-500 hover:bg-slate-200">清空</button>
                                </div>
                            </div>
                            <div className="max-h-64 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
                                {groupOptions.map(([name, count]) => {
                                    const isHidden = hiddenGroups.includes(name);
                                    return (
                                        <label key={name} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-xs font-black text-slate-700 transition-colors hover:bg-slate-50">
                                            <input
                                                type="checkbox"
                                                checked={!isHidden}
                                                onChange={() => setHiddenGroups(prev => isHidden ? prev.filter(item => item !== name) : [...prev, name])}
                                                className="h-4 w-4 accent-blue-600"
                                            />
                                            <span className="flex-1 truncate">{name}</span>
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{count}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <svg ref={svgRef} width="100%" height={CHART_HEIGHT} className="bg-white rounded-lg" />
            {boxTooltip && (
                <div
                    className="pointer-events-none fixed z-[9999] min-w-[230px] rounded-2xl border border-white/80 bg-white/90 p-4 text-xs text-slate-700 shadow-[0_24px_70px_rgba(15,23,42,0.28)] ring-1 ring-slate-900/10 backdrop-blur-xl export-exclude"
                    style={{
                        left: `min(calc(100vw - 284px), ${boxTooltip.x + 16}px)`,
                        top: `max(12px, ${boxTooltip.y - 18}px)`
                    }}
                >
                    <div className="mb-3 border-b border-slate-200 pb-2">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-500">{mode === 'project' ? '建案' : '行政區'}</div>
                        <div className="mt-1 max-w-[260px] truncate text-sm font-black text-slate-950">{boxTooltip.content.key}</div>
                    </div>
                    <div className="space-y-1.5">
                        {[
                            { label: '成交筆數', value: `${boxTooltip.content.count} 筆`, strong: false },
                            { label: '上鬚', value: `${Math.round(boxTooltip.content.max * 10) / 10} 萬/坪`, strong: false },
                            { label: 'Q3', value: `${Math.round(boxTooltip.content.q3 * 10) / 10} 萬/坪`, strong: false },
                            { label: '中位數', value: `${Math.round(boxTooltip.content.median * 10) / 10} 萬/坪`, strong: true },
                            { label: 'Q1', value: `${Math.round(boxTooltip.content.q1 * 10) / 10} 萬/坪`, strong: false },
                            { label: '下鬚', value: `${Math.round(boxTooltip.content.min * 10) / 10} 萬/坪`, strong: false }
                        ].map(item => (
                            <div key={item.label} className="flex items-center justify-between gap-6">
                                <span className="font-black text-slate-500">{item.label}</span>
                                <span className={`font-black ${item.strong ? 'text-blue-600' : 'text-slate-900'}`}>{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export const MonthlyTrendComboChart: React.FC<ChartProps> = ({ data, onSelect }) => {
    const projects = React.useMemo(() => {
        const values = data.map(d => d.project).filter((value): value is string => Boolean(value));
        return Array.from(new Set<string>(values)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }, [data]);
    const dists = React.useMemo(() => {
        const values = data.map(d => d.dist).filter((value): value is string => Boolean(value));
        return Array.from(new Set<string>(values)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }, [data]);
    const [project, setProject] = useState('all');
    const [dist, setDist] = useState('all');

    const chartData = React.useMemo(() => {
        const filtered = data.filter(d => d.month && d.unit > 0)
            .filter(d => project === 'all' || d.project === project)
            .filter(d => dist === 'all' || d.dist === dist);
        return d3.rollups(filtered, rows => ({
            count: rows.length,
            avgUnit: Math.round((d3.mean(rows, d => d.unit) || 0) * 10) / 10
        }), d => d.month)
            .map(([month, value]) => ({ month, ...value }))
            .sort((a, b) => a.month.localeCompare(b.month));
    }, [data, project, dist]);

    if (chartData.length === 0) return <EmptyChart message="沒有可分析的成交月份資料" />;

    return (
        <div className="w-full">
            <div className="mb-4 flex flex-wrap justify-end gap-3 px-8 export-exclude">
                <select value={dist} onChange={(e) => setDist(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm outline-none">
                    <option value="all">全部行政區</option>
                    {dists.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
                <select value={project} onChange={(e) => setProject(e.target.value)} className="min-w-[180px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm outline-none">
                    <option value="all">全部建案</option>
                    {projects.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
            </div>
            <div className="w-full relative">
                <AxisSideLabel value="成交筆數" />
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                    <ComposedChart
                        data={chartData}
                        margin={{ top: 34, right: 72, bottom: 58, left: 64 }}
                        onClick={(event) => {
                            if (event?.activeLabel) onSelect?.(`${event.activeLabel}|${dist}|${project}`);
                        }}
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="month" angle={-35} textAnchor="end" height={58} tick={{ fontSize: 13, fill: '#334155', fontWeight: 900 }} stroke="#e2e8f0" dy={12} />
                        <YAxis yAxisId="left" stroke="#e2e8f0" tick={{ fontSize: 13, fill: '#334155', fontWeight: 900 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <YAxis yAxisId="right" orientation="right" stroke="#e2e8f0" tick={{ fontSize: 13, fill: '#b45309', fontWeight: 900 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.3)' }} />
                        <Bar yAxisId="left" dataKey="count" name="成交量" fill="#3b82f6" radius={[8, 8, 0, 0]} opacity={0.72} barSize={42} label={{ position: 'top', fill: '#1e3a8a', fontSize: 13, fontWeight: 950, formatter: (value: any) => Number(value) > 0 ? value : '' }} />
                        <Line yAxisId="right" type="monotone" dataKey="avgUnit" name="平均單價 (萬/坪)" stroke="#f59e0b" strokeWidth={4} dot={{ r: 5, fill: '#f59e0b', stroke: 'white', strokeWidth: 2 }} label={{ position: 'top', fill: '#92400e', fontSize: 12, fontWeight: 950, formatter: (value: any) => Number(value) > 0 ? Math.round(Number(value)) : '' }} />
                    </ComposedChart>
                </ResponsiveContainer>
                <div className="mt-2 flex justify-center gap-8 border-t border-slate-100 pt-3 text-[12px] font-black text-slate-700">
                    <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-blue-500" />成交量</span>
                    <span className="flex items-center gap-2"><i className="h-1 w-7 rounded-full bg-amber-500" />平均單價</span>
                </div>
            </div>
        </div>
    );
};

export const TotalRoomTypeBar: React.FC<RoomTypeSelectorProps> = ({ data, onSelect, selectedRoomType: controlledRoomType, onRoomTypeChange, selectedSegment }) => {
    const [showHighPrice, setShowHighPrice] = useState(false);
    const [localRoomType, setLocalRoomType] = useState<string>('全部房型');
    const selectedRoomType = controlledRoomType ?? localRoomType;
    const setSelectedRoomType = onRoomTypeChange ?? setLocalRoomType;
    const activeRoomKeys = selectedRoomType === '全部房型' ? ROOM_KEYS : [selectedRoomType];
    const selectedRows = React.useMemo(() => {
        const roomFiltered = selectedRoomType === '全部房型'
            ? data
            : data.filter(d => d.type === selectedRoomType);
        return showHighPrice ? roomFiltered : roomFiltered.filter(d => d.total < 7000);
    }, [data, selectedRoomType, showHighPrice]);

    const stats = React.useMemo(() => {
        const totals = selectedRows.map(d => d.total).sort(d3.ascending);
        const formatWan = (value: number) => Math.round(value).toLocaleString('zh-TW');
        return {
            count: selectedRows.length,
            sum: formatWan(d3.sum(selectedRows, d => d.total)),
            q1: totals.length ? formatWan(d3.quantile(totals, 0.25) || 0) : '-',
            median: totals.length ? formatWan(d3.quantile(totals, 0.5) || 0) : '-',
            q3: totals.length ? formatWan(d3.quantile(totals, 0.75) || 0) : '-'
        };
    }, [selectedRows]);

    const chartData = React.useMemo(() => {
        const bins: { min: number, max: number, label: string }[] = [{ min: 0, max: 1000, label: '<1000' }];
        // Start from 1000, go up to 7000 inclusive of the 6750-7000 bin
        for (let i = 1000; i < 7000; i += 250) {
            bins.push({ min: i, max: i + 250, label: `${i}-${i + 250}` });
        }
        // Then add the final consolidated bin
        bins.push({ min: 7000, max: Infinity, label: '7000萬以上' });

        const groups = bins.map(b => {
            const items = data.filter(d => d.total >= b.min && d.total < b.max);
            const obj: any = { 
                name: b.label, 
                total: items.length,
                isHighPrice: b.min >= 7000
            };
            ROOM_KEYS.forEach(k => obj[k] = items.filter(d => d.type === k).length);
            return obj;
        });

        if (!showHighPrice) {
            return groups.filter(g => !g.isHighPrice);
        }
        return groups;
    }, [data, showHighPrice]);

    return (
        <div className="w-full flex flex-col items-center">
            <div className="mb-6 flex w-full flex-wrap items-center justify-between gap-4 px-8 export-exclude">
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 shadow-sm">
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">選擇房型</span>
                        <select
                            value={selectedRoomType}
                            onChange={(event) => updateRoomTypeWithoutScrollJump(event.target.value, setSelectedRoomType)}
                            className="min-w-[140px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm outline-none transition-colors focus:border-blue-400"
                        >
                            <option value="全部房型">全部房型</option>
                            {ROOM_KEYS.map(key => (
                                <option key={key} value={key}>{key}</option>
                            ))}
                        </select>
                    </label>
                    {[
                        { label: '總筆數', value: `${stats.count} 筆` },
                        { label: '總價合計', value: `${stats.sum} 萬` },
                        { label: 'Q1', value: `${stats.q1} 萬` },
                        { label: '中位數', value: `${stats.median} 萬` },
                        { label: 'Q3', value: `${stats.q3} 萬` }
                    ].map(item => (
                        <div key={item.label} className="min-w-[86px] rounded-xl border border-slate-100 bg-white px-3 py-2 text-center shadow-sm">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.label}</div>
                            <div className="mt-1 text-sm font-black text-slate-900">{item.value}</div>
                        </div>
                    ))}
                </div>
                <div className="flex items-center gap-4 self-start rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 shadow-sm">
                    <div className="flex flex-col items-end">
                        <span className="text-[11px] font-black text-slate-800 uppercase tracking-widest whitespace-nowrap">進階篩選 (Advanced)</span>
                        <span className="text-[10px] font-bold text-slate-400">顯示 7000萬以上案件</span>
                    </div>
                    <button
                        onClick={() => setShowHighPrice(!showHighPrice)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 focus:outline-none ${showHighPrice ? 'bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]' : 'bg-slate-300'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 shadow-sm ${showHighPrice ? 'translate-x-[22px]' : 'translate-x-1'}`} />
                    </button>
                </div>
            </div>
            <StackedBar
                data={chartData}
                keys={activeRoomKeys}
                xAxisKey="name"
                xAxisLabel="總價級距 (萬)"
                onSelect={onSelect}
                selectedSegment={selectedSegment}
            />
        </div>
    );
};

export const AreaRoomTypeBar: React.FC<RoomTypeSelectorProps> = ({ data, onSelect, selectedRoomType: controlledRoomType, onRoomTypeChange, selectedSegment }) => {
    const [localRoomType, setLocalRoomType] = useState<string>('全部房型');
    const selectedRoomType = controlledRoomType ?? localRoomType;
    const setSelectedRoomType = onRoomTypeChange ?? setLocalRoomType;
    const activeRoomKeys = selectedRoomType === '全部房型' ? ROOM_KEYS : [selectedRoomType];
    const selectedRows = React.useMemo(() => (
        selectedRoomType === '全部房型'
            ? data
            : data.filter(d => d.type === selectedRoomType)
    ), [data, selectedRoomType]);

    const stats = React.useMemo(() => {
        const areas = selectedRows.map(d => d.area).sort(d3.ascending);
        const formatPing = (value: number) => (Math.round(value * 10) / 10).toLocaleString('zh-TW');

        return {
            count: selectedRows.length,
            sum: formatPing(d3.sum(selectedRows, d => d.area)),
            q1: areas.length ? formatPing(d3.quantile(areas, 0.25) || 0) : '-',
            median: areas.length ? formatPing(d3.quantile(areas, 0.5) || 0) : '-',
            q3: areas.length ? formatPing(d3.quantile(areas, 0.75) || 0) : '-'
        };
    }, [selectedRows]);

    const chartData = React.useMemo(() => {
        const bins = [
            { min: 0, max: 14, label: '<14' }, { min: 14, max: 16, label: '14-16' }, { min: 16, max: 20, label: '16-20' },
            { min: 20, max: 24, label: '20-24' }, { min: 24, max: 28, label: '24-28' }, { min: 28, max: 32, label: '28-32' },
            { min: 32, max: 36, label: '32-36' }, { min: 36, max: 40, label: '36-40' }, { min: 40, max: 44, label: '40-44' },
            { min: 44, max: 48, label: '44-48' }, { min: 48, max: 52, label: '48-52' }, { min: 52, max: 56, label: '52-56' },
            { min: 56, max: 60, label: '56-60' }, { min: 60, max: 69, label: '60-69' }, { min: 69, max: 79, label: '69-79' },
            { min: 79, max: Infinity, label: '≥79' }
        ];
        const groups = d3.groups(data, d => {
            for (const b of bins) if (d.area >= b.min && d.area < b.max) return b.label;
            return '其他';
        }).map(([bin, items]) => {
            const obj: any = { name: bin, total: items.length };
            ROOM_KEYS.forEach(k => obj[k] = items.filter(d => d.type === k).length);
            return obj;
        });
        groups.sort((a, b) => bins.findIndex(x => x.label === a.name) - bins.findIndex(x => x.label === b.name));
        return groups;
    }, [data]);

    return (
        <div className="w-full flex flex-col items-center">
            <div className="mb-6 flex w-full flex-wrap items-center gap-3 px-8 export-exclude">
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 shadow-sm">
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">選擇房型</span>
                        <select
                            value={selectedRoomType}
                            onChange={(event) => updateRoomTypeWithoutScrollJump(event.target.value, setSelectedRoomType)}
                            className="min-w-[140px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm outline-none transition-colors focus:border-blue-400"
                        >
                            <option value="全部房型">全部房型</option>
                            {ROOM_KEYS.map(key => (
                                <option key={key} value={key}>{key}</option>
                            ))}
                        </select>
                    </label>
                    {[
                        { label: '總筆數', value: `${stats.count} 筆` },
                        { label: '淨坪合計', value: `${stats.sum} 坪` },
                        { label: 'Q1', value: `${stats.q1} 坪` },
                        { label: '中位數', value: `${stats.median} 坪` },
                        { label: 'Q3', value: `${stats.q3} 坪` }
                    ].map(item => (
                        <div key={item.label} className="min-w-[86px] rounded-xl border border-slate-100 bg-white px-3 py-2 text-center shadow-sm">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.label}</div>
                            <div className="mt-1 text-sm font-black text-slate-900">{item.value}</div>
                        </div>
                    ))}
                </div>
            </div>
            <StackedBar
                data={chartData}
                keys={activeRoomKeys}
                xAxisKey="name"
                xAxisLabel="坪數級距 (坪)"
                onSelect={onSelect}
                selectedSegment={selectedSegment}
            />
        </div>
    );
};

export const UnitHistogram: React.FC<{ data: HouseData[] }> = ({ data }) => {
    const { chartData, stats } = React.useMemo(() => {
        const units = data.map(d => d.unit).sort(d3.ascending);
        const stats = {
            q1: d3.quantile(units, 0.25)?.toFixed(1) || '0',
            median: d3.quantile(units, 0.5)?.toFixed(1) || '0',
            q3: d3.quantile(units, 0.75)?.toFixed(1) || '0'
        };
        const bins = Array.from({ length: 16 }, (_, i) => ({
            min: 90 + i * 10, max: 100 + i * 10, label: `${90 + i * 10}-${100 + i * 10}`
        }));
        const binCounts = bins.map(b => ({ name: b.label, count: data.filter(d => d.unit >= b.min && d.unit < b.max).length }));
        return { chartData: [...binCounts, { name: '≥250', count: data.filter(d => d.unit >= 250).length }], stats };
    }, [data]);

    return (
        <div className="w-full relative">
            <div className="flex items-center gap-8 mb-10 px-8">
                <div className="text-lg font-black text-slate-900">單價統計摘要 (萬/坪)</div>
                <div className="flex gap-4">
                    {[
                        { label: 'Q1', val: stats.q1, bg: 'bg-slate-50', text: 'text-slate-800' },
                        { label: '中位數', val: stats.median, bg: 'bg-blue-50', text: 'text-blue-800' },
                        { label: 'Q3', val: stats.q3, bg: 'bg-slate-50', text: 'text-slate-800' }
                    ].map(s => (
                        <div key={s.label} className={`${s.bg} border border-slate-100 px-6 py-3 rounded-2xl flex flex-col items-center min-w-[100px]`}>
                            <span className="text-[11px] text-slate-400 font-black uppercase mb-1">{s.label}</span>
                            <span className={`text-xl font-black ${s.text}`}>{s.val}</span>
                        </div>
                    ))}
                </div>
            </div>
            <AxisSideLabel value="案件數" />
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={chartData} margin={COMMON_MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={X_AXIS_HEIGHT} tick={{ fontSize: 13, fill: '#334155', fontWeight: 900 }} stroke="#e2e8f0" dy={X_AXIS_DY} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: '#334155', fontWeight: 900 }} />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.3)' }} />
                    <Bar dataKey="count" name="案件數" fill="#6366f1" radius={[8, 8, 0, 0]} barSize={54} opacity={0.86} label={{ position: 'top', fill: '#4338ca', fontSize: 14, fontWeight: '950', offset: 6 }} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};



export const RoomPieChart: React.FC<ChartProps> = ({ data, onSelect }) => {
    const chartData = React.useMemo(() => {
        const rollup = d3.rollups(data, v => v.length, d => d.type).sort((a, b) => b[1] - a[1]);
        return rollup.map(([name, value]) => ({ name, value }));
    }, [data]);
    const total = React.useMemo(() => chartData.reduce((sum, item) => sum + item.value, 0), [chartData]);
    const renderPieLabel = (props: any) => {
        const { cx, cy, midAngle, outerRadius } = props;
        const value = Number(props.value ?? props.payload?.value ?? 0);
        if (!total || !value) return null;
        const percent = Number.isFinite(props.percent)
            ? Math.round(Number(props.percent) * 100)
            : Math.round((value / total) * 100);
        if (percent < 3) return null;

        const radius = Number(outerRadius) + 24;
        const RADIAN = Math.PI / 180;
        const x = Number(cx) + radius * Math.cos(-midAngle * RADIAN);
        const y = Number(cy) + radius * Math.sin(-midAngle * RADIAN);

        return (
            <text
                x={x}
                y={y}
                textAnchor={x > Number(cx) ? 'start' : 'end'}
                dominantBaseline="central"
                fill="#0f172a"
                fontSize={13}
                fontWeight={950}
            >
                {percent}%
            </text>
        );
    };

    return (
        <div className="w-full relative">
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <PieChart>
                    <Pie 
                        data={chartData} 
                        cx="50%" cy="50%" 
                        innerRadius={88} 
                        outerRadius={140} 
                        paddingAngle={6} 
                        dataKey="value" 
                        label={renderPieLabel}
                        labelLine={false}
                        onClick={(e) => e && onSelect?.(e.name)} 
                        style={{ cursor: 'pointer' }}
                    >
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={ROOM_COLORS[entry.name] || COLORS[index % COLORS.length]} opacity={0.8} />
                        ))}
                    </Pie>
                    <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-950 text-3xl font-black">
                        {total}
                    </text>
                    <text x="50%" y="56%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-400 text-xs font-black tracking-widest">
                        總筆數
                    </text>
                    <Tooltip content={<CustomTooltip />} />
                </PieChart>
            </ResponsiveContainer>
            <LegendSection items={chartData.map(d => ({ name: d.name, color: ROOM_COLORS[d.name] || '#ddd' }))} />
        </div>
    );
};

export const DistRoomTypeBar: React.FC<ChartProps & { selectedSegment?: { group: string; roomType?: string } }> = ({ data, onSelect, selectedSegment }) => {
    const chartData = React.useMemo(() => d3.groups(data, d => d.dist).map(([bin, items]) => {
        const obj: any = { name: bin, total: items.length };
        ROOM_KEYS.forEach(k => obj[k] = items.filter(d => d.type === k).length);
        return obj;
    }).sort((a, b) => b.total - a.total), [data]);
    return <StackedBar data={chartData} keys={ROOM_KEYS} xAxisKey="name" xAxisLabel="行政區" onSelect={onSelect} selectedSegment={selectedSegment} />;
};

export const DistrictRoomHeatmap: React.FC<ChartProps & { selectedSegment?: { group: string; roomType?: string } }> = ({ data, onSelect, selectedSegment }) => {
    const [displayMode, setDisplayMode] = useState<'percent' | 'count'>('percent');
    const rows = React.useMemo(() => d3.groups(data, d => d.dist)
        .map(([dist, items]) => {
            const total = items.length;
            const counts = Object.fromEntries(ROOM_KEYS.map(key => [key, items.filter(d => d.type === key).length])) as Record<string, number>;
            return { dist, total, counts };
        })
        .sort((a, b) => b.total - a.total || a.dist.localeCompare(b.dist, 'zh-Hant')), [data]);

    const maxCount = Math.max(1, d3.max(rows.flatMap(row => ROOM_KEYS.map(key => row.counts[key] || 0))) || 1);
    const cellColor = (row: typeof rows[number], key: string) => {
        const count = row.counts[key] || 0;
        if (count === 0) return '#f8fafc';
        const value = displayMode === 'percent' && row.total > 0 ? count / row.total : count / maxCount;
        return d3.interpolateBlues(0.12 + value * 0.68);
    };
    const cellText = (row: typeof rows[number], key: string) => {
        const count = row.counts[key] || 0;
        if (count === 0) return '';
        if (displayMode === 'count') return `${count}`;
        return `${Math.round((count / row.total) * 100)}%`;
    };
    const downloadCsv = () => {
        const header = ['行政區', ...ROOM_KEYS, '總計'];
        const body = rows.map(row => [row.dist, ...ROOM_KEYS.map(key => String(row.counts[key] || 0)), String(row.total)]);
        const csv = [header, ...body]
            .map(cols => cols.map(col => `"${String(col).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `各行政區房型分佈熱力圖_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    if (rows.length === 0) return <EmptyChart message="沒有可分析的行政區房型資料" />;

    return (
        <div className="w-full relative">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4 px-4 export-exclude">
                <div className="text-sm font-bold text-slate-500">
                    顏色深淺代表佔比或數量，右側為該區成交總筆數。
                </div>
                <div className="flex flex-wrap gap-2">
                    <select
                        value={displayMode}
                        onChange={(event) => setDisplayMode(event.target.value as 'percent' | 'count')}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800 shadow-sm outline-none focus:border-blue-400"
                    >
                        <option value="percent">顯示比例 (%)</option>
                        <option value="count">顯示筆數</option>
                    </select>
                    <button
                        type="button"
                        onClick={downloadCsv}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800 shadow-sm hover:bg-slate-50"
                    >
                        下載 CSV
                    </button>
                </div>
            </div>
            <div className="overflow-x-auto px-4 pb-2">
                <div
                    className="grid min-w-[760px] gap-1"
                    style={{ gridTemplateColumns: `110px repeat(${ROOM_KEYS.length}, minmax(92px, 1fr)) 92px` }}
                >
                    <div />
                    {ROOM_KEYS.map(key => <div key={key} className="pb-2 text-center text-xs font-black text-slate-500">{key}</div>)}
                    <div className="pb-2 text-center text-xs font-black text-slate-500">總計</div>
                    {rows.map(row => (
                        <React.Fragment key={row.dist}>
                            <button type="button" onClick={() => onSelect?.(row.dist)} className="flex items-center justify-end pr-3 text-sm font-black text-slate-600 hover:text-blue-600">
                                {row.dist}
                            </button>
                            {ROOM_KEYS.map(key => {
                                const count = row.counts[key] || 0;
                                const pct = row.total > 0 ? Math.round((count / row.total) * 100) : 0;
                                const strong = count && (displayMode === 'percent' ? pct >= 45 : count / maxCount >= 0.45);
                                const isSelected = selectedSegment?.group === row.dist && selectedSegment?.roomType === key;
                                return (
                                    <button
                                        data-filter-segment="true"
                                        key={`${row.dist}-${key}`}
                                        type="button"
                                        onClick={() => count > 0 && onSelect?.(row.dist, key)}
                                        title={`${row.dist}｜${key}｜${count} 筆｜${pct}%`}
                                        className={`h-20 rounded-sm text-sm font-black transition-transform hover:scale-[1.02] hover:ring-2 hover:ring-blue-300 ${count > 0 ? 'cursor-pointer' : 'cursor-default'} ${isSelected ? 'ring-4 ring-blue-600 ring-offset-2' : ''}`}
                                        style={{ backgroundColor: cellColor(row, key), color: strong ? 'white' : '#0f172a', opacity: selectedSegment && !isSelected ? 0.48 : 1 }}
                                    >
                                        {cellText(row, key)}
                                    </button>
                                );
                            })}
                            <button type="button" onClick={() => onSelect?.(row.dist)} className="h-20 rounded-sm bg-slate-100 text-sm font-black text-slate-700 hover:ring-2 hover:ring-blue-300">
                                {row.total}
                            </button>
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
};

export const ParkingAreaBar: React.FC<ChartProps> = ({ data, onSelect }) => {
    const chartData = React.useMemo(() => {
        const bins = [
            { min: 0, max: 20, label: '<20坪' }, { min: 20, max: 30, label: '20-30坪' }, { min: 30, max: 40, label: '30-40坪' },
            { min: 40, max: 50, label: '40-50坪' }, { min: 50, max: 65, label: '50-65坪' }, { min: 65, max: 85, label: '65-85坪' },
            { min: 85, max: Infinity, label: '≥85坪' }
        ];
        const groups = d3.groups(data, d => {
            for (const b of bins) if (d.area >= b.min && d.area < b.max) return b.label;
            return '其他';
        }).map(([bin, items]) => ({
            name: bin,
            total: items.length,
            '有車位 (Parking)': items.filter(d => d.priceP > 0).length,
            '無車位 (None)': items.filter(d => d.priceP === 0).length
        }));
        groups.sort((a, b) => bins.findIndex(x => x.label === a.name) - bins.findIndex(x => x.label === b.name));
        return groups;
    }, [data]);

    if (data.length === 0) {
        return (
            <div className="w-full h-[280px] flex flex-col items-center justify-center bg-slate-50/50 rounded-[2rem] border border-dashed border-slate-200">
                <Car size={48} className="text-slate-300 mb-4" />
                <p className="text-slate-400 font-black text-sm tracking-widest uppercase">No Data Found</p>
                <p className="text-slate-300 text-xs mt-2 font-bold">請匯入實價登錄資料以進行分析</p>
            </div>
        );
    }

    return <StackedBar data={chartData} keys={['有車位 (Parking)', '無車位 (None)']} xAxisKey="name" xAxisLabel="坪數區間" onSelect={onSelect} />;
};

export const ParkingPriceBar: React.FC<{ data: any[] }> = ({ data }) => {
    const chartData = React.useMemo(() => {
        const withDistrict = data.filter(d => d.dist && d.dist !== '未標示');
        const rollup = d3.rollups(withDistrict, v => Math.round(d3.mean(v, d => d.price) || 0), d => d.dist).sort((a, b) => b[1] - a[1]);
        return rollup.map(([name, value]) => ({ name, value }));
    }, [data]);

    if (chartData.length === 0) {
        return (
            <div className="w-full h-[280px] flex flex-col items-center justify-center bg-slate-50/50 rounded-[2rem] border border-dashed border-slate-200">
                <Car size={48} className="text-slate-300 mb-4" />
                <p className="text-slate-400 font-black text-sm tracking-widest uppercase">No Parking Data Found</p>
                <p className="text-slate-300 text-xs mt-2 font-bold">請確認匯入資料中包含「車位價格」欄位</p>
            </div>
        );
    }

    return (
        <div className="w-full relative">
            <AxisSideLabel value="車位平均價格 (萬)" />
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={chartData} margin={COMMON_MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" angle={-35} textAnchor="end" height={X_AXIS_HEIGHT} tick={{ fontSize: 13, fill: '#334155', fontWeight: 900 }} stroke="#e2e8f0" dy={X_AXIS_DY} />
                    <YAxis stroke="#e2e8f0" tick={{ fontSize: 13, fill: '#334155', fontWeight: 900 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.3)' }} />
                    <Bar dataKey="value" name="平均價格" fill="#3b82f6" radius={[8, 8, 0, 0]} barSize={54} opacity={0.86} label={{ position: 'top', fill: '#1e3a8a', fontSize: 14, fontWeight: '950', offset: 6 }} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};
