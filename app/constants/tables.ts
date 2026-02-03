/**
 * DynamoDB table name constants
 * These table names must match the CloudFormation template definitions
 */
export const TABLE_NAMES = {
  SESSIONS: "shopify_sessions",
  ORDERS: "ShopifyOrders",
  SHOPS: "Shops",
  TEMPLATES: "Templates",
  TEMPLATE_CONFIGURATIONS: "TemplateConfigurations",
  INVOICES: "Invoices",
  AUDIT_LOGS: "AuditLogs",
} as const;
