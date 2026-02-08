/**
 * GST Reports Page
 * Displays GSTR-1 B2C (Others) and HSN-wise Summary reports
 */

import { useState, useEffect, useCallback } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams, useFetcher, Link } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { timestamp: Date.now() };
};

type PeriodType = "monthly" | "quarterly" | "yearly" | "custom";

interface B2CReportData {
  placeOfSupply: string;
  placeOfSupplyCode?: string;
  rate: number;
  totalQuantity: number;
  totalTaxableValue: number;
  integratedTax: number;
  centralTax: number;
  stateTax: number;
  cess: number;
}

interface HSNReportData {
  srNo: number;
  hsn: string;
  description: string;
  hsnDescription?: string;
  uqc: string;
  totalQuantity: number;
  totalTaxableValue: number;
  rate: number;
  integratedTax: number;
  centralTax: number;
  stateTax: number;
  cess: number;
}

interface ReportTotals {
  taxableValue?: number;
  totalTaxableValue?: number;
  totalQuantity?: number;
  integratedTax: number;
  centralTax: number;
  stateTax: number;
  cess: number;
}

export default function Reports() {
  const loaderData = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const b2cFetcher = useFetcher<{ data: B2CReportData[]; totals: ReportTotals; period: string }>();
  const hsnFetcher = useFetcher<{ data: HSNReportData[]; totals: ReportTotals; period: string }>();
  
  const [activeTab, setActiveTab] = useState<"b2c" | "hsn">("b2c");
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [isCustomDateValid, setIsCustomDateValid] = useState(true);

  // Quick filter helpers
  const applyQuickFilter = (type: 'month' | 'quarter', value: string) => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const fiscalYearStart = today.getMonth() >= 3 ? currentYear : currentYear - 1; // April-based FY
    
    if (type === 'month') {
      const [year, month] = value.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0); // Last day of month
      setCustomStartDate(startDate.toISOString().split('T')[0]);
      setCustomEndDate(endDate.toISOString().split('T')[0]);
    } else if (type === 'quarter') {
      const quarter = parseInt(value);
      let startMonth: number, endMonth: number, year: number;
      
      // Indian FY quarters (Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar)
      if (quarter === 1) { startMonth = 3; endMonth = 5; year = fiscalYearStart; }
      else if (quarter === 2) { startMonth = 6; endMonth = 8; year = fiscalYearStart; }
      else if (quarter === 3) { startMonth = 9; endMonth = 11; year = fiscalYearStart; }
      else { startMonth = 0; endMonth = 2; year = fiscalYearStart + 1; }
      
      const startDate = new Date(year, startMonth, 1);
      const endDate = new Date(year, endMonth + 1, 0);
      setCustomStartDate(startDate.toISOString().split('T')[0]);
      setCustomEndDate(endDate.toISOString().split('T')[0]);
    }
  };

  // Build URL with preserved query params
  const buildApiUrl = useCallback((endpoint: string, params: Record<string, string>) => {
    const url = new URL(endpoint, window.location.origin);
    
    // Add report params
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    
    // Preserve Shopify embedded app params
    if (searchParams.get('host')) url.searchParams.set('host', searchParams.get('host')!);
    if (searchParams.get('shop')) url.searchParams.set('shop', searchParams.get('shop')!);
    
    return url.pathname + url.search;
  }, [searchParams]);

  // Fetch reports
  const fetchReports = useCallback(() => {
    let params: Record<string, string> = {};
    
    if (periodType === "custom") {
      if (!customStartDate || !customEndDate) {
        setIsCustomDateValid(false);
        return;
      }
      if (customStartDate > customEndDate) {
        setIsCustomDateValid(false);
        return;
      }
      setIsCustomDateValid(true);
      params = { startDate: customStartDate, endDate: customEndDate };
    } else {
      params = { period: periodType };
    }
    
    // Only fetch the active tab's report
    if (activeTab === "b2c") {
      const b2cUrl = buildApiUrl("/api/reports/gstr1-b2c", params);
      b2cFetcher.load(b2cUrl);
    } else {
      const hsnUrl = buildApiUrl("/api/reports/hsn-summary", params);
      hsnFetcher.load(hsnUrl);
    }
  }, [periodType, customStartDate, customEndDate, activeTab, buildApiUrl, b2cFetcher, hsnFetcher]);

  // Load reports on mount and when filters change (but not on every render)
  useEffect(() => {
    if (periodType === "custom" && (!customStartDate || !customEndDate)) {
      return; // Don't fetch until dates are set
    }
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodType, customStartDate, customEndDate, activeTab]);

  const handleApplyFilters = () => {
    fetchReports();
  };

  const handleReset = () => {
    setPeriodType("monthly");
    setCustomStartDate("");
    setCustomEndDate("");
    setIsCustomDateValid(true);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const exportToCSV = (reportType: "b2c" | "hsn") => {
    const data = reportType === "b2c" ? b2cFetcher.data?.data : hsnFetcher.data?.data;
    const totals = reportType === "b2c" ? b2cFetcher.data?.totals : hsnFetcher.data?.totals;
    const period = reportType === "b2c" ? b2cFetcher.data?.period : hsnFetcher.data?.period;
    
    if (!data || data.length === 0) {
      alert("No data to export");
      return;
    }

    let csvContent = "";
    
    if (reportType === "b2c") {
      csvContent = "GSTR-1 B2C (Others) Report\n";
      csvContent += `Period: ${period}\n\n`;
      csvContent += "Place of Supply,State Code,Rate (%),Quantity,Taxable Value,Integrated Tax,Central Tax,State Tax,Cess\n";
      
      (data as B2CReportData[]).forEach(row => {
        csvContent += `"${row.placeOfSupply}",${row.placeOfSupplyCode || ''},${row.rate},${row.totalQuantity},${row.totalTaxableValue},${row.integratedTax},${row.centralTax},${row.stateTax},${row.cess}\n`;
      });
      
      if (totals) {
        csvContent += `\nTotals,,,${totals.totalQuantity || 0},"${totals.taxableValue}","${totals.integratedTax}","${totals.centralTax}","${totals.stateTax}","${totals.cess}"\n`;
      }
    } else {
      csvContent = "HSN-wise Summary Report\n";
      csvContent += `Period: ${period}\n\n`;
      csvContent += "Sr. No,HSN,Description,UQC,Total Quantity,Total Taxable Value,Rate (%),Integrated Tax,Central Tax,State Tax,Cess\n";
      
      (data as HSNReportData[]).forEach(row => {
        csvContent += `${row.srNo},"${row.hsn}","${row.description || row.hsnDescription || ''}",${row.uqc},${row.totalQuantity},${row.totalTaxableValue},${row.rate},${row.integratedTax},${row.centralTax},${row.stateTax},${row.cess}\n`;
      });
      
      if (totals) {
        csvContent += `\nTotals,,,,"${totals.totalQuantity}","${totals.totalTaxableValue}",,"${totals.integratedTax}","${totals.centralTax}","${totals.stateTax}","${totals.cess}"\n`;
      }
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${reportType}_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isLoading = b2cFetcher.state === "loading" || hsnFetcher.state === "loading";
  const hasError = b2cFetcher.data && 'error' in b2cFetcher.data;

  return (
    <s-page heading="GST Reports">
      <s-section>
        {/* Filter Bar */}
        <div style={{ 
          padding: '16px', 
          backgroundColor: '#f9fafb', 
          borderRadius: '8px',
          marginBottom: '24px',
          border: '1px solid #e5e7eb'
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: 600 }}>Filter by Period</h3>
          
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="period"
                value="monthly"
                checked={periodType === "monthly"}
                onChange={(e) => setPeriodType(e.target.value as PeriodType)}
              />
              <span>Current Month</span>
            </label>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="period"
                value="quarterly"
                checked={periodType === "quarterly"}
                onChange={(e) => setPeriodType(e.target.value as PeriodType)}
              />
              <span>Current Quarter</span>
            </label>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="period"
                value="yearly"
                checked={periodType === "yearly"}
                onChange={(e) => setPeriodType(e.target.value as PeriodType)}
              />
              <span>Current Financial Year</span>
            </label>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="period"
                value="custom"
                checked={periodType === "custom"}
                onChange={(e) => setPeriodType(e.target.value as PeriodType)}
              />
              <span>Custom Range</span>
            </label>
          </div>
          
          {periodType === "custom" && (
            <>
              {/* Quick Filters */}
              <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #e5e7eb' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                  Quick Select
                </label>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Month Selector */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#6b7280' }}>
                      Month
                    </label>
                    <select
                      onChange={(e) => e.target.value && applyQuickFilter('month', e.target.value)}
                      style={{
                        padding: '6px 10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '13px',
                        backgroundColor: 'white',
                        cursor: 'pointer'
                      }}
                      defaultValue=""
                    >
                      <option value="">Select month...</option>
                      {(() => {
                        const today = new Date();
                        const currentYear = today.getFullYear();
                        const months = [];
                        for (let i = 0; i < 12; i++) {
                          const month = new Date(currentYear, today.getMonth() - i, 1);
                          const value = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
                          const label = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                          months.push(<option key={value} value={value}>{label}</option>);
                        }
                        return months;
                      })()}
                    </select>
                  </div>

                  {/* Quarter Selector */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#6b7280' }}>
                      Quarter (FY)
                    </label>
                    <select
                      onChange={(e) => e.target.value && applyQuickFilter('quarter', e.target.value)}
                      style={{
                        padding: '6px 10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '13px',
                        backgroundColor: 'white',
                        cursor: 'pointer'
                      }}
                      defaultValue=""
                    >
                      <option value="">Select quarter...</option>
                      <option value="1">Q1 (Apr-Jun)</option>
                      <option value="2">Q2 (Jul-Sep)</option>
                      <option value="3">Q3 (Oct-Dec)</option>
                      <option value="4">Q4 (Jan-Mar)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Manual Date Inputs */}
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 500 }}>
                    Start Date
                  </label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  style={{
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 500 }}>
                  End Date
                </label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  style={{
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>
              </div>
            </>
          )}
          
          {!isCustomDateValid && (
            <div style={{ 
              padding: '8px 12px', 
              backgroundColor: '#fef2f2', 
              border: '1px solid #fecaca',
              borderRadius: '6px',
              marginBottom: '16px',
              color: '#991b1b',
              fontSize: '13px'
            }}>
              Please enter valid start and end dates. Start date must be before end date.
            </div>
          )}
          
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleApplyFilters}
              disabled={isLoading}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.6 : 1
              }}
            >
              {isLoading ? 'Loading...' : 'Apply Filters'}
            </button>
            
            <button
              onClick={handleReset}
              style={{
                padding: '8px 16px',
                backgroundColor: 'white',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Reset
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e5e7eb', marginBottom: '24px' }}>
          <button
            onClick={() => setActiveTab("b2c")}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderBottom: activeTab === "b2c" ? '2px solid #2563eb' : '2px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === "b2c" ? '#2563eb' : '#6b7280',
              fontWeight: activeTab === "b2c" ? 600 : 400,
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            GSTR-1 B2C (Others)
          </button>
          
          <button
            onClick={() => setActiveTab("hsn")}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderBottom: activeTab === "hsn" ? '2px solid #2563eb' : '2px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === "hsn" ? '#2563eb' : '#6b7280',
              fontWeight: activeTab === "hsn" ? 600 : 400,
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            HSN Summary
          </button>
        </div>

        {/* Error Message */}
        {hasError && (
          <div style={{ 
            padding: '12px 16px', 
            backgroundColor: '#fef2f2', 
            border: '1px solid #fecaca',
            borderRadius: '8px',
            marginBottom: '24px',
            color: '#991b1b'
          }}>
            {(b2cFetcher.data as any)?.error || 'Failed to load report data'}
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
            Loading report data...
          </div>
        )}

        {/* B2C Report */}
        {!isLoading && !hasError && activeTab === "b2c" && b2cFetcher.data && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                {b2cFetcher.data.period}
              </h3>
              <button
                onClick={() => exportToCSV("b2c")}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Export to CSV
              </button>
            </div>
            
            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb' }}>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>Place of Supply</th>
                    <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>Rate (%)</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>Quantity</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>Taxable Value</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>Integrated Tax</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>Central Tax</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>State Tax</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>Cess</th>
                  </tr>
                </thead>
                <tbody>
                  {b2cFetcher.data.data.map((row, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '12px' }}>
                        {row.placeOfSupply}
                        {row.placeOfSupplyCode && <span style={{ color: '#6b7280', marginLeft: '4px' }}>({row.placeOfSupplyCode})</span>}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>{row.rate}%</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{row.totalQuantity}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(row.totalTaxableValue)}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(row.integratedTax)}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(row.centralTax)}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(row.stateTax)}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(row.cess)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#f9fafb', fontWeight: 600 }}>
                    <td style={{ padding: '12px' }} colSpan={2}>Total</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{b2cFetcher.data.totals.totalQuantity || 0}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(b2cFetcher.data.totals.taxableValue || 0)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(b2cFetcher.data.totals.integratedTax)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(b2cFetcher.data.totals.centralTax)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(b2cFetcher.data.totals.stateTax)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(b2cFetcher.data.totals.cess)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            
            {b2cFetcher.data.data.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                No data available for the selected period.
              </div>
            )}
          </>
        )}

        {/* HSN Report */}
        {!isLoading && !hasError && activeTab === "hsn" && hsnFetcher.data && (
          <>
            {/* HSN Setup Disclaimer */}
            <div style={{ 
              padding: '12px 16px', 
              backgroundColor: '#eff6ff', 
              border: '1px solid #bfdbfe',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '13px',
              color: '#1e40af'
            }}>
              💡 <strong>Tip:</strong> For accurate HSN codes in your reports, configure HSN/SAC codes for your products, refer{' '}
              <Link to="/app/settings/setup-guide" style={{ color: '#2563eb', textDecoration: 'underline', fontWeight: 500 }}>
                Settings → HSN Setup
              </Link>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                {hsnFetcher.data.period}
              </h3>
              <button
                onClick={() => exportToCSV("hsn")}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Export to CSV
              </button>
            </div>
            
            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb' }}>
                    <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>Sr. No</th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>HSN</th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>Description</th>
                    <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>UQC</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>Quantity</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>Taxable Value</th>
                    <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>Rate (%)</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>IGST</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>CGST</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>SGST</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>Cess</th>
                  </tr>
                </thead>
                <tbody>
                  {hsnFetcher.data.data.map((row) => (
                    <tr key={row.srNo} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '12px', textAlign: 'center' }}>{row.srNo}</td>
                      <td style={{ padding: '12px', fontWeight: 500 }}>{row.hsn}</td>
                      <td style={{ padding: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.description || row.hsnDescription || '-'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>{row.uqc}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{row.totalQuantity}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(row.totalTaxableValue)}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>{row.rate}%</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(row.integratedTax)}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(row.centralTax)}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(row.stateTax)}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(row.cess)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#f9fafb', fontWeight: 600 }}>
                    <td style={{ padding: '12px' }} colSpan={4}>Total</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{hsnFetcher.data.totals.totalQuantity || 0}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(hsnFetcher.data.totals.totalTaxableValue || 0)}</td>
                    <td style={{ padding: '12px' }}></td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(hsnFetcher.data.totals.integratedTax)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(hsnFetcher.data.totals.centralTax)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(hsnFetcher.data.totals.stateTax)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(hsnFetcher.data.totals.cess)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            
            {hsnFetcher.data.data.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                No data available for the selected period.
              </div>
            )}
          </>
        )}
      </s-section>
    </s-page>
  );
}
