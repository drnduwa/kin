'use client';

/**
 * Mode Conduite : carte stylisée de Kinshasa, itinéraire, consignes et alertes en plein écran.
 *
 * - Carte MapLibre, tuiles OpenFreeMap (données © OpenStreetMap), repeinte « jeu d'arcade » à la volée.
 * - Itinéraire calculé par /api/drive-route (OSRM), suivi au GPS, recalculé si on s'en écarte.
 * - « Démo » : un trajet simulé le long de l'itinéraire, pour tester sans rouler.
 * - Alertes (phase 2) : bouchons mesurés, signalements, presse/ministère, pluie ; voix française, une à la fois.
 * - Itinéraire choisi selon Kinshasa (bouchons, routes fermées ou inondées) et itinéraire bis en route.
 * - « Toujours là ? » (phase 3) : vote 1-tap récompensé, résumé du trajet, journal anonyme pour le test terrain.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Map as MLMap, Marker as MLMarker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ArrowUp, CloudRain, Flag, Gauge, Loader2, LocateFixed, Navigation, Play, RotateCcw, Route, Star, Undo2, Volume2, VolumeX, X } from 'lucide-react';
import { doc, increment, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useFirebase, useUser } from '@/firebase';
import type { DriveActions } from './drive-mode-loader';
import SpeedSharingToggle from '@/components/game/speed-sharing-toggle';
import { voteSlot } from '@/lib/kinshasa-time';
import { play } from '@/lib/sfx';
import { pressReportsAt } from '@/lib/road-reports';
import {
  HAZARD_STYLE, LINGALA, delayAheadMin, hazardsOnRoute, newAnnouncer, nextAnnouncement, rainMessage, routeCostMin, shouldSlowDown, spokenAlert,
  type AnnouncerState, type DriveIntel, type Hazard,
} from '@/lib/drive-alerts';
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
type Alert = { hazard: Hazard; until: number };
type Prompt = { hazard: Hazard; until: number };
type AltOffer = { route: PreparedRoute; savedMin: number; avoids: string };
type Banner = { text: string; ln?: string | null; tone: 'info' | 'rain' | 'xp'; until: number };

function hazardElement(h: Hazard) {
  const el = document.createElement('div');
  const s = HAZARD_STYLE[h.kind];
  el.style.cssText = `width:30px;height:30px;border-radius:9999px;background:#0b1324;border:3px solid ${s.color};display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 0 12px ${s.color}`;
  el.textContent = s.icon;
  el.title = h.title;
  return el;
}

/** Voix française du téléphone (le lingala viendra en enregistrements). */
function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  u.rate = 1.05;
  const fr = window.speechSynthesis.getVoices().find(v => v.lang?.toLowerCase().startsWith('fr'));
  if (fr) u.voice = fr;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export default function DriveMode({ actions }: { actions: DriveActions }) {
  const { user } = useUser();
  const { firestore } = useFirebase();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const mlRef = useRef<typeof import('maplibre-gl') | null>(null);
  const carRef = useRef<MLMarker | null>(null);
  const flagRef = useRef<MLMarker | null>(null);
  const hazardMarkersRef = useRef<MLMarker[]>([]);
  const routeRef = useRef<PreparedRoute | null>(null);
  const lastIndexRef = useRef(0);
  const offCountRef = useRef(0);
  const lastRerouteRef = useRef(0);
  const lastAltCheckRef = useRef(0);
  const simMRef = useRef(0);
  const startedAtRef = useRef(0);
  const followRef = useRef(true);
  const posRef = useRef<LatLng | null>(null);
  const announcerRef = useRef<AnnouncerState>(newAnnouncer());
  const askedRef = useRef<Set<string>>(new Set());
  const statsRef = useRef({ alerts: 0, confirmations: 0, reroutes: 0, xp: 0 });
  const loggedRef = useRef(false);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('choose');
  const [gpsPos, setGpsPos] = useState<LatLng | null>(null);
  const [startId, setStartId] = useState<string>('gps');
  const [destId, setDestId] = useState<string>(DRIVE_PLACES[1]?.id ?? '');
  const [pickedDest, setPickedDest] = useState<LatLng | null>(null);
  const [simulate, setSimulate] = useState(false);
  const [route, setRoute] = useState<PreparedRoute | null>(null);
  const [progress, setProgress] = useState<DriveProgress | null>(null);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ km: string; time: string; alerts: number; confirmations: number; xp: number } | null>(null);
  const [following, setFollowing] = useState(true);
  const [intel, setIntel] = useState<DriveIntel | null>(null);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [altOffer, setAltOffer] = useState<AltOffer | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const startPoint: LatLng | null = startId === 'gps' ? gpsPos : DRIVE_PLACES.find(p => p.id === startId)?.point ?? null;
  const destPoint: LatLng | null = destId === 'picked' ? pickedDest : DRIVE_PLACES.find(p => p.id === destId)?.point ?? null;

  const press = useMemo(() => pressReportsAt().filter(r => r.active), []);
  const rain = rainMessage(intel?.weather ?? null);
  const hazards = useMemo(
    () => (route ? hazardsOnRoute(route, intel, press, rain?.level === 'raining') : []),
    [route, intel, press, rain?.level],
  );

  // Préférence voix (mémorisée sur l'appareil)
  useEffect(() => {
    try { setVoiceOn(localStorage.getItem('kf-drive-voice') !== 'off'); } catch { /* stockage indisponible */ }
  }, []);
  const toggleVoice = () => {
    setVoiceOn(v => {
      try { localStorage.setItem('kf-drive-voice', v ? 'off' : 'on'); } catch { /* ignore */ }
      if (v) window.speechSynthesis?.cancel();
      return !v;
    });
  };
  const say = useCallback((text: string) => { if (voiceOn) speak(text); }, [voiceOn]);

  // Horloge pour faire disparaître les bandeaux
  useEffect(() => {
    if (phase !== 'driving') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

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
      } catch {
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

  // ── État du trafic : au départ puis toutes les 60 s pendant la conduite ──
  const refreshIntel = useCallback(async () => {
    try { const i = await actions.getDriveIntel(); setIntel(i); return i; } catch { return null; }
  }, []);
  useEffect(() => {
    if (phase !== 'driving') return;
    const id = window.setInterval(refreshIntel, 60_000);
    return () => window.clearInterval(id);
  }, [phase, refreshIntel]);

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

  // ── Dangers affichés sur la carte ──
  useEffect(() => {
    const ml = mlRef.current, map = mapRef.current;
    hazardMarkersRef.current.forEach(m => m.remove());
    hazardMarkersRef.current = [];
    if (!ml || !map || phase !== 'driving') return;
    hazardMarkersRef.current = hazards.map(h => new ml.Marker({ element: hazardElement(h) }).setLngLat(ll(h.point)).addTo(map));
  }, [hazards, phase]);

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

  /** Tous les itinéraires proposés par OSRM (le premier est le plus court à vide). */
  const fetchRoutes = useCallback(async (from: LatLng, to: LatLng): Promise<PreparedRoute[]> => {
    const res = await fetch(`/api/drive-route?from=${from[0].toFixed(6)},${from[1].toFixed(6)}&to=${to[0].toFixed(6)},${to[1].toFixed(6)}`);
    const json = await res.json() as { routes?: DriveRoute[]; error?: string };
    if (!res.ok || !json.routes?.length) throw new Error(json.error ?? 'Aucun itinéraire trouvé.');
    return json.routes.map(prepareRoute);
  }, []);

  const applyRoute = useCallback((r: PreparedRoute) => {
    routeRef.current = r;
    lastIndexRef.current = 0;
    announcerRef.current = newAnnouncer();
    setRoute(r);
    drawRoute(r);
  }, [drawRoute]);

  /** Le meilleur itinéraire selon Kinshasa : bouchons mesurés, routes fermées ou inondées. */
  const pickBest = useCallback((routes: PreparedRoute[], i: DriveIntel | null) => {
    const raining = rainMessage(i?.weather ?? null)?.level === 'raining';
    const scored = routes.map(r => ({ r, hz: hazardsOnRoute(r, i, press, raining) })).map(x => ({ ...x, cost: routeCostMin(x.r, x.hz) }));
    scored.sort((a, b) => a.cost - b.cost);
    return { best: scored[0], first: scored.find(x => x.r === routes[0])! };
  }, [press]);

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

  /** Fin du trajet (arrivée ou arrêt) : résumé et journal anonyme pour le test terrain. */
  const finishTrip = useCallback((completed: boolean, doneM: number) => {
    const durationS = (Date.now() - startedAtRef.current) / 1000 * (simulate ? SIM_FACTOR : 1);
    const st = statsRef.current;
    setSummary({ km: formatDistance(doneM), time: formatDuration(durationS), alerts: st.alerts, confirmations: st.confirmations, xp: st.xp });
    if (loggedRef.current || !user || doneM < 200) return;
    loggedRef.current = true;
    user.getIdToken().then(idToken => actions.logDriveTrip({
      idToken, distanceM: doneM, durationS, alerts: st.alerts, confirmations: st.confirmations, reroutes: st.reroutes, simulated: simulate, completed,
    })).catch(() => {});
  }, [simulate, user]);

  const update = useCallback((pos: LatLng, speedMs: number | null, quick: boolean) => {
    const r = routeRef.current;
    if (!r) return;
    posRef.current = pos;
    const p = progressOn(r, pos, lastIndexRef.current);
    lastIndexRef.current = p.index;
    setProgress(p);
    if (speedMs != null) setSpeedKmh(Math.round(speedMs * 3.6));
    // Sur la route : la voiture colle à l'itinéraire ; sinon on montre la vraie position
    const onRoute = p.offRouteM < OFF_ROUTE_M;
    moveCar(onRoute ? p.snapped : pos, p.heading, quick);
    if (p.remainingM < 25) {
      finishTrip(true, p.doneM);
      play('tada');
      setPhase('arrived');
    }
    return p;
  }, [moveCar, finishTrip]);

  const start = useCallback(async (sim: boolean) => {
    if (!startPoint || !destPoint) return;
    setError(null);
    setPhase('loading');
    try {
      // On n'attend pas plus de 6 s l'état du trafic : sinon on part, et les alertes arrivent dès qu'il répond.
      const intelSoon = refreshIntel();
      const [routes, i] = await Promise.all([
        fetchRoutes(startPoint, destPoint),
        Promise.race([intelSoon, new Promise<null>(r => window.setTimeout(() => r(null), 6000))]),
      ]);
      const { best, first } = pickBest(routes, i);
      offCountRef.current = 0;
      simMRef.current = 0;
      startedAtRef.current = Date.now();
      statsRef.current = { alerts: 0, confirmations: 0, reroutes: 0, xp: 0 };
      askedRef.current = new Set();
      loggedRef.current = false;
      followRef.current = true;
      setFollowing(true);
      setSimulate(sim);
      setSummary(null);
      setAltOffer(null);
      setPrompt(null);
      setAlert(null);
      applyRoute(best.r);
      setPhase('driving');
      update(pointAlong(best.r, 0).point, sim ? SIM_SPEED : null, false);

      // Premières informations : itinéraire choisi pour éviter un problème, pluie
      const t = Date.now();
      if (best.r !== first.r) {
        const saved = Math.round(first.cost - best.cost);
        const avoided = first.hz.find(h => !best.hz.some(b => b.id === h.id) && h.severity >= 2);
        const text = avoided ? `Itinéraire choisi pour éviter : ${avoided.title.toLowerCase()}` : `Itinéraire plus rapide choisi (${saved} min gagnées)`;
        setBanner({ text, tone: 'info', until: t + 8000 });
        say(text);
      } else {
        const r = rainMessage(i?.weather ?? null);
        if (r) { setBanner({ text: r.fr, ln: r.ln, tone: 'rain', until: t + 10_000 }); say(r.fr); }
        else say(instruction(best.r.steps[0] ?? null));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setPhase('choose');
    }
  }, [startPoint, destPoint, fetchRoutes, refreshIntel, pickBest, applyRoute, update, say]);

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
          const routes = await fetchRoutes(pos, destPoint);
          applyRoute(pickBest(routes, intel).best.r);
          statsRef.current.reroutes++;
          say('Nouvel itinéraire.');
        } catch { /* on garde l'ancien itinéraire */ }
      }
    }, () => setError('GPS indisponible : activez la localisation.'), { enableHighAccuracy: true, maximumAge: 1000, timeout: 15_000 });
    return () => navigator.geolocation.clearWatch(watch);
  }, [phase, simulate, update, fetchRoutes, applyRoute, pickBest, intel, destPoint, say]);

  // ── Alertes : quoi annoncer, quand ralentir, quoi faire confirmer ──
  const doneM = progress?.doneM ?? 0;
  useEffect(() => {
    if (phase !== 'driving' || !progress) return;
    const t = Date.now();
    const h = nextAnnouncement(announcerRef.current, hazards, progress.doneM, t);
    if (h) {
      statsRef.current.alerts++;
      setAlert({ hazard: h, until: t + 9000 });
      play(h.severity === 3 ? 'siren' : 'ding');
      say(spokenAlert(h, Math.max(0, h.atM - progress.doneM)));
    }
    // Danger dépassé (carrefour suivi ou signalement d'usager) : « Toujours là ? »
    const passed = hazards.find(z => (z.vote || z.reportId) && !askedRef.current.has(z.id)
      && progress.doneM > z.atM + 60 && progress.doneM < z.atM + 600);
    if (passed) {
      askedRef.current.add(passed.id);
      setPrompt({ hazard: passed, until: t + 15_000 });
    }
  }, [phase, progress, hazards, say]);

  const slowDown = phase === 'driving' && shouldSlowDown(hazards, doneM, speedKmh);
  useEffect(() => { if (slowDown) say('Ralentissez.'); }, [slowDown, say]);

  // ── Itinéraire bis : un blocage grave apparaît devant → on cherche mieux (au plus toutes les 2 min) ──
  useEffect(() => {
    if (phase !== 'driving' || !route || !destPoint || altOffer) return;
    const blocker = hazards.find(h => h.atM > doneM + 200 && h.severity === 3);
    if (!blocker || Date.now() - lastAltCheckRef.current < 120_000 || !posRef.current) return;
    lastAltCheckRef.current = Date.now();
    const from = posRef.current;
    (async () => {
      try {
        const routes = await fetchRoutes(from, destPoint);
        const ahead = hazards.filter(h => h.atM > doneM);
        const currentCost = (progress?.remainingS ?? route.duration) / 60 + delayAheadMin(ahead, doneM)
          + ahead.filter(h => (h.kind === 'closure' || h.kind === 'flood') && h.severity === 3).length * 30;
        const { best } = pickBest(routes, intel);
        const saved = Math.round(currentCost - best.cost);
        if (saved >= 3 && !best.hz.some(h => h.id === blocker.id)) {
          setAltOffer({ route: best.r, savedMin: saved, avoids: blocker.title });
          play('honk');
          say(`Itinéraire bis disponible : ${saved} minutes gagnées.`);
        }
      } catch { /* pas d'alternative pour l'instant */ }
    })();
  }, [phase, route, destPoint, altOffer, hazards, doneM, fetchRoutes, pickBest, intel, progress?.remainingS, say]);

  const acceptAlt = () => {
    if (!altOffer) return;
    applyRoute(altOffer.route);
    statsRef.current.reroutes++;
    setAltOffer(null);
    say('Itinéraire bis activé.');
  };

  // ── « Toujours là ? » : vote 1-tap (carrefours suivis, récompensé) ou confirmation d'un signalement ──
  const answer = async (stillThere: boolean) => {
    const p = prompt;
    setPrompt(null);
    if (!p) return;
    if (simulate) { setBanner({ text: 'Démo : réponse non envoyée', tone: 'info', until: Date.now() + 3000 }); return; }
    if (!user) return;
    statsRef.current.confirmations++;
    const h = p.hazard;
    try {
      if (h.vote) {
        const slot = voteSlot();
        const voteId = `${user.uid}_${h.vote.nodeId}_${slot}`;
        await setDoc(doc(firestore, 'traffic_votes', voteId), {
          userId: user.uid, nodeId: h.vote.nodeId, vote: stillThere ? 'still' : 'clear', slot, createdAt: serverTimestamp(),
        });
        const res = await actions.awardContribution({ idToken: await user.getIdToken(), type: 'upvote', refId: voteId, road: h.vote.nodeName });
        if (res.success && res.xpGained) {
          statsRef.current.xp += res.xpGained;
          play('tada');
          setBanner({ text: `+${res.xpGained} XP · merci, toute la ville en profite`, tone: 'xp', until: Date.now() + 4000 });
          return;
        }
      } else if (h.reportId && stillThere) {
        await updateDoc(doc(firestore, 'road_condition_reports', h.reportId), { votes: increment(1) });
      }
      play('ding');
      setBanner({ text: 'Merci pour la confirmation !', tone: 'xp', until: Date.now() + 3000 });
    } catch {
      // déjà voté sur ce créneau, ou hors ligne : pas grave pendant la conduite
      setBanner({ text: 'Déjà pris en compte', tone: 'info', until: Date.now() + 3000 });
    }
  };

  // ── Écran toujours allumé pendant la conduite ──
  useEffect(() => {
    if (phase !== 'driving') return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then(l => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, [phase]);

  const stop = () => {
    if (phase === 'driving' && progress) finishTrip(false, progress.doneM);
    window.speechSynthesis?.cancel();
    setPhase('choose');
    setProgress(null);
    setRoute(null);
    setAlert(null);
    setPrompt(null);
    setAltOffer(null);
    setBanner(null);
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
  const delayMin = progress ? delayAheadMin(hazards, progress.doneM) : 0;
  const eta = useMemo(() => {
    if (!progress) return '';
    const t = new Date(Date.now() + (progress.remainingS + delayMin * 60) * 1000);
    return t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kinshasa' });
  }, [progress, delayMin]);
  const upcoming = hazards.filter(h => h.atM > doneM - 20 && h.atM - doneM < 5000).slice(0, 3);
  const showAlert = alert && alert.until > now ? alert : null;
  const showPrompt = prompt && prompt.until > now ? prompt : null;
  const showBanner = banner && banner.until > now ? banner : null;

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

      {/* Quitter / voix */}
      <div className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex flex-col gap-2">
        <Link href="/verifier-trafic" aria-label="Quitter le mode conduite"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 backdrop-blur">
          <X className="h-5 w-5" />
        </Link>
        {phase === 'driving' && (
          <button type="button" onClick={toggleVoice} aria-label={voiceOn ? 'Couper la voix' : 'Activer la voix'}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 backdrop-blur">
            {voiceOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5 text-slate-400" />}
          </button>
        )}
      </div>

      {/* ── Choix du trajet ── */}
      {(phase === 'choose' || phase === 'loading') && (
        <div className="absolute inset-x-0 bottom-0 z-10 max-h-[80dvh] overflow-y-auto rounded-t-3xl bg-[#0f172a]/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur">
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
          <p className="mt-3 text-[11px] leading-snug text-slate-400">
            Alertes : bouchons mesurés, signalements des Kinois, presse et ministère, pluie. Ne touchez pas l’écran en roulant : la voix vous prévient.
          </p>
          <div className="mt-3"><SpeedSharingToggle /></div>
        </div>
      )}

      {/* ── Conduite ── */}
      {phase === 'driving' && progress && (
        <>
          {/* Consigne de direction */}
          <div className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 mr-14 flex items-center gap-3 rounded-2xl bg-emerald-600 p-3 shadow-2xl ring-2 ring-emerald-300/40">
            <ManeuverIcon kind={kind} className="h-12 w-12 shrink-0" />
            <div className="min-w-0">
              <div className="text-3xl font-black leading-none tracking-tight">{formatDistance(progress.toNextStepM)}</div>
              <div className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-emerald-50">{instruction(next)}</div>
            </div>
          </div>

          {/* Alerte en cours */}
          {showAlert && (
            <div className="absolute inset-x-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+5.75rem)] z-10 mr-14 rounded-2xl p-3 shadow-2xl ring-2 ring-white/20"
              style={{ backgroundColor: HAZARD_STYLE[showAlert.hazard.kind].color }}>
              <div className="flex items-center gap-3">
                <span className="text-3xl leading-none">{HAZARD_STYLE[showAlert.hazard.kind].icon}</span>
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-wider text-white/80">
                    Dans {formatDistance(Math.max(0, showAlert.hazard.atM - doneM))}
                  </div>
                  <div className="line-clamp-2 text-base font-black leading-tight">{showAlert.hazard.title}</div>
                  {showAlert.hazard.ln && <div className="mt-0.5 truncate text-xs font-semibold italic text-white/80">{showAlert.hazard.ln}</div>}
                </div>
              </div>
              {showAlert.hazard.detail && <div className="mt-1 line-clamp-2 text-[11px] text-white/80">{showAlert.hazard.detail}</div>}
            </div>
          )}

          {/* Ralentissez */}
          {slowDown && (
            <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600 px-6 py-3 text-xl font-black uppercase tracking-wider shadow-2xl ring-4 ring-red-400/40 animate-pulse">
              Ralentissez
              <div className="text-center text-[10px] font-bold normal-case tracking-normal text-red-100">{LINGALA.slow}</div>
            </div>
          )}

          {/* Bandeau : pluie, itinéraire choisi, XP */}
          {showBanner && !showAlert && (
            <div className={cn(
              'absolute inset-x-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+5.75rem)] z-10 mr-14 flex items-start gap-2 rounded-2xl p-3 text-sm font-bold shadow-2xl',
              showBanner.tone === 'rain' ? 'bg-sky-700' : showBanner.tone === 'xp' ? 'bg-yellow-300 text-slate-900' : 'bg-slate-800',
            )}>
              {showBanner.tone === 'rain' ? <CloudRain className="h-5 w-5 shrink-0" /> : showBanner.tone === 'xp' ? <Star className="h-5 w-5 shrink-0" /> : <Route className="h-5 w-5 shrink-0" />}
              <div>
                <div>{showBanner.text}</div>
                {showBanner.ln && <div className="text-xs font-semibold italic opacity-80">{showBanner.ln}</div>}
              </div>
            </div>
          )}

          {simulate && (
            <div className="absolute left-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+5.75rem)] z-[5] rounded-full bg-fuchsia-600 px-3 py-1 text-[10px] font-black uppercase tracking-wider">
              Démo ×{SIM_FACTOR}
            </div>
          )}

          {!following && (
            <button type="button" onClick={recenter}
              className="absolute bottom-44 right-3 z-10 flex h-12 items-center gap-2 rounded-full bg-black/70 px-4 text-sm font-bold backdrop-blur">
              <LocateFixed className="h-4 w-4" /> Recentrer
            </button>
          )}

          {/* Bas d'écran : itinéraire bis, « toujours là ? », dangers à venir, tableau de bord */}
          <div className="absolute inset-x-0 bottom-0 z-10">
            {altOffer && (
              <div className="mx-3 mb-2 rounded-2xl bg-cyan-500 p-3 text-slate-900 shadow-2xl">
                <div className="text-sm font-black">Itinéraire bis : {altOffer.savedMin} min gagnées</div>
                <div className="line-clamp-1 text-xs font-semibold">Évite : {altOffer.avoids}</div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={acceptAlt} className="h-11 flex-1 rounded-xl bg-slate-900 text-sm font-black text-cyan-300">Prendre</button>
                  <button type="button" onClick={() => setAltOffer(null)} className="h-11 rounded-xl bg-white/40 px-4 text-sm font-bold">Non merci</button>
                </div>
              </div>
            )}

            {showPrompt && !altOffer && (
              <div className="mx-3 mb-2 rounded-2xl bg-slate-800 p-3 shadow-2xl ring-1 ring-white/10">
                <div className="text-sm font-black">
                  {HAZARD_STYLE[showPrompt.hazard.kind].icon} {showPrompt.hazard.vote ? `Toujours bouché à ${showPrompt.hazard.vote.nodeName} ?` : `${showPrompt.hazard.title} : toujours là ?`}
                </div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => answer(true)} className="h-12 flex-1 rounded-xl bg-red-500 text-sm font-black">Toujours là</button>
                  <button type="button" onClick={() => answer(false)} className="h-12 flex-1 rounded-xl bg-emerald-500 text-sm font-black text-slate-900">C’est dégagé</button>
                </div>
                <div className="mt-1 text-center text-[10px] text-slate-400">
                  {simulate ? 'Démo : la réponse ne sera pas envoyée' : showPrompt.hazard.vote ? '+XP et FC · un passager peut répondre' : 'Un passager peut répondre'}
                </div>
              </div>
            )}

            {upcoming.length > 0 && !showPrompt && !altOffer && (
              <div className="mx-3 mb-2 flex gap-2 overflow-x-auto">
                {upcoming.map(h => (
                  <div key={h.id} className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-bold backdrop-blur"
                    style={{ boxShadow: `inset 0 0 0 2px ${HAZARD_STYLE[h.kind].color}` }}>
                    <span>{HAZARD_STYLE[h.kind].icon}</span>
                    <span>{formatDistance(Math.max(0, h.atM - doneM))}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 bg-[#0f172a]/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
              <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border-2 border-yellow-300 bg-slate-900">
                <Gauge className="h-3.5 w-3.5 text-yellow-300" />
                <span className="text-lg font-black leading-none">{speedKmh}</span>
                <span className="text-[8px] font-bold text-slate-400">km/h</span>
              </div>
              <div className="min-w-0 flex-1 text-center">
                <div className="text-xl font-black leading-tight">{eta}</div>
                <div className="text-xs font-semibold text-slate-400">
                  {formatDistance(progress.remainingM)} · {formatDuration(progress.remainingS + delayMin * 60)}{' '}
                  <span className={delayMin > 0 ? 'text-red-300' : 'text-slate-500'}>
                    {!intel ? 'sans bouchons' : delayMin > 0 ? `dont ${delayMin} min de bouchons` : 'selon les mesures'}
                  </span>
                </div>
              </div>
              <button type="button" onClick={stop}
                className="h-12 shrink-0 rounded-2xl bg-red-500 px-4 text-sm font-black">Arrêter</button>
            </div>
          </div>
        </>
      )}

      {/* ── Arrivée ── */}
      {phase === 'arrived' && (
        <div className="absolute inset-x-4 top-1/4 z-10 rounded-3xl bg-[#0f172a]/95 p-6 text-center shadow-2xl ring-2 ring-yellow-300/40 backdrop-blur">
          <Flag className="mx-auto h-10 w-10 text-yellow-300" />
          <h2 className="mt-2 text-2xl font-black text-white">Vous êtes arrivé !</h2>
          {summary && (
            <>
              <p className="mt-1 text-sm text-slate-300">{summary.km} en {summary.time}{simulate ? ' (démo)' : ''}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-slate-800 p-2"><div className="text-xl font-black">{summary.alerts}</div><div className="text-[10px] font-bold uppercase text-slate-400">alertes</div></div>
                <div className="rounded-2xl bg-slate-800 p-2"><div className="text-xl font-black">{summary.confirmations}</div><div className="text-[10px] font-bold uppercase text-slate-400">confirmées</div></div>
                <div className="rounded-2xl bg-slate-800 p-2"><div className="text-xl font-black text-yellow-300">+{summary.xp}</div><div className="text-[10px] font-bold uppercase text-slate-400">XP</div></div>
              </div>
              {summary.confirmations > 0 && <p className="mt-3 text-xs text-slate-400">Merci : vos réponses mettent à jour la carte de tout Kinshasa.</p>}
            </>
          )}
          <button type="button" onClick={stop} className="mt-4 h-12 w-full rounded-2xl bg-yellow-300 font-black text-slate-900">Nouveau trajet</button>
        </div>
      )}
    </div>
  );
}
