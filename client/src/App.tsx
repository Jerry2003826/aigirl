import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ImmersiveModeProvider } from "@/components/immersive-mode-provider";
import { useAuth } from "@/hooks/useAuth";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNavBar } from "@/components/bottom-nav-bar";
import Login from "@/pages/login";
import Personas from "@/pages/personas";
import Chat from "@/pages/chat";
import Moments from "@/pages/moments";
import Settings from "@/pages/settings";
import Contacts from "@/pages/contacts";
import ContactDetail from "@/pages/contact-detail";
import Groups from "@/pages/groups";
import NotFound from "@/pages/not-found";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(true);

  // Read conversationId from URL and auto-select (only for chat routes)
  useEffect(() => {
    // Only read conversationId from URL when on chat-related routes
    if (location === "/" || location === "/chat" || location.startsWith("/chat?")) {
      const params = new URLSearchParams(window.location.search);
      const conversationId = params.get("conversationId");
      if (conversationId) {
        setSelectedConversationId(conversationId);
        // On mobile, when loading with a conversationId from URL,
        // hide sidebar to show the chat directly
        if (window.innerWidth < 768) {
          setShowMobileSidebar(false);
        }
      } else {
        // Clear selectedConversationId if no conversationId in URL on chat routes
        setSelectedConversationId(null);
      }
    } else {
      // Clear selectedConversationId when navigating away from chat routes
      setSelectedConversationId(null);
    }
  }, [location]);

  // Handle mobile sidebar visibility on route changes
  useEffect(() => {
    // On mobile (<768px), hide sidebar when navigating to content pages
    // This ensures pages like /moments, /contacts, /groups show full-screen
    if (window.innerWidth < 768) {
      // Hide sidebar for all routes except root (which shows chat list by default)
      if (location !== "/" && location !== "/chat") {
        setShowMobileSidebar(false);
      }
    }
  }, [location]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" data-testid="spinner-loading"></div>
      </div>
    );
  }

  // Public routes (no auth required)
  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Login} />
        <Route component={Login} />
      </Switch>
    );
  }

  // Protected routes with sidebar
  const sidebarStyle = {
    "--sidebar-width": "20rem",
    "--sidebar-width-icon": "4rem",
  };

  const handleNewChat = () => {
    setLocation("/personas");
  };

  const handleConversationSelect = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    // On mobile, hide sidebar when user actively selects a conversation
    // Check if window width is mobile size (< 768px which is md breakpoint)
    if (window.innerWidth < 768) {
      setShowMobileSidebar(false);
    }
  };

  const handleBackToList = () => {
    setSelectedConversationId(null);
    // Always show sidebar when going back (both mobile and desktop)
    setShowMobileSidebar(true);
    // Navigate back to chat route to update URL and sidebar highlight
    setLocation("/chat");
  };

  const handleChatNavClick = () => {
    // 点击聊天导航时，清除选中的对话，显示列表
    setSelectedConversationId(null);
    setShowMobileSidebar(true);
    setLocation("/chat");
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full bg-background flex-col">
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar: Always visible on md+, conditionally visible on mobile */}
          <div className={cn(
            "md:flex pb-14 w-full md:w-auto",
            showMobileSidebar ? "flex" : "hidden"
          )}>
            <AppSidebar
              selectedConversationId={selectedConversationId}
              onConversationSelect={handleConversationSelect}
              onNewChat={handleNewChat}
              showMobileSidebar={showMobileSidebar}
            />
          </div>
          
          {/* Main content: Always visible on md+, conditionally visible on mobile */}
          <main className={cn(
            "flex-1 overflow-hidden md:flex flex-col",
            showMobileSidebar ? "hidden" : "flex"
          )}>
            <div className={cn(
              "flex-1 overflow-hidden",
              // Remove bottom padding on mobile when in chat conversation (nav bar hidden)
              !!selectedConversationId && !showMobileSidebar ? "pb-0" : "pb-14"
            )}>
              <Switch>
                <Route path="/">
                  {() => (
                    <Chat
                      selectedConversationId={selectedConversationId}
                      onConversationDeleted={handleBackToList}
                      onBackToList={handleBackToList}
                      showMobileSidebar={showMobileSidebar}
                    />
                  )}
                </Route>
                <Route path="/chat">
                  {() => (
                    <Chat
                      selectedConversationId={selectedConversationId}
                      onConversationDeleted={handleBackToList}
                      onBackToList={handleBackToList}
                      showMobileSidebar={showMobileSidebar}
                    />
                  )}
                </Route>
                <Route path="/moments">
                  {() => <Moments onBackToList={handleBackToList} showMobileSidebar={showMobileSidebar} />}
                </Route>
                <Route path="/personas">
                  {() => <Personas onBackToList={handleBackToList} showMobileSidebar={showMobileSidebar} />}
                </Route>
                <Route path="/contacts">
                  {() => <Contacts onBackToList={handleBackToList} showMobileSidebar={showMobileSidebar} />}
                </Route>
                <Route path="/contacts/:id">
                  {(params) => <ContactDetail personaId={params.id} onBackToList={handleBackToList} showMobileSidebar={showMobileSidebar} />}
                </Route>
                <Route path="/groups">
                  {() => <Groups onBackToList={handleBackToList} showMobileSidebar={showMobileSidebar} />}
                </Route>
                <Route path="/settings">
                  {() => <Settings onBackToList={handleBackToList} showMobileSidebar={showMobileSidebar} />}
                </Route>
                <Route component={NotFound} />
              </Switch>
            </div>
          </main>
        </div>
        
        {/* Bottom Navigation Bar - Hide when in chat conversation on mobile */}
        <BottomNavBar 
          onChatClick={handleChatNavClick}
          hide={!!selectedConversationId && !showMobileSidebar}
        />
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ImmersiveModeProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ImmersiveModeProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
