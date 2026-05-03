import type { FishTheme } from '../fish.js';

type Props = {
  fish: FishTheme;
  size?: number;
  animated?: boolean;
};

/** Circular avatar where the fish swims out of the circle on the right.
 *  Clip is round on top/bottom/left and open on the right, so the head
 *  visibly walks past the badge edge. */
export function FishBadge({ fish, size = 56, animated = false }: Props) {
  const imgWidth = size * 1.5;
  // Path: left half of the circle + rectangle extending right past the badge.
  const r = size / 2;
  const ext = size * 4;
  const clip = `path('M ${r} 0 A ${r} ${r} 0 0 0 ${r} ${size} L ${ext} ${size} L ${ext} 0 Z')`;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: 'var(--color-cell)', border: `2px solid ${fish.accent}` }}
      />
      <div className="absolute inset-0" style={{ clipPath: clip }}>
        <img
          src={fish.src}
          alt=""
          className={animated ? 'fish-swim' : ''}
          style={{
            position: 'absolute',
            width: imgWidth,
            maxWidth: 'none',
            height: 'auto',
            top: '50%',
            left: '50%',
            // Idle: fish tucked left, head just kissing the right edge.
            // When animated, .fish-swim keyframes override and the fish swims
            // out past the right of the circle.
            transform: 'translate(-85%, -30%)',
          }}
        />
      </div>
    </div>
  );
}
