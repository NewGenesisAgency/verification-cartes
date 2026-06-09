import HomePage from "./components/HomePage";

export const metadata = {
  title: "Lycée Edouard Branly - MDL | Accueil",
  description: "Maison des Lycéens du Lycée Edouard Branly - Accédez à nos applications et services pour les étudiants.",
  keywords: [
    "Lycée Edouard Branly",
    "MDL",
    "Maison des Lycéens",
    "vérification cartes",
    "applications étudiantes"
  ],
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
  openGraph: {
    title: "Lycée Edouard Branly - MDL",
    description: "Maison des Lycéens - Applications et services pour les étudiants.",
    url: "http://localhost:3000/",
    siteName: "Lycée Edouard Branly - MDL",
    images: [],
    locale: "fr_FR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lycée Edouard Branly - MDL",
    description: "Maison des Lycéens - Applications et services pour les étudiants.",
    images: [],
  },
  alternates: { canonical: "http://localhost:3000/" },
  author: "Lycée Edouard Branly - MDL",
};

export default function Home() {
  return (
    <HomePage />
  );
}