export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          auth_user_id: string | null;
          wallet_address: string;
          privy_user_id: string | null;
          display_name: string | null;
          short_address: string | null;
          lang: 'zh' | 'en';
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & {
          wallet_address: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
      };
      referrals: {
        Row: {
          id: string;
          user_id: string;
          sponsor_id: string | null;
          referral_type: 'partner' | 'shareholder';
          status: 'pending' | 'active' | 'inactive';
          join_tx_hash: string | null;
          referred_at: string;
          performance_weight: number;
        };
        Insert: Partial<Database['public']['Tables']['referrals']['Row']> & {
          user_id: string;
        };
        Update: Partial<Database['public']['Tables']['referrals']['Row']>;
      };
      shareholders: {
        Row: {
          id: string;
          user_id: string;
          is_shareholder: boolean;
          genesis_dt_count: number;
          joined_at: string | null;
          join_fee_usdt: number;
          join_tx_hash: string | null;
          equity_share_pct: number;
          line_performance_usd: number;
          network_performance_usd: number;
          level_label: string;
          status: 'locked' | 'active' | 'suspended';
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['shareholders']['Row']> & {
          user_id: string;
        };
        Update: Partial<Database['public']['Tables']['shareholders']['Row']>;
      };
      union_lines: {
        Row: {
          id: string;
          line_leader_id: string;
          name: string | null;
          root_user_id: string | null;
          total_members: number;
          total_performance_usd: number;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['union_lines']['Row']> & {
          line_leader_id: string;
        };
        Update: Partial<Database['public']['Tables']['union_lines']['Row']>;
      };
      team_nodes: {
        Row: {
          id: string;
          line_id: string;
          user_id: string;
          parent_node_id: string | null;
          level_label: string;
          personal_usd: number;
          team_usd: number;
          direct_count: number;
          team_count: number;
          is_direct: boolean;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['team_nodes']['Row']> & {
          line_id: string;
          user_id: string;
        };
        Update: Partial<Database['public']['Tables']['team_nodes']['Row']>;
      };
      multisig_wallets: {
        Row: {
          id: string;
          line_id: string | null;
          wallet_type: 'line' | 'dao';
          address: string;
          short_address: string | null;
          label_zh: string | null;
          label_en: string | null;
          threshold: number;
          total_signers: number;
          balance_usd3: number;
          balance_d3: number;
          privy_key_quorum_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['multisig_wallets']['Row']> & {
          wallet_type: 'line' | 'dao';
          address: string;
          threshold: number;
          total_signers: number;
        };
        Update: Partial<Database['public']['Tables']['multisig_wallets']['Row']>;
      };
      committee_members: {
        Row: {
          id: string;
          wallet_id: string;
          user_id: string | null;
          wallet_address: string;
          role_zh: string | null;
          role_en: string | null;
          is_line_leader: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['committee_members']['Row']> & {
          wallet_id: string;
          wallet_address: string;
        };
        Update: Partial<Database['public']['Tables']['committee_members']['Row']>;
      };
      multisig_proposals: {
        Row: {
          id: string;
          wallet_id: string;
          wallet_type: 'line' | 'dao';
          title_zh: string;
          title_en: string;
          desc_zh: string | null;
          desc_en: string | null;
          period_zh: string | null;
          period_en: string | null;
          usd3_amount: number;
          d3_amount: number;
          beneficiary_count: number;
          proposer_address: string | null;
          status: 'pending' | 'executed' | 'rejected';
          created_at: string;
          expires_at: string | null;
          executed_at: string | null;
          tx_hash: string | null;
        };
        Insert: Partial<Database['public']['Tables']['multisig_proposals']['Row']> & {
          wallet_id: string;
          wallet_type: 'line' | 'dao';
          title_zh: string;
          title_en: string;
        };
        Update: Partial<Database['public']['Tables']['multisig_proposals']['Row']>;
      };
      multisig_signatures: {
        Row: {
          id: string;
          proposal_id: string;
          committee_member_id: string | null;
          signer_address: string;
          signed_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['multisig_signatures']['Row']> & {
          proposal_id: string;
          signer_address: string;
        };
        Update: Partial<Database['public']['Tables']['multisig_signatures']['Row']>;
      };
      usd3_accounts: {
        Row: {
          user_id: string;
          pending_usd3: number;
          claimed_lifetime_usd3: number;
          balance: number;
          available: number;
          self_pool_remaining: number;
          downline_pool_remaining: number;
          moved_to_fi: number;
          transferred_to_downline: number;
          self_quota: number;
          downline_quota: number;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['usd3_accounts']['Row']> & {
          user_id: string;
        };
        Update: Partial<Database['public']['Tables']['usd3_accounts']['Row']>;
      };
      d3_accounts: {
        Row: {
          user_id: string;
          pending_d3: number;
          claimed_lifetime_d3: number;
          claim_wallet_address: string | null;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['d3_accounts']['Row']> & {
          user_id: string;
        };
        Update: Partial<Database['public']['Tables']['d3_accounts']['Row']>;
      };
      dividend_accruals: {
        Row: {
          id: string;
          user_id: string;
          asset_type: 'usd3' | 'd3';
          stream_id: 'fees' | 'treasury' | 'line';
          amount: number;
          period_label: string | null;
          cycle_type: 'epoch' | 'monthly';
          status: 'pending' | 'claimable' | 'claimed' | 'none';
          source_zh: string | null;
          source_en: string | null;
          settled_at: string | null;
          claimed_at: string | null;
          tx_hash: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['dividend_accruals']['Row']> & {
          user_id: string;
          asset_type: 'usd3' | 'd3';
          stream_id: 'fees' | 'treasury' | 'line';
          cycle_type: 'epoch' | 'monthly';
        };
        Update: Partial<Database['public']['Tables']['dividend_accruals']['Row']>;
      };
      usd3_transfers: {
        Row: {
          id: string;
          from_user_id: string;
          to_user_id: string | null;
          to_address: string | null;
          amount: number;
          transfer_type: 'to_fi' | 'to_downline';
          status: 'pending' | 'completed' | 'failed';
          tx_hash: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['usd3_transfers']['Row']> & {
          from_user_id: string;
          amount: number;
          transfer_type: 'to_fi' | 'to_downline';
        };
        Update: Partial<Database['public']['Tables']['usd3_transfers']['Row']>;
      };
      fi_positions: {
        Row: {
          id: string;
          user_id: string;
          position_type: 'lp' | 'burn_bond' | 'spot' | 'governance' | 've_lock';
          asset_pair: string | null;
          principal_usd3: number | null;
          principal_d3: number | null;
          principal_usdt: number | null;
          lock_days: number | null;
          locked_until: string | null;
          status: 'active' | 'matured' | 'withdrawn';
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['fi_positions']['Row']> & {
          user_id: string;
          position_type: 'lp' | 'burn_bond' | 'spot' | 'governance' | 've_lock';
        };
        Update: Partial<Database['public']['Tables']['fi_positions']['Row']>;
      };
    };
  };
};

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Shareholder = Database['public']['Tables']['shareholders']['Row'];
export type Usd3Account = Database['public']['Tables']['usd3_accounts']['Row'];
export type D3Account = Database['public']['Tables']['d3_accounts']['Row'];
