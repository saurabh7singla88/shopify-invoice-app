import { Outlet, useLocation, useNavigate } from "react-router";
import { useEffect, useState } from "react";

export default function Settings() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("setup-guide");

  // Redirect to setup-guide by default
  useEffect(() => {
    if (location.pathname === "/app/settings" || location.pathname === "/app/settings/") {
      navigate("/app/settings/setup-guide", { replace: true });
    }
  }, [location.pathname, navigate]);

  // Determine active section from URL
  useEffect(() => {
    if (location.pathname.includes("setup-guide")) setActiveSection("setup-guide");
    else if (location.pathname.includes("tax-config")) setActiveSection("tax-config");
  }, [location.pathname]);

  const sections = [
    { id: "setup-guide", label: "Setup Guide", icon: "📋", path: "/app/settings/setup-guide" },
    { id: "tax-config", label: "Tax Configuration", icon: "🧮", path: "/app/settings/tax-config" },
  ];

  return (
    <s-page>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 0',
        borderBottom: '1px solid #e5e7eb',
        marginBottom: '24px'
      }}>
        <h1 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>Settings</h1>
      </div>

      {/* Main Content */}
      <div style={{ display: 'flex', gap: '24px', minHeight: '600px' }}>
        {/* Left Sidebar */}
        <div style={{
          width: '280px',
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '16px',
          height: 'fit-content'
        }}>
          <h2 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '16px', color: '#6b7280', textTransform: 'uppercase' }}>Configure</h2>
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => navigate(section.path)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                backgroundColor: activeSection === section.id ? '#f3f4f6' : 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                marginBottom: '4px',
                fontSize: '14px',
                color: activeSection === section.id ? '#1f2937' : '#6b7280',
                fontWeight: activeSection === section.id ? '500' : '400',
                textAlign: 'left' as const,
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '16px' }}>{section.icon}</span>
                <span>{section.label}</span>
              </div>
              <span style={{ color: '#9ca3af' }}>›</span>
            </button>
          ))}
        </div>

        {/* Right Side - Content */}
        <div style={{
          flex: 1,
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '24px'
        }}>
          <Outlet />
        </div>
      </div>
    </s-page>
  );
}
