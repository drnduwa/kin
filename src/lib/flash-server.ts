/**
 * Flash trafic (serveur) : texte court en français et en lingala, construit uniquement à partir
 * des données en direct. Utilisé par la page radio /flash, l'API /api/flash et le bot WhatsApp.
 */
import { getRealtimeCommandDashboardAction } from '@/app/actions';
import { findNodeInText, TRACKED_NODES } from '@/lib/places';

const STATUS_FR: Record<string, string> = {
  BLOQUÉ: 'bloqué', EMBOUTEILLAGE: 'embouteillé', MODÉRÉ: 'chargé', FLUIDE: 'fluide', INCONNU: 'sans données',
};

function nodeLine(b: any) {
  const delay = typeof b.delayMin === 'number' && b.delayMin > 0 ? `, +${b.delayMin} min` : '';
  const speed = typeof b.speedKmh === 'number' ? ` (${b.speedKmh} km/h)` : '';
  return `${b.name} : ${STATUS_FR[b.status] ?? b.status}${delay}${speed}`;
}

export async function buildFlash() {
  const d: any = await getRealtimeCommandDashboardAction(false);
  const nodes: any[] = d?.bottlenecks || [];
  const hour = d?.globalMetrics?.kinshasaHour;
  const jammed = nodes.filter(b => b.status === 'BLOQUÉ' || b.status === 'EMBOUTEILLAGE')
    .sort((a, b) => (b.delayMin ?? 0) - (a.delayMin ?? 0));
  const known = nodes.filter(b => b.status !== 'INCONNU').length;

  let fr: string;
  let ln: string;
  if (!known) {
    fr = `Flash Kinshasa Flow de ${hour} h : pas de mesure disponible pour le moment.`;
    ln = `Flash Kinshasa Flow ya ngonga ${hour} : tozali na ba nsango te sikoyo.`;
  } else if (!jammed.length) {
    fr = `Flash Kinshasa Flow de ${hour} h : aucun des ${nodes.length} grands carrefours suivis n'est embouteillé. Bonne route !`;
    ln = `Flash Kinshasa Flow ya ngonga ${hour} : banzela minene efungwami. Kende malamu !`;
  } else {
    const top = jammed.slice(0, 3);
    fr = `Flash Kinshasa Flow de ${hour} h. ` + top.map(b => {
      const why = b.why?.find((w: any) => w.confirmed)?.label;
      return `${nodeLine(b)}${why ? `. Cause : ${why}` : ''}. Contournez par ${b.certifiedAlt}.`;
    }).join(' ');
    // Phrases en lingala rédigées par l'équipe pour chaque nœud (déjà dites seulement en cas de blocage).
    ln = `Flash Kinshasa Flow ya ngonga ${hour}. ` + top.map(b => b.lingala).join(' ');
  }
  const all = nodes.map(nodeLine);
  return { fr, ln, lines: all, updatedAt: d?.globalMetrics?.updatedAt ?? null, source: d?.globalMetrics?.telemetrySource ?? '' };
}

/** Réponse du bot à un message libre : un carrefour précis, ou le résumé de la ville. */
export async function answerTrafficQuestion(text: string) {
  const flash = await buildFlash();
  const node = findNodeInText(text || '');
  const help = `Écrivez le nom d'un carrefour (${TRACKED_NODES.map(n => n.keywords[0].toUpperCase()).join(', ')}) ou TRAFIC.`;
  if (node) {
    const d: any = await getRealtimeCommandDashboardAction(false);
    const b = (d?.bottlenecks || []).find((x: any) => x.id === node.id);
    if (!b) return `Pas de données pour ${node.name} pour l'instant.\n${help}`;
    const why = (b.why || []).filter((w: any) => w.confirmed).map((w: any) => `• ${w.label}`).join('\n');
    return [
      `🚦 ${nodeLine(b)}`,
      why ? `Pourquoi :\n${why}` : null,
      b.status === 'BLOQUÉ' || b.status === 'EMBOUTEILLAGE' ? `➡️ Contournez par ${b.certifiedAlt}` : null,
      `Mis à jour à ${flash.updatedAt ?? '—'}.`,
      `Votre propre trajet en direct : kinshasaflow.online`,
    ].filter(Boolean).join('\n\n');
  }
  return [`🚦 ${flash.fr}`, flash.lines.map(l => `• ${l}`).join('\n'), help].join('\n\n');
}
