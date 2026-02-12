export type MissionType = 'identity' | 'action' | 'world';

export type MissionCost = {
  energy?: number;
};

export type MissionRequirements = {
  minLevel?: number;
  minEnergy?: number;
  repeatable?: boolean;
};

export type MissionDefinition = {
  id: string;
  owner_id: string | null;
  title: string | null;
  summary: string | null;
  difficulty: string | null;
  status: string | null;
  energy_reward: number | null;
  xp_reward: number | null;
  type: MissionType;
  cost: MissionCost | null;
  requirements: MissionRequirements | null;
  cooldown_ms: number | null;
  privacy_tags: string[] | null;
};

export type MissionSessionRow = {
  id: string;
  mission_id: string;
  user_id: string;
  mission_type?: MissionType | string | null;
  status: 'started' | 'completed' | 'cancelled' | string;
  cost_snapshot: MissionCost | null;
  cost?: MissionCost | null;
  rewards?: {
    xpGranted?: number;
    energyGranted?: number;
  } | null;
  idempotency_key?: string | null;
  started_at: string;
  completed_at: string | null;
};

export type MissionUser = {
  id: string;
};

export type MissionStartContext = {
  level: number;
  energy: number;
};
