'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Map, 
  useMap, 
  Marker,
  InfoWindow
} from '@vis.gl/react-google-maps';
import { 
  LocateFixed, 
  RefreshCw, 
  ThumbsUp,
  ShieldAlert,
  Newspaper,
  History,
  ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUser, useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit, doc, updateDoc, increment } from 'firebase/firestore';
import { RoadConditionReport, WithId } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ReportHazardDialog } from './report-hazard-dialog';
import Image from 'next/image';
import { CONFIG } from '@/lib/config';
import {
  pressReportsAt, positionNote, reportTime, PRESS_CATEGORIES, PRESS_STATUS_LABELS, PRESS_SOURCES,
  SOURCE_TIER_LABELS, type PressReportView, type LatLng,
} from '@/lib/road-reports';

const HAZARD_TYPES = {
  pothole: { label: "Nid-de-poule", color: "#f59e0b", icon: "🕳️" },
  blockage: { label: "Route Barrée", color: "#ef4444", icon: "🚧" },
  police: { label: "Police", color: "#3b82f6", icon: "🚓" },
  damaged_road: { label: "Route Dégradée", color: "#78350f", icon: "⚠️" },
};

const toLatLng = ([lat, lng]: LatLng) => ({ lat, lng });

/** Tronçon signalé par la presse ou le ministère, dessiné sur la rue OSM. */
function PressPolyline({ path, color, faded, dashed, onClick }: {
  path: LatLng[]; color: string; faded: boolean; dashed: boolean; onClick: () => void;
}) {
  const map = useMap();
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    if (!map) return;
    const opacity = faded ? 0.3 : 0.85;
    const line = new google.maps.Polyline({
      map,
      path: path.map(toLatLng),
      strokeColor: faded ? '#94a3b8' : color,
      strokeWeight: faded ? 4 : 6,
      // Tronçon non précisé : pointillés plutôt qu'un trait plein qui laisserait croire à une mesure exacte
      strokeOpacity: dashed ? 0 : opacity,
      icons: dashed ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: opacity, scale: 3 }, offset: '0', repeat: '12px' }] : undefined,
      zIndex: faded ? 1 : 2,
    });
    const listener = line.addListener('click', () => clickRef.current());
    return () => { listener.remove(); line.setMap(null); };
  }, [map, path, color, faded, dashed]);

  return null;
}

function formatReportDate(s: string | null) {
  const t = reportTime(s);
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Africa/Kinshasa' })} · ${formatDistanceToNow(d, { addSuffix: true, locale: fr })}`;
}

export default function HazardMap() {
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [selectedReport, setSelectedReport] = useState<WithId<RoadConditionReport> | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showPress, setShowPress] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedPress, setSelectedPress] = useState<PressReportView | null>(null);

  // Recalculé à chaque ouverture : un signalement expire tout seul (date de fin ou durée par type)
  const pressReports = useMemo(() => pressReportsAt(Date.now()), []);
  const activePressCount = pressReports.filter(r => r.active).length;
  const visiblePress = useMemo(
    () => (showPress ? pressReports.filter(r => r.active || showHistory) : [])
      // les plus récents par-dessus
      .sort((a, b) => Number(a.active) - Number(b.active) || reportTime(a.observedAt) - reportTime(b.observedAt)),
    [pressReports, showPress, showHistory],
  );
  const selectPress = (r: PressReportView) => { setSelectedReport(null); setSelectedPress(r); };

  const { user, firestore } = useFirebase();
  const { toast } = useToast();

  // GPS Tracking
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.warn("GPS Access Denied")
      );
    }
  }, []);

  const reportsQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'road_condition_reports'), orderBy('createdAt', 'desc'), limit(100));
  }, [firestore]);

  const { data: reports, isLoading } = useCollection<RoadConditionReport>(reportsQuery);

  const handleConfirm = async (report: WithId<RoadConditionReport>) => {
    if (!user) return;
    try {
      const reportRef = doc(firestore, 'road_condition_reports', report.id);
      await updateDoc(reportRef, { votes: increment(1) });
      toast({ title: "Merci !", description: "Votre confirmation aide la communauté." });
    } catch (e) {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 relative overflow-hidden rounded-[2rem] border shadow-2xl">
      {/* Top Controls Overlay */}
      <div className="absolute top-4 left-0 right-0 z-10 pointer-events-none p-4 flex justify-between items-start">
          <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="pointer-events-auto">
              <Card className="bg-white/90 backdrop-blur-xl border-none shadow-2xl rounded-2xl overflow-hidden p-2 flex items-center gap-3">
                  <div className="bg-destructive p-2 rounded-xl">
                      <ShieldAlert className="text-white h-5 w-5" />
                  </div>
                  <div>
                      <h2 className="text-sm font-black tracking-tight">Carte des Dangers</h2>
                      <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Kinshasa en direct</p>
                  </div>
                  <div className="h-8 w-px bg-slate-100 mx-1" />
                  <ReportHazardDialog location={location} />
              </Card>
              <div className="mt-2 flex flex-wrap gap-2">
                  <button
                      type="button"
                      aria-pressed={showPress}
                      onClick={() => { setShowPress(v => !v); setSelectedPress(null); }}
                      className={cn(
                          "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide shadow-lg backdrop-blur-xl transition",
                          showPress ? "bg-slate-900 text-white" : "bg-white/90 text-slate-500"
                      )}
                  >
                      <Newspaper className="h-3.5 w-3.5" />
                      Presse & ministère · {activePressCount}
                  </button>
                  {showPress && (
                      <button
                          type="button"
                          aria-pressed={showHistory}
                          onClick={() => { setShowHistory(v => !v); setSelectedPress(null); }}
                          className={cn(
                              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide shadow-lg backdrop-blur-xl transition",
                              showHistory ? "bg-slate-600 text-white" : "bg-white/90 text-slate-500"
                          )}
                      >
                          <History className="h-3.5 w-3.5" />
                          Historique 2026
                      </button>
                  )}
              </div>
          </motion.div>

          <div className="flex flex-col gap-2 pointer-events-auto">
              <Button 
                  variant="secondary" 
                  size="icon" 
                  className="rounded-xl shadow-xl bg-white/90 backdrop-blur-xl h-12 w-12"
                  onClick={() => setLocation(prev => prev ? {...prev} : CONFIG.KINSHASA_CENTER)}
              >
                  <LocateFixed className="h-5 w-5 text-primary" />
              </Button>
              <Button 
                  variant="secondary" 
                  size="icon" 
                  className="rounded-xl shadow-xl bg-white/90 backdrop-blur-xl h-12 w-12"
                  onClick={() => setIsRefreshing(true)}
              >
                  <RefreshCw className={cn("h-5 w-5 text-slate-500", isRefreshing && "animate-spin")} />
              </Button>
          </div>
      </div>

      {/* Map View */}
      <div className="flex-1">
        <Map
            defaultCenter={CONFIG.KINSHASA_CENTER}
            center={location}
            defaultZoom={13}
            gestureHandling={'greedy'}
            disableDefaultUI={true}
            className="w-full h-full"
        >
          {location && (
              <Marker 
                  position={location}
                  icon={{
                      path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z",
                      fillColor: '#248eeb',
                      fillOpacity: 1,
                      strokeColor: 'white',
                      strokeWeight: 2,
                      scale: 1.5
                  } as any}
              />
          )}

          {visiblePress.flatMap(r => {
              const cat = PRESS_CATEGORIES[r.category];
              const dashed = r.geo!.quality !== 'segment' && r.geo!.quality !== 'near_landmark';
              return (r.geo!.lines ?? []).map((path, i) => (
                  <PressPolyline key={`${r.id}-l${i}`} path={path} color={cat.color} faded={!r.active} dashed={dashed} onClick={() => selectPress(r)} />
              ));
          })}

          {visiblePress.map(r => {
              const cat = PRESS_CATEGORIES[r.category];
              const approx = r.geo!.quality.endsWith('_center');
              return (
                  <Marker
                      key={`press-${r.id}`}
                      position={toLatLng(r.geo!.point)}
                      onClick={() => selectPress(r)}
                      zIndex={r.active ? 20 : 5}
                      opacity={r.active ? 1 : 0.5}
                      icon={{
                          path: 0, // google.maps.SymbolPath.CIRCLE
                          scale: approx ? 11 : 13,
                          fillColor: '#ffffff',
                          fillOpacity: 1,
                          strokeColor: r.active ? cat.color : '#94a3b8',
                          strokeWeight: approx ? 2 : 3,
                      } as any}
                      label={{ text: cat.icon, fontSize: approx ? '11px' : '13px' }}
                      title={`${cat.label} · ${r.road ?? r.area ?? ''}`}
                  />
              );
          })}

          {reports?.map((report) => (
              <Marker
                  key={report.id}
                  position={report.coords}
                  onClick={() => { setSelectedPress(null); setSelectedReport(report); }}
                  label={{
                      text: HAZARD_TYPES[report.type].icon,
                      fontSize: "20px"
                  }}
              />
          ))}

          {selectedReport && (
              <InfoWindow 
                  position={selectedReport.coords}
                  onCloseClick={() => setSelectedReport(null)}
              >
                  <div className="w-64 p-1 space-y-3">
                      {selectedReport.imageUrl && (
                          <div className="relative aspect-video rounded-lg overflow-hidden border">
                              <Image src={selectedReport.imageUrl} alt="Report" fill className="object-cover" />
                          </div>
                      )}
                      <div>
                          <div className="flex justify-between items-center mb-1">
                              <Badge className="text-[10px] font-black uppercase" style={{ backgroundColor: HAZARD_TYPES[selectedReport.type].color }}>
                                  {HAZARD_TYPES[selectedReport.type].label}
                              </Badge>
                              <span className="text-[10px] font-bold text-slate-400">
                                  {selectedReport.createdAt?.toDate ? formatDistanceToNow(selectedReport.createdAt.toDate(), { addSuffix: true, locale: fr }) : '...'}
                              </span>
                          </div>
                          <p className="text-xs font-bold text-slate-700 leading-relaxed">{selectedReport.description}</p>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                          <div className="flex items-center gap-1 text-[10px] font-black text-primary uppercase">
                              <ThumbsUp className="h-3 w-3" />
                              {selectedReport.votes} confirmations
                          </div>
                          <Button size="sm" variant="ghost" className="h-7 text-[10px] font-black uppercase text-emerald-600 hover:bg-emerald-50" onClick={() => handleConfirm(selectedReport)}>
                              Confirmer
                          </Button>
                      </div>
                  </div>
              </InfoWindow>
          )}

          {selectedPress && (() => {
              const r = selectedPress;
              const cat = PRESS_CATEGORIES[r.category];
              const note = positionNote(r.geo!.quality, r.geo!.area);
              const where = [r.geo!.osmNames?.join(', ') || r.road, r.segment].filter(Boolean).join(' · ');
              return (
                  <InfoWindow position={toLatLng(r.geo!.point)} onCloseClick={() => setSelectedPress(null)}>
                      <div className="w-72 p-1 space-y-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                              <Badge className="text-[10px] font-black uppercase" style={{ backgroundColor: r.active ? cat.color : '#94a3b8' }}>
                                  {cat.icon} {cat.label}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] font-bold">
                                  {PRESS_STATUS_LABELS[r.status] ?? r.status}
                              </Badge>
                              {!r.active && (
                                  <Badge variant="secondary" className="text-[10px] font-bold">
                                      {r.supersededBy ? 'Remplacé par un signalement plus récent' : 'Terminé'}
                                  </Badge>
                              )}
                          </div>
                          {where && <p className="text-[11px] font-black text-slate-900 leading-snug">{where}</p>}
                          <p className="text-xs font-semibold text-slate-700 leading-relaxed">{r.title}</p>
                          {r.detours.length > 0 && (
                              <p className="text-[11px] text-slate-600 leading-snug">
                                  <span className="font-black text-emerald-700">Déviations : </span>{r.detours.join(', ')}
                              </p>
                          )}
                          {note && <p className="text-[10px] italic text-slate-500">{note}</p>}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
                              <div className="text-[10px] leading-tight">
                                  <span className={cn("font-black uppercase", r.source.tier === 'official' ? "text-emerald-700" : r.source.tier === 'social' ? "text-amber-600" : "text-slate-600")}>
                                      {SOURCE_TIER_LABELS[r.source.tier]}
                                  </span>
                                  <span className="text-slate-500"> · {r.source.name}</span>
                                  <div className="text-slate-400">{formatReportDate(r.observedAt)}</div>
                              </div>
                              {r.source.urls[0] && !r.flags.includes('unofficial_mirror') && (
                                  <a href={r.source.urls[0]} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] font-black uppercase text-primary hover:underline">
                                      Source <ExternalLink className="h-3 w-3" />
                                  </a>
                              )}
                          </div>
                          {r.geo!.lines && <p className="text-[9px] text-slate-400">Tracé : {PRESS_SOURCES.osm.attribution}</p>}
                      </div>
                  </InfoWindow>
              );
          })()}
        </Map>
      </div>

      {/* Legend Overlay */}
      <div className="absolute bottom-6 left-4 right-4 z-10 pointer-events-none">
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="max-w-md mx-auto pointer-events-auto">
              <Card className="bg-white/90 backdrop-blur-xl border-none shadow-2xl rounded-2xl p-4">
                  <div className="flex justify-between items-center gap-2">
                      {Object.entries(HAZARD_TYPES).map(([key, config]) => (
                          <div key={key} className="flex flex-col items-center gap-1">
                              <div className="text-xl">{config.icon}</div>
                              <span className="text-[8px] font-black uppercase text-slate-400 text-center leading-none">{config.label}</span>
                          </div>
                      ))}
                  </div>
                  {showPress && (
                      <p className="mt-3 border-t pt-2 text-center text-[9px] font-bold text-slate-400 leading-snug">
                          Cercles et tronçons : presse et ministère. Trait plein = tronçon précis, pointillés = rue entière.
                      </p>
                  )}
              </Card>
          </motion.div>
      </div>
    </div>
  );
}