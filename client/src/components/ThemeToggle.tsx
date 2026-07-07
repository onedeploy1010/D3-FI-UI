/**
 * Theme Toggle Button
 * Sun/Moon icon for switching between light and dark themes
 */
import { useTheme } from '@/contexts/ThemeContext';
import { Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme, switchable } = useTheme();
  
  if (!switchable || !toggleTheme) return null;
  
  return (
    <button
      onClick={toggleTheme}
      className={`relative p-2 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95 ${
        theme === 'dark'
          ? 'bg-white/[0.06] text-white/60 hover:bg-white/[0.1] hover:text-[#C9A96E]'
          : 'bg-[#6B1A3A]/[0.06] text-[#6B1A3A]/60 hover:bg-[#6B1A3A]/[0.1] hover:text-[#6B1A3A]'
      } ${className}`}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      <motion.div
        key={theme}
        initial={{ rotate: -30, opacity: 0, scale: 0.8 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </motion.div>
    </button>
  );
}

