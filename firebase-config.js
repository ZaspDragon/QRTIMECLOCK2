/*
  QRTIMECLOCK2 Firebase Cloud Configuration
  Frontend-safe configuration only.

  This repo mirrors the upgraded Portaly SaaS frontend, but it does not
  automatically assume the live Portaly Firebase project should be reused.
  Fill these values in only if this repo is meant to use its own Firebase
  project. Until then, leave enabled=false and the app will still render the
  public landing/demo experience safely.
*/

(function () {
  const path = window.location.pathname || "/";
  const basePath = path.endsWith("/") ? path : path.replace(/[^/]*$/, "");
  const appUrl = `${window.location.origin}${basePath || "/"}`;

  window.PORTALY_FIREBASE_CONFIG = {
    enabled: false,

    appName: "Portaly",
    appUrl,

    trialDays: 14,
    billingProvider: "square",

    functionsBaseUrl: "",
    inviteBackendUrl: "",

    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
    measurementId: "",

    features: {
      cloudMode: true,
      billing: true,
      qrPunches: true,
      approvals: true,
      payroll: true,
      clientInvites: true,
      workerSelfService: true,
      demoMode: true
    },

    inviteConfig: {
      allowFrontendInviteLinks: true,
      inviteExpiryDays: 14,
      requireBackendForEmailSending: false
    },

    ui: {
      defaultTheme: "light",
      primaryColor: "#1f6fff",
      companyName: "Your Staffing Agency"
    }
  };
})();
