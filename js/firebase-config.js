// Firebase Realtime Database config for the shared roll log.
//
// These web-app config values are NOT secret — they are meant to ship in
// client code. Access is controlled by your Realtime Database security rules
// (see README), not by hiding this. Safe to commit.
//
// Fill these in from the Firebase console:
//   Project settings → General → Your apps → SDK setup and configuration.
// Then redeploy / reload. Until `databaseURL` and `apiKey` are filled in, the
// roll log runs LOCAL-ONLY (each browser sees only its own rolls); everything
// else on the sheet works unchanged.
export const firebaseConfig = {
  apiKey: "AIzaSyDHj1dNQYsf8hefZYLap9fV1sX3G0-kSug",
  authDomain: "champions84.firebaseapp.com",
  databaseURL: "https://champions84-default-rtdb.firebaseio.com",
  projectId: "champions84",
  storageBucket: "champions84.firebasestorage.app",
  messagingSenderId: "1019728870166",
  appId: "1:1019728870166:web:7ae3d13588eca3daab6e37"
};

// Pin the Firebase modular SDK version loaded from the CDN. Bump as desired.
export const FIREBASE_VERSION = "10.12.0";

export function isConfigured() {
  return Boolean(firebaseConfig.databaseURL && firebaseConfig.apiKey);
}
