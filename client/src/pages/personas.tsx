import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAiPersonaSchema } from "@shared/schema";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Edit, Trash2, MessageCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

type Persona = {
  id: string;
  name: string;
  avatarUrl: string | null;
  personality: string;
  systemPrompt: string;
  backstory: string | null;
  greeting: string | null;
};

const personaFormSchema = insertAiPersonaSchema.extend({
  name: z.string().min(1, "Name is required").max(100),
  personality: z.string().min(10, "Personality should be at least 10 characters"),
  systemPrompt: z.string().min(20, "System prompt should be at least 20 characters"),
});

type PersonaFormData = z.infer<typeof personaFormSchema>;

export default function Personas() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);

  const { data: personas = [], isLoading } = useQuery<Persona[]>({
    queryKey: ["/api/personas"],
  });

  const form = useForm<PersonaFormData>({
    resolver: zodResolver(personaFormSchema),
    defaultValues: {
      name: "",
      avatarUrl: "",
      personality: "",
      systemPrompt: "",
      backstory: "",
      greeting: "",
      userId: "",
    },
  });

  const createPersonaMutation = useMutation({
    mutationFn: (data: PersonaFormData) => 
      apiRequest("/api/personas", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/personas"] });
      setDialogOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "AI persona created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create persona",
        variant: "destructive",
      });
    },
  });

  const updatePersonaMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PersonaFormData> }) =>
      apiRequest(`/api/personas/${id}`, "PATCH", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/personas"] });
      setDialogOpen(false);
      setEditingPersona(null);
      form.reset();
      toast({
        title: "Success",
        description: "AI persona updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update persona",
        variant: "destructive",
      });
    },
  });

  const deletePersonaMutation = useMutation({
    mutationFn: (id: string) => 
      apiRequest(`/api/personas/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/personas"] });
      toast({
        title: "Success",
        description: "AI persona deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete persona",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: PersonaFormData) => {
    if (editingPersona) {
      updatePersonaMutation.mutate({ id: editingPersona.id, data });
    } else {
      createPersonaMutation.mutate(data);
    }
  };

  const openEditDialog = (persona: Persona) => {
    setEditingPersona(persona);
    form.reset({
      name: persona.name,
      avatarUrl: persona.avatarUrl ?? "",
      personality: persona.personality,
      systemPrompt: persona.systemPrompt,
      backstory: persona.backstory ?? "",
      greeting: persona.greeting ?? "",
      userId: "",
    });
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingPersona(null);
    form.reset();
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" data-testid="spinner-loading"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="container mx-auto max-w-7xl p-6">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">AI Personas</h1>
            <p className="text-muted-foreground" data-testid="text-page-description">
              Create and manage your AI companions
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                size="lg" 
                className="h-12 rounded-xl" 
                onClick={openCreateDialog}
                data-testid="button-create-persona"
              >
                <Plus className="mr-2 h-5 w-5" />
                Create Persona
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle data-testid="text-dialog-title">
                  {editingPersona ? "Edit Persona" : "Create New Persona"}
                </DialogTitle>
                <DialogDescription>
                  {editingPersona 
                    ? "Update your AI companion's details" 
                    : "Design your AI companion with unique personality and traits"}
                </DialogDescription>
              </DialogHeader>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter persona name" 
                            {...field} 
                            data-testid="input-persona-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="avatarUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Avatar URL (optional)</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="https://example.com/avatar.jpg" 
                            {...field} 
                            data-testid="input-persona-avatar"
                          />
                        </FormControl>
                        <FormDescription>
                          Provide a URL to an image for the persona's avatar
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="personality"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Personality</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Friendly and supportive, loves to encourage others..."
                            className="min-h-[80px]"
                            {...field} 
                            data-testid="input-persona-personality"
                          />
                        </FormControl>
                        <FormDescription>
                          Short description of the persona's personality traits
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="systemPrompt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>System Prompt</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="You are a helpful AI companion who..."
                            className="min-h-[120px]"
                            {...field} 
                            data-testid="input-persona-system-prompt"
                          />
                        </FormControl>
                        <FormDescription>
                          Detailed instructions that define how the AI should behave
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="backstory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Backstory (optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="I grew up in a small town and love..."
                            className="min-h-[100px]"
                            {...field} 
                            data-testid="input-persona-backstory"
                          />
                        </FormControl>
                        <FormDescription>
                          Background story that adds depth to the persona
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="greeting"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Greeting Message (optional)</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Hi! I'm excited to chat with you!" 
                            {...field} 
                            data-testid="input-persona-greeting"
                          />
                        </FormControl>
                        <FormDescription>
                          Initial message shown when starting a new conversation
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end gap-3">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => {
                        setDialogOpen(false);
                        setEditingPersona(null);
                        form.reset();
                      }}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createPersonaMutation.isPending || updatePersonaMutation.isPending}
                      data-testid="button-submit-persona"
                    >
                      {createPersonaMutation.isPending || updatePersonaMutation.isPending ? (
                        <>
                          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                          Saving...
                        </>
                      ) : editingPersona ? "Update" : "Create"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Personas Grid */}
        {personas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-10 w-10 text-primary" />
            </div>
            <h3 className="mb-2 text-xl font-semibold" data-testid="text-empty-title">No personas yet</h3>
            <p className="mb-6 text-center text-muted-foreground" data-testid="text-empty-description">
              Create your first AI companion to start chatting
            </p>
            <Button onClick={openCreateDialog} data-testid="button-create-first-persona">
              <Plus className="mr-2 h-5 w-5" />
              Create Your First Persona
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {personas.map((persona) => (
              <Card key={persona.id} className="hover-elevate overflow-hidden" data-testid={`card-persona-${persona.id}`}>
                <CardHeader className="space-y-4 pb-4">
                  <div className="flex items-center justify-between">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={persona.avatarUrl || undefined} alt={persona.name} />
                      <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                        {persona.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEditDialog(persona)}
                        data-testid={`button-edit-${persona.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this persona?")) {
                            deletePersonaMutation.mutate(persona.id);
                          }
                        }}
                        data-testid={`button-delete-${persona.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <CardTitle className="mb-1" data-testid={`text-persona-name-${persona.id}`}>
                      {persona.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2" data-testid={`text-persona-personality-${persona.id}`}>
                      {persona.personality}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardFooter className="flex gap-2 pt-0">
                  <Button
                    className="flex-1"
                    variant="default"
                    onClick={() => setLocation(`/chat?personaId=${persona.id}`)}
                    data-testid={`button-chat-${persona.id}`}
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Chat
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
