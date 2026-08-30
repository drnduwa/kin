'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bot, Send, User, Loader2, Volume2, Star, VolumeX, Mic, MicOff, MessageCircle } from 'lucide-react';
import { askAssistantAction, generateSpeechAction } from '@/app/actions';
import { useUser, useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { doc, runTransaction, serverTimestamp, collection } from 'firebase/firestore';
import { STAR_COSTS, UserProfile } from '@/lib/types';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export default function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeakingId, setIsSpeakingId] = useState<number | null>(null);
  const [isVocalModeActive, setIsVocalModeActive] = useState(false);
  
  const { user, firestore } = useFirebase();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const whatsappBusinessUrl = "https://wa.me/243892293178";

  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: profile } = useDoc<UserProfile>(userRef);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleSpeech = async (index: number, text: string) => {
    if (isSpeakingId === index) {
      if (audioRef.current) audioRef.current.pause();
      setIsSpeakingId(null);
      return;
    }

    setIsSpeakingId(index);
    try {
      if (audioRef.current) audioRef.current.pause();
      const result = await generateSpeechAction(text);
      if (!result || !result.media) throw new Error('Données audio manquantes');
      
      const audio = new Audio(result.media);
      audioRef.current = audio;
      audio.play().catch(e => {
        console.error("Playback error:", e);
        setIsSpeakingId(null);
      });
      audio.onended = () => setIsSpeakingId(null);
    } catch (error: any) {
      toast({ title: "Erreur audio", description: error.message, variant: "destructive" });
      setIsSpeakingId(null);
    }
  };
  
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user || !profile) return;

    if (profile.currentStarsBalance < STAR_COSTS.AI_MESSAGE) {
        toast({
            title: "Solde insuffisant",
            description: `Un message coûte ${STAR_COSTS.AI_MESSAGE} stars.`,
            variant: "destructive",
            action: <Button asChild variant="outline" size="sm"><Link href="/mes-stars">Recharger</Link></Button>
        });
        return;
    }

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);

    try {
      await runTransaction(firestore, async (transaction) => {
          const userDoc = await transaction.get(userRef!);
          const data = userDoc.data() as UserProfile;
          const newBalance = data.currentStarsBalance - STAR_COSTS.AI_MESSAGE;
          
          transaction.update(userRef!, {
              currentStarsBalance: newBalance,
              totalStarsUsed: (data.totalStarsUsed || 0) + STAR_COSTS.AI_MESSAGE
          });

          const starTransRef = doc(collection(userRef!, 'star_transactions'));
          transaction.set(starTransRef, {
              userId: user.uid,
              type: 'spent',
              starsChange: -STAR_COSTS.AI_MESSAGE,
              balanceAfterTransaction: newBalance,
              description: "Message Assistant Vocal",
              timestamp: serverTimestamp(),
          });
      });

      const result = await askAssistantAction({ question: currentInput });
      const assistantMessage: Message = { role: 'assistant', content: result.answer };
      
      setMessages(prev => {
          const updated = [...prev, assistantMessage];
          // Auto-play if vocal mode is on
          if (isVocalModeActive) {
            handleSpeech(updated.length - 1, assistantMessage.content);
          }
          return updated;
      });
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = { role: 'assistant', content: "Désolé, je rencontre un problème de connexion. Vérifiez votre connexion internet." };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full h-full min-h-0 flex justify-center items-center p-1 sm:p-2 md:p-4">
      <Card className="w-full max-w-3xl h-full min-h-0 flex flex-col shadow-2xl border-none rounded-2xl md:rounded-[2rem] overflow-hidden bg-white">
        <CardHeader className="border-b bg-slate-50/80 backdrop-blur-sm p-4 md:p-6">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar className="h-12 w-12 ring-4 ring-primary/10 shadow-lg">
                    <AvatarFallback className="bg-primary text-primary-foreground"><Bot className="h-6 w-6" /></AvatarFallback>
                  </Avatar>
                  {isSpeakingId !== null && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
                    </span>
                  )}
                </div>
                <div className="flex flex-col">
                    <span className="text-xl font-black tracking-tight text-slate-900">K-Flow Assistant</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Version Vocale Live</span>
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-white/50 px-3 py-1.5 rounded-full border border-slate-200">
                    <Label htmlFor="vocal-mode" className="text-[10px] font-black uppercase text-slate-500 cursor-pointer select-none">Mode Auto</Label>
                    <Switch 
                        id="vocal-mode" 
                        checked={isVocalModeActive} 
                        onCheckedChange={setIsVocalModeActive}
                        className="data-[state=checked]:bg-emerald-500"
                    />
                </div>
                <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200 font-black h-8 px-4 rounded-full hidden sm:flex">
                    <Star className="h-3 w-3 mr-1.5 fill-amber-500 text-amber-500" />
                    {STAR_COSTS.AI_MESSAGE} ⭐
                </Badge>
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden p-0">
          <ScrollArea className="flex-1 px-4 md:px-8 py-6">
            <div className="space-y-8">
              {messages.length === 0 && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                      <div className="bg-primary/5 p-8 rounded-[2.5rem] relative">
                        <div className="absolute inset-0 bg-primary/5 rounded-[2.5rem] animate-ping opacity-20"></div>
                        <Bot className="h-16 w-16 text-primary" />
                      </div>
                      <div className="max-w-xs space-y-2">
                        <p className="text-2xl font-black text-slate-900 tracking-tight">"Ndenge nini? Naza K-Flow."</p>
                        <p className="text-sm text-slate-500 font-medium leading-relaxed italic">
                          Je cherche les meilleurs chemins pour vous. Activez le mode auto pour m'écouter en conduisant !
                        </p>
                        <div className="pt-6">
                          <Button asChild variant="outline" className="rounded-full border-emerald-200 text-emerald-600 hover:bg-emerald-50 gap-2">
                            <a href={whatsappBusinessUrl} target="_blank" rel="noopener noreferrer">
                              <MessageCircle className="h-4 w-4" />
                              Parler à un humain
                            </a>
                          </Button>
                        </div>
                      </div>
                  </motion.div>
              )}
              
              <AnimatePresence>
                {messages.map((message, index) => (
                  <motion.div 
                    key={index} 
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className={cn('flex items-start gap-3', message.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    {message.role === 'assistant' && (
                      <Avatar className="h-10 w-10 border-2 border-slate-100 shadow-sm shrink-0">
                        <AvatarFallback className="bg-slate-50 text-slate-600"><Bot className="h-5 w-5" /></AvatarFallback>
                      </Avatar>
                    )}
                    <div className={cn(
                      'max-w-[85%] rounded-[1.5rem] p-5 text-sm md:text-base relative group shadow-sm transition-all',
                      message.role === 'user' 
                        ? 'bg-primary text-primary-foreground rounded-tr-none shadow-primary/20 font-medium' 
                        : 'bg-slate-50 border border-slate-100 text-slate-700 leading-relaxed'
                    )}>
                      {message.content}
                      {message.role === 'assistant' && (
                          <div className="mt-3 pt-3 border-t border-slate-200 flex justify-end">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className={cn(
                                  "rounded-full h-10 px-4 gap-2 transition-all font-bold",
                                  isSpeakingId === index ? "bg-emerald-100 text-emerald-700" : "hover:bg-primary/10 text-primary"
                                )} 
                                onClick={() => handleSpeech(index, message.content)} 
                                disabled={isSpeakingId !== null && isSpeakingId !== index}
                              >
                                  {isSpeakingId === index ? (
                                    <>
                                      <VolumeX className="h-4 w-4" />
                                      <span className="text-xs uppercase tracking-widest">Stop</span>
                                    </>
                                  ) : (
                                    <>
                                      <Volume2 className="h-4 w-4" />
                                      <span className="text-xs uppercase tracking-widest">Écouter</span>
                                    </>
                                  )}
                              </Button>
                          </div>
                      )}
                    </div>
                    {message.role === 'user' && (
                      <Avatar className="h-10 w-10 border-2 border-primary/20 shadow-sm shrink-0">
                        <AvatarImage src={user?.photoURL ?? ''} />
                        <AvatarFallback className="bg-primary/5 text-primary"><User className="h-5 w-5" /></AvatarFallback>
                      </Avatar>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {isLoading && (
                <div className="flex items-start gap-3 justify-start animate-pulse">
                    <Avatar className="h-10 w-10 border shadow-sm">
                      <AvatarFallback className="bg-slate-50"><Bot className="h-5 w-5 text-slate-400" /></AvatarFallback>
                    </Avatar>
                    <div className="bg-slate-50 border border-slate-100 p-5 rounded-[1.5rem] rounded-tl-none min-w-[120px]">
                        <div className="flex gap-1.5 justify-center">
                            <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                            <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                            <span className="w-2 h-2 bg-primary rounded-full animate-bounce"></span>
                        </div>
                    </div>
                </div>
              )}
            </div>
            <div ref={messagesEndRef} />
          </ScrollArea>
          
          <div className="px-4 md:px-8 pb-4 md:pb-8 pt-2">
            <div className="bg-slate-900 rounded-[2rem] p-2 flex items-center gap-2 shadow-2xl">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ex: Quel est le trajet le plus rapide vers la Gombe?"
                disabled={isLoading}
                className="flex-1 h-14 bg-transparent border-none text-white font-bold placeholder:text-slate-500 focus-visible:ring-0 px-6"
                onKeyDown={e => e.key === 'Enter' && handleSendMessage(e)}
              />
              <Button 
                type="submit" 
                size="icon" 
                onClick={handleSendMessage}
                className="h-12 w-12 rounded-[1.25rem] bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-95" 
                disabled={isLoading || !input.trim()}
              >
                <Send className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex items-center justify-between px-6 pt-3">
              <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                  - {STAR_COSTS.AI_MESSAGE} stars par étude
              </p>
              <div className="flex items-center gap-3">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                      Solde: <span className="text-primary">{profile?.currentStarsBalance || 0} ⭐</span>
                  </p>
                  <a href={whatsappBusinessUrl} target="_blank" rel="noopener noreferrer" className="text-[9px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1 hover:underline">
                      <MessageCircle className="h-3 w-3" /> Aide humaine
                  </a>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
