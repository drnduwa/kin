
"use server";

import { getTrafficTips } from "@/ai/flows/traffic-tips-flow";
import { askAssistant } from "@/ai/flows/assistant-flow";
import { generateSpeech } from "@/ai/flows/tts-flow";
import { getStrategicInsights } from "@/ai/flows/strategic-insights-flow";
import { TrafficTipsInput, AssistantInput, PushSubscription, StrategicInsightsInput, StrategicInsightsOutput, RoadConditionReport, PaymentRecord, UserProfile } from "@/lib/types";
import * as webpush from 'web-push';
import * as nodemailer from 'nodemailer';
import { getServerFirestore } from "@/firebase/server";
import { collection, getDocs, query, where, Timestamp, limit, doc, getDoc, setDoc, updateDoc, runTransaction, serverTimestamp, addDoc } from "firebase/firestore";
import { CONFIG } from "@/lib/config";
import { initiateFlexPayMobileMoney, initiateFlexPayCard, checkFlexPayTransactionStatus, detectDRCOperator } from "@/lib/flexpay";

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
            const firestore = getServerFirestore();
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

                const result = { road: axis.name, status, speed, delay };

                // Enregistrement passif dans traffic_history pour alimenter le modèle d'apprentissage IA
                try {
                    const firestore = getServerFirestore();
                    const now = new Date();
                    addDoc(collection(firestore, 'traffic_history'), {
                        road: axis.name,
                        status,
                        speed,
                        delay,
                        dayOfWeek: now.getDay(),
                        hourOfDay: now.getHours(),
                        timestamp: serverTimestamp()
                    }).catch(() => {});
                } catch (logErr) {
                    // Silencieux pour ne pas impacter le flux principal
                }

                return result;
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
  const smtpPass = "dazr vpou tslb tsok"; 

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
  location?: string,
  recipientEmails?: string[]
}) {
  const smtpUser = "kinshasaflow@gmail.com";
  const smtpPass = "dazr vpou tslb tsok"; 

  // Initialisation dynamique des destinataires
  let recipientList: string[] = ['drnduwa@gmail.com']; 
  
  if (params.recipientEmails && params.recipientEmails.length > 0) {
      recipientList = Array.from(new Set([...recipientList, ...params.recipientEmails]));
  } else {
      try {
        const firestore = getServerFirestore();
        const usersSnap = await getDocs(collection(firestore, 'users'));
        
        if (!usersSnap.empty) {
            const userEmails = usersSnap.docs
              .map(doc => doc.data().email)
              .filter(email => email && email.includes('@') && !email.endsWith('@kinshasaflow.online') && email !== 'drnduwa@gmail.com');
            
            // On fusionne et on dédoublonne
            recipientList = Array.from(new Set([...recipientList, ...userEmails]));
        }
      } catch (e) {
        console.warn("[Email Broadcast] Impossible de lister les utilisateurs pour la diffusion globale sur le serveur.", e);
      }
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
  const smtpPass = "dazr vpou tslb tsok"; 

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

export async function sendRelanceGiftEmailAction(recipientEmails: string[]) {
  const smtpUser = process.env.SMTP_USER || "kinshasaflow@gmail.com";
  const smtpPass = (process.env.SMTP_PASS || "jrgl kgjl qlqj vmfc").replace(/"/g, '');

  if (!recipientEmails || recipientEmails.length === 0) {
    return { success: false, error: "Aucun email destinataire spécifié." };
  }

  // Filtrer et dédoublonner les emails valides
  const cleanEmails = Array.from(new Set(
    recipientEmails
      .filter(e => e && e.includes('@') && !e.endsWith('@kinshasaflow.online'))
  ));

  if (cleanEmails.length === 0) {
    return { success: false, error: "Aucun email valide trouvé." };
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const mailOptions = {
    from: `"Kinshasa Flow" <${smtpUser}>`,
    to: smtpUser, // Destinataire principal
    bcc: cleanEmails, // Copie cachée à tous les utilisateurs
    subject: "🎁 Cadeau Spécial : 25 Stars Offertes sur votre compte Kinshasa Flow !",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: #1e293b; background-color: #f8fafc;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.08);">
          <div style="background-color: #248eeb; padding: 36px 20px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px;">🎁 Cadeau Spécial K-Flow</h1>
            <p style="color: #ffffff; opacity: 0.9; margin: 8px 0 0; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
              25 Stars Créditées sur votre compte
            </p>
          </div>
          <div style="padding: 36px 24px; text-align: center;">
            <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 800;">Profitez de vos 25 Stars gratuites ⭐</h2>
            <p style="font-size: 15px; color: #475569; line-height: 1.6; text-align: left; margin: 16px 0;">
              Chère communauté de <strong>Kinshasa Flow</strong>,
            </p>
            <p style="font-size: 15px; color: #475569; line-height: 1.6; text-align: left; margin: 16px 0;">
              Pour vous remercier de votre fidélité et vous faire découvrir toutes les nouveautés de l'application, nous avons le plaisir de vous offrir <strong>25 Stars gratuites</strong> !
            </p>

            <div style="margin: 28px 0; padding: 22px; background-color: #f0f9ff; border-radius: 18px; text-align: left; border: 1px solid #bae6fd;">
              <h3 style="color: #0369a1; margin: 0 0 12px 0; font-size: 15px; font-weight: 800;">🚀 Ce que vous pouvez faire dès maintenant :</h3>
              <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 13px; line-height: 1.8;">
                <li><strong>Assistant Vocal IA</strong> : Posez vos questions d'itinéraires en Lingala et en Français.</li>
                <li><strong>GPS K-Flow Nav</strong> : Calculez le meilleur trajet pour contourner les embouteillages.</li>
                <li><strong>Radar de Circulation</strong> : Consultez l'état du trafic en temps réel sur les grands axes kinois.</li>
              </ul>
            </div>

            <div style="margin: 20px 0; padding: 18px; background-color: #f8fafc; border-radius: 14px; text-align: left; border-left: 4px solid #248eeb;">
              <p style="margin: 0; font-size: 13px; color: #475569; line-height: 1.5;">
                💳 <strong>Nouveau :</strong> Rechargez vos Stars en toute simplicité ou activez un <strong>Pass Illimité (7 ou 30 jours)</strong> via <strong>FlexPay</strong> (Vodacom M-Pesa, Orange Money, Airtel Money, Afrimoney et Carte Bancaire Visa/Mastercard).
              </p>
            </div>

            <div style="text-align: center; margin-top: 32px;">
              <a href="https://kinshasaflow.online/mes-stars" style="background-color: #248eeb; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 14px; font-weight: 900; font-size: 15px; display: inline-block; box-shadow: 0 4px 14px rgba(36, 142, 235, 0.35);">
                DÉCOUVRIR MES 25 STARS EN DIRECT
              </a>
            </div>
          </div>
          <div style="padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #fafafa;">
            Kinshasa Flow • Swazi Appli Lab sarl.<br/>
            <em>Vous recevez ce message car vous êtes membre de la communauté Kinshasa Flow.</em>
          </div>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, count: cleanEmails.length, messageId: info.messageId };
  } catch (error: any) {
    console.error('[Relance Email] Error:', error);
    return { success: false, error: error.message };
  }
}

export async function fulfillFlexPayPayment(orderNumber: string): Promise<{ success: boolean; error?: string }> {
  try {
    const firestore = getServerFirestore();
    const paymentRef = doc(firestore, 'payments', orderNumber);
    
    let alreadySuccess = false;
    await runTransaction(firestore, async (transaction) => {
      const paymentSnap = await transaction.get(paymentRef);
      if (!paymentSnap.exists()) {
        throw new Error(`Paiement ${orderNumber} introuvable dans la base.`);
      }

      const paymentData = paymentSnap.data() as PaymentRecord;
      if (paymentData.status === 'success') {
        alreadySuccess = true;
        return;
      }

      const userRef = doc(firestore, 'users', paymentData.userId);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) {
        throw new Error(`Utilisateur ${paymentData.userId} introuvable.`);
      }

      const userData = userSnap.data() as UserProfile;

      // 1. Mettre à jour le statut du paiement
      transaction.update(paymentRef, {
        status: 'success',
        completedAt: serverTimestamp(),
      });

      // 2. Créditer les Stars ou activer le Pass Illimité
      if (paymentData.itemType === 'pack' && paymentData.stars) {
        const addedStars = Number(paymentData.stars);
        const newBalance = (userData.currentStarsBalance || 0) + addedStars;
        const newPurchased = (userData.totalStarsPurchased || 0) + addedStars;

        transaction.update(userRef, {
          currentStarsBalance: newBalance,
          totalStarsPurchased: newPurchased,
        });

        // Historique de transaction utilisateur
        const starTransRef = doc(collection(userRef, 'star_transactions'));
        transaction.set(starTransRef, {
          userId: paymentData.userId,
          type: 'purchase',
          starsChange: addedStars,
          balanceAfterTransaction: newBalance,
          description: `Achat Pack ${addedStars} Stars FlexPay (${paymentData.amount} ${paymentData.currency})`,
          relatedObjectId: orderNumber,
          relatedObjectType: 'flexpay_pack',
          timestamp: serverTimestamp(),
        });
      } else if (paymentData.itemType === 'pass' && paymentData.passType) {
        const daysToAdd = paymentData.passType === 'weekly' ? 7 : 30;
        let baseDate = new Date();
        if (userData.hasActivePass && userData.passExpiresAt) {
          const currentExpiry = userData.passExpiresAt.toDate ? userData.passExpiresAt.toDate() : new Date(userData.passExpiresAt);
          if (currentExpiry > baseDate) {
            baseDate = currentExpiry; // Prolonge l'abonnement en cours
          }
        }

        const newExpiryDate = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

        transaction.update(userRef, {
          hasActivePass: true,
          passExpiresAt: Timestamp.fromDate(newExpiryDate),
          passType: paymentData.passType,
        });

        const starTransRef = doc(collection(userRef, 'star_transactions'));
        transaction.set(starTransRef, {
          userId: paymentData.userId,
          type: 'purchase',
          starsChange: 0,
          balanceAfterTransaction: userData.currentStarsBalance || 0,
          description: `Activation Pass Illimité (${paymentData.passType === 'weekly' ? '7 Jours' : '30 Jours'})`,
          relatedObjectId: orderNumber,
          relatedObjectType: 'flexpay_pass',
          timestamp: serverTimestamp(),
        });
      }
    });

    return { success: true };
  } catch (err: any) {
    console.error(`[FlexPay] Erreur lors du fulfillment ${orderNumber}:`, err);
    return { success: false, error: err.message || 'Erreur lors du crédit de la commande.' };
  }
}

export async function initiateFlexPayPaymentAction(params: {
  userId: string;
  itemType: 'pack' | 'pass';
  itemId: string;
  stars?: number;
  passType?: 'weekly' | 'monthly';
  amount: number;
  currency: 'CDF' | 'USD';
  channel: 'mobile_money' | 'card';
  phone?: string;
}): Promise<{
  success: boolean;
  orderNumber?: string;
  reference?: string;
  url?: string;
  message?: string;
  error?: string;
}> {
  try {
    const reference = `KF_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    let result: { success: boolean; orderNumber?: string; url?: string; message?: string; error?: string };

    if (params.channel === 'mobile_money') {
      if (!params.phone) {
        return { success: false, error: 'Numéro de téléphone requis pour le paiement Mobile Money.' };
      }
      result = await initiateFlexPayMobileMoney({
        phone: params.phone,
        amount: params.amount,
        currency: params.currency,
        reference,
      });
    } else {
      result = await initiateFlexPayCard({
        amount: params.amount,
        currency: params.currency,
        reference,
        description: params.itemType === 'pass'
          ? `Pass Illimité Kinshasa Flow (${params.passType})`
          : `Pack ${params.stars} Stars Kinshasa Flow`,
      });
    }

    if (!result.success || !result.orderNumber) {
      return { success: false, error: result.error || 'Impossible d\'initier le paiement.' };
    }

    // Sauvegarder dans Firestore
    const firestore = getServerFirestore();
    const paymentRef = doc(firestore, 'payments', result.orderNumber);
    const network = params.phone ? detectDRCOperator(params.phone) : undefined;

    await setDoc(paymentRef, {
      id: result.orderNumber,
      orderNumber: result.orderNumber,
      reference,
      userId: params.userId,
      itemType: params.itemType,
      itemId: params.itemId,
      stars: params.stars || 0,
      passType: params.passType || null,
      amount: params.amount,
      currency: params.currency,
      channel: params.channel,
      network: network || null,
      phone: params.phone || null,
      status: 'pending',
      createdAt: serverTimestamp(),
    });

    return {
      success: true,
      orderNumber: result.orderNumber,
      reference,
      url: result.url,
      message: result.message,
    };
  } catch (err: any) {
    console.error('[FlexPay] Exception in initiateFlexPayPaymentAction:', err);
    return { success: false, error: err.message || 'Erreur lors de l\'initiation du paiement.' };
  }
}

export async function checkFlexPayStatusAction(orderNumber: string): Promise<{
  success: boolean;
  status: '0' | '1' | '2' | 'unknown';
  message?: string;
  fulfilled?: boolean;
  error?: string;
}> {
  try {
    const checkRes = await checkFlexPayTransactionStatus(orderNumber);
    if (!checkRes.success) {
      return { success: false, status: 'unknown', error: checkRes.error };
    }

    if (checkRes.status === '0') {
      const fulfillment = await fulfillFlexPayPayment(orderNumber);
      return {
        success: true,
        status: '0',
        message: 'Paiement confirmé avec succès ! Vos crédits sont activés.',
        fulfilled: fulfillment.success,
      };
    } else if (checkRes.status === '1') {
      const firestore = getServerFirestore();
      const paymentRef = doc(firestore, 'payments', orderNumber);
      await updateDoc(paymentRef, { status: 'failed', failedAt: serverTimestamp() }).catch(() => {});
      return {
        success: true,
        status: '1',
        message: 'La transaction a été annulée ou refusée.',
      };
    } else {
      return {
        success: true,
        status: '2',
        message: 'En attente de validation PIN...',
      };
    }
  } catch (err: any) {
    console.error('[FlexPay] Exception in checkFlexPayStatusAction:', err);
    return { success: false, status: 'unknown', error: err.message };
  }
}

import { TrafficForecast, HourlyForecast } from '@/lib/types';
import { MAJOR_AXES } from '@/lib/constants';

export async function getTrafficForecastAction(routeName: string): Promise<TrafficForecast> {
  const now = new Date();
  const currentHour = now.getHours();
  const currentDayOfWeek = now.getDay();
  
  // 1. État Actuel (Données en temps réel Google)
  const axis = MAJOR_AXES.find(a => a.name === routeName);
  let currentStatus: any = 'INCONNU';
  let currentDelay = 0;
  
  if (axis) {
    const liveData = await getGoogleTrafficStatusAction([axis]);
    if (liveData.length > 0) {
      currentStatus = liveData[0].status;
      currentDelay = liveData[0].delay;
    }
  }

  // Modèle heuristique par défaut calibré sur Kinshasa
  const heuristicStatus = (hour: number) => {
    if (hour >= 7 && hour <= 9) return { status: 'EMBOUTEILLAGE' as const, delay: 18 };
    if (hour >= 16 && hour <= 19) return { status: 'EMBOUTEILLAGE' as const, delay: 24 };
    if (hour >= 10 && hour <= 15) return { status: 'MODÉRÉ' as const, delay: 8 };
    if (hour >= 20 || hour <= 6) return { status: 'FLUIDE' as const, delay: 0 };
    return { status: 'DENSE' as const, delay: 12 };
  };

  // Convertir le retard moyen en statut textuel
  const delayToStatus = (delay: number): 'EMBOUTEILLAGE' | 'DENSE' | 'MODÉRÉ' | 'FLUIDE' => {
    if (delay >= 15) return 'EMBOUTEILLAGE';
    if (delay >= 8) return 'DENSE';
    if (delay >= 3) return 'MODÉRÉ';
    return 'FLUIDE';
  };

  // 2. Interrogation de l'historique Firestore pour chaque heure future
  const hourlyForecast: HourlyForecast[] = [];

  try {
    const firestore = getServerFirestore();
    const historyCol = collection(firestore, 'traffic_history');

    // Récupérer les données historiques enregistrées pour cet axe
    let historicalDocs: any[] = [];
    try {
      const q = query(
        historyCol,
        where('road', '==', routeName),
        limit(100)
      );
      const snap = await getDocs(q);
      historicalDocs = snap.docs.map(d => d.data());
    } catch (dbErr) {
      console.warn('[Forecast] Erreur lecture traffic_history:', dbErr);
    }

    for (let i = 1; i <= 6; i++) {
      const targetHour = (currentHour + i) % 24;
      const timeStr = `${targetHour.toString().padStart(2, '0')}:00`;

      // 1. Chercher des relevés correspondant à cette heure et au même jour de la semaine
      let matchingRecords = historicalDocs.filter(d => 
        d.hourOfDay === targetHour && d.dayOfWeek === currentDayOfWeek
      );

      // 2. Si pas assez de données pour ce jour spécifique, élargir à tous les jours pour cette heure
      if (matchingRecords.length === 0) {
        matchingRecords = historicalDocs.filter(d => d.hourOfDay === targetHour);
      }

      let predictedDelay = 0;
      let predictedStatus: any = 'FLUIDE';

      if (matchingRecords.length > 0) {
        // Calcul de la moyenne historique observée
        const totalHistoricalDelay = matchingRecords.reduce((acc, curr) => acc + (Number(curr.delay) || 0), 0);
        const avgHistoricalDelay = Math.round(totalHistoricalDelay / matchingRecords.length);

        // Modèle hybride adaptatif :
        // Les 2 premières heures donnent plus de poids au trafic réel actuel
        // Les heures plus lointaines se basent davantage sur la moyenne historique
        const currentWeight = i <= 2 ? 0.45 : 0.2;
        const historicalWeight = 1 - currentWeight;

        predictedDelay = Math.max(0, Math.round((currentDelay * currentWeight) + (avgHistoricalDelay * historicalWeight)));
        predictedStatus = delayToStatus(predictedDelay);
      } else {
        // Fallback heuristique calibré Kinshasa
        const fallback = heuristicStatus(targetHour);
        predictedDelay = i <= 2 
          ? Math.round(0.5 * currentDelay + 0.5 * fallback.delay)
          : fallback.delay;
        predictedStatus = delayToStatus(predictedDelay);
      }

      hourlyForecast.push({
        time: timeStr,
        status: predictedStatus,
        delay: predictedDelay
      });
    }
  } catch (err) {
    console.error('[Forecast] Erreur modèle prédictif:', err);
    for (let i = 1; i <= 6; i++) {
      const nextHour = (currentHour + i) % 24;
      const fallback = heuristicStatus(nextHour);
      hourlyForecast.push({
        time: `${nextHour.toString().padStart(2, '0')}:00`,
        status: fallback.status,
        delay: fallback.delay
      });
    }
  }

  // 3. Alternatives (Itinéraires bis pertinents pour les grands axes)
  const alternativesMap: Record<string, string[]> = {
    'Boulevard Lumumba': ['Avenue des Poids Lourds', 'Route Mokali'],
    'Boulevard du 30 Juin': ['Avenue de la Justice', 'Avenue Colonel Mondjiba'],
    'Route de Matadi': ['Avenue By Pass', 'Route de Kimwenza'],
    'Avenue Kasa-Vubu': ['Avenue de l\'Enseignement', 'Avenue Gambela']
  };

  const alts = alternativesMap[routeName] || ['Avenue parallèle la plus proche'];
  const alternatives = alts.map(alt => {
    const altDelay = Math.max(0, Math.round(currentDelay * 0.6));
    return {
      road: alt,
      delay: altDelay,
      status: altDelay > 10 ? 'MODÉRÉ' : 'FLUIDE'
    };
  });

  return {
    road: routeName,
    currentStatus,
    currentDelay,
    hourlyForecast,
    alternatives
  };
}
