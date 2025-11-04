import React, { useState } from 'react';
import { Personality } from '../App';
import { Moment, MomentComment } from '../utils/moments-manager';
import { SafeAvatar } from './SafeAvatar';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Card } from './ui/card';
import { Heart, MessageCircle, Send, Image as ImageIcon, X, ArrowLeft } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface MomentsProps {
  moments: Moment[];
  personalities: Personality[];
  userProfile: { nickname: string; avatarUrl?: string };
  onPublishMoment: (content: string, images: string[]) => void;
  onAddComment: (momentId: string, content: string) => void;
  onReplyToComment: (momentId: string, commentId: string, content: string) => void;
  onToggleLike: (momentId: string) => void;
  onBack?: () => void;
}

export function Moments({ 
  moments, 
  personalities, 
  userProfile,
  onPublishMoment,
  onAddComment,
  onReplyToComment,
  onToggleLike,
  onBack
}: MomentsProps) {
  const [isComposing, setIsComposing] = useState(false);
  const [composerContent, setComposerContent] = useState('');
  const [composerImages, setComposerImages] = useState<string[]>([]);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({}); // 回复输入框
  const [replyingTo, setReplyingTo] = useState<string | null>(null); // 正在回复的评论ID
  const [showComments, setShowComments] = useState<Record<string, boolean>>({});

  // 获取作者信息
  const getAuthor = (authorId: string) => {
    if (authorId === 'user') {
      return { name: userProfile.nickname, avatarUrl: userProfile.avatarUrl };
    }
    const personality = personalities.find(p => p.id === authorId);
    return { 
      name: personality?.name || 'AI', 
      avatarUrl: personality?.avatarUrl 
    };
  };

  // 处理图片上传
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    // 这里应该上传到服务器，暂时使用本地URL
    const newImages: string[] = [];
    for (let i = 0; i < Math.min(files.length, 9 - composerImages.length); i++) {
      const reader = new FileReader();
      reader.onloadend = () => {
        newImages.push(reader.result as string);
        if (newImages.length === Math.min(files.length, 9 - composerImages.length)) {
          setComposerImages([...composerImages, ...newImages]);
        }
      };
      reader.readAsDataURL(files[i]);
    }
  };

  // 发布动态
  const handlePublish = () => {
    if (!composerContent.trim() && composerImages.length === 0) return;
    
    onPublishMoment(composerContent, composerImages);
    setComposerContent('');
    setComposerImages([]);
    setIsComposing(false);
  };

  // 发送评论
  const handleSendComment = (momentId: string) => {
    const content = commentInputs[momentId]?.trim();
    if (!content) return;

    onAddComment(momentId, content);
    setCommentInputs({ ...commentInputs, [momentId]: '' });
  };

  // 按时间倒序排列
  const sortedMoments = [...moments].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="md:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <h1 className="text-xl">动态</h1>
        </div>
        <Button onClick={() => setIsComposing(!isComposing)} variant="outline" size="sm">
          {isComposing ? '取消' : '发布动态'}
        </Button>
      </div>

      {/* 发布动态编辑器 */}
      {isComposing && (
        <Card className="m-4 p-4 space-y-4">
          <div className="flex gap-3">
            <SafeAvatar
              avatarUrl={userProfile.avatarUrl}
              name={userProfile.nickname}
              className="h-10 w-10"
            />
            <div className="flex-1">
              <Textarea
                value={composerContent}
                onChange={(e) => setComposerContent(e.target.value)}
                placeholder="分享新鲜事..."
                className="min-h-[100px] resize-none"
              />
            </div>
          </div>

          {/* 图片预览 */}
          {composerImages.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {composerImages.map((img, idx) => (
                <div key={idx} className="relative aspect-square">
                  <ImageWithFallback
                    src={img}
                    alt={`图片 ${idx + 1}`}
                    className="w-full h-full object-cover rounded"
                  />
                  <button
                    onClick={() => setComposerImages(composerImages.filter((_, i) => i !== idx))}
                    className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 工具栏 */}
          <div className="flex items-center justify-between">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
                disabled={composerImages.length >= 9}
              />
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-green-600">
                <ImageIcon className="h-5 w-5" />
                <span>添加图片 ({composerImages.length}/9)</span>
              </div>
            </label>
            <Button 
              onClick={handlePublish}
              disabled={!composerContent.trim() && composerImages.length === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              发布
            </Button>
          </div>
        </Card>
      )}

      {/* 动态列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {sortedMoments.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            还没有动态，发布第一条吧！
          </div>
        ) : (
          sortedMoments.map((moment) => {
            const author = getAuthor(moment.authorId);
            const isLiked = moment.likes.includes('user');
            
            return (
              <Card key={moment.id} className="p-4">
                {/* 头部 */}
                <div className="flex items-start gap-3 mb-3">
                  <SafeAvatar
                    avatarUrl={author.avatarUrl}
                    name={author.name}
                    className="h-12 w-12"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{author.name}</span>
                      {moment.authorId !== 'user' && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          AI女友
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {format(moment.timestamp, 'MM月dd日 HH:mm', { locale: zhCN })}
                    </div>
                  </div>
                </div>

                {/* 内容 */}
                <div className="mb-3 whitespace-pre-wrap">{moment.content}</div>

                {/* 图片 */}
                {moment.images.length > 0 && (
                  <div className={`grid gap-2 mb-3 ${
                    moment.images.length === 1 ? 'grid-cols-1' :
                    moment.images.length === 2 ? 'grid-cols-2' :
                    'grid-cols-3'
                  }`}>
                    {moment.images.map((img, idx) => (
                      <div key={idx} className="relative aspect-square">
                        <ImageWithFallback
                          src={img}
                          alt={`图片 ${idx + 1}`}
                          className="w-full h-full object-cover rounded"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* 点赞和评论按钮 */}
                <div className="flex items-center gap-6 py-2 border-t">
                  <button
                    onClick={() => onToggleLike(moment.id)}
                    className={`flex items-center gap-2 ${
                      isLiked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'
                    }`}
                  >
                    <Heart className={`h-5 w-5 ${isLiked ? 'fill-current' : ''}`} />
                    <span className="text-sm">
                      {moment.likes.length > 0 ? moment.likes.length : '点赞'}
                    </span>
                  </button>
                  <button
                    onClick={() => setShowComments({ ...showComments, [moment.id]: !showComments[moment.id] })}
                    className="flex items-center gap-2 text-gray-500 hover:text-green-600"
                  >
                    <MessageCircle className="h-5 w-5" />
                    <span className="text-sm">
                      {moment.comments.length > 0 ? moment.comments.length : '评论'}
                    </span>
                  </button>
                </div>

                {/* 评论区 */}
                {showComments[moment.id] && (
                  <div className="mt-3 space-y-3 border-t pt-3">
                    {/* 评论列表 */}
                    {moment.comments.map((comment) => {
                      const commentAuthor = getAuthor(comment.authorId);
                      const replyKey = `${moment.id}_${comment.id}`;
                      
                      return (
                        <div key={comment.id} className="space-y-2">
                          <div className="flex gap-2">
                            <SafeAvatar
                              avatarUrl={commentAuthor.avatarUrl}
                              name={commentAuthor.name}
                              className="h-8 w-8"
                            />
                            <div className="flex-1">
                              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2">
                                <div className="text-sm font-medium mb-1">
                                  {commentAuthor.name}
                                </div>
                                <div className="text-sm">{comment.content}</div>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                                <span>{format(comment.timestamp, 'MM月dd日 HH:mm', { locale: zhCN })}</span>
                                {/* 回复按钮 */}
                                <button
                                  onClick={() => setReplyingTo(replyingTo === replyKey ? null : replyKey)}
                                  className="hover:text-green-600"
                                >
                                  回复
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* 回复列表 */}
                          {comment.replies && comment.replies.length > 0 && (
                            <div className="ml-10 space-y-2">
                              {comment.replies.map((reply) => {
                                const replyAuthor = getAuthor(reply.authorId);
                                return (
                                  <div key={reply.id} className="flex gap-2">
                                    <SafeAvatar
                                      avatarUrl={replyAuthor.avatarUrl}
                                      name={replyAuthor.name}
                                      className="h-6 w-6"
                                    />
                                    <div className="flex-1">
                                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2">
                                        <div className="text-xs font-medium mb-1">
                                          {replyAuthor.name}
                                        </div>
                                        <div className="text-xs">{reply.content}</div>
                                      </div>
                                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        {format(reply.timestamp, 'MM月dd日 HH:mm', { locale: zhCN })}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* 回复输入框 */}
                          {replyingTo === replyKey && (
                            <div className="ml-10 flex gap-2">
                              <SafeAvatar
                                avatarUrl={userProfile.avatarUrl}
                                name={userProfile.nickname}
                                className="h-6 w-6"
                              />
                              <div className="flex-1 flex gap-2">
                                <input
                                  type="text"
                                  value={replyInputs[replyKey] || ''}
                                  onChange={(e) => setReplyInputs({ ...replyInputs, [replyKey]: e.target.value })}
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                      const content = replyInputs[replyKey]?.trim();
                                      if (content) {
                                        onReplyToComment(moment.id, comment.id, content);
                                        setReplyInputs({ ...replyInputs, [replyKey]: '' });
                                        setReplyingTo(null);
                                      }
                                    }
                                  }}
                                  placeholder={`回复 ${commentAuthor.name}...`}
                                  className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                                  autoFocus
                                />
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    const content = replyInputs[replyKey]?.trim();
                                    if (content) {
                                      onReplyToComment(moment.id, comment.id, content);
                                      setReplyInputs({ ...replyInputs, [replyKey]: '' });
                                      setReplyingTo(null);
                                    }
                                  }}
                                  disabled={!replyInputs[replyKey]?.trim()}
                                  className="h-7 bg-green-600 hover:bg-green-700"
                                >
                                  <Send className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* 评论输入框 */}
                    <div className="flex gap-2">
                      <SafeAvatar
                        avatarUrl={userProfile.avatarUrl}
                        name={userProfile.nickname}
                        className="h-8 w-8"
                      />
                      <div className="flex-1 flex gap-2">
                        <input
                          type="text"
                          value={commentInputs[moment.id] || ''}
                          onChange={(e) => setCommentInputs({ ...commentInputs, [moment.id]: e.target.value })}
                          onKeyPress={(e) => e.key === 'Enter' && handleSendComment(moment.id)}
                          placeholder="说点什么..."
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleSendComment(moment.id)}
                          disabled={!commentInputs[moment.id]?.trim()}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
