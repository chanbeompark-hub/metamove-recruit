import { useEffect } from 'react';

const REVEAL_SELECTOR = [
  '.center-story',
  '.expansion-vision',
  '.founder-pair',
  '.growth-tabs',
  '.benefits-rules',
  '.hiring-process',
  '.position-summary',
].join(', ');

export function SectionRevealController() {
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    sections.forEach((section) => section.classList.add('section-reveal'));

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      sections.forEach((section) => section.classList.add('section-reveal--visible'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('section-reveal--visible');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return null;
}
