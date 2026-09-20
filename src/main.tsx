import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "./app/App";
import { AppProviders } from "./app/AppProviders";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/dm-sans/wght-italic.css";
import "./styles/globals.css";

// A data router supplies navigation blocking for unsaved event forms. Existing
// routes, lazy screens and query caching remain in App/AppProviders.
const router = createBrowserRouter(
  [
    {
      path: "*",
      element: (
        <AppProviders>
          <App />
        </AppProviders>
      )
    }
  ],
  { future: { v7_relativeSplatPath: true } }
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} future={{ v7_startTransition: true }} />
  </React.StrictMode>
);
