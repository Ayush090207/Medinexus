import { Button } from "@/components/ui/button";
import { IconHeartbeat, IconMenu2, IconX } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

const navItems = [
  { label: "Hero", href: "#hero" },
  { label: "Problem", href: "#problem" },
  { label: "Solution", href: "#solution" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "CTA", href: "#cta" },
];

const Header = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full glass border-b">
      <div className="container mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
        <div 
          className="flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-80" 
          onClick={() => navigate("/")}
        >
          <div className="relative">
            <IconHeartbeat className="h-7 w-7 text-primary" />
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary/30 rounded-full animate-pulse" />
          </div>
          <span className="font-serif text-xl font-light tracking-wide">mediNexus</span>
        </div>
        
        <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full transition-all duration-200"
            >
              {item.label}
            </a>
          ))}
        </nav>
        
        <div className="hidden md:flex items-center gap-3">
          <Button
            variant="ghost"
            size="lg"
            className="font-medium text-sm rounded-full hover:bg-muted"
            onClick={() => navigate("/login")}
          >
            Log in
          </Button>
          <Button size="lg" className="font-medium text-sm rounded-full px-6" onClick={() => navigate("/register")}>
            Get Started
          </Button>
        </div>

        <button 
          className="md:hidden p-2 rounded-full hover:bg-muted"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <IconX className="h-5 w-5" /> : <IconMenu2 className="h-5 w-5" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-background/95 backdrop-blur animate-in slide-in-from-top-2">
          <nav className="container mx-auto max-w-6xl px-4 py-4 flex flex-col gap-2">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-all"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <div className="flex gap-2 mt-2 pt-4 border-t">
              <Button
                variant="outline"
                className="flex-1 rounded-lg"
                onClick={() => { navigate("/login"); setMobileMenuOpen(false); }}
              >
                Log in
              </Button>
              <Button 
                className="flex-1 rounded-lg"
                onClick={() => { navigate("/register"); setMobileMenuOpen(false); }}
              >
                Get Started
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;