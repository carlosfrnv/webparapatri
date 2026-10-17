/** Ilustración del banner de inicio: un "escáner" de anillos con un corazón negro en el centro. */
export function HeroArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 220" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="ha-core" cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.55" />
        </radialGradient>
        <linearGradient id="ha-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#34d6c6" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      {/* Anillos del escáner */}
      <circle cx="110" cy="110" r="100" fill="none" stroke="#fff" strokeOpacity="0.12" strokeWidth="18" />
      <circle cx="110" cy="110" r="78" fill="none" stroke="url(#ha-ring)" strokeWidth="3" strokeDasharray="4 10" />
      <circle
        cx="110"
        cy="110"
        r="62"
        fill="#fff"
        fillOpacity="0.08"
        stroke="#fff"
        strokeOpacity="0.35"
        strokeWidth="2"
      />
      {/* Barrido */}
      <path d="M110 110 L110 32 A78 78 0 0 1 177 71 Z" fill="#fff" fillOpacity="0.12">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 110 110"
          to="360 110 110"
          dur="9s"
          repeatCount="indefinite"
        />
      </path>
      {/* Corazón negro en el centro */}
      <circle cx="110" cy="110" r="40" fill="url(#ha-core)" />
      <path
        d="M110 128c-1.2 0-2.3-.4-3.2-1.2C97 118 89 111 89 101.5 89 95 94 90 100.3 90c4 0 7.5 2 9.7 5.2C112.2 92 115.7 90 119.7 90 126 90 131 95 131 101.5c0 9.5-8 16.5-17.8 25.3-.9.8-2 1.2-3.2 1.2Z"
        fill="#1b1733"
      />
      {/* Puntos de datos */}
      <circle cx="40" cy="62" r="5" fill="#34d6c6" />
      <circle cx="186" cy="150" r="6" fill="#f9a8d4" />
      <circle cx="170" cy="40" r="3.5" fill="#fff" fillOpacity="0.8" />
      <circle cx="52" cy="176" r="3.5" fill="#fff" fillOpacity="0.6" />
    </svg>
  );
}
