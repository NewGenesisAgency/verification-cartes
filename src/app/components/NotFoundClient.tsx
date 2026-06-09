"use client";

import { useRevealer } from "../hooks/useRevealer";

export default function NotFoundClient() {
  useRevealer();

  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center text-center relative px-4">
      <h1>Erreur 404</h1>
    </main>
  );
}
