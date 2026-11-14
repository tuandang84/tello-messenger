import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// No StrictMode: the bridge subscribes once to Tauri events, and double-mounting
// in development would register duplicate listeners.
const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");

createRoot(container).render(<App />);
