import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { FlowDot } from './FlowDot';

type Lang = 'zh' | 'en';

const copy = {
  zh: { ai: 'AI 分析', fi: '贿赂金融', hub: '协议枢纽', union: '股东联盟' },
  en: { ai: 'AI Analytics', fi: 'Bribe-Fi', hub: 'Protocol Hub', union: 'Shareholders' },
} as const;

const CX = 100;
const CY = 100;

function RotatingGroup({
  duration,
  reverse,
  children,
}: {
  duration: number;
  reverse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <g>
      <animateTransform
        attributeName="transform"
        attributeType="XML"
        type="rotate"
        from={reverse ? `360 ${CX} ${CY}` : `0 ${CX} ${CY}`}
        to={reverse ? `0 ${CX} ${CY}` : `360 ${CX} ${CY}`}
        dur={`${duration}s`}
        repeatCount="indefinite"
      />
      {children}
    </g>
  );
}

function OrbitRing({
  r,
  stroke,
  strokeWidth,
  dash,
  duration,
  reverse,
}: {
  r: number;
  stroke: string;
  strokeWidth: number;
  dash?: string;
  duration: number;
  reverse?: boolean;
}) {
  return (
    <RotatingGroup duration={duration} reverse={reverse}>
      <circle cx={CX} cy={CY} r={r} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} fill="none" />
    </RotatingGroup>
  );
}

export function PortalOrbitalDiagram({ lang, isDark }: { lang: Lang; isDark: boolean }) {
  const t = copy[lang];
  const gold = '#E0568F';
  const burgundy = isDark ? '#E8D5A3' : '#8A2B57';
  const arrow = isDark ? 'rgba(224,86,143,0.65)' : 'rgba(138,43,87,0.5)';
  const fiStroke = isDark ? 'rgba(178,58,110,0.55)' : 'rgba(138,43,87,0.4)';
  const labelBg = isDark ? 'rgba(20,13,24,0.92)' : 'rgba(250,247,244,0.96)';
  const hubMuted = isDark ? 'rgba(224,86,143,0.55)' : 'rgba(138,43,87,0.5)';

  const nodes = [
    {
      key: 'ai',
      x: 56,
      y: 6,
      w: 88,
      h: 34,
      label: t.ai,
      fill: isDark ? 'rgba(224,86,143,0.14)' : 'rgba(224,86,143,0.12)',
      stroke: gold,
      strokeOpacity: 0.55,
      text: gold,
      icon: 'spark' as const,
      delay: 0.3,
    },
    {
      key: 'union',
      x: 4,
      y: 158,
      w: 90,
      h: 34,
      label: t.union,
      fill: isDark ? 'rgba(224,86,143,0.18)' : 'rgba(224,86,143,0.1)',
      stroke: gold,
      strokeOpacity: 0.7,
      text: gold,
      icon: 'crown' as const,
      delay: 0.45,
    },
    {
      key: 'fi',
      x: 106,
      y: 158,
      w: 90,
      h: 34,
      label: t.fi,
      fill: isDark ? 'rgba(138,43,87,0.35)' : 'rgba(138,43,87,0.09)',
      stroke: fiStroke,
      strokeOpacity: 1,
      text: burgundy,
      icon: 'globe' as const,
      delay: 0.55,
    },
  ];

  const nodeCx = (n: (typeof nodes)[0]) => n.x + 28 + (n.w - 28) / 2;

  const paths = [
    {
      d: `M${CX} ${CY - 26} L${CX} 42`,
      stroke: arrow,
      dot: `M${CX} 42 L${CX} ${CY - 26}`,
      delay: 0.4,
      arrow: { x: CX, y: 46 },
    },
    {
      d: `M${CX - 17} ${CY + 12} L${CX - 44} ${CY + 50}`,
      stroke: arrow,
      dot: `M${CX - 44} ${CY + 50} L${CX - 17} ${CY + 12}`,
      delay: 0.48,
      arrow: { x: CX - 40, y: CY + 46 },
    },
    {
      d: `M${CX + 17} ${CY + 12} L${CX + 44} ${CY + 50}`,
      stroke: fiStroke,
      dot: `M${CX + 17} ${CY + 12} L${CX + 44} ${CY + 50}`,
      delay: 0.6,
      arrow: { x: CX + 40, y: CY + 46 },
    },
  ];

  return (
    <div className="relative z-10 w-full flex items-center justify-center px-1 py-2">
      {/* Pulsing glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: [0.35, 0.7, 0.35], scale: [0.92, 1.06, 0.92] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          background: isDark
            ? 'radial-gradient(circle at 50% 48%, rgba(138,43,87,0.45) 0%, transparent 68%)'
            : 'radial-gradient(circle at 50% 48%, rgba(178,58,110,0.14) 0%, transparent 68%)',
        }}
      />

      {/* Spinning conic halo — CSS animation for reliable rotation */}
      <div
        className="absolute inset-3 rounded-full pointer-events-none portal-orbit-spin"
        style={{
          background: isDark
            ? 'conic-gradient(from 0deg, transparent 0%, rgba(224,86,143,0.2) 18%, transparent 38%, rgba(138,43,87,0.28) 58%, transparent 78%)'
            : 'conic-gradient(from 0deg, transparent 0%, rgba(224,86,143,0.25) 18%, transparent 38%, rgba(178,58,110,0.16) 58%, transparent 78%)',
        }}
      />

      <motion.svg
        key={lang}
        viewBox="0 0 200 200"
        preserveAspectRatio="xMidYMid meet"
        className="block w-full h-auto max-w-[min(100%,260px)] mx-auto relative z-10"
        fill="none"
        initial={{ opacity: 0, scale: 0.88 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
      >
        <OrbitRing
          r={68}
          stroke={isDark ? 'rgba(224,86,143,0.28)' : 'rgba(138,43,87,0.2)'}
          strokeWidth={1}
          duration={22}
        />
        <OrbitRing
          r={68}
          stroke={isDark ? 'rgba(224,86,143,0.16)' : 'rgba(138,43,87,0.12)'}
          strokeWidth={0.8}
          dash="6 8"
          duration={14}
          reverse
        />
        <OrbitRing
          r={50}
          stroke={isDark ? 'rgba(138,43,87,0.4)' : 'rgba(178,58,110,0.22)'}
          strokeWidth={0.7}
          dash="4 5"
          duration={10}
        />

        {/* Orbiting satellites */}
        {[10, 14, 18].map((duration, i) => (
          <RotatingGroup key={duration} duration={duration} reverse={i === 1}>
            <circle cx={CX} cy={CY - 68} r={2.8 - i * 0.2} fill={gold} opacity={0.4 + i * 0.15} />
          </RotatingGroup>
        ))}

        {/* Connection lines */}
        {paths.map((p, i) => (
          <motion.path
            key={i}
            d={p.d}
            stroke={p.stroke}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeDasharray={p.dashed ? '4 3' : undefined}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: p.dashed ? 0.55 : 1 }}
            transition={{ duration: 0.8, delay: p.delay, ease: 'easeOut' }}
          />
        ))}

        {paths.map((p, i) => (
          <motion.path
            key={`arrow-${i}`}
            d={`M${p.arrow.x - 3} ${p.arrow.y - 4} L${p.arrow.x} ${p.arrow.y} L${p.arrow.x + 3} ${p.arrow.y - 4}`}
            stroke={p.stroke}
            strokeWidth="1.4"
            strokeLinecap="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: p.dashed ? 0.55 : 1 }}
            transition={{ delay: p.delay + 0.6, duration: 0.3 }}
          />
        ))}

        <FlowDot path={paths[0].dot} color={gold} duration={1.6} />
        <FlowDot path={paths[1].dot} color={isDark ? 'rgba(224,86,143,0.65)' : 'rgba(138,43,87,0.45)'} duration={2} delay={0.3} r={3} />
        <FlowDot path={paths[2].dot} color={burgundy} duration={1.8} delay={0.5} />

        {/* Center hub */}
        <motion.g
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.15, type: 'spring', stiffness: 180 }}
          style={{ transformOrigin: `${CX}px ${CY}px`, transformBox: 'fill-box' }}
        >
          <motion.circle
            cx={CX}
            cy={CY}
            r="28"
            fill="none"
            stroke={gold}
            strokeWidth="0.9"
            animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.5, 0.15] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: `${CX}px ${CY}px`, transformBox: 'fill-box' }}
          />
          <motion.circle
            cx={CX}
            cy={CY}
            r="24"
            fill={isDark ? 'rgba(138,43,87,0.42)' : 'rgba(138,43,87,0.1)'}
            stroke={gold}
            strokeWidth="1.4"
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: `${CX}px ${CY}px`, transformBox: 'fill-box' }}
          />
          <text x={CX} y={CY + 5} textAnchor="middle" fill={gold} fontSize="14" fontWeight="bold" fontFamily="'Nunito', sans-serif" fontStyle="italic">
            D³
          </text>
        </motion.g>

        {/* Satellite nodes — on top */}
        {nodes.map((node) => (
          <motion.g
            key={node.key}
            initial={{ opacity: 0, y: 12, scale: 0.85 }}
            animate={{ opacity: 1, y: [0, -3, 0], scale: 1 }}
            transition={{
              opacity: { duration: 0.5, delay: node.delay },
              scale: { duration: 0.55, delay: node.delay, type: 'spring', stiffness: 200 },
              y: { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: node.delay + 0.6 },
            }}
            style={{ transformOrigin: `${nodeCx(node)}px ${node.y + node.h / 2}px`, transformBox: 'fill-box' }}
          >
            <rect
              x={node.x}
              y={node.y}
              width={node.w}
              height={node.h}
              rx="9"
              fill={node.fill}
              stroke={node.stroke}
              strokeWidth="1.2"
              strokeOpacity={node.strokeOpacity}
            />
            {node.icon === 'spark' && (
              <>
                <motion.circle
                  cx={node.x + 14}
                  cy={node.y + 17}
                  r="3.5"
                  fill={gold}
                  animate={{ opacity: [0.4, 1, 0.4], scale: [0.9, 1.15, 0.9] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                  style={{ transformOrigin: `${node.x + 14}px ${node.y + 17}px`, transformBox: 'fill-box' }}
                />
                <path
                  d={`M${node.x + 14} ${node.y + 11} L${node.x + 15.5} ${node.y + 15} L${node.x + 19} ${node.y + 15.5} L${node.x + 16} ${node.y + 18} L${node.x + 17} ${node.y + 22} L${node.x + 14} ${node.y + 19.5} L${node.x + 11} ${node.y + 22} L${node.x + 12} ${node.y + 18} L${node.x + 9} ${node.y + 15.5} L${node.x + 12.5} ${node.y + 15} Z`}
                  fill={gold}
                  opacity="0.85"
                />
              </>
            )}
            {node.icon === 'crown' && (
              <>
                <path
                  d={`M${node.x + 9} ${node.y + 21} L${node.x + 11} ${node.y + 13} L${node.x + 14} ${node.y + 17} L${node.x + 17} ${node.y + 13} L${node.x + 19} ${node.y + 21} Z`}
                  fill={gold}
                  opacity="0.85"
                />
                <rect x={node.x + 9} y={node.y + 20} width="10" height="2" rx="0.5" fill={gold} opacity="0.7" />
              </>
            )}
            {node.icon === 'globe' && (
              <>
                <circle cx={node.x + 14} cy={node.y + 17} r="5" stroke={burgundy} strokeWidth="0.9" fill="none" opacity="0.8" />
                <motion.ellipse
                  cx={node.x + 14}
                  cy={node.y + 17}
                  rx="2.5"
                  ry="5"
                  stroke={burgundy}
                  strokeWidth="0.7"
                  fill="none"
                  animate={{ opacity: [0.4, 0.9, 0.4] }}
                  transition={{ duration: 2.2, repeat: Infinity }}
                />
              </>
            )}
            <text
              x={nodeCx(node)}
              y={node.y + 21}
              textAnchor="middle"
              fill={node.text}
              fontSize={lang === 'en' && node.label.length > 10 ? 8.5 : 9.5}
              fontWeight="700"
            >
              {node.label}
            </text>
          </motion.g>
        ))}

        <g>
          <rect x={CX - 28} y={CY + 30} width={56} height={13} rx="3" fill={labelBg} />
          <text x={CX} y={CY + 39} textAnchor="middle" fill={hubMuted} fontSize="7" fontWeight="600">
            {t.hub}
          </text>
        </g>
      </motion.svg>
    </div>
  );
}
