import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Estudio IMR",
  description: "Tu espacio de estudio de Imagen Médica y Radioterapia",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Estudio IMR", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#c2357c",
};

// Aplica el tema y el idioma antes de pintar, para que no haya un "destello" claro en modo oscuro.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark");if(localStorage.getItem("lang")==="pt")document.documentElement.lang="pt-PT"}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${inter.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AuthGate>
          <AppShell>{children}</AppShell>
        </AuthGate>
      </body>
    </html>
  );
}
