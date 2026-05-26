import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { HouseData, ParkingData } from '../../types';

// 調整邊距，增加底部空間供標題下移
const MARGIN = { top: 22, right: 28, bottom: 86, left: 86 };
const HEIGHT = 480;

interface HeatmapProps {
    data: HouseData[];
    displayMode: 'pct' | 'count';
}

export const Heatmap: React.FC<HeatmapProps> = ({ data, displayMode }) => {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!svgRef.current || data.length === 0) return;

        const width = svgRef.current.clientWidth - MARGIN.left - MARGIN.right;
        const height = HEIGHT - MARGIN.top - MARGIN.bottom;

        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove();

        const g = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

        const roomKeys = ['1房', '2房', '3房', '4房', '開放格局', '其他'];
        const dists = Array.from(new Set(data.map(d => d.dist))).sort();

        const heatmapData: any[] = [];
        dists.forEach(d => {
            const distData = data.filter(item => item.dist === d);
            const total = distData.length;
            if (total === 0) return;
            roomKeys.forEach(r => {
                const count = distData.filter(item => item.type === r).length;
                const pct = total > 0 ? count / total : 0;
                heatmapData.push({ dist: d, room: r, value: pct, count: count });
            });
        });

        const x = d3.scaleBand().range([0, width]).domain(roomKeys).padding(0.05);
        const y = d3.scaleBand().range([0, height]).domain(dists).padding(0.05);
        const color = d3.scaleSequential().interpolator(d3.interpolateBlues).domain([0, 0.6]);

        g.append("g")
            .attr("transform", `translate(0, ${height})`)
            .call(d3.axisBottom(x).tickPadding(8))
            .style("font-size", "13px")
            .style("font-weight", "800")
            .style("color", "#475569") 
            .select(".domain").remove();
            
        g.append("g")
            .call(d3.axisLeft(y).tickPadding(12))
            .style("font-size", "13px")
            .style("font-weight", "800")
            .style("color", "#475569")
            .select(".domain").remove();

        const cells = g.selectAll().data(heatmapData).enter().append("g");
        
        cells.append("rect")
            .attr("x", d => x(d.room)!)
            .attr("y", d => y(d.dist)!)
            .attr("width", x.bandwidth())
            .attr("height", y.bandwidth())
            .style("fill", d => color(d.value))
            .style("stroke", "white")
            .style("stroke-width", 2)
            .style("opacity", 0.85);

        cells.append("text")
            .attr("x", d => x(d.room)! + x.bandwidth()/2)
            .attr("y", d => y(d.dist)! + y.bandwidth()/2)
            .attr("dy", ".35em")
            .text(d => displayMode === 'count' ? d.count : `${Math.round(d.value * 100)}%`)
            .style("text-anchor", "middle")
            .style("fill", d => d.value > 0.4 ? "white" : "#0f172a")
            .style("font-size", "13px")
            .style("font-weight", "950");

    }, [data, displayMode]);

    return <svg ref={svgRef} width="100%" height={HEIGHT} className="bg-white rounded-lg" />;
};

interface BoxplotProps {
    data: ParkingData[];
    groupBy: 'type' | 'floor';
    xLabel: string;
}

export const Boxplot: React.FC<BoxplotProps> = ({ data, groupBy, xLabel }) => {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!svgRef.current || data.length === 0) return;
        const width = svgRef.current.clientWidth - MARGIN.left - MARGIN.right;
        const height = HEIGHT - MARGIN.top - MARGIN.bottom;

        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove();

        const g = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

        const grouped = d3.group(data.filter(d => d[groupBy] && d.price > 0), d => d[groupBy]);
        const stats = Array.from(grouped).map(([key, values]) => {
            const prices = values.map(d => d.price).sort(d3.ascending);
            const q1 = d3.quantile(prices, 0.25) || 0;
            const median = d3.quantile(prices, 0.5) || 0;
            const q3 = d3.quantile(prices, 0.75) || 0;
            const iqr = q3 - q1;
            const min = Math.max(d3.min(prices) || 0, q1 - 1.5 * iqr);
            const max = Math.min(d3.max(prices) || 0, q3 + 1.5 * iqr);
            return { key, min, max, q1, median, q3 };
        }).sort((a,b) => {
            if (groupBy !== 'floor') return b.median - a.median;
            const floorValue = (value: string) => {
                const basement = value.match(/^B(\d+)/i);
                if (basement) return parseInt(basement[1], 10);
                const above = value.match(/^(\d+)F/i);
                if (above) return -parseInt(above[1], 10);
                return 999;
            };
            return floorValue(a.key) - floorValue(b.key);
        });

        if (stats.length === 0) return;

        const x = d3.scaleBand().range([0, width]).domain(stats.map(d => d.key)).padding(0.4);
        const y = d3.scaleLinear().range([height, 0]).domain([0, d3.max(stats, d => d.max)! * 1.1]);

        // 淺色輔助線
        g.selectAll("line.horizontalGrid").data(y.ticks(6)).enter()
            .append("line")
            .attr("x1", 0).attr("x2", width).attr("y1", d => y(d)).attr("y2", d => y(d))
            .attr("stroke", "#f8fafc").attr("stroke-width", 1.5);

        g.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).tickPadding(8))
            .style("font-size", "13px")
            .style("color", "#334155")
            .style("font-weight", "800");

        g.append("g")
            .call(d3.axisLeft(y).tickPadding(12))
            .style("font-size", "13px")
            .style("color", "#334155")
            .style("font-weight", "800");

        g.append("text")
            .attr("x", width / 2)
            .attr("y", height + 46)
            .attr("text-anchor", "middle")
            .text(xLabel)
            .style("font-size", "14px")
            .style("fill", "#334155")
            .style("font-weight", "950");

        g.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -height / 2)
            .attr("y", -64)
            .attr("text-anchor", "middle")
            .text("價格 (萬)")
            .style("font-size", "13px")
            .style("fill", "#334155")
            .style("font-weight", "950");

        const boxes = g.selectAll(".box").data(stats).enter().append("g");

        boxes.append("line")
            .attr("x1", d => x(d.key)! + x.bandwidth()/2)
            .attr("x2", d => x(d.key)! + x.bandwidth()/2)
            .attr("y1", d => y(d.min))
            .attr("y2", d => y(d.max))
            .attr("stroke", "#e2e8f0")
            .attr("stroke-width", 2);

        boxes.append("rect")
            .attr("x", d => x(d.key)!)
            .attr("y", d => y(d.q3))
            .attr("width", x.bandwidth())
            .attr("height", d => y(d.q1) - y(d.q3))
            .attr("stroke", "#8b5cf6")
            .attr("fill", "#ddd6fe")
            .attr("rx", 6)
            .attr("opacity", 0.75);

        boxes.append("line")
            .attr("x1", d => x(d.key)!)
            .attr("x2", d => x(d.key)! + x.bandwidth())
            .attr("y1", d => y(d.median))
            .attr("y2", d => y(d.median))
            .attr("stroke", "#6d28d9")
            .attr("stroke-width", 4);

    }, [data, groupBy, xLabel]);

    if (data.length === 0) {
        return <div className="w-full h-[280px]" />;
    }

    return <svg ref={svgRef} width="100%" height={HEIGHT} className="bg-white rounded-lg" />;
};
