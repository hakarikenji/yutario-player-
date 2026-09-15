import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ToastProvider } from "./ui/primitives";
import { AdsProvider } from "./state/ads";
import { AuthProvider } from "./state/auth";
import { LibraryProvider } from "./state/library";
import { SettingsProvider } from "./state/settings";
import { PlayerProvider } from "./state/player";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <SettingsProvider>
        <AdsProvider>
          <AuthProvider>
            <LibraryProvider>
              <PlayerProvider>
                <App />
              </PlayerProvider>
            </LibraryProvider>
          </AuthProvider>
        </AdsProvider>
      </SettingsProvider>
    </ToastProvider>
  </StrictMode>
);
