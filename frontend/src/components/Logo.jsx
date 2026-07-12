// Marque RS-Connector : un hub reliant des sources (canaux/apps clientes) à un point central.
// Dégradé cyan repris de l'identité AiFlowHub / Rsconnect (landings.aiflowhub.online).
export default function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="RS-Connector"
      xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="rs-mark-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0891b2" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#rs-mark-grad)" />
      <path d="M21 18.5 42 32 M21 45.5 42 32" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="21" cy="18.5" r="5.4" fill="#fff" />
      <circle cx="21" cy="45.5" r="5.4" fill="#fff" />
      <circle cx="42" cy="32" r="6.8" fill="#fff" />
    </svg>
  );
}
