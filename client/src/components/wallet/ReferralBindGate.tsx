import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { PartnerReferralLoading } from '@/components/partner/PartnerReferralLoading';
import { GlassButton } from '@/components/ui/GlassSurface';
import { useTheme } from '@/contexts/ThemeContext';
import { useWallet } from '@/contexts/wallet-context';
import { useReferralStatus } from '@/hooks/useReferralStatus';
import { useAppLang } from '@/i18n/LanguageContext';
import { toLegacyLang } from '@/i18n/types';
import { bindReferral, checkSponsorRegistered } from '@/lib/unionApi';
import {
  bindReferralOnchain,
  isOnchainReferralEnabled,
  isSponsorRegisteredOnchain,
} from '@/lib/referralRegistry';
import { getConnectedWalletClient } from '@/lib/wagmiWallet';
import { isDemoWallet } from '@/lib/demoWallet';
import {
  captureReferralFromUrl,
  clearPendingReferral,
  getPendingReferral,
} from '@/lib/referral';
import { isEthAddress, walletEquals } from '@/lib/wallet';

const copy = {
  'zh-CN': {
    title: '绑定推荐人',
    desc: '连接钱包后须绑定一名已注册的推荐人，关系写入数据库且不可更改。',
    fromLink: '来自推荐链接',
    manualLabel: '推荐人钱包地址',
    manualPlaceholder: '0x…',
    confirm: '确认绑定',
    binding: '绑定中…',
    warning: '绑定后不可更改，请仔细核对推荐人地址。',
    errSelf: '不能绑定自己的钱包',
    errInvalid: '请输入有效的以太坊地址',
    errNotRegistered: '该地址尚未注册，请让对方先连接钱包完成注册',
    errRejected: '你取消了绑定交易',
    errAlready: '你已绑定过推荐人',
    errRequired: '请填写推荐人地址或通过推荐链接进入',
    loading: '正在检查推荐关系…',
  },
  'zh-TW': {
    title: '綁定推薦人',
    desc: '連接錢包後須綁定一名已註冊的推薦人，關係寫入資料庫且不可更改。',
    fromLink: '來自推薦連結',
    manualLabel: '推薦人錢包地址',
    manualPlaceholder: '0x…',
    confirm: '確認綁定',
    binding: '綁定中…',
    warning: '綁定後不可更改，請仔細核對推薦人地址。',
    errSelf: '不能綁定自己的錢包',
    errInvalid: '請輸入有效的以太坊地址',
    errNotRegistered: '該地址尚未註冊，請讓對方先連接錢包完成註冊',
    errRejected: '你取消了綁定交易',
    errAlready: '你已綁定過推薦人',
    errRequired: '請填寫推薦人地址或通過推薦連結進入',
    loading: '正在檢查推薦關係…',
  },
  en: {
    title: 'Bind referrer',
    desc: 'After connecting your wallet you must bind a registered referrer. This is saved to the database and cannot be changed.',
    fromLink: 'From referral link',
    manualLabel: 'Referrer wallet address',
    manualPlaceholder: '0x…',
    confirm: 'Confirm binding',
    binding: 'Binding…',
    warning: 'Binding is irreversible. Verify the referrer address carefully.',
    errSelf: 'You cannot refer yourself',
    errInvalid: 'Enter a valid Ethereum address',
    errNotRegistered: 'This address is not registered. Ask them to connect their wallet first.',
    errRejected: 'You cancelled the binding transaction',
    errAlready: 'You are already bound to a referrer',
    errRequired: 'Enter a referrer address or open a referral link',
    loading: 'Checking referral status…',
  },
  ja: {
    title: '紹介者を紐付け',
    desc: 'ウォレット接続後、登録済みの紹介者を紐付ける必要があります。データベースに保存され変更できません。',
    fromLink: '紹介リンクから',
    manualLabel: '紹介者ウォレット',
    manualPlaceholder: '0x…',
    confirm: '紐付け確認',
    binding: '紐付け中…',
    warning: '紐付け後は変更できません。アドレスをご確認ください。',
    errSelf: '自分自身は紹介者にできません',
    errInvalid: '有効なイーサリアムアドレスを入力',
    errNotRegistered: '未登録のアドレスです。先にウォレット接続を依頼してください。',
    errRejected: '取引をキャンセルしました',
    errAlready: 'すでに紹介者が紐付けられています',
    errRequired: '紹介者アドレスを入力するか紹介リンクから入場',
    loading: '紹介関係を確認中…',
  },
  ko: {
    title: '추천인 연결',
    desc: '지갑 연결 후 등록된 추천인을 반드시 연결해야 합니다. DB에 저장되며 변경할 수 없습니다.',
    fromLink: '추천 링크에서',
    manualLabel: '추천인 지갑 주소',
    manualPlaceholder: '0x…',
    confirm: '연결 확인',
    binding: '연결 중…',
    warning: '연결 후 변경 불가. 추천인 주소를 확인하세요.',
    errSelf: '본인 지갑은 추천인이 될 수 없습니다',
    errInvalid: '유효한 이더리움 주소를 입력하세요',
    errNotRegistered: '등록되지 않은 주소입니다. 먼저 지갑 연결을 요청하세요.',
    errRejected: '거래를 취소했습니다',
    errAlready: '이미 추천인이 연결되어 있습니다',
    errRequired: '추천인 주소를 입력하거나 추천 링크로 접속하세요',
    loading: '추천 관계 확인 중…',
  },
  th: {
    title: 'ผูกผู้แนะนำ',
    desc: 'หลังเชื่อมกระเป๋าต้องผูกผู้แนะนำที่ลงทะเบียนแล้ว บันทึกในฐานข้อมูลและแก้ไขไม่ได้',
    fromLink: 'จากลิงก์แนะนำ',
    manualLabel: 'ที่อยู่กระเป๋าผู้แนะนำ',
    manualPlaceholder: '0x…',
    confirm: 'ยืนยันการผูก',
    binding: 'กำลังผูก…',
    warning: 'ผูกแล้วแก้ไขไม่ได้ ตรวจสอบที่อยู่ให้ถูกต้อง',
    errSelf: 'ไม่สามารถแนะนำตัวเองได้',
    errInvalid: 'กรอกที่อยู่ Ethereum ที่ถูกต้อง',
    errNotRegistered: 'ที่อยู่นี้ยังไม่ลงทะเบียน ให้เชื่อมกระเป๋าก่อน',
    errRejected: 'คุณยกเลิกธุรกรรม',
    errAlready: 'คุณผูกผู้แนะนำแล้ว',
    errRequired: 'กรอกที่อยู่ผู้แนะนำหรือเปิดจากลิงก์แนะนำ',
    loading: 'กำลังตรวจสอบความสัมพันธ์…',
  },
} as const;

function t(lang: keyof typeof copy, key: keyof (typeof copy)['en']) {
  return copy[lang]?.[key] ?? copy.en[key];
}

function ReferralBindScreen({ onBound }: { onBound: () => void }) {
  const { wallet } = useWallet();
  const { lang } = useAppLang();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const legacy = toLegacyLang(lang);

  const [sponsorInput, setSponsorInput] = useState(() => getPendingReferral() ?? '');
  const [fromLink, setFromLink] = useState(() => Boolean(getPendingReferral()));
  const [binding, setBinding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    captureReferralFromUrl();
    const pending = getPendingReferral();
    if (pending) {
      setSponsorInput(pending);
      setFromLink(true);
    }
  }, []);

  const sponsor = sponsorInput.trim();

  const handleBind = useCallback(async () => {
    if (!wallet) return;
    setError(null);

    if (!sponsor || !isEthAddress(sponsor)) {
      setError(t(lang, 'errInvalid'));
      return;
    }
    if (walletEquals(wallet, sponsor)) {
      setError(t(lang, 'errSelf'));
      return;
    }

    setBinding(true);
    try {
      // Sponsor validity: on-chain registry is the source of truth when configured
      // (a genesis root has no off-chain profile but IS a valid upline). Fall back
      // to the backend profile check only when there is no on-chain registry.
      const onchain = isOnchainReferralEnabled();
      const registered = onchain
        ? await isSponsorRegisteredOnchain(sponsor)
        : (await checkSponsorRegistered(sponsor)).registered;
      if (!registered) {
        setError(t(lang, 'errNotRegistered'));
        return;
      }

      // On-chain binding: user calls bind() and pays gas; then backend verifies + syncs.
      let txHash: string | undefined;
      if (onchain) {
        const walletClient = await getConnectedWalletClient();
        if (!walletClient) {
          setError(t(lang, 'errInvalid'));
          return;
        }
        txHash = await bindReferralOnchain(walletClient, sponsor);
      }

      await bindReferral(wallet, sponsor, 'partner', txHash);
      clearPendingReferral();
      onBound();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const lower = msg.toLowerCase();
      if (lower.includes('rejected') || lower.includes('denied')) {
        setError(t(lang, 'errRejected'));
      } else if (msg.includes('not registered') || msg.includes('not found') || msg.includes('UplineNotRegistered')) {
        setError(t(lang, 'errNotRegistered'));
      } else if (msg.includes('yourself') || msg.includes('SelfBind')) {
        setError(t(lang, 'errSelf'));
      } else if (msg.includes('AlreadyBound')) {
        setError(t(lang, 'errAlready'));
      } else {
        setError(msg);
      }
    } finally {
      setBinding(false);
    }
  }, [wallet, sponsor, lang, onBound]);

  return (
    <div
      className={`min-h-[100dvh] flex items-center justify-center page-px py-12 ${
        isDark ? 'bg-dark-gradient text-[#F5F0EB]' : 'bg-light-gradient text-foreground'
      }`}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="ios-glass-card ios-glass-highlight w-full max-w-md rounded-3xl p-6 relative"
      >
        <span className="ios-glass-sheen pointer-events-none" aria-hidden />
        <h2 className="site-content-title mb-2">{t(lang, 'title')}</h2>
        <p className={`text-xs mb-5 leading-relaxed ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
          {t(lang, 'desc')}
        </p>

        {fromLink && sponsor && isEthAddress(sponsor) ? (
          <div className="mb-4">
            <AddressBlock label={t(lang, 'fromLink')} value={sponsor} isDark={isDark} />
          </div>
        ) : (
          <div className="mb-4">
            <label className={`block text-[10px] font-semibold mb-2 ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>
              {t(lang, 'manualLabel')}
            </label>
            <input
              type="text"
              value={sponsorInput}
              onChange={(e) => {
                setFromLink(false);
                setSponsorInput(e.target.value);
                setError(null);
              }}
              placeholder={t(lang, 'manualPlaceholder')}
              className={`w-full partner-depth-inset px-3 py-3 text-sm rounded-xl outline-none font-mono ${
                isDark ? 'text-white bg-transparent' : 'text-[#160510]'
              }`}
              spellCheck={false}
              autoCapitalize="off"
            />
          </div>
        )}

        <div className={`ios-glass-inset text-[11px] mb-5 px-3 py-2.5 ${isDark ? 'text-[#E0568F]/75' : 'text-[#8A2B57]/75'}`}>
          ⚠️ {t(lang, 'warning')}
        </div>

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

        <GlassButton
          variant="primary"
          className="w-full !py-3.5"
          disabled={binding || !sponsor}
          onClick={() => void handleBind()}
        >
          {binding ? t(lang, 'binding') : t(lang, 'confirm')}
        </GlassButton>

        <p className={`text-[10px] mt-4 text-center ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>
          {legacy === 'zh' ? '您的钱包' : 'Your wallet'}: {wallet}
        </p>
      </motion.div>
    </div>
  );
}

export function ReferralBindGate({ children }: { children: ReactNode }) {
  const { wallet, isConnected, isConnecting } = useWallet();
  const { lang } = useAppLang();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { hasReferralBound, loading, refetch } = useReferralStatus(wallet);

  // The authed /profile fetch needs the SIWE session, which is established
  // asynchronously on connect. Re-check referral status once sign-in settles so a
  // returning (already-bound) user never flashes the bind screen on a 401.
  const prevConnecting = useRef(isConnecting);
  useEffect(() => {
    if (prevConnecting.current && !isConnecting) refetch();
    prevConnecting.current = isConnecting;
  }, [isConnecting, refetch]);

  if (!isConnected || !wallet || isDemoWallet(wallet)) {
    return <>{children}</>;
  }

  if (loading || isConnecting) {
    return (
      <div className={`min-h-[100dvh] flex items-center justify-center ${isDark ? 'bg-dark-gradient' : 'bg-light-gradient'}`}>
        <PartnerReferralLoading label={t(lang, 'loading')} isDark={isDark} />
      </div>
    );
  }

  if (!hasReferralBound) {
    return <ReferralBindScreen onBound={refetch} />;
  }

  return <>{children}</>;
}
