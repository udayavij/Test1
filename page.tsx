
"use client"

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import type { AnalysisResult, Run, RequestTypeBreakdownItem, CompanyCodeBreakdownItem, MonthlyTransactionData } from '@/types/audit-log'
import { Loader2, Search, ThumbsUp, BarChart, Landmark, Building2, Layers, AlertTriangle, Timer, UserX, GitBranch } from 'lucide-react'
import { getAnalysisFromSheet } from '@/app/actions'
import { GeographicBreakdownTable } from '@/components/geographic-breakdown-table'
import { RequestTypeChart } from '@/components/charts/request-type-chart'
import { MonthlyTransactionsChart } from '@/components/charts/monthly-transactions-chart'
import { cn } from '@/lib/utils'
import { ClientOnly } from '@/components/client-only'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

function StatCard({ title, value, subtitle, icon: Icon, onClick, className }: { title: string, value: string, subtitle?: string, icon: React.ElementType, onClick?: () => void, className?: string }) {
  return (
    <Card onClick={onClick} className={cn("transition-colors", className, onClick && "cursor-pointer hover:bg-muted/80")}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [sheetUrl, setSheetUrl] = useState('')
  const [allRuns, setAllRuns] = useState<Run[]>([])
  const [selectedCompanyCodes, setSelectedCompanyCodes] = useState<Set<string>>(new Set())
  const [selectedRequestType, setSelectedRequestType] = useState<string | null>(null);

  const { toast } = useToast()

  const handleUrlSubmit = async () => {
    if (!sheetUrl) return

    setIsLoading(true)
    setAnalysisResult(null)
    setAllRuns([])
    setSelectedCompanyCodes(new Set())
    setSelectedRequestType(null)

    try {
      const result = await getAnalysisFromSheet(sheetUrl)
      
      if (result.error) {
        toast({
          variant: "destructive",
          title: "Analysis Error",
          description: result.error,
        })
        setAnalysisResult(null)
      } else {
        setAnalysisResult(result)
        if (result.runs) {
          const runsWithDates = result.runs.map(run => ({
            ...run,
            startTime: run.startTime ? new Date(run.startTime) : undefined,
            endTime: run.endTime ? new Date(run.endTime) : undefined,
          }));
          setAllRuns(runsWithDates)
        }
      }
    } catch (e) {
      console.error(e)
      toast({
        variant: "destructive",
        title: "Processing Error",
        description: "An unexpected error occurred. Please check the URL, sharing permissions, and console for details.",
      })
    } finally {
      setIsLoading(false)
    }
  }
  
  const finalFilteredRuns = useMemo(() => {
    let runs = allRuns;
    if (selectedCompanyCodes.size > 0) {
      runs = runs.filter(run => run.companyCode && selectedCompanyCodes.has(run.companyCode));
    }
    if (selectedRequestType) {
      runs = runs.filter(run => run.requestTypes.includes(selectedRequestType));
    }
    return runs;
  }, [allRuns, selectedCompanyCodes, selectedRequestType]);

  const companyCodeBreakdown = useMemo<CompanyCodeBreakdownItem[]>(() => {
    const runsToConsider = selectedRequestType
      ? allRuns.filter(run => run.requestTypes.includes(selectedRequestType))
      : allRuns;
    
    const companyCodeCounts: { [key: string]: number } = {};
    for (const run of runsToConsider) {
      if (run.companyCode) {
        companyCodeCounts[run.companyCode] = (companyCodeCounts[run.companyCode] || 0) + 1;
      }
    }
    return Object.entries(companyCodeCounts)
      .map(([companyCode, transactions]) => ({ companyCode, transactions }))
      .sort((a, b) => b.transactions - a.transactions);
  }, [allRuns, selectedRequestType]);

  const requestTypeBreakdown = useMemo<RequestTypeBreakdownItem[]>(() => {
    const runsToConsider = selectedCompanyCodes.size > 0
      ? allRuns.filter(run => run.companyCode && selectedCompanyCodes.has(run.companyCode))
      : allRuns;

    const requestTypeCounts: { [key: string]: number } = {};
    for (const run of runsToConsider) {
      for (const type of run.requestTypes) {
        requestTypeCounts[type] = (requestTypeCounts[type] || 0) + 1;
      }
    }
    return Object.entries(requestTypeCounts)
      .map(([type, count]) => ({ type, documents: count }))
      .sort((a, b) => b.documents - a.documents);
  }, [allRuns, selectedCompanyCodes]);

  const intercompanyTransactionCount = useMemo(() => {
    return finalFilteredRuns.filter(run => run.isIntercompany).length;
  }, [finalFilteredRuns]);

  const autoApprovedCount = useMemo(() => {
    return finalFilteredRuns.filter(run => run.isAutoApproved).length;
  }, [finalFilteredRuns]);

  const secondLevelApprovalCount = useMemo(() => {
    return finalFilteredRuns.filter(run => run.isSecondLevelApproval).length;
  }, [finalFilteredRuns]);
  
  const errorTransactionCount = useMemo(() => {
    return finalFilteredRuns.filter(run => run.isErrorTransaction).length;
  }, [finalFilteredRuns]);

  const monthlyData = useMemo<MonthlyTransactionData[]>(() => {
    if (!finalFilteredRuns || finalFilteredRuns.length === 0) return [];
    
    const monthCounts: { [key: string]: number } = {};

    for (const run of finalFilteredRuns) {
        if (run.transactionDate) {
            const date = new Date(run.transactionDate);
            const monthKey = `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1).toString().padStart(2, '0')}`;
            
            monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;
        }
    }
    return Object.entries(monthCounts)
        .map(([month, transactions]) => ({ month, transactions }))
        .sort((a, b) => a.month.localeCompare(b.month));
  }, [finalFilteredRuns]);

  const avgProcessingTime = useMemo(() => {
    const validRuns = finalFilteredRuns.filter(run => run.startTime && run.endTime);
    if (validRuns.length === 0) return "N/A";

    const totalDuration = validRuns.reduce((acc, run) => {
        const duration = new Date(run.endTime!).getTime() - new Date(run.startTime!).getTime();
        return acc + duration;
    }, 0);

    const avgDurationMs = totalDuration / validRuns.length;
    if (isNaN(avgDurationMs)) return "N/A";
    if (avgDurationMs === 0) return "0 sec";
    
    const totalSeconds = avgDurationMs / 1000;
    const seconds = Math.floor(totalSeconds);
    const milliseconds = Math.round((totalSeconds - seconds) * 1000);

    if (seconds > 0) {
      return `${seconds} sec, ${milliseconds} ms`;
    }
    return `${milliseconds} ms`;

  }, [finalFilteredRuns]);

  const wbsOwnerMissingCount = useMemo(() => {
    return finalFilteredRuns.filter(run => run.isWbsOwnerMissing).length;
  }, [finalFilteredRuns]);

  const costCenterOwnerMissingCount = useMemo(() => {
    return finalFilteredRuns.filter(run => run.isCostCenterOwnerMissing).length;
  }, [finalFilteredRuns]);

  const fallbackTransactionCount = useMemo(() => {
    return finalFilteredRuns.filter(run => run.isFallbackTransaction).length;
  }, [finalFilteredRuns]);
  
  const handleDownload = () => {
    if (finalFilteredRuns.length === 0) return;

    const fileContent = finalFilteredRuns.map(run => run.uniqueKey).join('\n');
    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'unique_transactions.txt';
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleIntercompanyDownload = () => {
    const intercompanyKeys = finalFilteredRuns
      .filter(run => run.isIntercompany)
      .map(run => run.uniqueKey);

    if (intercompanyKeys.length === 0) return;

    const fileContent = intercompanyKeys.join('\n');
    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'intercompany_transactions.txt';
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAutoApprovedDownload = () => {
    const keys = finalFilteredRuns
      .filter(run => run.isAutoApproved)
      .map(run => run.uniqueKey);

    if (keys.length === 0) return;

    const fileContent = keys.join('\n');
    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'auto_approved_transactions.txt';
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSecondLevelApprovalDownload = () => {
    const keys = finalFilteredRuns
      .filter(run => run.isSecondLevelApproval)
      .map(run => run.uniqueKey);

    if (keys.length === 0) return;

    const fileContent = keys.join('\n');
    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'second_level_approval_transactions.txt';
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleErrorTransactionDownload = () => {
    const keys = finalFilteredRuns
      .filter(run => run.isErrorTransaction)
      .map(run => run.uniqueKey);

    if (keys.length === 0) return;

    const fileContent = keys.join('\n');
    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'error_transactions.txt';
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleWbsOwnerMissingDownload = () => {
    const keys = finalFilteredRuns
      .filter(run => run.isWbsOwnerMissing)
      .map(run => run.uniqueKey);

    if (keys.length === 0) return;

    const fileContent = keys.join('\n');
    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'wbs_owner_missing_transactions.txt';
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCostCenterOwnerMissingDownload = () => {
    const keys = finalFilteredRuns
      .filter(run => run.isCostCenterOwnerMissing)
      .map(run => run.uniqueKey);

    if (keys.length === 0) return;
    
    const fileContent = keys.join('\n');
    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'cost_center_owner_missing_transactions.txt';
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  const handleFallbackTransactionDownload = () => {
    const keys = finalFilteredRuns
      .filter(run => run.isFallbackTransaction)
      .map(run => run.uniqueKey);

    if (keys.length === 0) return;

    const fileContent = keys.join('\n');
    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fallback_transactions.txt';
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCompanyCodeSelect = (companyCode: string) => {
    setSelectedCompanyCodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(companyCode)) {
        newSet.delete(companyCode);
      } else {
        newSet.add(companyCode);
      }
      return newSet;
    });
  };
  
  const handleRequestTypeSelect = (type: string) => {
    setSelectedRequestType(prev => (prev === type ? null : type));
  };
  
  const handleResetRequestType = () => {
    setSelectedRequestType(null);
  }

  const handleResetSelection = () => {
    setSelectedCompanyCodes(new Set());
    setSelectedRequestType(null);
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col w-full min-h-screen bg-muted/40">
        <header className="sticky top-0 z-30 flex flex-col items-center gap-4 p-4 border-b shrink-0 bg-background sm:flex-row sm:h-16 sm:justify-between sm:px-6">
          <div className="flex items-center self-start gap-3 sm:self-center">
            <Landmark className="w-6 h-6 text-primary" />
            <h1 className="text-lg font-semibold sm:text-xl text-foreground">FALT Audit Log Analytics Tab</h1>
          </div>
          <ClientOnly>
            <div className="flex items-center w-full gap-2 sm:max-w-md lg:max-w-lg">
                <Input
                  id="sheet-url"
                  type="url"
                  placeholder="Paste your Google Sheet URL to begin..."
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  className="w-full"
                  disabled={isLoading}
                  onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={handleUrlSubmit} disabled={isLoading || !sheetUrl}>
                      {isLoading ? <Loader2 className="animate-spin" /> : <Search />}
                      <span className="hidden sm:inline">Analyze</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Click to analyze the Google Sheet</p>
                  </TooltipContent>
                </Tooltip>
            </div>
          </ClientOnly>
        </header>

        <main className="flex-1 p-4 sm:p-6 md:p-8">
          {!analysisResult && !isLoading && (
              <div className="flex flex-col items-center justify-center h-full text-center border-2 border-dashed rounded-lg bg-card">
                  <div className="p-10">
                      <h2 className="text-2xl font-semibold">Welcome to your Dashboard</h2>
                      <p className="mt-2 text-muted-foreground">Paste a Google Sheet URL in the header to get started.</p>
                  </div>
              </div>
          )}
          
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <div>
                <p className="text-lg font-semibold">Analyzing your data...</p>
                <p className="text-muted-foreground">This may take a moment.</p>
              </div>
            </div>
          )}

          {analysisResult && !analysisResult.error && (
            <div className="grid items-start gap-6 md:grid-cols-2 lg:grid-cols-5">
              {/* Left Column */}
              <div className="grid gap-6 lg:col-span-2">
                  <Card>
                      <CardHeader className="flex flex-row items-center justify-between">
                          <CardTitle className="text-lg">Transactions by Company Code</CardTitle>
                          {(selectedCompanyCodes.size > 0 || selectedRequestType) && <Button variant="ghost" size="sm" onClick={handleResetSelection}>Reset</Button>}
                      </CardHeader>
                      <CardContent>
                          <GeographicBreakdownTable 
                            data={companyCodeBreakdown} 
                            selectedCompanyCodes={selectedCompanyCodes}
                            onCompanyCodeSelect={handleCompanyCodeSelect}
                          />
                      </CardContent>
                  </Card>
                  <Card>
                      <CardHeader>
                          <div className="flex flex-row items-center justify-between">
                            <CardTitle className="text-lg">Document Counts by Request Type</CardTitle>
                            {selectedRequestType && <Button variant="ghost" size="sm" onClick={handleResetRequestType}>Reset</Button>}
                          </div>
                      </CardHeader>
                      <CardContent className="pl-2">
                          <RequestTypeChart 
                            data={requestTypeBreakdown} 
                            onBarClick={handleRequestTypeSelect}
                            selectedType={selectedRequestType}
                          />
                      </CardContent>
                  </Card>
              </div>

              {/* Right Column */}
              <div className="grid gap-6 lg:col-span-3">
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                      <StatCard 
                        title="Total Unique Transactions" 
                        value={finalFilteredRuns.length.toLocaleString()} 
                        icon={BarChart} 
                        onClick={handleDownload}
                        className="cursor-pointer hover:bg-muted/80"
                      />
                      <StatCard 
                          title="Number of Intercompany Transactions" 
                          value={intercompanyTransactionCount.toLocaleString()} 
                          icon={Building2} 
                          onClick={handleIntercompanyDownload}
                          className="cursor-pointer hover:bg-muted/80"
                      />
                      <StatCard 
                        title="Auto-Approved Transactions" 
                        value={autoApprovedCount.toLocaleString()} 
                        icon={ThumbsUp} 
                        onClick={handleAutoApprovedDownload}
                        className="cursor-pointer hover:bg-muted/80"
                      />
                      <StatCard 
                        title="2nd Level Approvals" 
                        value={secondLevelApprovalCount.toLocaleString()} 
                        icon={Layers} 
                        subtitle="Transactions requiring 2 level approvals"
                        onClick={handleSecondLevelApprovalDownload}
                        className="cursor-pointer hover:bg-muted/80"
                      />
                      <StatCard 
                        title="Error Transactions" 
                        value={errorTransactionCount.toLocaleString()} 
                        icon={AlertTriangle} 
                        subtitle="Transactions with a failed DoA validation"
                        onClick={handleErrorTransactionDownload}
                        className="cursor-pointer hover:bg-muted/80"
                      />
                      <StatCard 
                        title="Avg Processing Time" 
                        value={avgProcessingTime} 
                        icon={Timer} 
                      />
                      <StatCard 
                        title="WBS Owner Missing" 
                        value={wbsOwnerMissingCount.toLocaleString()} 
                        icon={UserX} 
                        onClick={handleWbsOwnerMissingDownload}
                        className="cursor-pointer hover:bg-muted/80"
                      />
                      <StatCard 
                        title="Cost Center Owner Missing" 
                        value={costCenterOwnerMissingCount.toLocaleString()} 
                        icon={UserX} 
                        onClick={handleCostCenterOwnerMissingDownload}
                        className="cursor-pointer hover:bg-muted/80"
                      />
                      <StatCard 
                        title="Fallback Transactions" 
                        value={fallbackTransactionCount.toLocaleString()} 
                        icon={GitBranch} 
                        subtitle="Transactions processed to Req's FM after an error"
                        onClick={handleFallbackTransactionDownload}
                        className="cursor-pointer hover:bg-muted/80"
                      />
                  </div>
                  <Card>
                      <CardHeader>
                          <CardTitle className="text-lg">Transactions per Month</CardTitle>
                      </CardHeader>
                      <CardContent className="pl-2">
                          <MonthlyTransactionsChart data={monthlyData} />
                      </CardContent>
                  </Card>
              </div>
            </div>
          )}
        </main>
      </div>
    </TooltipProvider>
  )
}

    