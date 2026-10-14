import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata={title:"GALEEN | Inteligencia conectada",description:"Plataforma institucional BYO para gestionar, distribuir y medir recursos de inteligencia artificial."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>}
