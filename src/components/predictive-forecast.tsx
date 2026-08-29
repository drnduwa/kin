'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getTrafficForecastAction } from '@/app/actions';
import { TrafficForecast } from '@/lib/types';
import { MAJOR_AXES } from '@/lib/constants';
import { Loader2, Route, Clock, AlertTriangle, CheckCircle, Navigation, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export function PredictiveForecast() {
  const [selectedRoute, setSelectedRoute] = useState(MAJOR_AXES[0].name);
  const [forecast, setForecast] = useState<TrafficForecast | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchForecast() {
      setLoading(true);
      try {
        const data = await getTrafficForecastAction(selectedRoute);
        setForecast(data);
      } catch (e) {
        console.error('Forecast error', e);
      } finally {
        setLoading(false);
      }
    }
    fetchForecast();
  }, [selectedRoute]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'EMBOUTEILLAGE': return 'bg-red-500 text-white';
      case 'DENSE': return 'bg-orange-500 text-white';
      case 'MODÉRÉ': return 'bg-yellow-500 text-white';
      case 'FLUIDE': return 'bg-emerald-500 text-white';
      default: return 'bg-slate-300 text-slate-700';
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col md:flex-row items-center gap-4">
        <div className="w-full md:w-1/3">
          <label className="text-sm font-bold text-slate-500 mb-2 block uppercase tracking-wider">Axe Principal</label>
          <select 
            value={selectedRoute}
            onChange={(e) => setSelectedRoute(e.target.value)}
            className="w-full h-12 px-4 rounded-2xl border-2 border-slate-200 bg-white font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {MAJOR_AXES.map((axis, i) => (
              <option key={i} value={axis.name}>{axis.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
          <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
          <p className="text-slate-500 font-medium">Analyse des données prédictives...</p>
        </div>
      ) : forecast ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          
          {/* CURRENT STATUS */}
          <Card className="rounded-3xl border-none shadow-xl overflow-hidden">
            <div className={cn("p-8", getStatusColor(forecast.currentStatus))}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-white/80 font-bold uppercase tracking-widest text-xs mb-1">Trafic Actuel</p>
                  <h2 className="text-3xl font-black">{forecast.currentStatus}</h2>
                </div>
                {forecast.currentStatus === 'FLUIDE' ? <CheckCircle className="h-12 w-12 opacity-80" /> : <AlertTriangle className="h-12 w-12 opacity-80" />}
              </div>
              <div className="mt-6 flex items-center gap-2">
                <Clock className="h-5 w-5 opacity-80" />
                <span className="font-semibold text-lg">{forecast.currentDelay > 0 ? `+${forecast.currentDelay} min de retard estimé` : 'Aucun retard'}</span>
              </div>
            </div>
          </Card>

          {/* HOURLY FORECAST */}
          <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50 border-b border-slate-100 p-6">
              <CardTitle className="text-lg font-black flex items-center gap-2 text-slate-800">
                <Route className="h-5 w-5 text-primary" />
                Prévisions Prochaines Heures
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto scrollbar-none">
              <div className="flex min-w-max p-6 gap-4">
                {forecast.hourlyForecast.map((hr, idx) => (
                  <div key={idx} className="flex flex-col items-center p-4 rounded-2xl border border-slate-100 bg-white w-24 shrink-0 shadow-sm">
                    <span className="text-sm font-black text-slate-800 mb-3">{hr.time}</span>
                    <div className={cn("w-12 h-12 rounded-full flex items-center justify-center mb-3 shadow-inner", getStatusColor(hr.status))}>
                      {hr.status === 'FLUIDE' ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                    </div>
                    <span className="text-xs font-bold text-slate-500">+{hr.delay}m</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ALTERNATIVES */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {forecast.alternatives.map((alt, i) => (
              <Card key={i} className="rounded-3xl border border-emerald-100 bg-emerald-50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Navigation className="h-16 w-16 text-emerald-600" />
                </div>
                <CardContent className="p-6 relative z-10">
                  <p className="text-emerald-700/80 font-bold uppercase tracking-widest text-[10px] mb-2">Itinéraire Alternatif Recommandé</p>
                  <h3 className="text-xl font-black text-emerald-900 mb-2">{alt.road}</h3>
                  <div className="flex items-center gap-2 text-emerald-700">
                    <Clock className="h-4 w-4" />
                    <span className="font-semibold text-sm text-emerald-800">Trafic {alt.status.toLowerCase()} (+{alt.delay}m)</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

        </motion.div>
      ) : null}
    </div>
  );
}
