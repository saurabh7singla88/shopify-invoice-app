import { useState, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams, Form, useNavigation, useNavigate, useActionData } from "react-router";
import { authenticate } from "../shopify.server";
import { saveTemplateConfiguration, getTemplateConfiguration } from "../services/dynamodb.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  
  // Get template ID from URL params
  const url = new URL(request.url);
  const templateId = url.searchParams.get("template") || "minimalist";
  
  // Try to load existing configuration from DynamoDB
  let existingConfig = null;
  try {
    existingConfig = await getTemplateConfiguration(shop, templateId);
  } catch (error) {
    console.error("Error loading template config:", error);
  }
  
  // Template-specific defaults
  const templateDefaults = {
    minimalist: {
      primaryColor: "#333333",
      documentHeaderBgColor: "#333333",
      tableHeaderBgColor: "#333333",
      headerTextColor: "#ffffff",
      titleFontSize: 28,
      headingFontSize: 16,
      bodyFontSize: 11,
      itemTableFontSize: 8,
    },
    zen: {
      primaryColor: "#6366f1",
      documentHeaderBgColor: "#6366f1",
      tableHeaderBgColor: "#6366f1",
      headerTextColor: "#ffffff",
      titleFontSize: 32,
      headingFontSize: 18,
      bodyFontSize: 11,
      itemTableFontSize: 8,
    }
  };
  
  const defaults = templateDefaults[templateId as keyof typeof templateDefaults] || templateDefaults.minimalist;
  
  // Configuration based on lambda-generate-invoice .env structure
  const configuration = {
    // Fonts and Colors
    styling: {
      primaryColor: { label: "Primary Color", type: "color", default: existingConfig?.styling?.primaryColor || defaults.primaryColor, envVar: "INVOICE_PRIMARY_COLOR" },
      documentHeaderBgColor: { label: "Document Header Background", type: "color", default: existingConfig?.styling?.documentHeaderBgColor || defaults.documentHeaderBgColor, envVar: "INVOICE_DOCUMENT_HEADER_BG_COLOR" },
      tableHeaderBgColor: { label: "Table Header Background", type: "color", default: existingConfig?.styling?.tableHeaderBgColor || defaults.tableHeaderBgColor, envVar: "INVOICE_TABLE_HEADER_BG_COLOR" },
      headerTextColor: { label: "Header Text Color", type: "color", default: existingConfig?.styling?.headerTextColor || defaults.headerTextColor, envVar: "INVOICE_HEADER_TEXT_COLOR" },
      fontFamily: { label: "Font Family", type: "select", default: existingConfig?.styling?.fontFamily || "Helvetica", options: ["Helvetica", "Courier", "Times-Roman"], envVar: "INVOICE_FONT_FAMILY" },
      titleFontSize: { label: "Title Font Size", type: "number", default: existingConfig?.styling?.titleFontSize || defaults.titleFontSize, min: 20, max: 40, envVar: "INVOICE_TITLE_FONT_SIZE" },
      headingFontSize: { label: "Heading Font Size", type: "number", default: existingConfig?.styling?.headingFontSize || defaults.headingFontSize, min: 12, max: 24, envVar: "INVOICE_HEADING_FONT_SIZE" },
      bodyFontSize: { label: "Body Font Size", type: "number", default: existingConfig?.styling?.bodyFontSize || defaults.bodyFontSize, min: 8, max: 16, envVar: "INVOICE_BODY_FONT_SIZE" },
      itemTableFontSize: { label: "Item Table Font Size", type: "number", default: existingConfig?.styling?.itemTableFontSize || defaults.itemTableFontSize, min: 6, max: 12, envVar: "INVOICE_TABLE_FONT_SIZE" },
    },
  };
  
  return { shop, templateId, configuration };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  
  const formData = await request.formData();
  const templateId = formData.get("templateId") as string || "minimalist";
  
  // Template-specific defaults
  const templateDefaults = {
    minimalist: {
      primaryColor: "#333333",
      tableHeaderBgColor: "#333333",
      headerTextColor: "#ffffff",
      titleFontSize: 28,
      headingFontSize: 16,
      bodyFontSize: 11,
      itemTableFontSize: 8,
    },
    zen: {
      primaryColor: "#6366f1",
      documentHeaderBgColor: "#6366f1",
      tableHeaderBgColor: "#6366f1",
      headerTextColor: "#ffffff",
      titleFontSize: 32,
      headingFontSize: 18,
      bodyFontSize: 11,
      itemTableFontSize: 8,
    }
  };
  
  const defaults = templateDefaults[templateId as keyof typeof templateDefaults] || templateDefaults.minimalist;
  
  // Get existing configuration first to preserve values not in current form
  let existingConfig = await getTemplateConfiguration(shop, templateId);
  if (!existingConfig) {
    existingConfig = { styling: {}, company: {} };
  }
  
  // Helper to get form value or fallback to existing/default
  const getFormValue = (key: string, fallback: any) => {
    const value = formData.get(key);
    if (value === null || value === undefined) return fallback;
    const strValue = value as string;
    return strValue.trim() === "" ? fallback : strValue;
  };
  
  // Parse form data into configuration structure - only update fields that are present
  const styling: any = {
    primaryColor: getFormValue("styling.primaryColor", existingConfig.styling?.primaryColor || defaults.primaryColor),
    tableHeaderBgColor: getFormValue("styling.tableHeaderBgColor", existingConfig.styling?.tableHeaderBgColor || defaults.tableHeaderBgColor),
    headerTextColor: getFormValue("styling.headerTextColor", existingConfig.styling?.headerTextColor || defaults.headerTextColor),
    fontFamily: getFormValue("styling.fontFamily", existingConfig.styling?.fontFamily || "Helvetica"),
    titleFontSize: formData.get("styling.titleFontSize") ? parseInt(formData.get("styling.titleFontSize") as string) : (existingConfig.styling?.titleFontSize || defaults.titleFontSize),
    headingFontSize: formData.get("styling.headingFontSize") ? parseInt(formData.get("styling.headingFontSize") as string) : (existingConfig.styling?.headingFontSize || defaults.headingFontSize),
    bodyFontSize: formData.get("styling.bodyFontSize") ? parseInt(formData.get("styling.bodyFontSize") as string) : (existingConfig.styling?.bodyFontSize || defaults.bodyFontSize),
    itemTableFontSize: formData.get("styling.itemTableFontSize") ? parseInt(formData.get("styling.itemTableFontSize") as string) : (existingConfig.styling?.itemTableFontSize || defaults.itemTableFontSize),
  };
  
  // Only add documentHeaderBgColor for templates that use it (zen)
  if (templateId !== 'minimalist') {
    styling.documentHeaderBgColor = getFormValue("styling.documentHeaderBgColor", existingConfig.styling?.documentHeaderBgColor || defaults.documentHeaderBgColor);
  }
  
  // Keep existing company details unchanged (now stored in Shops table)
  const company = existingConfig.company || {};
  
  try {
    await saveTemplateConfiguration(shop, templateId, { styling, company });
    console.log(`✅ Configuration saved for shop: ${shop}, template: ${templateId}`);
    return { success: true, message: "Template styling saved successfully" };
  } catch (error) {
    console.error("Error saving configuration:", error);
    return { success: false, error: "Failed to save configuration" };
  }
};

export default function CustomizeTemplate() {
  const { shop, templateId, configuration } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("styling");
  const [showNotification, setShowNotification] = useState(false);
  
  // Live preview state - track all styling values
  const [livePreview, setLivePreview] = useState({
    primaryColor: configuration.styling.primaryColor.default,
    documentHeaderBgColor: configuration.styling.documentHeaderBgColor.default,
    tableHeaderBgColor: configuration.styling.tableHeaderBgColor.default,
    headerTextColor: configuration.styling.headerTextColor.default,
    fontFamily: configuration.styling.fontFamily.default,
    titleFontSize: configuration.styling.titleFontSize.default,
    headingFontSize: configuration.styling.headingFontSize.default,
    bodyFontSize: configuration.styling.bodyFontSize.default,
    itemTableFontSize: configuration.styling.itemTableFontSize.default,
  });
  
  // Update live preview when input changes
  const handlePreviewChange = (key: string, value: string | number) => {
    setLivePreview(prev => ({ ...prev, [key]: value }));
  };
  
  // Show notification after successful save
  useEffect(() => {
    if (actionData?.success) {
      setShowNotification(true);
      const timer = setTimeout(() => setShowNotification(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionData]);
  
  const sections = [
    { id: "styling", label: "Fonts and Colors", icon: "🎨" },
  ];

  const isSubmitting = navigation.state === "submitting";
  
  // SVG Preview Component
  const InvoicePreview = () => {
    const fontFamilyMap: { [key: string]: string } = {
      'Helvetica': 'Arial, sans-serif',
      'Courier': 'Courier New, monospace',
      'Times-Roman': 'Times New Roman, serif'
    };
    
    const currentFont = fontFamilyMap[livePreview.fontFamily as string] || 'Arial, sans-serif';
    
    // Render different preview based on template
    if (templateId === 'zen') {
      return renderZenPreview(currentFont);
    } else {
      return renderMinimalistPreview(currentFont);
    }
  };
  
  // Zen Template Preview
  const renderZenPreview = (currentFont: string) => {
    return (
      <div style={{ 
        width: '100%',
        maxWidth: '600px',
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '16px'
      }}>
        <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>Live Preview - Zen Template</h3>
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
            Changes update in real-time
          </p>
        </div>
        
        <svg viewBox="0 0 595 842" style={{ width: '100%', height: 'auto', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
          {/* Colorful gradient header bar */}
          <rect x="0" y="0" width="595" height="140" fill={livePreview.documentHeaderBgColor as string} />
          
          {/* Decorative accent bar at bottom of header */}
          <rect x="0" y="136" width="595" height="4" fill={livePreview.primaryColor as string} />
          
          {/* Company name in white on gradient */}
          <text 
            x="50" 
            y="45" 
            fill={livePreview.headerTextColor as string}
            fontSize={livePreview.titleFontSize}
            fontFamily={currentFont}
            fontWeight="bold"
          >
            Your Company Name
          </text>
          <text 
            x="50" 
            y="70" 
            fill="rgba(255, 255, 255, 0.95)"
            fontSize={livePreview.bodyFontSize}
            fontFamily={currentFont}
          >
            123 Business Street
          </text>
          <text 
            x="50" 
            y="85" 
            fill="rgba(255, 255, 255, 0.95)"
            fontSize={livePreview.bodyFontSize}
            fontFamily={currentFont}
          >
            City, State 123456
          </text>
          <text 
            x="50" 
            y="100" 
            fill="rgba(255, 255, 255, 0.9)"
            fontSize={livePreview.bodyFontSize}
            fontFamily={currentFont}
          >
            GSTIN: 29ABCDE1234F1Z5
          </text>
          
          {/* INVOICE label with colored background box */}
          <rect x="410" y="25" width="135" height="35" fill={livePreview.primaryColor as string} rx="4" />
          <text 
            x="477" 
            y="49" 
            fill="#ffffff"
            fontSize="20"
            fontFamily={currentFont}
            fontWeight="bold"
            textAnchor="middle"
          >
            INVOICE
          </text>
          
          {/* Invoice details section */}
          <text 
            x="50" 
            y="175" 
            fill={livePreview.primaryColor as string}
            fontSize={livePreview.bodyFontSize}
            fontFamily={currentFont}
            fontWeight="bold"
          >
            Invoice Number:
          </text>
          <text 
            x="50" 
            y="190" 
            fill="#111827"
            fontSize={livePreview.bodyFontSize}
            fontFamily={currentFont}
          >
            INV-2024-001
          </text>
          
          <text 
            x="50" 
            y="210" 
            fill={livePreview.primaryColor as string}
            fontSize={livePreview.bodyFontSize}
            fontFamily={currentFont}
            fontWeight="bold"
          >
            Invoice Date:
          </text>
          <text 
            x="50" 
            y="225" 
            fill="#111827"
            fontSize={livePreview.bodyFontSize}
            fontFamily={currentFont}
          >
            Feb 15, 2026
          </text>
          
          {/* Customer details box with subtle background */}
          <rect x="300" y="165" width="245" height="95" fill="#f9fafb" stroke="#e5e7eb" strokeWidth="1" rx="4" />
          <text 
            x="310" 
            y="182" 
            fill={livePreview.primaryColor as string}
            fontSize={Number(livePreview.bodyFontSize) + 1}
            fontFamily={currentFont}
            fontWeight="bold"
          >
            Bill To:
          </text>
          <text 
            x="310" 
            y="200" 
            fill="#111827"
            fontSize={livePreview.bodyFontSize}
            fontFamily={currentFont}
            fontWeight="bold"
          >
            Customer Name
          </text>
          <text 
            x="310" 
            y="215" 
            fill="#374151"
            fontSize={Number(livePreview.bodyFontSize) - 1}
            fontFamily={currentFont}
          >
            456 Customer Ave
          </text>
          <text 
            x="310" 
            y="230" 
            fill="#374151"
            fontSize={Number(livePreview.bodyFontSize) - 1}
            fontFamily={currentFont}
          >
            City, State 12345
          </text>
          <text 
            x="310" 
            y="245" 
            fill="#374151"
            fontSize={Number(livePreview.bodyFontSize) - 1}
            fontFamily={currentFont}
          >
            Phone: +91 9876543210
          </text>
          
          {/* Section heading with decorative line */}
          <text 
            x="50" 
            y="290" 
            fill={livePreview.primaryColor as string}
            fontSize={livePreview.headingFontSize}
            fontFamily={currentFont}
            fontWeight="bold"
          >
            Order Items
          </text>
          <line x1="50" y1="305" x2="545" y2="305" stroke={livePreview.primaryColor as string} strokeWidth="2" />
          
          {/* Line Items Header with rounded corners */}
          <rect x="50" y="320" width="495" height="35" fill={livePreview.tableHeaderBgColor as string} rx="4" />
          <text 
            x="55" 
            y="342" 
            fill={livePreview.headerTextColor as string}
            fontSize={livePreview.itemTableFontSize}
            fontFamily={currentFont}
            fontWeight="bold"
          >
            ITEM
          </text>
          <text 
            x="160" 
            y="342" 
            fill={livePreview.headerTextColor as string}
            fontSize={livePreview.itemTableFontSize}
            fontFamily={currentFont}
            fontWeight="bold"
            textAnchor="middle"
          >
            QTY
          </text>
          <text 
            x="223" 
            y="342" 
            fill={livePreview.headerTextColor as string}
            fontSize={livePreview.itemTableFontSize}
            fontFamily={currentFont}
            fontWeight="bold"
            textAnchor="end"
          >
            RATE
          </text>
          <text 
            x="323" 
            y="342" 
            fill={livePreview.headerTextColor as string}
            fontSize={livePreview.itemTableFontSize}
            fontFamily={currentFont}
            fontWeight="bold"
            textAnchor="end"
          >
            TAX
          </text>
          <text 
            x="535" 
            y="342" 
            fill={livePreview.headerTextColor as string}
            fontSize={livePreview.itemTableFontSize}
            fontFamily={currentFont}
            fontWeight="bold"
            textAnchor="end"
          >
            AMOUNT
          </text>
          
          {/* Sample Line Items with alternating background */}
          <rect x="50" y="355" width="495" height="40" fill="#faf5ff" />
          <text x="55" y="378" fill="#111827" fontSize={Number(livePreview.itemTableFontSize) - 0.5} fontFamily={currentFont}>
            Premium Product
          </text>
          <text x="160" y="378" fill="#111827" fontSize={Number(livePreview.itemTableFontSize) - 0.5} fontFamily={currentFont} textAnchor="middle">
            2
          </text>
          <text x="223" y="378" fill="#111827" fontSize={Number(livePreview.itemTableFontSize) - 0.5} fontFamily={currentFont} textAnchor="end">
            ₹1,000
          </text>
          <text x="323" y="378" fill="#111827" fontSize={Number(livePreview.itemTableFontSize) - 0.5} fontFamily={currentFont} textAnchor="end">
            ₹360
          </text>
          <text x="535" y="378" fill="#111827" fontSize={Number(livePreview.itemTableFontSize) - 0.5} fontFamily={currentFont} textAnchor="end">
            ₹2,360
          </text>
          
          <text x="55" y="418" fill="#111827" fontSize={Number(livePreview.itemTableFontSize) - 0.5} fontFamily={currentFont}>
            Standard Service
          </text>
          <text x="160" y="418" fill="#111827" fontSize={Number(livePreview.itemTableFontSize) - 0.5} fontFamily={currentFont} textAnchor="middle">
            1
          </text>
          <text x="223" y="418" fill="#111827" fontSize={Number(livePreview.itemTableFontSize) - 0.5} fontFamily={currentFont} textAnchor="end">
            ₹500
          </text>
          <text x="323" y="418" fill="#111827" fontSize={Number(livePreview.itemTableFontSize) - 0.5} fontFamily={currentFont} textAnchor="end">
            ₹90
          </text>
          <text x="535" y="418" fill="#111827" fontSize={Number(livePreview.itemTableFontSize) - 0.5} fontFamily={currentFont} textAnchor="end">
            ₹590
          </text>
          
          {/* Divider */}
          <line x1="50" y1="445" x2="545" y2="445" stroke="#e5e7eb" strokeWidth="1" />
          
          {/* Totals Section with colorful box */}
          <rect x="380" y="465" width="165" height="110" fill="#f9fafb" stroke="#e5e7eb" strokeWidth="1" rx="4" />
          
          <text x="390" y="485" fill="#6b7280" fontSize={livePreview.bodyFontSize} fontFamily={currentFont}>
            Subtotal:
          </text>
          <text x="535" y="485" fill="#111827" fontSize={livePreview.bodyFontSize} fontFamily={currentFont} textAnchor="end">
            ₹2,500
          </text>
          
          <text x="390" y="505" fill="#6b7280" fontSize={livePreview.bodyFontSize} fontFamily={currentFont}>
            CGST (9%):
          </text>
          <text x="535" y="505" fill="#111827" fontSize={livePreview.bodyFontSize} fontFamily={currentFont} textAnchor="end">
            ₹225
          </text>
          
          <text x="390" y="525" fill="#6b7280" fontSize={livePreview.bodyFontSize} fontFamily={currentFont}>
            SGST (9%):
          </text>
          <text x="535" y="525" fill="#111827" fontSize={livePreview.bodyFontSize} fontFamily={currentFont} textAnchor="end">
            ₹225
          </text>
          
          {/* Total with vibrant colored background */}
          <rect x="380" y="540" width="165" height="35" fill={livePreview.tableHeaderBgColor as string} rx="4" />
          <text 
            x="390" 
            y="563" 
            fill={livePreview.headerTextColor as string}
            fontSize={livePreview.headingFontSize}
            fontFamily={currentFont}
            fontWeight="bold"
          >
            Total:
          </text>
          <text 
            x="535" 
            y="563" 
            fill={livePreview.headerTextColor as string}
            fontSize={livePreview.headingFontSize}
            fontFamily={currentFont}
            fontWeight="bold"
            textAnchor="end"
          >
            ₹2,950
          </text>
          
          {/* Footer Note with decorative element */}
          <line x1="50" y1="610" x2="150" y2="610" stroke={livePreview.primaryColor as string} strokeWidth="2" />
          <text x="50" y="635" fill="#9ca3af" fontSize={Number(livePreview.bodyFontSize) - 1} fontFamily={currentFont}>
            Thank you for your business!
          </text>
        </svg>
      </div>
    );
  };
  
  // Minimalist Template Preview
  const renderMinimalistPreview = (currentFont: string) => {
    return (
      <div style={{ 
        width: '100%',
        maxWidth: '600px',
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '16px'
      }}>
        <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>Live Preview - Minimalist Template</h3>
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
            Changes update in real-time
          </p>
        </div>
        
        <svg viewBox="0 0 595 842" style={{ width: '100%', height: 'auto', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
          {/* Company Header - No colored background, just text */}
          <text 
            x="50" 
            y="70" 
            fill={livePreview.primaryColor as string}
            fontSize={livePreview.titleFontSize}
            fontFamily={currentFont}
            fontWeight="normal"
          >
            Your Company Name
          </text>
          
          <text 
            x="50" 
            y="95" 
            fill="#6b7280"
            fontSize={livePreview.bodyFontSize}
            fontFamily={currentFont}
          >
            Legal Entity Name
          </text>
          <text 
            x="50" 
            y="110" 
            fill="#6b7280"
            fontSize={livePreview.bodyFontSize}
            fontFamily={currentFont}
          >
            123 Business Street
          </text>
          <text 
            x="50" 
            y="125" 
            fill="#6b7280"
            fontSize={livePreview.bodyFontSize}
            fontFamily={currentFont}
          >
            City, State 123456
          </text>
          <text 
            x="50" 
            y="140" 
            fill="#6b7280"
            fontSize={livePreview.bodyFontSize}
            fontFamily={currentFont}
          >
            GSTIN: 29ABCDE1234F1Z5
          </text>
          
          {/* Horizontal divider line */}
          <line x1="50" y1="165" x2="545" y2="165" stroke="#e5e7eb" strokeWidth="1" />
          
          {/* Order Details and Shipping Address */}
          <text 
            x="50" 
            y="200" 
            fill={livePreview.primaryColor as string}
            fontSize={livePreview.headingFontSize}
            fontFamily={currentFont}
          >
            Order Details
          </text>
          <text 
            x="545" 
            y="200" 
            fill={livePreview.primaryColor as string}
            fontSize={livePreview.headingFontSize}
            fontFamily={currentFont}
            textAnchor="end"
          >
            Shipping Address
          </text>
          
          <text x="50" y="220" fill="#6b7280" fontSize={livePreview.bodyFontSize} fontFamily={currentFont}>
            Order Number:
          </text>
          <text x="145" y="220" fill="#111827" fontSize={livePreview.bodyFontSize} fontFamily={currentFont}>
            #1001
          </text>
          <text x="545" y="220" fill="#111827" fontSize={livePreview.bodyFontSize} fontFamily={currentFont} textAnchor="end">
            Customer Name
          </text>
          
          <text x="50" y="238" fill="#6b7280" fontSize={livePreview.bodyFontSize} fontFamily={currentFont}>
            Order Date:
          </text>
          <text x="125" y="238" fill="#111827" fontSize={livePreview.bodyFontSize} fontFamily={currentFont}>
            Feb 15, 2026
          </text>
          <text x="545" y="238" fill="#111827" fontSize={livePreview.bodyFontSize} fontFamily={currentFont} textAnchor="end">
            456 Customer Ave
          </text>
          
          <text x="545" y="255" fill="#111827" fontSize={livePreview.bodyFontSize} fontFamily={currentFont} textAnchor="end">
            City, State 12345
          </text>
          
          {/* Items Section Heading */}
          <text 
            x="50" 
            y="295" 
            fill={livePreview.primaryColor as string}
            fontSize={livePreview.headingFontSize}
            fontFamily={currentFont}
          >
            Items
          </text>
          
          {/* Line Items Table Header */}
          <rect x="50" y="315" width="495" height="35" fill={livePreview.tableHeaderBgColor as string} />
          <text 
            x="55" 
            y="337" 
            fill={livePreview.headerTextColor as string}
            fontSize={livePreview.itemTableFontSize}
            fontFamily={currentFont}
            fontWeight="bold"
          >
            ITEM
          </text>
          <text 
            x="160" 
            y="337" 
            fill={livePreview.headerTextColor as string}
            fontSize={livePreview.itemTableFontSize}
            fontFamily={currentFont}
            fontWeight="bold"
            textAnchor="middle"
          >
            QTY
          </text>
          <text 
            x="223" 
            y="337" 
            fill={livePreview.headerTextColor as string}
            fontSize={livePreview.itemTableFontSize}
            fontFamily={currentFont}
            fontWeight="bold"
            textAnchor="end"
          >
            RATE
          </text>
          <text 
            x="323" 
            y="337" 
            fill={livePreview.headerTextColor as string}
            fontSize={livePreview.itemTableFontSize}
            fontFamily={currentFont}
            fontWeight="bold"
            textAnchor="end"
          >
            TAX
          </text>
          <text 
            x="535" 
            y="337" 
            fill={livePreview.headerTextColor as string}
            fontSize={livePreview.itemTableFontSize}
            fontFamily={currentFont}
            fontWeight="bold"
            textAnchor="end"
          >
            AMOUNT
          </text>
          
          {/* Sample Line Items */}
          <line x1="50" y1="350" x2="545" y2="350" stroke="#e5e7eb" strokeWidth="0.5" />
          <text x="55" y="373" fill="#111827" fontSize={livePreview.itemTableFontSize} fontFamily={currentFont}>
            Premium Product
          </text>
          <text x="160" y="373" fill="#111827" fontSize={livePreview.itemTableFontSize} fontFamily={currentFont} textAnchor="middle">
            2
          </text>
          <text x="223" y="373" fill="#111827" fontSize={livePreview.itemTableFontSize} fontFamily={currentFont} textAnchor="end">
            ₹1,000
          </text>
          <text x="323" y="373" fill="#111827" fontSize={livePreview.itemTableFontSize} fontFamily={currentFont} textAnchor="end">
            ₹360
          </text>
          <text x="535" y="373" fill="#111827" fontSize={livePreview.itemTableFontSize} fontFamily={currentFont} textAnchor="end">
            ₹2,360
          </text>
          
          <line x1="50" y1="385" x2="545" y2="385" stroke="#e5e7eb" strokeWidth="0.5" />
          <text x="55" y="408" fill="#111827" fontSize={livePreview.itemTableFontSize} fontFamily={currentFont}>
            Standard Service
          </text>
          <text x="160" y="408" fill="#111827" fontSize={livePreview.itemTableFontSize} fontFamily={currentFont} textAnchor="middle">
            1
          </text>
          <text x="223" y="408" fill="#111827" fontSize={livePreview.itemTableFontSize} fontFamily={currentFont} textAnchor="end">
            ₹500
          </text>
          <text x="323" y="408" fill="#111827" fontSize={livePreview.itemTableFontSize} fontFamily={currentFont} textAnchor="end">
            ₹90
          </text>
          <text x="535" y="408" fill="#111827" fontSize={livePreview.itemTableFontSize} fontFamily={currentFont} textAnchor="end">
            ₹590
          </text>
          
          <line x1="50" y1="420" x2="545" y2="420" stroke="#e5e7eb" strokeWidth="0.5" />
          
          {/* Totals Section */}
          <text x="350" y="455" fill="#374151" fontSize={livePreview.bodyFontSize} fontFamily={currentFont}>
            Subtotal:
          </text>
          <text x="535" y="455" fill="#374151" fontSize={livePreview.bodyFontSize} fontFamily={currentFont} textAnchor="end">
            ₹2,500
          </text>
          
          <text x="350" y="475" fill="#374151" fontSize={livePreview.bodyFontSize} fontFamily={currentFont}>
            CGST (9%):
          </text>
          <text x="535" y="475" fill="#374151" fontSize={livePreview.bodyFontSize} fontFamily={currentFont} textAnchor="end">
            ₹225
          </text>
          
          <text x="350" y="495" fill="#374151" fontSize={livePreview.bodyFontSize} fontFamily={currentFont}>
            SGST (9%):
          </text>
          <text x="535" y="495" fill="#374151" fontSize={livePreview.bodyFontSize} fontFamily={currentFont} textAnchor="end">
            ₹225
          </text>
          
          {/* Total with colored background box */}
          <rect x="340" y="510" width="205" height="40" fill={livePreview.tableHeaderBgColor as string} />
          <text 
            x="350" 
            y="537" 
            fill={livePreview.headerTextColor as string}
            fontSize={Number(livePreview.bodyFontSize) + 2}
            fontFamily={currentFont}
            fontWeight="bold"
          >
            TOTAL:
          </text>
          <text 
            x="535" 
            y="537" 
            fill={livePreview.headerTextColor as string}
            fontSize={Number(livePreview.bodyFontSize) + 4}
            fontFamily={currentFont}
            fontWeight="bold"
            textAnchor="end"
          >
            ₹2,950
          </text>
          
          {/* Footer Note */}
          <text x="50" y="590" fill="#9ca3af" fontSize={Number(livePreview.bodyFontSize) - 1} fontFamily={currentFont}>
            Thank you for your business!
          </text>
        </svg>
      </div>
    );
  };

  const renderFormField = (key: string, config: any, section: string) => {
    const fieldName = `${section}.${key}`;
    const commonStyle = {
      padding: '10px 12px',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
      fontSize: '14px',
      width: '100%',
      boxSizing: 'border-box' as const,
    };

    switch (config.type) {
      case "color":
        const colorTextId = `${fieldName}-text`;
        const colorPickerId = `${fieldName}-picker`;
        return (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <input
              type="color"
              id={colorPickerId}
              name={fieldName}
              defaultValue={config.default}
              onChange={(e) => {
                const textInput = document.getElementById(colorTextId) as HTMLInputElement;
                if (textInput) {
                  textInput.value = e.target.value;
                }
                handlePreviewChange(key, e.target.value);
              }}
              style={{
                width: '60px',
                height: '44px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: 'pointer',
                padding: '2px'
              }}
            />
            <input
              type="text"
              id={colorTextId}
              defaultValue={config.default}
              onChange={(e) => {
                const colorInput = document.getElementById(colorPickerId) as HTMLInputElement;
                if (colorInput && /^#[0-9A-F]{6}$/i.test(e.target.value)) {
                  colorInput.value = e.target.value;
                  handlePreviewChange(key, e.target.value);
                }
              }}
              style={{ ...commonStyle, width: '140px' }}
              placeholder="#333333"
            />
          </div>
        );
      
      case "select":
        return (
          <select 
            name={fieldName} 
            defaultValue={config.default} 
            onChange={(e) => handlePreviewChange(key, e.target.value)}
            style={{ ...commonStyle, cursor: 'pointer' }}
          >
            {!config.default && <option value="">Select {config.label}</option>}
            {config.options?.map((option: string) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        );
      
      case "number":
        return (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <input
              type="number"
              name={fieldName}
              defaultValue={config.default}
              min={config.min}
              max={config.max}
              onChange={(e) => handlePreviewChange(key, parseInt(e.target.value) || config.default)}
              style={{ ...commonStyle, width: '100px' }}
            />
            <input
              type="range"
              defaultValue={config.default}
              min={config.min}
              max={config.max}
              onChange={(e) => {
                const numberInput = document.querySelector(`input[name="${fieldName}"]`) as HTMLInputElement;
                if (numberInput) {
                  numberInput.value = e.target.value;
                }
                handlePreviewChange(key, parseInt(e.target.value));
              }}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: '12px', color: '#6b7280', width: '80px' }}>
              {config.min} - {config.max}
            </span>
          </div>
        );

      case "file":
        const isLogo = key === "logoFilename";
        const isSignature = key === "signatureFilename";
        const fileInputName = isLogo ? "logoFile" : isSignature ? "signatureFile" : fieldName;
        
        return (
          <div>
            <div style={{ marginBottom: '8px' }}>
              <input
                type="file"
                name={fileInputName}
                accept="image/*"
                style={{ 
                  ...commonStyle,
                  padding: '8px',
                  cursor: 'pointer'
                }}
              />
            </div>
            {config.default && (
              <p style={{ fontSize: '11px', color: '#10b981', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>✓</span>
                <span>Current: {config.default}</span>
              </p>
            )}
            <p style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>
              Accepted: JPG, PNG, GIF • Max 5MB • Stored in S3
            </p>
          </div>
        );

      case "email":
        return (
          <input
            type="email"
            name={fieldName}
            defaultValue={config.default}
            style={commonStyle}
            placeholder={config.label}
          />
        );
      
      case "checkbox":
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                name={fieldName}
                defaultChecked={config.default}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '12px', color: '#374151' }}>Enable this option</span>
            </div>
            {config.description && (
              <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px', lineHeight: '1.5', backgroundColor: '#f9fafb', padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid #d1d5db' }}>
                {config.description}
              </p>
            )}
          </div>
        );
      
      default:
        return (
          <input
            type="text"
            name={fieldName}
            defaultValue={config.default}
            style={commonStyle}
            placeholder={config.label}
          />
        );
    }
  };

  return (
    <s-page>
      {/* Success/Error Notification */}
      {showNotification && actionData?.success && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: '#10b981',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'slideIn 0.3s ease-out'
        }}>
          <span style={{ fontSize: '18px' }}>✓</span>
          <span>{actionData.message}</span>
        </div>
      )}
      
      {actionData?.error && (
        <div style={{
          backgroundColor: '#fee',
          color: '#c00',
          padding: '12px 24px',
          borderRadius: '8px',
          marginBottom: '16px',
          border: '1px solid #fcc'
        }}>
          ⚠️ {actionData.error}
        </div>
      )}
      
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '16px 0',
        borderBottom: '1px solid #e5e7eb',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <s-link href="/app/templates" style={{ textDecoration: 'none' }}>
            <button
              style={{
                fontSize: '18px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#374151',
                padding: '4px 8px'
              }}
            >
              ←
            </button>
          </s-link>
          <h1 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>Customize Template</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            style={{
              padding: '10px 20px',
              backgroundColor: 'white',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Reset to Defaults
          </button>
          <button
            type="submit"
            form="customize-form"
            disabled={isSubmitting}
            style={{
              padding: '10px 20px',
              backgroundColor: '#1f2937',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ display: 'flex', gap: '24px', minHeight: '600px' }}>
        {/* Left - Configuration Form (25%) */}
        <div style={{ 
          flex: '0 0 25%',
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '24px',
          minWidth: '300px'
        }}>
          <Form method="post" id="customize-form" encType="multipart/form-data">
            <input type="hidden" name="templateId" value={templateId} />
            <input type="hidden" name="section" value={activeSection} />
            
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Fonts and Colors</h3>
              <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
                Customize the visual appearance of your invoices
              </p>
              
              {Object.entries(configuration.styling).map(([key, config]: [string, any]) => {
                // Skip Document Header Background for minimalist template (it doesn't use it)
                if (key === 'documentHeaderBgColor' && templateId === 'minimalist') {
                  return null;
                }
                
                return (
                  <div key={key} style={{ marginBottom: '20px' }}>
                    <label style={{ 
                      display: 'block', 
                      fontSize: '13px', 
                      fontWeight: '500', 
                      marginBottom: '6px',
                      color: '#374151'
                    }}>
                      {config.label}
                    </label>
                    {renderFormField(key, config, "styling")}
                    <p style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>
                      Environment variable: <code style={{ backgroundColor: '#f3f4f6', padding: '1px 4px', borderRadius: '3px', fontSize: '10px' }}>{config.envVar}</code>
                    </p>
                  </div>
                );
              })}
            </div>
          </Form>
        </div>
        
        {/* Right - Live Preview (75%) */}
        <div style={{ flex: '0 0 calc(75% - 24px)', display: 'flex', justifyContent: 'center' }}>
          <InvoicePreview />
        </div>
      </div>
    </s-page>
  );
}
