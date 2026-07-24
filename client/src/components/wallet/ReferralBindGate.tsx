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
  isReferralRootWallet,
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
    bound: '成功绑定',
    warning: '绑定后不可更改，请仔细核对推荐人地址。',
    errSelf: '不能绑定自己的钱包',
    errInvalid: '请输入有效的以太坊地址',
    errNotRegistered: '该地址尚未注册，请让对方先连接钱包完成注册',
    errRejected: '你取消了绑定交易',
    errAlready: '你已绑定过推荐人',
    errRequired: '请填写推荐人地址或通过推荐链接进入',
    loading: '正在检查推荐关系…',
    disconnect: '断开钱包',
    switchHint: '连错钱包？点此断开后重新连接',
  },
  'zh-TW': {
    title: '綁定推薦人',
    desc: '連接錢包後須綁定一名已註冊的推薦人，關係寫入資料庫且不可更改。',
    fromLink: '來自推薦連結',
    manualLabel: '推薦人錢包地址',
    manualPlaceholder: '0x…',
    confirm: '確認綁定',
    binding: '綁定中…',
    bound: '成功綁定',
    warning: '綁定後不可更改，請仔細核對推薦人地址。',
    errSelf: '不能綁定自己的錢包',
    errInvalid: '請輸入有效的以太坊地址',
    errNotRegistered: '該地址尚未註冊，請讓對方先連接錢包完成註冊',
    errRejected: '你取消了綁定交易',
    errAlready: '你已綁定過推薦人',
    errRequired: '請填寫推薦人地址或通過推薦連結進入',
    loading: '正在檢查推薦關係…',
    disconnect: '斷開錢包',
    switchHint: '連錯錢包？點此斷開後重新連接',
  },
  en: {
    title: 'Bind referrer',
    desc: 'After connecting your wallet you must bind a registered referrer. This is saved to the database and cannot be changed.',
    fromLink: 'From referral link',
    manualLabel: 'Referrer wallet address',
    manualPlaceholder: '0x…',
    confirm: 'Confirm binding',
    binding: 'Binding…',
    bound: 'Bound successfully',
    warning: 'Binding is irreversible. Verify the referrer address carefully.',
    errSelf: 'You cannot refer yourself',
    errInvalid: 'Enter a valid Ethereum address',
    errNotRegistered: 'This address is not registered. Ask them to connect their wallet first.',
    errRejected: 'You cancelled the binding transaction',
    errAlready: 'You are already bound to a referrer',
    errRequired: 'Enter a referrer address or open a referral link',
    loading: 'Checking referral status…',
    disconnect: 'Disconnect',
    switchHint: 'Wrong wallet? Disconnect and reconnect.',
  },
  ja: {
    title: '紹介者を紐付け',
    desc: 'ウォレット接続後、登録済みの紹介者を紐付ける必要があります。データベースに保存され変更できません。',
    fromLink: '紹介リンクから',
    manualLabel: '紹介者ウォレット',
    manualPlaceholder: '0x…',
    confirm: '紐付け確認',
    binding: '紐付け中…',
    bound: '紐付け完了',
    warning: '紐付け後は変更できません。アドレスをご確認ください。',
    errSelf: '自分自身は紹介者にできません',
    errInvalid: '有効なイーサリアムアドレスを入力',
    errNotRegistered: '未登録のアドレスです。先にウォレット接続を依頼してください。',
    errRejected: '取引をキャンセルしました',
    errAlready: 'すでに紹介者が紐付けられています',
    errRequired: '紹介者アドレスを入力するか紹介リンクから入場',
    loading: '紹介関係を確認中…',
    disconnect: '切断',
    switchHint: '違うウォレット？切断して再接続。',
  },
  ko: {
    title: '추천인 연결',
    desc: '지갑 연결 후 등록된 추천인을 반드시 연결해야 합니다. DB에 저장되며 변경할 수 없습니다.',
    fromLink: '추천 링크에서',
    manualLabel: '추천인 지갑 주소',
    manualPlaceholder: '0x…',
    confirm: '연결 확인',
    binding: '연결 중…',
    bound: '연결 완료',
    warning: '연결 후 변경 불가. 추천인 주소를 확인하세요.',
    errSelf: '본인 지갑은 추천인이 될 수 없습니다',
    errInvalid: '유효한 이더리움 주소를 입력하세요',
    errNotRegistered: '등록되지 않은 주소입니다. 먼저 지갑 연결을 요청하세요.',
    errRejected: '거래를 취소했습니다',
    errAlready: '이미 추천인이 연결되어 있습니다',
    errRequired: '추천인 주소를 입력하거나 추천 링크로 접속하세요',
    loading: '추천 관계 확인 중…',
    disconnect: '연결 해제',
    switchHint: '잘못된 지갑? 연결을 해제하고 다시 연결하세요.',
  },
  th: {
    title: 'ผูกผู้แนะนำ',
    desc: 'หลังเชื่อมกระเป๋าต้องผูกผู้แนะนำที่ลงทะเบียนแล้ว บันทึกในฐานข้อมูลและแก้ไขไม่ได้',
    fromLink: 'จากลิงก์แนะนำ',
    manualLabel: 'ที่อยู่กระเป๋าผู้แนะนำ',
    manualPlaceholder: '0x…',
    confirm: 'ยืนยันการผูก',
    binding: 'กำลังผูก…',
    bound: 'ผูกสำเร็จ',
    warning: 'ผูกแล้วแก้ไขไม่ได้ ตรวจสอบที่อยู่ให้ถูกต้อง',
    errSelf: 'ไม่สามารถแนะนำตัวเองได้',
    errInvalid: 'กรอกที่อยู่ Ethereum ที่ถูกต้อง',
    errNotRegistered: 'ที่อยู่นี้ยังไม่ลงทะเบียน ให้เชื่อมกระเป๋าก่อน',
    errRejected: 'คุณยกเลิกธุรกรรม',
    errAlready: 'คุณผูกผู้แนะนำแล้ว',
    errRequired: 'กรอกที่อยู่ผู้แนะนำหรือเปิดจากลิงก์แนะนำ',
    loading: 'กำลังตรวจสอบความสัมพันธ์…',
    disconnect: 'ตัดการเชื่อมต่อ',
    switchHint: 'ผิดกระเป๋า? ตัดการเชื่อมต่อแล้วเชื่อมใหม่',
  },
  // TODO(i18n): en placeholders below — replace with real translations.
  vi: {
    title: "Liên kết người giới thiệu",
    desc: "Sau khi kết nối ví, bạn phải liên kết một người giới thiệu đã đăng ký. Thông tin được lưu vào cơ sở dữ liệu và không thể thay đổi.",
    fromLink: "Từ liên kết giới thiệu",
    manualLabel: "Địa chỉ ví người giới thiệu",
    manualPlaceholder: "0x…",
    confirm: "Xác nhận liên kết",
    binding: "Đang liên kết…",
    bound: "Liên kết thành công",
    warning: "Liên kết không thể thay đổi. Hãy kiểm tra kỹ địa chỉ người giới thiệu.",
    errSelf: "Bạn không thể tự giới thiệu chính mình",
    errInvalid: "Nhập một địa chỉ Ethereum hợp lệ",
    errNotRegistered: "Địa chỉ này chưa đăng ký. Hãy yêu cầu họ kết nối ví trước.",
    errRejected: "Bạn đã hủy giao dịch liên kết",
    errAlready: "Bạn đã liên kết người giới thiệu",
    errRequired: "Nhập địa chỉ người giới thiệu hoặc vào bằng liên kết giới thiệu",
    loading: "Đang kiểm tra quan hệ giới thiệu…",
    disconnect: "Ngắt kết nối",
    switchHint: "Nhầm ví? Ngắt kết nối và kết nối lại.",
  },
  ru: {
    title: "Привязка реферера",
    desc: "После подключения кошелька необходимо привязать зарегистрированного реферера. Привязка сохраняется в базе данных и не может быть изменена.",
    fromLink: "Из реферальной ссылки",
    manualLabel: "Адрес кошелька реферера",
    manualPlaceholder: "0x…",
    confirm: "Подтвердить привязку",
    binding: "Привязка…",
    bound: "Привязка выполнена",
    warning: "Привязка необратима. Внимательно проверьте адрес реферера.",
    errSelf: "Нельзя указать себя как реферера",
    errInvalid: "Введите корректный Ethereum-адрес",
    errNotRegistered: "Этот адрес не зарегистрирован. Попросите владельца сначала подключить кошелёк.",
    errRejected: "Вы отменили транзакцию привязки",
    errAlready: "У вас уже есть привязанный реферер",
    errRequired: "Введите адрес реферера или откройте реферальную ссылку",
    loading: "Проверка реферального статуса…",
    disconnect: "Отключить",
    switchHint: "Не тот кошелёк? Отключитесь и подключитесь заново.",
  },
  fr: {
    title: "Lier un parrain",
    desc: "Après avoir connecté votre wallet, vous devez lier un parrain enregistré. Ce lien est sauvegardé en base de données et ne peut plus être modifié.",
    fromLink: "Depuis le lien de parrainage",
    manualLabel: "Adresse du wallet du parrain",
    manualPlaceholder: "0x…",
    confirm: "Confirmer la liaison",
    binding: "Liaison en cours…",
    bound: "Liaison réussie",
    warning: "La liaison est irréversible. Vérifiez soigneusement l'adresse du parrain.",
    errSelf: "Vous ne pouvez pas être votre propre parrain",
    errInvalid: "Saisissez une adresse Ethereum valide",
    errNotRegistered: "Cette adresse n'est pas enregistrée. Demandez à la personne de connecter d'abord son wallet.",
    errRejected: "Vous avez annulé la transaction de liaison",
    errAlready: "Vous êtes déjà lié à un parrain",
    errRequired: "Saisissez une adresse de parrain ou ouvrez un lien de parrainage",
    loading: "Vérification du statut de parrainage…",
    disconnect: "Déconnecter",
    switchHint: "Mauvais wallet ? Déconnectez-vous et reconnectez-vous.",
  },
  de: {
    title: "Empfehler binden",
    desc: "Nach dem Verbinden deines Wallets musst du einen registrierten Empfehler binden. Dies wird in der Datenbank gespeichert und kann nicht geändert werden.",
    fromLink: "Vom Empfehlungslink",
    manualLabel: "Wallet-Adresse des Empfehlers",
    manualPlaceholder: "0x…",
    confirm: "Bindung bestätigen",
    binding: "Wird gebunden…",
    bound: "Erfolgreich gebunden",
    warning: "Die Bindung ist unwiderruflich. Prüfe die Empfehler-Adresse sorgfältig.",
    errSelf: "Du kannst dich nicht selbst empfehlen",
    errInvalid: "Gib eine gültige Ethereum-Adresse ein",
    errNotRegistered: "Diese Adresse ist nicht registriert. Bitte die Person, zuerst ihr Wallet zu verbinden.",
    errRejected: "Du hast die Bindungstransaktion abgebrochen",
    errAlready: "Du bist bereits an einen Empfehler gebunden",
    errRequired: "Gib eine Empfehler-Adresse ein oder öffne einen Empfehlungslink",
    loading: "Empfehlungsstatus wird geprüft…",
    disconnect: "Trennen",
    switchHint: "Falsches Wallet? Trennen und neu verbinden.",
  },
  es: {
    title: "Vincular referente",
    desc: "Tras conectar tu billetera debes vincular un referente registrado. Se guarda en la base de datos y no se puede cambiar.",
    fromLink: "Desde enlace de referido",
    manualLabel: "Dirección de billetera del referente",
    manualPlaceholder: "0x…",
    confirm: "Confirmar vinculación",
    binding: "Vinculando…",
    bound: "Vinculado con éxito",
    warning: "La vinculación es irreversible. Verifica con cuidado la dirección del referente.",
    errSelf: "No puedes referirte a ti mismo",
    errInvalid: "Introduce una dirección de Ethereum válida",
    errNotRegistered: "Esta dirección no está registrada. Pídele que conecte su billetera primero.",
    errRejected: "Cancelaste la transacción de vinculación",
    errAlready: "Ya estás vinculado a un referente",
    errRequired: "Introduce una dirección de referente o abre un enlace de referido",
    loading: "Verificando estado de referido…",
    disconnect: "Desconectar",
    switchHint: "¿Billetera equivocada? Desconéctate y vuelve a conectar.",
  },
} as const;

function t(lang: keyof typeof copy, key: keyof (typeof copy)['en']) {
  return copy[lang]?.[key] ?? copy.en[key];
}

function ReferralBindScreen({ onBound }: { onBound: () => void }) {
  const { wallet, shortAddress, disconnect } = useWallet();
  const { lang } = useAppLang();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const legacy = toLegacyLang(lang);

  const [sponsorInput, setSponsorInput] = useState(() => getPendingReferral() ?? '');
  const [fromLink, setFromLink] = useState(() => Boolean(getPendingReferral()));
  const [binding, setBinding] = useState(false);
  const [bound, setBound] = useState(false);
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
      // Show a "成功绑定" success state briefly before leaving the bind screen.
      setBound(true);
      window.setTimeout(onBound, 1000);
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
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2 className="site-content-title">{t(lang, 'title')}</h2>
          <button
            type="button"
            onClick={() => disconnect()}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
              isDark
                ? 'bg-white/10 text-white/80 hover:bg-white/15'
                : 'bg-[#160510]/8 text-[#160510]/70 hover:bg-[#160510]/12'
            }`}
            title={t(lang, 'switchHint')}
          >
            {shortAddress ? <span className="font-mono">{shortAddress}</span> : null}
            <span>· {t(lang, 'disconnect')}</span>
          </button>
        </div>
        <p className={`text-xs mb-2 leading-relaxed ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
          {t(lang, 'desc')}
        </p>
        <p className={`text-[10px] mb-5 ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>
          {t(lang, 'switchHint')}
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
          variant={bound ? 'success' : 'primary'}
          className="w-full !py-3.5"
          disabled={binding || bound || !sponsor}
          onClick={() => void handleBind()}
        >
          {bound ? `✓ ${t(lang, 'bound')}` : binding ? t(lang, 'binding') : t(lang, 'confirm')}
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
  const { hasReferralBound, loading, error, refetch } = useReferralStatus(wallet);
  const isZh = toLegacyLang(lang) === 'zh';

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

  // Genesis root(s) have no sponsor — they skip the bind gate and log in directly.
  if (isReferralRootWallet(wallet)) {
    return <>{children}</>;
  }

  if (loading || isConnecting) {
    return (
      <div className={`min-h-[100dvh] flex items-center justify-center ${isDark ? 'bg-dark-gradient' : 'bg-light-gradient'}`}>
        <PartnerReferralLoading label={t(lang, 'loading')} isDark={isDark} />
      </div>
    );
  }

  // A fetch failure (expired session / network) is NOT "unbound" — never show the
  // bind screen here, or an already-bound user would be told to bind again. Offer retry.
  if (error) {
    return (
      <div
        className={`min-h-[100dvh] flex flex-col items-center justify-center gap-4 px-6 text-center ${
          isDark ? 'bg-dark-gradient text-white/70' : 'bg-light-gradient text-[#160510]/70'
        }`}
      >
        <p className="text-sm">
          {isZh ? '加载账户信息失败，请重试。' : 'Failed to load your account. Please retry.'}
        </p>
        <GlassButton variant="primary" className="!px-6 !py-3" onClick={() => refetch()}>
          {isZh ? '重试' : 'Retry'}
        </GlassButton>
      </div>
    );
  }

  if (!hasReferralBound) {
    return <ReferralBindScreen onBound={refetch} />;
  }

  return <>{children}</>;
}
