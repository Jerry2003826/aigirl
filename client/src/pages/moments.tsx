import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Heart, MessageCircle, Send, Image as ImageIcon, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import type { Moment, MomentLike, MomentComment, AiPersona, User } from "@shared/schema";

interface MomentWithDetails extends Moment {
  likes: MomentLike[];
  comments: MomentComment[];
}

export default function MomentsPage() {
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [showComments, setShowComments] = useState<Record<string, boolean>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  // Fetch current user
  const { data: currentUser } = useQuery<User>({
    queryKey: ['/api/auth/user'],
  });

  // Fetch AI personas
  const { data: personas = [] } = useQuery<AiPersona[]>({
    queryKey: ['/api/personas'],
  });

  // Fetch moments with their likes and comments (backend returns complete data)
  const { data: momentsWithDetails = [], isLoading } = useQuery<MomentWithDetails[]>({
    queryKey: ['/api/moments'],
  });

  // Create moment mutation
  const createMomentMutation = useMutation({
    mutationFn: async (data: { content: string; images?: string[] }) => {
      return apiRequest('POST', '/api/moments', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/moments'] });
      setContent("");
      setShowComposer(false);
      toast({ title: "动态已发布" });
    },
    onError: () => {
      toast({ title: "发布失败", variant: "destructive" });
    },
  });

  // Toggle like mutation
  const toggleLikeMutation = useMutation({
    mutationFn: async (momentId: string) => {
      return apiRequest('POST', `/api/moments/${momentId}/like`);
    },
    onSuccess: () => {
      // Invalidate moments query to refetch with updated likes
      queryClient.invalidateQueries({ queryKey: ['/api/moments'] });
    },
  });

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: async ({ momentId, content, parentCommentId }: { momentId: string; content: string; parentCommentId?: string }) => {
      return apiRequest('POST', `/api/moments/${momentId}/comments`, { content, parentCommentId });
    },
    onSuccess: () => {
      // Invalidate moments query to refetch with updated comments
      queryClient.invalidateQueries({ queryKey: ['/api/moments'] });
    },
  });

  const handlePublish = () => {
    if (!content.trim()) return;
    createMomentMutation.mutate({ content });
  };

  const handleLike = (momentId: string) => {
    toggleLikeMutation.mutate(momentId);
  };

  const handleComment = (momentId: string) => {
    const commentContent = commentInputs[momentId]?.trim();
    if (!commentContent) return;

    createCommentMutation.mutate(
      { momentId, content: commentContent },
      {
        onSuccess: () => {
          setCommentInputs(prev => ({ ...prev, [momentId]: "" }));
        },
      }
    );
  };

  const handleReply = (momentId: string, parentCommentId: string) => {
    const replyKey = `${momentId}_${parentCommentId}`;
    const replyContent = replyInputs[replyKey]?.trim();
    if (!replyContent) return;

    createCommentMutation.mutate(
      { momentId, content: replyContent, parentCommentId },
      {
        onSuccess: () => {
          setReplyInputs(prev => ({ ...prev, [replyKey]: "" }));
          setReplyingTo(null);
        },
      }
    );
  };

  const getAuthor = (authorId: string, authorType: string) => {
    if (authorType === 'user') {
      // Check if it's the current user
      if (authorId === currentUser?.id) {
        return {
          name: currentUser?.username || currentUser?.firstName || '我',
          avatarUrl: currentUser?.profileImageUrl,
        };
      } else {
        // For other users, show a generic name (in production, fetch from backend)
        return {
          name: '用户',
          avatarUrl: undefined,
        };
      }
    } else {
      // For AI personas
      const persona = personas.find(p => p.id === authorId);
      return {
        name: persona?.name || 'AI',
        avatarUrl: persona?.avatarUrl,
      };
    }
  };

  // Group comments by parent
  const getCommentsTree = (comments: MomentComment[]) => {
    const topLevel = comments.filter(c => !c.parentCommentId);
    const replies = comments.filter(c => c.parentCommentId);
    
    return topLevel.map(comment => ({
      ...comment,
      replies: replies.filter(r => r.parentCommentId === comment.id),
    }));
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">请先登录</h2>
          <p className="text-muted-foreground">您需要登录才能查看朋友圈</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card p-4">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <h1 className="text-2xl font-semibold" data-testid="text-moments-title">朋友圈</h1>
          <Button 
            onClick={() => setShowComposer(!showComposer)}
            size="sm"
            data-testid="button-toggle-composer"
          >
            {showComposer ? <X className="h-4 w-4 mr-2" /> : <ImageIcon className="h-4 w-4 mr-2" />}
            {showComposer ? '取消' : '发布'}
          </Button>
        </div>
      </div>

      {/* Composer */}
      {showComposer && (
        <Card className="max-w-2xl mx-auto mt-4 w-full" data-testid="card-composer">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={currentUser.profileImageUrl || undefined} />
                <AvatarFallback>{currentUser.username?.[0] || currentUser.firstName?.[0] || 'U'}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="分享新鲜事..."
                  className="min-h-[100px] resize-none"
                  data-testid="input-moment-content"
                />
                <div className="flex justify-end mt-3">
                  <Button
                    onClick={handlePublish}
                    disabled={!content.trim() || createMomentMutation.isPending}
                    className="bg-primary hover:bg-primary/90"
                    data-testid="button-publish-moment"
                  >
                    发布
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Moments List */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4 space-y-4">
          {isLoading ? (
            <div className="text-center py-12">加载中...</div>
          ) : momentsWithDetails.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-moments">
              还没有动态，发布第一条吧！
            </div>
          ) : (
            momentsWithDetails.map((moment) => {
              const author = getAuthor(moment.authorId, moment.authorType);
              const isLiked = moment.likes.some(like => like.likerId === currentUser.id);
              const commentsTree = getCommentsTree(moment.comments);

              return (
                <Card key={moment.id} data-testid={`card-moment-${moment.id}`}>
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={author.avatarUrl || undefined} />
                        <AvatarFallback>{author.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold" data-testid={`text-author-${moment.id}`}>{author.name}</span>
                          {moment.authorType === 'ai' && (
                            <span className="text-xs text-muted-foreground">AI</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(moment.createdAt), { addSuffix: true, locale: zhCN })}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Content */}
                    <div className="mb-3 whitespace-pre-wrap" data-testid={`text-content-${moment.id}`}>{moment.content}</div>

                    {/* Actions */}
                    <div className="flex items-center gap-6 py-2 border-t">
                      <button
                        onClick={() => handleLike(moment.id)}
                        className={`flex items-center gap-2 ${
                          isLiked ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'
                        }`}
                        data-testid={`button-like-${moment.id}`}
                      >
                        <Heart className={`h-5 w-5 ${isLiked ? 'fill-current' : ''}`} />
                        <span className="text-sm">
                          {moment.likes.length > 0 ? moment.likes.length : '点赞'}
                        </span>
                      </button>
                      <button
                        onClick={() => setShowComments(prev => ({ ...prev, [moment.id]: !prev[moment.id] }))}
                        className="flex items-center gap-2 text-muted-foreground hover:text-primary"
                        data-testid={`button-comment-${moment.id}`}
                      >
                        <MessageCircle className="h-5 w-5" />
                        <span className="text-sm">
                          {moment.comments.length > 0 ? moment.comments.length : '评论'}
                        </span>
                      </button>
                    </div>

                    {/* Comments Section */}
                    {showComments[moment.id] && (
                      <div className="mt-3 space-y-3 border-t pt-3">
                        {/* Comments List */}
                        {commentsTree.map((comment) => {
                          const commentAuthor = getAuthor(comment.authorId, comment.authorType);
                          const replyKey = `${moment.id}_${comment.id}`;

                          return (
                            <div key={comment.id} className="space-y-2">
                              <div className="flex gap-2">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={commentAuthor.avatarUrl || undefined} />
                                  <AvatarFallback>{commentAuthor.name[0]}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                  <div className="bg-muted rounded-lg p-2">
                                    <div className="text-sm font-medium mb-1">{commentAuthor.name}</div>
                                    <div className="text-sm" data-testid={`text-comment-${comment.id}`}>{comment.content}</div>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                    <span>{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: zhCN })}</span>
                                    <button
                                      onClick={() => setReplyingTo(replyingTo === replyKey ? null : replyKey)}
                                      className="hover:text-primary"
                                      data-testid={`button-reply-${comment.id}`}
                                    >
                                      回复
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Replies */}
                              {comment.replies && comment.replies.length > 0 && (
                                <div className="ml-10 space-y-2">
                                  {comment.replies.map((reply) => {
                                    const replyAuthor = getAuthor(reply.authorId, reply.authorType);
                                    return (
                                      <div key={reply.id} className="flex gap-2">
                                        <Avatar className="h-6 w-6">
                                          <AvatarImage src={replyAuthor.avatarUrl || undefined} />
                                          <AvatarFallback>{replyAuthor.name[0]}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                          <div className="bg-muted/50 rounded-lg p-2">
                                            <div className="text-xs font-medium mb-1">{replyAuthor.name}</div>
                                            <div className="text-xs" data-testid={`text-reply-${reply.id}`}>{reply.content}</div>
                                          </div>
                                          <div className="text-xs text-muted-foreground mt-1">
                                            {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true, locale: zhCN })}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Reply Input */}
                              {replyingTo === replyKey && (
                                <div className="ml-10 flex gap-2">
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={currentUser.profileImageUrl || undefined} />
                                    <AvatarFallback>{currentUser.username?.[0] || 'U'}</AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1 flex gap-2">
                                    <input
                                      type="text"
                                      value={replyInputs[replyKey] || ''}
                                      onChange={(e) => setReplyInputs(prev => ({ ...prev, [replyKey]: e.target.value }))}
                                      onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                          handleReply(moment.id, comment.id);
                                        }
                                      }}
                                      placeholder={`回复 ${commentAuthor.name}...`}
                                      className="flex-1 px-3 py-1 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                                      data-testid={`input-reply-${comment.id}`}
                                      autoFocus
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() => handleReply(moment.id, comment.id)}
                                      disabled={!replyInputs[replyKey]?.trim()}
                                      className="h-7"
                                      data-testid={`button-send-reply-${comment.id}`}
                                    >
                                      <Send className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Comment Input */}
                        <div className="flex gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={currentUser.profileImageUrl || undefined} />
                            <AvatarFallback>{currentUser.username?.[0] || 'U'}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 flex gap-2">
                            <input
                              type="text"
                              value={commentInputs[moment.id] || ''}
                              onChange={(e) => setCommentInputs(prev => ({ ...prev, [moment.id]: e.target.value }))}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  handleComment(moment.id);
                                }
                              }}
                              placeholder="说点什么..."
                              className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              data-testid={`input-comment-${moment.id}`}
                            />
                            <Button
                              size="sm"
                              onClick={() => handleComment(moment.id)}
                              disabled={!commentInputs[moment.id]?.trim()}
                              data-testid={`button-send-comment-${moment.id}`}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
