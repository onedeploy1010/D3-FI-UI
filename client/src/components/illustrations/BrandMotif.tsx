export function BrandMotif({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} fill="none">
      <circle cx="100" cy="100" r="80" stroke="rgba(224,86,143,0.15)" strokeWidth="0.5" />
      <circle cx="100" cy="100" r="60" stroke="rgba(138,43,87,0.3)" strokeWidth="0.5" />
      <circle cx="100" cy="100" r="40" stroke="rgba(178,58,110,0.2)" strokeWidth="0.5" />
      <circle cx="100" cy="100" r="20" stroke="rgba(94,26,60,0.4)" strokeWidth="1" />
      <circle cx="100" cy="20" r="3" fill="rgba(224,86,143,0.6)" />
      <circle cx="180" cy="100" r="2" fill="rgba(138,43,87,0.8)" />
      <circle cx="60" cy="160" r="2.5" fill="rgba(178,58,110,0.4)" />
      <circle cx="140" cy="40" r="1.5" fill="rgba(224,86,143,0.5)" />
      <text
        x="100"
        y="108"
        textAnchor="middle"
        fill="rgba(138,43,87,0.3)"
        fontSize="24"
        fontWeight="bold"
        fontFamily="'Nunito', sans-serif"
        fontStyle="italic"
      >
        D³
      </text>
    </svg>
  );
}
