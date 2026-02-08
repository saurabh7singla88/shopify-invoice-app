/**
 * Webhook Handler: products/update
 * 
 * Syncs product HSN codes to local cache when products are updated in Shopify.
 * This allows fast HSN lookups during order processing without hitting Shopify API.
 */

import type { ActionFunctionArgs } from "react-router";
import { validateWebhookHmac, parseWebhookContext, jsonResponse, errorResponse } from "../services/webhookUtils.server";
import { saveProduct } from "../services/products.server";
import { sessionStorage } from "../shopify.server";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-10";
import { shopifyApi, ApiVersion } from "@shopify/shopify-api";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("[Webhook] products/update received");
  
  const requestClone = request.clone();
  const rawBody = await requestClone.text();

  try {
    // ── HMAC validation ──────────────────────────────────────────────────
    const hmacError = validateWebhookHmac(request, rawBody);
    if (hmacError) return hmacError;

    // ── Parse webhook context ────────────────────────────────────────────
    const { payload, shop } = parseWebhookContext(request, rawBody, "products/update");

    console.log(`[Webhook] Product updated - ID: ${payload.id}, Title: ${payload.title}, Shop: ${shop}`);

    // Fetch HSN metafield from Shopify (webhooks don't include metafields by default)
    let hsnCode: string | undefined;
    
    try {
      // Get session for this shop
      const sessions = await sessionStorage.findSessionsByShop(shop);
      const session = sessions?.[0];
      
      if (!session) {
        console.error(`[HSN Webhook] No session found for shop ${shop}`);
      } else {
        // Create admin client from session
        const shopifyApi2 = shopifyApi({
          apiKey: process.env.SHOPIFY_API_KEY!,
          apiSecretKey: process.env.SHOPIFY_API_SECRET!,
          apiVersion: ApiVersion.October25,
          scopes: ["read_orders", "read_customers", "read_products"],
          hostName: new URL(process.env.SHOPIFY_APP_URL!).hostname,
          isEmbeddedApp: true,
          restResources,
        });
        
        const client = new shopifyApi2.clients.Graphql({ session });
        
        const query = `
          query getProductMetafield($id: ID!) {
            product(id: $id) {
              id
              metafields(first: 20) {
                edges {
                  node {
                    namespace
                    key
                    value
                    type
                  }
                }
              }
            }
          }
        `;
        
        const response: any = await client.request(query, {
          variables: {
            id: `gid://shopify/Product/${payload.id}`,
          },
        });
        
        // Find HSN metafield from the list
        const metafields = response?.data?.product?.metafields?.edges || [];
        
        // Try exact match first: custom.hsn_code
        let hsnMetafield = metafields.find((edge: any) => 
          edge.node.namespace === "custom" && edge.node.key === "hsn_code"
        );
        
        // Fallback: search for any key containing "hsn"
        if (!hsnMetafield) {
          hsnMetafield = metafields.find((edge: any) => 
            edge.node.key.toLowerCase().includes("hsn")
          );
        }
        
        hsnCode = hsnMetafield?.node?.value || undefined;
      }
    } catch (error) {
      console.error(`[HSN Webhook] Error fetching metafield:`, error);
      // Continue with undefined HSN
    }

    // Get primary variant (first variant)
    const primaryVariant = payload.variants?.[0];

    // Save to cache
    await saveProduct(shop, {
      productId: payload.id.toString(),
      hsnCode,
      title: payload.title || '',
      sku: primaryVariant?.sku || payload.variants?.map((v: any) => v.sku).filter(Boolean).join(', '),
      variantId: primaryVariant?.id?.toString(),
      updatedAt: payload.updated_at || new Date().toISOString(),
      productPayload: payload, // Store complete product data
    });

    console.log(`[Webhook] Product ${payload.id} cached, HSN: ${hsnCode || 'none'}`);
    return jsonResponse({ success: true, cached: true, hasHSN: !!hsnCode });

  } catch (error) {
    console.error("[Webhook] Error processing products/update:", error);
    return errorResponse("Error processing products/update webhook", error);
  }
};
