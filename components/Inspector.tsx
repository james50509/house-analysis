import React, { useState } from 'react';
import { HouseData } from '../types';
import { Search } from 'lucide-react';

export const Inspector: React.FC<{ data: HouseData[] }> = ({ data }) => {
    const [term, setTerm] = useState('');

    const results = term ? data.filter(d =>
        (d.project && d.project.toLowerCase().includes(term.toLowerCase())) || 
        (d.address && d.address.toLowerCase().includes(term.toLowerCase()))
    ) : [];

    return (
        <div className="w-full">
            <h3 className="font-black text-slate-800 mb-2 flex items-center gap-2 text-sm uppercase tracking-wider">
                🕵️‍♀️ 算價引擎查閱器
            </h3>
            <p className="text-[10px] text-slate-400 mb-4 leading-relaxed font-bold">
                驗證建案之扣車位後單價算式。
            </p>
            <div className="relative mb-4 group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                    <Search size={14} />
                </div>
                <input
                    type="text"
                    value={term}
                    onChange={e => setTerm(e.target.value)}
                    placeholder="輸入建案或地址關鍵字..."
                    className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-300"
                />
            </div>
            
            {term && (
                <div className="max-h-60 overflow-y-auto border border-slate-100 rounded-2xl p-2 bg-slate-50/50 space-y-2 custom-scrollbar shadow-inner">
                    {results.length === 0 ? (
                        <div className="text-slate-300 text-[10px] p-6 text-center font-black italic">無符合建案</div>
                    ) : (
                        results.map(d => (
                            <div key={d.id} className="bg-white border border-slate-100 p-3 text-[10px] rounded-xl shadow-sm hover:border-blue-200 transition-all">
                                <div className="font-black text-slate-800 flex justify-between items-start gap-2 mb-1">
                                    <span className="truncate">{d.project}</span>
                                    <span className="shrink-0 font-bold bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded uppercase">{d.dist}</span>
                                </div>
                                <div className="text-[9px] text-slate-400 font-bold mb-2 truncate" title={d.address}>{d.address}</div>
                                <div className="text-slate-500 space-y-1.5">
                                    <div className="flex justify-between items-center border-b border-slate-50 pb-1">
                                        <span className="text-slate-400 font-bold uppercase tracking-tighter">總價算式</span>
                                        <span className="font-mono text-slate-600">
                                            {d.total + d.priceP} - {d.priceP} = <b className="text-slate-900 font-black">{d.total}萬</b>
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-slate-50 pb-1">
                                        <span className="text-slate-400 font-bold uppercase tracking-tighter">坪數算式</span>
                                        <span className="font-mono text-slate-600">
                                            {(d.area + d.areaP).toFixed(1)} - {d.areaP.toFixed(1)} = <b className="text-slate-900 font-black">{d.area.toFixed(1)}坪</b>
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center pt-1 mt-1">
                                        <span className="text-blue-400 font-black uppercase text-[9px] tracking-widest">最終淨單價</span>
                                        <span className="text-blue-600 font-black text-xs">
                                            {d.unit} <span className="text-[9px] font-bold text-slate-400">萬/坪</span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
