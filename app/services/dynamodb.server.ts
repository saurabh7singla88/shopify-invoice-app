import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { TABLE_NAMES } from "../constants/tables";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
});

const dynamodb = DynamoDBDocumentClient.from(client);

// Table name constants
const SHOPS_TABLE = TABLE_NAMES.SHOPS;
const TEMPLATES_TABLE = TABLE_NAMES.TEMPLATES;
const TEMPLATE_CONFIG_TABLE = TABLE_NAMES.TEMPLATE_CONFIGURATIONS;
const AUDIT_LOGS_TABLE = TABLE_NAMES.AUDIT_LOGS;

/**
 * Create or update shop record on app installation
 * Uses UpdateCommand to preserve existing fields like configurations
 */
export async function upsertShop(shop: string, accessToken: string, scopes: string) {
  const now = Date.now();
  
  try {
    // First check if shop exists to set installedAt only on first install
    const existingShop = await dynamodb.send(new GetCommand({
      TableName: SHOPS_TABLE,
      Key: { shop },
    }));
    
    const isFirstInstall = !existingShop.Item;
    
    // Use UpdateCommand to preserve existing fields like configurations
    await dynamodb.send(new UpdateCommand({
      TableName: SHOPS_TABLE,
      Key: { shop },
      UpdateExpression: isFirstInstall 
        ? "SET accessToken = :token, scopes = :scopes, isActive = :active, templateId = if_not_exists(templateId, :templateId), installedAt = :now, updatedAt = :now"
        : "SET accessToken = :token, scopes = :scopes, isActive = :active, templateId = if_not_exists(templateId, :templateId), updatedAt = :now",
      ExpressionAttributeValues: {
        ":token": accessToken,
        ":scopes": scopes,
        ":active": true,
        ":templateId": "minimalist",
        ":now": now,
      },
    }));
    
    console.log(`Shop ${shop} record created/updated successfully (preserving configurations)`);
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
 * Save template configuration for a shop (create or update)
 */
export async function saveTemplateConfiguration(
  shop: string,
  templateId: string,
  config: { styling: any; company: any }
) {
  const now = Date.now();
  
  try {
    await dynamodb.send(new PutCommand({
      TableName: TEMPLATE_CONFIG_TABLE,
      Item: {
        shop,
        templateId,
        styling: config.styling,
        company: config.company,
        updatedAt: now,
        createdAt: now, // Will be overwritten if exists, but good for new records
      },
    }));
    
    console.log(`Template configuration saved for shop ${shop}, template ${templateId}`);
    return { success: true };
  } catch (error) {
    console.error(`Error saving template configuration for ${shop}:`, error);
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

/**
 * Get location state for a Shopify location ID.
 * Fetches location details directly from Shopify Admin API.
 *
 * @param shop - The shop domain (e.g. "myshop.myshopify.com")
 * @param locationId - The Shopify location ID (numeric)
 * @param accessToken - The shop's Shopify Admin API access token
 * @returns The state/province name, or null if not resolvable
 */
export async function getLocationState(
  shop: string,
  locationId: string | number,
  accessToken: string
): Promise<{ state: string | null; gstin: string | null; name: string | null }> {
  const locId = locationId.toString();

  let locationData: { state: string | null; gstin: string | null; name: string | null } = {
    state: null,
    gstin: null,
    name: null,
  };

  try {
    const apiUrl = `https://${shop}/admin/api/2024-01/locations/${locId}.json`;
    console.log(`[Location] Fetching location ${locId} from Shopify API`);
    
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`[Location] Shopify API error: ${response.status} ${response.statusText}`);
      return locationData;
    }

    const data = await response.json();
    const location = data.location;

    if (location) {
      locationData = {
        state: location.province || location.province_code || null,
        gstin: null, // Shopify doesn't store GSTIN per location
        name: location.name || null,
      };

      console.log(`[Location] Shopify API returned: name="${location.name}", ` +
        `province="${location.province}", city="${location.city}", ` +
        `country="${location.country_name}"`);
    }
  } catch (apiError) {
    console.error(`[Location] Shopify API call failed:`, apiError);
  }

  return locationData;
}

/**
 * Get the access token for a shop from the Shops table
 */
export async function getShopAccessToken(shop: string): Promise<string | null> {
  try {
    const result = await dynamodb.send(new GetCommand({
      TableName: SHOPS_TABLE,
      Key: { shop },
    }));
    return result.Item?.accessToken || null;
  } catch (error) {
    console.error(`[Shop] Error fetching access token for ${shop}:`, error);
    return null;
  }
}
