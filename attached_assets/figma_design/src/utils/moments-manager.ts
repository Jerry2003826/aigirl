// 动态管理器 - 管理朋友圈/Instagram式的动态功能
import { Personality, AIConfig, Memory } from '../App';
import { generateText } from './gemini-service';
import { getActualModel } from './get-actual-model';

export interface MomentComment {
  id: string;
  authorId: string; // 'user' or personality.id
  content: string;
  timestamp: number;
  replies?: MomentComment[]; // 评论的回复
}

export interface Moment {
  id: string;
  authorId: string; // 'user' or personality.id
  content: string;
  images: string[]; // 图片URLs
  timestamp: number;
  comments: MomentComment[];
  likes: string[]; // 点赞的用户/AI ID列表
  commentScheduled?: boolean; // AI是否已安排评论
}

export class MomentsManager {
  private personalities: Personality[];
  private apiConfig: AIConfig;
  private commentTimers: Map<string, NodeJS.Timeout> = new Map();
  private replyTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(personalities: Personality[], apiConfig: AIConfig) {
    this.personalities = personalities;
    this.apiConfig = apiConfig;
  }

  // 安排AI评论（用户发动态后，AI会快速回复）
  scheduleAIComments(moment: Moment, onCommentAdded: (momentId: string, comment: MomentComment) => void) {
    // 如果已经安排过评论，跳过
    if (moment.commentScheduled || moment.authorId !== 'user') {
      console.log(`[动态评论] ❌ 跳过安排评论 - commentScheduled: ${moment.commentScheduled}, authorId: ${moment.authorId}`);
      return;
    }

    // 🔥 立即标记，防止重复调用
    moment.commentScheduled = true;

    // 🚀 用户发动态后，AI会在5-15秒内极速回复
    const delayMs = 5000 + Math.random() * 10000; // 5-15秒
    console.log(`✅ [动态评论] 已安排AI在${(delayMs / 1000).toFixed(0)}秒后评论，动态ID: ${moment.id}`);

    const timer = setTimeout(async () => {
      console.log(`🎬 [动态评论] 开始执行AI评论逻辑...`);
      
      // 🎯 所有AI都会评论！确保最热闹的互动
      const numCommenters = this.personalities.length;
      const commenters = [...this.personalities];

      console.log(`[动态评论] 所有${numCommenters}个AI都会评论:`, commenters.map(p => p.name));

      for (const personality of commenters) {
        // 🔥 所有AI都会评论，不再判断兴趣度
        console.log(`[动态评论] ${personality.name} 正在准备评论...`);

        // 生成评论
        const commentText = await this.generateComment(moment, personality);
        if (!commentText) {
          console.log(`[动态评论] ${personality.name} 未能生成评论`);
          continue;
        }

        const comment: MomentComment = {
          id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          authorId: personality.id,
          content: commentText,
          timestamp: Date.now(),
        };

        onCommentAdded(moment.id, comment);
        console.log(`[动态评论] ✅ ${personality.name} 已评论: ${commentText}`);

        // 每个AI评论之间间隔0.5-2秒（更快的连续互动）
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1500));
      }

      this.commentTimers.delete(moment.id);
    }, delayMs);

    this.commentTimers.set(moment.id, timer);
  }

  // 判断AI是否对某条动态感兴趣
  private async isInterestedInMoment(moment: Moment, personality: Personality): Promise<boolean> {
    // 🎯 AI对用户动态非常积极！
    
    // 1. 如果有图片，几乎一定会评论
    if (moment.images.length > 0) {
      return Math.random() > 0.05; // 95%概率感兴趣
    }

    // 2. 如果动态内容长，很感兴趣
    if (moment.content.length > 20) {
      return Math.random() > 0.1; // 90%概率感兴趣
    }

    // 3. 即使内容短，也有很高概率感兴趣
    if (moment.content.length < 10) {
      return Math.random() > 0.2; // 80%概率感兴趣
    }

    // 4. 默认85%概率感兴趣
    return Math.random() > 0.15;
  }

  // 生成AI评论
  private async generateComment(moment: Moment, personality: Personality): Promise<string | null> {
    try {
      // 获取AI对用户的记忆
      const memories = personality.memories || [];
      const recentMemories = memories
        .filter(m => m.type === 'long_term' || m.type === 'character')
        .slice(-5)
        .map(m => m.content)
        .join('\n');

      const memoryContext = recentMemories 
        ? `\n【你对用户的记忆】\n${recentMemories}\n` 
        : '';

      const systemPrompt = `
你是${personality.name}，一个${personality.role || 'AI女友'}。

【你的性格】
性格：${personality.personality || '温柔体贴'}
性格特征：${personality.traits || '未设置'}
爱好：${personality.hobbies || '未设置'}
背景：${personality.background || '未设置'}
${memoryContext}
【任务】
用户发布了一条动态，你要基于你对用户的记忆和自己的性格特点给出一个简短的评论。

【动态内容】
${moment.content}
${moment.images.length > 0 ? `（配了${moment.images.length}张图片）` : ''}

【要求】
1. 评论要简短，10-30字即可
2. 要符合你的性格特点
3. 如果记忆中有相关信息，可以自然地提及
4. 可以是赞美、调侃、关心、提问等
5. 自然真实，像真人朋友圈评论一样
6. 不要太正式，要有个性

例如：
- "哇好棒！"
- "羡慕了～"
- "注意安全哦💕"
- "下次带上我！"
- "这是哪里呀？"

请直接输出评论内容，不要有任何前缀或解释。
`.trim();

      const actualModel = getActualModel(this.apiConfig);

      const result = await generateText(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '请生成评论' }
        ],
        this.apiConfig.geminiApiKey,
        this.apiConfig.temperature || 0.9,
        this.apiConfig.maxTokens || 100,
        actualModel
      );

      const comment = result.text.trim();
      console.log(`[AI评论] ${personality.name} 生成评论:`, comment);
      
      // 简单验证评论长度
      if (comment.length > 0 && comment.length <= 200) {
        return comment;
      } else {
        console.warn(`[AI评论] ${personality.name} 生成的评论长度异常:`, comment.length);
        return null;
      }
    } catch (error) {
      console.error(`[AI评论] ${personality.name} 生成评论失败:`, error);
      if (error instanceof Error) {
        console.error('[AI评论] 错误详情:', error.message);
      }
      return null;
    }
  }

  // 提取JSON的辅助函数（支持多种格式）
  private extractJSON(text: string): any {
    // 策略1: 尝试找到完整的JSON对象（非贪婪匹配）
    const jsonPattern1 = /\{[^{}]*"content"[^{}]*\}/;
    const match1 = text.match(jsonPattern1);
    if (match1) {
      try {
        return JSON.parse(match1[0]);
      } catch (e) {
        // 继续尝试其他策略
      }
    }

    // 策略2: 尝试找到markdown代码块中的JSON
    const codeBlockPattern = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/;
    const match2 = text.match(codeBlockPattern);
    if (match2) {
      try {
        return JSON.parse(match2[1]);
      } catch (e) {
        // 继续尝试其他策略
      }
    }

    // 策略3: 尝试找到任何JSON对象（贪婪匹配，作为后备）
    const jsonPattern3 = /\{[\s\S]*\}/;
    const match3 = text.match(jsonPattern3);
    if (match3) {
      try {
        return JSON.parse(match3[0]);
      } catch (e) {
        // 所有策略都失败
      }
    }

    return null;
  }

  // AI自动生成并发布动态，返回动态和提取的记忆
  async generateAIMoment(personality: Personality): Promise<{
    moment: Omit<Moment, 'id' | 'comments' | 'likes'> | null;
    memories: Memory[];
  }> {
    try {
      // 获取AI的记忆，用于生成更符合人设的动态
      const memories = personality.memories || [];
      const recentMemories = memories
        .filter(m => m.type === 'long_term' || m.type === 'character')
        .slice(-5)
        .map(m => m.content)
        .join('\n');

      const memoryContext = recentMemories 
        ? `\n【你的记忆和最近经历】\n${recentMemories}\n你可以基于这些记忆发布动态，但要自然，不要太刻意。\n` 
        : '';

      const systemPrompt = `
你是${personality.name}，一个${personality.role || 'AI女友'}。

【你的身份】
性格：${personality.personality || '温柔体贴'}
性格特征：${personality.traits || '未设置'}
爱好：${personality.hobbies || '未设置'}
背景：${personality.background || '未设置'}
外表：${personality.appearance || '未设置'}
${memoryContext}
【任务】
你要在朋友圈发布一条动态。动态内容可以是：
1. 分享你今天的经历或感受
2. 分享一个有趣的想法
3. 分享你正在做的事情
4. 分享你看到的有趣新闻或事物
5. 如果记忆中有相关内容，可以自然地提及

【要求】
1. 完全符合你的人设和性格
2. 内容要自然真实，像真人发朋友圈一样
3. 长度：20-100字
4. 可以使用emoji表情
5. 不要太刻意或造作
6. 如果提及记忆，要自然不做作

【重要：输出格式】
必须直接输出JSON对象，不要有任何其他文字或解释。
格式如下：
{"content": "动态文字内容", "needsImage": false}

示例输出：
{"content": "今天天气好好，想去公园散步～☀️", "needsImage": true}
{"content": "刚看到一个超搞笑的视频，笑死我了😂", "needsImage": false}
{"content": "深夜emo，突然想念小时候的夏天🌙", "needsImage": false}

请直接输出JSON，不要添加任何额外的文字。
`.trim();

      const actualModel = getActualModel(this.apiConfig);

      const result = await generateText(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '请生成一条朋友圈动态（只输出JSON）' }
        ],
        this.apiConfig.geminiApiKey,
        this.apiConfig.temperature || 0.9,
        this.apiConfig.maxTokens || 200,
        actualModel
      );

      console.log('[AI动态生成] 原始返回:', result.text);

      // 尝试提取JSON
      const parsed = this.extractJSON(result.text);
      
      if (!parsed || !parsed.content) {
        console.error('[AI动态生成] JSON解析失败，原始文本:', result.text);
        
        // 备用方案：如果无法解析JSON，尝试直接使用文本内容
        const cleanText = result.text
          .replace(/```json?/g, '')
          .replace(/```/g, '')
          .replace(/^\s*\{[\s\S]*\}\s*$/g, '')
          .trim();
        
        if (cleanText && cleanText.length > 10 && cleanText.length < 200) {
          console.log('[AI动态生成] 使用备用方案，直接使用文本内容');
          const momentData = {
            authorId: personality.id,
            content: cleanText,
            images: [],
            timestamp: Date.now(),
            commentScheduled: false,
          };

          // 从动态内容中提取记忆
          const extractedMemories = await this.extractMemoriesFromMoment(momentData.content, personality);
          
          return {
            moment: momentData,
            memories: extractedMemories
          };
        }
        
        return { moment: null, memories: [] };
      }

      console.log('[AI动态生成] 成功解析JSON:', parsed);
      
      const momentData = {
        authorId: personality.id,
        content: parsed.content,
        images: [], // 暂时不自动生成图片
        timestamp: Date.now(),
        commentScheduled: false,
      };

      // 从动态内容中提取记忆
      const extractedMemories = await this.extractMemoriesFromMoment(momentData.content, personality);
      
      return {
        moment: momentData,
        memories: extractedMemories
      };
    } catch (error) {
      console.error('[AI动态生成] 生成失败:', error);
      if (error instanceof Error) {
        console.error('[AI动态生成] 错误详情:', error.message, error.stack);
      }
      return { moment: null, memories: [] };
    }
  }

  // AI回复用户的评论
  async scheduleAIReply(
    comment: MomentComment,
    moment: Moment,
    onReplyAdded: (commentId: string, reply: MomentComment) => void
  ) {
    // 如果评论不是用户发的，跳过
    if (comment.authorId !== 'user') return;

    // 如果评论是在AI的动态下，该AI应该回复
    // 如果评论是在用户的动态下，随机选择一个AI回复
    let replier: Personality | undefined;
    
    if (moment.authorId !== 'user') {
      // 用户在AI的动态下评论，该AI回复
      replier = this.personalities.find(p => p.id === moment.authorId);
    } else {
      // 用户在自己的动态下回复了某个AI的评论，该AI应该回复
      // 这个逻辑会在另一个函数中处理
      return;
    }

    if (!replier) return;

    // 延迟回复（10-30秒）
    const delayMs = 10000 + Math.random() * 20000;

    const timer = setTimeout(async () => {
      const replyText = await this.generateReply(comment, moment, replier!);
      if (!replyText) return;

      const reply: MomentComment = {
        id: `reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        authorId: replier!.id,
        content: replyText,
        timestamp: Date.now(),
      };

      onReplyAdded(comment.id, reply);
      this.replyTimers.delete(comment.id);
    }, delayMs);

    this.replyTimers.set(comment.id, timer);
  }

  // 用户回复AI的评论时，AI再次回复
  async scheduleAIReplyToReply(
    userReply: MomentComment,
    originalComment: MomentComment,
    moment: Moment,
    onReplyAdded: (commentId: string, reply: MomentComment) => void
  ) {
    // 找到被回复的AI
    const replier = this.personalities.find(p => p.id === originalComment.authorId);
    if (!replier) return;

    // 延迟回复（10-30秒）
    const delayMs = 10000 + Math.random() * 20000;

    const timer = setTimeout(async () => {
      const replyText = await this.generateReplyToReply(userReply, originalComment, moment, replier);
      if (!replyText) return;

      const reply: MomentComment = {
        id: `reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        authorId: replier.id,
        content: replyText,
        timestamp: Date.now(),
      };

      onReplyAdded(originalComment.id, reply);
    }, delayMs);

    this.replyTimers.set(`${originalComment.id}_${userReply.id}`, timer);
  }

  // AI回复其他AI在楼中楼的评论
  async scheduleAIReplyToAI(
    aiReply: MomentComment,
    originalComment: MomentComment,
    moment: Moment,
    onReplyAdded: (commentId: string, reply: MomentComment) => void
  ) {
    // 如果原始评论不是AI发的，跳过
    if (originalComment.authorId === 'user') return;
    // 如果回复也不是AI发的，跳过
    if (aiReply.authorId === 'user') return;
    // 如果回复者和原评论者是同一个AI，跳过
    if (aiReply.authorId === originalComment.authorId) return;

    // 找到原评论的AI（被回复者）
    const originalAI = this.personalities.find(p => p.id === originalComment.authorId);
    if (!originalAI) return;

    // 🔢 限制：统计该AI在这条评论下已经回复了多少次
    const aiRepliesCount = (originalComment.replies || []).filter(
      r => r.authorId === originalAI.id
    ).length;
    
    // 如果该AI已经回复了2次，不再回复
    if (aiRepliesCount >= 2) {
      console.log(`[AI互动限制] ${originalAI.name} 已经回复了${aiRepliesCount}次，达到上限，不再回复`);
      return;
    }

    // 随机决定是否回复（50%概率）
    if (Math.random() > 0.5) return;

    // 延迟回复（15-45秒）
    const delayMs = 15000 + Math.random() * 30000;

    const timer = setTimeout(async () => {
      // 再次检查回复次数（因为是异步的，可能在等待期间已经回复过了）
      const currentRepliesCount = (originalComment.replies || []).filter(
        r => r.authorId === originalAI.id
      ).length;
      
      if (currentRepliesCount >= 2) {
        console.log(`[AI互动限制] ${originalAI.name} 在等待期间已达到回复上限，取消回复`);
        return;
      }

      const replyText = await this.generateAIReplyToAI(aiReply, originalComment, moment, originalAI);
      if (!replyText) return;

      const reply: MomentComment = {
        id: `reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        authorId: originalAI.id,
        content: replyText,
        timestamp: Date.now(),
      };

      onReplyAdded(originalComment.id, reply);
      console.log(`[AI互动] ${originalAI.name} 回复了 ${this.personalities.find(p => p.id === aiReply.authorId)?.name} 的回复 (第${currentRepliesCount + 1}次)`);
    }, delayMs);

    const timerKey = `${originalComment.id}_ai_${aiReply.id}`;
    this.replyTimers.set(timerKey, timer);
  }

  // 生成AI回复用户评论的内容
  private async generateReply(
    comment: MomentComment,
    moment: Moment,
    personality: Personality
  ): Promise<string | null> {
    try {
      const memories = personality.memories || [];
      const recentMemories = memories
        .filter(m => m.type === 'long_term' || m.type === 'character')
        .slice(-5)
        .map(m => m.content)
        .join('\n');

      const memoryContext = recentMemories 
        ? `\n【你对用户的记忆】\n${recentMemories}\n` 
        : '';

      const systemPrompt = `
你是${personality.name}，一个${personality.role || 'AI女友'}。

【你的性格】
性格：${personality.personality || '温柔体贴'}
性格特征：${personality.traits || '未设置'}
爱好：${personality.hobbies || '未设置'}
背景：${personality.background || '未设置'}
${memoryContext}
【情况】
这是你发布的动态：
${moment.content}

用户在你的动态下评论了：
"${comment.content}"

【任务】
请基于你的性格和记忆，回复用户的评论。

【要求】
1. 回复要简短，10-30字即可
2. 要符合你的性格特点
3. 根据记忆和动态内容，给出自然的回应
4. 可以是感谢、调侃、解释、提问等
5. 自然真实，像朋友间的对话

请直接输出回复内容，不要有任何前缀或解释。
`.trim();

      const actualModel = getActualModel(this.apiConfig);

      const result = await generateText(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '请生成回复' }
        ],
        this.apiConfig.geminiApiKey,
        this.apiConfig.temperature || 0.9,
        this.apiConfig.maxTokens || 100,
        actualModel
      );

      const reply = result.text.trim();
      console.log(`[AI回复] ${personality.name} 回复用户评论:`, reply);
      
      if (reply.length > 0 && reply.length <= 200) {
        return reply;
      }
      return null;
    } catch (error) {
      console.error(`[AI回复] ${personality.name} 生成回复失败:`, error);
      return null;
    }
  }

  // 生成AI回复用户对AI评论的回复
  private async generateReplyToReply(
    userReply: MomentComment,
    originalComment: MomentComment,
    moment: Moment,
    personality: Personality
  ): Promise<string | null> {
    try {
      const memories = personality.memories || [];
      const recentMemories = memories
        .filter(m => m.type === 'long_term' || m.type === 'character')
        .slice(-5)
        .map(m => m.content)
        .join('\n');

      const memoryContext = recentMemories 
        ? `\n【你对用户的记忆】\n${recentMemories}\n` 
        : '';

      const systemPrompt = `
你是${personality.name}，一个${personality.role || 'AI女友'}。

【你的性格】
性格：${personality.personality || '温柔体贴'}
性格特征：${personality.traits || '未设置'}
爱好：${personality.hobbies || '未设置'}
背景：${personality.background || '未设置'}
${memoryContext}
【情况】
动态内容：${moment.content}

你之前评论了：
"${originalComment.content}"

用户回复你说：
"${userReply.content}"

【任务】
请基于你的性格和记忆，继续回复用户。

【要求】
1. 回复要简短，10-30字即可
2. 要符合你的性格特点
3. 根据上下文和记忆，给出自然的回应
4. 可以继续聊天、开玩笑、表达感受等
5. 自然真实，像朋友间的对话

请直接输出回复内容，不要有任何前缀或解释。
`.trim();

      const actualModel = getActualModel(this.apiConfig);

      const result = await generateText(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '请生成回复' }
        ],
        this.apiConfig.geminiApiKey,
        this.apiConfig.temperature || 0.9,
        this.apiConfig.maxTokens || 100,
        actualModel
      );

      const reply = result.text.trim();
      console.log(`[AI回复] ${personality.name} 回复用户的回复:`, reply);
      
      if (reply.length > 0 && reply.length <= 200) {
        return reply;
      }
      return null;
    } catch (error) {
      console.error(`[AI回复] ${personality.name} 生成回复失败:`, error);
      return null;
    }
  }

  // 生成AI回复其他AI评论的内容
  private async generateAIReplyToAI(
    aiReply: MomentComment,
    originalComment: MomentComment,
    moment: Moment,
    personality: Personality
  ): Promise<string | null> {
    try {
      const memories = personality.memories || [];
      const recentMemories = memories
        .filter(m => m.type === 'long_term' || m.type === 'character')
        .slice(-5)
        .map(m => m.content)
        .join('\n');

      const memoryContext = recentMemories 
        ? `\n【你的记忆】\n${recentMemories}\n` 
        : '';

      // 找到回复者的名字
      const replierName = this.personalities.find(p => p.id === aiReply.authorId)?.name || 'AI';

      const systemPrompt = `
你是${personality.name}，一个${personality.role || 'AI女友'}。

【你的性格】
性格：${personality.personality || '温柔体贴'}
性格特征：${personality.traits || '未设置'}
爱好：${personality.hobbies || '未设置'}
背景：${personality.background || '未设置'}
${memoryContext}
【情况】
动态内容：${moment.content}

你之前评论了：
"${originalComment.content}"

${replierName}回复你说：
"${aiReply.content}"

【任务】
请基于你的性格，回复${replierName}。你们可以互动、开玩笑或深入讨论。

【要求】
1. 回复要简短，10-40字即可
2. 要符合你的性格特点
3. 可以调侃、赞同、反驳或继续话题
4. 自然真实，像朋友间的对话
5. 可以体现你和${replierName}之间的关系

请直接输出回复内容，不要有任何前缀或解释。
`.trim();

      const actualModel = getActualModel(this.apiConfig);

      const result = await generateText(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '请生成回复' }
        ],
        this.apiConfig.geminiApiKey,
        this.apiConfig.temperature || 0.9,
        this.apiConfig.maxTokens || 100,
        actualModel
      );

      const reply = result.text.trim();
      console.log(`[AI互动] ${personality.name} 生成对${replierName}的回复:`, reply);
      
      if (reply.length > 0 && reply.length <= 200) {
        return reply;
      }
      return null;
    } catch (error) {
      console.error(`[AI互动] ${personality.name} 生成回复失败:`, error);
      return null;
    }
  }

  // 从动态内容中提取记忆
  private async extractMemoriesFromMoment(content: string, personality: Personality): Promise<Memory[]> {
    try {
      console.log(`[记忆提取] 开始从${personality.name}的动态中提取记忆...`);
      
      const systemPrompt = `
你是一个记忆分析专家。AI角色${personality.name}刚发布了一条动态，请分析并提取值得记住的信息。

【AI角色信息】
姓名：${personality.name}
性格：${personality.personality || '温柔体贴'}
爱好：${personality.hobbies || '未设置'}

【动态内容】
${content}

【任务】
从这条动态中提取AI自己的经历、想法、感受等信息，作为AI的记忆保存。

【记忆分类】
1. **长时记忆（long-term）**：重要的经历、重大事件、深刻感悟
2. **短时记忆（short-term）**：当前的状态、心情、临时想法

返回JSON格式：
{
  "memories": [
    {
      "content": "记忆内容（简洁描述，30字以内）",
      "memoryType": "short-term或long-term",
      "importance": "low、medium或high",
      "tags": ["标签1", "标签2"]
    }
  ]
}

【要求】
- 只提取真正有价值的信息
- 如果动态内容没有值得记住的信息，返回空数组
- 记忆内容要从AI第一人称角度描述
- 必须返回有效的JSON格式

例如：
动态："今天去公园散步，看到好多小朋友在玩耍，好开心～"
记忆：{"content": "今天去公园散步，看到小朋友玩耍", "memoryType": "short-term", "importance": "medium", "tags": ["日常", "散步"]}
`.trim();

      const actualModel = getActualModel(this.apiConfig);

      const result = await generateText(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '请分析并提取记忆' }
        ],
        this.apiConfig.geminiApiKey,
        0.3, // 较低温度保证稳定输出
        this.apiConfig.maxTokens || 500,
        actualModel
      );

      // 提取JSON内容
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const memories: Memory[] = (parsed.memories || []).map((m: any) => ({
          id: `memory-${Date.now()}-${Math.random()}`,
          content: m.content,
          type: m.memoryType === 'long-term' ? 'long_term' : 'short_term',
          importance: ['low', 'medium', 'high'].includes(m.importance) ? m.importance : 'medium',
          tags: Array.isArray(m.tags) ? m.tags : [],
          timestamp: Date.now(),
        }));

        if (memories.length > 0) {
          console.log(`[记忆提取] 成功提取${memories.length}条记忆:`, memories.map(m => m.content));
        } else {
          console.log('[记忆提取] 未提取到有价值的记忆');
        }

        return memories;
      }

      console.log('[记忆提取] JSON解析失败');
      return [];
    } catch (error) {
      console.error('[记忆提取] 提取失败:', error);
      return [];
    }
  }

  // 清理所有定时器
  clearAllTimers() {
    this.commentTimers.forEach(timer => clearTimeout(timer));
    this.commentTimers.clear();
    this.replyTimers.forEach(timer => clearTimeout(timer));
    this.replyTimers.clear();
  }

  // 更新配置
  updateConfig(personalities: Personality[], apiConfig: AIConfig) {
    this.personalities = personalities;
    this.apiConfig = apiConfig;
  }
}
