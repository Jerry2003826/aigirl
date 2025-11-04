// 群聊调度器 - 核心协调逻辑
import { Personality, AIConfig } from '../App';
import { AgentSelector, Message, AgentScore } from './agent-selector';
import { FollowUpPolicy } from './follow-up-policy';
import { generateText } from './gemini-service';
import { getActualModel } from './get-actual-model';

export interface AgentState {
  id: string;
  cooldownUntil: number;
  dailyBudget: number;
  followUpsUsed: number;
}

export interface TopicState {
  id: string;
  roundNo: number;
  startTime: number;
}

export interface OrchestratorConfig {
  maxRoundsPerTopic: number;
  cooldownMs: number;
  maxFollowUpsPerTopic: number;
  maxFollowUpsPerRound: number;
  maxChainDepth: number;
  similarityThreshold: number;
  maxMessageLength: number;
}

export interface OrchestratorState {
  topic: TopicState;
  agents: Record<string, AgentState>;
}

export class GroupChatOrchestrator {
  private config: OrchestratorConfig;
  private agentSelector: AgentSelector;
  private followUpPolicy: FollowUpPolicy;
  private topic: TopicState;
  private agents: Record<string, AgentState>;
  private lastMessages: Message[] = [];

  constructor(
    config: Partial<OrchestratorConfig>,
    agentConfigs: Personality[]
  ) {
    // 默认配置
    this.config = {
      maxRoundsPerTopic: 10,
      cooldownMs: 2000,
      maxFollowUpsPerTopic: 3,
      maxFollowUpsPerRound: 1,
      maxChainDepth: 2,
      similarityThreshold: 0.7,
      maxMessageLength: 150,
      ...config,
    };

    this.agentSelector = new AgentSelector();
    this.followUpPolicy = new FollowUpPolicy({
      maxFollowUpsPerTopic: this.config.maxFollowUpsPerTopic,
      maxFollowUpsPerRound: this.config.maxFollowUpsPerRound,
      maxChainDepth: this.config.maxChainDepth,
    });

    // 初始化Agent状态
    this.agents = {};
    agentConfigs.forEach(agent => {
      this.agents[agent.id] = {
        id: agent.id,
        cooldownUntil: 0,
        dailyBudget: 10000,
        followUpsUsed: 0,
      };
    });

    this.topic = this.newTopic();
  }

  private newTopic(): TopicState {
    return {
      id: `topic_${Date.now()}`,
      roundNo: 0,
      startTime: Date.now(),
    };
  }

  // 检查Agent是否可以说话
  private canSpeak(agentId: string): boolean {
    const state = this.agents[agentId];
    if (!state) return false;
    
    return Date.now() >= state.cooldownUntil && state.dailyBudget > 0;
  }

  // 检查文本相似度（简单版本）
  private isSimilar(text1: string, text2: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '');
    const t1 = normalize(text1);
    const t2 = normalize(text2);

    // 简单的包含检查
    if (t1.includes(t2) || t2.includes(t1)) {
      return true;
    }

    // 计算共同字符比例
    const commonChars = Array.from(t1).filter(c => t2.includes(c)).length;
    const ratio = commonChars / Math.max(t1.length, t2.length);

    return ratio > this.config.similarityThreshold;
  }

  // 后处理：检查重复和字数限制
  private postProcess(text: string, agentId: string): string | null {
    const trimmed = text.trim();

    // 字数限制
    if (trimmed.length > this.config.maxMessageLength) {
      return trimmed.substring(0, this.config.maxMessageLength) + '...';
    }

    // 检查与最近3条消息的相似度
    const recentContents = this.lastMessages
      .slice(-3)
      .map(m => m.content);

    for (const recent of recentContents) {
      if (this.isSimilar(trimmed, recent)) {
        console.log(`⚠️ Agent ${agentId} 的回复与最近消息相似，跳过`);
        return null;
      }
    }

    return trimmed;
  }

  // 构建Agent指令
  private buildAgentInstruction(hasFollowUpSlot: boolean = false): string {
    return `
🎭 你在一个多AI群聊中，与其他AI女友一起陪用户聊天。
记住：这是群聊环境，可能有多个AI同时在线，你不是唯一的对话者！

【重要规则】
1. **严格按照你的角色设定说话** - 你的性格、背景、说话方式都要符合你的人设
2. 你只能说1-2句话，保持简洁自然（建议30字以内）
3. 不要重复其他AI已经说过的内容
4. 不要主动发起追问或连续对话
5. 根据你的性格特征展现不同的态度（温柔/活泼/冷淡/俏皮等）
6. 如果其他人已经很好地回答了，你可以简短补充或表达赞同
7. 避免抢话或刷屏，给其他AI也留出发言空间

${hasFollowUpSlot ? '【特殊权限】\n你获得一次追问机会。如果你认为需要澄清某个关键信息，可以向用户提出一个简短的问题（不超过15字）。如果不需要追问，请正常回复。' : ''}

**请完全沉浸在你的角色中，用符合你性格的语气和措辞回复。**
⚠️ 再次强调：这是群聊，不是一对一私聊！请时刻记住你是在和其他AI一起陪伴用户。
`.trim();
  }

  // 构建追问指令
  private buildFollowUpInstruction(): string {
    return `
你获得一个"追问机会"。

请用一句很短的问题（不超过15字）向用户澄清最重要的一个信息缺口。

要求：
1. 只问一个具体的问题
2. 问题要直接、简洁
3. 专注于帮助用户做决策或理解用户需求
4. 如果你认为没有必要追问，请输出"（略过追问）"

例如：
- "你更在意时间还是省钱？"
- "大概什么时候需要？"
- "有什么特别的偏好吗？"
`.trim();
  }

  // 生成AI回复
  private async generateForAgent(
    agentId: string,
    personality: Personality,
    apiConfig: AIConfig,
    instruction: string,
    allPersonalities: Personality[]
  ): Promise<string | null> {
    try {
      // 构建system prompt
      const otherMembers = allPersonalities.filter(p => p.id !== personality.id);
      const systemPrompt = `
${instruction}

【⚠️ 重要提醒：你正在群聊中】
这不是一对一私聊！你和其他${otherMembers.length}个AI女友一起在群里陪用户聊天。
• 不要表现得像你是唯一的AI
• 观察其他AI的发言，避免重复他们已经说过的内容
• 如果其他人已经回答得很好，你可以简短补充或表达不同观点
• 适度发言，不要抢话或刷屏

【你的身份】
姓名：${personality.name}
角色：${personality.role || '普通女友'}
性格：${personality.personality || '温柔体贴'}
性格特征：${personality.traits || '未设置'}
爱好：${personality.hobbies || '未设置'}
背景：${personality.background || '未设置'}
外表：${personality.appearance || '未设置'}

【群里其他成员（共${otherMembers.length}人）】
${otherMembers.map(p => 
  `- ${p.name}（${p.role || 'AI女友'}）：性格${p.personality || '温柔'}，${p.traits || ''}`
).join('\n')}

【聊天历史】
${this.lastMessages.slice(-5).map(m => {
  if (m.authorId === 'user') {
    return `用户: ${m.content}`;
  }
  // 找到消息作者的personality信息
  const authorPersonality = allPersonalities.find(p => p.id === m.authorId);
  const authorName = authorPersonality?.name || 'AI';
  const authorRole = authorPersonality?.role || '';
  return `${authorName}${authorRole ? `(${authorRole})` : ''}: ${m.content}`;
}).join('\n')}
`.trim();

      const actualModel = getActualModel(apiConfig);

      const result = await generateText(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '请根据上述对话历史，以你的角色回复。' }
        ],
        apiConfig.geminiApiKey,
        apiConfig.temperature || 0.7,
        apiConfig.maxTokens || 500,
        actualModel
      );

      return result.text;
    } catch (error) {
      console.error(`❌ Agent ${agentId} 生成失败:`, error);
      return null;
    }
  }

  // 主要处理逻辑
  async handleUserMessage(
    userMessage: Message,
    agentConfigs: Personality[],
    apiConfig: AIConfig
  ): Promise<Message[]> {
    // 添加用户消息到历史
    this.lastMessages.push(userMessage);
    this.topic.roundNo++;

    const replies: Message[] = [];

    // 1. 选出主要回复的AI
    const mainAgentScores = this.agentSelector.selectMainAgents(
      userMessage,
      agentConfigs,
      this.lastMessages,
      2 // 最多2个主要回复者
    );

    console.log('📋 选出的回复者:', mainAgentScores);

    // 2. 为每个主要回复者生成回复
    for (const { agentId, reason } of mainAgentScores) {
      if (!this.canSpeak(agentId)) {
        console.log(`⏳ Agent ${agentId} 在冷却中，跳过`);
        continue;
      }

      const personality = agentConfigs.find(a => a.id === agentId);
      if (!personality) continue;

      const instruction = this.buildAgentInstruction(false);
      const text = await this.generateForAgent(
        agentId,
        personality,
        apiConfig,
        instruction,
        agentConfigs
      );

      if (!text) continue;

      const cleanText = this.postProcess(text, agentId);
      if (!cleanText) continue;

      const reply: Message = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        authorId: agentId,
        content: cleanText,
        timestamp: Date.now(),
      };

      replies.push(reply);
      this.lastMessages.push(reply);

      // 更新Agent状态
      const state = this.agents[agentId];
      state.cooldownUntil = Date.now() + this.config.cooldownMs;
      state.dailyBudget -= cleanText.length;

      console.log(`✅ Agent ${agentId} (${personality.name}) 回复:`, cleanText);

      // 等待一小段时间再生成下一个回复（模拟真实感）
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 3. 评估是否需要追问
    this.followUpPolicy.resetRound();
    const contextText = this.lastMessages.slice(-3).map(m => m.content).join(' ');
    const followUpScore = this.followUpPolicy.scoreFollowUpNeed(
      contextText,
      this.lastMessages.slice(-3).map(m => m.content)
    );

    console.log(`🤔 追问评分: ${followUpScore.toFixed(2)}`);

    if (followUpScore > 0.5 && replies.length > 0) {
      // 选择一个Agent来追问
      const candidates = mainAgentScores.map(s => s.agentId);
      const askerId = this.agentSelector.selectFollowUpAsker(
        candidates,
        contextText,
        agentConfigs
      );

      if (askerId && this.followUpPolicy.canFollowUp(askerId)) {
        const personality = agentConfigs.find(a => a.id === askerId);
        if (personality) {
          const instruction = this.buildFollowUpInstruction();
          const question = await this.generateForAgent(
            askerId,
            personality,
            apiConfig,
            instruction,
            agentConfigs
          );

          if (question && !question.includes('（略过追问）')) {
            const cleanQuestion = this.postProcess(question, askerId);
            if (cleanQuestion && cleanQuestion.length <= 20) {
              const followUpReply: Message = {
                id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                authorId: askerId,
                content: cleanQuestion,
                timestamp: Date.now(),
              };

              replies.push(followUpReply);
              this.lastMessages.push(followUpReply);
              this.followUpPolicy.recordFollowUp(askerId);

              console.log(`❓ Agent ${askerId} (${personality.name}) 追问:`, cleanQuestion);
            }
          }
        }
      }
    }

    // 4. 检查是否需要总结/换话题
    if (
      this.topic.roundNo >= this.config.maxRoundsPerTopic ||
      this.followUpPolicy.getState().usedSlotsThisTopic >= this.config.maxFollowUpsPerTopic
    ) {
      console.log('📝 话题轮次已满，准备总结');
      // 这里可以生成总结，暂时跳过
      this.resetTopic();
    }

    return replies;
  }

  // 重置话题
  resetTopic() {
    this.topic = this.newTopic();
    this.followUpPolicy.resetTopic();
    console.log('🔄 话题已重置');
  }

  // 获取当前状态
  getState(): OrchestratorState {
    return {
      topic: { ...this.topic },
      agents: { ...this.agents },
    };
  }

  // 获取消息历史
  getMessages(): Message[] {
    return [...this.lastMessages];
  }

  // 清空消息历史
  clearMessages() {
    this.lastMessages = [];
  }
}
