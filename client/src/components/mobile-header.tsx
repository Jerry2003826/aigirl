import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type MobileHeaderProps = {
  title: string;
  onBack: () => void;
  showMobileSidebar?: boolean;
  className?: string;
  rightContent?: React.ReactNode;
};

export function MobileHeader({ 
  title, 
  onBack, 
  showMobileSidebar = false, 
  className,
  rightContent 
}: MobileHeaderProps) {
  // Only show on mobile when sidebar is hidden
  return (
    <div 
      className={cn(
        "md:hidden border-b bg-background px-4 py-3 flex items-center gap-3",
        showMobileSidebar && "hidden",
        className
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onBack}
        data-testid="button-back"
        className="h-9 w-9 flex-shrink-0"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <h1 className="text-lg font-semibold flex-1 truncate" data-testid="text-page-title">
        {title}
      </h1>
      {rightContent && (
        <div className="flex-shrink-0">
          {rightContent}
        </div>
      )}
    </div>
  );
}
