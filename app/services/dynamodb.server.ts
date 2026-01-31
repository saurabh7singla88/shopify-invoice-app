import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
});

const dynamodb = DynamoDBDocumentClient.from(client);

// Table names from environment variables
const SHOPS_TABLE = process.env.SHOPS_TABLE_NAME || "Shops";
const TEMPLATES_TABLE = process.env.TEMPLATES_TABLE_NAME || "Templates";
const TEMPLATE_CONFIG_TABLE = process.env.TEMPLATE_CONFIG_TABLE_NAME || "TemplateConfigurations";
const AUDIT_LOGS_TABLE = process.env.AUDIT_LOGS_TABLE_NAME || "AuditLogs";

/**
 * Create or update shop record on app installation
 */
export async function upsertShop(shop: string, accessToken: string, scopes: string) {
  const now = Date.now();
  
  try {
    await dynamodb.send(new PutCommand({
      TableName: SHOPS_TABLE,
      Item: {
        shop,
        accessToken,
        scopes,
        isActive: true,
        installedAt: now,
        updatedAt: now,
      },
    }));
    
    console.log(`Shop ${shop} record created/updated successfully`);
    return { success: true };
  } catch (error) {
    console.error(`Error upserting shop ${shop}:`, error);
    throw error;
  }
}

/**
 * Mark shop as uninstalled
 */
export async function markShopUninstalled(shop: string) {
  const now = Date.now();
  
  try {
    await dynamodb.send(new UpdateCommand({
      TableName: SHOPS_TABLE,
      Key: { shop },
      UpdateExpression: "SET isActive = :inactive, uninstalledAt = :now, updatedAt = :now",
      ExpressionAttributeValues: {
        ":inactive": false,
        ":now": now,
      },
    }));
    
    console.log(`Shop ${shop} marked as uninstalled`);
    return { success: true };
  } catch (error) {
    console.error(`Error marking shop ${shop} as uninstalled:`, error);
    throw error;
  }
}

/**
 * Get default template from Templates table
 */
export async function getDefaultTemplate() {
  try {
    const response = await dynamodb.send(new GetCommand({
      TableName: TEMPLATES_TABLE,
      Key: { templateId: "minimalist" },
    }));
    
    return response.Item || null;
  } catch (error) {
    console.error("Error fetching default template:", error);
    throw error;
  }
}

/**
 * Create default template configuration for a new shop
 */
export async function createDefaultTemplateConfiguration(shop: string) {
  const now = Date.now();
  
  try {
    // Get the default template data
    const defaultTemplate = await getDefaultTemplate();
    
    if (!defaultTemplate) {
      console.error("Default template not found in Templates table");
      return { success: false, error: "Default template not found" };
    }
    
    // Create template configuration for the shop
    await dynamodb.send(new PutCommand({
      TableName: TEMPLATE_CONFIG_TABLE,
      Item: {
        shop,
        templateId: "minimalist",
        styling: defaultTemplate.defaultConfig?.styling || {
          fonts: {
            heading: "Helvetica-Bold",
            body: "Helvetica",
            emphasis: "Helvetica-Bold",
          },
          colors: {
            primary: "#1a1a1a",
            secondary: "#666666",
            accent: "#0066cc",
            background: "#ffffff",
            border: "#dddddd",
          },
        },
        company: defaultTemplate.defaultConfig?.company || {
          name: "",
          address: "",
          city: "",
          state: "",
          zipCode: "",
          country: "",
          phone: "",
          email: "",
          gstin: "",
          pan: "",
        },
        createdAt: now,
        updatedAt: now,
      },
    }));
    
    console.log(`Default template configuration created for shop ${shop}`);
    return { success: true };
  } catch (error) {
    console.error(`Error creating template configuration for ${shop}:`, error);
    throw error;
  }
}

/**
 * Get template configuration for a shop
 */
export async function getTemplateConfiguration(shop: string, templateId: string = "minimalist") {
  try {
    const response = await dynamodb.send(new GetCommand({
      TableName: TEMPLATE_CONFIG_TABLE,
      Key: { shop, templateId },
    }));
    
    return response.Item || null;
  } catch (error) {
    console.error(`Error fetching template configuration for ${shop}:`, error);
    throw error;
  }
}

/**
 * Update template configuration for a shop
 */
export async function updateTemplateConfiguration(
  shop: string, 
  templateId: string, 
  styling: any, 
  company: any
) {
  const now = Date.now();
  
  try {
    await dynamodb.send(new UpdateCommand({
      TableName: TEMPLATE_CONFIG_TABLE,
      Key: { shop, templateId },
      UpdateExpression: "SET styling = :styling, company = :company, updatedAt = :now",
      ExpressionAttributeValues: {
        ":styling": styling,
        ":company": company,
        ":now": now,
      },
    }));
    
    console.log(`Template configuration updated for shop ${shop}`);
    return { success: true };
  } catch (error) {
    console.error(`Error updating template configuration for ${shop}:`, error);
    throw error;
  }
}

/**
 * Log an audit event
 */
export async function logAuditEvent(
  shop: string,
  action: string,
  details: any,
  userId?: string
) {
  const now = Date.now();
  const logId = `${shop}-${now}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    await dynamodb.send(new PutCommand({
      TableName: AUDIT_LOGS_TABLE,
      Item: {
        logId,
        shop,
        action,
        details,
        userId,
        timestamp: now,
        ttl: Math.floor(now / 1000) + (90 * 24 * 60 * 60), // 90 days TTL
      },
    }));
    
    console.log(`Audit log created: ${action} for ${shop}`);
    return { success: true, logId };
  } catch (error) {
    console.error(`Error logging audit event for ${shop}:`, error);
    // Don't throw - audit logging should not break the main flow
    return { success: false, error };
  }
}
