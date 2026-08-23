'use client';

import { useId } from 'react';

/**
 * Animated scan loader — morphing orb with rotating clip-path polygons.
 * Based on https://uiverse.io/andrew-manzyk
 *
 * Renders as a bare Fragment (no wrapper div) so it sits cleanly inside
 * buttons, flex rows, etc. The `size` prop scales the 100px base orb.
 */
export function ScanLoader({ size = 1 }: { size?: number }) {
  const id = useId();
  const clipId = `scan-clip-${id.replace(/:/g, '')}`;
  const px = Math.round(100 * size);

  return (
    <>
      <style>{`
        .scan-orb-${clipId} {
          --color-one: #ffbf48;
          --color-two: #be4a1d;
          --color-three: #ffbf4780;
          --color-four: #bf4a1d80;
          --color-five: #ffbf4740;
          --time-animation: 2s;
          position: relative;
          border-radius: 50%;
          box-shadow:
            0 0 25px 0 var(--color-three),
            0 20px 50px 0 var(--color-four);
          animation: clr-${clipId} calc(var(--time-animation) * 3) ease-in-out infinite;
          width: ${px}px;
          height: ${px}px;
          flex-shrink: 0;
        }

        .scan-orb-${clipId}::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          border-top: solid 1px var(--color-one);
          border-bottom: solid 1px var(--color-two);
          background: linear-gradient(180deg, var(--color-five), var(--color-four));
          box-shadow:
            inset 0 10px 10px 0 var(--color-three),
            inset 0 -10px 10px 0 var(--color-four);
        }

        .scan-orb-${clipId} .box {
          width: 100%;
          height: 100%;
          background: linear-gradient(180deg, var(--color-one) 30%, var(--color-two) 70%);
          mask: url(#${clipId});
          -webkit-mask: url(#${clipId});
        }

        .scan-orb-${clipId} svg {
          position: absolute;
          width: ${px}px;
          height: ${px}px;
        }

        .scan-orb-${clipId} svg #${clipId} {
          filter: contrast(15);
          animation: rnd-${clipId} calc(var(--time-animation) / 2) linear infinite;
        }

        .scan-orb-${clipId} svg #${clipId} polygon {
          filter: blur(7px);
        }

        .scan-orb-${clipId} svg #${clipId} polygon:nth-child(1) {
          transform-origin: 75% 25%;
          transform: rotate(90deg);
        }

        .scan-orb-${clipId} svg #${clipId} polygon:nth-child(2) {
          transform-origin: 50% 50%;
          animation: rot-${clipId} var(--time-animation) linear infinite reverse;
        }

        .scan-orb-${clipId} svg #${clipId} polygon:nth-child(3) {
          transform-origin: 50% 60%;
          animation: rot-${clipId} var(--time-animation) linear infinite;
          animation-delay: calc(var(--time-animation) / -3);
        }

        .scan-orb-${clipId} svg #${clipId} polygon:nth-child(4) {
          transform-origin: 40% 40%;
          animation: rot-${clipId} var(--time-animation) linear infinite reverse;
        }

        .scan-orb-${clipId} svg #${clipId} polygon:nth-child(5) {
          transform-origin: 40% 40%;
          animation: rot-${clipId} var(--time-animation) linear infinite reverse;
          animation-delay: calc(var(--time-animation) / -2);
        }

        .scan-orb-${clipId} svg #${clipId} polygon:nth-child(6) {
          transform-origin: 60% 40%;
          animation: rot-${clipId} var(--time-animation) linear infinite;
        }

        .scan-orb-${clipId} svg #${clipId} polygon:nth-child(7) {
          transform-origin: 60% 40%;
          animation: rot-${clipId} var(--time-animation) linear infinite;
          animation-delay: calc(var(--time-animation) / -1.5);
        }

        @keyframes rot-${clipId} {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes rnd-${clipId} {
          0% { filter: contrast(15); }
          20% { filter: contrast(3); }
          40% { filter: contrast(3); }
          60% { filter: contrast(15); }
          100% { filter: contrast(15); }
        }

        @keyframes clr-${clipId} {
          0% { filter: hue-rotate(0deg); }
          20% { filter: hue-rotate(-30deg); }
          40% { filter: hue-rotate(-60deg); }
          60% { filter: hue-rotate(-90deg); }
          80% { filter: hue-rotate(-45deg); }
          100% { filter: hue-rotate(0deg); }
        }
      `}</style>

      <div className={`scan-orb-${clipId}`}>
        <div className="box" />
        <svg aria-hidden="true">
          <defs>
            <clipPath id={clipId} clipPathUnits="objectBoundingBox">
              <polygon points="0,0 1,0 1,1 0,1" />
              <polygon points="0.2,0.2 0.8,0.2 0.8,0.8 0.2,0.8" />
              <polygon points="0.1,0.3 0.9,0.1 0.7,0.9 0.3,0.7" />
              <polygon points="0.3,0.1 0.7,0.3 0.9,0.7 0.1,0.9" />
              <polygon points="0.15,0.15 0.85,0.15 0.85,0.85 0.15,0.85" />
              <polygon points="0.25,0.05 0.75,0.25 0.95,0.75 0.05,0.95" />
              <polygon points="0.05,0.25 0.75,0.05 0.95,0.75 0.25,0.95" />
            </clipPath>
          </defs>
        </svg>
      </div>
    </>
  );
}
