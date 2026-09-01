importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Configuration dynamique Firebase passée via les paramètres d'URL du Service Worker
const params = new URLSearchParams(self.location.search);
const apiKey = params.get('apiKey');
const projectId = params.get('projectId');
const messagingSenderId = params.get('messagingSenderId');
const appId = params.get('appId');
const authDomain = params.get('authDomain');
const storageBucket = params.get('storageBucket');

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