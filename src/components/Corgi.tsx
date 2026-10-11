// A Pembroke Welsh corgi: big upright ears, red-and-white face, white blaze down the middle.

function Head({ cy = 18 }: { cy?: number }) {
  const y = cy - 18;
  return (
    <g transform={`translate(0 ${y})`}>
      <path className="corgi-fur" d="M3.8 16.2 5.2 4.1Q5.5 2.2 7 3.3L14.6 10z" />
      <path className="corgi-fur" d="M28.2 16.2 26.8 4.1Q26.5 2.2 25 3.3L17.4 10z" />
      <path className="corgi-ear" d="M6.6 12.6 7.3 6.3 11.8 10.1z" />
      <path className="corgi-ear" d="M25.4 12.6 24.7 6.3 20.2 10.1z" />
      <ellipse className="corgi-fur" cx="16" cy="18.6" rx="12.4" ry="9.2" />
      <path className="corgi-white" d="M16 10.4c-1 1.8-1.7 4.1-2.8 6.6-2.9.4-5.7 2.2-5.5 4.8.3 3.3 4.1 5.4 8.3 5.4s8-2.1 8.3-5.4c.2-2.6-2.6-4.4-5.5-4.8-1.1-2.5-1.8-4.8-2.8-6.6z" />
      <circle className="corgi-eye" cx="11.4" cy="16.6" r="1.35" />
      <circle className="corgi-eye" cx="20.6" cy="16.6" r="1.35" />
      <ellipse className="corgi-eye" cx="16" cy="20.6" rx="1.8" ry="1.2" />
      <path className="corgi-mouth" d="M14.2 22.6c.8.7 1.8.6 1.8-.6 0 1.2 1 1.3 1.8.6" />
      <path className="corgi-tongue" d="M15.2 23.2c0 1.3.4 1.9.8 1.9s.8-.6.8-1.9c-.5.3-1.1.3-1.6 0z" />
    </g>
  );
}

/** The app mark: a corgi's head. */
export function CorgiMark({ className = '' }: { className?: string }) {
  return (
    <svg className={`corgi ${className}`} viewBox="0 0 32 30" aria-hidden="true">
      <Head />
    </svg>
  );
}

/** A corgi peeking over the top edge of a card, paws on the edge. Place it inside a positioned parent. */
export function CorgiPeek() {
  return (
    <svg className="corgi corgi-peek" viewBox="0 0 32 31" aria-hidden="true">
      <defs>
        <clipPath id="corgi-peek-clip">
          <rect x="0" y="0" width="32" height="26.5" />
        </clipPath>
      </defs>
      <g clipPath="url(#corgi-peek-clip)">
        <Head cy={20} />
      </g>
      <ellipse className="corgi-paw" cx="9.6" cy="27" rx="3.6" ry="2.3" />
      <ellipse className="corgi-paw" cx="22.4" cy="27" rx="3.6" ry="2.3" />
    </svg>
  );
}
