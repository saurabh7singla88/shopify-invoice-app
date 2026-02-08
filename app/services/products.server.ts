/**
 * Products Service - HSN Code Cache Management
 * 
 * Manages product data cache in DynamoDB for fast HSN code lookups.
 * Products are synced via product webhooks (products/update).
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { TABLE_NAMES } from "../constants/tables";
import { fetchProductHSNCodes } from "./productMetafields.server";

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);

// ────────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────────

export interface ProductCache {
  shopProductId: string; // Composite key: shop#productId
  shop: string;
  productId: string;
  hsnCode?: string;
  title: string;
  sku?: string;
  variantId?: string;
  updatedAt: string;
  ttl: number; // Unix timestamp - auto-delete after 90 days
  productPayload?: any; // Complete Shopify product payload
}

// ────────────────────────────────────────────────────────────────────────────────
// Read Operations
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Get HSN code for a single product from cache
 * Returns null if not found in cache
 */
export async function getCachedHSNCode(
  shop: string,
  productId: string
): Promise<string | null> {
  try {
    const shopProductId = `${shop}#${productId}`;
    const result = await dynamodb.send(new GetCommand({
      TableName: TABLE_NAMES.PRODUCTS,
      Key: { shopProductId },
    }));

    const hsnCode = result.Item?.hsnCode || null;
    if (hsnCode) {
      console.log(`[HSN Cache] ✓ Hit: Product ${productId} → HSN ${hsnCode}`);
    } else {
      console.log(`[HSN Cache] ✗ Miss: Product ${productId} not in cache`);
    }
    return hsnCode;
  } catch (error) {
    console.error('[Products] Error fetching cached HSN:', error);
    return null;
  }
}

/**
 * Get HSN codes for multiple products from cache
 * Returns a Map of productId -> hsnCode
 */
export async function getCachedHSNCodes(
  shop: string,
  productIds: string[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  // Query each product from cache
  const promises = productIds.map(async (productId) => {
    const hsnCode = await getCachedHSNCode(shop, productId);
    if (hsnCode) {
      results.set(productId.toString(), hsnCode);
    }
  });

  await Promise.all(promises);
  return results;
}

/**
 * Get HSN code with fallback to live fetch
 * 
 * 1. Check cache first
 * 2. If not found, fetch from Shopify API
 * 3. Cache the result for next time
 */
export async function getHSNCodeWithFallback(
  shop: string,
  productId: string,
  admin?: any
): Promise<string | null> {
  // Try cache first
  const cached = await getCachedHSNCode(shop, productId);
  if (cached) {
    return cached;
  }

  // Fallback to live fetch if admin client available
  if (!admin) {
    console.log(`[HSN Fetch] No admin client available for product ${productId}`);
    return null;
  }

  try {
    console.log(`[HSN Fetch] Fetching from Shopify API for product ${productId}...`);
    const hsn = await fetchProductHSNCodes(admin, [productId]);
    const hsnCode = hsn.get(productId.toString());

    // Cache for next time
    if (hsnCode) {
      console.log(`[HSN Fetch] ✓ Found HSN ${hsnCode} for product ${productId}, caching...`);
      await saveProduct(shop, {
        productId: productId.toString(),
        hsnCode,
        title: '', // Will be updated by product webhook
        updatedAt: new Date().toISOString(),
      });
    } else {
      console.log(`[HSN Fetch] ✗ No HSN metafield found for product ${productId}`);
    }

    return hsnCode || null;
  } catch (error) {
    console.error('[Products] Error fetching HSN from Shopify:', error);
    return null;
  }
}

/**
 * Get HSN codes for line items with cache + fallback
 * Used in order webhook processing
 */
export async function getHSNCodesForLineItems(
  shop: string,
  lineItems: Array<{ product_id?: number | string; [key: string]: any }>,
  admin?: any
): Promise<Map<string, string>> {
  const productIds = [...new Set(
    lineItems
      .map(item => item.product_id?.toString())
      .filter(Boolean)
  )] as string[];

  if (productIds.length === 0) {
    return new Map();
  }

  // Get cached HSN codes
  const cachedHSN = await getCachedHSNCodes(shop, productIds);

  // Identify missing products
  const missingIds = productIds.filter(id => !cachedHSN.has(id));

  // Fetch missing from Shopify if admin client available
  if (missingIds.length > 0 && admin) {
    console.log(`[HSN Fetch] Cache miss for ${missingIds.length} products: ${missingIds.join(', ')}`);
    try {
      const fetchedHSN = await fetchProductHSNCodes(admin, missingIds);
      console.log(`[HSN Fetch] Fetched ${fetchedHSN.size} HSN codes from Shopify API`);

      // Merge with cached results
      for (const [productId, hsnCode] of fetchedHSN) {
        console.log(`[HSN Fetch] Product ${productId} → HSN ${hsnCode}`);
        cachedHSN.set(productId, hsnCode);

        // Save to cache for next time
        await saveProduct(shop, {
          productId,
          hsnCode,
          title: '',
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('[Products] Error fetching missing HSN codes:', error);
    }
  } else if (missingIds.length > 0) {
    console.log(`[HSN Fetch] ${missingIds.length} products not in cache, but no admin client available`);
  }

  return cachedHSN;
}

// ────────────────────────────────────────────────────────────────────────────────
// Write Operations
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Save or update product in cache
 * Called from products/update webhook
 */
export async function saveProduct(
  shop: string,
  product: {
    productId: string;
    hsnCode?: string;
    title: string;
    sku?: string;
    variantId?: string;
    updatedAt?: string;
    productPayload?: any; // Complete Shopify product data
  }
): Promise<void> {
  const now = Date.now();
  const ttl = Math.floor(now / 1000) + (90 * 24 * 60 * 60); // 90 days
  const productId = product.productId.toString();
  const shopProductId = `${shop}#${productId}`;

  const item: ProductCache = {
    shopProductId,
    shop,
    productId,
    hsnCode: product.hsnCode,
    title: product.title,
    sku: product.sku,
    variantId: product.variantId,
    updatedAt: product.updatedAt || new Date().toISOString(),
    ttl,
    productPayload: product.productPayload,
  };

  try {
    await dynamodb.send(new PutCommand({
      TableName: TABLE_NAMES.PRODUCTS,
      Item: item,
    }));
    console.log(`[HSN Cache] ✓ Saved: Product ${product.productId} ${product.hsnCode ? `with HSN ${product.hsnCode}` : '(no HSN)'}`);
  } catch (error) {
    console.error('[Products] Error saving product:', error);
  }
}

/**
 * Bulk save products
 * Used for backfill operations
 */
export async function saveProducts(
  shop: string,
  products: Array<{
    productId: string;
    hsnCode?: string;
    title: string;
    sku?: string;
    variantId?: string;
    productPayload?: any;
  }>
): Promise<void> {
  const now = Date.now();
  const ttl = Math.floor(now / 1000) + (90 * 24 * 60 * 60);

  // Batch write in chunks of 25
  const chunks = [];
  for (let i = 0; i < products.length; i += 25) {
    chunks.push(products.slice(i, i + 25));
  }

  for (const chunk of chunks) {
    const writeRequests = chunk.map(product => {
      const productId = product.productId.toString();
      const shopProductId = `${shop}#${productId}`;
      return {
        PutRequest: {
          Item: {
            shopProductId,
            shop,
            productId,
            hsnCode: product.hsnCode,
            title: product.title,
            sku: product.sku,
            variantId: product.variantId,
            updatedAt: new Date().toISOString(),
            ttl,
            productPayload: product.productPayload,
          },
        },
      };
    });

    try {
      await dynamodb.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAMES.PRODUCTS]: writeRequests,
        },
      }));
    } catch (error) {
      console.error('[Products] Error batch saving products:', error);
    }
  }

  console.log(`[Products] Cached ${products.length} products for shop ${shop}`);
}

/**
 * Delete product from cache
 * Called from products/delete webhook
 */
export async function deleteProduct(
  shop: string,
  productId: string
): Promise<void> {
  try {
    await dynamodb.send(new PutCommand({
      TableName: TABLE_NAMES.PRODUCTS,
      Key: { shop, productId: productId.toString() },
    }));
    console.log(`[Products] Deleted product ${productId} for shop ${shop}`);
  } catch (error) {
    console.error('[Products] Error deleting product:', error);
  }
}
