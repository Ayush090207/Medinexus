import { useEffect, useState } from "react";
import { IconHeartbeat } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { doctorService } from "@/services/doctor.service";

// 1. Define the props interface
interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const navigationItems = [
  { name: 'Appointments', key: 'queue' },
  { name: 'Schedule', key: 'schedule' },
  { name: 'Prescriptions', key: 'prescriptions' },
  { name: 'Referrals', key: 'referrals' },
];

export const DoctorDashboardHeader = ({ activeTab, setActiveTab }: HeaderProps) => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [pendingReferrals, setPendingReferrals] = useState(0);

  // Poll for pending received referrals to show badge
  useEffect(() => {
    let cancelled = false;
    const fetchPending = async () => {
      try {
        const res = await doctorService.listReferrals();
        if (cancelled) return;
        const referrals: any[] = (res as any).data?.referrals ?? [];
        const count = referrals.filter(
          (r) => r.direction === 'received' && r.status === 'pending'
        ).length;
        setPendingReferrals(count);
      } catch {
        // silent — badge is non-critical
      }
    };

    fetchPending();
    // Refresh every 60 s
    const interval = setInterval(fetchPending, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto max-w-7xl px-4 h-16 flex items-center justify-between">
        
        {/* Brand Name - Left */}
        <div 
          className="flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-80" 
          onClick={() => setActiveTab('queue')}
        >
          <IconHeartbeat className="h-6 w-6 text-primary" />
          <span className="font-serif text-xl font-light">mediNexus <span className="text-sm font-medium text-muted-foreground ml-1">Doctor</span></span>
        </div>

        {/* Navigation Links - Center */}
        <nav className="hidden md:flex flex-1 items-center justify-center gap-2">
          {navigationItems.map((item) => (
            <Button
              key={item.key}
              variant={activeTab === item.key ? "secondary" : "ghost"}
              className={`text-md font-normal transition-colors relative ${
                activeTab === item.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab(item.key)}
            >
              {item.name}
              {item.key === 'referrals' && pendingReferrals > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                  {pendingReferrals}
                </span>
              )}
            </Button>
          ))}
        </nav>

        {/* Action Buttons - Right */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-full bg-secondary/50" onClick={() => setActiveTab('profile')}>
            <User className="h-5 w-5 text-foreground" />
          </Button>
          
          <Button 
            variant="outline" 
            className="font-normal text-md hidden sm:flex border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 transition-colors" 
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
};