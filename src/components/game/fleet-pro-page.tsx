'use client';

/** « Kin Flow Pro » : la flotte d'un partenaire, avec alerte quand un véhicule est près d'un nœud bloqué. */
import { useCallback, useEffect, useState } from 'react';
import { Truck, AlertTriangle, RefreshCw, Loader2, Building2, Code2 } from 'lucide-react';
import { useUser } from '@/firebase';
import { cn } from '@/lib/utils';
import { getFleetDashboardAction } from '@/app/scale-actions';

const STATUS_STYLE: Record<string, string> = {
  BLOQUÉ: 'bg-red-600 text-white', EMBOUTEILLAGE: 'bg-orange-500 text-white', MODÉRÉ: 'bg-amber-400 text-slate-900',
  FLUIDE: 'bg-emerald-500 text-white', INCONNU: 'bg-slate-400 text-white',
};

export default function FleetProPage() {
  const { user } = useUser();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try { setData(await getFleetDashboardAction(await user.getIdToken())); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !data) return <div className="p-6 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Chargement…</div>;
  if (data && !data.success) return <div className="p-6 text-sm text-red-600">{data.error}</div>;

  if (data && !data.member) {
    return (
      <div className="w-full h-full overflow-y-auto p-4 md:p-6 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-2xl mx-auto space-y-4">
          <section className="rounded-3xl bg-[#0A1A29] text-[#EAF3FA] border border-[#22425C] p-5 space-y-2">
            <h1 className="text-xl font-black inline-flex items-center gap-2"><Building2 className="h-5 w-5 text-[#FFD23F]" />Kin Flow Pro pour les flottes</h1>
            <p className="text-sm text-[#C9D8E4]">Livreurs, banques, ONG, logistique, VTC : voyez où sont vos véhicules et soyez alertés avant qu'ils n'entrent dans un bouchon.</p>
            <ul className="text-sm text-[#C9D8E4] list-disc pl-5 space-y-1">
              <li>Carte de votre flotte et état des 8 grands carrefours en direct</li>
              <li>Alerte quand un véhicule approche d'un nœud bloqué, avec la déviation</li>
              <li>Envoi des positions par simple API (une requête HTTP par minute)</li>
            </ul>
          </section>
          <p className="text-sm text-slate-600 dark:text-slate-400">Votre compte n'est rattaché à aucune flotte. Écrivez-nous depuis la page Contact pour devenir partenaire ; l'équipe ajoutera votre e-mail.</p>
        </div>
      </div>
    );
  }

  const alerts = (data?.vehicles || []).filter((v: any) => v.alert);
  return (
    <div className="w-full h-full overflow-y-auto p-3 sm:p-4 md:p-6 bg-slate-50 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto space-y-4 pb-24">
        <section className="rounded-3xl bg-[#0A1A29] text-[#EAF3FA] border border-[#22425C] p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-[#8EA8BD] font-bold">Kin Flow Pro</div>
            <h1 className="text-xl font-black">{data.partner.name}</h1>
            <div className="text-xs text-[#8EA8BD]">{data.vehicles.length} véhicule(s) vus ces 2 dernières heures · mis à jour à {data.updatedAt ?? '—'}</div>
          </div>
          <button type="button" onClick={load} className="inline-flex items-center gap-1.5 rounded-xl bg-[#11273A] border border-[#22425C] px-3 py-2 text-xs font-bold">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />Actualiser
          </button>
        </section>

        {alerts.length > 0 && (
          <section className="rounded-3xl border border-red-300 bg-red-50 dark:bg-red-950/30 p-4 space-y-2">
            <h2 className="font-black text-red-700 dark:text-red-300 inline-flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{alerts.length} véhicule(s) près d'un bouchon</h2>
            <ul className="space-y-1 text-sm">
              {alerts.map((v: any) => (
                <li key={v.id}><b>{v.id}</b> à {v.nearNode.km} km de {v.nearNode.name} ({v.nearNode.status.toLowerCase()}){v.nearNode.alt ? ` → déviation : ${v.nearNode.alt}` : ''}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <h2 className="font-black mb-2">Carrefours suivis</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.nodes.map((n: any) => (
              <div key={n.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm">
                <span className="truncate">{n.name}</span>
                <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-black uppercase shrink-0', STATUS_STYLE[n.status] ?? STATUS_STYLE.INCONNU)}>{n.status}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 overflow-x-auto">
          <h2 className="font-black mb-2 inline-flex items-center gap-2"><Truck className="h-4 w-4" />Véhicules</h2>
          {data.vehicles.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune position reçue ces 2 dernières heures. Vérifiez l'envoi via l'API (ci-dessous).</p>
          ) : (
            <table className="w-full text-sm min-w-[520px]">
              <thead><tr className="text-left text-[11px] uppercase text-slate-500"><th className="py-1">Véhicule</th><th>Vitesse</th><th>Vu à</th><th>Carrefour proche</th></tr></thead>
              <tbody>
                {data.vehicles.map((v: any) => (
                  <tr key={v.id} className={cn('border-t border-slate-100 dark:border-slate-800', v.alert && 'text-red-700 dark:text-red-300')}>
                    <td className="py-1.5 font-bold">{v.id}</td>
                    <td className="tabular-nums">{v.speedKmh === null ? '—' : `${v.speedKmh} km/h`}</td>
                    <td className="tabular-nums">{v.lastSeen}</td>
                    <td>{v.nearNode ? `${v.nearNode.name} (${v.nearNode.km} km, ${v.nearNode.status.toLowerCase()})` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-2">
          <h2 className="font-black inline-flex items-center gap-2"><Code2 className="h-4 w-4" />Envoyer vos positions</h2>
          <pre className="text-[11px] bg-slate-950 text-slate-100 rounded-xl p-3 overflow-x-auto">{`POST https://kinshasaflow.online/api/fleet/positions
Authorization: Bearer <votre clé kfp_…>
Content-Type: application/json

{ "vehicles": [ { "id": "moto-12", "lat": -4.351, "lng": 15.343, "speedKmh": 6.5, "ts": ${Date.now()} } ] }`}</pre>
          <p className="text-xs text-slate-500">Une requête par minute suffit. Les vitesses près des carrefours améliorent aussi la carte de tout Kinshasa (de façon anonyme).</p>
        </section>
      </div>
    </div>
  );
}
