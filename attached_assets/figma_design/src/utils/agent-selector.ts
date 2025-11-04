// Agent选择器 - 决定哪些AI应该回答
import { Personality } from '../App';

export interface Message {
  id: string;
  authorId: string; // 'user' | agentId
  content: string;
  timestamp: number;
}

export interface AgentScore {
  agentId: string;
  score: number;
  reason: string;
}

export class AgentSelector {
  // 从用户消息中提取@mention
  private extractMentions(content: string, agents: Personality[]): string[] {
    const mentions: string[] = [];
    
    agents.forEach(agent => {
      // 检测 @名字 或 "对XXX说"
      if (
        content.includes(`@${agent.name}`) ||
        content.includes(`对${agent.name}说`) ||
        content.includes(`问${agent.name}`)
      ) {
        mentions.push(agent.id);
      }
    });

    return mentions;
  }

  // 计算Agent与消息的相关度
  private calculateRelevance(
    agent: Personality,
    message: string,
    recentMessages: Message[]
  ): number {
    let score = 0;

    // 1. 关键词匹配 (基于Agent的角色、性格、爱好)
    const agentKeywords = [
      agent.role || '',
      agent.traits || '',
      agent.likes || '',
      agent.experience || '',
    ].join(' ').toLowerCase();

    const messageLower = message.toLowerCase();
    
    // 简单的关键词重叠计分
    const messageWords = messageLower.split(/\s+/);
    const matchedWords = messageWords.filter(word => 
      word.length > 2 && agentKeywords.includes(word)
    );
    score += matchedWords.length * 0.2;

    // 2. 话题连续性 - 如果Agent最近说过话，稍微提高分数
    const recentSpeaker = recentMessages
      .slice(-3)
      .some(m => m.authorId === agent.id);
    if (recentSpeaker) {
      score += 0.3;
    }

    // 3. 角色专业性匹配
    if (agent.role) {
      const roleLower = agent.role.toLowerCase();
      if (
        (roleLower.includes('医生') && /健康|身体|病/.test(messageLower)) ||
        (roleLower.includes('老师') && /学习|教|知识/.test(messageLower)) ||
        (roleLower.includes('厨师') && /做饭|菜|食物/.test(messageLower)) ||
        (roleLower.includes('程序员') && /代码|编程|技术/.test(messageLower))
      ) {
        score += 0.5;
      }
    }

    // 4. 性格匹配
    if (agent.traits) {
      const traitsLower = agent.traits.toLowerCase();
      if (
        (traitsLower.includes('活泼') && /玩|开心|有趣/.test(messageLower)) ||
        (traitsLower.includes('温柔') && /担心|关心|照顾/.test(messageLower)) ||
        (traitsLower.includes('知性') && /为什么|原因|解释/.test(messageLower))
      ) {
        score += 0.4;
      }
    }

    return score;
  }

  // 防止同一个Agent连续说话太多次
  private applyRotationPenalty(
    agentId: string,
    recentMessages: Message[]
  ): number {
    const lastSpeakers = recentMessages.slice(-3).map(m => m.authorId);
    const speakCount = lastSpeakers.filter(id => id === agentId).length;
    
    // 说得越多，惩罚越大
    return Math.max(0, 1 - speakCount * 0.3);
  }

  // 主要选择逻辑
  selectMainAgents(
    userMessage: Message,
    agents: Personality[],
    recentMessages: Message[],
    maxAgents: number = 2
  ): AgentScore[] {
    // 1. 检查是否有直接@mention
    const mentions = this.extractMentions(userMessage.content, agents);
    if (mentions.length > 0) {
      return mentions.map(id => ({
        agentId: id,
        score: 1.0,
        reason: '被用户直接提及'
      }));
    }

    // 2. 计算每个Agent的得分
    const scores: AgentScore[] = agents.map(agent => {
      const relevanceScore = this.calculateRelevance(
        agent,
        userMessage.content,
        recentMessages
      );
      
      const rotationPenalty = this.applyRotationPenalty(
        agent.id,
        recentMessages
      );

      const finalScore = relevanceScore * rotationPenalty;

      return {
        agentId: agent.id,
        score: finalScore,
        reason: `相关度:${relevanceScore.toFixed(2)}, 轮换:${rotationPenalty.toFixed(2)}`
      };
    });

    // 3. 排序并选出前N个
    scores.sort((a, b) => b.score - a.score);

    // 4. 如果所有得分都很低，随机选1-2个保证有人说话
    if (scores[0].score < 0.3) {
      const randomAgents = this.selectRandomAgents(agents, Math.min(2, maxAgents));
      return randomAgents.map(id => ({
        agentId: id,
        score: 0.5,
        reason: '随机选择（低相关度）'
      }));
    }

    return scores.slice(0, maxAgents);
  }

  // 随机选择Agent（用于低相关度情况）
  private selectRandomAgents(agents: Personality[], count: number): string[] {
    const shuffled = [...agents].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map(a => a.id);
  }

  // 选择追问者（从主要回复者中选一个最适合追问的）
  selectFollowUpAsker(
    candidates: string[],
    context: string,
    agents: Personality[]
  ): string | null {
    if (candidates.length === 0) return null;

    // 简单策略：选择第一个候选者
    // 可以扩展为更复杂的逻辑（如选择最"好奇"的角色）
    const selectedId = candidates[0];
    const agent = agents.find(a => a.id === selectedId);
    
    if (agent && agent.traits) {
      const traits = agent.traits.toLowerCase();
      // 优先选择好奇、活泼的角色来追问
      if (traits.includes('好奇') || traits.includes('活泼')) {
        return selectedId;
      }
    }

    return selectedId;
  }
}
