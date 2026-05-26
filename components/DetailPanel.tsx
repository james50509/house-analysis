import React from 'react';
import { HouseData } from '../types';

const MAX_COMPARE_PROJECTS = 10;

interface DetailPanelProps {
    data: HouseData[];
    projectData: HouseData[];
    excludedProjects: string[];
    onExcludedProjectsChange: (projects: string[]) => void;
    compareProjects: string[];
    onCompareProjectsChange: (projects: string[]) => void;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
    data,
    projectData,
    excludedProjects,
    onExcludedProjectsChange,
    compareProjects,
    onCompareProjectsChange
}) => {
    const [projectSearch, setProjectSearch] = React.useState('');
    const items = data.slice(0, 100);
    const projectStats = React.useMemo(() => {
        const stats = new Map<string, { count: number; dist: string; avgUnit: number; units: number[] }>();
        projectData.forEach(item => {
            const key = item.project || '(未命名)';
            const current = stats.get(key) || { count: 0, dist: item.dist, avgUnit: 0, units: [] };
            current.count += 1;
            current.units.push(item.unit);
            current.avgUnit = Math.round((current.units.reduce((sum, unit) => sum + unit, 0) / current.units.length) * 10) / 10;
            stats.set(key, current);
        });
        return Array.from(stats.entries())
            .map(([project, stat]) => ({ project, ...stat }))
            .sort((a, b) => b.count - a.count || a.project.localeCompare(b.project, 'zh-Hant'));
    }, [projectData]);

    const visibleProjectStats = projectStats.filter(item =>
        item.project.toLowerCase().includes(projectSearch.trim().toLowerCase())
    );
    const selectedProjectCount = projectStats.filter(item => !excludedProjects.includes(item.project)).length;
    const toggleProject = (project: string) => {
        onExcludedProjectsChange(
            excludedProjects.includes(project)
                ? excludedProjects.filter(item => item !== project)
                : [...excludedProjects, project]
        );
    };
    const toggleCompareProject = (project: string) => {
        if (compareProjects.includes(project)) {
            onCompareProjectsChange(compareProjects.filter(item => item !== project));
            return;
        }
        if (compareProjects.length >= MAX_COMPARE_PROJECTS) return;
        onCompareProjectsChange([...compareProjects, project]);
    };

    return (
        <div className="flex flex-col">
            <h3 className="font-bold text-slate-800 mb-4 flex justify-between">
                <span>資料明細</span>
                <span className="bg-blue-50 text-blue-600 text-xs px-2 py-1 rounded-full">共 {data.length} 筆</span>
            </h3>

            <div className="mb-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                        <div className="text-xs font-black text-slate-800">社區篩選</div>
                        <div className="mt-0.5 text-[10px] font-bold text-slate-400">
                            已納入 {selectedProjectCount} / {projectStats.length} 個建案重新分析
                        </div>
                        <div className="mt-0.5 text-[10px] font-bold text-blue-500">
                            比較模式已選 {compareProjects.length} / 10 個
                        </div>
                    </div>
                    <div className="flex gap-1.5">
                        <button
                            type="button"
                            onClick={() => onExcludedProjectsChange([])}
                            className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-600 hover:bg-blue-100"
                        >
                            全選
                        </button>
                        <button
                            type="button"
                            onClick={() => onExcludedProjectsChange(projectStats.map(item => item.project))}
                            className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-500 border border-slate-200 hover:bg-slate-100"
                        >
                            清空
                        </button>
                    </div>
                </div>
                <input
                    value={projectSearch}
                    onChange={(event) => setProjectSearch(event.target.value)}
                    placeholder="搜尋社區/建案..."
                    className="mb-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-500/10"
                />
                <div className="space-y-1">
                    {visibleProjectStats.map(item => {
                        const checked = !excludedProjects.includes(item.project);
                        return (
                            <div
                                key={item.project}
                                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 transition-all ${
                                    checked ? 'bg-white border-blue-100' : 'bg-slate-100/80 border-slate-100 opacity-55'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleProject(item.project)}
                                    className="h-4 w-4 accent-blue-600"
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs font-black text-slate-800" title={item.project}>{item.project}</div>
                                    <div className="text-[10px] font-bold text-slate-400">{item.dist}｜均價 {item.avgUnit} 萬/坪</div>
                                </div>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">{item.count}</span>
                                <button
                                    type="button"
                                    disabled={!compareProjects.includes(item.project) && compareProjects.length >= MAX_COMPARE_PROJECTS}
                                    onClick={(event) => {
                                        event.preventDefault();
                                        toggleCompareProject(item.project);
                                    }}
                                    className={`rounded-full px-2.5 py-1 text-[10px] font-black transition-colors ${
                                        compareProjects.includes(item.project)
                                            ? 'bg-amber-400 text-white'
                                            : 'bg-white text-slate-500 border border-slate-200 hover:bg-amber-50 hover:text-amber-600 disabled:opacity-35 disabled:hover:bg-white disabled:hover:text-slate-500'
                                    }`}
                                >
                                    比較
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
            
            <div className="space-y-3">
                {items.length === 0 ? (
                    <div className="text-center text-slate-400 py-10 border-2 border-dashed rounded-lg">
                        無資料
                    </div>
                ) : (
                    items.map((d, i) => (
                        <div key={`${d.id}-${i}`} className="bg-slate-50 border border-slate-100 rounded-lg p-3 hover:shadow-md transition-shadow group">
                            <div className="flex justify-between items-start mb-1">
                                <div className="font-bold text-slate-700 text-sm line-clamp-1">{d.project}</div>
                                <div className="text-xs bg-white border border-slate-200 px-2 py-0.5 rounded-full text-slate-500 whitespace-nowrap">{d.month}</div>
                            </div>
                            <div className="text-[10px] text-slate-400 font-bold mb-2 truncate" title={d.address}>{d.address}</div>
                            <div className="space-y-1">
                                <div className="flex justify-between items-baseline">
                                    <span className="text-xs text-slate-400">總價</span>
                                    <span className="font-mono font-bold text-slate-800">{d.total}萬</span>
                                </div>
                                <div className="flex justify-between items-baseline">
                                    <span className="text-xs text-slate-400">單價</span>
                                    <span className="font-bold text-amber-600 text-sm">{d.unit} 萬/坪</span>
                                </div>
                            </div>
                            <div className="mt-2 flex gap-1 flex-wrap">
                                <span className="text-[10px] px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-500">{d.area}坪</span>
                                <span className="text-[10px] px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-500">{d.floor ? (d.floor > 0 ? d.floor + 'F' : 'B' + Math.abs(d.floor)) : '-'}</span>
                                <span className="text-[10px] px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-500">{d.type}</span>
                            </div>
                        </div>
                    ))
                )}
                {data.length > 100 && (
                    <div className="text-center text-xs text-slate-400 py-2">...還有 {data.length - 100} 筆</div>
                )}
            </div>
        </div>
    );
};
