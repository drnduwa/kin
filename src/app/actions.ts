
"use server";

import { getTrafficTips } from "@/ai/flows/traffic-tips-flow";
import { askAssistant } from "@/ai/flows/assistant-flow";
import { generateSpeech } from "@/ai/flows/tts-flow";
import { getStrategicInsights } from "@/ai/flows/strategic-insights-flow";
import { TrafficTipsInput, AssistantInput, PushSubscription, StrategicInsightsInput, StrategicInsightsOutput, RoadConditionReport } from "@/lib/types";
import * as webpush from 'web-push';
import * as nodemailer from 'nodemailer';
import { initializeFirebase } from "@/firebase";
import { collection, getDocs, query, where, Timestamp, limit } from "firebase/firestore";
import { CONFIG } from "@/lib/config";

const GOOGLE_API_KEY = CONFIG.GOOGLE_MAPS_API_KEY;

/**
 * Cache simple pour éviter les appels API redondants (90 secondes)
 */
const trafficCache = new Map<string, { data: any, expires: number }>();

export async function checkTrafficAction(input: { lat: number, lng: number, address?: string }) {
    const cacheKey = `${input.lat.toFixed(4)}-${input.lng.toFixed(4)}`;
    const now = Date.now();

    if (trafficCache.has(cacheKey) && trafficCache.get(cacheKey)!.expires > now) {
        return trafficCache.get(cacheKey)!.data;
    }

    try {
        // 1. Initialisation Firebase prudente sur le serveur
        let localReport = null;
        try {
            const { firestore } = initializeFirebase();
            const reportsQuery = query(
                collection(firestore, 'road_condition_reports'),
                where('status', '==', 'active'),
                limit(10)
            );
            const reportsSnap = await getDocs(reportsQuery);
            const recentReports = reportsSnap.docs.map(d => d.data() as RoadConditionReport);
            // Recherche de rapports dans un rayon de ~1.5km (Précision accrue)
            localReport = recentReports.find(r => 
                Math.abs(r.coords.lat - input.lat) < 0.015 && 
                Math.abs(r.coords.lng - input.lng) < 0.015
            );
        } catch (dbError) {
            console.warn("[TrafficCheck] Firestore bypass:", dbError);
        }

        // 2. Appel à Google Routes API v2
        // Sondage de ~1.5km pour une portion de route significative
        const url = "https://routes.googleapis.com/directions/v2:computeRoutes";
        const body = {
            origin: { location: { latLng: { latitude: input.lat, longitude: input.lng } } },
            destination: { location: { latLng: { latitude: input.lat + 0.015, longitude: input.lng + 0.015 } } },
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_AWARE_OPTIMAL",
            computeAlternativeRoutes: true,
            languageCode: "fr-FR"
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': GOOGLE_API_KEY,
                'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters,routes.description'
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const errorBody = await res.text();
            throw new Error(`Google API Error: ${res.status}`);
        }

        const data = await res.json();
        const route = data?.routes?.[0];
        
        let result: any = {
            status: "INCONNU",
            verdict: "Analyse en cours — soyez prudent sur cet axe.",
            lingala: "Tozali kotala nzela — keba na tamboli na yo.",
            delay: 0,
            ratio: 1,
            alternatives: []
        };

        if (route) {
            const dur = parseInt((route.duration ?? "0s").replace('s', '')) || 1;
            const statDur = parseInt((route.staticDuration ?? route.duration ?? "0s").replace('s', '')) || 1;
            const ratio = dur / statDur;
            const delay = Math.round(Math.max(0, dur - statDur) / 60);

            // Ajustement des seuils de sensibilité pour Kinshasa (Précision accrue)
            // Un ratio > 1.6 ou un retard de 5 min sur une courte distance indique souvent un blocage
            if (ratio > 1.6 || delay >= 5) result.status = "BLOQUÉ";
            else if (ratio > 1.25 || delay >= 2) result.status = "EMBOUTEILLÉ";
            else if (ratio > 1.1 || delay >= 1) result.status = "MODÉRÉ";
            else result.status = "FLUIDE";

            if (localReport) {
                result.verdict = `Signalement communautaire : ${localReport.description}`;
                result.lingala = "Bato balobi nzela eza pasi, keba mingi.";
            } else {
                if (result.status === "FLUIDE") {
                    result.verdict = "Axe fluide : Circulation libre constatée.";
                    result.lingala = "Nzela eza kitoko, kotambola eza pasi te.";
                } else if (result.status === "MODÉRÉ") {
                    result.verdict = `Trafic modéré : Prévoyez un ralentissement de ${delay || 1} min.`;
                    result.lingala = "Nzela eza pasi moke, zela mwa moke.";
                } else {
                    result.verdict = `${input.address || 'Cet axe'} est actuellement ${result.status.toLowerCase()} (Retard estimé : ${delay} min).`;
                    result.lingala = "Nzela eza bloqué, luka nzela mosusu soki likoki eza.";
                }
            }

            result.delay = delay;
            result.ratio = ratio;

            if (data.routes.length > 1) {
                result.alternatives = data.routes.slice(1, 3).map((r: any) => ({
                    description: r.description || "Itinéraire bis",
                    duration: Math.round(parseInt((r.duration || "0s").replace('s', '')) / 60) + " min"
                }));
            }
        }

        trafficCache.set(cacheKey, { data: result, expires: now + 90000 });
        return result;

    } catch (e: any) {
        console.error("Critical Traffic Check Error:", e);
        return { 
            status: "ERREUR", 
            verdict: `Erreur d'analyse : ${e.message || "Service indisponible."}`,
            lingala: "Pasi mwa moke na machine, zela moke."
        };
    }
}

export async function getGoogleTrafficStatusAction(axes: any[]) {
    try {
        const results = await Promise.all(axes.map(async (axis) => {
            try {
                const url = "https://routes.googleapis.com/directions/v2:computeRoutes";
                const body = {
                    origin: { location: { latLng: { latitude: axis.origin.lat, longitude: axis.origin.lng } } },
                    destination: { location: { latLng: { latitude: axis.destination.lat, longitude: axis.destination.lng } } },
                    travelMode: "DRIVE",
                    routingPreference: "TRAFFIC_AWARE_OPTIMAL",
                    languageCode: "fr-FR"
                };

                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': GOOGLE_API_KEY,
                        'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters'
                    },
                    body: JSON.stringify(body)
                });

                const data = await res.json();
                const route = data?.routes?.[0];
                
                if (!route) return { road: axis.name, status: "INCONNU", speed: 0, delay: 0 };

                const dur = parseInt((route.duration ?? "0s").replace('s', '')) || 1;
                const statDur = parseInt((route.staticDuration ?? route.duration ?? "0s").replace('s', '')) || 1;
                const ratio = dur / statDur;
                const delay = Math.round(Math.max(0, dur - statDur) / 60);
                const distKm = (route.distanceMeters / 1000) || 1;
                const speed = Math.round(distKm / (dur / 3600));

                let status = "FLUIDE";
                if (ratio > 1.7 || delay > 8) status = "EMBOUTEILLAGE";
                else if (ratio > 1.3 || delay > 3) status = "DENSE";
                else if (ratio > 1.1 || delay > 1) status = "MODÉRÉ";

                return { road: axis.name, status, speed, delay };
            } catch (e) {
                return { road: axis.name, status: "INCONNU", speed: 0, delay: 0 };
            }
        }));
        
        return results;
    } catch (globalError) {
        console.error("Global Traffic Action Error:", globalError);
        return axes.map(a => ({ road: a.name, status: "INCONNU", speed: 0, delay: 0 }));
    }
}

export async function getTrafficTipsAction(input: TrafficTipsInput) {
    try {
        return await getTrafficTips(input);
    } catch (e) {
        console.error("Traffic Tips Error:", e);
        return { tips: ["Restez vigilant", "Vérifiez votre GPS"] };
    }
}

export async function askAssistantAction(input: AssistantInput) {
    try {
        return await askAssistant(input);
    } catch (e) {
        console.error("Assistant Error:", e);
        return { answer: "Désolé, je rencontre une difficulté technique. Réessayez dans un instant." };
    }
}

export async function generateSpeechAction(text: string) {
    try {
        return await generateSpeech(text);
    } catch (error: any) {
        console.error('generateSpeechAction error:', error);
        throw new Error(error.message || "Erreur lors de la génération vocale.");
    }
}

export async function getStrategicInsightsAction(input: StrategicInsightsInput): Promise<StrategicInsightsOutput> {
  try {
    const result = await getStrategicInsights(input);
    if (!result) throw new Error("No data returned from AI flow");
    return result;
  } catch (error: any) {
    console.error("Strategic Insights Action Error:", error);
    return {
      globalAdvice: "Analyse momentanément indisponible. Restez prudents sur les routes.",
      tips: ["Vérifiez vos rétroviseurs", "Gardez vos distances de sécurité", "Évitez les axes saturés"],
      trend: "stable" as const
    };
  }
}

export async function sendTestPushNotificationAction(subscription: PushSubscription, payload: string) {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    return { success: false, error: "VAPID keys are not configured." };
  }

  try {
    webpush.setVapidDetails('mailto:drnduwa@gmail.com', vapidPublicKey, vapidPrivateKey);
    await webpush.sendNotification(subscription as any, payload);
    return { success: true };
  } catch (error: any) {
    console.error("Push Notification Error:", error);
    return { success: false, error: error.message };
  }
}

export async function sendTestEmailAction() {
  const smtpUser = "kinshasaflow@gmail.com";
  const smtpPass = "mqlt yrzr xnjv tkvb"; 

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const mailOptions = {
    from: `"Kinshasa Flow Admin" <${smtpUser}>`,
    to: "drnduwa@gmail.com",
    subject: "🧪 Test de Notification E-mail K-Flow",
    html: `
      <div style="font-family: sans-serif; padding: 20px;">
        <h1 style="color: #248eeb;">Test SMTP Réussi !</h1>
        <p>Si vous recevez ce message, c'est que votre tunnel e-mail est parfaitement configuré pour Kinshasa Flow.</p>
        <p>Horodatage : ${new Date().toLocaleString()}</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error: any) {
    console.error('[SMTP Test] Error:', error);
    return { success: false, error: error.message };
  }
}

export async function broadcastEmailAction(params: { 
  title: string, 
  message: string, 
  userName: string,
  type: 'chat' | 'alert' | 'hazard' | 'report',
  location?: string
}) {
  const smtpUser = "kinshasaflow@gmail.com";
  const smtpPass = "mqlt yrzr xnjv tkvb"; 

  // Initialisation dynamique des destinataires
  let recipientList: string[] = ['drnduwa@gmail.com']; 
  
  try {
    const { firestore } = initializeFirebase();
    const usersSnap = await getDocs(collection(firestore, 'users'));
    
    if (!usersSnap.empty) {
        const userEmails = usersSnap.docs
          .map(doc => doc.data().email)
          .filter(email => email && email.includes('@') && email !== 'drnduwa@gmail.com');
        
        // On fusionne et on dédoublonne
        recipientList = Array.from(new Set([...recipientList, ...userEmails]));
    }
  } catch (e) {
    console.warn("[Email Broadcast] Impossible de lister les utilisateurs pour la diffusion globale.", e);
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: smtpUser, pass: smtpPass },
    pool: true, // Utilisation d'un pool pour les envois multiples
  });

  const isAlert = ['alert', 'hazard', 'report'].includes(params.type);
  const subjectPrefix = isAlert ? '🚨 ALERTE K-FLOW' : '💬 K-FLOW CHAT';
  const locationStr = params.location ? ` à ${params.location}` : '';

  const mailOptions = {
    from: `"Kinshasa Flow" <${smtpUser}>`,
    to: "kinshasaflow@gmail.com", // Destinataire principal générique
    bcc: recipientList, // Copie cachée à TOUS les utilisateurs
    subject: `${subjectPrefix} : ${params.title}${locationStr}`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; color: #1e293b; background-color: #f8fafc;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
          <div style="background-color: ${isAlert ? '#ef4444' : '#248eeb'}; padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; letter-spacing: -1px;">Kinshasa Flow</h1>
            <p style="color: #ffffff; opacity: 0.8; margin: 5px 0 0; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
              ${isAlert ? 'Alerte Prioritaire' : 'Nouveau Message Chat'}
            </p>
          </div>
          <div style="padding: 40px;">
            <h2 style="color: #1e293b; margin-top: 0; font-size: 20px; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px;">${params.title}</h2>
            <div style="margin: 25px 0; background-color: #f8fafc; padding: 20px; border-radius: 12px; border-left: 4px solid ${isAlert ? '#ef4444' : '#248eeb'};">
                <p style="margin: 0; font-size: 16px; color: #334155; font-style: italic; line-height: 1.6;">"${params.message}"</p>
            </div>
            <p style="margin-bottom: 5px; font-size: 14px; color: #64748b;"><strong>Auteur :</strong> ${params.userName}</p>
            ${params.location ? `<p style="font-size: 14px; color: #64748b;"><strong>Localisation :</strong> ${params.location}</p>` : ''}
            <div style="text-align: center; margin-top: 40px;">
              <a href="https://kinshasaflow.online" style="background-color: ${isAlert ? '#ef4444' : '#248eeb'}; color: #ffffff; padding: 18px 30px; text-decoration: none; border-radius: 14px; font-weight: 900; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">Ouvrir l'application</a>
            </div>
          </div>
          <div style="padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #fafafa;">
            Communauté Kinshasa Flow - Radio Trottoir Live.<br/>
            <em>Ceci est une notification automatique, merci de ne pas y répondre.</em>
          </div>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error: any) {
    console.error('[Email Broadcast] SMTP Error:', error);
    return { success: false, error: error.message };
  }
}

export async function sendWelcomeEmailAction(params: { email: string, userName: string }) {
  const smtpUser = "kinshasaflow@gmail.com";
  const smtpPass = "mqlt yrzr xnjv tkvb"; 

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const mailOptions = {
    from: `"Kinshasa Flow" <${smtpUser}>`,
    to: params.email,
    subject: `Bienvenue sur Kinshasa Flow, ${params.userName} ! 🌟`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; color: #1e293b; background-color: #f8fafc;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
          <div style="background-color: #248eeb; padding: 40px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; letter-spacing: -1px;">Bienvenue !</h1>
          </div>
          <div style="padding: 40px; text-align: center;">
            <h2 style="color: #1e293b; margin-top: 0;">Merci de nous rejoindre, ${params.userName}</h2>
            <p style="font-size: 16px; color: #64748b; line-height: 1.6;">
              Nous sommes ravis de vous compter parmi les membres de <strong>Kinshasa Flow</strong>. 
              Ensemble, nous allons rendre la circulation à Kinshasa plus fluide et moins stressante.
            </p>
            <div style="margin: 30px 0; padding: 20px; background-color: #f0f9ff; border-radius: 16px;">
                <p style="margin: 0; font-weight: bold; color: #248eeb;">Cadeau de bienvenue : +25 Stars ⭐</p>
                <p style="margin: 5px 0 0; font-size: 12px; color: #64748b;">Utilisez-les pour consulter le trafic premium ou poser des questions à l'IA.</p>
            </div>
            <a href="https://kinshasaflow.online" style="background-color: #248eeb; color: #ffffff; padding: 18px 30px; text-decoration: none; border-radius: 14px; font-weight: 900; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(36, 142, 235, 0.3);">DÉCOUVRIR L'APPLICATION</a>
          </div>
          <div style="padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #fafafa;">
            Kinshasa Flow - Swazi Appli Lab sarl.<br/>
            <em>Ceci est un message de bienvenue automatique.</em>
          </div>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error: any) {
    console.error('[Welcome Email] Error:', error);
    return { success: false, error: error.message };
  }
}

export async function sendAlertEmailAction(params: { type: string, location: string, userName: string }) {
  return broadcastEmailAction({
      title: params.type.toUpperCase(),
      message: `${params.type} signalé par ${params.userName}`,
      userName: params.userName,
      type: 'alert',
      location: params.location
  });
}

export async function initiateMbiyoPaymentAction(data: {
    amount: number;
    currency: string;
    phone: string;
    network: string;
    order_id: string;
}) {
    try {
        const phoneWithPlus = data.phone.startsWith('+') ? data.phone : `+${data.phone}`;
        const payload = {
            amount: data.amount,
            currency: data.currency,
            payment_method: "mobile_money",
            order_id: data.order_id,
            callback_url: "https://kinshasaflow.online/api/payment-callback",
            metadata: { network: data.network.toLowerCase(), phone_number: phoneWithPlus, country_code: "CD" }
        };

        const response = await fetch("https://dashboard.mbiyo.africa/api/v1/merchant/payin", {
            method: "POST",
            headers: { "Authorization": "Bearer COjbIMdkfbeZ8RJUH03oj0kNKJLzCK", "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) return { success: false, error: "Erreur serveur." };
        const result = await response.json();
        return { success: true, data: { id: result.data.id, status: result.data.status } };
    } catch (error) {
        return { success: false, error: "Connexion impossible." };
    }
}

export async function checkMbiyoTransactionStatusAction(transactionId: string) {
    try {
        const response = await fetch(`https://dashboard.mbiyo.africa/api/v1/merchant/transactions/${transactionId}`, {
            method: "GET",
            headers: { "Authorization": "Bearer COjbIMdkfbeZ8RJUH03oj0kNKJLzCK", "Content-Type": "application/json" }
        });
        const result = await response.json();
        return { success: true, data: { status: String(result.data.status).toLowerCase() } };
    } catch (error) {
        return { success: false, error: "Erreur réseau." };
    }
}
