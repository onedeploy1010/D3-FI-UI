import { Switch, Route, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AdminAuthProvider, RequireAdmin } from '@/contexts/admin-auth';
import AdminLayout from '@/components/admin-layout';
import LoginPage from '@/pages/login';
import DashboardPage from '@/pages/admin/dashboard';
import MembersPage from '@/pages/admin/members';
import ReferralsPage from '@/pages/admin/referrals';
import PartnersPage from '@/pages/admin/partners';
import StakesPage from '@/pages/admin/stakes';
import SubsidiesPage from '@/pages/admin/subsidies';
import SecurityPage from '@/pages/admin/security';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 30_000 } },
});

function AdminRoutes() {
  return (
    <RequireAdmin>
      <AdminLayout>
        <Switch>
          <Route path="/dashboard" component={DashboardPage} />
          <Route path="/members" component={MembersPage} />
          <Route path="/referrals" component={ReferralsPage} />
          <Route path="/partners" component={PartnersPage} />
          <Route path="/stakes" component={StakesPage} />
          <Route path="/subsidies" component={SubsidiesPage} />
          <Route path="/security" component={SecurityPage} />
          <Route path="/">
            <Redirect to="/dashboard" />
          </Route>
        </Switch>
      </AdminLayout>
    </RequireAdmin>
  );
}

export default function App() {
  return (
    <AdminAuthProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Switch>
            <Route path="/login" component={LoginPage} />
            <Route component={AdminRoutes} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </AdminAuthProvider>
  );
}
