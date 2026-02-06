/**
 * API Route: HSN-wise Summary Report
 * Returns aggregated HSN summary data for GSTR-1 filing
 */

import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { generateHSNReport } from "../services/gstReporting.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  
  const url = new URL(request.url);
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  const period = url.searchParams.get("period"); // "monthly", "quarterly", "yearly"
  
  // Validate and parse dates
  let finalStartDate: string;
  let finalEndDate: string;
  
  if (startDate && endDate) {
    // Custom date range
    finalStartDate = startDate;
    finalEndDate = endDate;
  } else if (period) {
    // Preset period
    const dates = getDateRangeForPeriod(period);
    if (!dates) {
      return Response.json({ error: "Invalid period parameter" }, { status: 400 });
    }
    finalStartDate = dates.startDate;
    finalEndDate = dates.endDate;
  } else {
    // Default to current month
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    finalStartDate = `${year}-${month}-01`;
    finalEndDate = `${year}-${month}-${new Date(year, now.getMonth() + 1, 0).getDate()}`;
  }
  
  // Validate date format
  if (!isValidDate(finalStartDate) || !isValidDate(finalEndDate)) {
    return Response.json({ error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
  }
  
  if (finalStartDate > finalEndDate) {
    return Response.json({ error: "Start date must be before end date" }, { status: 400 });
  }
  
  // Check date range limit (1 year max)
  const daysDiff = Math.ceil(
    (new Date(finalEndDate).getTime() - new Date(finalStartDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysDiff > 365) {
    return Response.json(
      { error: "Date range cannot exceed 365 days. Please select a shorter period." },
      { status: 400 }
    );
  }
  
  try {
    const report = await generateHSNReport(shop, finalStartDate, finalEndDate);
    
    // Round all values to 2 decimal places
    const formattedData = report.data.map((item) => ({
      ...item,
      totalQuantity: roundToTwo(item.totalQuantity),
      totalTaxableValue: roundToTwo(item.totalTaxableValue),
      integratedTax: roundToTwo(item.integratedTax),
      centralTax: roundToTwo(item.centralTax),
      stateTax: roundToTwo(item.stateTax),
      cess: roundToTwo(item.cess),
    }));
    
    const formattedTotals = {
      totalQuantity: roundToTwo(report.totals.totalQuantity),
      totalTaxableValue: roundToTwo(report.totals.totalTaxableValue),
      integratedTax: roundToTwo(report.totals.integratedTax),
      centralTax: roundToTwo(report.totals.centralTax),
      stateTax: roundToTwo(report.totals.stateTax),
      cess: roundToTwo(report.totals.cess),
    };
    
    return Response.json({
      data: formattedData,
      totals: formattedTotals,
      period: formatPeriodLabel(finalStartDate, finalEndDate),
      startDate: finalStartDate,
      endDate: finalEndDate,
    });
  } catch (error) {
    console.error("Error generating HSN report:", error);
    return Response.json(
      { error: "Failed to generate report. Please try again." },
      { status: 500 }
    );
  }
}

/**
 * Get date range for preset periods
 */
function getDateRangeForPeriod(period: string): { startDate: string; endDate: string } | null {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  
  switch (period) {
    case "monthly": {
      // Current month
      const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${new Date(year, month + 1, 0).getDate()}`;
      return { startDate, endDate };
    }
    
    case "quarterly": {
      // Current quarter
      const quarter = Math.floor(month / 3);
      const startMonth = quarter * 3;
      const endMonth = startMonth + 2;
      
      const startDate = `${year}-${String(startMonth + 1).padStart(2, "0")}-01`;
      const endDate = `${year}-${String(endMonth + 1).padStart(2, "0")}-${new Date(year, endMonth + 1, 0).getDate()}`;
      return { startDate, endDate };
    }
    
    case "yearly": {
      // Current financial year (April to March)
      const fyStartYear = month >= 3 ? year : year - 1;
      const startDate = `${fyStartYear}-04-01`;
      const endDate = `${fyStartYear + 1}-03-31`;
      return { startDate, endDate };
    }
    
    case "last-month": {
      const lastMonth = month === 0 ? 11 : month - 1;
      const lastMonthYear = month === 0 ? year - 1 : year;
      const startDate = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, "0")}-01`;
      const endDate = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, "0")}-${new Date(lastMonthYear, lastMonth + 1, 0).getDate()}`;
      return { startDate, endDate };
    }
    
    case "last-quarter": {
      const currentQuarter = Math.floor(month / 3);
      const lastQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
      const quarterYear = currentQuarter === 0 ? year - 1 : year;
      const startMonth = lastQuarter * 3;
      const endMonth = startMonth + 2;
      
      const startDate = `${quarterYear}-${String(startMonth + 1).padStart(2, "0")}-01`;
      const endDate = `${quarterYear}-${String(endMonth + 1).padStart(2, "0")}-${new Date(quarterYear, endMonth + 1, 0).getDate()}`;
      return { startDate, endDate };
    }
    
    default:
      return null;
  }
}

/**
 * Validate date string (YYYY-MM-DD)
 */
function isValidDate(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * Format period label for display
 */
function formatPeriodLabel(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    // Single month
    return `${monthNames[start.getMonth()]} ${start.getFullYear()}`;
  } else if (start.getFullYear() === end.getFullYear()) {
    // Same year
    return `${monthNames[start.getMonth()]} - ${monthNames[end.getMonth()]} ${start.getFullYear()}`;
  } else {
    // Different years
    return `${monthNames[start.getMonth()]} ${start.getFullYear()} - ${monthNames[end.getMonth()]} ${end.getFullYear()}`;
  }
}

/**
 * Round to 2 decimal places
 */
function roundToTwo(num: number): number {
  return Math.round(num * 100) / 100;
}
