import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Heart, MessageCircle, Send, Plus, Trash2, Sparkles, ImagePlus, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import type { Moment, MomentLike, MomentComment, AiPersona, User } from "@shared/schema";

interface MomentWithDetails extends Moment {
  likes: MomentLike[];
  comments: MomentComment[];
}

export default function MomentsPage() {
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [aiMomentDialogOpen, setAiMomentDialogOpen] = useState(false);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [imageData, setImageData] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Fetch current user
  const { data: currentUser } = useQuery<User>({
    queryKey: ['/api/auth/user'],
  });

  // Fetch AI personas
  const { data: personas = [] } = useQuery<AiPersona[]>({
    queryKey: ['/api/personas'],
  });

  // Fetch moments with their likes and comments
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
      setDialogOpen(false);
      toast({ title: "✅ 动态已发布" });
    },
    onError: () => {
      toast({ title: "❌ 发布失败", variant: "destructive" });
    },
  });

  // Delete moment mutation
  const deleteMomentMutation = useMutation({
    mutationFn: async (momentId: string) => {
      return apiRequest('DELETE', `/api/moments/${momentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/moments'] });
      toast({ title: "✅ 动态已删除" });
    },
    onError: () => {
      toast({ title: "❌ 删除失败", variant: "destructive" });
    },
  });

  // Toggle like mutation
  const toggleLikeMutation = useMutation({
    mutationFn: async (momentId: string) => {
      return apiRequest('POST', `/api/moments/${momentId}/like`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/moments'] });
    },
  });

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: async ({ momentId, content }: { momentId: string; content: string }) => {
      return apiRequest('POST', `/api/moments/${momentId}/comments`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/moments'] });
    },
  });

  // Trigger AI to post moment mutation
  const triggerAIMomentMutation = useMutation({
    mutationFn: async (personaId: string) => {
      const res = await apiRequest('POST', `/api/ai/trigger-moment/${personaId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/moments'] });
      toast({ title: "✅ AI动态已发布" });
      setAiMomentDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "❌ 发布失败", 
        description: error.message || "AI发布动态失败",
        variant: "destructive" 
      });
    },
  });

  const handlePublish = () => {
    if (!content.trim()) return;
    const images = imageData ? [imageData] : [];
    createMomentMutation.mutate({ content, images });
    // Clear image after publish
    setImageData(null);
    setImagePreview(null);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "文件类型无效",
        description: "请选择图片文件",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "文件过大",
        description: "图片必须小于5MB",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setImageData(base64);
      setImagePreview(base64);
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImageData(null);
    setImagePreview(null);
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

  const handleDelete = (momentId: string) => {
    if (confirm("确定要删除这条动态吗？")) {
      deleteMomentMutation.mutate(momentId);
    }
  };

  const getAuthor = (authorId: string, authorType: string) => {
    if (authorType === 'user') {
      if (authorId === currentUser?.id) {
        return {
          name: currentUser?.username || currentUser?.firstName || '我',
          avatarUrl: currentUser?.profileImageUrl,
          isCurrentUser: true,
        };
      } else {
        return {
          name: '用户',
          avatarUrl: undefined,
          isCurrentUser: false,
        };
      }
    } else {
      const persona = personas.find(p => p.id === authorId);
      return {
        name: persona?.name || 'AI',
        avatarUrl: persona?.avatarUrl,
        isCurrentUser: false,
      };
    }
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">请先登录</h2>
          <p className="text-muted-foreground">您需要登录才能查看朋友圈</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Publish Buttons */}
      <div className="p-4 space-y-2">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-6 rounded-xl shadow-lg"
              data-testid="button-create-moment"
            >
              <Plus className="h-5 w-5 mr-2" />
              发布动态
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>发布新动态</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="分享新鲜事..."
                className="min-h-[120px] resize-none"
                data-testid="input-moment-content"
              />
              
              {/* Image Preview */}
              {imagePreview && (
                <div className="relative inline-block">
                  <img 
                    src={imagePreview} 
                    alt="Preview" 
                    className="max-h-48 rounded-lg border"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    className="absolute -right-2 -top-2 h-6 w-6 rounded-full"
                    onClick={clearImage}
                    data-testid="button-clear-image"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
              
              <div className="flex justify-between items-center">
                <label>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageSelect}
                    data-testid="input-image"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <span>
                      <ImagePlus className="mr-2 h-4 w-4" />
                      添加图片
                    </span>
                  </Button>
                </label>
                
                <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  data-testid="button-cancel-moment"
                >
                  取消
                </Button>
                <Button
                  onClick={handlePublish}
                  disabled={!content.trim() || createMomentMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-700"
                  data-testid="button-publish-moment"
                >
                  {createMomentMutation.isPending ? "发布中..." : "发布"}
                </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* AI Moment Trigger Button */}
        {personas.length > 0 && (
          <Dialog open={aiMomentDialogOpen} onOpenChange={setAiMomentDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="outline"
                className="w-full border-2 border-purple-500 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950 font-medium py-6 rounded-xl"
                data-testid="button-trigger-ai-moment"
              >
                <Sparkles className="h-5 w-5 mr-2" />
                让AI发布动态
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>选择AI发布动态</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                {personas.map((persona) => (
                  <div
                    key={persona.id}
                    className="flex items-center gap-3 p-3 rounded-lg border hover-elevate"
                    data-testid={`ai-persona-item-${persona.id}`}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={persona.avatarUrl || undefined} alt={persona.name} />
                      <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                        {persona.name.substring(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 overflow-hidden">
                      <div className="font-medium" data-testid={`ai-persona-name-${persona.id}`}>
                        {persona.name}
                      </div>
                      <div className="truncate text-sm text-muted-foreground">
                        {persona.personality}
                      </div>
                    </div>
                    
                    <Button
                      size="sm"
                      onClick={() => triggerAIMomentMutation.mutate(persona.id)}
                      disabled={triggerAIMomentMutation.isPending}
                      className="bg-purple-600 hover:bg-purple-700"
                      data-testid={`button-trigger-moment-${persona.id}`}
                    >
                      <Sparkles className="h-4 w-4 mr-1" />
                      发布
                    </Button>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Moments List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">加载中...</div>
          ) : momentsWithDetails.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-moments">
              还没有动态，发布第一条吧！
            </div>
          ) : (
            momentsWithDetails.map((moment) => {
              const author = getAuthor(moment.authorId, moment.authorType);
              const isLiked = moment.likes.some(like => like.likerId === currentUser.id);
              const canDelete = author.isCurrentUser;

              return (
                <Card key={moment.id} className="bg-card border-border" data-testid={`card-moment-${moment.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-11 w-11">
                        <AvatarImage src={author.avatarUrl || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                          {author.name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground" data-testid={`text-author-${moment.id}`}>
                            {author.name}
                          </span>
                          {moment.authorType === 'ai' && (
                            <Badge variant="secondary" className="text-xs px-1.5 py-0">AI</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(moment.createdAt), { addSuffix: true, locale: zhCN })}
                        </div>
                      </div>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(moment.id)}
                          data-testid={`button-delete-moment-${moment.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    {/* Content */}
                    <div className="text-foreground whitespace-pre-wrap leading-relaxed" data-testid={`text-content-${moment.id}`}>
                      {moment.content}
                    </div>
                    
                    {/* Images */}
                    {moment.images && moment.images.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 max-w-md">
                        {moment.images.map((imageUrl, idx) => (
                          <img
                            key={idx}
                            src={imageUrl}
                            alt={`Moment image ${idx + 1}`}
                            className="w-full aspect-square object-cover rounded-lg border cursor-pointer hover-elevate"
                            onClick={() => window.open(imageUrl, '_blank')}
                            data-testid={`image-moment-${moment.id}-${idx}`}
                          />
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-6 pt-2">
                      <button
                        onClick={() => handleLike(moment.id)}
                        className={`flex items-center gap-1.5 transition-colors ${
                          isLiked ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'
                        }`}
                        data-testid={`button-like-${moment.id}`}
                      >
                        <Heart className={`h-5 w-5 ${isLiked ? 'fill-current' : ''}`} />
                        <span className="text-sm">
                          {moment.likes.length > 0 ? `点赞 ${moment.likes.length}` : '点赞'}
                        </span>
                      </button>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MessageCircle className="h-5 w-5" />
                        <span className="text-sm">
                          {moment.comments.length > 0 ? `评论 ${moment.comments.length}` : '评论'}
                        </span>
                      </div>
                    </div>

                    {/* Comments List */}
                    {moment.comments.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-border">
                        {moment.comments.map((comment) => {
                          const commentAuthor = getAuthor(comment.authorId, comment.authorType);
                          return (
                            <div key={comment.id} className="flex gap-2 text-sm">
                              <Avatar className="h-6 w-6 flex-shrink-0">
                                <AvatarImage src={commentAuthor.avatarUrl || undefined} />
                                <AvatarFallback className="text-xs bg-primary/10">
                                  {commentAuthor.name[0]}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="bg-muted/50 rounded-lg px-3 py-1.5">
                                  <span className="font-medium text-foreground">{commentAuthor.name}: </span>
                                  <span className="text-foreground/90" data-testid={`text-comment-${comment.id}`}>
                                    {comment.content}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Comment Input */}
                    <div className="flex gap-2 pt-2">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarImage src={currentUser.profileImageUrl || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {currentUser.username?.[0] || currentUser.firstName?.[0] || '我'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 flex gap-2">
                        <input
                          type="text"
                          value={commentInputs[moment.id] || ''}
                          onChange={(e) => setCommentInputs(prev => ({ ...prev, [moment.id]: e.target.value }))}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && commentInputs[moment.id]?.trim()) {
                              handleComment(moment.id);
                            }
                          }}
                          placeholder="说点什么..."
                          className="flex-1 px-3 py-2 bg-muted/30 border-0 rounded-full text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                          data-testid={`input-comment-${moment.id}`}
                        />
                        <Button
                          size="icon"
                          onClick={() => handleComment(moment.id)}
                          disabled={!commentInputs[moment.id]?.trim() || createCommentMutation.isPending}
                          className="h-9 w-9 rounded-full bg-purple-600 hover:bg-purple-700 flex-shrink-0"
                          data-testid={`button-send-comment-${moment.id}`}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
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
