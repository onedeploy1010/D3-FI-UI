export type RiskLevel = "low" | "medium" | "high";

export interface Project {
  id: string;
  slug: string;
  name: string;
  symbol: string;
  category: string;
  apy: number;
  tvl: string;
  marketCap: string;
  riskLevel: RiskLevel;
  rating: number;
  tags: string[];
  descriptionZh: string;
  descriptionEn: string;
  website?: string;
  detailPath?: string;
  isRecommended?: boolean;
}

export const PROJECTS: Project[] = [
  {
    id: "rune",
    slug: "rune",
    name: "RUNE Protocol",
    symbol: "RUNE",
    category: "Yield",
    apy: 170.82,
    tvl: "$312M",
    marketCap: "$1.2B",
    riskLevel: "high",
    rating: 4.6,
    tags: ["Dual-Token", "Node Staking", "AMM", "Layer1", "Cross-chain"],
    descriptionZh:
      "RUNE 是一条以双代币经济模型为核心的 Layer1 网络，通过节点质押与自动做市（AMM）机制为参与者提供高额收益。协议采用燃烧-质押飞轮设计，将网络费用回流至质押池，推动价格与收益率的正向循环。适合风险承受能力较强、追求高回报的进阶用户。",
    descriptionEn:
      "RUNE is a Layer1 network built around a dual-token economic model, combining node staking with an automated market maker (AMM) to deliver elevated yields. Its burn-and-stake flywheel routes network fees back into the staking pool, creating a positive loop between price and yield. Best suited for advanced users comfortable with higher risk in pursuit of outsized returns.",
    website: "https://thorchain.org",
    detailPath: "/projects/rune",
    isRecommended: true,
  },
  {
    id: "hyperliquid",
    slug: "hyperliquid",
    name: "Hyperliquid Vaults",
    symbol: "HYPE",
    category: "Vault",
    apy: 38.4,
    tvl: "$1.8B",
    marketCap: "$9.5B",
    riskLevel: "medium",
    rating: 4.8,
    tags: ["Perps", "Vault", "On-chain", "HLP", "Market Making"],
    descriptionZh:
      "Hyperliquid 是运行在自研 L1 上的高性能永续合约交易所，其金库（Vault）产品允许用户将资金委托给做市与清算策略，分享交易手续费与做市利润。HLP 金库以透明的链上业绩记录与稳健的风险控制著称，是链上收益型策略的代表之一。",
    descriptionEn:
      "Hyperliquid is a high-performance perpetuals exchange running on its own L1. Its Vault products let users delegate capital to market-making and liquidation strategies, sharing in trading fees and market-making profits. The HLP vault is known for transparent on-chain performance and robust risk controls, making it a flagship on-chain yield strategy.",
    website: "https://hyperliquid.xyz",
    detailPath: "/projects/hyperliquid",
    isRecommended: true,
  },
  {
    id: "legend-atm",
    slug: "legend-atm",
    name: "LEGEND ATM",
    symbol: "LGD",
    category: "Yield",
    apy: 92.5,
    tvl: "$86M",
    marketCap: "$210M",
    riskLevel: "high",
    rating: 4.1,
    tags: ["Dual-Token", "Reinvest", "Mining", "Staking"],
    descriptionZh:
      "LEGEND ATM 是一套结合质押挖矿与复投机制的双代币收益系统，通过分层（Tier）设计与动态产出比率，为不同资金规模的参与者提供可组合的收益路径。内置复投分析可帮助用户测算不同复投周期下的收益曲线。",
    descriptionEn:
      "LEGEND ATM is a dual-token yield system pairing staking-mining with reinvestment mechanics. Through tiered design and dynamic output ratios, it offers composable yield paths for participants of varying capital sizes. Built-in reinvestment analysis helps users model return curves across different compounding cycles.",
    website: "https://legend.finance",
    detailPath: "/projects/legend-atm",
  },
  {
    id: "lido",
    slug: "lido",
    name: "Lido",
    symbol: "LDO",
    category: "Staking",
    apy: 3.1,
    tvl: "$32B",
    marketCap: "$1.1B",
    riskLevel: "low",
    rating: 4.9,
    tags: ["Liquid Staking", "ETH", "stETH", "Blue-chip"],
    descriptionZh:
      "Lido 是最大的以太坊流动性质押协议，用户质押 ETH 获得 stETH，在赚取质押收益的同时保留资产的流动性与可组合性。作为 DeFi 蓝筹，Lido 拥有深度的生态集成与经过长期验证的安全记录。",
    descriptionEn:
      "Lido is the largest Ethereum liquid staking protocol. Users stake ETH to receive stETH, earning staking rewards while retaining liquidity and composability. As a DeFi blue-chip, Lido enjoys deep ecosystem integration and a long, well-tested security track record.",
    website: "https://lido.fi",
  },
  {
    id: "aave",
    slug: "aave",
    name: "Aave",
    symbol: "AAVE",
    category: "Lending",
    apy: 5.4,
    tvl: "$18B",
    marketCap: "$4.2B",
    riskLevel: "low",
    rating: 4.9,
    tags: ["Lending", "Borrowing", "Blue-chip", "Multi-chain"],
    descriptionZh:
      "Aave 是领先的去中心化借贷协议，支持多链部署与多种抵押资产。用户可存入资产赚取利息，或以超额抵押方式借出资金。其风险参数由社区治理动态调整，是 DeFi 借贷赛道的标杆项目。",
    descriptionEn:
      "Aave is a leading decentralized lending protocol with multi-chain deployments and a broad range of collateral assets. Users deposit to earn interest or borrow against overcollateralized positions. Its risk parameters are governed dynamically by the community, making it the benchmark of DeFi lending.",
    website: "https://aave.com",
  },
  {
    id: "eigenlayer",
    slug: "eigenlayer",
    name: "EigenLayer",
    symbol: "EIGEN",
    category: "Staking",
    apy: 6.8,
    tvl: "$14B",
    marketCap: "$2.8B",
    riskLevel: "medium",
    rating: 4.5,
    tags: ["Restaking", "AVS", "ETH", "Infrastructure"],
    descriptionZh:
      "EigenLayer 首创以太坊再质押（Restaking）机制，允许已质押的 ETH 为多个主动验证服务（AVS）提供安全性，从而在基础质押收益之外叠加额外奖励。它正在成为以太坊安全共享层的重要基础设施。",
    descriptionEn:
      "EigenLayer pioneers Ethereum restaking, allowing already-staked ETH to secure multiple Actively Validated Services (AVS) and earn additional rewards on top of base staking yield. It is emerging as key infrastructure for Ethereum's shared security layer.",
    website: "https://eigenlayer.xyz",
  },
  {
    id: "pendle",
    slug: "pendle",
    name: "Pendle",
    symbol: "PENDLE",
    category: "Yield",
    apy: 12.6,
    tvl: "$4.5B",
    marketCap: "$720M",
    riskLevel: "medium",
    rating: 4.7,
    tags: ["Yield Trading", "PT/YT", "Fixed Yield", "DeFi"],
    descriptionZh:
      "Pendle 将收益代币化，把生息资产拆分为本金代币（PT）与收益代币（YT），使用户能够交易未来收益、锁定固定利率或对收益率进行投机，为收益市场带来全新的策略维度。",
    descriptionEn:
      "Pendle tokenizes yield by splitting yield-bearing assets into Principal Tokens (PT) and Yield Tokens (YT), enabling users to trade future yield, lock in fixed rates, or speculate on yield movements — bringing a new strategic dimension to yield markets.",
    website: "https://pendle.finance",
  },
  {
    id: "ethena",
    slug: "ethena",
    name: "Ethena",
    symbol: "ENA",
    category: "Yield",
    apy: 15.2,
    tvl: "$5.6B",
    marketCap: "$2.1B",
    riskLevel: "high",
    rating: 4.3,
    tags: ["Synthetic Dollar", "USDe", "Delta-neutral", "Yield"],
    descriptionZh:
      "Ethena 通过 Delta 中性策略发行合成美元 USDe，利用现货抵押与永续空头对冲维持锚定，并将资金费率与质押收益分配给参与者。其高收益伴随衍生品市场结构性风险，适合理解相关机制的用户。",
    descriptionEn:
      "Ethena issues the synthetic dollar USDe via a delta-neutral strategy, maintaining its peg with spot collateral hedged by perpetual shorts, and distributing funding-rate and staking yields to participants. Its high yield carries structural derivatives-market risk, suited to users who understand the mechanics.",
    website: "https://ethena.fi",
  },
  {
    id: "uniswap",
    slug: "uniswap",
    name: "Uniswap",
    symbol: "UNI",
    category: "DEX",
    apy: 8.9,
    tvl: "$5.2B",
    marketCap: "$5.8B",
    riskLevel: "low",
    rating: 4.9,
    tags: ["DEX", "AMM", "LP", "Blue-chip", "Multi-chain"],
    descriptionZh:
      "Uniswap 是最具影响力的去中心化交易所，其自动做市（AMM）模型重塑了链上流动性。V3 的集中流动性设计让 LP 能在自定义价格区间内提升资本效率，是 DeFi 交易层的核心基石。",
    descriptionEn:
      "Uniswap is the most influential decentralized exchange, whose AMM model reshaped on-chain liquidity. V3's concentrated liquidity lets LPs boost capital efficiency within custom price ranges. It remains a cornerstone of the DeFi trading layer.",
    website: "https://uniswap.org",
  },
  {
    id: "gmx",
    slug: "gmx",
    name: "GMX",
    symbol: "GMX",
    category: "Derivatives",
    apy: 18.5,
    tvl: "$540M",
    marketCap: "$320M",
    riskLevel: "medium",
    rating: 4.4,
    tags: ["Perps", "GLP", "LP", "Derivatives"],
    descriptionZh:
      "GMX 是去中心化永续合约交易所，采用独特的多资产流动性池（GLP/GM）作为交易对手方。流动性提供者赚取交易手续费与杠杆持仓的资金费用，兼具收益性与做市风险敞口。",
    descriptionEn:
      "GMX is a decentralized perpetuals exchange using a unique multi-asset liquidity pool (GLP/GM) as the counterparty to traders. Liquidity providers earn trading fees and funding from leveraged positions, balancing yield with market-making exposure.",
    website: "https://gmx.io",
  },
];

export function getProjectBySlug(slug: string): Project | undefined {
  return PROJECTS.find((p) => p.slug === slug);
}
