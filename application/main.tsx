import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { HelmetProvider } from "react-helmet-async";
import { Analytics } from "@vercel/analytics/react";
import { router } from "@/app/routes";
import "@/styles/index.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container not found");
}

createRoot(container).render(
  <StrictMode>
    <HelmetProvider>
      <RouterProvider router={router} />
      <Analytics />
    </HelmetProvider>
  </StrictMode>
);
