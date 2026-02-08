/**
 * Product Metafields Service
 * 
 * Fetches product metafields (HSN codes, etc.) from Shopify Admin GraphQL API
 * with local cache support for performance.
 */

import { getHSNCodesForLineItems } from "./products.server";

// ────────────────────────────────────────────────────────────────────────────────
// Main API (with cache support)
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Enrich line items with HSN codes from cache + Shopify fallback
 * 
 * This is the main function to use in order webhooks.
 * It tries cache first, then fetches missing HSN codes from Shopify.
 * 
 * @param shop - Shop domain
 * @param admin - Shopify GraphQL client (optional, for fallback)
 * @param lineItems - Array of line items from order payload
 * @returns Line items with product.metafields populated
 */
export async function enrichLineItemsWithHSN(
  shop: string,
  admin: any,
  lineItems: Array<{
    product_id?: number | string;
    product?: {
      metafields?: Array<{ namespace: string; key: string; value: string }>;
    };
    [key: string]: any;
  }>
): Promise<typeof lineItems> {
  // Get HSN codes using cache + fallback
  const hsnMap = await getHSNCodesForLineItems(shop, lineItems, admin);
  
  console.log(`[HSN Enrich] Found ${hsnMap.size} HSN codes for ${lineItems.length} line items`);
  if (hsnMap.size > 0) {
    for (const [productId, hsnCode] of hsnMap) {
      console.log(`[HSN Enrich] Product ${productId} → HSN ${hsnCode}`);
    }
  }

  // Enrich line items
  return lineItems.map(item => {
    const productId = item.product_id?.toString();
    const hsnCode = productId ? hsnMap.get(productId) : null;

    if (hsnCode) {
      return {
        ...item,
        product: {
          ...item.product,
          metafields: [
            ...(item.product?.metafields || []),
            {
              namespace: 'custom',
              key: 'hsn_code',
              value: hsnCode,
            },
          ],
        },
      };
    }

    return item;
  });
}

// ────────────────────────────────────────────────────────────────────────────────
// Direct Shopify API Functions (used internally by cache fallback)
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Fetch HSN codes for multiple products directly from Shopify (bypasses cache)
  admin: any,
  productIds: string[]
): Promise<Map<string, string>> {
  if (!productIds || productIds.length === 0) {
    return new Map();
  }

  // Convert numeric IDs to GID format if needed
  const gids = productIds.map(id => 
    id.startsWith('gid://') ? id : `gid://shopify/Product/${id}`
  );

  // Build GraphQL query - fetch up to 250 products at once (Shopify limit)
  const batchSize = 250;
  const results = new Map<string, string>();

  for (let i = 0; i < gids.length; i += batchSize) {
    const batch = gids.slice(i, i + batchSize);
    const query = `
      query getProductHSNCodes {
        nodes(ids: [${batch.map(id => `"${id}"`).join(', ')}]) {
          ... on Product {
            id
            metafield(namespace: "custom", key: "hsn_code") {
              value
            }
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(query);
      const data = await response.json();

      if (data?.data?.nodes) {
        for (const node of data.data.nodes) {
          if (node?.id && node?.metafield?.value) {
            // Extract numeric ID from GID
            const numericId = node.id.split('/').pop();
            results.set(numericId, node.metafield.value);
          }
        }
      }
    } catch (error) {
      console.error('[HSN] Error fetching product metafields:', error);
    }
  }

  return results;
}

/**
 * Fetch HSN code for a single product directly from Shopify
 * 
 * @param admin - Shopify GraphQL client
 * @param productId - Product ID (numeric or GID)
 * @returns HSN code or null
 */
export async function fetchProductHSNCode(
  admin: any,
  productId: string
): Promise<string | null> {
  const results = await fetchProductHSNCodes(admin, [productId]);
  return results.get(productId.toString()) || null;
}
