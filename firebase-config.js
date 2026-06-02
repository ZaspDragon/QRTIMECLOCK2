const runtimeBasePath = window.location.pathname.endsWith("/")
  ? window.location.pathname
  : window.location.pathname.replace(/[^/]*$/, "/");

export const firebaseConfig = {
  apiKey: "AIzaSyDfF4mmLeI4IbOl3TsWJnCfMg_nsSfqTp0",
  authDomain: "portaly-d6617.firebaseapp.com",
  projectId: "portaly-d6617",
  storageBucket: "portaly-d6617.firebasestorage.app",
  messagingSenderId: "594971277057",
  appId: "1:594971277057:web:8a0f6c29370d741a45cd00",
  measurementId: "G-L8EHWRS2BZ"
};

export const firebaseEnabled = Object.values(firebaseConfig)
  .every((value) => String(value || "").trim().length > 0);

export const functionsBaseUrl = "https://us-central1-portaly-d6617.cloudfunctions.net";

export const appSettings = {
  companyName: "QR TimeClock2",
  defaultAppUrl: `${window.location.origin}${runtimeBasePath || "/"}`,
  setupMessage: "QRTimeClock2 is connected to the shared Portaly Firebase project for live worker punches."
};
