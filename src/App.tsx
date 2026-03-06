import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Index from "./pages/Index";
import ClipNew from "./pages/ClipNew";
import Shadow from "./pages/Shadow";
import Retell from "./pages/Retell";
import SessionDetail from "./pages/SessionDetail";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

const isDebugRouteEnabled = import.meta.env.VITE_DEBUG === "1";
const DebugTranscribe = isDebugRouteEnabled
  ? lazy(() => import("./pages/DebugTranscribe"))
  : null;

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/clip/new" element={<ClipNew />} />
        <Route path="/clip/:id/shadow" element={<Shadow />} />
        <Route path="/clip/:id/retell" element={<Retell />} />
        <Route path="/session/:sessionId" element={<SessionDetail />} />
        <Route path="/dashboard" element={<Dashboard />} />
        {isDebugRouteEnabled && DebugTranscribe && (
          <Route
            path="/debug/transcribe"
            element={(
              <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading debug tools...</div>}>
                <DebugTranscribe />
              </Suspense>
            )}
          />
        )}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
