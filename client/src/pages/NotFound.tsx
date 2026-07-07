import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";

export default function NotFound() {
  const [, setLocation] = useLocation();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className={`min-h-screen w-full flex items-center justify-center page-px py-8 ${isDark ? "bg-dark-gradient" : "bg-light-gradient"}`}>
      <Card
        className={`w-full max-w-lg shadow-lg backdrop-blur-sm ${
          isDark
            ? "border border-[#C9A96E]/10 bg-dark-modal"
            : "border border-[#9B5A6E]/10 bg-light-modal"
        }`}
      >
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className={`absolute inset-0 rounded-full animate-pulse ${isDark ? "bg-red-500/10" : "bg-red-100"}`} />
              <AlertCircle className="relative h-14 w-14 sm:h-16 sm:w-16 text-red-500" />
            </div>
          </div>

          <h1 className={`text-3xl sm:text-4xl font-bold mb-2 ${isDark ? "text-white" : "text-[#6B1A3A]"}`}>404</h1>

          <h2 className={`text-lg sm:text-xl font-semibold mb-4 ${isDark ? "text-white/80" : "text-[#2C2824]/80"}`}>
            Page Not Found
          </h2>

          <p className={`mb-8 leading-relaxed text-sm sm:text-base ${isDark ? "text-white/45" : "text-[#7A726C]"}`}>
            Sorry, the page you are looking for doesn't exist.
            <br />
            It may have been moved or deleted.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={handleGoHome}
              className="text-white px-6 py-2.5 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg w-full sm:w-auto"
              style={{ background: "linear-gradient(135deg, #6B1A3A, #7B2D8B)" }}
            >
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
