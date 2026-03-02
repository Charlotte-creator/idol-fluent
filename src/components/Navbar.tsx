import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Home, PlusCircle, BarChart3 } from "lucide-react";

const links = [
  { to: "/", label: "Home", icon: Home },
  { to: "/clip/new", label: "New Clip", icon: PlusCircle },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
];

const Navbar = () => {
  const { pathname } = useLocation();

  return (
    <nav className="border-b bg-card">
      <div className="mx-auto flex h-14 max-w-4xl items-center gap-6 px-4">
        <Link to="/" className="text-lg font-bold text-foreground tracking-tight">
          ShadowSpeak
        </Link>
        <div className="flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                pathname === link.to
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
