const runtimeBasePath = window.location.pathname.endsWith("/")
  ? window.location.pathname
  : window.location.pathname.replace(/[^/]*$/, "");

export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

export const firebaseEnabled = Object.values(firebaseConfig).every((value) => String(value || "").trim().length > 0);

export const appSettings = {
  companyName: "QR TimeClock Pro",
  defaultAppUrl: `${window.location.origin}${runtimeBasePath || "/"}`,
  setupMessage: "QRTIMECLOCK2 is isolated from the original QRTimeClock Pro data. Add this repo's own Firebase web config before using live punches or manager sign-in."
};
