export function Logo() {
  return (
    <div className="cp-logo">
      <svg
        className="cp-logo__mark"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <rect width="40" height="40" rx="10" fill="url(#cp-g)" />
        <path
          d="M20 11c-2.5-3.2-7-2.6-7 2.1 0 3.4 3.1 6.2 7 9.9 3.9-3.7 7-6.5 7-9.9 0-4.7-4.5-5.3-7-2.1Z"
          fill="white"
          fillOpacity="0.95"
        />
        <defs>
          <linearGradient id="cp-g" x1="8" y1="6" x2="34" y2="36" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0d9488" />
            <stop offset="1" stopColor="#0369a1" />
          </linearGradient>
        </defs>
      </svg>
      <span className="cp-logo__word">CarePilot</span>
    </div>
  )
}
