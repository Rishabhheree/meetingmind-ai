import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/providers/supabase-provider";
import { ThemeProvider } from "@/providers/theme-provider";

import SignInPage from "@/pages/auth/signin";
import SignUpPage from "@/pages/auth/signup";
import DashboardPage from "@/pages/dashboard";
import MeetingsPage from "@/pages/meetings/index";
import NewMeetingPage from "@/pages/meetings/new";
import MeetingDetailsPage from "@/pages/meetings/[id]";
import MeetingRoomPage from "@/pages/meetings/room";
import TranscriptsPage from "@/pages/transcripts";
import AnalyticsPage from "@/pages/analytics";
import UsersPage from "@/pages/admin/users";
import VoiceEnrollmentPage from "@/pages/profile/enrollment";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <Redirect to="/auth/signin" />} />
      <Route path="/auth/signin" component={SignInPage} />
      <Route path="/auth/signup" component={SignUpPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/meetings" component={MeetingsPage} />
      <Route path="/meetings/new" component={NewMeetingPage} />
      <Route path="/meetings/:id/room" component={MeetingRoomPage} />
      <Route path="/meetings/:id" component={MeetingDetailsPage} />
      <Route path="/transcripts" component={TranscriptsPage} />
      <Route path="/analytics" component={AnalyticsPage} />
      <Route path="/admin/users" component={UsersPage} />
      <Route path="/profile/enrollment" component={VoiceEnrollmentPage} />
      <Route component={() => <Redirect to="/dashboard" />} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster richColors position="bottom-right" />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
