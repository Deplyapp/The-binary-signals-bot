import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Users, Signal, Clock, TrendingUp, Shield, Zap } from "lucide-react";

interface BotStatus {
  status: string;
  uptime: number;
  totalUsers: number;
  activeSessions: number;
  signalsGenerated: number;
  usersAcceptedTerms: number;
  lastVolatilityUpdate: string | null;
  volatilityData: Array<{
    symbol: string;
    volatilityScore: number;
    isStable: boolean;
    severity: string;
  }>;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function StatusBadge({ isOnline }: { isOnline: boolean }) {
  return (
    <Badge 
      variant={isOnline ? "default" : "destructive"}
      className="flex items-center gap-1"
      data-testid="badge-bot-status"
    >
      <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
      {isOnline ? "Online" : "Offline"}
    </Badge>
  );
}

function VolatilityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    low: "bg-green-500/20 text-green-400 border-green-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    high: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  
  return (
    <Badge 
      variant="outline" 
      className={`${colors[severity] || colors.medium} border`}
      data-testid={`badge-volatility-${severity}`}
    >
      {severity.toUpperCase()}
    </Badge>
  );
}

function MetricCard({ 
  title, 
  value, 
  icon: Icon, 
  subtitle 
}: { 
  title: string; 
  value: string | number; 
  icon: typeof Activity;
  subtitle?: string;
}) {
  return (
    <Card className="border-border/50" data-testid={`card-metric-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">{title}</span>
            <span className="text-3xl font-bold tracking-tight font-mono">{value}</span>
            {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
          </div>
          <div className="p-3 rounded-xl bg-primary/10">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StatusPage() {
  const { data: botStatus, isLoading, error } = useQuery<BotStatus>({
    queryKey: ["/api/bot/status"],
    refetchInterval: 5000,
  });

  const isOnline = botStatus?.status === "running";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Signal className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">Binary Signals Bot</h1>
              <p className="text-xs text-muted-foreground">Real-time trading signals dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge isOnline={isOnline} />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="pt-6">
                  <div className="h-20 bg-muted rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="pt-6 text-center">
              <p className="text-destructive" data-testid="text-error">Failed to load bot status. Please try again later.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <MetricCard 
                title="Total Users" 
                value={botStatus?.totalUsers || 0} 
                icon={Users}
                subtitle={`${botStatus?.usersAcceptedTerms || 0} accepted T&C`}
              />
              <MetricCard 
                title="Active Sessions" 
                value={botStatus?.activeSessions || 0} 
                icon={Activity}
              />
              <MetricCard 
                title="Signals Generated" 
                value={botStatus?.signalsGenerated || 0} 
                icon={TrendingUp}
              />
              <MetricCard 
                title="Uptime" 
                value={formatUptime(botStatus?.uptime || 0)} 
                icon={Clock}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <Card data-testid="card-volatility-monitor">
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    Volatility Monitor
                  </CardTitle>
                  {botStatus?.lastVolatilityUpdate && (
                    <span className="text-xs text-muted-foreground font-mono">
                      Updated: {new Date(botStatus.lastVolatilityUpdate).toLocaleTimeString()}
                    </span>
                  )}
                </CardHeader>
                <CardContent>
                  {botStatus?.volatilityData && botStatus.volatilityData.length > 0 ? (
                    <div className="space-y-3">
                      {botStatus.volatilityData.slice(0, 8).map((item) => (
                        <div 
                          key={item.symbol}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                          data-testid={`row-volatility-${item.symbol}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-sm">{item.symbol}</span>
                            <VolatilityBadge severity={item.severity} />
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all ${
                                  item.isStable ? 'bg-green-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${Math.min(item.volatilityScore * 100, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono text-muted-foreground w-12 text-right">
                              {(item.volatilityScore * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No volatility data available yet. Monitoring will begin shortly.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="card-system-info">
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    System Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm text-muted-foreground">Bot Status</span>
                      <StatusBadge isOnline={isOnline} />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm text-muted-foreground">Market Monitor</span>
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                        Active
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm text-muted-foreground">Chart Rendering</span>
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                        Ready
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm text-muted-foreground">Database</span>
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                        Connected
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-border/50 py-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p data-testid="text-developer-credit">Made by Kaif</p>
            <p className="font-mono text-xs">
              {new Date().toLocaleDateString()} - Binary Signals Bot v1.0
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
