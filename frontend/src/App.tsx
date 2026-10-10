import { Navigate, Route, Routes } from "react-router-dom";

import Navbar from "@/components/layout/Navbar";
import Onboarding from "@/components/onboarding/Onboarding";
import { Toaster } from "@/components/ui/sonner";
import ChatPage from "@/pages/ChatPage";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import MapPage from "@/pages/MapPage";
import MissionsPage from "@/pages/MissionsPage";
import ProfilePage from "@/pages/ProfilePage";
import Register from "@/pages/Register";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <Navbar />
      <main className="pb-14 pt-14 md:pb-0">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/missions" element={<MissionsPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Onboarding />
      <Toaster />
    </div>
  );
}