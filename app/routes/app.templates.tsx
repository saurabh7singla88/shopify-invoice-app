import { useEffect, useState, useCallback, useRef } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSearchParams, Link, Outlet } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  
  // Fetch available templates from the generator system
  const templates = [
    {
      id: "minimalist",
      name: "Minimalist",
      description: "Clean, professional design with GST compliance and configurable colors. Supports both intrastate (CGST/SGST) and interstate (IGST) transactions.",
      previewImage: "/templates/minimalist-preview.svg",
      isConfigurable: true,
      configurations: {
        primaryColor: {
          type: "color",
          label: "Primary Color",
          default: "#333333",
          envVar: "INVOICE_PRIMARY_COLOR"
        },
        fontFamily: {
          type: "select",
          label: "Font Family",
          default: "Helvetica",
          options: ["Helvetica", "Courier", "Times-Roman"],
          envVar: "INVOICE_FONT_FAMILY"
        },
        titleFontSize: {
          type: "number",
          label: "Title Font Size",
          default: 28,
          min: 20,
          max: 40,
          envVar: "INVOICE_TITLE_FONT_SIZE"
        },
        headingFontSize: {
          type: "number",
          label: "Heading Font Size",
          default: 16,
          min: 12,
          max: 24,
          envVar: "INVOICE_HEADING_FONT_SIZE"
        },
        bodyFontSize: {
          type: "number",
          label: "Body Font Size",
          default: 11,
          min: 8,
          max: 16,
          envVar: "INVOICE_BODY_FONT_SIZE"
        }
      }
    }
  ];
  
  // For now, return hardcoded selected template
  // In production, this would fetch from database
  const selectedTemplate = "minimalist";
  
  return { selectedTemplate, templates };
};

export default function Templates() {
  const { selectedTemplate, templates } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("templates");
  const linkRef = useRef<HTMLAnchorElement>(null);

  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Build URL with preserved query params (host, shop, etc.)
  const buildUrl = (path: string) => {
    const params = new URLSearchParams();
    // Preserve Shopify embedded app params
    if (searchParams.get('host')) params.set('host', searchParams.get('host')!);
    if (searchParams.get('shop')) params.set('shop', searchParams.get('shop')!);
    if (searchParams.get('embedded')) params.set('embedded', searchParams.get('embedded')!);
    
    const queryString = params.toString();
    return queryString ? `${path}${path.includes('?') ? '&' : '?'}${queryString}` : path;
  };

  const selectedTemplateData = templates.find(t => t.id === selectedTemplate);
  const availableTemplates = templates.filter(t => t.id !== selectedTemplate);

  return (
    <s-page heading="Templates">
      <s-section>
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e5e7eb', marginBottom: '24px' }}>
          <button
            onClick={() => setActiveTab("templates")}
            style={{
              padding: '12px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === "templates" ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === "templates" ? '#2563eb' : '#6b7280',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Templates
          </button>
        </div>

        {/* Selected Template */}
        {selectedTemplateData && (
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Selected invoice template</h2>
            <div style={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '24px',
              display: 'flex',
              gap: '24px',
              alignItems: 'flex-start'
            }}>
              <div style={{
                width: '400px',
                height: '520px',
                backgroundColor: '#f3f4f6',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                {selectedTemplateData.previewImage ? (
                  <img 
                    src={selectedTemplateData.previewImage} 
                    alt={`${selectedTemplateData.name} Preview`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#9ca3af',
                    fontSize: '14px'
                  }}>
                    Template Preview
                  </div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px' }}>{selectedTemplateData.name}</h3>
                <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px', lineHeight: '1.6' }}>
                  {selectedTemplateData.description}
                </p>
                
                {/* Configuration Options */}
                {selectedTemplateData.isConfigurable && selectedTemplateData.configurations && (
                  <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#374151' }}>Configuration Options:</h4>
                    <ul style={{ fontSize: '13px', color: '#6b7280', marginLeft: '20px', lineHeight: '1.8' }}>
                      {Object.entries(selectedTemplateData.configurations).map(([key, config]: [string, any]) => (
                        <li key={key}>
                          <strong>{config.label}:</strong> {config.type === 'color' ? 'Color picker' : config.type === 'select' ? `Options: ${config.options?.join(', ')}` : `Range: ${config.min}-${config.max}`}
                          {config.default && <span style={{ color: '#9ca3af' }}> (default: {config.default})</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <s-button
                  href={buildUrl(`/app/templates-customize?template=${selectedTemplateData.id}`)}
                  variant="primary"
                >
                  Customize
                </s-button>

              </div>
            </div>
          </div>
        )}

        {/* Available Templates */}
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Available Templates</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
            {availableTemplates.map((template) => (
              <div
                key={template.id}
                style={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{
                  width: '100%',
                  height: '280px',
                  backgroundColor: '#f3f4f6',
                  overflow: 'hidden'
                }}>
                  {template.previewImage ? (
                    <img 
                      src={template.previewImage} 
                      alt={`${template.name} Preview`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#9ca3af',
                      fontSize: '14px'
                    }}>
                      Template Preview
                    </div>
                  )}
                </div>
                <div style={{ padding: '16px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>{template.name}</h3>
                  <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px', lineHeight: '1.5' }}>
                    {template.description}
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Handle template selection
                      alert(`Selected template: ${template.name}`);
                    }}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: 'white',
                      color: '#1f2937',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      width: '100%',
                    }}
                  >
                    Select Template
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers = boundary.headers;
