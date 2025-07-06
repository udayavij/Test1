
import type { AnalysisResult, Run } from "@/types/audit-log";

function parseCsvLine(line: string): string[] {
  const csvSplitRegex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
  return line.split(csvSplitRegex).map(field => {
    let cleanedField = field.trim();
    if (cleanedField.startsWith('"') && cleanedField.endsWith('"')) {
      cleanedField = cleanedField.substring(1, cleanedField.length - 1).replace(/""/g, '"');
    }
    return cleanedField;
  });
}

function parseTimestamp(ts: string): Date | null {
  const numericString = ts.replace(/[^0-9.]/g, "");
  const parts = numericString.split('.');
  const mainPart = parts[0];
  
  if (mainPart.length < 14) {
    return null;
  }

  const year = parseInt(mainPart.substring(0, 4), 10);
  const month = parseInt(mainPart.substring(4, 6), 10) - 1;
  const day = parseInt(mainPart.substring(6, 8), 10);
  const hour = parseInt(mainPart.substring(8, 10), 10);
  const minute = parseInt(mainPart.substring(10, 12), 10);
  const second = parseInt(mainPart.substring(12, 14), 10);
  const fractionalPart = parts.length > 1 ? parts[1] : '0';
  const millisecond = parseInt(fractionalPart.substring(0, 3).padEnd(3, '0'), 10);

  if ([year, month, day, hour, minute, second, millisecond].some(isNaN)) {
      return null;
  }
  
  const date = new Date(Date.UTC(year, month, day, hour, minute, second, millisecond));
  
  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}


export function processLogFile(fileContent: string): AnalysisResult {
  const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== '');

  if (lines.length < 2) { 
    return { error: "The sheet appears to be empty or contains only a header." };
  }

  const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  
  const docIdIndex = header.indexOf('document id');
  const docVerIndex = header.indexOf('document version');
  const messageIndex = header.indexOf('message');
  const coCdIndex = header.indexOf('cocd');
  const timestampIndex = header.indexOf('timestamp');
  const typeIndex = header.indexOf('type');

  if (docIdIndex === -1) {
    return { error: "Could not find required column: 'Document ID'. Please check the column header." };
  }
  if (coCdIndex === -1) {
    return { error: "Could not find required column: 'CoCd'. Please check the column header." };
  }
  if (messageIndex === -1) {
    return { error: "Could not find required column: 'Message'. This column is needed for analysis." };
  }
  if (timestampIndex === -1) {
    return { error: "Could not find required column: 'TimeStamp'. This column is needed for the monthly chart." };
  }
  if (typeIndex === -1) {
    return { error: "Could not find required column: 'Type'. This column is needed for error analysis." };
  }
  
  const hasDocVer = docVerIndex !== -1;
  
  const thresholdRegex = /Threshold identified:[\s\S]*?\/(?<docType>[A-Z]{3,4})\s+values:/i;
  const autoApprovalMessage = "Document assessment executed with the result Approval NOT required";
  const secondLevelApprovalMessage = "2nd Approval is mandated as document amount is";
  const errorMessage = "An Error occured while determining the approvers";
  const startProcessingMessage = "Running the document assessment, based on outcome: proceed or end";
  const endProcessingMessage = "Completed execution of the Financial Approvals engine - technical success";
  const wbsOwnerMissingMessage = "Failed to identify WBS Element object owner for object";
  const costCenterOwnerMissingMessage = "Failed to identify Cost Center object owner for object";
  const fallbackMessagePrefix = "Using HR Hierarchy data with key";


  const groupedByTransaction = new Map<string, { entries: { message: string, type: string, timestamp: Date | null }[], coCd: string, timestamps: Date[] }>();
  const dataRows = lines.slice(1);

  for (const line of dataRows) {
    const fields = parseCsvLine(line);
    if (fields.length <= docIdIndex || fields.length <= messageIndex || fields.length <= coCdIndex || fields.length <= timestampIndex || fields.length <= typeIndex) continue;

    const documentId = fields[docIdIndex]?.trim();
    const companyCode = fields[coCdIndex]?.trim();

    if (documentId && companyCode) {
      const docVer = hasDocVer ? (fields[docVerIndex]?.trim() ?? '') : '';
      const uniqueKey = `${documentId}-${docVer}-${companyCode}`;
      const message = fields[messageIndex]?.trim();
      const timestampStr = fields[timestampIndex]?.trim();
      const timestamp = parseTimestamp(timestampStr);
      const type = fields[typeIndex]?.trim();

      if (!groupedByTransaction.has(uniqueKey)) {
        groupedByTransaction.set(uniqueKey, { entries: [], coCd: companyCode, timestamps: [] });
      }
      
      const group = groupedByTransaction.get(uniqueKey)!;
      if (message) {
        group.entries.push({ message, type, timestamp });
      }
      if (timestamp) {
        group.timestamps.push(timestamp);
      }
    }
  }

  const runs: Run[] = Array.from(groupedByTransaction.entries()).map(([key, data]) => {
    const latestTimestamp = data.timestamps.length > 0
      ? new Date(Math.max(...data.timestamps.map(d => d.getTime())))
      : new Date(0);
    
    let startTime: Date | undefined;
    let endTime: Date | undefined;

    const run: Run = {
      uniqueKey: key,
      companyCode: data.coCd,
      requestTypes: [],
      isIntercompany: false,
      isAutoApproved: false,
      isSecondLevelApproval: false,
      isErrorTransaction: false,
      isWbsOwnerMissing: false,
      isCostCenterOwnerMissing: false,
      isFallbackTransaction: false,
      transactionDate: latestTimestamp,
    };

    const requestTypesForRun = new Set<string>();

    const startEntries = data.entries
      .filter(e => e.message === startProcessingMessage && e.timestamp)
      .sort((a, b) => b.timestamp!.getTime() - a.timestamp!.getTime());
    const endEntries = data.entries
      .filter(e => e.message === endProcessingMessage && e.timestamp)
      .sort((a, b) => b.timestamp!.getTime() - a.timestamp!.getTime());

    if (startEntries.length > 0) {
      startTime = startEntries[0].timestamp!;
    }
    if (endEntries.length > 0) {
      endTime = endEntries[0].timestamp!;
    }
    
    for (const entry of data.entries) {
      const { message, type } = entry;
      const thresholdMatch = message.match(thresholdRegex);
      if (thresholdMatch?.groups?.docType) {
        const docType = thresholdMatch.groups.docType.toUpperCase();
        requestTypesForRun.add(docType);
      }

      if (message.includes("Intercompany supplier identified with supplier ID") && !message.includes("Non Intercompany supplier identified with supplier ID")) {
        run.isIntercompany = true;
      }

      if (message === autoApprovalMessage) {
        run.isAutoApproved = true;
      }
      
      if (message.startsWith(secondLevelApprovalMessage)) {
        run.isSecondLevelApproval = true;
      }
      
      if (message === errorMessage && type === 'E') {
        run.isErrorTransaction = true;
      }

      if (message.startsWith(wbsOwnerMissingMessage)) {
        run.isWbsOwnerMissing = true;
      }

      if (message.startsWith(costCenterOwnerMissingMessage)) {
        run.isCostCenterOwnerMissing = true;
      }

      if (message.startsWith(fallbackMessagePrefix)) {
        run.isFallbackTransaction = true;
      }
    }
    run.requestTypes = Array.from(requestTypesForRun);
    run.startTime = startTime ? new Date(startTime) : undefined;
    run.endTime = endTime ? new Date(endTime) : undefined;
    
    return run;
  });

  return {
    runs,
  };
}
