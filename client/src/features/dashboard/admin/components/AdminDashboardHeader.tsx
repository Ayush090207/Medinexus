import { IconHeartbeat, IconCalendarTime, IconCalendarStats, IconCalendarUser } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const navigationItems = [
  { name: 'Overview', key: 'overview' },
  { name: 'Doctors', key: 'doctors' },
  { name: 'Services', key: 'services' },
  { name: 'Service Slots', key: 'service-slots', icon: <IconCalendarTime className="h-4 w-4 mr-1.5" /> },
  { name: 'Service Bookings', key: 'service-appointments', icon: <IconCalendarStats className="h-4 w-4 mr-1.5" /> },
  { name: 'Doctor Slots', key: 'doctor-slots', icon: <IconCalendarUser className="h-4 w-4 mr-1.5" /> },
  { name: 'Appointments', key: 'appointments' },
  { name: 'Reports', key: 'reports' },
];

export const AdminDashboardHeader = ({ activeTab, setActiveTab }: HeaderProps) => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto max-w-7xl px-4 h-16 flex items-center justify-between">

        {/* Brand */}
        <div
          className="flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-80"
          onClick={() => setActiveTab('overview')}
        >
          <IconHeartbeat className="h-6 w-6 text-primary" />
          <span className="font-serif text-xl font-light">
            mediNexus <span className="text-sm font-medium text-muted-foreground ml-1">Admin</span>
          </span>
        </div>

        {/* Nav */}
        <nav className="hidden md:flex flex-1 items-center justify-center gap-1">
          {navigationItems.map((item) => (
            <Button
              key={item.key}
              variant={activeTab === item.key ? "secondary" : "ghost"}
              className={`text-sm font-medium transition-colors ${
                activeTab === item.key
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab(item.key)}
            >
              {item.icon}
              {item.name}
            </Button>
          ))}
        </nav>

        {/* Actions */}
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
