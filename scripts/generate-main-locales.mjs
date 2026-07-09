/**
 * Generates zh-TW, ja, ko, th locale files for landing + partner from zh-CN/en sources.
 * Run: node scripts/generate-main-locales.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../client/src/i18n/locales');

const s2tPairs = [
  ['协议', '協議'], ['代币', '代幣'], ['路线图', '路線圖'], ['文档', '文檔'], ['连接钱包', '連接錢包'],
  ['真实收益', '真實收益'], ['链上可查', '鏈上可查'], ['连接钱包', '連接錢包'], ['阅读白皮书', '閱讀白皮書'],
  ['贿赂池', '賄賂池'], ['流通量', '流通量'], ['持有者', '持有者'], ['累计分红', '累計分紅'],
  ['为什么是贿赂金融', '為什麼是賄賂金融'], ['灰色地带', '灰色地帶'], ['项目方', '項目方'], ['投票者', '投票者'],
  ['付费', '付費'], ['分享', '分享'], ['智能合约', '智能合約'], ['三种入场方式', '三種入場方式'],
  ['选择最适合', '選擇最適合'], ['现货', '現貨'], ['直接购买', '直接購買'], ['代币', '代幣'], ['即时', '即時'],
  ['零滑点', '零滑點'], ['即时到账', '即時到賬'], ['无锁仓', '無鎖倉'], ['债券', '債券'], ['流动性', '流動性'],
  ['折扣', '折扣'], ['线性释放', '線性釋放'], ['双重收益', '雙重收益'], ['销毁', '銷毀'], ['高级', '高級'],
  ['通缩', '通縮'], ['长期价值', '長期價值'], ['六重价值守护', '六重價值守護'], ['全方位', '全方位'],
  ['用户资产', '用戶資產'], ['安全防护', '安全防護'], ['入场门控', '入場門控'], ['智能准入', '智能準入'],
  ['白名单', '白名單'], ['锁仓封印', '鎖倉封印'], ['时间锁定', '時間鎖定'], ['通缩燃烧', '通縮燃燒'],
  ['持续销毁', '持續銷毀'], ['每笔交易', '每筆交易'], ['频率限制', '頻率限制'], ['防闪电贷', '防閃電貸'],
  ['冷却期', '冷卻期'], ['链上透明', '鏈上透明'], ['全程可查', '全程可查'], ['实时审计', '即時審計'],
  ['紧急熔断', '緊急熔斷'], ['极端保护', '極端保護'], ['多签触发', '多簽觸發'], ['发展路线图', '發展路線圖'],
  ['协议启动', '協議啟動'], ['核心合约', '核心合約'], ['代币发行', '代幣發行'], ['初始流动性', '初始流動性'],
  ['生态扩展', '生態擴展'], ['贿赂市场', '賄賂市場'], ['投票治理', '投票治理'], ['合作伙伴', '合作夥伴'],
  ['全球化', '全球化'], ['多链部署', '多鏈部署'], ['机构合作', '機構合作'], ['去中心化治理', '去中心化治理'],
  ['完全社区治理', '完全社區治理'], ['协议自治', '協議自治'], ['常见问题', '常見問題'],
  ['什么是贿赂金融', '什麼是賄賂金融'], ['合规化', '合規化'], ['创新模式', '創新模式'],
  ['公开透明', '公開透明'], ['流动性支持', '流動性支持'], ['有什么用途', '有什麼用途'],
  ['治理代币', '治理代幣'], ['锁仓获得', '鎖倉獲得'], ['参与投票', '參與投票'], ['收益分成', '收益分成'],
  ['享受协议分红', '享受協議分紅'], ['通缩属性', '通縮屬性'], ['如何参与分红', '如何參與分紅'],
  ['分红代币', '分紅代幣'], ['自动参与', '自動參與'], ['每期分红', '每期分紅'], ['手续费', '手續費'],
  ['溢出', '溢出'], ['合作收入', '合作收入'], ['多个渠道', '多個渠道'], ['安全性如何保障', '安全性如何保障'],
  ['六重安全机制', '六重安全機制'], ['保护用户资产', '保護用戶資產'], ['资源', '資源'], ['社区', '社區'],
  ['法律', '法律'], ['白皮书', '白皮書'], ['开发文档', '開發文檔'], ['审计报告', '審計報告'],
  ['服务条款', '服務條款'], ['隐私政策', '隱私政策'], ['免责声明', '免責聲明'],
  ['去中心化贿赂金融协议', '去中心化賄賂金融協議'], ['将 DeFi', '將 DeFi'], ['阳光化', '陽光化'],
  ['每一分收益都有来源', '每一分收益都有來源'], ['每一笔分红都可追溯', '每一筆分紅都可追溯'],
];

function s2t(str) {
  if (typeof str !== 'string') return str;
  let out = str;
  for (const [a, b] of s2tPairs) out = out.split(a).join(b);
  return out;
}

function walk(obj, fn) {
  if (typeof obj === 'string') return fn(obj);
  if (Array.isArray(obj)) return obj.map((v) => walk(v, fn));
  if (obj && typeof obj === 'object') {
    const n = {};
    for (const [k, v] of Object.entries(obj)) n[k] = walk(v, fn);
    return n;
  }
  return obj;
}

const partnerJa = {
  'program.title': 'パートナープログラム', 'program.partner': 'パートナー', 'program.staked': 'ステーク済み',
  'tabs.home': 'ホーム', 'tabs.stake': 'クラウドファンド', 'tabs.assets': '資産', 'tabs.team': 'チーム',
  'referral.required': 'まずポータルで紹介リンクからウォレットを接続してください',
  'home.badge': 'D3 賄賂金融 · パートナー', 'home.headline': '均衡収益 · 投資家保護 · 貢献者支援',
  'home.subline': 'クラウドファンド期間は日次0.4%静的収益。上場後は通常水準に。始値=調達額÷105万トークン。',
  'home.benefitsTitle': '入盟特典', 'home.tiersTitle': '受賄金ティア', 'home.becomePartner': 'パートナーになる',
  'home.becomeDesc': '{fee} USDTの入盟金で配置・受賄sD3・チーム機能を解放。',
  'home.goJoin': 'クラウドファンドへ · 申請', 'home.isPartner': 'パートナー有効',
  'benefit.globalTree': '全网配置', 'benefit.price': '5U価格', 'benefit.static': '0.4%静的',
  'benefit.antibribe': '受賄金支援', 'benefit.investor': '投資家保護', 'benefit.contract': '公開契約',
  'tier.volume': '出来高', 'stake.crowdfund': 'クラウドファンド', 'stake.partner': '入盟', 'stake.mine': 'マイ',
  'stake.treasury': '受取（マルチシグ）', 'stake.usdtTitle': 'USDTステーク', 'stake.lockHint': '日/件ロック · 最低 ',
  'stake.stakeBtn': 'ステーク', 'stake.joinTitle': 'パートナー入盟', 'stake.joinSubtitle': '一回限り入盟金',
  'stake.joinDesc': '配置・sD3・チーム・資産を解放。入盟金は別途ロックし静的収益を享受。',
  'stake.joinFee': '入盟金', 'stake.payJoin': '支払って入盟', 'stake.noStake': 'ステークなし',
  'stake.total': '合計', 'stake.daily': '日次', 'stake.orders': '注文', 'stake.daysEach': '日/件',
  'stake.perDay': '日', 'stake.daysLeft': '日残', 'stake.confirmPay': '支払い確認', 'stake.cancel': 'キャンセル',
  'stake.paying': '支払い中…', 'stake.confirm': '確認', 'stake.kind.crowdfund': 'CF', 'stake.kind.join': '入盟', 'stake.kind.sd3': 'sD3',
  'assets.partnersOnly': 'パートナーのみ', 'assets.overview': '概要', 'assets.subsidy': '補助', 'assets.history': '履歴',
  'assets.sd3Stake': 'ステーク', 'assets.sd3Transfer': '送金', 'assets.all': 'すべて',
  'assets.sd3StakeHist': 'sD3ステーク', 'assets.transferHist': '送金', 'assets.assetsOverview': '資産概要',
  'assets.dailyUsdt': '日次USDT', 'assets.totalSd3': '累計sD3', 'assets.antibribe': '受賄金',
  'assets.antibribeDesc': 'プールへステークまたは傘下へ送金', 'assets.available': '利用可能',
  'assets.staked': 'ステーク済', 'assets.stakeQuota': 'ステーク枠', 'assets.transferQuota': '送金枠',
  'assets.canStake': 'ステーク可能', 'assets.amount': '数量', 'assets.confirmStake': 'クラウドファンドへステーク',
  'assets.transferHint': '送金枠は傘下メンバーのクラウドファンド参加に使用可能。',
  'assets.canTransfer': '送金可能', 'assets.downline': '傘下アドレス', 'assets.transferAmount': '送金数量',
  'assets.confirmTransfer': '傘下へ送金', 'assets.search': '金額/アドレス検索', 'assets.noRecords': '記録なし', 'assets.unlock': 'アンロック',
  'subsidy.partnerTitle': 'パートナー補助', 'subsidy.partnerDesc': '新規業績の10%（会場・食事・会議）実費精算。',
  'subsidy.marketTitle': '市場リーダー補助', 'subsidy.marketDesc': '新規業績5%・管理者承認リーダーのみ。',
  'subsidy.quota': '枠', 'subsidy.used': '申請済', 'subsidy.cap': '上限', 'subsidy.perf': '業績',
  'subsidy.apply': '補助申請', 'subsidy.history': '申請履歴', 'subsidy.noHistory': '申請記録なし',
  'subsidy.paid': '入金済', 'subsidy.leaderPending': 'リーダー資格審査中',
  'subsidy.leaderNone': 'リーダー資格未承認・管理者へ連絡',
  'subsidy.modal.partner': 'パートナー補助申請', 'subsidy.modal.market': '市場補助申請',
  'subsidy.quota10': '枠（10%）', 'subsidy.quota5': '枠（5%）', 'subsidy.amountUsdt': '金額 (USDT)',
  'subsidy.purpose': '用途', 'subsidy.purposePlaceholder': '会場/食事/会議の詳細',
  'subsidy.submit': '送信', 'subsidy.err.purpose': '用途を入力', 'subsidy.err.amount': '有効な金額を入力',
  'subsidy.err.quota': '枠超過', 'status.pending': '審査中', 'status.approved': '承認済', 'status.rejected': '却下', 'status.paid': '入金済',
  'tier.proBribe': 'プロ賄賂担当', 'tier.seniorBribe': '上級賄賂担当', 'tier.director': '賄賂ディレクター', 'tier.chief': 'チーフ',
  'team.partnersOnly': 'パートナー限定', 'team.performance': '業績', 'team.tree': '紹介ツリー',
  'team.teamTotal': '傘下累計', 'team.todayNew': '当日新增', 'team.yesterdaySd3': '昨日決済 sD3',
  'team.sd3History': 'sD3 決済履歴一覧', 'team.sd3HistoryEmpty': '決済記録はありません',
  'team.sd3HistoryNewPerf': '新規業績 {amount}',
  'team.referralTitle': '紹介リンク', 'team.referralDesc': 'リンクから接続・紐付け後、直紹介の傘下として参加できます。',
  'tree.title': '紹介ツリー', 'tree.teamPerf': '傘下業績', 'tree.up': '上へ', 'tree.root': '自分へ',
  'tree.search': 'アドレス / 名前', 'tree.noMatch': '該当なし', 'tree.noDownline': '下線なし',
  'tree.direct': '直紹介', 'tree.team': '傘下', 'tree.open': '開く',
  'tree.layer': '第 {depth} 層', 'tree.layerMe': '第 {depth} 層 · 自分', 'tree.loading': 'チーム読み込み中…',
};

const partnerKo = {
  'program.title': '파트너 프로그램', 'program.partner': '파트너', 'program.staked': '스테이킹됨',
  'tabs.home': '홈', 'tabs.stake': '크라우드펀드', 'tabs.assets': '자산', 'tabs.team': '팀',
  'referral.required': '먼저 포털에서 추천 링크로 지갑을 연결하세요',
  'home.badge': 'D3 뇌물 금융 · 파트너', 'home.headline': '균형 수익 · 투자자 보호 · 기여자 지원',
  'home.subline': '크라우드펀드 기간 일 0.4% 정적 수익. 상장 후 정상 수준. 시가=모금액÷105만 토큰.',
  'home.benefitsTitle': '가입 혜택', 'home.tiersTitle': '반뇌물 등급', 'home.becomePartner': '파트너 되기',
  'home.becomeDesc': '{fee} USDT 가입금으로 배치·반뇌물 sD3·팀 기능 해제.',
  'home.goJoin': '크라우드펀드 · 신청', 'home.isPartner': '파트너 활성',
  'benefit.globalTree': '전망 배치', 'benefit.price': '5U 가격', 'benefit.static': '0.4% 정적',
  'benefit.antibribe': '반뇌물 지원', 'benefit.investor': '투자자 보호', 'benefit.contract': '공개 계약',
  'tier.volume': '실적', 'stake.crowdfund': '크라우드펀드', 'stake.partner': '가입', 'stake.mine': '내',
  'stake.treasury': '수취(멀티시그)', 'stake.usdtTitle': 'USDT 스테이킹', 'stake.lockHint': '일/건 잠금 · 최소 ',
  'stake.stakeBtn': '스테이킹', 'stake.joinTitle': '파트너 가입', 'stake.joinSubtitle': '일회 가입금',
  'stake.joinDesc': '배치·sD3·팀·자산 해제. 가입금 별도 잠금, 정적 수익 동일.',
  'stake.joinFee': '가입금', 'stake.payJoin': '결제 후 가입', 'stake.noStake': '스테이킹 없음',
  'stake.total': '합계', 'stake.daily': '일일', 'stake.orders': '주문', 'stake.daysEach': '일/건',
  'stake.perDay': '일', 'stake.daysLeft': '일 남음', 'stake.confirmPay': '결제 확인', 'stake.cancel': '취소',
  'stake.paying': '결제 중…', 'stake.confirm': '확인', 'stake.kind.crowdfund': 'CF', 'stake.kind.join': '가입', 'stake.kind.sd3': 'sD3',
  'assets.partnersOnly': '파트너 전용', 'assets.overview': '개요', 'assets.subsidy': '보조금', 'assets.history': '기록',
  'assets.sd3Stake': '스테이킹', 'assets.sd3Transfer': '송금', 'assets.all': '전체',
  'assets.sd3StakeHist': 'sD3 스테이킹', 'assets.transferHist': '송금', 'assets.assetsOverview': '자산 개요',
  'assets.dailyUsdt': '일일 USDT', 'assets.totalSd3': '누적 sD3', 'assets.antibribe': '반뇌물',
  'assets.antibribeDesc': '풀 스테이킹 또는 하위 송금', 'assets.available': '가용', 'assets.staked': '스테이킹됨',
  'assets.stakeQuota': '스테이킹 한도', 'assets.transferQuota': '송금 한도', 'assets.canStake': '스테이킹 가능',
  'assets.amount': '수량', 'assets.confirmStake': '크라우드펀드 스테이킹',
  'assets.transferHint': '송금 한도는 하위 멤버 크라우드펀드 참여에 사용.',
  'assets.canTransfer': '송금 가능', 'assets.downline': '하위 주소', 'assets.transferAmount': '송금 수량',
  'assets.confirmTransfer': '하위로 송금', 'assets.search': '금액/주소 검색', 'assets.noRecords': '기록 없음', 'assets.unlock': '잠금 해제',
  'subsidy.partnerTitle': '파트너 보조금', 'subsidy.partnerDesc': '신규 실적 10% (장소·식비·회의) 실비 정산.',
  'subsidy.marketTitle': '시장 리더 보조금', 'subsidy.marketDesc': '신규 실적 5% · 관리자 승인 리더만.',
  'subsidy.quota': '한도', 'subsidy.used': '신청됨', 'subsidy.cap': '상한', 'subsidy.perf': '실적',
  'subsidy.apply': '보조금 신청', 'subsidy.history': '신청 기록', 'subsidy.noHistory': '신청 기록 없음',
  'subsidy.paid': '입금됨', 'subsidy.leaderPending': '리더 자격 심사 중',
  'subsidy.leaderNone': '리더 자격 미승인 · 관리자 문의',
  'subsidy.modal.partner': '파트너 보조금 신청', 'subsidy.modal.market': '시장 보조금 신청',
  'subsidy.quota10': '한도 (10%)', 'subsidy.quota5': '한도 (5%)', 'subsidy.amountUsdt': '금액 (USDT)',
  'subsidy.purpose': '용도', 'subsidy.purposePlaceholder': '장소/식비/회의 상세',
  'subsidy.submit': '제출', 'subsidy.err.purpose': '용도를 입력하세요', 'subsidy.err.amount': '유효한 금액을 입력',
  'subsidy.err.quota': '한도 초과', 'status.pending': '심사 중', 'status.approved': '승인됨', 'status.rejected': '거절', 'status.paid': '입금됨',
  'tier.proBribe': '프로 뇌물 담당', 'tier.seniorBribe': '시니어 뇌물 담당', 'tier.director': '뇌물 디렉터', 'tier.chief': '치프',
  'team.partnersOnly': '파트너 전용', 'team.performance': '실적', 'team.tree': '추천 트리',
  'team.teamTotal': '傘하 누적', 'team.todayNew': '당일 신규', 'team.yesterdaySd3': '어제 정산 sD3',
  'team.sd3History': 'sD3 정산 내역', 'team.sd3HistoryEmpty': '정산 기록이 없습니다',
  'team.sd3HistoryNewPerf': '신규 실적 {amount}',
  'team.referralTitle': '내 추천 링크', 'team.referralDesc': '링크로 연결·바인딩 후 직추천 하선으로 참여합니다.',
  'tree.title': '추천 트리', 'tree.teamPerf': '傘하 실적', 'tree.up': '위로', 'tree.root': '나에게',
  'tree.search': '주소 / 닉네임', 'tree.noMatch': '일치 없음', 'tree.noDownline': '하선 없음',
  'tree.direct': '직추천', 'tree.team': '傘하', 'tree.open': '열기',
  'tree.layer': '{depth}층', 'tree.layerMe': '{depth}층 · 나', 'tree.loading': '팀 로딩 중…',
};

const partnerTh = {
  'program.title': 'โปรแกรมพาร์ทเนอร์', 'program.partner': 'พาร์ทเนอร์', 'program.staked': 'สเตคแล้ว',
  'tabs.home': 'หน้าแรก', 'tabs.stake': 'คราวด์ฟันด์', 'tabs.assets': 'สินทรัพย์', 'tabs.team': 'ทีม',
  'referral.required': 'เชื่อมกระเป๋าผ่านลิงก์แนะนำที่พอร์ทัลก่อน',
  'home.badge': 'D3 Bribe Finance · พาร์ทเนอร์', 'home.headline': 'ผลตอบแทนสมดุล · ปกป้องนักลงทุน · สนับสนุนผู้มีส่วนร่วม',
  'home.subline': 'ระหว่างคราวด์ฟันด์ 0.4% ต่อวัน หลังเปิดตัวกลับสู่ระดับปกติ ราคาเปิด=ยอดระดม÷1.05M โทเคน',
  'home.benefitsTitle': 'สิทธิ์การเข้าร่วม', 'home.tiersTitle': 'ระดับต่อต้านสินบน', 'home.becomePartner': 'เป็นพาร์ทเนอร์',
  'home.becomeDesc': 'จ่าย {fee} USDT เพื่อปลดล็อกการจัดสาย·sD3·ทีม',
  'home.goJoin': 'ไปคราวด์ฟันด์ · สมัคร', 'home.isPartner': 'เป็นพาร์ทเนอร์แล้ว',
  'benefit.globalTree': 'สายทั่วโลก', 'benefit.price': 'ราคา 5U', 'benefit.static': '0.4% คงที่',
  'benefit.antibribe': 'สนับสนุนต่อต้านสินบน', 'benefit.investor': 'ปกป้องนักลงทุน', 'benefit.contract': 'สัญญาเปิด',
  'tier.volume': 'ปริมาณ', 'stake.crowdfund': 'คราวด์ฟันด์', 'stake.partner': 'เข้าร่วม', 'stake.mine': 'ของฉัน',
  'stake.treasury': 'ที่รับเงิน (มัลติซิก)', 'stake.usdtTitle': 'สเตค USDT', 'stake.lockHint': 'วัน/รายการ · ขั้นต่ำ ',
  'stake.stakeBtn': 'สเตค', 'stake.joinTitle': 'สมาชิกพาร์ทเนอร์', 'stake.joinSubtitle': 'ค่าเข้าร่วมครั้งเดียว',
  'stake.joinDesc': 'ปลดล็อกสาย·sD3·ทีม·สินทรัพย์ ค่าเข้าร่วมล็อกแยก รับผลตอบแทนคงที่',
  'stake.joinFee': 'ค่าเข้าร่วม', 'stake.payJoin': 'ชำระและเข้าร่วม', 'stake.noStake': 'ยังไม่มีสเตค',
  'stake.total': 'รวม', 'stake.daily': 'รายวัน', 'stake.orders': 'คำสั่ง', 'stake.daysEach': 'วัน/รายการ',
  'stake.perDay': 'วัน', 'stake.daysLeft': 'วันเหลือ', 'stake.confirmPay': 'ยืนยันการชำระ', 'stake.cancel': 'ยกเลิก',
  'stake.paying': 'กำลังชำระ…', 'stake.confirm': 'ยืนยัน', 'stake.kind.crowdfund': 'CF', 'stake.kind.join': 'เข้าร่วม', 'stake.kind.sd3': 'sD3',
  'assets.partnersOnly': 'เฉพาะพาร์ทเนอร์', 'assets.overview': 'ภาพรวม', 'assets.subsidy': 'เงินอุดหนุน', 'assets.history': 'ประวัติ',
  'assets.sd3Stake': 'สเตค', 'assets.sd3Transfer': 'โอน', 'assets.all': 'ทั้งหมด',
  'assets.sd3StakeHist': 'สเตค sD3', 'assets.transferHist': 'โอน', 'assets.assetsOverview': 'ภาพรวมสินทรัพย์',
  'assets.dailyUsdt': 'USDT รายวัน', 'assets.totalSd3': 'sD3 สะสม', 'assets.antibribe': 'ต่อต้านสินบน',
  'assets.antibribeDesc': 'สเตคเข้าพูลหรือโอนให้สายล่าง', 'assets.available': 'คงเหลือ', 'assets.staked': 'สเตคแล้ว',
  'assets.stakeQuota': 'โควต้าสเตค', 'assets.transferQuota': 'โควต้าโอน', 'assets.canStake': 'สเตคได้',
  'assets.amount': 'จำนวน', 'assets.confirmStake': 'สเตคเข้าคราวด์ฟันด์',
  'assets.transferHint': 'โควต้าโอนให้สมาชิกสายล่างเข้าร่วมคราวด์ฟันด์',
  'assets.canTransfer': 'โอนได้', 'assets.downline': 'ที่อยู่สายล่าง', 'assets.transferAmount': 'จำนวนโอน',
  'assets.confirmTransfer': 'โอนให้สายล่าง', 'assets.search': 'ค้นหาจำนวน/ที่อยู่', 'assets.noRecords': 'ไม่มีบันทึก', 'assets.unlock': 'ปลดล็อก',
  'subsidy.partnerTitle': 'เงินอุดหนุนพาร์ทเนอร์', 'subsidy.partnerDesc': '10% ผลงานใหม่ (สถานที่·อาหาร·ประชุม) เบิกจริง',
  'subsidy.marketTitle': 'เงินอุดหนุนหัวหน้าตลาด', 'subsidy.marketDesc': '5% ผลงานใหม่ · หัวหน้าที่แอดมินอนุมัติเท่านั้น',
  'subsidy.quota': 'โควต้า', 'subsidy.used': 'ใช้แล้ว', 'subsidy.cap': 'เพดาน', 'subsidy.perf': 'ผลงาน',
  'subsidy.apply': 'ขอเงินอุดหนุน', 'subsidy.history': 'ประวัติคำขอ', 'subsidy.noHistory': 'ยังไม่มีคำขอ',
  'subsidy.paid': 'โอนแล้ว', 'subsidy.leaderPending': 'รออนุมัติสิทธิ์หัวหน้า',
  'subsidy.leaderNone': 'ยังไม่ได้รับสิทธิ์หัวหน้า · ติดต่อแอดมิน',
  'subsidy.modal.partner': 'ขอเงินอุดหนุนพาร์ทเนอร์', 'subsidy.modal.market': 'ขอเงินอุดหนุนตลาด',
  'subsidy.quota10': 'โควต้า (10%)', 'subsidy.quota5': 'โควต้า (5%)', 'subsidy.amountUsdt': 'จำนวน (USDT)',
  'subsidy.purpose': 'วัตถุประสงค์', 'subsidy.purposePlaceholder': 'สถานที่/อาหาร/ประชุม รายละเอียด',
  'subsidy.submit': 'ส่ง', 'subsidy.err.purpose': 'กรอกวัตถุประสงค์', 'subsidy.err.amount': 'กรอกจำนวนที่ถูกต้อง',
  'subsidy.err.quota': 'เกินโควต้า', 'status.pending': 'รออนุมัติ', 'status.approved': 'อนุมัติแล้ว', 'status.rejected': 'ปฏิเสธ', 'status.paid': 'โอนแล้ว',
  'tier.proBribe': 'เจ้าหน้าที่สินบน', 'tier.seniorBribe': 'สินบนอาวุโส', 'tier.director': 'ผู้อำนวยการ', 'tier.chief': 'ชีฟ',
  'team.partnersOnly': 'เฉพาะพาร์ทเนอร์', 'team.performance': 'ผลงาน', 'team.tree': 'ต้นไม้แนะนำ',
  'team.teamTotal': 'ยอดรวมสายล่าง', 'team.todayNew': 'ใหม่วันนี้', 'team.yesterdaySd3': 'sD3 เมื่อวาน',
  'team.sd3History': 'ประวัติการชำระ sD3', 'team.sd3HistoryEmpty': 'ยังไม่มีบันทึกการชำระ',
  'team.sd3HistoryNewPerf': 'ผลงานใหม่ {amount}',
  'team.referralTitle': 'ลิงก์แนะนำของฉัน', 'team.referralDesc': 'เชื่อมกระเป๋าและผูกผ่านลิงก์นี้ จะเป็นสายล่างตรงของคุณ',
  'tree.title': 'ต้นไม้แนะนำ', 'tree.teamPerf': 'ผลงานสายล่าง', 'tree.up': 'ขึ้น', 'tree.root': 'กลับหาฉัน',
  'tree.search': 'ค้นหาที่อยู่ / ชื่อ', 'tree.noMatch': 'ไม่พบ', 'tree.noDownline': 'ไม่มีสายล่าง',
  'tree.direct': 'แนะนำตรง', 'tree.team': 'สายล่าง', 'tree.open': 'เปิด',
  'tree.layer': 'ชั้น {depth}', 'tree.layerMe': 'ชั้น {depth} · ฉัน', 'tree.loading': 'กำลังโหลดทีม…',
};

function mergePartner(base, overrides) {
  return { ...base, ...overrides };
}

// Landing: read zh-CN and en if exist, else skip
const landingDir = path.join(root, 'landing');
const partnerDir = path.join(root, 'partner');

const partnerZhCN = JSON.parse(fs.readFileSync(path.join(partnerDir, 'zh-CN.json'), 'utf8'));
const partnerEn = JSON.parse(fs.readFileSync(path.join(partnerDir, 'en.json'), 'utf8'));

fs.writeFileSync(path.join(partnerDir, 'zh-TW.json'), JSON.stringify(walk(partnerZhCN, s2t), null, 2));
fs.writeFileSync(path.join(partnerDir, 'ja.json'), JSON.stringify(mergePartner(partnerEn, partnerJa), null, 2));
fs.writeFileSync(path.join(partnerDir, 'ko.json'), JSON.stringify(mergePartner(partnerEn, partnerKo), null, 2));
fs.writeFileSync(path.join(partnerDir, 'th.json'), JSON.stringify(mergePartner(partnerEn, partnerTh), null, 2));

if (fs.existsSync(path.join(landingDir, 'zh-CN.json'))) {
  const landingZhCN = JSON.parse(fs.readFileSync(path.join(landingDir, 'zh-CN.json'), 'utf8'));
  const landingEn = JSON.parse(fs.readFileSync(path.join(landingDir, 'en.json'), 'utf8'));
  fs.writeFileSync(path.join(landingDir, 'zh-TW.json'), JSON.stringify(walk(landingZhCN, s2t), null, 2));
  const landingJa = walk(landingEn, (s) => {
    const map = {
      'Protocol': 'プロトコル', 'Token': 'トークン', 'Roadmap': 'ロードマップ', 'Docs': 'ドキュメント',
      'Connect Wallet': 'ウォレット接続', 'Real Yield': 'リアルイールド', 'On-Chain Verified': 'オンチェーン検証済み',
      'Read Whitepaper': 'ホワイトペーパー', 'Why Bribe Finance?': 'なぜ賄賂金融か？',
      'Three Entry Methods': '3つの参入方法', 'Six Value Guardians': '6つの価値ガーディアン', 'Roadmap': 'ロードマップ', 'FAQ': 'よくある質問',
      'Resources': 'リソース', 'Community': 'コミュニティ', 'Legal': '法務',
    };
    return map[s] ?? s;
  });
  fs.writeFileSync(path.join(landingDir, 'ja.json'), JSON.stringify(landingJa, null, 2));
  const landingKo = walk(landingEn, (s) => {
    const map = {
      'Protocol': '프로토콜', 'Token': '토큰', 'Roadmap': '로드맵', 'Docs': '문서',
      'Connect Wallet': '지갑 연결', 'Real Yield': '실질 수익', 'On-Chain Verified': '온체인 검증',
      'Read Whitepaper': '백서 읽기', 'Why Bribe Finance?': '왜 뇌물 금융인가?',
      'Three Entry Methods': '세 가지 참여 방법', 'Six Value Guardians': '여섯 가지 가치 수호', 'FAQ': '자주 묻는 질문',
      'Resources': '리소스', 'Community': '커뮤니티', 'Legal': '법률',
    };
    return map[s] ?? s;
  });
  fs.writeFileSync(path.join(landingDir, 'ko.json'), JSON.stringify(landingKo, null, 2));
  const landingTh = walk(landingEn, (s) => {
    const map = {
      'Protocol': 'โปรโตคอล', 'Token': 'โทเคน', 'Roadmap': 'โรดแมป', 'Docs': 'เอกสาร',
      'Connect Wallet': 'เชื่อมกระเป๋า', 'Real Yield': 'ผลตอบแทนจริง', 'On-Chain Verified': 'ตรวจสอบบนเชน',
      'Read Whitepaper': 'อ่านไวท์เปเปอร์', 'Why Bribe Finance?': 'ทำไมต้อง Bribe Finance?',
      'Three Entry Methods': 'สามวิธีเข้าร่วม', 'Six Value Guardians': 'ผู้พิทักษ์คุณค่าหกประการ', 'FAQ': 'คำถามที่พบบ่อย',
      'Resources': 'ทรัพยากร', 'Community': 'ชุมชน', 'Legal': 'กฎหมาย',
    };
    return map[s] ?? s;
  });
  fs.writeFileSync(path.join(landingDir, 'th.json'), JSON.stringify(landingTh, null, 2));
}

console.log('Generated main app locale files');
