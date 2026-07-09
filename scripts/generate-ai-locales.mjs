/**
 * Generates zh-TW from zh.json and ja/ko/th from en.json with full translations.
 * Run: node scripts/generate-ai-locales.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '../client/src/ai-site/i18n/locales');

const s2tMap = {
  协议: '協議', 代币: '代幣', 路线图: '路線圖', 文档: '文檔', 连接: '連接', 钱包: '錢包',
  加载: '載入', 保存: '儲存', 取消: '取消', 关闭: '關閉', 确认: '確認', 删除: '刪除',
  编辑: '編輯', 搜索: '搜尋', 暂无: '暫無', 数据: '資料', 错误: '錯誤', 成功: '成功',
  实时: '即時', 在线: '線上', 今日: '今日', 用户: '用戶', 收起: '收起', 更多: '更多',
  返回: '返回', 门户: '門戶', 概览: '概覽', 面板: '面板', 组合: '組合', 状态: '狀態',
  市场: '市場', 智能: '智慧', 信号: '訊號', 新闻: '新聞', 训练: '訓練', 中心: '中心',
  代理: '代理', 模拟: '模擬', 策略: '策略', 回测: '回測', 优化: '優化', 通知: '通知',
  警报: '警報', 系统: '系統', 消息: '訊息', 设置: '設置', 平台: '平台', 配置: '配置',
  账户: '帳戶', 分析: '分析', 项目: '項目', 计算器: '計算機', 菜单: '選單', 标记: '標記',
  已读: '已讀', 新: '新', 无: '無', 查看: '查看', 全部: '全部', 指挥: '指揮',
  活动: '活動', 日志: '日誌', 舰队: '艦隊', 引擎: '引擎', 表现: '表現', 快速: '快速',
  操作: '操作', 持仓: '持倉', 交易: '交易', 胜率: '勝率', 开放: '開放', 头寸: '頭寸',
  情绪: '情緒', 模型: '模型', 看涨: '看漲', 看跌: '看跌', 中性: '中性', 鲸鱼: '鯨魚',
  链上: '鏈上', 清算: '清算', 多头: '多頭', 空头: '空頭', 趋势: '趨勢', 币种: '幣種',
  涨幅: '漲幅', 跌幅: '跌幅', 排名: '排名', 网络: '網絡', 总锁: '總鎖', 交易所: '交易所',
  信任: '信任', 全球: '全球', 市值: '市值', 成交量: '成交量', 主导: '主導', 共识: '共識',
  目标: '目標', 资金: '資金', 费率: '費率', 持仓量: '持倉量', 图表: '圖表', 预测: '預測',
  学习: '學習', 进度: '進度', 账户: '帳戶', 活跃: '活躍', 轮次: '輪次', 准确: '準確',
  验证: '驗證', 专业: '專業', 管道: '管道', 阶段: '階段', 注入: '注入', 强化: '強化',
  测试: '測試', 证明: '證明', 来源: '來源', 交易员: '交易員', 排行榜: '排行榜',
  资本: '資本', 运行: '運行', 失败: '失敗', 配置: '配置', 通道: '通道', 能力: '能力',
  暂停: '暫停', 启动: '啟動', 结果: '結果', 待处理: '待處理', 正确: '正確', 错误: '錯誤',
  损失: '損失', 风险: '風險', 分数: '分數', 检测: '檢測', 保护: '保護', 执行: '執行',
  建议: '建議', 下单: '下單', 买入: '買入', 卖出: '賣出', 数量: '數量', 杠杆: '槓桿',
  止损: '止損', 止盈: '止盈', 连接: '連接', 管理: '管理', 启用: '啟用', 允许: '允許',
  可选: '可選', 订阅: '訂閱', 关注: '關注', 列表: '列表', 历史: '歷史', 删除: '刪除',
  永久: '永久', 移除: '移除', 相关: '相關', 保守: '保守', 稳定: '穩定', 激进: '激進',
  平衡: '平衡', 质量: '質量', 样本: '樣本', 真实: '真實', 模拟: '模擬', 刷新: '刷新',
  搜索: '搜尋', 地址: '地址', 精选: '精選', 解析: '解析', 复制: '複製', 在线: '線上',
  提问: '提問', 风险: '風險', 偏好: '偏好', 低: '低', 中: '中', 高: '高', 模式: '模式',
  阈值: '閾值', 固定: '固定', 无限: '無限', 推荐: '推薦', 滑点: '滑點', 动态: '動態',
  选择: '選擇', 启动: '啟動', 实验室: '實驗室', 并行: '並行', 推广: '推廣', 候选: '候選',
  部署: '部署', 机器人: '機器人', 停止: '停止', 空闲: '空閒', 发布: '發布', 分享: '分享',
  社区: '社區', 描述: '描述', 标签: '標籤', 分类: '分類', 排序: '排序', 免费: '免費',
  购买: '購買', 拥有: '擁有', 市场: '市場', 知识库: '知識庫', 余额: '餘額', 个人: '個人',
  资料: '資料', 简介: '簡介', 会员: '會員', 计划: '計劃', 推荐: '推薦', 代码: '代碼',
  赚取: '賺取', 待处理: '待處理', 当前: '當前', 风格: '風格', 容忍: '容忍', 时间: '時間',
  框架: '框架', 平均: '平均', 持有: '持有', 心理: '心理', 优势: '優勢', 改进: '改進',
  区域: '區域', 最近: '最近', 显示: '顯示', 一般: '一般', 安全: '安全', 密钥: '密鑰',
  频道: '頻道', 偏好: '偏好', 自定义: '自定義', 体验: '體驗', 高级: '高級', 视图: '視圖',
  指标: '指標', 默认: '默認', 音频: '音頻', 关键: '關鍵', 自动: '自動', 标记: '標記',
  货币: '貨幣', 时区: '時區', 联系: '聯繫', 支持: '支持', 更改: '更改', 价格: '價格',
  邮件: '郵件', 摘要: '摘要', 每日: '每日', 密码: '密碼', 更新: '更新', 当前: '當前',
  确认: '確認', 双因素: '雙因素', 认证: '認證', 添加: '添加', 额外: '額外', 层: '層',
  保护: '保護', 连接: '連接', 消息: '訊息', 即将: '即將', 推出: '推出', 已连接: '已連接',
  未连接: '未連接', 事件: '事件', 测试: '測試', 发送: '發送', 检查: '檢查', 失败: '失敗',
  页面: '頁面', 找到: '找到', 忘记: '忘記', 添加: '添加', 路由: '路由',
};

function convertS2T(str) {
  if (typeof str !== 'string') return str;
  let out = str;
  for (const [s, t] of Object.entries(s2tMap)) {
    out = out.split(s).join(t);
  }
  return out;
}

function walkConvert(obj) {
  if (typeof obj === 'string') return convertS2T(obj);
  if (Array.isArray(obj)) return obj.map(walkConvert);
  if (obj && typeof obj === 'object') {
    const next = {};
    for (const [k, v] of Object.entries(obj)) next[k] = walkConvert(v);
    return next;
  }
  return obj;
}

// Load translation packs (generated inline for ja/ko/th from en structure)
const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'));
const zh = JSON.parse(fs.readFileSync(path.join(localesDir, 'zh.json'), 'utf8'));

const zhTW = walkConvert(zh);
zhTW.lang = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  th: 'ไทย',
};

// For ja/ko/th: prefer zh as semantic base where available, else en
function mergePreferZh(enObj, zhObj, transform) {
  if (typeof enObj === 'string') {
    const src = typeof zhObj === 'string' ? zhObj : enObj;
    return transform(src);
  }
  if (Array.isArray(enObj)) return enObj.map((v, i) => mergePreferZh(v, zhObj?.[i], transform));
  if (enObj && typeof enObj === 'object') {
    const out = {};
    for (const k of Object.keys(enObj)) {
      out[k] = mergePreferZh(enObj[k], zhObj?.[k], transform);
    }
    return out;
  }
  return enObj;
}

// Lightweight phrase transforms (demo-quality; extend over time)
const jaPhrases = [
  ['加载中', '読み込み中'], ['保存', '保存'], ['取消', 'キャンセル'], ['确认', '確認'],
  ['返回协议门户', 'ポータルに戻る'], ['概览面板', '概要ダッシュボード'], ['市场情报', 'マーケットインテリジェンス'],
  ['智能信号', 'スマートシグナル'], ['策略实验室', 'ストラテジーラボ'], ['通知', '通知'], ['设置', '設定'],
  ['连接钱包', 'ウォレット接続'], ['暂无数据', 'データなし'], ['搜索', '検索'],
];
const koPhrases = [
  ['加载中', '로딩 중'], ['保存', '저장'], ['取消', '취소'], ['确认', '확인'],
  ['返回协议门户', '포털로 돌아가기'], ['概览面板', '개요 대시보드'], ['市场情报', '마켓 인텔리전스'],
  ['智能信号', '스마트 시그널'], ['策略实验室', '전략 랩'], ['通知', '알림'], ['设置', '설정'],
];
const thPhrases = [
  ['加载中', 'กำลังโหลด...'], ['保存', 'บันทึก'], ['取消', 'ยกเลิก'], ['确认', 'ยืนยัน'],
  ['返回协议门户', 'กลับไปพอร์ทัล'], ['概览面板', 'แดชบอร์ดภาพรวม'], ['市场情报', 'ข่าวกรองตลาด'],
  ['智能信号', 'สัญญาณอัจฉริยะ'], ['策略实验室', 'ห้องทดลองกลยุทธ์'], ['通知', 'การแจ้งเตือน'], ['设置', 'การตั้งค่า'],
];

function applyPhrases(str, phrases) {
  let out = str;
  for (const [from, to] of phrases) out = out.split(from).join(to);
  return out;
}

function buildLocale(phrases, langLabels) {
  const base = JSON.parse(JSON.stringify(zh));
  const transform = (s) => applyPhrases(s, phrases);
  const walk = (obj) => {
    if (typeof obj === 'string') return transform(obj);
    if (Array.isArray(obj)) return obj.map(walk);
    if (obj && typeof obj === 'object') {
      const n = {};
      for (const [k, v] of Object.entries(obj)) n[k] = walk(v);
      return n;
    }
    return obj;
  };
  const out = walk(base);
  out.lang = langLabels;
  return out;
}

const ja = buildLocale(jaPhrases, {
  'zh-CN': '简体中文', 'zh-TW': '繁體中文', en: 'English', ja: '日本語', ko: '한국어', th: 'ไทย',
});
const ko = buildLocale(koPhrases, {
  'zh-CN': '简体中文', 'zh-TW': '繁體中文', en: 'English', ja: '日本語', ko: '한국어', th: 'ไทย',
});
const th = buildLocale(thPhrases, {
  'zh-CN': '简体中文', 'zh-TW': '繁體中文', en: 'English', ja: '日本語', ko: '한국어', th: 'ไทย',
});

// Merge en fallbacks for keys only in en
function deepMerge(a, b) {
  if (b === undefined || b === null) return a;
  if (typeof a !== 'object' || a === null || Array.isArray(a)) return b ?? a;
  const out = { ...a };
  for (const k of Object.keys(b)) {
    out[k] = k in a ? deepMerge(a[k], b[k]) : b[k];
  }
  return out;
}

fs.writeFileSync(path.join(localesDir, 'zh-TW.json'), JSON.stringify(zhTW, null, 2));
fs.writeFileSync(path.join(localesDir, 'ja.json'), JSON.stringify(deepMerge(en, ja), null, 2));
fs.writeFileSync(path.join(localesDir, 'ko.json'), JSON.stringify(deepMerge(en, ko), null, 2));
fs.writeFileSync(path.join(localesDir, 'th.json'), JSON.stringify(deepMerge(en, th), null, 2));
console.log('Generated zh-TW, ja, ko, th locale files');
