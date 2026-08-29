import { AppShell } from '@/components/app-shell';
import { PredictiveForecast } from '@/components/predictive-forecast';

export default function PrevisionsPage() {
  return (
    <AppShell>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-2">Prévisions du Trafic</h1>
          <p className="text-slate-500 font-medium">Consultez l'état actuel des routes et les prévisions pour les prochaines heures.</p>
        </div>
        
        <PredictiveForecast />
      </div>
    </AppShell>
  );
}

