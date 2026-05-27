import React, { useEffect, useRef, useState } from 'react';
import { HouseData } from '../types';
import * as d3 from 'd3';
import { Calendar, Home, Layers, Info, X } from 'lucide-react';

interface ProjectGridProps {
    data: HouseData[];
    title?: string;
    onClear?: () => void;
}

export const ProjectGrid: React.FC<ProjectGridProps> = ({ data, title, onClear }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [expandedProject, setExpandedProject] = useState<string | null>(null);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (containerRef.current) {
                containerRef.current.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start'
                });
            }
        }, 150);
        
        return () => clearTimeout(timer);
    }, [title]); 

    const projects = React.useMemo(() => {
        const groups = d3.group(data, d => d.project);
        return Array.from(groups.entries()).map(([name, items]) => {
            const units = items.map(i => i.unit);
            const totals = items.map(i => i.total);
            const areas = items.map(i => i.area);
            const transactions = [...items].sort((a, b) => {
                const aTime = a.date?.getTime() || 0;
                const bTime = b.date?.getTime() || 0;
                return aTime - bTime;
            });
            const latest = transactions[transactions.length - 1];
            
            return {
                name,
                dist: latest.dist,
                address: latest.address,
                date: latest.month,
                unitMin: d3.min(units),
                unitMax: d3.max(units),
                totalMin: d3.min(totals),
                totalMax: d3.max(totals),
                areaMin: d3.min(areas),
                areaMax: d3.max(areas),
                roomType: latest.type,
                count: items.length,
                transactions
            };
        }).sort((a, b) => b.count - a.count);
    }, [data]);

    useEffect(() => {
        setExpandedProject(null);
    }, [title]);

    const formatNumber = (value: number | null | undefined, digits = 0) => {
        if (!Number.isFinite(value)) return '-';
        return Number(value).toLocaleString('zh-TW', {
            maximumFractionDigits: digits,
            minimumFractionDigits: digits
        });
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
        if (floor === 0) return '0F';
        return `${floor}F`;
    };

    const getHouseTotal = (row: HouseData) => row.houseTotal > 0 ? row.houseTotal : row.total;

    if (projects.length === 0) return null;

    return (
        <div 
            ref={containerRef}
            data-filter-segment="true"
            className="mt-8 pt-8 border-t-2 border-slate-100 animate-in fade-in slide-in-from-top-6 duration-700 scroll-mt-64"
        >
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-2.5 h-10 bg-blue-600 rounded-full shadow-[0_0_15px_rgba(37,99,235,0.3)]"></div>
                    <div>
                        <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                            {title || '建案列表'}
                        </h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">
                            共 {projects.length} 個建案，{data.length} 筆成交
                        </p>
                    </div>
                </div>
                {onClear && (
                    <button 
                        onClick={onClear}
                        className="flex items-center gap-2 text-xs font-black text-rose-500 hover:text-white hover:bg-rose-500 transition-all duration-300 bg-rose-50 px-5 py-3 rounded-2xl border border-rose-100 shadow-sm"
                    >
                        <X size={16} />
                        清除篩選並關閉
                    </button>
                )}
            </div>
            
            <div className="max-h-[650px] overflow-y-auto pr-4 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-8">
                    {projects.map((p, idx) => {
                        const isExpanded = expandedProject === p.name;
                        return (
                        <div
                            key={p.name || idx}
                            className={`bg-white rounded-[2rem] border shadow-sm hover:shadow-2xl hover:border-blue-400 hover:-translate-y-2 transition-all duration-500 p-6 flex flex-col gap-4 relative overflow-hidden group ${
                                isExpanded ? 'border-blue-400 shadow-2xl ring-4 ring-blue-50' : 'border-slate-200'
                            }`}
                        >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-full -mr-12 -mt-12 group-hover:bg-blue-50 transition-colors duration-500"></div>

                            <button
                                type="button"
                                onClick={() => setExpandedProject(current => current === p.name ? null : p.name)}
                                className="relative z-10 flex flex-col gap-4 text-left"
                            >
                                <div className="flex justify-between items-start">
                                    <div className="max-w-[75%]">
                                        <h4 className="font-black text-xl text-slate-800 truncate leading-tight group-hover:text-blue-600 transition-colors">{p.name}</h4>
                                        <p className="text-[10px] font-bold text-slate-400 mt-0.5 truncate" title={p.address}>{p.address}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-400 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                                        <Calendar size={13} className="text-slate-300" />
                                        {p.date}
                                    </div>
                                </div>

                                <div className="space-y-3 my-1">
                                    <div className="flex justify-between items-center gap-2">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight shrink-0">總價</span>
                                        <span className="font-bold text-slate-700 text-sm whitespace-nowrap">
                                            {p.totalMin === p.totalMax ? `${p.totalMin}` : `${p.totalMin}~${p.totalMax}`} 
                                            <span className="text-[10px] font-bold ml-0.5 text-slate-400">萬</span>
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center bg-amber-50/70 p-4 rounded-2xl border border-amber-100/50 gap-2">
                                        <span className="text-[10px] font-black text-amber-600 uppercase tracking-tight shrink-0">成交均價</span>
                                        <span className="font-black text-amber-600 text-lg whitespace-nowrap flex items-baseline gap-0.5">
                                            {p.unitMin === p.unitMax ? `${p.unitMin}` : `${p.unitMin}~${p.unitMax}`} 
                                            <span className="text-[10px] font-bold text-amber-400">萬/坪</span>
                                        </span>
                                    </div>
                                </div>

                                <div className="flex gap-2 flex-wrap mt-2">
                                    <div className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 rounded-xl text-[10px] font-black text-blue-700 border border-blue-100">
                                        <Layers size={13} />
                                        {p.areaMin === p.areaMax ? `${p.areaMin}` : `${p.areaMin}~${p.areaMax}`}坪
                                    </div>
                                    <div className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 rounded-xl text-[10px] font-black text-rose-600 border border-rose-100">
                                        <Home size={13} />
                                        {p.roomType}
                                    </div>
                                    <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 rounded-xl text-[10px] font-black text-emerald-700 border border-emerald-100">
                                        <Info size={13} />
                                        {p.count}筆成交
                                    </div>
                                    <div className={`ml-auto px-3 py-2 rounded-xl text-[10px] font-black border transition-colors ${
                                        isExpanded ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-500 border-slate-100'
                                    }`}>
                                        {isExpanded ? '收合明細' : '展開明細'}
                                    </div>
                                </div>
                            </button>

                            {isExpanded && (
                                <div className="relative z-10 mt-1 border-t border-slate-100 pt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="mb-3 flex items-center justify-between">
                                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.18em]">
                                            逐筆成交明細
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-400">
                                            依成交日期由早到晚
                                        </span>
                                    </div>
                                    <div className="max-h-72 overflow-y-auto custom-scrollbar pr-1 space-y-2">
                                        {p.transactions.map((row, rowIndex) => (
                                            <div
                                                key={row.id || `${p.name}-${rowIndex}`}
                                                className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3 shadow-sm"
                                            >
                                                <div className="flex items-center justify-between gap-3 mb-2">
                                                    <div className="text-sm font-black text-slate-800">{formatDate(row)}</div>
                                                    <div className="text-[11px] font-black text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2.5 py-1">
                                                        {formatFloor(row.floor)}
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                    <div className="rounded-xl bg-white border border-slate-100 p-2">
                                                        <div className="font-black text-slate-400 mb-0.5">房屋總價</div>
                                                        <div className="font-black text-slate-800">{formatNumber(getHouseTotal(row))} 萬</div>
                                                    </div>
                                                    <div className="rounded-xl bg-white border border-slate-100 p-2">
                                                        <div className="font-black text-slate-400 mb-0.5">成交單價</div>
                                                        <div className="font-black text-amber-600">{formatNumber(row.unit, 2)} 萬/坪</div>
                                                    </div>
                                                    <div className="rounded-xl bg-white border border-slate-100 p-2">
                                                        <div className="font-black text-slate-400 mb-0.5">建物淨坪</div>
                                                        <div className="font-black text-slate-800">{formatNumber(row.area, 1)} 坪</div>
                                                    </div>
                                                    <div className="rounded-xl bg-white border border-slate-100 p-2">
                                                        <div className="font-black text-slate-400 mb-0.5">房型 / 衛浴</div>
                                                        <div className="font-black text-slate-800">{row.type} / {row.bath || '-'} 衛</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
