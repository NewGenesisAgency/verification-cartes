"use client";

import { useTransitionRouter } from "next-view-transitions";
import { usePathname } from "next/navigation";

export function useHandleNavigation() {
  const router = useTransitionRouter();
  const pathname = usePathname();

  const handleNavigation = (path: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (path === pathname) return;
    router.push(path);
  };

  return handleNavigation;
}