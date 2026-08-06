'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo } from 'react';
import type { Hotspot } from './Map';
import { BarChart, Bar, ResponsiveContainer, Tooltip, Cell } from 'recharts';

const DynamicMap = dynamic(() => import('./Map'), { 
  ssr: false,
  loading: () => <div className="h-screen w-full flex items-center justify-center bg-black text-cyan-500 font-mono text-xl animate-pulse tracking-widest">INITIALIZING SECURE UPLINK...</div>
});

const CURRENT_YEAR = new Date().getFullYear();

export default function Home() {
  const [liveScore, setLiveScore] = useState<number>(0.0);
  const [liveHotspots, setLiveHotspots] = useState<Hotspot[]>([]);
  const [historicalDB, setHistoricalDB] = useState<Hotspot[]>([]);
  
  // Smart Timeline State
  const timelineSteps = useMemo(() => {
    const sortedYears = Array.from(new Set(historicalDB.map(h => h.year))).sort((a, b) => a - b);
    return [...sortedYears, CURRENT_YEAR];
  }, [historicalDB]);
  
  const [timelineIndex, setTimelineIndex] = useState<number>(0);

  useEffect(() => {
    if (historicalDB.length > 0) {
      setTimelineIndex(timelineSteps.length - 1);
    }
  }, [historicalDB.length, timelineSteps.length]);

  const selectedYear = timelineSteps[timelineIndex] || CURRENT_YEAR;
  const isHistoryMode = timelineIndex < timelineSteps.length - 1;

  const formatYear = (y: number) => {
    if (y === CURRENT_YEAR && !isHistoryMode) return "LIVE";
    return y < 0 ? `${Math.abs(y)} BCE` : y.toString();
  };

  const activeHotspots = isHistoryMode ? historicalDB.filter(h => h.year === selectedYear) : liveHotspots;
  const activeScore = isHistoryMode ? (activeHotspots.length > 0 ? 0.95 : 0.0) : liveScore;

  // Analytics Data Gen
  const analyticsData = useMemo(() => {
    const data = [];
    if (isHistoryMode) {
      // 11 years total: target - 5 to target + 5
      for (let offset = -5; offset <= 5; offset++) {
        const y = selectedYear + offset;
        const count = historicalDB.filter(h => h.year === y).length;
        
        let label = '';
        if (offset === 0) {
          label = formatYear(selectedYear);
        } else if (offset > 0) {
          label = `+${offset}`;
        } else {
          label = `${offset}`;
        }
        
        data.push({ name: label, events: count, isTarget: offset === 0 });
      }
    } else {
      const critical = liveHotspots.filter(h => h.severity === 'CRITICAL').length;
      const high = liveHotspots.filter(h => h.severity === 'HIGH').length;
      data.push({ name: 'CRIT', events: critical, isTarget: true });
      data.push({ name: 'HIGH', events: high, isTarget: false });
    }
    return data;
  }, [historicalDB, selectedYear, isHistoryMode, liveHotspots]);

  // Fetch Live Data
  useEffect(() => {
    const fetchLive = async () => {
      try {
        const response = await fetch(`/api/v1/global-threat-index`);
        if (!response.ok) throw new Error("Failed to fetch live index");
        const data = await response.json();
        setLiveHotspots(data.active_hotspots);
        setLiveScore(data.global_anomaly_score);
      } catch (error) {
        console.error(error);
      }
    };
    fetchLive();
    const interval = setInterval(fetchLive, 30000); // 30s polling for live OSINT
    return () => clearInterval(interval);
  }, []);

  // Fetch Historical Data once
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(`/api/v1/historical-conflicts`);
        if (!response.ok) throw new Error("Failed to fetch history");
        const data = await response.json();
        setHistoricalDB(data);
      } catch (error) {
        console.error(error);
      }
    };
    fetchHistory();
  }, []);

  const getThemeColors = (score: number) => {
    if (score < 0.4) return { text: 'text-cyan-400', border: 'border-cyan-400', glow: 'shadow-[0_0_15px_rgba(34,211,238,0.3)]', bar: 'bg-cyan-400' };
    if (score < 0.7) return { text: 'text-amber-400', border: 'border-amber-400', glow: 'shadow-[0_0_15px_rgba(251,191,36,0.3)]', bar: 'bg-amber-400' };
    return { text: 'text-red-500', border: 'border-red-500', glow: 'shadow-[0_0_20px_rgba(239,68,68,0.5)]', bar: 'bg-red-500' };
  };

  const theme = getThemeColors(activeScore);

  return (
    <main className="relative h-screen w-full bg-black overflow-hidden font-[family-name:var(--font-rajdhani)] selection:bg-cyan-900 text-gray-300">
      {/* Shared 3D Environment (Mobile + Desktop) */}
      <DynamicMap hotspots={activeHotspots} />
      <div className="vignette pointer-events-none" />
      <div className="scanlines pointer-events-none" />

      {/* MOBILE UI (Stacked, Touch-friendly) */}
      <div className="md:hidden absolute inset-0 z-[100] flex flex-col pointer-events-none">
        
        {/* Mobile Header (Threat Index) */}
        <div className="bg-gradient-to-b from-black/90 to-transparent p-4 pt-6 flex justify-between items-start pointer-events-auto">
          <div>
            <h1 className="text-sm text-gray-100 mb-1 uppercase tracking-[0.2em] flex items-center gap-2 font-[family-name:var(--font-space-grotesk)] font-bold">
              <span className={`w-2 h-2 rounded-full ${isHistoryMode ? 'bg-purple-500 shadow-[0_0_8px_#a855f7]' : theme.bar + ' shadow-[0_0_8px_#22d3ee] animate-pulse'}`}></span>
              STRATCOM
            </h1>
            <div className={`text-4xl font-bold tracking-tighter font-[family-name:var(--font-space-grotesk)] ${isHistoryMode ? 'text-purple-400 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]' : theme.text + ' drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]'}`}>
              {isHistoryMode ? 'HIST' : activeScore.toFixed(2)}
            </div>
          </div>
          <div className="text-right">
             <span className={`text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-1 bg-gray-900/80 rounded border ${theme.border} ${isHistoryMode ? 'text-purple-400' : theme.text}`}>
               {isHistoryMode ? 'ARCHIVE' : 'LIVE OSINT'}
             </span>
          </div>
        </div>

        {/* Mobile Threat Logs (Bottom aligned carousel) */}
        <div className="mt-auto bg-gradient-to-t from-black via-black/80 to-transparent p-4 pb-8 pointer-events-auto">
           <h2 className="text-cyan-400 text-xs font-bold uppercase tracking-[0.2em] mb-3 flex items-center gap-2 drop-shadow-[0_0_5px_rgba(34,211,238,0.8)] font-[family-name:var(--font-space-grotesk)]">
            Threat Logs <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory custom-scrollbar">
            {activeHotspots.length === 0 ? (
               <div className="min-w-[80vw] snap-center text-center p-6 border border-gray-800/50 bg-gray-900/40 backdrop-blur-md text-gray-500 text-xs tracking-widest font-medium rounded">
                 NO ANOMALIES DETECTED
               </div>
            ) : (
               activeHotspots.slice(0, 10).map((hotspot, idx) => (
                 <div key={idx} className="min-w-[85vw] snap-center bg-gray-900/80 backdrop-blur-md border border-gray-700/50 p-4 border-l-4 rounded shadow-lg" style={{ borderLeftColor: hotspot.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b' }}>
                   <div className="flex justify-between items-center mb-2">
                     <span className="text-[9px] text-gray-300 font-bold uppercase tracking-[0.2em] bg-gray-800/80 px-1.5 py-0.5 rounded-sm">{hotspot.source}</span>
                     <span className="text-[8px] text-gray-500 tracking-wider font-mono">{hotspot.timestamp.split('T')[0]}</span>
                   </div>
                   <h3 className="text-sm text-gray-100 font-bold uppercase mb-1 leading-tight font-[family-name:var(--font-space-grotesk)] truncate">{hotspot.label}</h3>
                   <p className="text-[10px] text-gray-400 leading-snug line-clamp-2">{hotspot.description}</p>
                 </div>
               ))
            )}
          </div>
        </div>
      </div>

      <div className="hidden md:block">

        {/* Main HUD */}
        <div className="absolute top-10 left-6 z-[100] min-w-[320px] max-w-[340px] perspective-[1000px] pointer-events-none">
          <div className={`relative bg-gradient-to-br from-gray-900/40 to-black/80 backdrop-blur-xl border border-gray-700/30 p-6 ${theme.glow} transition-all duration-700 overflow-hidden group hover:bg-gray-900/60 pointer-events-auto`}>
            
            {/* HUD Laser Scan */}
            <div className="hud-laser"></div>

            {/* Corner Bracket Accents */}
            <div className={`absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 ${theme.border} transition-colors duration-700 opacity-70 group-hover:opacity-100`}></div>
            <div className={`absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 ${theme.border} transition-colors duration-700 opacity-70 group-hover:opacity-100`}></div>
            <div className={`absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 ${theme.border} transition-colors duration-700 opacity-70 group-hover:opacity-100`}></div>
            <div className={`absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 ${theme.border} transition-colors duration-700 opacity-70 group-hover:opacity-100`}></div>

            <h1 className="text-xl text-gray-100 mb-6 uppercase tracking-[0.2em] flex items-center gap-3 font-semibold font-[family-name:var(--font-space-grotesk)]">
              <span className={`w-3 h-3 rounded-full ${isHistoryMode ? 'bg-purple-500 shadow-[0_0_10px_#a855f7]' : theme.bar + ' shadow-[0_0_10px_#22d3ee] animate-pulse'}`}></span>
              STRATCOM {isHistoryMode ? 'ARCHIVE' : 'LIVE'}
            </h1>
            
            <div className="space-y-6">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-[0.3em] mb-1 font-medium">Global Threat Index</p>
                <div className={`text-6xl font-bold tracking-tighter font-[family-name:var(--font-space-grotesk)] ${isHistoryMode ? 'text-purple-400 drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]' : theme.text + ' drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]'} transition-colors duration-700`}>
                  {isHistoryMode ? 'HIST' : activeScore.toFixed(3)}
                </div>
              </div>

              {/* Recharts Analytics Panel */}
              <div className="h-32 w-full mt-4 bg-black/50 border border-gray-800/50 p-2 relative rounded-sm shadow-inner group-hover:border-gray-700 transition-colors">
                 <p className="absolute top-2 left-3 text-[9px] text-gray-500 tracking-[0.2em] z-10 font-medium">
                   {isHistoryMode ? '10-YEAR CONFLICT RADAR' : 'LIVE SEVERITY DISTRIBUTION'}
                 </p>
                 <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData}>
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'rgba(5, 5, 5, 0.9)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '11px', borderRadius: '4px' }}
                      itemStyle={{ color: '#fff', fontWeight: 600 }}
                      cursor={{fill: 'rgba(255,255,255,0.05)'}}
                    />
                    <Bar dataKey="events" radius={[4, 4, 0, 0]}>
                      {analyticsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.isTarget ? (isHistoryMode ? '#a855f7' : theme.bar) : 'rgba(75,85,99,0.4)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Threat Classification Legend */}
              <div className="pt-4 border-t border-gray-800/80 mt-4">
                <p className="text-[10px] text-gray-500 tracking-[0.2em] mb-3 font-medium uppercase">Classification Legend</p>
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-3"><span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]"></span><span className="text-[10px] text-gray-300 font-bold tracking-widest uppercase">MILITARY / KINETIC</span></div>
                  <div className="flex items-center gap-3"><span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]"></span><span className="text-[10px] text-gray-300 font-bold tracking-widest uppercase">NATURAL DISASTER</span></div>
                  <div className="flex items-center gap-3"><span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></span><span className="text-[10px] text-gray-300 font-bold tracking-widest uppercase">GEOPOLITICAL NEWS</span></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-800 mt-6">
                <div>
                  <span className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1 font-medium">API Uplink</span>
                  <span className={`text-xs font-bold uppercase tracking-[0.2em] ${isHistoryMode ? 'text-purple-400' : 'text-cyan-400'}`}>
                    {isHistoryMode ? 'ARCHIVE DB' : 'LIVE OSINT'}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1 font-medium">Target Year</span>
                  <span className="text-xs text-gray-100 font-bold uppercase tracking-[0.2em]">
                    {formatYear(selectedYear)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Active Threat Logs Panel */}
        <div className="absolute top-10 right-6 bottom-36 w-[320px] max-w-[25vw] z-[100] flex flex-col pointer-events-none">
          <h2 className="text-cyan-400 text-sm font-bold uppercase tracking-[0.3em] mb-4 flex items-center justify-end gap-3 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)] font-[family-name:var(--font-space-grotesk)]">
            Threat Logs <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
          </h2>
          <div className="flex-1 overflow-y-auto space-y-4 pointer-events-auto pr-3 custom-scrollbar mask-image-b">
            {activeHotspots.length === 0 ? (
              <div className="text-center p-8 border border-gray-800/50 bg-gray-900/20 backdrop-blur-md text-gray-500 text-sm tracking-widest font-medium">
                NO ANOMALIES DETECTED
              </div>
            ) : (
              activeHotspots.map((hotspot, idx) => (
                <div 
                  key={idx} 
                  className="animate-fade-in-up bg-gradient-to-br from-gray-900/70 to-black/90 backdrop-blur-lg border border-gray-700/50 p-4 border-l-4 hover:bg-gray-800/80 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl cursor-crosshair group rounded-r-md" 
                  style={{ borderLeftColor: hotspot.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b', animationDelay: `${idx * 50}ms` }}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] text-gray-300 font-bold uppercase tracking-[0.2em] bg-gray-800/80 px-2 py-0.5 rounded-sm">{hotspot.source}</span>
                    <span className="text-[9px] text-gray-500 tracking-wider font-mono">{hotspot.timestamp.split('T')[0]}</span>
                  </div>
                  <h3 className="text-md text-gray-100 font-bold uppercase mb-2 leading-tight font-[family-name:var(--font-space-grotesk)] group-hover:text-white transition-colors">{hotspot.label}</h3>
                  <p className="text-xs text-gray-400 leading-relaxed mb-3 font-medium">{hotspot.description}</p>
                  {hotspot.wiki_url && (
                    <a 
                      href={hotspot.wiki_url} 
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block bg-cyan-950/30 border border-cyan-900/50 px-3 py-1 text-[10px] text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/50 hover:border-cyan-400 transition-all duration-300 uppercase tracking-widest font-bold rounded-sm"
                    >
                      [+] Access Intel
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Smart Timeline Scrubber */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-11/12 max-w-4xl z-[100] bg-gray-900/60 backdrop-blur-xl border border-gray-700/50 px-8 py-5 rounded-lg shadow-2xl flex flex-col gap-4 pointer-events-auto">
          <div className="flex justify-between text-xs text-gray-400 font-bold tracking-[0.3em] font-[family-name:var(--font-space-grotesk)]">
            <span>{timelineSteps.length > 1 ? formatYear(timelineSteps[0]) : 'ARCHIVE'}</span>
            <span className={`text-xl drop-shadow-[0_0_10px_rgba(34,211,238,0.8)] ${isHistoryMode ? 'text-purple-400' : 'text-cyan-400'}`}>
              {formatYear(selectedYear)}
            </span>
            <span>LIVE</span>
          </div>
          
          <div className="relative w-full group">
            <input 
              type="range" 
              min="0" 
              max={Math.max(timelineSteps.length - 1, 0)} 
              value={timelineIndex}
              onChange={(e) => setTimelineIndex(parseInt(e.target.value))}
              className="w-full accent-cyan-400 cursor-crosshair h-1.5 bg-gray-800/80 rounded-full appearance-none outline-none group-hover:bg-gray-700 transition-colors"
            />
          </div>
          
          {isHistoryMode && (
            <button 
              onClick={() => setTimelineIndex(timelineSteps.length - 1)}
              className="absolute -top-10 left-1/2 -translate-x-1/2 bg-red-950/80 text-red-200 text-[10px] px-4 py-1.5 uppercase tracking-[0.3em] font-bold border border-red-500/50 hover:bg-red-900 transition-colors rounded-sm shadow-[0_0_15px_rgba(239,68,68,0.3)] backdrop-blur-md"
            >
              Return to Live OSINT
            </button>
          )}
        </div>
      </div>

      <style jsx global>{`
        /* Scrubber Thumb overrides for a more premium look */
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #22d3ee;
          box-shadow: 0 0 10px #22d3ee, 0 0 20px #22d3ee;
          cursor: pointer;
          transition: transform 0.2s;
        }
        input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.3);
        }
      `}</style>
    </main>
  );
}
