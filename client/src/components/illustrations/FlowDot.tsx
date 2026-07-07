/** Flowing particle along an SVG path — uses native animateMotion for reliable SVG rendering */
export function FlowDot({
  path,
  color,
  duration = 2.4,
  delay = 0,
  r = 3.5,
}: {
  path: string;
  color: string;
  duration?: number;
  delay?: number;
  r?: number;
}) {
  return (
    <circle r={r} fill={color}>
      <animateMotion dur={`${duration}s`} begin={`${delay}s`} repeatCount="indefinite" path={path} calcMode="linear" />
    </circle>
  );
}
