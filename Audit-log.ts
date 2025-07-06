
export type Run = {
  uniqueKey: string;
  companyCode: string | null;
  requestTypes: string[];
  isIntercompany: boolean;
  isAutoApproved: boolean;
  isSecondLevelApproval: boolean;
  isErrorTransaction: boolean;
  isWbsOwnerMissing: boolean;
  isCostCenterOwnerMissing: boolean;
  isFallbackTransaction: boolean;
  transactionDate: Date;
  startTime?: Date;
  endTime?: Date;
};

export type RequestTypeBreakdownItem = {
  type: string;
  documents: number;
};

export type CompanyCodeBreakdownItem = {
  companyCode: string;
  transactions: number;
};

export type MonthlyTransactionData = {
  month: string;
  transactions: number;
};

export type AnalysisResult = {
  runs: Run[];
  error?: never;
} | {
  error: string;
  runs?: never;
};
