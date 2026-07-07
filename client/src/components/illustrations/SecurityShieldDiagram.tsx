import { motion } from 'framer-motion';
import { FlowDot } from './FlowDot';

const GUARDIAN_POINTS = [
  { cx: 100, cy: 25, label: 'GATE', color: 'rgba(201,169,110,0.6)' },
  { cx: 165, cy: 55, label: 'SEAL', color: 'rgba(155,45,90,0.7)' },
  { cx: 165, cy: 130, label: 'BURN', color: 'rgba(16,185,129,0.65)' },
  { cx: 100, cy: 195, label: 'BAND', color: 'rgba(201,169,110,0.5)' },
  { cx: 35, cy: 130, label: 'SHIELD', color: 'rgba(155,45,90,0.6)' },
  { cx: 35, cy: 55, label: 'HALT', color: 'rgba(201,169,110,0.7)' },
];

export function SecurityShieldDiagram({ isDark }: { isDark: boolean }) {
  const outerStroke = isDark ? 'rgba(201,169,110,0.45)' : 'rgba(107,26,58,0.35)';
  const innerStroke = isDark ? 'rgba(201,169,110,0.22)' : 'rgba(201,169,110,0.35)';
  const outerFill = isDark ? 'rgba(107,26,58,0.22)' : 'rgba(107,26,58,0.08)';
  const innerFill = isDark ? 'rgba(201,169,110,0.06)' : 'rgba(201,169,110,0.05)';
  const centerText = isDark ? 'rgba(201,169,110,0.65)' : 'rgba(107,26,58,0.55)';

  return (
    <div className="relative z-10 w-full flex items-center justify-center py-2 px-1">
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: [0.35, 0.65, 0.35] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          background: isDark
            ? 'radial-gradient(ellipse at 50% 50%, rgba(107,26,58,0.4) 0%, transparent 70%)'
            : 'radial-gradient(ellipse at 50% 50%, rgba(155,90,110,0.1) 0%, transparent 70%)',
        }}
      />

      <motion.svg
        viewBox="0 0 200 220"
        className="block w-full h-auto relative z-10 max-w-[min(100%,260px)] sm:max-w-[280px] md:max-w-[220px] mx-auto"
        preserveAspectRatio="xMidYMid meet"
        fill="none"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
      >
        {/* Orbital scan ring */}
        <motion.ellipse
          cx="100"
          cy="110"
          rx="88"
          ry="98"
          stroke={isDark ? 'rgba(201,169,110,0.15)' : 'rgba(107,26,58,0.12)'}
          strokeWidth="0.8"
          strokeDasharray="4 8"
          animate={{ rotate: 360 }}
          transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: '100px 110px' }}
        />

        <motion.path
          d="M100 10 L180 50 L180 120 C180 160 140 200 100 210 C60 200 20 160 20 120 L20 50 Z"
          fill={outerFill}
          stroke={outerStroke}
          strokeWidth="1.5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
        <motion.path
          d="M100 30 L160 60 L160 115 C160 148 130 178 100 186 C70 178 40 148 40 115 L40 60 Z"
          fill={innerFill}
          stroke={innerStroke}
          strokeWidth="1"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1, delay: 0.3 }}
        />

        {/* Connection lines to guardians */}
        {GUARDIAN_POINTS.map((pt, i) => (
          <motion.line
            key={pt.label}
            x1="100"
            y1="110"
            x2={pt.cx}
            y2={pt.cy}
            stroke={isDark ? 'rgba(201,169,110,0.12)' : 'rgba(107,26,58,0.1)'}
            strokeWidth="0.8"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 + i * 0.08 }}
          />
        ))}

        <FlowDot path="M100 110 L100 25" color="#C9A96E" duration={2.5} />
        <FlowDot path="M100 110 L165 55" color="#9B2D5A" duration={2.8} delay={0.5} />
        <FlowDot path="M100 110 L165 130" color="#10B981" duration={3} delay={1} />
        <FlowDot path="M100 110 L35 55" color="#C9A96E" duration={2.6} delay={1.5} />

        <motion.text
          x="100"
          y="115"
          textAnchor="middle"
          fill={centerText}
          fontSize="30"
          fontWeight="bold"
          fontFamily="'Playfair Display', Georgia, serif"
          fontStyle="italic"
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          D³
        </motion.text>

        {GUARDIAN_POINTS.map((pt, i) => (
          <motion.g
            key={pt.label}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 + i * 0.1, type: 'spring', stiffness: 260 }}
          >
            <motion.circle
              cx={pt.cx}
              cy={pt.cy}
              r="5"
              fill={pt.color}
              animate={{ r: [4, 5.5, 4], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2 + i * 0.3, repeat: Infinity, ease: 'easeInOut' }}
            />
            <text
              x={pt.cx}
              y={pt.cy - 10}
              textAnchor="middle"
              fill={isDark ? 'rgba(201,169,110,0.55)' : 'rgba(107,26,58,0.45)'}
              fontSize="7"
              fontWeight="600"
            >
              {pt.label}
            </text>
          </motion.g>
        ))}
      </motion.svg>
    </div>
  );
}
