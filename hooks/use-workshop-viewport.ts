"use client";
import { useEffect } from 'react';

// Fit the editor and its portals above the phone keyboard without disabling zoom.
export function useWorkshopViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => {
      if (window.innerWidth >= 768) {
        root.style.removeProperty('--workshop-viewport-height');
        root.style.removeProperty('--workshop-viewport-top');
        delete root.dataset.workshopKeyboard;
        return;
      }
      // Browser zoom belongs to the user; do not reflow the editor during it.
      if (Math.abs(viewport.scale - 1) > .01) return;
      root.style.setProperty('--workshop-viewport-height', `${viewport.height}px`);
      root.style.setProperty('--workshop-viewport-top', `${viewport.offsetTop}px`);
      root.dataset.workshopKeyboard = String(window.innerHeight - viewport.height > 120);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      root.style.removeProperty('--workshop-viewport-height');
      root.style.removeProperty('--workshop-viewport-top');
      delete root.dataset.workshopKeyboard;
    };
  }, []);
}
