import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { HouseData } from '../../types';

const D3_MARGIN = { top: 32, right: 30, bottom: 82, left: 96 }; 
const CHART_HEIGHT = 480; 
const COLORS = ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];
const DISTRICT_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d', '#65a30d'];

const distinctProjectColor = (index: number) => {
    const hue = (index * 137.508 + 24) % 360;
    const saturation = 0.72 + (index % 3) * 0.08;
    const lightness = 0.42 + (Math.floor(index / 3) % 3) * 0.08;
    return d3.hsl(hue, saturation, lightness).formatHex();
};

const projectColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) {
        hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    }
    return distinctProjectColor(hash % 997);
};

interface AdvancedChartProps {
    data: HouseData[];
    onSelect?: (key: string) => void;
}

const appendVerticalYAxisLabel = (g: d3.Selection<SVGGElement, unknown, null, undefined>, label: string, height: number) => {
    g.append("text")
        .attr("x", -72)
        .attr("y", Math.max(34, height * 0.34))
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .text(label)
        .style("writing-mode", "vertical-rl")
        .style("font-size", "13px")
        .style("fill", "#334155")
        .style("font-weight", "950");
};

const appendCrosshair = (
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

const useClearTooltipOutsideChart = (
    svgRef: React.RefObject<SVGSVGElement>,
    clearTooltip: () => void,
    isActive: boolean
) => {
    useEffect(() => {
        if (!isActive) return;

        const handlePointerMove = (event: PointerEvent) => {
            const svg = svgRef.current;
            if (!svg) {
                clearTooltip();
                return;
            }
            const rect = svg.getBoundingClientRect();
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
    }, [svgRef, clearTooltip, isActive]);
};

export const PremiumRateChart: React.FC<AdvancedChartProps> = ({ data, onSelect }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [selectedDists, setSelectedDists] = useState<string[]>([]);
    const [hiddenDists, setHiddenDists] = useState<string[]>([]);
    const [hiddenProjects, setHiddenProjects] = useState<string[]>([]);
    const [tooltip, setTooltip] = useState<{ x: number, y: number, content: any } | null>(null);
    const [chartHeight, setChartHeight] = useState(CHART_HEIGHT);
    const [showCrosshair, setShowCrosshair] = useState(true);
    const zoomRef = useRef<any>(null);
    const clearTooltip = React.useCallback(() => setTooltip(null), []);
    useClearTooltipOutsideChart(svgRef, clearTooltip, Boolean(tooltip));

    const districts = React.useMemo(() => {
        return Array.from(new Set(data.map(d => d.dist))).sort();
    }, [data]);

    const handleResetZoom = () => {
        if (zoomRef.current && svgRef.current) {
            d3.select(svgRef.current).transition().duration(750).call(zoomRef.current.transform, d3.zoomIdentity);
        }
    };

    const projectStats = React.useMemo(() => {
        return d3.rollups(data, v => v.length, d => d.project).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0], 'zh-Hant'));
    }, [data]);

    const projectColorMap = React.useMemo(() => {
        return new Map(projectStats.map(([project], index) => [project, distinctProjectColor(index)]));
    }, [projectStats]);

    const districtStats = React.useMemo(() => {
        return d3.rollups(data, v => v.length, d => d.dist).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0], 'zh-Hant'));
    }, [data]);

    useEffect(() => {
        if (!svgRef.current || data.length === 0) return;
        const width = svgRef.current.clientWidth - D3_MARGIN.left - D3_MARGIN.right;
        const height = chartHeight - D3_MARGIN.top - D3_MARGIN.bottom;

        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove();

        // 建立裁剪路徑 (Clip Path) 防止點跑出主圖表區
        svg.append("defs").append("clipPath")
            .attr("id", "clip-premium")
            .append("rect")
            .attr("width", width)
            .attr("height", height);

        const g = svg.append("g").attr("transform", `translate(${D3_MARGIN.left},${D3_MARGIN.top})`);
        const chartArea = g.append("g").attr("clip-path", "url(#clip-premium)");

        const districtVisibleData = data.filter(d => !hiddenDists.includes(d.dist));
        const visibleData = districtVisibleData.filter(d => !hiddenProjects.includes(d.project));
        const distAvgMap = new Map<string, number>(
            d3.rollups(visibleData, v => d3.mean(v, d => d.unit) || 0, d => d.dist)
        );

        const buildProjects = (source: HouseData[]) => d3.rollups(source, v => ({
            unit: d3.mean(v, d => d.unit) || 0,
            dist: v[0].dist,
            count: v.length,
            project: v[0].project
        }), d => d.project)
        .map(d => d[1])
        .filter(d => d.unit > 0 && distAvgMap.has(d.dist));

        const allProjects = buildProjects(districtVisibleData);
        const projects = buildProjects(visibleData);

        const plotData = projects.map(p => ({
            ...p,
            distAvg: distAvgMap.get(p.dist) || 0
        })).sort((a,b) => b.count - a.count);

        const plotDataForScale = allProjects.map(p => ({
            ...p,
            distAvg: distAvgMap.get(p.dist) || 0
        }));

        const maxVal = d3.max(plotDataForScale, d => Math.max(d.unit, d.distAvg)) || 100;
        const x = d3.scaleLinear().domain([0, maxVal * 1.1]).range([0, width]);
        const y = d3.scaleLinear().domain([0, maxVal * 1.1]).range([height, 0]);
        const r = d3.scaleSqrt().domain([0, d3.max(plotDataForScale, d => d.count) || 10]).range([8, 28]);
        const districtColor = d3.scaleOrdinal<string>()
            .domain(districts)
            .range(districts.map((_, index) => DISTRICT_COLORS[index % DISTRICT_COLORS.length]));

        const districtLabelWidth = 88;
        const districtLabelGap = 8;
        const districtLabelRows = [10, 36, 62];
        const districtRowRights = districtLabelRows.map(() => Number.NEGATIVE_INFINITY);
        const districtGuides = Array.from(distAvgMap, ([dist, avg]) => ({
            dist,
            avg,
            count: visibleData.filter(item => item.dist === dist).length
        }))
            .filter(item => item.avg > 0 && item.count > 0)
            .sort((a, b) => a.avg - b.avg)
            .map(item => {
                const center = x(item.avg);
                const left = center - districtLabelWidth / 2;
                const right = center + districtLabelWidth / 2;
                let rowIndex = districtRowRights.findIndex(rowRight => left > rowRight + districtLabelGap);
                if (rowIndex === -1) {
                    rowIndex = districtRowRights.indexOf(Math.min(...districtRowRights));
                }
                districtRowRights[rowIndex] = right;
                return { ...item, labelY: districtLabelRows[rowIndex] };
            });

        // 座標軸定義
        const xAxis = d3.axisBottom(x).tickSize(-height).tickPadding(12);
        const yAxis = d3.axisLeft(y).tickSize(-width).tickPadding(12);

        let currentX = x;
        let currentY = y;

        const gX = g.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis);

        const gY = g.append("g")
            .call(yAxis);

        // Styling axis logic
        const styleAxes = () => {
            g.selectAll(".domain").style("stroke", "#e2e8f0").style("stroke-width", "2");
            g.selectAll(".tick line").style("stroke", "#f1f5f9").style("stroke-width", 1.5).style("stroke-dasharray", "4,4");
            g.selectAll(".tick text").style("font-size", "12px").style("font-weight", "900").style("fill", "#334155");
        };
        styleAxes();

        const crosshair = g.append("g")
            .attr("class", "market-crosshair")
            .style("display", "none")
            .style("pointer-events", "none");

        const crosshairX = crosshair.append("line")
            .attr("y1", 0)
            .attr("y2", height)
            .attr("stroke", "#0f172a")
            .attr("stroke-width", 1.2)
            .attr("stroke-dasharray", "5,5")
            .attr("opacity", 0.38);

        const crosshairY = crosshair.append("line")
            .attr("x1", 0)
            .attr("x2", width)
            .attr("stroke", "#0f172a")
            .attr("stroke-width", 1.2)
            .attr("stroke-dasharray", "5,5")
            .attr("opacity", 0.38);

        const crosshairXLabel = crosshair.append("text")
            .attr("y", height + 42)
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .style("font-weight", "950")
            .style("fill", "#0f172a")
            .style("paint-order", "stroke")
            .style("stroke", "#ffffff")
            .style("stroke-width", 4);

        const crosshairYLabel = crosshair.append("text")
            .attr("x", -16)
            .attr("text-anchor", "end")
            .style("font-size", "12px")
            .style("font-weight", "950")
            .style("fill", "#0f172a")
            .style("paint-order", "stroke")
            .style("stroke", "#ffffff")
            .style("stroke-width", 4);

        // 基準對角線
        const diag = chartArea.append('line')
            .attr('x1', x(0)).attr('y1', y(0))
            .attr('x2', x(maxVal*1.1)).attr('y2', y(maxVal*1.1))
            .attr('stroke', '#cbd5e1').attr('stroke-width', 2).attr('stroke-dasharray', '8,6');

        const guideLines = chartArea.append("g")
            .selectAll("line")
            .data(districtGuides)
            .join("line")
            .attr("x1", d => x(d.avg))
            .attr("x2", d => x(d.avg))
            .attr("y1", 0)
            .attr("y2", height)
            .attr("stroke", d => districtColor(d.dist))
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "4,6")
            .attr("opacity", 0.22);

        const guideLabels = g.append("g")
            .attr("class", "district-guide-labels")
            .selectAll("g")
            .data(districtGuides)
            .join("g")
            .attr("transform", d => `translate(${x(d.avg)},${d.labelY})`);

        guideLabels.append("rect")
            .attr("x", -44)
            .attr("y", -13)
            .attr("width", 88)
            .attr("height", 22)
            .attr("rx", 11)
            .attr("fill", "white")
            .attr("stroke", d => districtColor(d.dist))
            .attr("stroke-width", 1.2)
            .attr("opacity", 0.94);

        guideLabels.append("text")
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .style("font-size", "11px")
            .style("font-weight", "950")
            .style("fill", "#0f172a")
            .text(d => `${d.dist} ${Math.round(d.avg)}`);
        
        const dots = chartArea.selectAll("circle").data(plotData).join("circle")
            .attr("cx", d => x(d.distAvg))
            .attr("cy", d => y(d.unit))
            .attr("r", d => r(d.count))
            .attr("fill", d => projectColorMap.get(d.project) || projectColor(d.project))
            .attr("opacity", 0.75) 
            .attr("stroke", "white").attr("stroke-width", 2)
            .style("cursor", "pointer")
            .on("click", (event, d) => onSelect?.(d.dist))
            .on("mouseover", (event, d) => {
                setTooltip({
                    x: event.clientX,
                    y: event.clientY,
                    content: { name: d.project, dist: d.dist, unit: d.unit, distAvg: d.distAvg, count: d.count }
                });
            })
            .on("mousemove", (event) => {
                setTooltip(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null);
            })
            .on("mouseout", () => setTooltip(null));

        // Zoom 處理
        const zoom = d3.zoom()
            .scaleExtent([0.5, 10])
            .extent([[0, 0], [width, height]])
            .on("zoom", (event) => {
                const transform = event.transform;
                const newX = transform.rescaleX(x);
                const newY = transform.rescaleY(y);
                currentX = newX;
                currentY = newY;

                gX.call(xAxis.scale(newX));
                gY.call(yAxis.scale(newY));
                styleAxes();

                diag.attr('x1', newX(0)).attr('y1', newY(0))
                   .attr('x2', newX(maxVal*1.1)).attr('y2', newY(maxVal*1.1));

                guideLines
                    .attr("x1", d => newX(d.avg))
                    .attr("x2", d => newX(d.avg));

                guideLabels
                    .attr("transform", d => `translate(${newX(d.avg)},${d.labelY})`);

                dots.attr("cx", d => newX(d.distAvg))
                    .attr("cy", d => newY(d.unit));
            });

        zoomRef.current = zoom;
        svg.call(zoom as any)
            .on("mousemove.crosshair", (event) => {
                if (!showCrosshair) {
                    crosshair.style("display", "none");
                    return;
                }
                const [mx, my] = d3.pointer(event, g.node());
                if (mx < 0 || mx > width || my < 0 || my > height) {
                    crosshair.style("display", "none");
                    return;
                }

                crosshair.style("display", null);
                crosshairX.attr("x1", mx).attr("x2", mx);
                crosshairY.attr("y1", my).attr("y2", my);
                crosshairXLabel
                    .attr("x", mx)
                    .text(`${Math.max(0, currentX.invert(mx)).toFixed(1)} 坪`);
                crosshairYLabel
                    .attr("y", my - 8)
                    .text(`${Math.max(0, currentY.invert(my)).toFixed(1)} 萬/坪`);
            })
            .on("mouseleave.crosshair", () => {
                crosshair.style("display", "none");
            });
            
        g.append("text")
            .attr("x", width / 2)
            .attr("y", height + 58) 
            .attr("text-anchor", "middle")
            .text("行政區均價 (萬/坪)")
            .style("font-size", "14px")
            .style("fill", "#334155")
            .style("font-weight", "950");

        appendVerticalYAxisLabel(g, "個案平均單價 (萬/坪)", height);

    }, [data, onSelect, hiddenProjects, hiddenDists, chartHeight, projectStats, projectColorMap, showCrosshair]);

    const toggleDist = (dist: string) => {
        setSelectedDists(prev => prev.includes(dist) ? prev.filter(d => d !== dist) : [...prev, dist]);
    };

    const toggleHiddenDist = (dist: string) => {
        setHiddenDists(prev => prev.includes(dist) ? prev.filter(d => d !== dist) : [...prev, dist]);
    };

    return (
        <div className="w-full relative">
            {tooltip && (
                <div 
                    className="fixed z-[1000] pointer-events-none bg-white/98 backdrop-blur-md p-5 border border-slate-200 shadow-2xl rounded-2xl text-sm min-w-[200px]"
                    style={{ left: tooltip.x + 15, top: tooltip.y - 15 }}
                >
                    <p className="font-black text-slate-950 mb-3 border-b pb-3 border-slate-100 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        {tooltip.content.name}
                    </p>
                    <div className="space-y-2.5">
                        <div className="flex justify-between gap-4">
                            <span className="font-bold text-slate-500">行政區:</span>
                            <span className="font-black text-slate-800">{tooltip.content.dist}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="font-bold text-slate-500">個案平均單價:</span>
                            <span className="font-black text-indigo-600">{Math.round(tooltip.content.unit * 10) / 10} 萬/坪</span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="font-bold text-slate-500">行政區均價:</span>
                            <span className="font-black text-slate-600">{Math.round(tooltip.content.distAvg * 10) / 10} 萬/坪</span>
                        </div>
                        <div className="flex justify-between gap-4 pt-1 border-t border-slate-50">
                            <span className="font-bold text-slate-500">溢價/折價率:</span>
                            {(() => {
                                const rate = ((tooltip.content.unit - tooltip.content.distAvg) / tooltip.content.distAvg) * 100;
                                const isPremium = rate >= 0;
                                return (
                                    <span className={`font-black ${isPremium ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {isPremium ? '▲ ' : '▼ '}
                                        {Math.abs(Math.round(rate * 10) / 10)}%
                                    </span>
                                );
                            })()}
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="font-bold text-slate-500">總成交筆數:</span>
                            <div className="bg-slate-100 px-3 py-0.5 rounded-lg">
                                <span className="font-black text-slate-800">{tooltip.content.count} 筆</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <div className="hidden">
                <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">行政區篩選 (可複選):</span>
                        {selectedDists.length > 0 && (
                            <button 
                                onClick={() => {
                                    setSelectedDists([]);
                                    setHiddenDists([]);
                                    setHiddenProjects([]);
                                }}
                                className="text-[10px] font-black text-blue-600 hover:text-blue-700 underline"
                            >
                                清除全部
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {districts.map(d => {
                            const isSelected = selectedDists.includes(d);
                            return (
                                <button
                                    key={d}
                                    onClick={() => toggleDist(d)}
                                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all duration-300 border ${
                                        isSelected 
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-105' 
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400 hover:text-blue-600'
                                    }`}
                                >
                                    {d}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
            <div className="flex justify-end px-8 mb-4 export-exclude items-center gap-6">
                <button 
                    onClick={handleResetZoom}
                    className="text-[10px] font-black bg-slate-100 text-slate-500 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-200 hover:text-slate-800 transition-all uppercase tracking-widest"
                >
                    重設縮放 (Reset Zoom)
                </button>
                <CrosshairToggle enabled={showCrosshair} onToggle={() => setShowCrosshair(prev => !prev)} />
                <div className="flex items-center gap-4 bg-white/50 backdrop-blur px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">調整圖表高度</span>
                    <input 
                        type="range" 
                        min="300" 
                        max="700" 
                        step="10"
                        value={chartHeight} 
                        onChange={(e) => setChartHeight(Number(e.target.value))}
                        className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <span className="text-[10px] font-bold text-slate-600 min-w-[40px]">{chartHeight}px</span>
                </div>
            </div>
            <svg ref={svgRef} width="100%" height={chartHeight} className="bg-white" />
            <div className="mt-6 px-8 pt-6 border-t border-slate-100">
                <div className="flex items-center justify-center gap-3 mb-4">
                    <div className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">行政區圖例 (點擊隱藏):</div>
                    {hiddenDists.length > 0 && (
                        <button
                            onClick={() => setHiddenDists([])}
                            className="text-[10px] font-black text-blue-600 hover:text-blue-700 underline"
                        >
                            顯示全部行政區
                        </button>
                    )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center pb-3 px-3">
                    {districtStats.map(([dist, count]) => {
                        const isHidden = hiddenDists.includes(dist);
                        return (
                            <div
                                key={dist}
                                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-black cursor-pointer transition-all ${
                                    isHidden
                                        ? 'bg-slate-50 border-slate-100 text-slate-300 line-through'
                                        : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-600 shadow-sm'
                                }`}
                                onClick={() => toggleHiddenDist(dist)}
                            >
                                <span>{dist}</span>
                                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${isHidden ? 'bg-slate-100 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>
                                    {count}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="mt-8 px-8 pt-8 border-t border-slate-100">
                <div className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 text-center">建案圖例 (點擊隱藏):</div>
                <div className="flex flex-wrap gap-x-5 gap-y-2 justify-center max-h-28 overflow-y-auto custom-scrollbar pb-3 px-3">
                    {projectStats.map(([proj, count], i) => {
                        const isHidden = hiddenProjects.includes(proj);
                        return (
                            <div 
                                key={proj} 
                                className={`flex items-center gap-2.5 text-[13px] font-black cursor-pointer transition-all ${isHidden ? 'opacity-20 grayscale' : 'text-slate-800 hover:scale-105'}`}
                                onClick={() => setHiddenProjects(prev => isHidden ? prev.filter(p => p !== proj) : [...prev, proj])}
                            >
                                <div className="w-3.5 h-3.5 rounded-sm shadow-sm" style={{ backgroundColor: projectColorMap.get(proj) || projectColor(proj) }} />
                                <span className="truncate max-w-[180px] tracking-tight">{proj}</span>
                                <span className="text-[11px] text-slate-400 font-bold">({count})</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export const AgeUnitScatter: React.FC<AdvancedChartProps> = ({ data, onSelect }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [tooltip, setTooltip] = useState<{ x: number, y: number, content: any } | null>(null);
    const [chartHeight, setChartHeight] = useState(CHART_HEIGHT);
    const zoomRef = useRef<any>(null);
    const clearTooltip = React.useCallback(() => setTooltip(null), []);
    useClearTooltipOutsideChart(svgRef, clearTooltip, Boolean(tooltip));

    const handleResetZoom = () => {
        if (zoomRef.current && svgRef.current) {
            d3.select(svgRef.current).transition().duration(750).call(zoomRef.current.transform, d3.zoomIdentity);
        }
    };

    useEffect(() => {
        if (!svgRef.current || data.length === 0) return;
        const width = svgRef.current.clientWidth - D3_MARGIN.left - D3_MARGIN.right;
        const height = chartHeight - D3_MARGIN.top - D3_MARGIN.bottom;
        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove();

        svg.append("defs").append("clipPath")
            .attr("id", "clip-ageunit")
            .append("rect")
            .attr("width", width)
            .attr("height", height);

        const g = svg.append("g").attr("transform", `translate(${D3_MARGIN.left},${D3_MARGIN.top})`);
        const chartArea = g.append("g").attr("clip-path", "url(#clip-ageunit)");
        
        const x = d3.scaleLinear().domain([0, d3.max(data, d => d.age) || 50]).range([0, width]);
        const y = d3.scaleLinear().domain([0, d3.max(data, d => d.unit) || 200]).range([height, 0]);

        const xAxis = d3.axisBottom(x).tickSize(-height).tickPadding(12);
        const yAxis = d3.axisLeft(y).tickSize(-width).tickPadding(12);

        const gX = g.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis);

        const gY = g.append("g")
            .call(yAxis);

        const styleAxes = () => {
            g.selectAll(".domain").style("stroke", "#e2e8f0").style("stroke-width", "2");
            g.selectAll(".tick line").style("stroke", "#f1f5f9").style("stroke-width", 1.5).style("stroke-dasharray", "4,4");
            g.selectAll(".tick text").style("font-size", "12px").style("font-weight", "900").style("fill", "#334155");
        };
        styleAxes();

        const dots = chartArea.selectAll("circle").data(data.filter((_,i) => i%2===0)).join("circle")
            .attr("cx", d => x(d.age))
            .attr("cy", d => y(d.unit))
            .attr("r", 5)
            .attr("fill", "#3b82f6")
            .attr("opacity", 0.65)
            .style("cursor", "pointer")
            .on("click", (e, d) => onSelect?.(d.dist))
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

        const zoom = d3.zoom()
            .scaleExtent([0.5, 10])
            .extent([[0, 0], [width, height]])
            .on("zoom", (event) => {
                const transform = event.transform;
                const newX = transform.rescaleX(x);
                const newY = transform.rescaleY(y);

                gX.call(xAxis.scale(newX));
                gY.call(yAxis.scale(newY));
                styleAxes();

                dots.attr("cx", d => newX(d.age))
                    .attr("cy", d => newY(d.unit));
            });

        zoomRef.current = zoom;
        svg.call(zoom as any);

        g.append("text")
            .attr("x", width/2)
            .attr("y", height + 58)
            .attr("text-anchor", "middle")
            .text("屋齡 (年)")
            .style("font-size", "14px")
            .style("fill", "#334155")
            .style("font-weight", "950");

        appendVerticalYAxisLabel(g, "成交單價 (萬/坪)", height);
    }, [data, onSelect, chartHeight]);

    return (
        <div className="w-full relative">
            {tooltip && (
                <div 
                    className="fixed z-[1000] pointer-events-none bg-white/98 backdrop-blur-md p-5 border border-slate-200 shadow-2xl rounded-2xl text-sm min-w-[200px]"
                    style={{ left: tooltip.x + 15, top: tooltip.y - 15 }}
                >
                    <p className="font-black text-slate-950 mb-3 border-b pb-2 border-slate-100">{tooltip.content.project}</p>
                    <div className="space-y-2">
                        <div className="flex justify-between gap-4">
                            <span className="font-bold text-slate-500">行政區:</span>
                            <span className="font-black text-slate-800">{tooltip.content.dist}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="font-bold text-slate-500">屋齡:</span>
                            <span className="font-black text-slate-800">{tooltip.content.age} 年</span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="font-bold text-slate-500">成交單價:</span>
                            <span className="font-black text-indigo-600">{tooltip.content.unit} 萬/坪</span>
                        </div>
                    </div>
                </div>
            )}
            <div className="flex justify-end px-8 mb-4 export-exclude items-center gap-6">
                <button 
                    onClick={handleResetZoom}
                    className="text-[10px] font-black bg-slate-100 text-slate-500 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-200 hover:text-slate-800 transition-all uppercase tracking-widest"
                >
                    重設縮放 (Reset Zoom)
                </button>
                <div className="flex items-center gap-4 bg-white/50 backdrop-blur px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">調整圖表高度</span>
                    <input 
                        type="range" 
                        min="300" 
                        max="700" 
                        step="10"
                        value={chartHeight} 
                        onChange={(e) => setChartHeight(Number(e.target.value))}
                        className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <span className="text-[10px] font-bold text-slate-600 min-w-[40px]">{chartHeight}px</span>
                </div>
            </div>
            <svg ref={svgRef} width="100%" height={chartHeight} className="bg-white" />
            <div className="mt-2 border-t border-slate-50 pt-6 flex justify-center">
                <div className="flex items-center gap-3"><div className="w-4 h-4 bg-blue-400 rounded-sm shadow-sm" /><span className="text-[13px] font-black text-slate-800">單價分佈 (萬) vs 屋齡</span></div>
            </div>
        </div>
    );
};


export const TwoBedScatter: React.FC<AdvancedChartProps> = ({ data, onSelect }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [hiddenBath, setHiddenBath] = useState<number[]>([]);
    const [tooltip, setTooltip] = useState<{ x: number, y: number, content: any } | null>(null);
    const [chartHeight, setChartHeight] = useState(CHART_HEIGHT);
    const [showCrosshair, setShowCrosshair] = useState(true);
    const zoomRef = useRef<any>(null);
    const clearTooltip = React.useCallback(() => setTooltip(null), []);
    useClearTooltipOutsideChart(svgRef, clearTooltip, Boolean(tooltip));

    const handleResetZoom = () => {
        if (zoomRef.current && svgRef.current) {
            d3.select(svgRef.current).transition().duration(750).call(zoomRef.current.transform, d3.zoomIdentity);
        }
    };

    useEffect(() => {
        if (!svgRef.current || data.length === 0) return;
        const baseData = data.filter(d => d.type === '2房');
        const plotData = baseData.filter(d => !hiddenBath.includes(d.bath));

        const width = svgRef.current.clientWidth - D3_MARGIN.left - D3_MARGIN.right;
        const height = chartHeight - D3_MARGIN.top - D3_MARGIN.bottom;
        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove();

        svg.append("defs").append("clipPath")
            .attr("id", "clip-twobed")
            .append("rect")
            .attr("width", width)
            .attr("height", height);

        const g = svg.append("g").attr("transform", `translate(${D3_MARGIN.left},${D3_MARGIN.top})`);
        const chartArea = g.append("g").attr("clip-path", "url(#clip-twobed)");
        
        const x = d3.scaleLinear().domain([0, d3.max(baseData, d => d.area) || 50]).range([0, width]);
        const y = d3.scaleLinear().domain([0, d3.max(baseData, d => d.total) || 5000]).range([height, 0]);
        const color = d3.scaleOrdinal<string>().domain(['1', '2']).range(['#3b82f6', '#ef4444']);

        const xAxis = d3.axisBottom(x).tickSize(-height).tickPadding(12);
        const yAxis = d3.axisLeft(y).tickSize(-width).tickPadding(12);
        let currentX = x;
        let currentY = y;

        const gX = g.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis);

        const gY = g.append("g")
            .call(yAxis);

        const styleAxes = () => {
            g.selectAll(".domain").style("stroke", "#e2e8f0").style("stroke-width", "2");
            g.selectAll(".tick line").style("stroke", "#f1f5f9").style("stroke-width", 1.5).style("stroke-dasharray", "4,4");
            g.selectAll(".tick text").style("font-size", "12px").style("font-weight", "900").style("fill", "#334155");
        };
        styleAxes();

        const crosshairParts = appendCrosshair(g, width, height);
        
        const dots = chartArea.selectAll("circle").data(plotData).join("circle")
            .attr("cx", d => x(d.area))
            .attr("cy", d => y(d.total))
            .attr("r", 6)
            .attr("fill", d => color(String(d.bath)))
            .attr("opacity", 0.7)
            .attr("stroke", "white")
            .attr("stroke-width", 1.5)
            .style("cursor", "pointer")
            .on("click", (e, d) => onSelect?.(d.dist))
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

        const zoom = d3.zoom()
            .scaleExtent([0.5, 10])
            .extent([[0, 0], [width, height]])
            .on("zoom", (event) => {
                const transform = event.transform;
                const newX = transform.rescaleX(x);
                const newY = transform.rescaleY(y);
                currentX = newX;
                currentY = newY;

                gX.call(xAxis.scale(newX));
                gY.call(yAxis.scale(newY));
                styleAxes();

                dots.attr("cx", d => newX(d.area))
                    .attr("cy", d => newY(d.total));
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
                crosshairParts.xLabel.attr("x", mx).text(`${Math.max(0, currentX.invert(mx)).toFixed(1)} 坪`);
                crosshairParts.yLabel.attr("y", my - 8).text(`${Math.max(0, currentY.invert(my)).toFixed(0)} 萬`);
            })
            .on("mouseleave.crosshair", () => crosshairParts.crosshair.style("display", "none"));

        g.append("text")
            .attr("x", width/2)
            .attr("y", height + 58)
            .attr("text-anchor", "middle")
            .text("建物淨坪數 (坪)")
            .style("font-size", "14px")
            .style("fill", "#334155")
            .style("font-weight", "950");

        appendVerticalYAxisLabel(g, "房屋總價 (萬)", height);
    }, [data, onSelect, hiddenBath, chartHeight, showCrosshair]);

    const toggleBath = (bath: number) => {
        setHiddenBath(prev => prev.includes(bath) ? prev.filter(b => b !== bath) : [...prev, bath]);
    };

    return <div className="w-full relative">
        {tooltip && (
            <div 
                className="fixed z-[1000] pointer-events-none bg-white/98 backdrop-blur-md p-5 border border-slate-200 shadow-2xl rounded-2xl text-sm min-w-[200px]"
                style={{ left: tooltip.x + 15, top: tooltip.y - 15 }}
            >
                <p className="font-black text-slate-950 mb-3 border-b pb-2 border-slate-100">{tooltip.content.project}</p>
                <div className="space-y-2">
                    <div className="flex justify-between gap-4">
                        <span className="font-bold text-slate-500">行政區:</span>
                        <span className="font-black text-slate-800">{tooltip.content.dist}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                        <span className="font-bold text-slate-500">成交日期:</span>
                        <span className="font-black text-slate-800">
                            {tooltip.content.date ? d3.timeFormat('%Y/%m/%d')(tooltip.content.date) : '未標示'}
                        </span>
                    </div>
                    <div className="flex justify-between gap-4">
                        <span className="font-bold text-slate-500">建物淨坪數:</span>
                        <span className="font-black text-slate-800">{tooltip.content.area} 坪</span>
                    </div>
                    <div className="flex justify-between gap-4">
                        <span className="font-bold text-slate-500">房屋總價:</span>
                        <span className="font-black text-rose-600">{tooltip.content.total} 萬</span>
                    </div>
                    <div className="flex justify-between gap-4">
                        <span className="font-bold text-slate-500">衛浴數:</span>
                        <span className="font-black text-slate-800">{tooltip.content.bath} 衛</span>
                    </div>
                </div>
            </div>
        )}
        <div className="flex justify-end px-8 mb-4 export-exclude items-center gap-6">
            <button 
                onClick={handleResetZoom}
                className="text-[10px] font-black bg-slate-100 text-slate-500 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-200 hover:text-slate-800 transition-all uppercase tracking-widest"
            >
                重設縮放 (Reset Zoom)
            </button>
            <CrosshairToggle enabled={showCrosshair} onToggle={() => setShowCrosshair(prev => !prev)} />
            <div className="flex items-center gap-4 bg-white/50 backdrop-blur px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">調整圖表高度</span>
                <input 
                    type="range" 
                    min="300" 
                    max="700" 
                    step="10"
                    value={chartHeight} 
                    onChange={(e) => setChartHeight(Number(e.target.value))}
                    className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <span className="text-[10px] font-bold text-slate-600 min-w-[40px]">{chartHeight}px</span>
            </div>
        </div>
        <svg ref={svgRef} width="100%" height={chartHeight} className="bg-white" />
        <div className="mt-4 border-t border-slate-50 pt-6 flex justify-center gap-10">
            <div 
                className={`flex items-center gap-3 cursor-pointer select-none transition-all ${hiddenBath.includes(1) ? 'opacity-20 grayscale' : 'hover:scale-105'}`}
                onClick={() => toggleBath(1)}
            >
                <div className="w-4 h-4 bg-blue-400 rounded-sm shadow-sm" />
                <span className="text-[13px] font-black text-slate-800">1衛配置 (Standard)</span>
            </div>
            <div 
                className={`flex items-center gap-3 cursor-pointer select-none transition-all ${hiddenBath.includes(2) ? 'opacity-20 grayscale' : 'hover:scale-105'}`}
                onClick={() => toggleBath(2)}
            >
                <div className="w-4 h-4 bg-rose-400 rounded-sm shadow-sm" />
                <span className="text-[13px] font-black text-slate-800">2衛配置 (Double Suite)</span>
            </div>
        </div>
    </div>;
};

export const ScatterUnitAreaD3: React.FC<AdvancedChartProps> = ({ data, onSelect }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [hiddenDists, setHiddenDists] = useState<string[]>([]);
    const [tooltip, setTooltip] = useState<{ x: number, y: number, content: any } | null>(null);
    const [chartHeight, setChartHeight] = useState(CHART_HEIGHT);
    const [showCrosshair, setShowCrosshair] = useState(true);
    const zoomRef = useRef<any>(null);
    const clearTooltip = React.useCallback(() => setTooltip(null), []);
    useClearTooltipOutsideChart(svgRef, clearTooltip, Boolean(tooltip));

    const handleResetZoom = () => {
        if (zoomRef.current && svgRef.current) {
            d3.select(svgRef.current).transition().duration(750).call(zoomRef.current.transform, d3.zoomIdentity);
        }
    };

    const plotDataRaw = React.useMemo(() => {
        const subset = data.length > 2000 ? data.filter((_, i) => i % 2 === 0) : data;
        return subset.map(d => ({ x: d.area, y: d.unit, dist: d.dist, name: d.project }));
    }, [data]);

    const dists = React.useMemo(() => Array.from(new Set(plotDataRaw.map(d => d.dist))).sort(), [plotDataRaw]);

    useEffect(() => {
        if (!svgRef.current || data.length === 0) return;
        const plotData = plotDataRaw.filter(d => !hiddenDists.includes(d.dist));

        const width = svgRef.current.clientWidth - D3_MARGIN.left - D3_MARGIN.right;
        const height = chartHeight - D3_MARGIN.top - D3_MARGIN.bottom;
        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove();

        svg.append("defs").append("clipPath")
            .attr("id", "clip-market")
            .append("rect")
            .attr("width", width)
            .attr("height", height);

        const g = svg.append("g").attr("transform", `translate(${D3_MARGIN.left},${D3_MARGIN.top})`);
        const chartArea = g.append("g").attr("clip-path", "url(#clip-market)");
        
        const x = d3.scaleLinear().domain([0, d3.max(plotDataRaw, d => d.x) || 100]).range([0, width]);
        const y = d3.scaleLinear().domain([0, d3.max(plotDataRaw, d => d.y) || 200]).range([height, 0]);
        const color = d3.scaleOrdinal<string>().domain(dists).range(d3.schemeTableau10);

        const xAxis = d3.axisBottom(x).tickSize(-height).tickPadding(12);
        const yAxis = d3.axisLeft(y).tickSize(-width).tickPadding(12);
        let currentX = x;
        let currentY = y;

        const gX = g.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis);

        const gY = g.append("g")
            .call(yAxis);

        const styleAxes = () => {
            g.selectAll(".domain").style("stroke", "#e2e8f0").style("stroke-width", "2");
            g.selectAll(".tick line").style("stroke", "#f1f5f9").style("stroke-width", 1.5).style("stroke-dasharray", "4,4");
            g.selectAll(".tick text").style("font-size", "12px").style("font-weight", "900").style("fill", "#334155");
        };
        styleAxes();

        const crosshairParts = appendCrosshair(g, width, height);
        
        const dots = chartArea.selectAll("circle").data(plotData).join("circle")
            .attr("cx", d => x(d.x))
            .attr("cy", d => y(d.y))
            .attr("r", 5)
            .attr("fill", d => color(d.dist))
            .attr("opacity", 0.6)
            .attr("stroke", "white")
            .attr("stroke-width", 1)
            .style("cursor", "pointer")
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
            .on("mouseout", () => setTooltip(null))
            .on("click", (e, d) => onSelect?.(d.dist));

        const zoom = d3.zoom()
            .scaleExtent([0.5, 20])
            .extent([[0, 0], [width, height]])
            .on("zoom", (event) => {
                const transform = event.transform;
                const newX = transform.rescaleX(x);
                const newY = transform.rescaleY(y);
                currentX = newX;
                currentY = newY;

                gX.call(xAxis.scale(newX));
                gY.call(yAxis.scale(newY));
                styleAxes();

                dots.attr("cx", d => newX(d.x))
                    .attr("cy", d => newY(d.y));
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
                crosshairParts.xLabel.attr("x", mx).text(`${Math.max(0, currentX.invert(mx)).toFixed(1)} 坪`);
                crosshairParts.yLabel.attr("y", my - 8).text(`${Math.max(0, currentY.invert(my)).toFixed(1)} 萬/坪`);
            })
            .on("mouseleave.crosshair", () => crosshairParts.crosshair.style("display", "none"));

        g.append("text")
            .attr("x", width/2)
            .attr("y", height + 58)
            .attr("text-anchor", "middle")
            .text("房屋淨坪數 (坪)")
            .style("font-size", "14px")
            .style("fill", "#334155")
            .style("font-weight", "950");

        appendVerticalYAxisLabel(g, "單價 (萬/坪)", height);
    }, [data, onSelect, hiddenDists, chartHeight, plotDataRaw, dists, showCrosshair]);

    return <div className="w-full relative">
        {tooltip && (
            <div 
                className="fixed z-[1000] pointer-events-none bg-white/98 backdrop-blur-md p-5 border border-slate-200 shadow-2xl rounded-2xl text-sm min-w-[200px]"
                style={{ left: tooltip.x + 15, top: tooltip.y - 15 }}
            >
                <p className="font-black text-slate-950 mb-3 border-b pb-2 border-slate-100">{tooltip.content.name || '未命名建案'}</p>
                <div className="space-y-2">
                    <div className="flex justify-between gap-4">
                        <span className="font-bold text-slate-500">行政區:</span>
                        <span className="font-black text-slate-800">{tooltip.content.dist}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                        <span className="font-bold text-slate-500">單價:</span>
                        <span className="font-black text-blue-600">{tooltip.content.y} 萬/坪</span>
                    </div>
                    <div className="flex justify-between gap-4">
                        <span className="font-bold text-slate-500">坪數:</span>
                        <span className="font-black text-emerald-600">{tooltip.content.x} 坪</span>
                    </div>
                </div>
            </div>
        )}
        <div className="flex justify-end px-8 mb-4 export-exclude items-center gap-6">
            <button 
                onClick={handleResetZoom}
                className="text-[10px] font-black bg-slate-100 text-slate-500 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-200 hover:text-slate-800 transition-all uppercase tracking-widest"
            >
                重設縮放 (Reset Zoom)
            </button>
            <div className="flex items-center gap-4 bg-white/50 backdrop-blur px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">調整圖表高度</span>
                <input 
                    type="range" 
                    min="300" 
                    max="700" 
                    step="10"
                    value={chartHeight} 
                    onChange={(e) => setChartHeight(Number(e.target.value))}
                    className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <span className="text-[10px] font-bold text-slate-600 min-w-[40px]">{chartHeight}px</span>
            </div>
        </div>
        <div className="mb-4 flex justify-end px-8 export-exclude">
            <CrosshairToggle enabled={showCrosshair} onToggle={() => setShowCrosshair(prev => !prev)} />
        </div>
        <svg ref={svgRef} width="100%" height={chartHeight} className="bg-white" />
        <div className="mt-6 border-t border-slate-100 pt-6">
            <div className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 text-center">行政區圖例 (點擊隱藏):</div>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 px-4">
                {dists.map((d, i) => {
                    const isHidden = hiddenDists.includes(d);
                    const color = d3.scaleOrdinal<string>().domain(dists).range(d3.schemeTableau10)(d);
                    return (
                        <div 
                            key={d} 
                            className={`flex items-center gap-2 cursor-pointer transition-all ${isHidden ? 'opacity-20 grayscale' : 'hover:scale-105'}`}
                            onClick={() => setHiddenDists(prev => isHidden ? prev.filter(x => x !== d) : [...prev, d])}
                        >
                            <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: color }} />
                            <span className="text-[12px] font-black text-slate-700">{d}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    </div>;
};
