'use client';

/**
 * Mode Conduite (phase 1) : carte stylisée de Kinshasa, itinéraire et consignes en plein écran.
 *
 * - Carte MapLibre, tuiles OpenFreeMap (données © OpenStreetMap), repeinte « jeu d'arcade » à la volée.
 * - Itinéraire calculé par /api/drive-route (OSRM), suivi au GPS, recalculé si on s'en écarte.
 * - « Démo » : un trajet simulé le long de l'itinéraire, pour tester sans rouler.
 * Les alertes (bouchons, pluie, routes abîmées…) arrivent en phase 2.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Map as MLMap, Marker as MLMarker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ArrowUp, Flag, Loader2, LocateFixed, Play, RotateCcw, Undo2, X, Gauge, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DRIVE_PLACES, arrowFor, formatDistance, formatDuration, inKinshasa, instruction, pointAlong, prepareRoute, progressOn,
  type ArrowKind, type DriveProgress, type DriveRoute, type LatLng, type PreparedRoute,
} from '@/lib/drive';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const KIN_CENTER: LatLng = [-4.33, 15.31];
const SIM_SPEED = 14;        // m/s (~50 km/h) affichés pendant la démo
const SIM_FACTOR = 4;        // la démo avance 4× plus vite que la réalité
const OFF_ROUTE_M = 50;
const ll = ([lat, lng]: LatLng): [number, number] => [lng, lat];

type Phase = 'choose' | 'loading' | 'driving' | 'arrived';

// ───────────────────────────── Style « arcade » ─────────────────────────────
/** Repeint le style OpenFreeMap : nuit bleue, grands axes dorés, eau turquoise, immeubles en relief. */
function applyGameStyle(map: MLMap) {
  const layers = map.getStyle().layers ?? [];
  type PaintProp = Parameters<MLMap['setPaintProperty']>[1];
  type PaintValue = Parameters<MLMap['setPaintProperty']>[2];
  const set = (id: string, prop: string, value: string | number) => { try { map.setPaintProperty(id, prop as PaintProp, value as PaintValue); } catch { /* propriété absente */ } };
  const hide = (id: string) => { try { map.setLayoutProperty(id, 'visibility', 'none'); } catch { /* ignore */ } };
  let hasExtrusion = false;
  for (const l of layers) {
    const id = l.id;
    if (l.type === 'background') set(id, 'background-color', '#0b1324');
    else if (l.type === 'fill') {
      // Une texture (fill-pattern) ignore la couleur : on la masque, sinon elle casse l'ambiance de nuit
      if ((l as { paint?: Record<string, unknown> }).paint?.['fill-pattern']) hide(id);
      else if (/water/.test(id)) set(id, 'fill-color', '#0e7490');
      else if (/park|wood|grass|landcover|forest|scrub|wetland/.test(id)) set(id, 'fill-color', '#123d2a');
      else if (/building/.test(id)) hide(id);
      else set(id, 'fill-color', '#111a2e');
    } else if (l.type === 'fill-extrusion') {
      hasExtrusion = true;
      set(id, 'fill-extrusion-color', '#1e293b');
      set(id, 'fill-extrusion-opacity', 0.85);
    } else if (l.type === 'line') {
      if (/water|river|stream|canal/.test(id)) set(id, 'line-color', '#0891b2');
      else if (/boundary|admin/.test(id)) hide(id);
      else if (/casing/.test(id)) set(id, 'line-color', '#060b16');
      else if (/motorway|trunk|primary/.test(id)) set(id, 'line-color', '#fbbf24');
      else if (/secondary|tertiary/.test(id)) set(id, 'line-color', '#d97706');
      else if (/road|street|minor|service|track|path|highway|bridge|tunnel|link/.test(id)) set(id, 'line-color', '#334155');
    } else if (l.type === 'symbol') {
      set(id, 'text-color', '#e5e7eb');
      set(id, 'text-halo-color', '#0b1324');
      set(id, 'text-halo-width', 1.5);
    }
  }
  if (!hasExtrusion && map.getSource('openmaptiles')) {
    const firstSymbol = layers.find(l => l.type === 'symbol')?.id;
    try {
      map.addLayer({
        id: 'kf-buildings', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
        paint: {
          'fill-extrusion-color': '#1e293b',
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.85,
        },
      }, firstSymbol);
    } catch { /* source différente : on garde les bâtiments à plat */ }
  }
}

// ───────────────────────────── Éléments graphiques ─────────────────────────────
/** Taxi jaune vu de dessus (le véhicule du joueur). */
function taxiElement() {
  const el = document.createElement('div');
  el.style.width = '34px';
  el.style.height = '54px';
  el.innerHTML = `<svg viewBox="0 0 34 54" width="34" height="54" aria-hidden="true">
    <ellipse cx="17" cy="29" rx="15" ry="24" fill="rgba(34,211,238,0.25)"/>
    <rect x="5" y="4" width="24" height="46" rx="9" fill="#facc15" stroke="#0b1324" stroke-width="2"/>
    <rect x="9" y="11" width="16" height="9" rx="3" fill="#0f172a"/>
    <rect x="9" y="33" width="16" height="7" rx="3" fill="#0f172a"/>
    <rect x="11" y="23" width="12" height="7" rx="2" fill="#111827"/>
    <rect x="12.5" y="24.5" width="9" height="4" rx="1" fill="#fde047"/>
    <circle cx="9" cy="6" r="1.8" fill="#fff7cc"/><circle cx="25" cy="6" r="1.8" fill="#fff7cc"/>
  </svg>`;
  return el;
}

function flagElement() {
  const el = document.createElement('div');
  el.innerHTML = `<svg viewBox="0 0 32 40" width="32" height="40" aria-hidden="true">
    <rect x="5" y="4" width="2.5" height="34" rx="1" fill="#e5e7eb"/>
    <path d="M7.5 5h18l-4 6 4 6h-18z" fill="#ef4444" stroke="#0b1324" stroke-width="1.5"/>
  </svg>`;
  return el;
}

const ARROW_ROTATION: Partial<Record<ArrowKind, number>> = {
  straight: 0, 'slight-right': 45, right: 90, 'sharp-right': 135, 'slight-left': -45, left: -90, 'sharp-left': -135,
};

function ManeuverIcon({ kind, className }: { kind: ArrowKind; className?: string }) {
  if (kind === 'arrive') return <Flag className={className} />;
  if (kind === 'uturn') return <Undo2 className={className} />;
  if (kind === 'roundabout') return <RotateCcw className={className} />;
  return <ArrowUp className={className} style={{ transform: `rotate(${ARROW_ROTATION[kind] ?? 0}deg)` }} />;
}

// ───────────────────────────── Écran ─────────────────────────────
export default function DriveMode() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const mlRef = useRef<typeof import('maplibre-gl') | null>(null);
  const carRef = useRef<MLMarker | null>(null);
  const flagRef = useRef<MLMarker | null>(null);
  const routeRef = useRef<PreparedRoute | null>(null);
  const lastIndexRef = useRef(0);
  const offCountRef = useRef(0);
  const lastRerouteRef = useRef(0);
  const simMRef = useRef(0);
  const startedAtRef = useRef(0);
  const followRef = useRef(true);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('choose');
  const [gpsPos, setGpsPos] = useState<LatLng | null>(null);
  const [startId, setStartId] = useState<string>('gps');
  const [destId, setDestId] = useState<string>(DRIVE_PLACES[1]?.id ?? '');
  const [pickedDest, setPickedDest] = useState<LatLng | null>(null);
  const [simulate, setSimulate] = useState(false);
  const [progress, setProgress] = useState<DriveProgress | null>(null);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ km: string; time: string } | null>(null);
  const [following, setFollowing] = useState(true);

  const startPoint: LatLng | null = startId === 'gps' ? gpsPos : DRIVE_PLACES.find(p => p.id === startId)?.point ?? null;
  const destPoint: LatLng | null = destId === 'picked' ? pickedDest : DRIVE_PLACES.find(p => p.id === destId)?.point ?? null;

  // ── Carte ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ml = await import('maplibre-gl');
        if (cancelled || !containerRef.current) return;
        // Le bundler ne sait pas retrouver le worker de MapLibre 6 : on sert une copie statique
        // (public/maplibre-gl-worker.js, recopiée à chaque « npm install »).
        ml.setWorkerUrl('/maplibre-gl-worker.js');
        mlRef.current = ml;
        const map = new ml.Map({
          container: containerRef.current,
          style: STYLE_URL,
          center: ll(KIN_CENTER),
          zoom: 12,
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.on('load', () => { applyGameStyle(map); setMapReady(true); });
        map.on('error', e => { if (!map.loaded()) setMapError(String(e.error?.message ?? 'Carte indisponible')); });
        // L'utilisateur bouge la carte : on arrête de suivre la voiture jusqu'au bouton « Recentrer »
        map.on('dragstart', () => { followRef.current = false; setFollowing(false); });
      } catch (e) {
        setMapError('Impossible de charger la carte.');
      }
    })();
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  // ── Position GPS de départ (si l'utilisateur l'accepte) ──
  useEffect(() => {
    if (!navigator.geolocation) { setStartId(DRIVE_PLACES[0].id); return; }
    navigator.geolocation.getCurrentPosition(
      p => {
        const pos: LatLng = [p.coords.latitude, p.coords.longitude];
        if (inKinshasa(pos)) setGpsPos(pos); else setStartId(DRIVE_PLACES[0].id);
      },
      () => setStartId(DRIVE_PLACES[0].id),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  // ── Choisir l'arrivée en touchant la carte ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || phase !== 'choose') return;
    const onClick = (e: { lngLat: { lat: number; lng: number } }) => {
      const p: LatLng = [e.lngLat.lat, e.lngLat.lng];
      if (!inKinshasa(p)) return;
      setPickedDest(p);
      setDestId('picked');
    };
    map.on('click', onClick);
    return () => { map.off('click', onClick); };
  }, [mapReady, phase]);

  // ── Drapeau d'arrivée ──
  useEffect(() => {
    const ml = mlRef.current, map = mapRef.current;
    if (!ml || !map || !mapReady) return;
    if (!destPoint) { flagRef.current?.remove(); flagRef.current = null; return; }
    if (!flagRef.current) flagRef.current = new ml.Marker({ element: flagElement(), anchor: 'bottom-left' }).setLngLat(ll(destPoint)).addTo(map);
    else flagRef.current.setLngLat(ll(destPoint));
  }, [destPoint, mapReady]);

  const drawRoute = useCallback((r: PreparedRoute) => {
    const map = mapRef.current;
    if (!map) return;
    const data = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: r.coords.map(ll) } };
    const src = map.getSource('kf-route') as { setData?: (d: unknown) => void } | undefined;
    if (src?.setData) { src.setData(data); return; }
    map.addSource('kf-route', { type: 'geojson', data });
    map.addLayer({ id: 'kf-route-glow', type: 'line', source: 'kf-route', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#22d3ee', 'line-width': 16, 'line-blur': 8, 'line-opacity': 0.55 } });
    map.addLayer({ id: 'kf-route-line', type: 'line', source: 'kf-route', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#a5f3fc', 'line-width': 6 } });
  }, []);

  const fetchRoute = useCallback(async (from: LatLng, to: LatLng): Promise<PreparedRoute> => {
    const res = await fetch(`/api/drive-route?from=${from[0].toFixed(6)},${from[1].toFixed(6)}&to=${to[0].toFixed(6)},${to[1].toFixed(6)}`);
    const json = await res.json() as { routes?: DriveRoute[]; error?: string };
    if (!res.ok || !json.routes?.length) throw new Error(json.error ?? 'Aucun itinéraire trouvé.');
    return prepareRoute(json.routes[0]);
  }, []);

  /** Place la voiture et la caméra « derrière » elle, carte inclinée, comme dans un jeu. */
  const moveCar = useCallback((pos: LatLng, heading: number, quick: boolean) => {
    const ml = mlRef.current, map = mapRef.current;
    if (!ml || !map) return;
    if (!carRef.current) carRef.current = new ml.Marker({ element: taxiElement(), rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(ll(pos)).addTo(map);
    carRef.current.setLngLat(ll(pos)).setRotation(heading);
    if (followRef.current) {
      const h = map.getContainer().clientHeight;
      map.easeTo({ center: ll(pos), bearing: heading, pitch: 62, zoom: 17, duration: quick ? 240 : 900, padding: { top: Math.round(h * 0.45), bottom: 0, left: 0, right: 0 } });
    }
  }, []);

  const update = useCallback((pos: LatLng, speedMs: number | null, quick: boolean) => {
    const r = routeRef.current;
    if (!r) return;
    const p = progressOn(r, pos, lastIndexRef.current);
    lastIndexRef.current = p.index;
    setProgress(p);
    if (speedMs != null) setSpeedKmh(Math.round(speedMs * 3.6));
    // Sur la route : la voiture colle à l'itinéraire ; sinon on montre la vraie position
    const onRoute = p.offRouteM < OFF_ROUTE_M;
    moveCar(onRoute ? p.snapped : pos, p.heading, quick);
    if (p.remainingM < 25) {
      setSummary({ km: formatDistance(p.doneM), time: formatDuration((Date.now() - startedAtRef.current) / 1000 * (simulate ? SIM_FACTOR : 1)) });
      setPhase('arrived');
    }
    return p;
  }, [moveCar, simulate]);

  const start = useCallback(async (sim: boolean) => {
    if (!startPoint || !destPoint) return;
    setError(null);
    setPhase('loading');
    try {
      const r = await fetchRoute(startPoint, destPoint);
      routeRef.current = r;
      lastIndexRef.current = 0;
      offCountRef.current = 0;
      simMRef.current = 0;
      startedAtRef.current = Date.now();
      followRef.current = true;
      setFollowing(true);
      setSimulate(sim);
      drawRoute(r);
      setPhase('driving');
      const first = pointAlong(r, 0);
      update(first.point, sim ? SIM_SPEED : null, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setPhase('choose');
    }
  }, [startPoint, destPoint, fetchRoute, drawRoute, update]);

  // ── Conduite : GPS réel ou démo simulée ──
  useEffect(() => {
    if (phase !== 'driving') return;
    if (simulate) {
      const id = window.setInterval(() => {
        const r = routeRef.current;
        if (!r) return;
        simMRef.current += SIM_SPEED * SIM_FACTOR * 0.25;
        const { point } = pointAlong(r, Math.min(simMRef.current, r.along[r.along.length - 1]));
        update(point, SIM_SPEED, true);
      }, 250);
      return () => window.clearInterval(id);
    }
    if (!navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(async p => {
      const pos: LatLng = [p.coords.latitude, p.coords.longitude];
      const pr = update(pos, p.coords.speed, false);
      if (!pr || !destPoint) return;
      // Écart persistant : on recalcule (au plus une fois toutes les 15 s)
      offCountRef.current = pr.offRouteM > OFF_ROUTE_M ? offCountRef.current + 1 : 0;
      if (offCountRef.current >= 3 && Date.now() - lastRerouteRef.current > 15_000) {
        lastRerouteRef.current = Date.now();
        offCountRef.current = 0;
        try {
          const r = await fetchRoute(pos, destPoint);
          routeRef.current = r;
          lastIndexRef.current = 0;
          drawRoute(r);
        } catch { /* on garde l'ancien itinéraire */ }
      }
    }, () => setError('GPS indisponible : activez la localisation.'), { enableHighAccuracy: true, maximumAge: 1000, timeout: 15_000 });
    return () => navigator.geolocation.clearWatch(watch);
  }, [phase, simulate, update, fetchRoute, drawRoute, destPoint]);

  // ── Écran toujours allumé pendant la conduite ──
  useEffect(() => {
    if (phase !== 'driving') return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then(l => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, [phase]);

  const stop = () => {
    setPhase('choose');
    setProgress(null);
    routeRef.current = null;
    carRef.current?.remove(); carRef.current = null;
    const map = mapRef.current;
    if (map) {
      for (const id of ['kf-route-line', 'kf-route-glow']) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource('kf-route')) map.removeSource('kf-route');
      map.easeTo({ pitch: 0, bearing: 0, zoom: 12, center: ll(startPoint ?? KIN_CENTER), padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 800 });
    }
  };

  const recenter = () => { followRef.current = true; setFollowing(true); };

  const next = progress?.nextStep ?? null;
  const kind = arrowFor(next);
  const eta = useMemo(() => {
    if (!progress) return '';
    const t = new Date(Date.now() + progress.remainingS * 1000);
    return t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kinshasa' });
  }, [progress]);

  return (
    <div className="fixed inset-0 z-[70] bg-[#0b1324] text-white">
      {/* MapLibre impose « position: relative » à son conteneur : on le met dans une boîte plein écran */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {(mapError || !mapReady) && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0b1324]">
          {mapError
            ? <p className="max-w-xs text-center text-sm text-slate-300">{mapError}</p>
            : <Loader2 className="h-8 w-8 animate-spin text-cyan-300" />}
        </div>
      )}

      {/* Quitter */}
      <Link href="/verifier-trafic" aria-label="Quitter le mode conduite"
        className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 backdrop-blur">
        <X className="h-5 w-5" />
      </Link>

      {/* ── Choix du trajet ── */}
      {(phase === 'choose' || phase === 'loading') && (
        <div className="absolute inset-x-0 bottom-0 z-10 rounded-t-3xl bg-[#0f172a]/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur">
          <div className="mb-3 flex items-center gap-2">
            <Navigation className="h-5 w-5 text-yellow-300" />
            <h2 className="text-lg font-black tracking-tight text-white">Mode Conduite</h2>
            <span className="rounded-full bg-yellow-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-900">Bêta</span>
          </div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">
            Départ
            <select value={startId} onChange={e => setStartId(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm font-semibold normal-case tracking-normal text-white">
              {gpsPos && <option value="gps">📍 Ma position</option>}
              {DRIVE_PLACES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-slate-400">
            Arrivée <span className="font-medium normal-case tracking-normal text-slate-500">(ou touchez la carte)</span>
            <select value={destId} onChange={e => setDestId(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm font-semibold normal-case tracking-normal text-white">
              {pickedDest && <option value="picked">🚩 Point choisi sur la carte</option>}
              {DRIVE_PLACES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {error && <p className="mb-2 text-sm font-semibold text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={!mapReady || phase === 'loading' || startId !== 'gps' || !destPoint}
              onClick={() => start(false)}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-yellow-300 text-base font-black text-slate-900 shadow-lg shadow-yellow-300/20 disabled:opacity-40">
              {phase === 'loading' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Navigation className="h-5 w-5" />}
              C’est parti
            </button>
            <button type="button" disabled={!mapReady || phase === 'loading' || !startPoint || !destPoint}
              onClick={() => start(true)}
              className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-slate-600 px-4 text-sm font-bold text-slate-200 disabled:opacity-40">
              <Play className="h-4 w-4" /> Démo
            </button>
          </div>
          {startId !== 'gps' && (
            <p className="mt-2 text-[11px] text-slate-400">Pour rouler avec le GPS, choisissez « Ma position » comme départ. « Démo » simule le trajet.</p>
          )}
        </div>
      )}

      {/* ── Conduite : consigne en haut, tableau de bord en bas ── */}
      {phase === 'driving' && progress && (
        <>
          <div className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 mr-14 flex items-center gap-3 rounded-2xl bg-emerald-600 p-3 shadow-2xl ring-2 ring-emerald-300/40">
            <ManeuverIcon kind={kind} className="h-12 w-12 shrink-0" />
            <div className="min-w-0">
              <div className="text-3xl font-black leading-none tracking-tight">{formatDistance(progress.toNextStepM)}</div>
              <div className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-emerald-50">{instruction(next)}</div>
            </div>
          </div>
          {simulate && (
            <div className="absolute left-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+5.5rem)] z-10 rounded-full bg-fuchsia-600 px-3 py-1 text-[10px] font-black uppercase tracking-wider">
              Démo ×{SIM_FACTOR}
            </div>
          )}

          {!following && (
            <button type="button" onClick={recenter}
              className="absolute bottom-28 right-3 z-10 flex h-12 items-center gap-2 rounded-full bg-black/70 px-4 text-sm font-bold backdrop-blur">
              <LocateFixed className="h-4 w-4" /> Recentrer
            </button>
          )}

          <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 bg-[#0f172a]/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
            <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border-2 border-yellow-300 bg-slate-900">
              <Gauge className="h-3.5 w-3.5 text-yellow-300" />
              <span className="text-lg font-black leading-none">{speedKmh}</span>
              <span className="text-[8px] font-bold text-slate-400">km/h</span>
            </div>
            <div className="min-w-0 flex-1 text-center">
              <div className="text-xl font-black leading-tight">{eta}</div>
              <div className="text-xs font-semibold text-slate-400">
                {formatDistance(progress.remainingM)} · {formatDuration(progress.remainingS)} <span className="text-slate-500">sans bouchons</span>
              </div>
            </div>
            <button type="button" onClick={stop}
              className="h-12 shrink-0 rounded-2xl bg-red-500 px-4 text-sm font-black">Arrêter</button>
          </div>
        </>
      )}

      {/* ── Arrivée ── */}
      {phase === 'arrived' && (
        <div className="absolute inset-x-4 top-1/3 z-10 rounded-3xl bg-[#0f172a]/95 p-6 text-center shadow-2xl ring-2 ring-yellow-300/40 backdrop-blur">
          <Flag className="mx-auto h-10 w-10 text-yellow-300" />
          <h2 className="mt-2 text-2xl font-black text-white">Vous êtes arrivé !</h2>
          {summary && <p className="mt-1 text-sm text-slate-300">{summary.km} en {summary.time}</p>}
          <button type="button" onClick={stop} className="mt-4 h-12 w-full rounded-2xl bg-yellow-300 font-black text-slate-900">Nouveau trajet</button>
        </div>
      )}
    </div>
  );
}
