import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { registerServiceWorker } from "@/lib/registerServiceWorker";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Hide the inline boot loader once React's first commit has flushed.
// Using a microtask + rAF gives the very first paint of <App /> a chance
// to land before we fade the loader out, so the user never sees a flash
// of unstyled / empty content between the two.
requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        document.body.classList.add("app-ready");
        // Remove the node entirely after the fade so it doesn't keep
        // soaking pointer-events or screen-reader focus.
        setTimeout(() => {
            const el = document.getElementById("boot-loader");
            if (el && el.parentNode) el.parentNode.removeChild(el);
        }, 450);
    });
});

registerServiceWorker();
