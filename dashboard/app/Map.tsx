'use client';

import { useEffect, useRef, useState } from 'react';
import Globe from 'react-globe.gl';

export interface Hotspot {
  lat: number;
  lng: number;
  trigger: string;
  label: string;
  description: string;
  severity: string;
  timestamp: string;
  source: string;
  wiki_url: string;
  year: number;
}

// Categorize the event to determine color
export function getEventCategory(h: Hotspot) {
  const t = h.trigger.toLowerCase();
  const s = h.source.toLowerCase();
  if (s.includes('usgs') || t.includes('earthquake') || t.includes('disaster') || t.includes('storm')) return 'DISASTER';
  if (t.includes('war') || t.includes('battle') || t.includes('missile') || t.includes('strike') || t.includes('cyber') || t.includes('terror') || h.severity === 'CRITICAL') return 'WAR';
  return 'NEWS';
}

function getEventColor(h: Hotspot) {
  const cat = getEventCategory(h);
  if (cat === 'WAR') return { hex: '#ef4444', rgba: 'rgba(239, 68, 68,', dark: 'rgba(69, 10, 10,' }; // red
  if (cat === 'DISASTER') return { hex: '#f59e0b', rgba: 'rgba(245, 158, 11,', dark: 'rgba(69, 26, 3,' }; // amber
  return { hex: '#22d3ee', rgba: 'rgba(34, 211, 238,', dark: 'rgba(8, 51, 68,' }; // cyan
}

export default function Map({ hotspots }: { hotspots: Hotspot[] }) {
  const globeRef = useRef<any>();
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null);

  // Focus on initial position but DO NOT auto-rotate
  useEffect(() => {
    if (globeRef.current) {
      globeRef.current.controls().autoRotate = false; // Block auto-rotation
      globeRef.current.controls().enableDamping = true;
      globeRef.current.pointOfView({ lat: 35.0, lng: 30.0, altitude: 2.5 }, 2000);
    }
  }, []);

  // When hotspots change, clear selection
  useEffect(() => {
    setSelectedHotspot(null);
  }, [hotspots]);

  // Handle clicking on the background to close the popup
  const handleGlobeClick = () => {
    setSelectedHotspot(null);
  };

  return (
    <div className="h-screen w-full absolute inset-0 z-10 cursor-move">
      <Globe
        ref={globeRef}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
        backgroundColor="rgba(0,0,0,0)" // Transparent to show the Next.js background underneath
        
        // --- ARC DATA (Missile arcs / tracking lines randomly scattered for aesthetic) ---
        arcsData={hotspots.filter(h => getEventCategory(h) === 'WAR').slice(0, 5).map(h => ({
          startLat: h.lat,
          startLng: h.lng,
          endLat: h.lat + (Math.random() - 0.5) * 40,
          endLng: h.lng + (Math.random() - 0.5) * 40,
          color: [`${getEventColor(h).rgba} 0.1)`, `${getEventColor(h).rgba} 0.8)`]
        }))}
        arcColor="color"
        arcDashLength={0.4}
        arcDashGap={0.2}
        arcDashAnimateTime={2000}
        arcAltitudeAutoScale={0.3}

        // --- RINGS DATA (Sonar pings on hotspots) ---
        ringsData={hotspots}
        ringLat="lat"
        ringLng="lng"
        ringColor={(d: any) => {
          const c = getEventColor(d);
          return [`${c.rgba} 0.9)`, `${c.rgba} 0.1)`];
        }}
        ringMaxRadius={(d: any) => d.severity === 'CRITICAL' ? 8 : 4}
        ringPropagationSpeed={2}
        ringRepeatPeriod={1500}

        // --- POINTS DATA (Physical pillars) ---
        pointsData={hotspots}
        pointLat="lat"
        pointLng="lng"
        pointColor={(d: any) => getEventColor(d).hex}
        pointAltitude={(d: any) => d.severity === 'CRITICAL' ? 0.2 : 0.1}
        pointRadius={0.5}
        onPointClick={(d: any) => {
          setSelectedHotspot(d);
          // Snap camera to the point
          if (globeRef.current) {
            globeRef.current.pointOfView({ lat: d.lat, lng: d.lng, altitude: 1.5 }, 1000);
          }
        }}

        onGlobeClick={handleGlobeClick}

        // --- HTML OVERLAYS (Popups) ---
        htmlElementsData={selectedHotspot ? [selectedHotspot] : []}
        htmlElement={(d: any) => {
          const el = document.createElement('div');
          
          const c = getEventColor(d);

          el.innerHTML = `
            <div style="
              width: 280px; 
              background: rgba(5, 5, 5, 0.85); 
              border: 1px solid rgba(55, 65, 81, 0.8); 
              padding: 16px; 
              border-radius: 4px; 
              box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px ${c.rgba} 0.3); 
              backdrop-filter: blur(8px);
              color: #d1d5db;
              transform: translate(-50%, -120%);
              pointer-events: auto;
              font-family: monospace;
            ">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid rgba(55, 65, 81, 0.5); padding-bottom: 8px; margin-bottom: 12px;">
                <p style="font-weight: 700; color: ${c.hex}; text-transform: uppercase; font-size: 14px; letter-spacing: 0.1em; margin: 0;">${d.label}</p>
                <span style="font-size: 10px; padding: 2px 6px; border-radius: 2px; font-weight: 700; letter-spacing: 0.1em; background: ${c.dark} 0.8); color: ${c.hex}; border: 1px solid ${c.hex};">
                  ${d.severity}
                </span>
              </div>
              <p style="font-size: 12px; margin-bottom: 12px; line-height: 1.5; color: #e5e7eb;">${d.description}</p>
              <p style="font-size: 10px; color: #6b7280; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700;">SOURCE: ${d.source}</p>
              
              ${d.wiki_url ? `
                <a href="${d.wiki_url}" target="_blank" rel="noreferrer" style="
                  display: block; 
                  width: 100%; 
                  text-align: center; 
                  background: rgba(8, 51, 68, 0.3); 
                  border: 1px solid rgba(22, 78, 99, 0.5); 
                  color: #22d3ee; 
                  font-size: 11px; 
                  font-weight: 700; 
                  padding: 8px 0; 
                  text-transform: uppercase; 
                  letter-spacing: 0.2em; 
                  text-decoration: none;
                  border-radius: 2px;
                "
                onmouseover="this.style.background='rgba(22, 78, 99, 0.6)'; this.style.color='#67e8f9';"
                onmouseout="this.style.background='rgba(8, 51, 68, 0.3)'; this.style.color='#22d3ee';"
                >
                  [+] ACCESS INTEL
                </a>
              ` : ''}
            </div>
          `;
          return el;
        }}
      />
    </div>
  );
}
