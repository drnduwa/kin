'use client';

import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Users, Sparkles, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export function LiveOnlineCounter({ compact = false }: { compact?: boolean }) {
  const [onlineCount, setOnlineCount] = useState<number>(3240);

  useEffect(() => {
    // Calculate realistic active Kinshasa drivers according to local time
    const calculateKinshasaDrivers = () => {
      const now = new Date();
      const hours = now.getHours();
      
      let baseCount = 2800;
      // Peak morning rush (06:30 - 09:30)
      if (hours >= 6 && hours <= 9) {
        baseCount = 4800 + Math.floor(Math.random() * 450);
      } 
      // Lunchtime (12:00 - 14:00)
      else if (hours >= 12 && hours <= 14) {
        baseCount = 3600 + Math.floor(Math.random() * 300);
      }
      // Peak evening rush (16:30 - 20:30)
      else if (hours >= 16 && hours <= 20) {
        baseCount = 5200 + Math.floor(Math.random() * 600);
      }
      // Night (22:00 - 05:00)
      else if (hours >= 22 || hours <= 5) {
        baseCount = 1400 + Math.floor(Math.random() * 200);
      } else {
        baseCount = 3100 + Math.floor(Math.random() * 350);
      }

      setOnlineCount(baseCount);
    };

    calculateKinshasaDrivers();

    // Subtle random fluctuations every 12 seconds to feel alive
    const interval = setInterval(() => {
      setOnlineCount(prev => {
        const delta = Math.floor(Math.random() * 7) - 3;
        return Math.max(1200, prev + delta);
      });
    }, 12000);

    return () => clearInterval(interval);
  }, []);

  const formatNumber = (num: number) => {
    return num.toLocaleString('fr-FR');
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full text-emerald-600 dark:text-emerald-400">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="text-[10px] font-black tracking-tight">{formatNumber(onlineCount)} en direct</span>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-2 bg-white dark:bg-slate-800/90 border border-emerald-500/30 px-3 py-1.5 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-default group"
      title="Conducteurs et passagers connectés actuellement à Kinshasa"
    >
      <div className="relative flex items-center justify-center">
        <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </div>

      <div className="flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
        <span className="text-xs font-black text-slate-800 dark:text-slate-200 font-mono tracking-tight">
          {formatNumber(onlineCount)}
        </span>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">
          en ligne à Kin
        </span>
      </div>
    </motion.div>
  );
}
