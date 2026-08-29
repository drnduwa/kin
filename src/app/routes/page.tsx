import { AppShell } from '@/components/app-shell';
import RoutesStats from '@/components/routes-stats';
import { PredictiveForecast } from '@/components/predictive-forecast';

export default function RoutesPage() {
  return (
    <AppShell>
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-2">Prévisions du Trafic</h1>
          <p className="text-slate-500 font-medium">Consultez l'état actuel et les prévisions des prochaines heures pour les grands axes de Kinshasa.</p>
        </div>
        
        <PredictiveForecast />

        <div className="pt-8 border-t border-slate-100">
          <RoutesStats />
        </div>
      </div>
    </AppShell>
  );
}

