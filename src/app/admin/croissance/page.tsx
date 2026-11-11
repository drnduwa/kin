'use client';

/**
 * Admin « Croissance » (Phase 3) : calendrier des événements, Sentinelles, flottes partenaires, sponsor.
 */
import { useCallback, useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, limit, orderBy, query, setDoc, Timestamp } from 'firebase/firestore';
import { AppShell } from '@/components/app-shell';
import { useUser, useFirebase, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { TRACKED_NODES, COMMUNE_CENTERS } from '@/lib/places';
import {
  createFleetPartnerAction, listFleetPartnersAction, setFleetPartnerActiveAction,
  setSentinelAction, listSentinelsAction,
} from '@/app/scale-actions';

const ADMIN_EMAILS = ['drnduwa@gmail.com', 'contact.congonamotema@gmail.com'];
const EVENT_TYPES = [['match', 'Match / stade'], ['cortege', 'Cortège officiel'], ['eglise', 'Grand rassemblement'], ['travaux', 'Travaux'], ['coupure', 'Coupure SNEL (feux éteints)'], ['autre', 'Autre']] as const;
const PLACES = [
  ...TRACKED_NODES.map(n => ({ key: `node:${n.id}`, label: n.name, lat: n.lat, lng: n.lng })),
  ...Object.entries(COMMUNE_CENTERS).map(([c, p]) => ({ key: `commune:${c}`, label: `Commune de ${c}`, ...p })),
];
type Tab = 'events' | 'sentinels' | 'fleets' | 'sponsor';

export default function CroissanceAdminPage() {
  const { user } = useUser();
  const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email);
  const [tab, setTab] = useState<Tab>('events');

  return (
    <AppShell>
      <div className="w-full h-full overflow-y-auto p-3 sm:p-4 md:p-6 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-4xl mx-auto space-y-4 pb-24">
          <h1 className="text-2xl font-black">Croissance</h1>
          {!isAdmin ? (
            <p className="text-sm text-slate-500">Réservé aux administrateurs.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-xl bg-white dark:bg-slate-900 border p-1">
                {([['events', 'Événements'], ['sentinels', 'Sentinelles'], ['fleets', 'Flottes'], ['sponsor', 'Sponsor']] as const).map(([t, l]) => (
                  <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
                    className={cn('rounded-lg py-2 text-sm font-bold', tab === t ? 'bg-primary text-white' : 'text-slate-500')}>{l}</button>
                ))}
              </div>
              {tab === 'events' && <EventsTab />}
              {tab === 'sentinels' && <SentinelsTab />}
              {tab === 'fleets' && <FleetsTab />}
              {tab === 'sponsor' && <SponsorTab />}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Card({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
      <div><h2 className="font-black">{title}</h2>{hint && <p className="text-xs text-slate-500">{hint}</p>}</div>
      {children}
    </section>
  );
}

/* --------------------------------------------------------------- Événements */
function EventsTab() {
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const q = useMemoFirebase(() => query(collection(firestore, 'traffic_events'), orderBy('endsAt', 'desc'), limit(30)), [firestore]);
  const { data: events } = useCollection<any>(q);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<string>('match');
  const [place, setPlace] = useState<string>(PLACES[0].key);
  const [radius, setRadius] = useState('1.5');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const add = async () => {
    const p = PLACES.find(x => x.key === place);
    if (!title.trim() || !p || !start || !end) { toast({ title: 'Champs manquants', variant: 'destructive' }); return; }
    const s = new Date(start), e = new Date(end);
    if (!(e > s)) { toast({ title: 'La fin doit être après le début', variant: 'destructive' }); return; }
    try {
      await addDoc(collection(firestore, 'traffic_events'), {
        title: title.trim(), type, lat: p.lat, lng: p.lng, placeLabel: p.label, radiusKm: Number(radius) || 1.5,
        startsAt: Timestamp.fromDate(s), endsAt: Timestamp.fromDate(e),
      });
      setTitle(''); toast({ title: 'Événement ajouté', description: 'Il apparaîtra dans « Pourquoi ? » une heure avant le début.' });
    } catch { toast({ title: 'Erreur', variant: 'destructive' }); }
  };

  return (
    <>
      <Card title="Ajouter un événement" hint="Visible dans « Pourquoi ça bloque » pour les carrefours dans le rayon, d'une heure avant à une heure après.">
        <div className="grid sm:grid-cols-2 gap-2">
          <Input placeholder="Titre (ex. Match V.Club – TP Mazembe)" value={title} onChange={e => setTitle(e.target.value)} aria-label="Titre" />
          <Select value={type} onValueChange={setType}><SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger>
            <SelectContent>{EVENT_TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
          <Select value={place} onValueChange={setPlace}><SelectTrigger aria-label="Lieu"><SelectValue /></SelectTrigger>
            <SelectContent>{PLACES.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent></Select>
          <Input type="number" step="0.5" min="0.5" max="10" value={radius} onChange={e => setRadius(e.target.value)} aria-label="Rayon en km" placeholder="Rayon (km)" />
          <label className="text-xs text-slate-500">Début<Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label>
          <label className="text-xs text-slate-500">Fin<Input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label>
        </div>
        <Button onClick={add}>Ajouter</Button>
      </Card>
      <Card title="Événements récents">
        {!events?.length ? <p className="text-sm text-slate-500">Aucun événement.</p> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {events.map((e: any) => (
              <li key={e.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0"><b>{e.title}</b><span className="block text-xs text-slate-500">{e.placeLabel ?? ''} · {e.startsAt?.toDate?.().toLocaleString('fr-FR')} → {e.endsAt?.toDate?.().toLocaleString('fr-FR')}</span></span>
                <Button variant="outline" size="sm" onClick={() => deleteDoc(doc(firestore, 'traffic_events', e.id))}>Supprimer</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/* --------------------------------------------------------------- Sentinelles */
function SentinelsTab() {
  const { user } = useUser();
  const { toast } = useToast();
  const [list, setList] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [corridor, setCorridor] = useState('');
  const load = useCallback(async () => {
    if (!user) return;
    const r = await listSentinelsAction(await user.getIdToken());
    setList(r.sentinels || []);
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const set = async (mail: string, on: boolean) => {
    if (!user) return;
    const r = await setSentinelAction({ idToken: await user.getIdToken(), email: mail, isSentinel: on, corridor });
    if (r.success) { toast({ title: on ? 'Sentinelle nommée' : 'Sentinelle retirée' }); setEmail(''); load(); }
    else toast({ title: 'Erreur', description: r.error, variant: 'destructive' });
  };

  return (
    <>
      <Card title="Nommer une Sentinelle" hint="Conducteurs (souvent moto-taxis) payés en crédit pour couvrir un corridor aux heures de pointe. Le paiement se fait hors application.">
        <div className="grid sm:grid-cols-[2fr_1fr_auto] gap-2">
          <Input placeholder="E-mail du compte" value={email} onChange={e => setEmail(e.target.value)} aria-label="E-mail" />
          <Input placeholder="Corridor (ex. UPN → Gombe)" value={corridor} onChange={e => setCorridor(e.target.value)} aria-label="Corridor" />
          <Button onClick={() => set(email, true)} disabled={!email}>Nommer</Button>
        </div>
      </Card>
      <Card title={`Sentinelles (${list.length})`}>
        {!list.length ? <p className="text-sm text-slate-500">Aucune Sentinelle pour l'instant.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[560px]">
            <thead><tr className="text-left text-[11px] uppercase text-slate-500"><th>Nom</th><th>Corridor</th><th>Votes</th><th>Signal.</th><th>Dernier jour actif</th><th /></tr></thead>
            <tbody>{list.map(s => (
              <tr key={s.uid} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5"><b>{s.name}</b><span className="block text-xs text-slate-500">{s.email}</span></td>
                <td>{s.corridor}</td><td className="tabular-nums">{s.votes}</td><td className="tabular-nums">{s.reports}</td><td>{s.lastActiveDay}</td>
                <td><Button variant="outline" size="sm" onClick={() => set(s.email, false)}>Retirer</Button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}

/* --------------------------------------------------------------- Flottes */
function FleetsTab() {
  const { user } = useUser();
  const { toast } = useToast();
  const [partners, setPartners] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [emails, setEmails] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!user) return;
    const r = await listFleetPartnersAction(await user.getIdToken());
    setPartners(r.partners || []);
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!user) return;
    const r = await createFleetPartnerAction({ idToken: await user.getIdToken(), name, memberEmails: emails.split(/[,\s]+/) });
    if (r.success) { setNewKey(r.apiKey!); setName(''); setEmails(''); load(); }
    else toast({ title: 'Erreur', description: r.error, variant: 'destructive' });
  };
  const toggle = async (id: string, active: boolean) => {
    if (!user) return;
    await setFleetPartnerActiveAction({ idToken: await user.getIdToken(), partnerId: id, active });
    load();
  };

  return (
    <>
      <Card title="Nouveau partenaire flotte" hint="Les e-mails listés verront leur flotte sur la page Kin Flow Pro.">
        <div className="grid sm:grid-cols-[1fr_2fr_auto] gap-2">
          <Input placeholder="Nom de l'entreprise" value={name} onChange={e => setName(e.target.value)} aria-label="Nom" />
          <Input placeholder="E-mails des responsables (séparés par des virgules)" value={emails} onChange={e => setEmails(e.target.value)} aria-label="E-mails" />
          <Button onClick={create} disabled={!name}>Créer</Button>
        </div>
        {newKey && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm space-y-1">
            <b>Clé API (affichée une seule fois) :</b>
            <code className="block break-all select-all text-xs">{newKey}</code>
            <span className="text-xs text-slate-600">Transmettez-la au partenaire par un canal sûr. Elle n'est plus récupérable ensuite ; en cas de perte, créez un nouveau partenaire et désactivez l'ancien.</span>
          </div>
        )}
      </Card>
      <Card title={`Partenaires (${partners.length})`}>
        {!partners.length ? <p className="text-sm text-slate-500">Aucun partenaire.</p> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {partners.map(p => (
              <li key={p.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0"><b>{p.name}</b> {!p.active && <span className="text-xs text-red-600">(désactivé)</span>}<span className="block text-xs text-slate-500">{p.vehicles} véhicule(s) · {p.members.join(', ') || 'aucun responsable'}</span></span>
                <Button variant="outline" size="sm" onClick={() => toggle(p.id, !p.active)}>{p.active ? 'Désactiver' : 'Réactiver'}</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/* --------------------------------------------------------------- Sponsor */
function SponsorTab() {
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const ref = useMemoFirebase(() => doc(firestore, 'app_settings', 'sponsor'), [firestore]);
  const { data } = useDoc<any>(ref);
  const [name, setName] = useState('');
  const [prize, setPrize] = useState('');
  const [active, setActive] = useState(false);
  useEffect(() => { if (data) { setName(data.name || ''); setPrize(data.prize || ''); setActive(!!data.active); } }, [data]);

  const save = async () => {
    try { await setDoc(ref, { name: name.trim(), prize: prize.trim(), active }, { merge: true }); toast({ title: 'Sponsor enregistré' }); }
    catch { toast({ title: 'Erreur', variant: 'destructive' }); }
  };
  return (
    <Card title="Sponsor de la bataille des communes" hint="Affiché en haut de la page Classement quand il est actif.">
      <div className="grid sm:grid-cols-2 gap-2">
        <Input placeholder="Nom du sponsor" value={name} onChange={e => setName(e.target.value)} aria-label="Nom du sponsor" />
        <Input placeholder="Prix de la semaine (ex. 50 Go partagés entre les 20 meilleurs)" value={prize} onChange={e => setPrize(e.target.value)} aria-label="Prix" />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />Afficher le sponsor</label>
      <Button onClick={save}>Enregistrer</Button>
    </Card>
  );
}
