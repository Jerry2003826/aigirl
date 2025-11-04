import { createContext, useContext, useEffect, useState } from "react";

type ImmersiveModeContextType = {
  isImmersive: boolean;
  toggleImmersive: () => void;
};

const ImmersiveModeContext = createContext<ImmersiveModeContextType | undefined>(undefined);

export function ImmersiveModeProvider({ children }: { children: React.ReactNode }) {
  const [isImmersive, setIsImmersive] = useState<boolean>(() => {
    const stored = localStorage.getItem("immersive-mode");
    return stored === "true";
  });

  useEffect(() => {
    localStorage.setItem("immersive-mode", String(isImmersive));
  }, [isImmersive]);

  const toggleImmersive = () => {
    setIsImmersive(prev => !prev);
  };

  return (
    <ImmersiveModeContext.Provider value={{ isImmersive, toggleImmersive }}>
      {children}
    </ImmersiveModeContext.Provider>
  );
}

export function useImmersiveMode() {
  const context = useContext(ImmersiveModeContext);
  if (!context) {
    throw new Error("useImmersiveMode must be used within ImmersiveModeProvider");
  }
  return context;
}
