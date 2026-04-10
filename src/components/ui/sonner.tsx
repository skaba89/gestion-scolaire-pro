import * as React from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { Toaster as Sonner, toast } from "sonner";
import { CheckCircle, XCircle, AlertTriangle, Info } from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      expand
      richColors
      closeButton
      duration={4000}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-xl group-[.toaster]:rounded-xl group-[.toaster]:backdrop-blur-sm",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-lg",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-lg",
          success: "group-[.toaster]:border-green-500/30 group-[.toaster]:bg-green-500/10",
          error: "group-[.toaster]:border-red-500/30 group-[.toaster]:bg-red-500/10",
          warning: "group-[.toaster]:border-yellow-500/30 group-[.toaster]:bg-yellow-500/10",
          info: "group-[.toaster]:border-blue-500/30 group-[.toaster]:bg-blue-500/10",
        },
      }}
      icons={{
        success: <CheckCircle className="h-5 w-5 text-green-500" />,
        error: <XCircle className="h-5 w-5 text-red-500" />,
        warning: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
        info: <Info className="h-5 w-5 text-blue-500" />,
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
