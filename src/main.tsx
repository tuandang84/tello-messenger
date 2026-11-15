import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

// No StrictMode: the bridge subscribes once to Tauri events, and double-mounting
// in development would register duplicate listeners.
const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");

// Surface anything React cannot catch so a failure never ends in a silent
// black window.
window.addEventListener("unhandledrejection", (event) => {
  console.error("[tello] loi khong duoc xu ly", event.reason);
});
window.addEventListener("error", (event) => {
  console.error("[tello] loi runtime", event.error ?? event.message);
});

createRoot(container).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
