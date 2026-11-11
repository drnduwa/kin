'use client';

import React, { useState } from 'react';
import { useFirebase } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Bell, Send, Loader2, Info, Mail, Zap, Users } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { sendTestEmailAction, broadcastEmailAction } from '@/app/actions';

export function NotificationSender() {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [isBroadcastingEmail, setIsBroadcastingEmail] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'system_alert' as 'user_joined' | 'traffic_report' | 'video_added' | 'system_alert',
    link: ''
  });

  const handleSubmitInApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.message) {
      toast({ title: "Champs requis", description: "Veuillez remplir au moins le titre et le message.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const notifRef = collection(firestore, 'notifications');
      await addDoc(notifRef, {
        ...formData,
        timestamp: serverTimestamp(),
        userId: user?.uid || 'admin'
      });

      toast({ title: "Notification In-App envoyée !", description: "Le message est désormais visible sur le flux communautaire." });
      setFormData({
        title: '',
        message: '',
        type: 'system_alert',
        link: ''
      });
    } catch (error) {
      console.error("Error sending notification:", error);
      toast({ title: "Erreur", description: "Impossible d'envoyer la notification.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBroadcastEmail = async () => {
    if (!formData.title || !formData.message) {
      toast({ title: "Champs requis", description: "Veuillez remplir le titre et le message avant de diffuser.", variant: "destructive" });
      return;
    }

    setIsBroadcastingEmail(true);
    try {
      const result = await broadcastEmailAction({
        title: formData.title,
        message: formData.message,
        userName: user?.displayName || "Administrateur K-Flow",
        type: 'alert',
        idToken: (await user?.getIdToken()) ?? ''
      });

      if (result.success) {
        toast({ title: "E-mail diffusé !", description: "Le message a été envoyé à tous les membres de la communauté." });
      } else {
        toast({ title: "Échec de diffusion", description: result.error || "Une erreur est survenue lors de l'envoi groupé.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Email broadcast error:", error);
      toast({ title: "Erreur technique", description: "Impossible de lancer la diffusion e-mail.", variant: "destructive" });
    } finally {
      setIsBroadcastingEmail(false);
    }
  };

  const handleTestEmail = async () => {
    setIsTestingEmail(true);
    try {
      const result = await sendTestEmailAction((await user?.getIdToken()) ?? '');
      if (result.success) {
        toast({ title: "E-mail de test envoyé !", description: "Vérifiez la boîte drnduwa@gmail.com." });
      } else {
        toast({ title: "Échec SMTP", description: result.error || "Erreur inconnue.", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Erreur technique", description: "L'action serveur n'a pas répondu.", variant: "destructive" });
    } finally {
      setIsTestingEmail(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <Bell className="text-primary h-8 w-8" />
            Centre de Diffusion
          </h1>
          <p className="text-muted-foreground font-medium">Envoyez des alertes en temps réel à tous les Kinois.</p>
        </div>
        
        <Button 
          variant="outline" 
          onClick={handleTestEmail} 
          disabled={isTestingEmail}
          className="rounded-xl border-2 font-bold h-11 px-6 gap-2"
        >
          {isTestingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4 text-emerald-600" />}
          Test SMTP
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Alert variant="default" className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-800 font-bold">In-App</AlertTitle>
          <AlertDescription className="text-blue-700 text-xs">
            Publie un message dans le flux "Radio Trottoir" visible par tous les utilisateurs connectés.
          </AlertDescription>
        </Alert>

        <Alert variant="default" className="bg-emerald-50 border-emerald-200">
          <Zap className="h-4 w-4 text-emerald-600" />
          <AlertTitle className="text-emerald-800 font-bold">E-mail Global</AlertTitle>
          <AlertDescription className="text-emerald-700 text-xs">
            Envoie une notification e-mail à tous les membres inscrits dans la base de données.
          </AlertDescription>
        </Alert>
      </div>

      <Card className="border-none shadow-xl rounded-[2rem] overflow-hidden">
        <CardHeader className="bg-primary p-8 text-white">
          <CardTitle className="text-xl">Rédiger une alerte</CardTitle>
          <CardDescription className="text-primary-foreground/80">Remplissez les informations ci-dessous pour diffuser.</CardDescription>
        </CardHeader>
        <CardContent className="p-8">
          <form onSubmit={handleSubmitInApp} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">Titre de l'alerte</label>
              <Input 
                placeholder="Ex: Travaux sur le Blvd du 30 Juin" 
                value={formData.title}
                onChange={e => setFormData({...formData, title: e.target.value})}
                className="h-12 rounded-xl border-2"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">Type de message</label>
              <Select 
                value={formData.type} 
                onValueChange={(v: any) => setFormData({...formData, type: v})}
              >
                <SelectTrigger className="h-12 rounded-xl border-2">
                  <SelectValue placeholder="Choisir un type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system_alert">Alerte Système / IA</SelectItem>
                  <SelectItem value="traffic_report">Info Trafic</SelectItem>
                  <SelectItem value="user_joined">Annonce Communauté</SelectItem>
                  <SelectItem value="video_added">Nouvelle Vidéo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">Message</label>
              <Textarea 
                placeholder="Décrivez l'événement..." 
                value={formData.message}
                onChange={e => setFormData({...formData, message: e.target.value})}
                className="min-h-[120px] rounded-xl border-2 resize-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">Lien optionnel (URL ou Page)</label>
              <Input 
                placeholder="Ex: /reports ou https://..." 
                value={formData.link}
                onChange={e => setFormData({...formData, link: e.target.value})}
                className="h-12 rounded-xl border-2"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
              <Button type="submit" disabled={isSubmitting || isBroadcastingEmail} className="h-14 rounded-2xl text-sm font-black shadow-lg shadow-primary/20">
                {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
                Diffuser In-App
              </Button>
              <Button 
                type="button" 
                variant="outline"
                onClick={handleBroadcastEmail}
                disabled={isSubmitting || isBroadcastingEmail} 
                className="h-14 rounded-2xl text-sm font-black border-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50 shadow-lg shadow-emerald-100"
              >
                {isBroadcastingEmail ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Users className="mr-2 h-5 w-5" />}
                Diffuser par E-mail
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="p-6 bg-slate-100/50 rounded-[2rem] border-2 border-dashed border-slate-200">
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Aide Technique</p>
        <ul className="space-y-3 text-[11px] font-bold text-slate-500 leading-relaxed">
          <li className="flex gap-3"><span className="text-primary">1.</span> La diffusion <strong>In-App</strong> écrit directement dans Firestore et notifie les utilisateurs en ligne.</li>
          <li className="flex gap-3"><span className="text-primary">2.</span> La diffusion <strong>E-mail</strong> parcourt tous les profils utilisateurs pour envoyer une version HTML du message.</li>
          <li className="flex gap-3"><span className="text-primary">3.</span> Assurez-vous d'avoir testé le SMTP avant de lancer une diffusion globale à des centaines d'utilisateurs.</li>
        </ul>
      </div>
    </div>
  );
}
