import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { Clock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { useWallet } from '@/contexts/wallet-context';
import { usePartnerMembership } from '@/hooks/usePartnerMembership';
import {
  AI_TRIAL_DAYS,
  getAiTrialDaysRemaining,
  hasAiTrialStarted,
  isAiTrialExpired,
  startAiTrial,
} from '@/lib/aiTrialAccess';

type AiTrialContextValue = {
  showBanner: boolean;
  daysRemaining: number;
};

const AiTrialContext = createContext<AiTrialContextValue>({
  showBanner: false,
  daysRemaining: 0,
});

export function useAiTrialContext() {
  return useContext(AiTrialContext);
}

export function AiTrialBanner() {
  const { t } = useTranslation();
  const { showBanner, daysRemaining } = useAiTrialContext();
  if (!showBanner) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
      <Clock size={14} className="shrink-0" />
      <span>{t('aiSite.trial.daysLeft', { days: daysRemaining })}</span>
      <span className="hidden sm:inline text-amber-700/70 dark:text-amber-100/70">·</span>
      <span className="hidden sm:inline text-amber-700/80 dark:text-amber-100/80">
        {t('aiSite.trial.bannerHint')}
      </span>
    </div>
  );
}

function TrialLoading() {
  const { t } = useTranslation();
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <Spinner className="size-8 text-primary" />
      <p className="text-sm text-muted-foreground">{t('aiSite.trial.loading')}</p>
    </div>
  );
}

function TrialExpiredScreen({ onPartner, onPortal }: { onPartner: () => void; onPortal: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Clock size={24} />
      </div>
      <h2 className="text-lg font-bold tracking-tight">{t('aiSite.trial.expiredTitle')}</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{t('aiSite.trial.expiredBody')}</p>
      <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
        <Button onClick={onPartner}>{t('aiSite.trial.activatePartner')}</Button>
        <Button variant="outline" onClick={onPortal}>
          {t('aiSite.backToPortal')}
        </Button>
      </div>
    </div>
  );
}

export function AiTrialGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { wallet } = useWallet();
  const [, navigate] = useLocation();
  const { isPartner, loading: partnerLoading } = usePartnerMembership(wallet);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [trialTick, setTrialTick] = useState(0);

  const trialStarted = hasAiTrialStarted(wallet);
  const daysRemaining = useMemo(() => getAiTrialDaysRemaining(wallet), [wallet, trialTick]);
  const trialExpired = isAiTrialExpired(wallet);
  const showBanner = Boolean(wallet && !isPartner && trialStarted && !trialExpired);

  useEffect(() => {
    if (!wallet || isPartner || partnerLoading) return;
    if (!trialStarted) setWelcomeOpen(true);
  }, [wallet, isPartner, partnerLoading, trialStarted]);

  useEffect(() => {
    if (!wallet || isPartner || !trialStarted || trialExpired) return;
    const id = window.setInterval(() => setTrialTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [wallet, isPartner, trialStarted, trialExpired]);

  const handleStartTrial = () => {
    if (!wallet) return;
    startAiTrial(wallet);
    setWelcomeOpen(false);
    setTrialTick((n) => n + 1);
  };

  const handleWelcomeOpenChange = (open: boolean) => {
    if (open) {
      setWelcomeOpen(true);
      return;
    }
    if (!trialStarted) {
      navigate('/portal');
      return;
    }
    setWelcomeOpen(false);
  };

  const contextValue = useMemo(
    () => ({ showBanner, daysRemaining }),
    [showBanner, daysRemaining],
  );

  if (!wallet) {
    return <AiTrialContext.Provider value={contextValue}>{children}</AiTrialContext.Provider>;
  }
  if (partnerLoading) return <TrialLoading />;

  if (isPartner) {
    return <AiTrialContext.Provider value={contextValue}>{children}</AiTrialContext.Provider>;
  }

  if (trialExpired) {
    return (
      <TrialExpiredScreen
        onPartner={() => navigate('/partner')}
        onPortal={() => navigate('/portal')}
      />
    );
  }

  if (!trialStarted) {
    return (
      <>
        <Dialog open={welcomeOpen} onOpenChange={handleWelcomeOpenChange}>
          <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles size={20} />
              </div>
              <DialogTitle>{t('aiSite.trial.welcomeTitle')}</DialogTitle>
              <DialogDescription className="text-left leading-relaxed">
                {t('aiSite.trial.welcomeBody', { days: AI_TRIAL_DAYS })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button className="w-full" onClick={handleStartTrial}>
                {t('aiSite.trial.startButton')}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => navigate('/portal')}>
                {t('aiSite.backToPortal')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div className="min-h-[60vh]" aria-hidden />
      </>
    );
  }

  return (
    <AiTrialContext.Provider value={contextValue}>{children}</AiTrialContext.Provider>
  );
}
