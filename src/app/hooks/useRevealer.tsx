"use client";

import gsap from "gsap";
import CustomEase from "gsap/CustomEase";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(CustomEase);
CustomEase.create("hop", ".9, 0, .1, 1");

export function useRevealer() {
    useGSAP(() => {
        gsap.to(".revealer", {
            scaleY: 0,
            ease: "hop",
            duration: 0.9,
            delay: 0.3,
        });
    }, {});
}