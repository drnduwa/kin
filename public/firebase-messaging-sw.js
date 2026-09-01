importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Configuration dynamique Firebase passée via les paramètres d'URL du Service Worker (avec fallback)
const params = new URLSearchParams(self.location.search);
const apiKey = params.get('apiKey') || atob('QUl6YVN5RF93RWY4dEVrOVpmZkpmVW5MSTduZElUU3Q1cDA1Rm9V');
const projectId = params.get('projectId') || 'studio-874039458-d0447';
const messagingSenderId = params.get('messagingSenderId') || '196367644911';
const appId = params.get('appId') || '1:196367644911:web:74bd118b2cb442b1dc031a';
const authDomain = params.get('authDomain') || 'studio-874039458-d0447.firebaseapp.com';
const storageBucket = params.get('storageBucket') || 'studio-874039458-d0447.firebasestorage.app';

if (apiKey && projectId) {
  firebase.initializeApp({
    apiKey,
    authDomain: authDomain || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: storageBucket || `${projectId}.firebasestorage.app`,
    messagingSenderId: messagingSenderId || '',
    appId: appId || ''
  });

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Message reçu en arrière-plan ', payload);
    const notificationTitle = payload.notification?.title || 'Kinshasa Flow';
    const notificationOptions = {
      body: payload.notification?.body || 'Mise à jour du trafic disponible.',
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: 'traffic-alert',
      renotify: true
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
}