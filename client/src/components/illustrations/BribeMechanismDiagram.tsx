import { motion } from 'framer-motion';
import { FlowDot } from './FlowDot';

type Lang = 'zh' | 'en';

const copy = {
  zh: {
    projects: '项目方',
    gaugePool: 'Gauge 池',
    voters: '投票者',
    rewards: '收益分配',
    bribe: '贿赂 $',
    share: '分成',
    emission: 'D3 排放',
  },
  en: {
    projects: 'Projects',
    gaugePool: 'Gauge Pool',
    voters: 'Voters',
    rewards: 'Rewards',
    bribe: 'Bribe $',
    share: 'Share',
    emission: 'D3 Emission',
  },
} as const;

/** Diagram content bounds — viewBox is cropped to this so mobile centers correctly */
const VB = { x: 0, y: 0, w: 228, h: 198 };

export function BribeMechanismDiagram({ lang, isDark }: { lang: Lang; isDark: boolean }) {
  const t = copy[lang];
  const gold = '#E0568F';
  const burgundy = isDark ? '#E8D5A3' : '#8A2B57';
  const arrow = isDark ? 'rgba(224,86,143,0.7)' : 'rgba(138,43,87,0.55)';
  const dash = isDark ? 'rgba(224,86,143,0.45)' : 'rgba(138,43,87,0.35)';
  const labelMuted = isDark ? 'rgba(224,86,143,0.55)' : 'rgba(138,43,87,0.5)';

  const nodes = [
    {
      x: 24,
      y: 12,
      w: 80,
      h: 40,
      label: t.projects,
      fill: isDark ? 'rgba(224,86,143,0.15)' : 'rgba(224,86,143,0.12)',
      stroke: isDark ? 'rgba(224,86,143,0.45)' : 'rgba(224,86,143,0.6)',
      text: gold,
      delay: 0,
    },
    {
      x: 24,
      y: 77,
      w: 80,
      h: 40,
      label: t.gaugePool,
      fill: isDark ? 'rgba(138,43,87,0.35)' : 'rgba(138,43,87,0.12)',
      stroke: isDark ? 'rgba(178,58,110,0.55)' : 'rgba(138,43,87,0.45)',
      text: burgundy,
      delay: 0.15,
      pulse: true,
    },
    {
      x: 124,
      y: 77,
      w: 80,
      h: 40,
      label: t.voters,
      fill: isDark ? 'rgba(224,86,143,0.12)' : 'rgba(224,86,143,0.08)',
      stroke: isDark ? 'rgba(224,86,143,0.35)' : 'rgba(224,86,143,0.5)',
      text: gold,
      delay: 0.3,
    },
    {
      x: 124,
      y: 147,
      w: 80,
      h: 40,
      label: t.rewards,
      fill: isDark ? 'rgba(16,185,129,0.14)' : 'rgba(16,185,129,0.1)',
      stroke: isDark ? 'rgba(16,185,129,0.4)' : 'rgba(16,185,129,0.55)',
      text: '#10B981',
      delay: 0.45,
    },
  ];

  const cx = (n: (typeof nodes)[0]) => n.x + n.w / 2;
  const labelBg = isDark ? 'rgba(20,13,24,0.92)' : 'rgba(250,247,244,0.95)';

  const edgeLabels = [
    {
      key: 'bribe',
      x: 36,
      y: 64,
      anchor: 'end' as const,
      text: t.bribe,
      fill: isDark ? 'rgba(178,58,110,0.9)' : 'rgba(138,43,87,0.7)',
      fontSize: 9,
      fontWeight: 600,
      w: lang === 'zh' ? 34 : 38,
      h: 12,
      pulse: true,
    },
    {
      key: 'share',
      x: 114,
      y: 106,
      anchor: 'middle' as const,
      text: t.share,
      fill: labelMuted,
      fontSize: 8,
      fontWeight: 600,
      w: lang === 'zh' ? 22 : 26,
      h: 11,
      pulse: false,
    },
    {
      key: 'emission',
      x: 84,
      y: 162,
      anchor: 'middle' as const,
      text: t.emission,
      fill: labelMuted,
      fontSize: 8,
      fontWeight: 600,
      w: lang === 'zh' ? 42 : 52,
      h: 11,
      pulse: false,
    },
  ];

  return (
    <div className="relative z-10 w-full flex items-center justify-center px-1">
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: [0.4, 0.7, 0.4], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          background: isDark
            ? 'radial-gradient(ellipse at 50% 45%, rgba(138,43,87,0.35) 0%, transparent 65%)'
            : 'radial-gradient(ellipse at 50% 45%, rgba(178,58,110,0.12) 0%, transparent 65%)',
        }}
      />

      <motion.svg
        key={lang}
        viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="block w-full h-auto max-w-[min(100%,300px)] md:max-w-[340px] mx-auto"
        fill="none"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
      >
        <motion.path
          d="M64 117 L64 172 L134 172"
          stroke={dash}
          strokeWidth="1.5"
          strokeDasharray="5 4"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1, strokeDashoffset: [0, -18] }}
          transition={{
            pathLength: { duration: 1, delay: 0.5 },
            opacity: { duration: 0.4, delay: 0.5 },
            strokeDashoffset: { duration: 1.8, repeat: Infinity, ease: 'linear', delay: 1.5 },
          }}
        />

        {[
          { d: 'M64 52 L64 72', delay: 0.2 },
          { d: 'M104 97 L124 97', delay: 0.35 },
          { d: 'M164 117 L164 142', delay: 0.5 },
        ].map((line, i) => (
          <motion.path
            key={i}
            d={line.d}
            stroke={arrow}
            strokeWidth="2"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, delay: line.delay }}
          />
        ))}

        <path d="M59 67 L64 72 L69 67" stroke={arrow} strokeWidth="2" strokeLinecap="round" />
        <path d="M119 92 L124 97 L119 102" stroke={arrow} strokeWidth="2" strokeLinecap="round" />
        <path d="M159 137 L164 142 L169 137" stroke={arrow} strokeWidth="2" strokeLinecap="round" />
        <path d="M129 167 L134 172 L129 177" stroke={dash} strokeWidth="1.5" strokeLinecap="round" />

        <FlowDot path="M64 52 L64 72 L64 97" color={gold} duration={2.2} />
        <FlowDot path="M104 97 L124 97 L164 97" color={gold} duration={2.6} delay={0.8} />
        <FlowDot path="M164 117 L164 142 L164 167" color="#10B981" duration={2} delay={1.2} />
        <FlowDot path="M64 117 L64 172 L134 172" color={isDark ? 'rgba(224,86,143,0.6)' : 'rgba(138,43,87,0.45)'} duration={3.2} delay={0.4} />

        {nodes.map((node, i) => (
          <motion.g
            key={`${lang}-${i}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: node.delay, type: 'spring', stiffness: 200 }}
          >
            {'pulse' in node && node.pulse && (
              <motion.rect
                x={node.x - 4}
                y={node.y - 4}
                width={node.w + 8}
                height={node.h + 8}
                rx="12"
                fill="none"
                stroke={isDark ? 'rgba(224,86,143,0.25)' : 'rgba(138,43,87,0.2)'}
                strokeWidth="1"
                animate={{ opacity: [0.3, 0.8, 0.3], scale: [1, 1.04, 1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{ transformOrigin: `${cx(node)}px ${node.y + node.h / 2}px` }}
              />
            )}
            <rect x={node.x} y={node.y} width={node.w} height={node.h} rx="8" fill={node.fill} stroke={node.stroke} strokeWidth="1.5" />
            <text
              x={cx(node)}
              y={node.y + 24}
              textAnchor="middle"
              fill={node.text}
              fontSize={lang === 'en' && node.label.length > 8 ? 9.5 : 11}
              fontWeight="bold"
            >
              {node.label}
            </text>
          </motion.g>
        ))}

        {edgeLabels.map((label) => {
          const rectX =
            label.anchor === 'end'
              ? label.x - label.w
              : label.anchor === 'start'
                ? label.x
                : label.x - label.w / 2;
          const Text = label.pulse ? motion.text : 'text';

          return (
            <g key={label.key}>
              <rect
                x={rectX - 2}
                y={label.y - label.h + 2}
                width={label.w + 4}
                height={label.h + 2}
                rx="3"
                fill={labelBg}
              />
              <Text
                x={label.x}
                y={label.y}
                textAnchor={label.anchor}
                fill={label.fill}
                fontSize={label.fontSize}
                fontWeight={label.fontWeight}
                {...(label.pulse
                  ? {
                      animate: { opacity: [0.55, 1, 0.55] },
                      transition: { duration: 2, repeat: Infinity },
                    }
                  : {})}
              >
                {label.text}
              </Text>
            </g>
          );
        })}
      </motion.svg>
    </div>
  );
}
