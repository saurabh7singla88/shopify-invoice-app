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
    
    // Prepare consent object (auto-consent on installation)
    const autoConsent = {
      dataProcessing: true,
      marketingCommunications: false, // Default to false, merchant can opt-in later
      version: "1.0",
      lastUpdated: new Date().toISOString()
    };
    
    // Use UpdateCommand to preserve existing fields like configurations
    await dynamodb.send(new UpdateCommand({
      TableName: SHOPS_TABLE,
      Key: { shop },
      UpdateExpression: isFirstInstall 
        ? "SET accessToken = :token, scopes = :scopes, isActive = :active, templateId = if_not_exists(templateId, :templateId), consent = :consent, installedAt = :now, updatedAt = :now"
        : "SET accessToken = :token, scopes = :scopes, isActive = :active, templateId = if_not_exists(templateId, :templateId), consent = if_not_exists(consent, :consent), updatedAt = :now",
      ExpressionAttributeValues: {
        ":token": accessToken,
        ":scopes": scopes,
        ":active": true,
        ":templateId": "minimalist",
        ":consent": autoConsent,
        ":now": now,
      },
    }));
    
    // Log consent on first install
    if (isFirstInstall) {
      await logAuditEvent(shop, "CONSENT_AUTO_GRANTED", {
        dataProcessing: true,
        marketingCommunications: false,
        timestamp: new Date().toISOString(),
        reason: "App installation - implicit consent"
      });
    }
    
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
        isActive: true,
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
 * If templateId is not provided, fetches the active configuration
 */
export async function getTemplateConfiguration(shop: string, templateId?: string) {
  try {
    if (templateId) {
      // Fetch specific template configuration
      const response = await dynamodb.send(new GetCommand({
        TableName: TEMPLATE_CONFIG_TABLE,
        Key: { shop, templateId },
      }));
      
      return response.Item || null;
    } else {
      // Fetch active configuration (query by shop and filter by isActive=true)
      const response = await dynamodb.send(new QueryCommand({
        TableName: TEMPLATE_CONFIG_TABLE,
        KeyConditionExpression: "shop = :shop",
        FilterExpression: "isActive = :active",
        ExpressionAttributeValues: {
          ":shop": shop,
          ":active": true,
        },
      }));
      
      return response.Items && response.Items.length > 0 ? response.Items[0] : null;
    }
  } catch (error) {
    console.error(`Error getting template configuration for ${shop}:`, error);
    return null;
  }
}

/**
 * Save template configuration for a shop
 */
export async function saveTemplateConfiguration(
  shop: string,
  templateId: string,
  config: { styling: any; company: any }
) {
  const now = Date.now();
  
  try {
    // Get existing config to preserve isActive and createdAt
    const existingConfig = await dynamodb.send(new GetCommand({
      TableName: TEMPLATE_CONFIG_TABLE,
      Key: { shop, templateId },
    }));
    
    await dynamodb.send(new PutCommand({
      TableName: TEMPLATE_CONFIG_TABLE,
      Item: {
        shop,
        templateId,
        styling: config.styling,
        company: config.company,
        isActive: existingConfig.Item?.isActive ?? true,
        createdAt: existingConfig.Item?.createdAt ?? now,
        updatedAt: now,
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

/**
 * Get company details from Shops table configuration column
 */
export async function getShopCompanyDetails(shop: string): Promise<any | null> {
  try {
    const result = await dynamodb.send(new GetCommand({
      TableName: SHOPS_TABLE,
      Key: { shop },
    }));
    
    if (!result.Item?.configurations) {
      return null;
    }
    
    const configurations = typeof result.Item.configurations === 'string' 
      ? JSON.parse(result.Item.configurations)
      : result.Item.configurations;
    
    return configurations.companyDetails || null;
  } catch (error) {
    console.error(`[Shop] Error fetching company details for ${shop}:`, error);
    return null;
  }
}

/**
 * Get the selected template ID for a shop
 */
export async function getShopSelectedTemplate(shop: string): Promise<string> {
  try {
    const result = await dynamodb.send(new GetCommand({
      TableName: SHOPS_TABLE,
      Key: { shop },
    }));
    return result.Item?.templateId || "minimalist"; // Default to minimalist
  } catch (error) {
    console.error(`[Shop] Error fetching selected template for ${shop}:`, error);
    return "minimalist"; // Default fallback
  }
}

/**
 * Get the effective billing plan for a shop
 * Applies dev billing overrides automatically based on environment variables
 */
export async function getShopBillingPlan(shop: string): Promise<string> {
  // Parse dev billing configuration
  const DEV_BILLING_SHOPS = process.env.DEV_BILLING_SHOPS 
    ? process.env.DEV_BILLING_SHOPS.split(',').map(s => s.trim()) 
    : [];
  const ENABLE_DEV_BILLING = process.env.ENABLE_DEV_BILLING === "true";
  const DEV_BILLING_PLAN = process.env.DEV_BILLING_PLAN || "Advanced Monthly";
  
  // Check if dev billing should be applied for this shop
  const isDevBillingAllowed = ENABLE_DEV_BILLING || DEV_BILLING_SHOPS.includes(shop);
  
  // If dev billing is allowed, return the dev plan immediately
  if (isDevBillingAllowed) {
    console.log(`[getShopBillingPlan] Dev billing enabled for ${shop}, using plan: ${DEV_BILLING_PLAN}`);
    return DEV_BILLING_PLAN;
  }
  
  // Otherwise, fetch actual billing plan from database
  try {
    const result = await dynamodb.send(new GetCommand({
      TableName: SHOPS_TABLE,
      Key: { shop },
    }));
    const actualPlan = result.Item?.billingPlan || "Free";
    console.log(`[getShopBillingPlan] Shop ${shop} using actual plan: ${actualPlan}`);
    return actualPlan;
  } catch (error) {
    console.error(`[Shop] Error fetching billing plan for ${shop}:`, error);
    return "Free"; // Default fallback
  }
}

/**
 * Update the selected template for a shop with isActive flag approach
 */
export async function updateShopSelectedTemplate(shop: string, templateId: string) {
  try {
    const now = Date.now();
    
    // 1. Update templateId in Shops table
    await dynamodb.send(new UpdateCommand({
      TableName: SHOPS_TABLE,
      Key: { shop },
      UpdateExpression: "SET templateId = :templateId, updatedAt = :now",
      ExpressionAttributeValues: {
        ":templateId": templateId,
        ":now": now,
      },
    }));
    
    // 2. Get all existing template configurations for this shop
    const allConfigsResponse = await dynamodb.send(new QueryCommand({
      TableName: TEMPLATE_CONFIG_TABLE,
      KeyConditionExpression: "shop = :shop",
      ExpressionAttributeValues: {
        ":shop": shop,
      },
    }));
    
    const allConfigs = allConfigsResponse.Items || [];
    
    // 3. Deactivate all existing configurations
    for (const config of allConfigs) {
      if (config.isActive) {
        await dynamodb.send(new UpdateCommand({
          TableName: TEMPLATE_CONFIG_TABLE,
          Key: { shop, templateId: config.templateId },
          UpdateExpression: "SET isActive = :inactive, updatedAt = :now",
          ExpressionAttributeValues: {
            ":inactive": false,
            ":now": now,
          },
        }));
      }
    }
    
    // 4. Check if configuration exists for the selected template
    const selectedConfig = allConfigs.find((c: any) => c.templateId === templateId);
    
    if (selectedConfig) {
      // Configuration exists - just activate it (preserves styling)
      await dynamodb.send(new UpdateCommand({
        TableName: TEMPLATE_CONFIG_TABLE,
        Key: { shop, templateId },
        UpdateExpression: "SET isActive = :active, updatedAt = :now",
        ExpressionAttributeValues: {
          ":active": true,
          ":now": now,
        },
      }));
      
      console.log(`Activated existing configuration for template ${templateId}`);
    } else {
      // Configuration doesn't exist - create it with defaults
      const templateResponse = await dynamodb.send(new GetCommand({
        TableName: TEMPLATES_TABLE,
        Key: { templateId },
      }));
      
      const template = templateResponse.Item;
      if (!template) {
        console.warn(`Template ${templateId} not found in Templates table`);
        return { success: true };
      }
      
      // Parse configurableOptions to extract default values
      const configurableOptions = template.configurableOptions || {};
      const defaultStyling: any = {};
      
      Object.entries(configurableOptions).forEach(([key, config]: [string, any]) => {
        if (config.default !== undefined) {
          defaultStyling[key] = config.default;
        }
      });
      
      // Get company details from any existing config to preserve across templates
      const existingCompany = allConfigs.find((c: any) => c.company)?.company || {};
      
      await dynamodb.send(new PutCommand({
        TableName: TEMPLATE_CONFIG_TABLE,
        Item: {
          shop,
          templateId,
          styling: defaultStyling,
          company: existingCompany,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      }));
      
      console.log(`Created new configuration for template ${templateId}`);
    }
    
    console.log(`Selected template updated to ${templateId} for shop ${shop}`);
    return { success: true };
  } catch (error) {
    console.error(`Error updating selected template for ${shop}:`, error);
    throw error;
  }
}

/**
 * Save company details to Shops table configuration column
 */
export async function saveShopCompanyDetails(shop: string, companyDetails: any) {
  try {
    // First, get existing configurations to preserve other settings
    const result = await dynamodb.send(new GetCommand({
      TableName: SHOPS_TABLE,
      Key: { shop },
    }));
    
    let configurations = {};
    if (result.Item?.configurations) {
      configurations = typeof result.Item.configurations === 'string' 
        ? JSON.parse(result.Item.configurations)
        : result.Item.configurations;
    }
    
    // Update companyDetails in configurations
    configurations = {
      ...configurations,
      companyDetails,
    };
    
    // Save back to DynamoDB
    await dynamodb.send(new UpdateCommand({
      TableName: SHOPS_TABLE,
      Key: { shop },
      UpdateExpression: "SET configurations = :configs, updatedAt = :now",
      ExpressionAttributeValues: {
        ":configs": configurations,
        ":now": Date.now(),
      },
    }));
    
    console.log(`Company details saved for shop ${shop}`);
    return { success: true };
  } catch (error) {
    console.error(`Error saving company details for ${shop}:`, error);
    throw error;
  }
}
