// 追问策略管理
export interface FollowUpState {
  usedSlotsThisTopic: number;
  usedSlotsThisRound: number;
  chainDepth: number;
  lastFollowUpAgentId: string | null;
  agentsUsedFollowUp: Set<string>;
}

export interface FollowUpConfig {
  maxFollowUpsPerTopic: number;
  maxFollowUpsPerRound: number;
  maxChainDepth: number;
}

export class FollowUpPolicy {
  private state: FollowUpState;
  private config: FollowUpConfig;

  constructor(config: FollowUpConfig) {
    this.config = config;
    this.state = this.newFollowUpState();
  }

  newFollowUpState(): FollowUpState {
    return {
      usedSlotsThisTopic: 0,
      usedSlotsThisRound: 0,
      chainDepth: 0,
      lastFollowUpAgentId: null,
      agentsUsedFollowUp: new Set(),
    };
  }

  resetTopic() {
    this.state = this.newFollowUpState();
  }

  resetRound() {
    this.state.usedSlotsThisRound = 0;
  }

  canFollowUp(agentId: string): boolean {
    // 检查话题级别限制
    if (this.state.usedSlotsThisTopic >= this.config.maxFollowUpsPerTopic) {
      return false;
    }

    // 检查轮次级别限制
    if (this.state.usedSlotsThisRound >= this.config.maxFollowUpsPerRound) {
      return false;
    }

    // 检查该Agent是否已经用过追问
    if (this.state.agentsUsedFollowUp.has(agentId)) {
      return false;
    }

    // 检查追问链深度
    if (this.state.lastFollowUpAgentId === agentId && 
        this.state.chainDepth >= this.config.maxChainDepth) {
      return false;
    }

    return true;
  }

  recordFollowUp(agentId: string) {
    this.state.usedSlotsThisTopic++;
    this.state.usedSlotsThisRound++;
    this.state.agentsUsedFollowUp.add(agentId);
    
    // 更新追问链深度
    if (this.state.lastFollowUpAgentId === agentId) {
      this.state.chainDepth++;
    } else {
      this.state.chainDepth = 1;
      this.state.lastFollowUpAgentId = agentId;
    }
  }

  getState(): FollowUpState {
    return { ...this.state };
  }

  // 检测上下文中是否有缺失信息
  detectMissingInfo(context: string): boolean {
    const missingPatterns = [
      /什么时候|when/i,
      /哪里|where/i,
      /怎么|how/i,
      /为什么|why/i,
      /预算|price|多少钱/i,
      /喜欢|prefer|偏好/i,
    ];

    return missingPatterns.some(pattern => pattern.test(context));
  }

  // 检测不确定性
  detectUncertainty(context: string): boolean {
    const uncertainPatterns = [
      /不确定|不太清楚|不知道/i,
      /可能|也许|或许/i,
      /看情况|待定/i,
    ];

    return uncertainPatterns.some(pattern => pattern.test(context));
  }

  // 评估追问的必要性（0-1分数）
  scoreFollowUpNeed(context: string, recentMessages: string[]): number {
    let score = 0;

    // 检测缺失信息 +0.4
    if (this.detectMissingInfo(context)) {
      score += 0.4;
    }

    // 检测不确定性 +0.3
    if (this.detectUncertainty(context)) {
      score += 0.3;
    }

    // 检测对话是否过于简短 +0.2
    const avgLength = recentMessages.reduce((sum, msg) => sum + msg.length, 0) / recentMessages.length;
    if (avgLength < 15) {
      score += 0.2;
    }

    // 检测是否有开放性问题未回答 +0.3
    const hasOpenQuestion = recentMessages.some(msg => /吗|呢|？|\?/.test(msg));
    if (hasOpenQuestion) {
      score += 0.3;
    }

    return Math.min(score, 1.0);
  }
}
