import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle, Sparkles, Users } from "lucide-react";

export default function Home() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [_, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation("/chat");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" data-testid="spinner-loading"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero Section */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="mb-6 text-5xl font-bold leading-tight" data-testid="text-hero-title">
            Your AI Companions
            <br />
            <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              Always Here for You
            </span>
          </h1>
          
          <p className="mb-12 text-xl text-muted-foreground" data-testid="text-hero-description">
            Create unique AI personalities. Chat one-on-one or in groups.
            Build meaningful connections that sync across all your devices.
          </p>

          <div className="mb-16 flex flex-col justify-center gap-4 sm:flex-row">
            <Button 
              size="lg" 
              className="h-14 rounded-xl px-8 text-base"
              onClick={() => window.location.href = "/api/login"}
              data-testid="button-get-started"
            >
              <Sparkles className="mr-2 h-5 w-5" />
              Get Started
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="h-14 rounded-xl px-8 text-base"
              onClick={() => window.location.href = "/api/login"}
              data-testid="button-sign-in"
            >
              Sign In
            </Button>
          </div>

          {/* Feature Cards */}
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border bg-card p-6" data-testid="card-feature-personas">
              <div className="mb-4 flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
              </div>
              <h3 className="mb-2 text-lg font-semibold">Custom AI Personas</h3>
              <p className="text-sm text-muted-foreground">
                Design AI companions with unique personalities, backstories, and conversation styles
              </p>
            </div>

            <div className="rounded-2xl border bg-card p-6" data-testid="card-feature-chat">
              <div className="mb-4 flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <MessageCircle className="h-6 w-6 text-primary" />
                </div>
              </div>
              <h3 className="mb-2 text-lg font-semibold">Smart Conversations</h3>
              <p className="text-sm text-muted-foreground">
                Engage in meaningful chats powered by advanced AI with memory and context
              </p>
            </div>

            <div className="rounded-2xl border bg-card p-6" data-testid="card-feature-sync">
              <div className="mb-4 flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Users className="h-6 w-6 text-primary" />
                </div>
              </div>
              <h3 className="mb-2 text-lg font-semibold">Multi-Device Sync</h3>
              <p className="text-sm text-muted-foreground">
                All your conversations and personas synced in real-time across devices
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Built with Replit AI</p>
        </div>
      </footer>
    </div>
  );
}
