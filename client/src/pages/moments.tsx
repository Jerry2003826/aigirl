import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Heart, MessageCircle, Send, Plus, Trash2, ImagePlus, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { MobileHeader } from "@/components/mobile-header";
import type { Moment, MomentLike, MomentComment, AiPersona, User } from "@shared/schema";

interface MomentWithDetails extends Moment {
  likes: MomentLike[];
  comments: MomentComment[];
}

type MomentsPageProps = {
  onBackToList?: () => void;
  showMobileSidebar?: boolean;
};

export default function MomentsPage({ onBackToList = () => {}, showMobileSidebar = false }: MomentsPageProps) {
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
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
      {/* Mobile Header */}
      <MobileHeader 
        title="动态" 
        onBack={onBackToList} 
        showMobileSidebar={showMobileSidebar}
      />
      
      {/* Publish Button */}
      <div className="p-4 md:p-6">
        <div className="max-w-3xl mx-auto">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium py-3 md:py-3.5 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                data-testid="button-create-moment"
              >
                <Plus className="h-5 w-5 mr-2" />
                <span className="text-base md:text-lg">发布动态</span>
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-5">
              <DialogHeader>
                <DialogTitle className="text-white text-xl font-semibold">分享新鲜事</DialogTitle>
              </DialogHeader>
            </div>
            
            {/* Content Area */}
            <div className="p-6 space-y-5">
              {/* User Info */}
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12 ring-2 ring-purple-100">
                  <AvatarImage src={currentUser.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white font-semibold text-lg">
                    {currentUser.username?.[0] || '我'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-semibold text-base">{currentUser.username || '我'}</div>
                  <div className="text-sm text-muted-foreground">公开</div>
                </div>
              </div>
              
              {/* Text Input */}
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="分享你的想法、心情或精彩瞬间..."
                className="min-h-[160px] resize-none border-0 focus-visible:ring-0 text-base px-0 placeholder:text-muted-foreground/60"
                data-testid="input-moment-content"
              />
              
              {/* Character Count */}
              <div className="flex justify-end">
                <span className={`text-sm ${content.length > 500 ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {content.length} / 500
                </span>
              </div>
              
              {/* Image Preview */}
              {imagePreview && (
                <div className="relative rounded-2xl overflow-hidden bg-muted/30 p-4">
                  <img 
                    src={imagePreview} 
                    alt="Preview" 
                    className="w-full max-h-80 object-contain rounded-xl"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    className="absolute top-6 right-6 h-8 w-8 rounded-full shadow-lg hover:scale-110 transition-transform"
                    onClick={clearImage}
                    data-testid="button-clear-image"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            
            {/* Footer Actions */}
            <div className="border-t bg-muted/20 px-6 py-4 flex items-center justify-between">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageSelect}
                  data-testid="input-image"
                />
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <ImagePlus className="h-5 w-5 text-purple-600" />
                  <span className="text-sm font-medium text-purple-600">添加图片</span>
                </div>
              </label>
              
              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setDialogOpen(false)}
                  className="px-6"
                  data-testid="button-cancel-moment"
                >
                  取消
                </Button>
                <Button
                  onClick={handlePublish}
                  disabled={!content.trim() || content.length > 500 || createMomentMutation.isPending}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-8 shadow-md hover:shadow-lg transition-all duration-300"
                  data-testid="button-publish-moment"
                >
                  {createMomentMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      发布中...
                    </span>
                  ) : "发布"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Moments List */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4 md:pb-6">
        <div className="max-w-3xl mx-auto space-y-3 md:space-y-4">
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
              // 用户可以删除自己发的动态和自己AI发的动态
              const canDelete = moment.userId === currentUser.id;

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
