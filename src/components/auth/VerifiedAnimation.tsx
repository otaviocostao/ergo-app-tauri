import { useEffect, useRef } from "react";
import { createTimeline, svg } from "animejs";

interface VerifiedAnimationProps {
  active: boolean;
}

export default function VerifiedAnimation({ active }: VerifiedAnimationProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLSpanElement>(null);
  const circleRef = useRef<SVGCircleElement>(null);
  const checkRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (!active) return;

    let timeline: ReturnType<typeof createTimeline> | undefined;
    const frame = window.requestAnimationFrame(() => {
      const root = rootRef.current;
      const halo = haloRef.current;
      const circle = circleRef.current;
      const check = checkRef.current;
      if (!root || !halo || !circle || !check) return;

      const [drawableCircle] = svg.createDrawable(circle);
      const [drawableCheck] = svg.createDrawable(check);

      timeline = createTimeline({ loop: true, loopDelay: 900 })
        .set(root, { opacity: 0, scale: 0.72, rotate: -8, y: 8 })
        .set(halo, { opacity: 0, scale: 0.65 })
        .add(root, { opacity: 1, scale: 1, rotate: 0, y: 0, duration: 420, ease: "outExpo" })
        .add(drawableCircle, { draw: ["0 0", "0 1"], duration: 900, ease: "inOutQuad" }, "<<")
        .add(drawableCheck, { draw: ["0 0", "0 1"], duration: 520, ease: "outQuad" }, "-=160")
        .add(root, { scale: [1, 1.12, 1], duration: 520, ease: "outQuad" }, "-=120")
        .add(halo, { opacity: [0.5, 0], scale: [0.65, 1.55], duration: 800, ease: "outQuad" }, "-=520");
    });

    return () => {
      window.cancelAnimationFrame(frame);
      timeline?.revert();
    };
  }, [active]);

  return (
    <div
      ref={rootRef}
      className="relative mx-auto mb-4 flex size-24 items-center justify-center"
      role="img"
      aria-label="Cadastro verificado"
    >
      <span ref={haloRef} className="absolute size-20 rounded-full bg-primary-400/35" aria-hidden="true" />
      <svg className="relative size-20 overflow-visible text-primary-500" viewBox="0 0 96 96" aria-hidden="true">
        <circle
          ref={circleRef}
          cx="48"
          cy="48"
          r="38"
          fill="white"
          stroke="currentColor"
          strokeWidth="5"
        />
        <path
          ref={checkRef}
          d="M29 49 42 62 68 35"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="7"
        />
      </svg>
    </div>
  );
}
