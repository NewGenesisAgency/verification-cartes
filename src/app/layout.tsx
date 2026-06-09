import type { Metadata } from "next";
import "./globals.css";
import Script from 'next/script';
import { ViewTransitions } from "next-view-transitions";
import PageTransitionWrapper from "./components/PageTransitionWrapper";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: {
    default: "Lycée Edouard Branly - MDL",
    template: "%s | Lycée Edouard Branly - MDL",
  },
  robots: {
    index: true,
    follow: true,
    nocache: true,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  description: "Lycée Edouard Branly - Maison des Lycéens (MDL) - Applications et services pour les étudiants.",
  keywords: ["Lycée Edouard Branly", "MDL", "Maison des Lycéens", "vérification cartes"],
  metadataBase: new URL("http://localhost:3000"),
  openGraph: {
    title: "Lycée Edouard Branly - MDL",
    description: "Maison des Lycéens - Applications et services pour les étudiants.",
    url: "http://localhost:3000",
    siteName: "Lycée Edouard Branly - MDL",
    images: [],
    locale: "fr_FR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lycée Edouard Branly - MDL",
    description: "Maison des Lycéens - Applications et services.",
    images: [],
  },
  icons: {
    icon: "/imgs/favicon.ico",
    apple: "/imgs/data.png",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preload" href="https://fonts.googleapis.com/css2?family=Afacad+Flux:wght@100..1000&family=Montserrat:wght@100..900&display=swap" as="style" />
        <link rel="preload" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" as="style" />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Afacad+Flux:wght@100..1000&family=Cinzel+Decorative:wght@400;700;900&family=Montserrat:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
        <link rel="shortcut icon" href="/imgs/favicon.ico" type="image/x-icon" />
        <link rel="icon" href="/imgs/favicon.ico" type="image/x-icon" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: `{
      "@context": "https://schema.org",
      "@type": "EducationalOrganization",
      "name": "Lycée Edouard Branly - MDL",
      "alternateName": "Maison des Lycéens - Lycée Edouard Branly",
      "description": "Maison des Lycéens du Lycée Edouard Branly - Applications et services pour les étudiants."
    }`,
          }}
        />
        <Script
          src="https://kit.fontawesome.com/71409c9e44.js"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      </head>
      <ViewTransitions>
        <body className="antialiased">
          <div className="revealer"></div>
          <PageTransitionWrapper />
          <ServiceWorkerRegister />
          {children}
        </body>
      </ViewTransitions>
    </html>
  );
}