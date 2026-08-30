'use client';

import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, FileText, Scale, Info, MapPin, CreditCard, Lock } from "lucide-react";
import { motion } from "framer-motion";

export default function PrivacyPage() {
  return (
    <AppShell>
      <div className="w-full h-full overflow-y-auto bg-slate-50/50 pb-20">
        <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-2"
          >
            <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-slate-900">
              Cadre Légal & <span className="text-primary">Confidentialité</span>
            </h1>
            <p className="text-muted-foreground font-medium italic">
              Dernière mise à jour : 1 avril 2026 • Version 2.2.4 • Conforme RDC 23/010
            </p>
          </motion.div>

          <Card className="border-none shadow-xl rounded-[2rem] overflow-hidden bg-white">
            <CardHeader className="bg-primary p-8 text-white">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
                  <Shield className="h-8 w-8 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-black">Kinshasa Flow</CardTitle>
                  <p className="text-primary-foreground/80 font-bold uppercase tracking-widest text-[10px]">
                    www.kinshasaflow.online
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8 md:p-12">
              <div className="prose prose-slate max-w-none space-y-12 text-slate-700 leading-relaxed">
                
                <section className="bg-blue-50 p-6 rounded-2xl border border-blue-100 flex items-start gap-4">
                  <Info className="h-6 w-6 text-primary shrink-0 mt-1" />
                  <div>
                    <h3 className="text-lg font-black text-slate-900 mb-2 uppercase tracking-tight">Base Juridique RDC</h3>
                    <p className="text-sm font-medium">
                      Cette politique est rédigée en stricte conformité avec l'<strong>Ordonnance-Loi n° 23/010</strong> du 13 mars 2023 portant Code du Numérique de la République Démocratique du Congo.
                    </p>
                  </div>
                </section>

                <div className="grid md:grid-cols-3 gap-6">
                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                    <MapPin className="text-primary h-6 w-6" />
                    <h4 className="font-bold">Géolocalisation</h4>
                    <p className="text-xs text-muted-foreground">Votre position est utilisée uniquement pour la navigation et les alertes trafic en direct.</p>
                  </div>
                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                    <CreditCard className="text-primary h-6 w-6" />
                    <h4 className="font-bold">Paiements</h4>
                    <p className="text-xs text-muted-foreground">Les transactions MbiyoPay sont traitées via des protocoles sécurisés sans stockage de vos secrets bancaires.</p>
                  </div>
                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                    <Lock className="text-primary h-6 w-6" />
                    <h4 className="font-bold">Protection</h4>
                    <p className="text-xs text-muted-foreground">Utilisation de Google Cloud Firebase pour un stockage sécurisé et chiffré de vos profils.</p>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="flex items-center gap-3 border-b-2 border-primary/10 pb-2">
                    <FileText className="text-primary h-6 w-6" />
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">I. Vos Données Personnelles</h2>
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-slate-800">1. Collecte de données sensibles</h3>
                    <p>
                      Dans le cadre de l'utilisation de <strong>K-Flow Nav</strong>, nous collectons vos coordonnées GPS précises. Ce traitement est basé sur votre consentement explicite lors de l'activation des services de navigation.
                    </p>
                    
                    <h3 className="text-xl font-bold text-slate-800">2. Identité du responsable</h3>
                    <div className="bg-slate-50 p-6 rounded-2xl text-sm space-y-2 border border-slate-100 font-medium shadow-inner">
                      <p><strong>Dénomination :</strong> Kinshasa Flow (Swazi Appli Lab sarl)</p>
                      <p><strong>Contact :</strong> drnduwa@gmail.com</p>
                      <p><strong>Localisation :</strong> Gombe / Kinshasa, RDC</p>
                    </div>

                    <h3 className="text-xl font-bold text-slate-800">3. Conservation des données</h3>
                    <p>Vos données de compte sont conservées tant que votre compte est actif. Les rapports de trafic communautaires sont anonymisés après 30 jours.</p>
                  </div>
                </div>

                <div className="space-y-8 pt-8">
                  <div className="flex items-center gap-3 border-b-2 border-primary/10 pb-2">
                    <Scale className="text-primary h-6 w-6" />
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">II. Conditions d'Utilisation</h2>
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-slate-800">Article 14. Usage du service</h3>
                    <p>
                      L'utilisateur s'engage à ne pas diffuser de fausses informations de trafic. Toute tentative de manipulation du système de <strong>Stars</strong> entraînera une suspension immédiate.
                    </p>

                    <h3 className="text-xl font-bold text-slate-800">Article 21. Litiges</h3>
                    <p>Les présentes conditions sont soumises au droit congolais. En cas de litige, les tribunaux de Kinshasa sont seuls compétents.</p>
                  </div>
                </div>

                {/* Section III - Account Deletion */}
                <div className="space-y-8 pt-8">
                  <div className="flex items-center gap-3 border-b-2 border-red-200 pb-2">
                    <Lock className="text-red-600 h-6 w-6" />
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">III. Suppression du Compte & des Données</h2>
                  </div>

                  <div className="space-y-4 bg-red-50 p-6 rounded-2xl border border-red-100">
                    <p className="text-sm font-medium text-slate-700 leading-relaxed">
                      Conformément aux directives de confidentialité Apple (Guideline 5.1.1) et à la réglementation sur les données personnelles, tout utilisateur peut supprimer définitivement son compte et effacer l'intégralité de ses données personnelles (nom, email, photo, transactions Stars, signalements) à tout moment.
                    </p>
                    <p className="text-xs text-slate-600 font-bold">
                      Comment procéder : Cliquez sur votre photo de profil en haut à droite, puis sélectionnez « <strong>Supprimer mon compte</strong> » et confirmez votre choix.
                    </p>
                  </div>
                </div>

                <footer className="pt-12 border-t border-slate-100 text-center space-y-6">
                  <p className="text-sm font-black uppercase tracking-widest text-slate-400">Canal de support</p>
                  <div className="flex flex-col md:flex-row justify-center items-center gap-6">
                    <a href="mailto:drnduwa@gmail.com" className="text-primary font-bold hover:underline bg-primary/5 px-4 py-2 rounded-full">drnduwa@gmail.com</a>
                    <span className="hidden md:block text-slate-300">|</span>
                    <a href="tel:+243857767040" className="text-slate-600 font-bold hover:text-primary transition-colors">+243 857 767 040</a>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-bold">Kinshasa Flow est une marque déposée de Swazi Appli Lab sarl.</p>
                </footer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
